// 一次落桌录下来的帧，以及按帧读取位置与朝向。步长与帧数上限在这里，物理与回放共用。
import type { Quat } from "./diceShapes.js";

/** 模拟的步长（秒）与回放的帧率一致。 */
export const diceFrameSeconds = 1 / 60;
/** 落桌到静止的上限：1.5–2 秒像掷骰，再慢就像慢动作（#315）。 */
export const diceMaxFrames = 120;

export interface DiceSimulation {
  dieCount: number;
  frameCount: number;
  /** 每帧每颗骰子 7 个数：位置 x、y、z 与朝向四元数 x、y、z、w */
  frames: Float32Array;
  /** 每颗骰子最后一帧决定读数的面（resultFaceIndex：一般朝上，d4 压在桌面上；刚体自己的面下标，未换点数） */
  topFaces: number[];
  /** 所有骰子都停住的那一帧（之后的帧不变）；物理到了上限才停的，就是最后一帧 */
  settledFrame: number;
  /** 物理到了上限还有骰子在轻微滑动、转动，就此定住（此时已加了很大的阻尼，每帧只动一点点） */
  capped: boolean;
  /** 实际用的种子：颗数少时，要补间（斜靠、叠住）或到了上限才停的换下一个种子重来 */
  seed: number;
  /** 物理停下后还斜靠、叠住，由最后一段补间倒平挪开的骰子（下标） */
  tipped: number[];
}

/** 第 frame 帧第 index 颗骰子的朝向。 */
export function readOrientation(simulation: DiceSimulation, frame: number, index: number): Quat {
  const at = (frame * simulation.dieCount + index) * 7;
  const f = simulation.frames;
  return [f[at + 3]!, f[at + 4]!, f[at + 5]!, f[at + 6]!];
}

/** 第 frame 帧第 index 颗骰子的位置。 */
export function readPosition(simulation: DiceSimulation, frame: number, index: number): [number, number, number] {
  const at = (frame * simulation.dieCount + index) * 7;
  const f = simulation.frames;
  return [f[at]!, f[at + 1]!, f[at + 2]!];
}
