// 桌面大小与落点：视口不够时按颗数放大桌子，掷出时在桌子中间散开、互不重叠。

/** 骰子外接球的半径（世界单位）。 */
export const diceRadius = 0.55;

export interface DiceTrayBounds {
  /** 桌面在 x 方向的半宽与 z 方向的半深（世界单位），四周有墙，骰子出不去 */
  halfWidth: number;
  halfDepth: number;
}

/** 每颗骰子至少分到的桌面（平方世界单位）。再挤，接近球形的骰子就常常斜靠在一起；视口换算出的桌面不够时由 fitDiceTable 放大。 */
export const diceTableAreaPerDie = 12;
// 墙边留出的距离：落点离墙至少这么远
const wallMargin = diceRadius * 1.5;

/**
 * 视口换算出的桌面（0.02 世界单位/像素）放不下 count 颗时，按同一个宽高比放大到放得下：镜头随之拉远，骰子在画面上变小，
 * 但仍在一屏里、不斜靠。放得下时原样返回，骰子在画面上的大小不变。
 */
export function fitDiceTable(viewport: DiceTrayBounds, count: number): DiceTrayBounds {
  const wanted = count * diceTableAreaPerDie;
  const usable = (halfWidth: number, halfDepth: number) => 4 * (halfWidth - wallMargin) * (halfDepth - wallMargin);
  if (usable(viewport.halfWidth, viewport.halfDepth) >= wanted) return viewport;
  // 4 (k·w − m)(k·d − m) = wanted，取正根
  const { halfWidth: w, halfDepth: d } = viewport;
  const a = 4 * w * d;
  const b = -4 * wallMargin * (w + d);
  const c = 4 * wallMargin * wallMargin - wanted;
  const k = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return { halfWidth: w * k, halfDepth: d * k };
}

// 互不重叠的落点（x, z）：在桌子中间一块随颗数长大的区域里散开（每颗 diceTableAreaPerDie，形状随桌面，至多到墙边），
// 几颗骰子时落点聚在一起、像一把扔下去，颗数多时铺开、不挤在一起斜靠着停住。挤不下时放宽间距，保证每颗都有落点
export function* scatter(count: number, bounds: DiceTrayBounds, random: () => number): Generator<void, Array<[number, number]>> {
  const spots: Array<[number, number]> = [];
  const maxX = bounds.halfWidth - wallMargin;
  const maxZ = bounds.halfDepth - wallMargin;
  const quarterArea = Math.max(count, 3) * diceTableAreaPerDie / 4;
  // 先按桌面的宽高比定半宽半深，一边顶到墙时把面积让给另一边
  let zRange = Math.min(maxZ, Math.sqrt(quarterArea / (maxX / maxZ)));
  const xRange = Math.min(maxX, quarterArea / zRange);
  zRange = Math.min(maxZ, Math.max(zRange, quarterArea / xRange));
  let gap = diceRadius * 2.6;
  while (spots.length < count) {
    let placed = false;
    for (let tries = 0; tries < 60 && !placed; tries += 1) {
      const x = (random() * 2 - 1) * xRange;
      const z = (random() * 2 - 1) * zRange;
      if (spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) >= gap)) {
        spots.push([x, z]);
        placed = true;
      }
    }
    if (!placed) gap *= 0.85;
    yield;
  }
  return spots;
}
