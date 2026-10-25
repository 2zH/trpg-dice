// 3D 骰子的舞台（由 DiceTray.tsx 按需加载，同一个 runtime-dice3d 块）：three.js 与 cannon-es 都在这个块里，不进入口块。
// 点数以 rollDice 为准：先在后台模拟完这次落桌（diceSimulation），再给每颗骰子的网格转一个对称旋转，让决定读数的那一面刻着
// rollDice 给的点数（diceShapes.relabelRotation），然后回放录好的帧。新一次掷骰先清掉上一批，两批不会叠在一起。
// 舞台铺满视口（#322）：挂在 body 下的一层 position: fixed 的透明画布，不接收指针；桌面按视口换算，0.02 世界单位/像素，
// 屏幕越大桌子越大，骰子在屏幕上的大小不变。挂在 body 下而不是面板里，面板的 transform、overflow 与滚动都裁不到它。
// 舞台跟着可见视口（visualViewport）：手机上软键盘弹出时，骰子落在键盘上方看得见的那一块里。
// 模拟分段进行（simulateDiceInSlices），颗数再多也不长时间占着主线程。
// 颗数不设上限：视口换算的桌面放不下时按颗数放大（fitDiceTable），镜头拉远，骰子在画面上变小。
// 画好之后把读数写在舞台的 data-dice-* 上（从网格最后的朝向读，不是抄输入），浏览器验证脚本据此核对。
import {
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { buildDiceMeshData } from "./diceMesh.js";
import { diceFaceLabel, diceOverlapDepth, getDiceShape, multiply, relabelRotation, resultFaceAlignment, resultFaceIndex, type DiceLabelKind, type DiceShape, type Quat, type SupportedDiceSides } from "./diceShapes.js";
import { diceFrameSeconds, diceRadius, diceRestHeight, fitDiceTable, readOrientation, readPosition, simulateDiceInSlices, type DiceSimulation, type DiceTrayBounds } from "./diceSimulation.js";
import { paintDiceAtlas } from "./diceTexture.js";
import { createReplayClock } from "./replayClock.js";
import { followVisualViewport } from "./stageViewport.js";

export interface DiceTrayDie {
  sides: SupportedDiceSides;
  /** 朝上那一面的点数（1..sides）；十位骰与个位骰刻的字见 diceFaceLabel */
  value: number;
  /** d100 的两颗 d10（#322） */
  kind?: DiceLabelKind;
}

export interface DiceTrayRoll {
  /** 每次掷骰不同；变了就重新落桌 */
  id: number;
  /** 只决定怎么落，不决定点数 */
  seed: number;
  dice: DiceTrayDie[];
}

// 骰子的舞台：three.js 的场景、画布与回放。组件 DiceTray 只负责挂载与卸载它；
// 舞台铺满视口、跟着 visualViewport，骰面图集与网格缓存在这里。

// 世界单位/像素：原来面板里 240px 高的托盘对应半深 2.4，铺满视口后保持同一个比例，骰子在屏幕上的大小不变
const worldUnitsPerPixel = 0.02;

export class DiceStage {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 100);
  private readonly resizeObserver: ResizeObserver;
  private readonly geometries = new Map<SupportedDiceSides, BufferGeometry>();
  // 按骰子与刻的字分开：d10、十位骰、个位骰形状相同，图集不同
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly edges = new Map<SupportedDiceSides, EdgesGeometry>();
  // 骰子的棱画一圈深色细线：浅色面板上骰子的本色与底色接近，靠它勾出轮廓
  private readonly edgeMaterial = new LineBasicMaterial({ color: 0x6f6252, transparent: true, opacity: 0.55 });
  private readonly ground: Mesh<PlaneGeometry, ShadowMaterial>;
  private readonly light: DirectionalLight;
  private meshes: Mesh[] = [];
  private kinds: Array<DiceLabelKind | undefined> = [];
  private frameRequest = 0;
  // 每次掷骰加一：分段模拟还没算完就又掷了一次（或舞台卸载）时，旧的那次算完也不再演
  private playToken = 0;
  private readonly stopFollowingViewport: () => void;
  private bounds: DiceTrayBounds = { halfWidth: 7.2, halfDepth: 4.5 };
  // 画面上这次掷骰模拟时用的桌面：托盘之后变窄（拖分隔条、窗口变窄）时镜头仍要装下已经落定的骰子
  private shownBounds: DiceTrayBounds | null = null;

  constructor(private readonly container: HTMLDivElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    // 暖色的主光从右上方照下来，骰子在桌面上投下柔和的影子；桌面本身透明，露出面板的底色
    this.scene.add(new HemisphereLight(0xfff4e0, 0x3a3328, 1.3));
    const light = new DirectionalLight(0xffe2b8, 2.4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    this.light = light;
    this.scene.add(light);
    // 桌面的影子：1×1 的平面，fitCamera 按桌面缩放
    this.ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.22 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.stopFollowingViewport = followVisualViewport(container);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  play(roll: DiceTrayRoll, reducedMotion: boolean): void {
    cancelAnimationFrame(this.frameRequest);
    const token = ++this.playToken;
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes = [];
    this.renderer.render(this.scene, this.camera);
    this.container.dataset.diceState = "rolling";
    // 视口换算的桌面放不下这么多颗时放大桌面（镜头随之拉远）
    const table = fitDiceTable(this.bounds, roll.dice.length);
    void simulateDiceInSlices(roll.dice.map((die) => die.sides), roll.seed, table, { isCancelled: () => token !== this.playToken })
      .then((simulation) => {
        if (simulation && token === this.playToken) this.start(roll, simulation, table, reducedMotion);
      });
  }

  private start(roll: DiceTrayRoll, simulation: DiceSimulation, table: DiceTrayBounds, reducedMotion: boolean): void {
    const shapes = roll.dice.map((die) => getDiceShape(die.sides));
    this.shownBounds = table;
    this.fitCamera();
    // 网格相对刚体再转的对称旋转：让落定后朝上的那一面刻着 rollDice 给的点数
    const relabels = roll.dice.map((die, index) => relabelRotation(shapes[index]!, simulation.topFaces[index]!, die.value));
    this.kinds = roll.dice.map((die) => die.kind);
    this.meshes = roll.dice.map((die) => {
      const mesh = new Mesh(this.geometry(die.sides), this.material(die.sides, die.kind));
      mesh.castShadow = true;
      mesh.add(new LineSegments(this.edgeGeometry(die.sides), this.edgeMaterial));
      this.scene.add(mesh);
      return mesh;
    });
    const last = simulation.frameCount - 1;
    const show = (frame: number) => {
      this.meshes.forEach((mesh, index) => {
        mesh.position.set(...readPosition(simulation, frame, index));
        const [x, y, z, w] = multiply(readOrientation(simulation, frame, index), relabels[index]!);
        mesh.quaternion.set(x, y, z, w);
      });
      this.renderer.render(this.scene, this.camera);
    };
    const finish = () => {
      show(last);
      this.describe(shapes, simulation, reducedMotion);
    };
    if (reducedMotion) {
      finish();
      return;
    }
    // 时钟从第一次帧回调开始走，卡住的那一帧最多推进 maxReplayStepMs（#480，见 replayClock.ts）
    const clock = createReplayClock();
    const step = (now: number) => {
      const frame = Math.min(last, Math.floor(clock(now) / (diceFrameSeconds * 1000)));
      if (frame >= last) {
        finish();
        return;
      }
      show(frame);
      this.frameRequest = requestAnimationFrame(step);
    };
    show(0);
    this.frameRequest = requestAnimationFrame(step);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameRequest);
    this.playToken += 1;
    this.stopFollowingViewport();
    this.resizeObserver.disconnect();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const geometry of this.edges.values()) geometry.dispose();
    this.edgeMaterial.dispose();
    for (const material of this.materials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.renderer.dispose();
    // 马上交还 WebGL 上下文（#480）：只 dispose 时上下文要等垃圾回收才释放，Shaggai 每次掷骰都新建一个舞台；
    // 浏览器同时存活的上下文有上限，超出时强行丢掉最早的那个，实测丢掉的正是骰子面板一直在用的舞台
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // 落定之后从网格读：决定读数的面刻的点数、是否都在画面里、放得多平（最大倾角）、有没有垫在别的骰子上（比平放高出多少），
  // 以及两颗骰子互相穿插得最深的那一处（按多面体本身判断，diceOverlapDepth；接触时物理允许约 0.01 以内的穿透）
  private describe(shapes: DiceShape[], simulation: DiceSimulation, reducedMotion: boolean): void {
    const orientations = this.meshes.map((mesh): Quat => [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w]);
    const faces = orientations.map((orientation, index) => shapes[index]!.values[resultFaceIndex(shapes[index]!, orientation)]!);
    const labels = faces.map((value, index) => diceFaceLabel(value, this.kinds[index]));
    const rest = shapes.map((shape) => diceRestHeight(shape));
    let maxTilt = 0;
    let maxLift = 0;
    orientations.forEach((orientation, index) => {
      maxTilt = Math.max(maxTilt, (Math.acos(Math.min(1, resultFaceAlignment(shapes[index]!, orientation))) * 180) / Math.PI);
      maxLift = Math.max(maxLift, this.meshes[index]!.position.y - rest[index]!);
    });
    const placed = this.meshes.map((mesh, index) => ({
      shape: shapes[index]!,
      radius: diceRadius,
      position: [mesh.position.x, mesh.position.y, mesh.position.z] as const,
      orientation: orientations[index]!
    }));
    let maxOverlap = 0;
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) maxOverlap = Math.max(maxOverlap, diceOverlapDepth(placed[a]!, placed[b]!));
    }
    const dataset = this.container.dataset;
    dataset.diceFaces = faces.join(",");
    dataset.diceLabels = labels.join(",");
    dataset.diceSettleMs = String(reducedMotion ? 0 : Math.round(simulation.frameCount * diceFrameSeconds * 1000));
    dataset.diceAnimated = String(!reducedMotion);
    dataset.diceInView = String(this.allInView());
    dataset.diceMaxOverlap = maxOverlap.toFixed(4);
    dataset.diceMaxTilt = maxTilt.toFixed(1);
    dataset.diceMaxLift = maxLift.toFixed(3);
    dataset.diceScreen = this.screenPositions();
    dataset.diceState = "settled";
  }

  // 每颗骰子的中心投影在舞台上的位置（CSS 像素，「x:y」逗号分隔），验证脚本按它给单颗骰子截近景
  private screenPositions(): string {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    return this.meshes.map((mesh) => {
      const point = mesh.position.clone().project(this.camera);
      return `${Math.round(((point.x + 1) / 2) * width)}:${Math.round(((1 - point.y) / 2) * height)}`;
    }).join(",");
  }

  // 每颗骰子的中心与前后左右各一个半径处都投影在画面里
  private allInView(): boolean {
    return this.meshes.every((mesh) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
      const point = new Vector3(mesh.position.x + dx! * diceRadius, mesh.position.y, mesh.position.z + dz! * diceRadius).project(this.camera);
      return Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    }));
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    // 窗口移到另一块屏幕、浏览器缩放时像素比会变
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // 桌面跟着视口：宽高各按 0.02 世界单位/像素换算；视口再小也留出放得下几颗骰子的桌面
    this.bounds = { halfWidth: Math.max(2.6, (width * worldUnitsPerPixel) / 2), halfDepth: Math.max(2.4, (height * worldUnitsPerPixel) / 2) };
    this.fitCamera();
    this.renderer.render(this.scene, this.camera);
    if (this.container.dataset.diceState === "settled") {
      this.container.dataset.diceInView = String(this.allInView());
      this.container.dataset.diceScreen = this.screenPositions();
    }
  }

  // 从前上方斜着往下看（68°，朝上的面接近正对镜头，点数好读）；找能把整张桌面（含骰子的高度）装进画面的最近距离
  private fitCamera(): void {
    const elevation = (68 * Math.PI) / 180;
    // 桌面四周再放出一个骰子半径：靠墙停住的骰子会伸出墙面最多这么多，也要整颗在画面里；
    // 已经落定的那一批按它模拟时的桌面算，托盘变窄后它们也不会被裁掉
    const halfWidth = Math.max(this.bounds.halfWidth, this.shownBounds?.halfWidth ?? 0) + diceRadius;
    const halfDepth = Math.max(this.bounds.halfDepth, this.shownBounds?.halfDepth ?? 0) + diceRadius;
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, diceRadius * 1.6].map((y) => new Vector3(sx * halfWidth, y, sz * halfDepth))));
    const fits = (distance: number) => {
      this.camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      return corners.every((corner) => {
        const point = corner.clone().project(this.camera);
        return Math.abs(point.x) <= 0.96 && Math.abs(point.y) <= 0.96;
      });
    };
    let near = 2;
    let far = 800;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    // 远裁剪面装得下桌面最远的一角
    this.camera.far = far + Math.hypot(halfWidth, halfDepth) * 2 + 10;
    fits(far);
    // 影子与桌面跟着桌面的大小：主光放在桌面以外的同一个方向，阴影相机的范围盖住整张桌面
    const extent = Math.max(halfWidth, halfDepth) + 1;
    this.light.position.set(3, 9, 4).normalize().multiplyScalar(extent * 2 + 10);
    const shadowCamera = this.light.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.far = extent * 4 + 20;
    shadowCamera.updateProjectionMatrix();
    this.ground.scale.set(halfWidth * 2 + 2, halfDepth * 2 + 2, 1);
  }

  private geometry(sides: SupportedDiceSides): BufferGeometry {
    const cached = this.geometries.get(sides);
    if (cached) return cached;
    const data = buildDiceMeshData(getDiceShape(sides), diceRadius);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
    this.geometries.set(sides, geometry);
    return geometry;
  }

  private edgeGeometry(sides: SupportedDiceSides): EdgesGeometry {
    const cached = this.edges.get(sides);
    if (cached) return cached;
    const edges = new EdgesGeometry(this.geometry(sides), 1);
    this.edges.set(sides, edges);
    return edges;
  }

  private material(sides: SupportedDiceSides, kind?: DiceLabelKind): MeshStandardMaterial {
    const key = `${sides}:${kind ?? ""}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const shape = getDiceShape(sides);
    const texture = new CanvasTexture(paintDiceAtlas(shape, buildDiceMeshData(shape, 1).atlas, kind));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.02, flatShading: true });
    this.materials.set(key, material);
    return material;
  }
}
