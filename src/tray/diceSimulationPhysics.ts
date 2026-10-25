// 一次落桌的物理：cannon-es 世界、掷出、倒向最近的面，把每一帧的位置与朝向录下来。
import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Quaternion, Vec3, World } from "cannon-es";
import { getDiceShape, resultFaceIndex, rotate, type DiceShape, type Quat, type SupportedDiceSides } from "./diceShapes.js";
import { diceFrameSeconds, diceMaxFrames, readOrientation, type DiceSimulation } from "./diceSimulationModel.js";
import { diceRadius, scatter, type DiceTrayBounds } from "./diceSimulationTable.js";
import { bottomFace, settleLeftoverSteps, toCannon, type Pose } from "./diceSimulationSettle.js";

const settleSpeed = 0.08;
const settleFramesNeeded = 6;
// 最后这几帧留给 settleLeftovers 的补间（约 0.17 秒），物理至多跑到 diceMaxFrames - tipFrames
const tipFrames = 10;
// 从这一帧起，慢下来却没放平的骰子（立在棱上、靠着别的骰子）加一点朝最近那个面倒下去的转动：
// cannon-es 里这样的骰子常常一直立着或睡着，真实的骰子会自己倒下去
const tipAssistFrame = 30;
const tipAssistGain = 2;
// 到这一帧还没停的骰子加大阻尼，保证物理的上限（diceMaxFrames - tipFrames）之内停住
const brakeFrame = 70;
// 再往后几乎定住：20 颗里接近球形的骰子还在慢慢滚时，2 秒内也要停下
const freezeFrame = 95;
// 转动的阻尼按骰子分：cannon-es 不算滚动阻力，面多、接近球形的 d10、d12、d20 会一直滚，靠更大的转动阻尼代替桌面的滚动阻力
const spinDamping: Record<SupportedDiceSides, number> = { 4: 0.25, 6: 0.25, 8: 0.3, 10: 0.45, 12: 0.45, 20: 0.6 };

export function* simulateOnce(sides: readonly SupportedDiceSides[], seed: number, bounds: DiceTrayBounds): Generator<void, DiceSimulation> {
  const random = mulberry32(seed);
  // 允许休眠：慢下来一小会儿的骰子定住，不再因接触抖动（20 颗时总有一颗在抖，按速度永远判不成停住）
  const world = new World({ gravity: new Vec3(0, -32, 0), allowSleep: true });
  const dieMaterial = new Material("die");
  const tableMaterial = new Material("table");
  world.addContactMaterial(new ContactMaterial(dieMaterial, tableMaterial, { friction: 0.35, restitution: 0.25 }));
  world.addContactMaterial(new ContactMaterial(dieMaterial, dieMaterial, { friction: 0.25, restitution: 0.25 }));

  // 桌面与四面墙
  const walls: Array<[Vec3, Vec3, number]> = [
    [new Vec3(0, 0, 0), new Vec3(1, 0, 0), -Math.PI / 2],
    [new Vec3(-bounds.halfWidth, 0, 0), new Vec3(0, 1, 0), Math.PI / 2],
    [new Vec3(bounds.halfWidth, 0, 0), new Vec3(0, 1, 0), -Math.PI / 2],
    [new Vec3(0, 0, -bounds.halfDepth), new Vec3(0, 1, 0), 0],
    [new Vec3(0, 0, bounds.halfDepth), new Vec3(0, 1, 0), Math.PI]
  ];
  for (const [position, axis, angle] of walls) {
    const body = new Body({ mass: 0, material: tableMaterial, shape: new Plane() });
    body.position.copy(position);
    body.quaternion.setFromAxisAngle(axis, angle);
    world.addBody(body);
  }

  // 骰子在桌子中间上方散开（互不重叠的落点，高度相近，不会一颗砸在另一颗上），各自带着旋转扔下去。
  // 找落点与建刚体也是一颗一颗地让出（Codex 在 #329 上指出 200 颗时这一段一口气要几十毫秒），分段模拟的每一段只多出一个物理步
  const spots = yield* scatter(sides.length, bounds, random);
  const bodies: Body[] = [];
  for (const [index, dieSides] of sides.entries()) {
    const shape = getDiceShape(dieSides);
    const polyhedron = new ConvexPolyhedron({
      vertices: shape.vertices.map(([x, y, z]) => new Vec3(x * diceRadius, y * diceRadius, z * diceRadius)),
      faces: shape.faces.map((face) => [...face])
    });
    const body = new Body({ mass: 1, material: dieMaterial, shape: polyhedron, linearDamping: 0.15, angularDamping: spinDamping[dieSides], sleepSpeedLimit: 0.15, sleepTimeLimit: 0.15 });
    const [x, z] = spots[index]!;
    body.position.set(x, 2.2 + random() * 0.6, z);
    // 水平方向随机，稍微朝桌子中间，速度不大：落下来弹几下、互相碰一碰就停，不会全挤到一面墙边
    const heading = random() * Math.PI * 2;
    const speed = 1.5 + random() * 2;
    body.velocity.set(Math.cos(heading) * speed - x * 0.15, -1 - random() * 2, Math.sin(heading) * speed - z * 0.15);
    body.angularVelocity.set((random() - 0.5) * 24, (random() - 0.5) * 24, (random() - 0.5) * 24);
    body.quaternion.copy(randomQuaternion(random));
    world.addBody(body);
    bodies.push(body);
    yield;
  }

  const physicsFrames = diceMaxFrames - tipFrames;
  const frames = new Float32Array(diceMaxFrames * sides.length * 7);
  let stillFor = 0;
  let settledFrame = diceMaxFrames;
  let frame = 0;
  for (; frame < physicsFrames; frame += 1) {
    if (frame === brakeFrame || frame === freezeFrame) {
      const damping = frame === brakeFrame ? 0.99 : 0.9999;
      for (const body of bodies) {
        body.linearDamping = damping;
        body.angularDamping = damping;
      }
    }
    if (frame >= tipAssistFrame) bodies.forEach((body, index) => assistTipping(body, getDiceShape(sides[index]!)));
    world.step(diceFrameSeconds);
    bodies.forEach((body, index) => {
      const at = (frame * bodies.length + index) * 7;
      frames.set([body.position.x, body.position.y, body.position.z, body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w], at);
    });
    const still = bodies.every((body) => body.sleepState === Body.SLEEPING
      || (body.velocity.length() < settleSpeed && body.angularVelocity.length() < settleSpeed));
    stillFor = still ? stillFor + 1 : 0;
    if (stillFor >= settleFramesNeeded) {
      settledFrame = frame;
      break;
    }
    yield;
  }
  let frameCount = Math.min(frame + 1, physicsFrames);
  const capped = settledFrame === diceMaxFrames;
  settledFrame = frameCount - 1;
  const stopped = bodies.map((body): Pose => ({
    position: [body.position.x, body.position.y, body.position.z],
    orientation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w]
  }));
  const { poses, tipped } = yield* settleLeftoverSteps(sides.map((dieSides) => getDiceShape(dieSides)), stopped, bounds);
  if (tipped.length > 0) {
    // 斜靠、叠住的骰子在最后 tipFrames 帧里倒平、挪到空处；先慢后快，像自己倒下去。其余的骰子停在原处
    for (let step = 1; step <= tipFrames; step += 1) {
      const eased = (step / tipFrames) ** 2;
      stopped.forEach((from, index) => {
        const to = poses[index]!;
        const position = from.position.map((value, axis) => value + (to.position[axis]! - value) * eased);
        const orientation = toCannon(from.orientation).slerp(toCannon(to.orientation), eased).normalize();
        frames.set([...position, orientation.x, orientation.y, orientation.z, orientation.w], ((frameCount - 1 + step) * sides.length + index) * 7);
      });
    }
    frameCount += tipFrames;
    settledFrame = frameCount - 1;
  }
  const result: DiceSimulation = {
    dieCount: sides.length,
    frameCount,
    frames: frames.slice(0, frameCount * sides.length * 7),
    topFaces: [],
    settledFrame,
    capped,
    seed,
    tipped
  };
  result.topFaces = sides.map((dieSides, index) => resultFaceIndex(getDiceShape(dieSides), readOrientation(result, frameCount - 1, index)));
  return result;
}

// 慢下来却没放平的骰子：朝最近的那个面加一点转动，让它像真实的骰子一样倒下去，而不是立在棱上、靠着别的骰子睡着
function assistTipping(body: Body, shape: DiceShape): void {
  if (body.velocity.length() > 0.6 || body.angularVelocity.length() > 3) return;
  const orientation: Quat = [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w];
  const { face, alignment } = bottomFace(shape, orientation);
  if (alignment > 0.9986) return;
  const [nx, , nz] = rotate(orientation, shape.normals[face]!);
  // 转轴 n × (0, −1, 0) = (nz, 0, −nx)：绕它转，这个面的法线转向正下方
  const length = Math.hypot(nx, nz);
  if (length < 1e-9) return;
  const push = Math.acos(Math.min(1, alignment)) * tipAssistGain;
  body.wakeUp();
  body.angularVelocity.x += (nz / length) * push;
  body.angularVelocity.z += (-nx / length) * push;
}

function randomQuaternion(random: () => number): Quaternion {
  // 均匀分布的随机朝向（Shoemake）
  const u1 = random();
  const u2 = random() * Math.PI * 2;
  const u3 = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return new Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/** 32 位种子的小型伪随机数（mulberry32），只决定落桌的样子，不决定点数。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
