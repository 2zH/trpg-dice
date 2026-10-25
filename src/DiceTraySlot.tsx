import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createLazyModule } from "./lazyModule.js";
import { isSupportedDiceSides } from "./tray/diceShapes.js";
import type { DiceTrayDie, DiceTrayRoll } from "./tray/diceStage.js";

// 3D 骰子（#315）按需加载：three.js 与 cannon-es 只在打开骰子面板后才下载，不进入口块，也不随登录后的离线预载下载
// （离线时没下载过就没有 3D，结果列表照常）。加载中的占位与舞台是同一个外层（.workbench-dice__tray，挂在 body 下、铺满视口），
// 里面不放东西；块取不到时（网络或部署后旧块不存在）写明 3D 没有加载出来、结果照常，刷新页面后再试：同一页面里再 import
// 同一个块会直接失败。颗数不设上限（#322）：掷骰表达式本身至多 100 颗，d100 用两颗 d10 演（十位骰与个位骰），至多 200 颗；
// 颗数多时桌面放大、骰子在画面上变小，仍 2 秒内停稳（见 diceSimulation 的测试）。

/**
 * 演一次落桌只需要每组的骰面与逐颗点数：骰子面板传 rollDice 的完整结果，Shaggai 的 dice_roll 从工具输出里读出的也是这个形状（#360 A5）。
 */
interface DiceTrayRollSource {
  groups: ReadonlyArray<{ sides: number; rolls: readonly number[] }>;
}

/**
 * 这次掷骰能不能演成落桌：只有 d4、d6、d8、d10、d12、d20 与 d100（颗数不限）；能的话按掷出的顺序给出
 * 每颗骰子与决定读数的那一面的点数（d4 是压在桌面上的那一面）。d100 的 1–100 拆成十位与个位，各用一颗 d10（点数 10 当 0），100 演成 00 + 0。
 */
export function readDiceTrayDice(roll: DiceTrayRollSource): DiceTrayDie[] | null {
  const dice: DiceTrayDie[] = [];
  for (const group of roll.groups) {
    for (const value of group.rolls) {
      if (group.sides === 100) {
        const tens = Math.floor((value % 100) / 10);
        const units = value % 10;
        dice.push({ sides: 10, value: tens === 0 ? 10 : tens, kind: "tens" }, { sides: 10, value: units === 0 ? 10 : units, kind: "units" });
      } else if (isSupportedDiceSides(group.sides)) {
        dice.push({ sides: group.sides, value });
      } else {
        return null;
      }
    }
  }
  return dice.length === 0 ? null : dice;
}

export function createDiceTraySlot(loader: () => Promise<typeof import("./tray/DiceTray.js")>) {
  const tray = createLazyModule(loader);

  function DiceTraySlot(props: { roll: DiceTrayRoll; stageLayer?: "overlay" | "overlay-fullscreen"; fallback?: "hint" | "silent" }) {
    const module = tray.useModule();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (module) return;
      let live = true;
      tray.load().catch(() => {
        if (live) setFailed(true);
      });
      return () => {
        live = false;
      };
    }, [module]);

    if (module) return <module.DiceTray roll={props.roll} stageLayer={props.stageLayer} fallback={props.fallback} />;
    // 加载中先挂上同一个空的舞台，块到了不跳动；取不到就说明一句。silent 留给结果本身另有显示位置的调用方（#360 A5 的 agent 掷骰）
    return failed
      ? props.fallback === "silent"
        ? null
        : <p className="workbench-tool__hint">3D 演示没有加载出来，结果照常列在下面；刷新页面后再试</p>
      : createPortal(<div aria-hidden="true" className="workbench-dice__tray" data-dice-state="loading" />, document.body);
  }

  return { load: tray.load, DiceTraySlot };
}

const diceTray = createDiceTraySlot(() => import("./tray/DiceTray.js"));
export const loadDiceTray = diceTray.load;
export const DiceTraySlot = diceTray.DiceTraySlot;
