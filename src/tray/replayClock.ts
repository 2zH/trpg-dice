// 回放录好的落桌用的时钟（#480）：从第一次帧回调开始计时，每一帧最多推进 maxReplayStepMs。
// 以前从画第一帧之前的 performance.now() 起算：第一帧要编译着色器、画骰面图集，主线程这时又可能正忙（Shaggai 的结果
// 和整段回复一起到达），第一次帧回调就可能已经超过整段落桌的时长，回放直接跳到最后一帧，骰子出现时就是停稳的样子。
// 现在卡住的那段时间不算进回放：卡多久，落桌就顺延多久；没卡的时候仍按帧回调的真实间隔推进。

/** 一帧最多推进的毫秒数：约 6 个模拟帧（1/60 秒一帧）。偶尔丢一两帧仍按真实时间走，卡住时不跳过整段 */
export const maxReplayStepMs = 100;

/** 返回一个函数：传入每次帧回调的时间戳，返回回放已经走过的毫秒数；第一次调用返回 0 */
export function createReplayClock(maxStepMs = maxReplayStepMs): (now: number) => number {
  let previous: number | undefined;
  let elapsed = 0;
  return (now) => {
    if (previous !== undefined) elapsed += Math.min(Math.max(now - previous, 0), maxStepMs);
    previous = now;
    return elapsed;
  };
}
