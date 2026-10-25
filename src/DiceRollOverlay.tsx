import { useEffect, useRef, useState, type ComponentType } from "react";
import type { DiceRollToolEvent as ToolEvent } from "./toolEvents.js";
import { DiceTraySlot, loadDiceTray, readDiceTrayDice } from "./DiceTraySlot.js";
import type { DiceTrayRoll } from "./tray/diceStage.js";

// #360 A5：agent 的 dice_roll 以前只把结果写进折叠的工具卡，3D 骰盘只有骰子面板自己会驱动。面板打开时订阅运行时的工具事件：
// 同一个调用在面板里看到它开始（running）、又在结束（done）时给出能演的骰组，就照着结果演一次落桌；调用的点数仍以 rollDice 的
// 输出为准，托盘只负责演出来。面板一关，宿主就把它卸载（CopilotWidget 的 children），舞台随之销毁；打开面板之前就结束的调用
// 不会重演：历史消息里的工具调用在打开时直接以 done 出现，没有见到 running。
// 舞台在面板之上（stageLayer="overlay"）：Shaggai 面板的层级高于骰子面板的舞台，全屏打开时也看得见。
// 看到调用开始就把 3D 块取下来，结果回来时不必再等下载，同时撤掉上一批骰子：这一次失败、取消或演不了时，旧点数不会留下冒充它。
// 只演读得懂的输出：形状不对、点数超出骰面、颗数超过工具上限（100）或骰面不能演（如 d2）时什么都不做，工具卡照常显示结果。
// 舞台加载不出来或浏览器没有 WebGL 时也不插说明（fallback="silent"）：结果本来就在工具卡里，插在面板外反而会放错位置。

export interface DiceRollToolEventSource {
  subscribeToolEvents(listener: (event: ToolEvent) => void): () => void;
}

const maxToolDiceCount = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 从 dice_roll 的工具输出里读出能演的骰组；不是工具输出的形状时返回 null。 */
export function readDiceRollGroups(output: unknown): { groups: Array<{ sides: number; rolls: number[] }> } | null {
  if (!isRecord(output) || !Array.isArray(output.groups)) return null;
  const groups: Array<{ sides: number; rolls: number[] }> = [];
  let count = 0;
  for (const group of output.groups) {
    if (!isRecord(group)) return null;
    const { sides, rolls } = group;
    if (typeof sides !== "number" || !Number.isInteger(sides) || sides < 2 || sides > 1_000) return null;
    if (!Array.isArray(rolls) || !rolls.every((value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= sides)) return null;
    count += rolls.length;
    if (count > maxToolDiceCount) return null;
    groups.push({ sides, rolls: [...rolls] });
  }
  return groups.length === 0 ? null : { groups };
}

export function createDiceRollOverlay(
  TraySlot: ComponentType<{ roll: DiceTrayRoll; stageLayer?: "overlay" | "overlay-fullscreen"; fallback?: "hint" | "silent" }>,
  loadTray: () => Promise<unknown> = loadDiceTray
) {
  function DiceRollOverlay(props: { runtime: DiceRollToolEventSource; fullscreen?: boolean }) {
    const [roll, setRoll] = useState<DiceTrayRoll | null>(null);
    const nextIdRef = useRef(1);
    useEffect(() => {
      // 换了对话：上一个对话的骰子不该留在舞台；在面板里看到这次调用开始之后才演它的结果
      setRoll(null);
      const started = new Set<string>();
      return props.runtime.subscribeToolEvents((event) => {
        if (event.toolName !== "dice_roll") return;
        if (event.status === "running") {
          started.add(event.toolCallId);
          // 新的一次掷骰一开始就先撤掉上一批：它失败、取消、读不懂或不支持时，旧点数不会留在台面上冒充这次的结果
          setRoll(null);
          loadTray().catch(() => undefined);
          return;
        }
        if (!started.delete(event.toolCallId) || event.status !== "done") return;
        const source = readDiceRollGroups(event.output?.output);
        if (!source) return;
        const dice = readDiceTrayDice(source);
        if (!dice) return;
        const id = nextIdRef.current;
        nextIdRef.current += 1;
        setRoll({ id, seed: crypto.getRandomValues(new Uint32Array(1))[0]!, dice });
      });
    }, [props.runtime]);
    // 全屏面板在桌面也占满视口、层级是 2147483000：舞台跟着用高层，其余时候留在桌面文件与菜单之下
    return roll ? <TraySlot roll={roll} stageLayer={props.fullscreen ? "overlay-fullscreen" : "overlay"} fallback="silent" /> : null;
  }
  return DiceRollOverlay;
}

export const DiceRollOverlay = createDiceRollOverlay(DiceTraySlot);
