// 3D 骰子（#315、#322）的网格数据：每个面按扇形切成三角形，平直着色（每个面一条法线），骰面的点数烘进一张图集，
// 每个面映到图集里自己的一格（逐面 UV），数字随骰子一起转。只出普通数组，three.js 那边包成 BufferGeometry。
import type { DiceShape, Vec3 } from "./diceShapes.js";

export interface DiceAtlasLayout {
  columns: number;
  rows: number;
  /** 第 i 个面在图集里的格子（列、行），从左上角数 */
  tiles: Array<[number, number]>;
  /** 面的外接圆在格子里占的半径（格子边长为 1）；画数字时据此定字号 */
  faceRadius: number;
  /** 面中心到最近一条边的距离与到最远顶点的距离之比：三角形 0.5、正方形约 0.71、五边形约 0.81，d10 的筝形更小 */
  insetRatio: number;
  /** 每个面各个角在自己格子里的位置（格子边长为 1、中心为原点，x 朝右、y 朝下，与画布相同），顺序同 shape.faces；d4 在角上刻字时用 */
  corners: Array<Array<[number, number]>>;
}

interface DiceMeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  atlas: DiceAtlasLayout;
}

/** 面的外接圆在格子里占的比例，四周留白，纹理过滤不会采到相邻的格子 */
const faceRadiusInTile = 0.44;

export function buildDiceMeshData(shape: DiceShape, radius: number): DiceMeshData {
  const columns = Math.ceil(Math.sqrt(shape.faces.length));
  const rows = Math.ceil(shape.faces.length / columns);
  const tiles = shape.faces.map((_, index): [number, number] => [index % columns, Math.floor(index / columns)]);
  const atlas: DiceAtlasLayout = { columns, rows, tiles, faceRadius: faceRadiusInTile, insetRatio: faceInsetRatio(shape), corners: [] };
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  shape.faces.forEach((face, faceIndex) => {
    const normal = shape.normals[faceIndex]!;
    const points = face.map((corner) => shape.vertices[corner]!);
    const center = scale(points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
    // 面内的二维坐标，离中心最远的顶点归一到 1。数字的「上」（v）：d6 的正方形朝第一条边的中点（与边对齐，像常见的 d6），
    // 其余朝离中心最远的顶点：d8、d12、d20 是任一顶点，d10 的筝形是尖头（像常见的 d10）；u = v × n，(u, v, n) 是右手系
    const distances = points.map((point) => length(sub(point, center)));
    const circumradius = Math.max(...distances);
    const farthest = points[distances.indexOf(circumradius)]!;
    const up = shape.sides === 6 ? scale(add(points[0]!, points[1]!), 0.5) : farthest;
    const upOffset = sub(up, center);
    const v = scale(upOffset, 1 / length(upOffset));
    const u = cross(v, normal);
    const [column, row] = tiles[faceIndex]!;
    atlas.corners.push(points.map((point): [number, number] => {
      const offset = sub(point, center);
      return [(dot(offset, u) / circumradius) * faceRadiusInTile, -(dot(offset, v) / circumradius) * faceRadiusInTile];
    }));
    const toUv = (point: Vec3): [number, number] => {
      const offset = sub(point, center);
      const x = dot(offset, u) / circumradius;
      const y = dot(offset, v) / circumradius;
      // 格子中心加上面内坐标；图集的 v 轴朝上（three.js 的 flipY 约定），所以行号从上往下数时取 1 - …
      return [(column + 0.5 + x * faceRadiusInTile) / columns, 1 - (row + 0.5 - y * faceRadiusInTile) / rows];
    };
    for (let at = 1; at + 1 < points.length; at += 1) {
      for (const point of [points[0]!, points[at]!, points[at + 1]!]) {
        positions.push(point[0] * radius, point[1] * radius, point[2] * radius);
        normals.push(normal[0], normal[1], normal[2]);
        uvs.push(...toUv(point));
      }
    }
  });
  return { positions, normals, uvs, atlas };
}

// 所有面全等，取第一个面：中心到每条边的距离里最小的，除以中心到最远顶点的距离
function faceInsetRatio(shape: DiceShape): number {
  const points = shape.faces[0]!.map((corner) => shape.vertices[corner]!);
  const center = scale(points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
  const farthest = Math.max(...points.map((point) => length(sub(point, center))));
  const nearestEdge = Math.min(...points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const edge = sub(next, point);
    return length(cross(edge, sub(center, point))) / length(edge);
  }));
  return nearestEdge / farthest;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
