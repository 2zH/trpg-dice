import { describe, expect, it } from "vitest";
import { createReplayClock, maxReplayStepMs } from "./replayClock.js";
import { diceFrameSeconds } from "./diceSimulation.js";

// #480：Shaggai 的骰子出现时已经停稳。回放按「现在 − 开始」换算帧号，开始的时刻取在第一帧编译着色器之前；
// 第一次帧回调来得晚（着色器编译、主线程正忙、标签页在后台），换算出的帧号就已经是最后一帧。
describe("dice replay clock (#480)", () => {
  const frameOf = (elapsedMs: number) => Math.floor(elapsedMs / (diceFrameSeconds * 1000));

  it("starts at the first frame callback, so a slow first render does not skip the roll", () => {
    const clock = createReplayClock();
    // 第一次帧回调在开始准备之后 2 秒才到：回放从这里开始，第一帧仍是第 0 帧
    expect(clock(2000)).toBe(0);
    expect(frameOf(clock(2016.7))).toBe(1);
  });

  it("advances by the real interval between frame callbacks", () => {
    const clock = createReplayClock();
    clock(100);
    expect(clock(116)).toBe(16);
    expect(clock(150)).toBe(50);
    // 掉了两帧（50ms）仍按真实时间走，没有被截短
    expect(clock(200)).toBe(100);
  });

  it("caps a stalled frame instead of jumping to the end of the roll", () => {
    const clock = createReplayClock();
    clock(0);
    clock(16);
    // 主线程卡了 3 秒：这一帧只推进 maxReplayStepMs，落桌顺延，不会一下跳到最后
    expect(clock(3016)).toBe(16 + maxReplayStepMs);
    expect(clock(3032)).toBe(32 + maxReplayStepMs);
  });

  it("never runs backwards when timestamps repeat or go back", () => {
    const clock = createReplayClock();
    clock(50);
    expect(clock(50)).toBe(0);
    expect(clock(40)).toBe(0);
    expect(clock(56)).toBe(16);
  });
});
