import type { DiceShape, DiceLabelKind } from "./diceShapes.js";
import { diceFaceLabel, diceLabelNeedsUnderline } from "./diceShapes.js";
import type { DiceAtlasLayout } from "./diceMesh.js";

const bodyColor = "#efe7d6";
const inkColor = "#2b2622";

// 骰面图集：每个面一格，骰子本色打底，刻的字居中；倒过来会读错的字加下划线（diceLabelNeedsUnderline）。
// d4 没有朝上的面：每个面的三个角上各刻一个数，是这个角所在的顶点对面那一面的点数，朝上的顶点刻的数就是读数（resultFaceIndex）
export function paintDiceAtlas(shape: DiceShape, atlas: DiceAtlasLayout, kind?: DiceLabelKind): HTMLCanvasElement {
  const tile = 128;
  const canvas = document.createElement("canvas");
  canvas.width = atlas.columns * tile;
  canvas.height = atlas.rows * tile;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = bodyColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = inkColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const draw = (label: string, x: number, y: number, size: number, angle = 0) => {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.font = `600 ${size}px Georgia, "Times New Roman", serif`;
    context.fillText(label, 0, size * 0.04);
    if (diceLabelNeedsUnderline(label)) {
      const width = context.measureText(label).width;
      context.fillRect(-width / 2, size * 0.42, width, Math.max(2, size * 0.07));
    }
    context.restore();
  };
  shape.values.forEach((value, face) => {
    const [column, row] = atlas.tiles[face]!;
    const centerX = (column + 0.5) * tile;
    const centerY = (row + 0.5) * tile;
    if (shape.sides === 4) {
      const size = tile * atlas.faceRadius * 0.42;
      shape.faces[face]!.forEach((vertex, corner) => {
        const opposite = shape.faces.findIndex((other) => !other.includes(vertex));
        const [x, y] = atlas.corners[face]![corner]!;
        // 字放在角与面中心之间，字头朝着角
        draw(diceFaceLabel(shape.values[opposite]!, kind), centerX + x * tile * 0.58, centerY + y * tile * 0.58, size, Math.atan2(x, -y));
      });
      return;
    }
    const label = diceFaceLabel(value, kind);
    draw(label, centerX, centerY, tile * atlas.faceRadius * atlas.insetRatio * (label.length > 1 ? 1.05 : 1.3));
  });
  return canvas;
}
