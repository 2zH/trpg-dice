// 3D 骰子（#315）的物理：用 cannon-es 把一次落桌在后台模拟完、把每一帧的位置与朝向录下来，渲染只回放录好的帧。
// 这样落点与读数在模拟时就定了，不随帧率、标签页是否在后台而变；读数仍以 rollDice 为准，见 diceShapes.relabelRotation。
// 随机只影响「怎么落」：给定种子，结果可以复现（测试与截图对比用）。
// 颗数不设上限（#322），掷骰表达式本身至多 100 颗（d100 拆成两颗 d10，至多 200 颗）：桌面按颗数放大（fitDiceTable），
// 物理停下后仍斜靠或叠住的骰子由最后一段补间倒平、挪到空处（settleLeftovers），颗数再多也不用整次重来。
import type { SupportedDiceSides } from "./diceShapes.js";
import type { DiceSimulation } from "./diceSimulationModel.js";
import { simulateOnce } from "./diceSimulationPhysics.js";
import type { DiceTrayBounds } from "./diceSimulationTable.js";

export { diceFrameSeconds, diceMaxFrames, readOrientation, readPosition } from "./diceSimulationModel.js";
export type { DiceSimulation } from "./diceSimulationModel.js";
export { diceRadius, diceTableAreaPerDie, fitDiceTable } from "./diceSimulationTable.js";
export type { DiceTrayBounds } from "./diceSimulationTable.js";
export { diceRestHeight, settleLeftovers } from "./diceSimulationSettle.js";
export { mulberry32 } from "./diceSimulationPhysics.js";

/** 一口气模拟完（测试与只有几颗骰子时用）。舞台上用 simulateDiceInSlices，不长时间占着主线程。 */
export function simulateDice(sides: readonly SupportedDiceSides[], seed: number, bounds: DiceTrayBounds): DiceSimulation {
  const steps = simulationSteps(sides, seed, bounds);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/**
 * 与 simulateDice 结果相同，但分成一小段一小段地算：每段至多 sliceMs 毫秒，段与段之间让出主线程（MessageChannel 排一个新任务），
 * 期间页面照常响应输入、滚动与绘制。200 颗骰子在桌面电脑上约 180 毫秒，慢的手机上会长得多（Codex 在 #329 上指出）。
 * isCancelled 返回 true 时（又掷了一次、舞台卸载）停下，结果为 null。
 */
export function simulateDiceInSlices(
  sides: readonly SupportedDiceSides[],
  seed: number,
  bounds: DiceTrayBounds,
  options: { sliceMs?: number; isCancelled?: () => boolean } = {}
): Promise<DiceSimulation | null> {
  const sliceMs = options.sliceMs ?? 8;
  const steps = simulationSteps(sides, seed, bounds);
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (value: DiceSimulation | null) => {
      channel.port1.close();
      resolve(value);
    };
    channel.port1.onmessage = () => {
      try {
        if (options.isCancelled?.()) {
          finish(null);
          return;
        }
        const deadline = performance.now() + sliceMs;
        for (;;) {
          const next = steps.next();
          if (next.done) {
            finish(next.value);
            return;
          }
          if (performance.now() >= deadline) break;
        }
        channel.port2.postMessage(null);
      } catch (error) {
        channel.port1.close();
        reject(error);
      }
    };
    channel.port2.postMessage(null);
  });
}

/**
 * 模拟的全过程，切成不能再分的小步（yield 之间）：找一颗骰子的落点、建一颗骰子的刚体、算一帧物理、挪好一颗斜靠的骰子。
 * simulateDice 一口气走完，simulateDiceInSlices 按时间分段走；导出给测试数步数。
 */
export function* simulationSteps(sides: readonly SupportedDiceSides[], seed: number, bounds: DiceTrayBounds): Generator<void, DiceSimulation> {
  // 颗数少时多试几个种子，挑一次不用补间、自己落平的；颗数多时每次都难免有一两颗要补，只模拟一次，耗时与颗数成正比
  const attempts = Math.max(1, Math.min(8, Math.floor(40 / Math.max(1, sides.length))));
  let best: DiceSimulation | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const simulation = yield* simulateOnce(sides, seed + attempt, bounds);
    if (simulation.tipped.length === 0 && !simulation.capped) return simulation;
    if (!best || simulation.tipped.length < best.tipped.length) best = simulation;
  }
  return best!;
}
