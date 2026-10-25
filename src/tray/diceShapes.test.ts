import { describe, expect, it } from "vitest";
import { axisAngle, diceFaceLabel, diceLabelNeedsUnderline, diceOverlapDepth, getDiceShape, multiply, relabelRotation, resultFaceIndex, rotate, supportedDiceSides, type Quat, type Vec3 } from "./diceShapes.js";

const close = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// #315、#322：五种骰子的形状、点数与「换点数」用的对称旋转
describe("dice shapes (#315)", () => {
  const expected = { 4: [4, 3], 6: [8, 4], 8: [6, 3], 10: [12, 4], 12: [20, 5], 20: [12, 3] } as const;

  it.each(supportedDiceSides)("builds a closed d%i with outward, counter-clockwise faces", (sides) => {
    const shape = getDiceShape(sides);
    const [vertexCount, cornersPerFace] = expected[sides];
    expect(shape.vertices).toHaveLength(vertexCount);
    expect(shape.faces).toHaveLength(sides);
    expect(shape.faces.every((face) => face.length === cornersPerFace)).toBe(true);
    shape.faces.forEach((face, index) => {
      const normal = shape.normals[index]!;
      // 每条边与下一条边的叉积都朝外，即从外面看逆时针（three.js 的正面）
      face.forEach((corner, at) => {
        const a = shape.vertices[corner]!;
        const b = shape.vertices[face[(at + 1) % face.length]!]!;
        const c = shape.vertices[face[(at + 2) % face.length]!]!;
        expect(dot(cross(sub(b, a), sub(c, b)), normal)).toBeGreaterThan(0);
      });
    });
    // 每条边恰好属于两个面：网格是封闭的
    const edges = new Map<string, number>();
    for (const face of shape.faces) {
      face.forEach((corner, at) => {
        const next = face[(at + 1) % face.length]!;
        const key = [Math.min(corner, next), Math.max(corner, next)].join("-");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      });
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  });

  it.each(supportedDiceSides)("numbers the d%i faces 1..n with opposite faces adding up to n + 1 (the d4 has no opposite faces)", (sides) => {
    const shape = getDiceShape(sides);
    expect([...shape.values].sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, index) => index + 1));
    if (sides === 4) {
      // 正四面体没有相对面：每个面的反方向是一个顶点
      expect(shape.normals.every((normal) => !shape.normals.some((other) => close(other, [-normal[0], -normal[1], -normal[2]])))).toBe(true);
      return;
    }
    shape.normals.forEach((normal, index) => {
      const opposite = shape.normals.findIndex((other) => close(other, [-normal[0], -normal[1], -normal[2]]));
      expect(shape.values[index]! + shape.values[opposite]!).toBe(sides + 1);
    });
  });

  it.each(supportedDiceSides)("finds, for every face of a d%i and every value, a symmetry that puts that value on that face", (sides) => {
    const shape = getDiceShape(sides);
    for (let topFace = 0; topFace < sides; topFace += 1) {
      for (let value = 1; value <= sides; value += 1) {
        const symmetry = relabelRotation(shape, topFace, value);
        const from = shape.values.indexOf(value);
        // 刻着 value 的面转到了 topFace 的位置
        expect(close(rotate(symmetry, shape.normals[from]!), shape.normals[topFace]!)).toBe(true);
        // 是对称：每个顶点都落在某个顶点上，碰撞形状不变
        for (const vertex of shape.vertices) {
          expect(shape.vertices.some((other) => close(rotate(symmetry, vertex), other))).toBe(true);
        }
      }
    }
  });

  it("labels the two d10 of a d100 as tens (00–90) and units (0–9), with face value 10 as 0 (#322)", () => {
    const values = Array.from({ length: 10 }, (_, index) => index + 1);
    expect(values.map((value) => diceFaceLabel(value, "tens"))).toEqual(["10", "20", "30", "40", "50", "60", "70", "80", "90", "00"]);
    expect(values.map((value) => diceFaceLabel(value, "units"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    expect(values.map((value) => diceFaceLabel(value))).toEqual(values.map(String));
  });

  it("underlines 6, 9 and the tens die's 60 and 90, and no other label (Codex on #324)", () => {
    const labels = new Set<string>();
    for (const sides of supportedDiceSides) for (const value of getDiceShape(sides).values) labels.add(diceFaceLabel(value));
    for (let value = 1; value <= 10; value += 1) {
      labels.add(diceFaceLabel(value, "tens"));
      labels.add(diceFaceLabel(value, "units"));
    }
    // 6 与 9 倒过来互相像；十位骰的 60、90 倒过来像 09、06，在 d100 里会被看成旁边个位骰的 9、6。
    // 10、80 倒过来是 01、08，数字没变；d20 的 16、19 倒过来是 91、61，哪颗骰子上都没有，这些都不加
    const underlined = [...labels].filter(diceLabelNeedsUnderline).sort();
    expect(underlined).toEqual(["6", "60", "9", "90"]);
    for (const label of ["10", "16", "19", "80", "00", "0"]) expect(diceLabelNeedsUnderline(label), label).toBe(false);
  });

  it("reads a d4 by the face it rests on, the face opposite the vertex on top (#322)", () => {
    const shape = getDiceShape(4);
    // 第 2 面压在桌面上：它的法线朝下，正对着它的顶点朝上
    const normal = shape.normals[2]!;
    const resting: Quat = axisAngle(cross(normal, [0, -1, 0]), Math.acos(-normal[1]));
    expect(resultFaceIndex(shape, resting)).toBe(2);
    // 换点数之后，压在桌面上的那一面就是想要的 3
    const symmetry = relabelRotation(shape, 2, 3);
    expect(shape.values[resultFaceIndex(shape, multiply(resting, symmetry))]).toBe(3);
  });

  // Codex 在 #329 上的例子：两颗平放的 d6 在 x、z 上各错开 0.45，中心距离 0.636 刚好比两颗内切球半径之和大，方块却还叠着
  it("measures how deep two dice interpenetrate from their actual shapes (#329)", () => {
    const d6 = getDiceShape(6);
    const half = 0.55 / Math.sqrt(3);
    const at = (x: number, z: number, orientation: Quat = [0, 0, 0, 1]) => ({ shape: d6, radius: 0.55, position: [x, half, z] as Vec3, orientation });
    // 方块边长 2·half ≈ 0.635：每个轴上只错开 0.45，还叠着 0.185
    expect(diceOverlapDepth(at(0, 0), at(0.45, 0.45))).toBeCloseTo(2 * half - 0.45, 6);
    // 对照：x 上错开 0.7，分开了；正好贴着也算分开
    expect(diceOverlapDepth(at(0, 0), at(0.7, 0.45))).toBe(0);
    expect(diceOverlapDepth(at(0, 0), at(2 * half, 0))).toBe(0);
    // 转 45° 的那颗角对着另一颗的面：中心隔 0.7 时角已经插进去（半对角线 0.449 + 半边长 0.318 > 0.7），隔 0.8 时分开
    const turned = axisAngle([0, 1, 0], Math.PI / 4);
    expect(diceOverlapDepth(at(0, 0), at(0.7, 0, turned))).toBeGreaterThan(0.05);
    expect(diceOverlapDepth(at(0, 0), at(0.8, 0, turned))).toBe(0);
    // 棱对棱：下面那颗绕 x 转 45°（顶上是一条沿 x 的棱），上面那颗绕 z 转 45°（底下是一条沿 z 的棱），两条棱十字交叉。
    // 中心隔 3.3 个半边长时，两颗的面法线上投影都还重叠，只有两条棱的叉积（竖直方向）能把它们分开；隔 2.6 个半边长时棱插进去了
    const lower = { shape: d6, radius: 0.55, position: [0, 0, 0] as Vec3, orientation: axisAngle([1, 0, 0], Math.PI / 4) };
    const upper = (height: number) => ({ shape: d6, radius: 0.55, position: [0, height, 0] as Vec3, orientation: axisAngle([0, 0, 1], Math.PI / 4) });
    expect(diceOverlapDepth(lower, upper(3.3 * half))).toBe(0);
    expect(diceOverlapDepth(lower, upper(2.6 * half))).toBeCloseTo((2 * Math.SQRT2 - 2.6) * half, 6);
  });

  it("reads the face whose normal points most upwards, also after the relabelling symmetry", () => {
    const shape = getDiceShape(20);
    // 像落定那样让第 7 面正好朝上（初始朝向里有几面一样高，不用它）
    const normal = shape.normals[7]!;
    const resting: Quat = axisAngle(cross(normal, [0, 1, 0]), Math.acos(normal[1]));
    expect(resultFaceIndex(shape, resting)).toBe(7);
    // 刚体朝上的是第 7 面；网格再转 S 之后，朝上的那一面刻的正是想要的 17
    const symmetry = relabelRotation(shape, 7, 17);
    expect(shape.values[resultFaceIndex(shape, multiply(resting, symmetry))]).toBe(17);
  });
});
