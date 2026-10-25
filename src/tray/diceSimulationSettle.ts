// 物理停下后仍斜靠或叠住的骰子：沿最短的转动倒平、落到桌面、挪到不重叠的空处。
import { Quaternion, Vec3 } from "cannon-es";
import { rotate, type DiceShape, type Quat } from "./diceShapes.js";
import { diceRadius, type DiceTrayBounds } from "./diceSimulationTable.js";

// 压在桌面上的面法线与竖直的夹角超过约 14° 算没放平（斜靠）
const flatEnough = Math.cos((14 * Math.PI) / 180);

export interface Pose {
  position: [number, number, number];
  orientation: Quat;
}

// 压在桌面上的面：法线最朝下的那一面（d4 就是读数的面，别的骰子是读数那一面的对面）
export function bottomFace(shape: DiceShape, orientation: Quat): { face: number; alignment: number } {
  let face = 0;
  let alignment = Number.NEGATIVE_INFINITY;
  shape.normals.forEach((normal, index) => {
    const down = -rotate(orientation, normal)[1];
    if (down > alignment) {
      face = index;
      alignment = down;
    }
  });
  return { face, alignment };
}

/**
 * 物理停下（或到了上限）之后，把仍斜靠（压在桌面上的面没放平）或停在别的骰子上的骰子沿最短的转动倒平、落到桌面上，
 * 再挪到离原处最近、不与别的骰子重叠、不出墙的地方（按水平投影的外接圆判断）。返回每颗骰子最后的样子，与挪过的骰子下标。
 */
export function settleLeftovers(shapes: readonly DiceShape[], stopped: readonly Pose[], bounds: DiceTrayBounds): { poses: Pose[]; tipped: number[] } {
  const steps = settleLeftoverSteps(shapes, stopped, bounds);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

// settleLeftovers 的过程，每挪好一颗让出一次：分段模拟时 200 颗里挪十几颗也不连成一大段
export function* settleLeftoverSteps(shapes: readonly DiceShape[], stopped: readonly Pose[], bounds: DiceTrayBounds): Generator<void, { poses: Pose[]; tipped: number[] }> {
  const poses = stopped.map((pose) => ({ position: [...pose.position] as [number, number, number], orientation: pose.orientation }));
  const tipped: number[] = [];
  shapes.forEach((shape, index) => {
    const pose = poses[index]!;
    const { face, alignment } = bottomFace(shape, pose.orientation);
    // 平放在桌面上时中心离桌面的高度：面到中心的距离（所有面全等）。比它高出一截，说明垫在别的骰子上
    const restHeight = diceRestHeight(shape);
    if (alignment >= flatEnough && pose.position[1] <= restHeight + restTolerance) return;
    const normal = rotate(pose.orientation, shape.normals[face]!);
    const turn = new Quaternion().setFromVectors(new Vec3(...normal), new Vec3(0, -1, 0));
    const turned = turn.mult(toCannon(pose.orientation)).normalize();
    pose.orientation = [turned.x, turned.y, turned.z, turned.w];
    pose.position[1] = restHeight;
    tipped.push(index);
  });
  if (tipped.length === 0) return { poses, tipped };
  const footprint = poses.map((pose, index) => Math.max(...shapes[index]!.vertices.map((vertex) => {
    const [x, , z] = rotate(pose.orientation, vertex);
    return Math.hypot(x, z) * diceRadius;
  })));
  // 已经有着落的骰子：没挪的那些，加上已经挪好的
  const moving = new Set(tipped);
  const placed = poses.map((_, index) => index).filter((index) => !moving.has(index));
  const fits = (index: number, x: number, z: number) => {
    if (Math.abs(x) > bounds.halfWidth - footprint[index]! || Math.abs(z) > bounds.halfDepth - footprint[index]!) return false;
    for (const other of placed) {
      const [ox, , oz] = poses[other]!.position;
      const reach = footprint[index]! + footprint[other]!;
      if ((ox - x) ** 2 + (oz - z) ** 2 < reach * reach) return false;
    }
    return true;
  };
  for (const index of tipped) {
    const position = poses[index]!.position;
    const [x0, , z0] = position;
    // 从原处一圈圈往外找空处；桌面按每颗 diceTableAreaPerDie 留够了地方，找不到时（视口极小）留在原处
    search: for (let radius = 0; radius <= bounds.halfWidth + bounds.halfDepth; radius += 0.05) {
      const steps = radius === 0 ? 1 : Math.max(8, Math.ceil((2 * Math.PI * radius) / 0.05));
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const x = Math.max(-bounds.halfWidth + footprint[index]!, Math.min(bounds.halfWidth - footprint[index]!, x0 + Math.cos(angle) * radius));
        const z = Math.max(-bounds.halfDepth + footprint[index]!, Math.min(bounds.halfDepth - footprint[index]!, z0 + Math.sin(angle) * radius));
        if (fits(index, x, z)) {
          position[0] = x;
          position[2] = z;
          break search;
        }
      }
    }
    placed.push(index);
    yield;
  }
  return { poses, tipped };
}

// 落定时中心比平放的高度高出这么多以内都算平放在桌面上（接触有一点穿透与抖动）
const restTolerance = 0.04;

/** 骰子平放在桌面上时中心离桌面的高度（世界单位）：面到中心的距离，即内切球半径。 */
export function diceRestHeight(shape: DiceShape): number {
  const corner = shape.vertices[shape.faces[0]![0]!]!;
  const normal = shape.normals[0]!;
  return (corner[0] * normal[0] + corner[1] * normal[1] + corner[2] * normal[2]) * diceRadius;
}

export function toCannon([x, y, z, w]: Quat): Quaternion {
  return new Quaternion(x, y, z, w);
}
