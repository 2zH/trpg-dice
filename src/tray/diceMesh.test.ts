import { describe, expect, it } from "vitest";
import { buildDiceMeshData } from "./diceMesh.js";
import { getDiceShape, supportedDiceSides } from "./diceShapes.js";

// #315：每个面切成三角形、法线平直，UV 落在图集里这个面自己的格子里（数字不会印到别的面上）
describe("dice mesh data (#315)", () => {
  it.each(supportedDiceSides)("maps every face of a d%i into its own atlas tile", (sides) => {
    const shape = getDiceShape(sides);
    const mesh = buildDiceMeshData(shape, 0.55);
    const trianglesPerFace = shape.faces[0]!.length - 2;
    expect(mesh.positions).toHaveLength(sides * trianglesPerFace * 9);
    expect(mesh.uvs).toHaveLength(sides * trianglesPerFace * 6);
    const { columns, rows, tiles } = mesh.atlas;
    // 内切比例：正多面体的面是 cos(π/边数)，d10 的筝形更窄
    if (sides !== 10) expect(mesh.atlas.insetRatio).toBeCloseTo(Math.cos(Math.PI / shape.faces[0]!.length), 6);
    else expect(mesh.atlas.insetRatio).toBeLessThan(Math.cos(Math.PI / 4));
    expect(columns * rows).toBeGreaterThanOrEqual(sides);
    expect(new Set(tiles.map(([column, row]) => `${column},${row}`)).size).toBe(sides);
    shape.faces.forEach((_, face) => {
      const [column, row] = tiles[face]!;
      for (let vertex = 0; vertex < trianglesPerFace * 3; vertex += 1) {
        const at = (face * trianglesPerFace * 3 + vertex) * 2;
        const s = mesh.uvs[at]! * columns;
        const t = (1 - mesh.uvs[at + 1]!) * rows;
        expect(s).toBeGreaterThan(column + 0.04);
        expect(s).toBeLessThan(column + 0.96);
        expect(t).toBeGreaterThan(row + 0.04);
        expect(t).toBeLessThan(row + 0.96);
        // 法线就是这个面的法线
        const n = (face * trianglesPerFace * 3 + vertex) * 3;
        expect(mesh.normals.slice(n, n + 3)).toEqual([...shape.normals[face]!]);
      }
    });
    // 顶点都在外接球内，最远的在球面上（d10 只有两个尖顶在球面上）
    const radii = [];
    for (let at = 0; at < mesh.positions.length; at += 3) radii.push(Math.hypot(mesh.positions[at]!, mesh.positions[at + 1]!, mesh.positions[at + 2]!));
    expect(Math.max(...radii)).toBeCloseTo(0.55, 6);
    expect(radii.every((radius) => radius <= 0.55 + 1e-9)).toBe(true);
    if (sides !== 10) expect(radii.every((radius) => Math.abs(radius - 0.55) < 1e-6)).toBe(true);
  });

  // #322：d4 在每个面的三个角上刻字，按 atlas.corners 定位；它与 UV 用的是同一套面内坐标
  it.each(supportedDiceSides)("places each corner of a d%i face where its UV lands in the tile", (sides) => {
    const shape = getDiceShape(sides);
    const mesh = buildDiceMeshData(shape, 0.55);
    const { columns, rows, tiles, corners, faceRadius } = mesh.atlas;
    const trianglesPerFace = shape.faces[0]!.length - 2;
    expect(corners).toHaveLength(sides);
    shape.faces.forEach((face, faceIndex) => {
      expect(corners[faceIndex]).toHaveLength(face.length);
      const [column, row] = tiles[faceIndex]!;
      // 扇形的第一个三角形是第 0、1、2 个角
      for (let corner = 0; corner < 3; corner += 1) {
        const at = (faceIndex * trianglesPerFace * 3 + corner) * 2;
        const [x, y] = corners[faceIndex]![corner]!;
        expect(mesh.uvs[at]!).toBeCloseTo((column + 0.5 + x) / columns, 9);
        expect(mesh.uvs[at + 1]!).toBeCloseTo(1 - (row + 0.5 + y) / rows, 9);
      }
      // 离面中心最远的角落在外接圆上；d4 的字头朝上指着其中一个角（画布的 y 朝下）
      expect(Math.max(...corners[faceIndex]!.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(faceRadius, 9);
      if (sides === 4) expect(corners[faceIndex]!.some(([x, y]) => Math.abs(x) < 1e-9 && Math.abs(y + faceRadius) < 1e-9)).toBe(true);
    });
  });
});
