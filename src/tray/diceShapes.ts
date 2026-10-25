// 3D 骰子（#315、#322）的几何：d4、d6、d8、d12、d20 五种正多面体与 d10 的五角偏方面体的顶点、面与点数，以及把「落定后读数的那一面」换成
// rollDice 掷出的点数要转的对称旋转。只用普通数组，不依赖 three.js 或 cannon-es，渲染与物理两边共用、可以单测。
//
// 面按对偶多面体求：d4 的面法线是对面顶点的反方向，d6 的面法线是正八面体的顶点，d8 是立方体的顶点，d12 是正二十面体的顶点，
// d20 是正十二面体的顶点，d10 的面法线从凸包求（hullNormals）；
// 每个面取与法线点积最大的那几个顶点，绕法线逆时针排好（从外面看）。点数按真实骰子的习惯让相对的两面加起来等于面数 + 1。

export type Vec3 = readonly [number, number, number];
/** 四元数 [x, y, z, w]，与 three.js、cannon-es 的分量顺序相同。 */
export type Quat = readonly [number, number, number, number];

export const supportedDiceSides = [4, 6, 8, 10, 12, 20] as const;
export type SupportedDiceSides = (typeof supportedDiceSides)[number];

export function isSupportedDiceSides(sides: number): sides is SupportedDiceSides {
  return (supportedDiceSides as readonly number[]).includes(sides);
}

/** d100 用两颗 d10 演（#322）：十位骰刻 00、10、…、90，个位骰刻 0–9。 */
export type DiceLabelKind = "tens" | "units";

/** 骰面上刻的字：普通骰子就是点数；十位骰与个位骰的点数 1–10 按 10 当 0 换成十位或个位的数字。 */
export function diceFaceLabel(value: number, kind?: DiceLabelKind): string {
  if (kind === "tens") return String((value % 10) * 10).padStart(2, "0");
  if (kind === "units") return String(value % 10);
  return String(value);
}

/**
 * 倒过来看会读错的刻字加下划线：骰子停下时朝向随意。6 与 9 倒过来互相像；十位骰的 60、90 倒过来像 09、06，在 d100 里
 * 会被看成旁边个位骰的 9、6。10、80 倒过来是 01、08，数字没变；d20 的 16、19 倒过来是 91、61，哪颗骰子上都没有，不加。
 */
export function diceLabelNeedsUnderline(label: string): boolean {
  return label === "6" || label === "9" || label === "60" || label === "90";
}

export interface DiceShape {
  sides: SupportedDiceSides;
  /** 顶点，外接球半径为 1（d10 只有上下两个尖顶在球面上） */
  vertices: Vec3[];
  /** 每个面的顶点下标，从外面看逆时针 */
  faces: number[][];
  /** 每个面的单位外法线 */
  normals: Vec3[];
  /** 每个面的点数，1..sides；有相对面的骰子相对两面之和为 sides + 1，d4 没有相对面，按面序 1–4 */
  values: number[];
}

const phi = (1 + Math.sqrt(5)) / 2;

const cubeVertices: Vec3[] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cubeVertices.push([x, y, z]);
const octahedronVertices: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const icosahedronVertices: Vec3[] = [];
for (const a of [-1, 1]) for (const b of [-phi, phi]) icosahedronVertices.push([0, a, b], [a, b, 0], [b, 0, a]);
// 与上面的正二十面体互为对偶的那个朝向（例如面 (0,1,φ)(0,-1,φ)(φ,0,1) 的法线沿 (1/φ, 0, φ)）
const dodecahedronVertices: Vec3[] = [...cubeVertices];
for (const a of [-phi, phi]) for (const b of [-1 / phi, 1 / phi]) dodecahedronVertices.push([0, a, b], [b, 0, a], [a, b, 0]);

// d10：五角偏方面体。上下两个尖顶，中间两圈各 5 个顶点、错开 36°；10 个筝形面。圈的高度 ±c 取定之后，尖顶的高度 a
// 要让每个筝形的四个顶点共面：过 U0、U1、L0 的平面经过上尖顶 T。顶点顺序把尖顶放在最前（下标 0、1）
const trapezohedronVertices: Vec3[] = (() => {
  const ringHeight = 0.105;
  const at = (angle: number, y: number): Vec3 => [Math.cos(angle), y, Math.sin(angle)];
  const u0 = at(0, ringHeight);
  const u1 = at((2 * Math.PI) / 5, ringHeight);
  const l0 = at(Math.PI / 5, -ringHeight);
  const n = cross(sub(u1, u0), sub(l0, u0));
  // n·(T − U0) = 0，T = (0, a, 0)：n_y (a − c) − n_x − n_z·0 = 0
  const apex = ringHeight + n[0] / n[1];
  const vertices: Vec3[] = [[0, apex, 0], [0, -apex, 0]];
  for (let k = 0; k < 5; k += 1) vertices.push(at((2 * Math.PI * k) / 5, ringHeight), at((2 * Math.PI * k) / 5 + Math.PI / 5, -ringHeight));
  return vertices;
})();

// d4：正四面体取立方体相间的四个顶点；每个面的法线就是对面那个顶点的反方向
const tetrahedronVertices: Vec3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];

const shapeSources: Record<SupportedDiceSides, { vertices: Vec3[]; normals: Vec3[] }> = {
  4: { vertices: tetrahedronVertices, normals: tetrahedronVertices.map((vertex) => scale(vertex, -1)) },
  6: { vertices: cubeVertices, normals: octahedronVertices },
  8: { vertices: octahedronVertices, normals: cubeVertices },
  10: { vertices: trapezohedronVertices, normals: hullNormals(trapezohedronVertices) },
  12: { vertices: dodecahedronVertices, normals: icosahedronVertices },
  20: { vertices: icosahedronVertices, normals: dodecahedronVertices }
};

const shapeCache = new Map<SupportedDiceSides, DiceShape>();

export function getDiceShape(sides: SupportedDiceSides): DiceShape {
  const cached = shapeCache.get(sides);
  if (cached) return cached;
  const source = shapeSources[sides];
  // 整体缩放到外接球半径为 1（不逐个投影到球面上：d10 的顶点不在同一个球面上，逐个投影会把筝形弄得不共面）
  const circumradius = Math.max(...source.vertices.map(length));
  const vertices = source.vertices.map((vertex) => scale(vertex, 1 / circumradius));
  const normals = source.normals.map((normal) => scale(normal, 1 / length(normal)));
  const faces = normals.map((normal) => faceAround(vertices, normal));
  const shape: DiceShape = { sides, vertices, faces, normals, values: assignValues(normals) };
  shapeCache.set(sides, shape);
  return shape;
}

// 凸多面体的面法线：任取三个顶点定一个平面，所有顶点都在它的同一侧时它就是一个面；同一个面只留一条法线
function hullNormals(vertices: Vec3[]): Vec3[] {
  const normals: Vec3[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const raw = cross(sub(vertices[j]!, vertices[i]!), sub(vertices[k]!, vertices[i]!));
        if (length(raw) < 1e-9) continue;
        let normal = normalize(raw);
        const offset = dot(normal, vertices[i]!);
        const sides = vertices.map((vertex) => dot(normal, vertex) - offset);
        if (sides.every((side) => side <= 1e-9)) {
          // 已经朝外
        } else if (sides.every((side) => side >= -1e-9)) {
          normal = scale(normal, -1);
        } else {
          continue;
        }
        if (!normals.some((existing) => dot(existing, normal) > 1 - 1e-9)) normals.push(normal);
      }
    }
  }
  return normals;
}

// 与法线点积最大的顶点组成这个面，按绕法线的角度逆时针排序
function faceAround(vertices: Vec3[], normal: Vec3): number[] {
  const dots = vertices.map((vertex) => dot(vertex, normal));
  const top = Math.max(...dots);
  const indices = dots.flatMap((value, index) => (top - value < 1e-6 ? [index] : []));
  const center = scale(indices.reduce<Vec3>((sum, index) => add(sum, vertices[index]!), [0, 0, 0]), 1 / indices.length);
  const u = normalize(sub(vertices[indices[0]!]!, center));
  const v = cross(normal, u);
  const angle = (index: number) => {
    const offset = sub(vertices[index]!, center);
    return Math.atan2(dot(offset, v), dot(offset, u));
  };
  return indices.sort((left, right) => angle(left) - angle(right));
}

// 相对的两面（法线相反）配成一对，第 k 对刻 k + 1 与 sides - k；d4 没有相对面，按面序刻 1–4
function assignValues(normals: Vec3[]): number[] {
  if (normals.length === 4) return [1, 2, 3, 4];
  const values = new Array<number>(normals.length).fill(0);
  let pair = 0;
  normals.forEach((normal, index) => {
    if (values[index]) return;
    const opposite = normals.findIndex((other) => dot(other, normal) < -1 + 1e-6);
    values[index] = pair + 1;
    values[opposite] = normals.length - pair;
    pair += 1;
  });
  return values;
}

// d4 落定后没有朝上的面，朝上的是一个顶点：读数按桌上的习惯取朝上那个顶点刻的数，它就是压在桌面上的那一面的点数
const readsBottomFace = (shape: DiceShape) => shape.sides === 4;

/**
 * 世界朝向为 orientation 时决定读数的面的下标：一般是朝上（+y）的面，d4 是压在桌面上（−y）的面。
 */
export function resultFaceIndex(shape: DiceShape, orientation: Quat): number {
  const sign = readsBottomFace(shape) ? -1 : 1;
  let best = 0;
  let bestY = Number.NEGATIVE_INFINITY;
  shape.normals.forEach((normal, index) => {
    const y = sign * rotate(orientation, normal)[1];
    if (y > bestY) {
      best = index;
      bestY = y;
    }
  });
  return best;
}

/** 决定读数的面放得多平：法线与竖直方向的夹角余弦，1 是平放，越小越像斜靠在别的骰子或墙上。 */
export function resultFaceAlignment(shape: DiceShape, orientation: Quat): number {
  const sign = readsBottomFace(shape) ? -1 : 1;
  return sign * rotate(orientation, shape.normals[resultFaceIndex(shape, orientation)]!)[1];
}

/**
 * 物理模拟里落定后决定读数的是第 topFace 面（resultFaceIndex），要显示的点数是 value 时，网格相对刚体再转的对称旋转 S：
 * S 把多面体映到自己（形状、碰撞都不变），并把点数为 value 的面转到 topFace 的位置。渲染时网格的朝向用 刚体朝向 × S。
 */
export function relabelRotation(shape: DiceShape, topFace: number, value: number): Quat {
  const from = shape.values.indexOf(value);
  if (from < 0) throw new Error(`d${shape.sides} has no face ${value}`);
  const target = shape.normals[topFace]!;
  const base = rotationBetween(shape.normals[from]!, target);
  // 先把法线对齐，再绕目标法线转到让原面的一个顶点落在目标面的某个顶点上；最短的那次对齐一般不是对称，
  // 所以按顶点算转角，不按 2π/m 的整数倍试。正多面体里这样的转法有 m 个（m 是面的边数），都是对称
  const moved = rotate(base, shape.vertices[shape.faces[from]![0]!]!);
  for (const corner of shape.faces[topFace]!) {
    const candidate = multiply(axisAngle(target, signedAngleAround(target, moved, shape.vertices[corner]!)), base);
    if (mapsOntoItself(shape, candidate)) return candidate;
  }
  throw new Error(`no symmetry of d${shape.sides} maps face ${from} onto face ${topFace}`);
}

// 绕 axis 从 a 转到 b 的有向角（两者先投影到与 axis 垂直的平面上）
function signedAngleAround(axis: Vec3, a: Vec3, b: Vec3): number {
  const pa = sub(a, scale(axis, dot(a, axis)));
  const pb = sub(b, scale(axis, dot(b, axis)));
  return Math.atan2(dot(cross(pa, pb), axis), dot(pa, pb));
}

function mapsOntoItself(shape: DiceShape, rotation: Quat): boolean {
  return shape.vertices.every((vertex) => {
    const moved = rotate(rotation, vertex);
    return shape.vertices.some((other) => length(sub(moved, other)) < 1e-6);
  });
}

/** 放在桌上某处的一颗骰子：形状、外接球半径（世界单位）、中心位置与朝向。 */
interface PlacedDie {
  shape: DiceShape;
  radius: number;
  position: Vec3;
  orientation: Quat;
}

/**
 * 两颗骰子互相穿插的深度（世界单位），按分离轴定理：两个凸多面体分开，当且仅当在两者的面法线、或两者各一条棱的叉积里
 * 能找到一条轴，使它们在轴上的投影不重叠。找到这样的轴就返回 0；找不到时返回各轴上重叠最少的那一段，即至少要挪开多远。
 * 外接球都不相交时直接返回 0。
 */
export function diceOverlapDepth(a: PlacedDie, b: PlacedDie): number {
  const offset = sub(b.position, a.position);
  if (length(offset) >= a.radius + b.radius) return 0;
  const pointsA = a.shape.vertices.map((vertex) => add(scale(rotate(a.orientation, vertex), a.radius), a.position));
  const pointsB = b.shape.vertices.map((vertex) => add(scale(rotate(b.orientation, vertex), b.radius), b.position));
  const edgesA = shapeEdgeDirections(a.shape).map((edge) => rotate(a.orientation, edge));
  const edgesB = shapeEdgeDirections(b.shape).map((edge) => rotate(b.orientation, edge));
  const axes: Vec3[] = [
    ...a.shape.normals.map((normal) => rotate(a.orientation, normal)),
    ...b.shape.normals.map((normal) => rotate(b.orientation, normal))
  ];
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      const axis = cross(edgeA, edgeB);
      const size = length(axis);
      // 两条棱平行时叉积退化，这条轴已由面法线覆盖
      if (size > 1e-6) axes.push(scale(axis, 1 / size));
    }
  }
  let depth = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    let minA = Number.POSITIVE_INFINITY;
    let maxA = Number.NEGATIVE_INFINITY;
    for (const point of pointsA) {
      const projected = dot(point, axis);
      minA = Math.min(minA, projected);
      maxA = Math.max(maxA, projected);
    }
    let minB = Number.POSITIVE_INFINITY;
    let maxB = Number.NEGATIVE_INFINITY;
    for (const point of pointsB) {
      const projected = dot(point, axis);
      minB = Math.min(minB, projected);
      maxB = Math.max(maxB, projected);
    }
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) return 0;
    depth = Math.min(depth, overlap);
  }
  return depth;
}

// 每种骰子的棱的方向（单位向量，每条棱算一次），按形状缓存
const edgeDirectionCache = new WeakMap<DiceShape, Vec3[]>();
function shapeEdgeDirections(shape: DiceShape): Vec3[] {
  const cached = edgeDirectionCache.get(shape);
  if (cached) return cached;
  const seen = new Set<string>();
  const directions: Vec3[] = [];
  for (const face of shape.faces) {
    face.forEach((corner, at) => {
      const next = face[(at + 1) % face.length]!;
      const key = corner < next ? `${corner}-${next}` : `${next}-${corner}`;
      if (seen.has(key)) return;
      seen.add(key);
      directions.push(normalize(sub(shape.vertices[next]!, shape.vertices[corner]!)));
    });
  }
  edgeDirectionCache.set(shape, directions);
  return directions;
}

// ---- 向量与四元数（只够这里用） ----

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const u: Vec3 = [x, y, z];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * w), scale(uuv, 2)));
}

export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function axisAngle(axis: Vec3, angle: number): Quat {
  const unit = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return [unit[0] * s, unit[1] * s, unit[2] * s, Math.cos(half)];
}

function rotationBetween(from: Vec3, to: Vec3): Quat {
  const cosine = dot(from, to);
  if (cosine > 1 - 1e-9) return [0, 0, 0, 1];
  if (cosine < -1 + 1e-9) {
    // 反向：绕任意一条垂直的轴转半圈
    const helper: Vec3 = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return axisAngle(cross(from, helper), Math.PI);
  }
  return axisAngle(cross(from, to), Math.acos(cosine));
}

// 函数声明（会提升）：d10 的顶点与法线在模块加载时就要用到它们
function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function length(a: Vec3): number { return Math.sqrt(dot(a, a)); }
function normalize(a: Vec3): Vec3 { return scale(a, 1 / length(a)); }
