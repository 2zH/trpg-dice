// 3D 骰子（#315、#322）：把一次掷骰演成落桌。骰子面板按需加载这个模块（three.js 与 cannon-es 都在这个块里，不进入口块）。
// 本文件只管舞台的门户、WebGL 不可用时的提示，以及 roll.id 变化时触发落桌；落桌本身的实现在 diceStage.ts。
// prefers-reduced-motion: reduce 时不播动画，直接摆出落定的样子。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiceStage, type DiceTrayRoll } from "./diceStage.js";

export function DiceTray(props: { roll: DiceTrayRoll; stageLayer?: "overlay" | "overlay-fullscreen"; fallback?: "hint" | "silent" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<DiceStage | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let stage: DiceStage;
    try {
      stage = new DiceStage(container);
    } catch {
      // 没有 WebGL（被禁用、驱动不支持）：写明一句，只留结果列表
      setUnavailable(true);
      return;
    }
    stageRef.current = stage;
    return () => {
      stageRef.current = null;
      stage.dispose();
    };
  }, []);

  // 只在换了一次掷骰（id 变了）时重新落桌
  const rollRef = useRef(props.roll);
  rollRef.current = props.roll;
  useEffect(() => {
    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stageRef.current?.play(rollRef.current, reducedMotion);
  }, [props.roll.id]);

  if (unavailable) {
    // silent：调用方已经把结果放在别处（Shaggai 的工具卡），不在这里插一句会放错位置的话
    return props.fallback === "silent"
      ? null
      : <p className="workbench-tool__hint" data-dice-state="unavailable">这个浏览器不能显示 3D 骰子（WebGL 不可用），结果照常列在下面</p>;
  }
  const className = props.stageLayer === undefined
    ? "workbench-dice__tray"
    : `workbench-dice__tray workbench-dice__tray--overlay${props.stageLayer === "overlay-fullscreen" ? " workbench-dice__tray--overlay-fullscreen" : ""}`;
  return createPortal(<div aria-hidden="true" className={className} data-dice-state="idle" ref={containerRef} />, document.body);
}
