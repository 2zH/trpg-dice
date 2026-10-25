import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createDiceTraySlot, readDiceTrayDice } from "./DiceTraySlot.js";
import { rollDice } from "./rollDice.js";
import { DiceTray } from "./tray/DiceTray.js";
import type { DiceTrayRoll } from "./tray/diceStage.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

// 固定的随机数：每颗骰子都掷出 1（rollDice 会拒掉落在尾部的值再取，不能用 0xffffffff，会一直重取）
const ones = () => 0;
// 每颗骰子都掷出 n + 1（n 小于面数时）
const always = (n: number) => () => n;

// #315：哪些掷骰能演成落桌，以及托盘按需加载
describe("dice tray slot (#315)", () => {
  it("lists every die with its rolled value, in rolling order, for d6, d8, d12 and d20 up to five dice", () => {
    expect(readDiceTrayDice(rollDice({ expression: "2d6+1d20+3" }, ones))).toEqual([
      { sides: 6, value: 1 },
      { sides: 6, value: 1 },
      { sides: 20, value: 1 }
    ]);
    expect(readDiceTrayDice(rollDice({ expression: "1d6+1d8+1d12+1d20+1d6" }, ones))?.map((die) => die.sides)).toEqual([6, 8, 12, 20, 6]);
  });

  it("leaves out rolls with other dice, and shows any number of supported dice (#322)", () => {
    expect(readDiceTrayDice(rollDice({ expression: "1d2" }, ones))).toBeNull();
    expect(readDiceTrayDice(rollDice({ expression: "2d6+1d3" }, ones))).toBeNull();
    // 颗数不设上限：表达式本身至多 100 颗，100 颗 d100 拆成 200 颗 d10
    expect(readDiceTrayDice(rollDice({ expression: "100d6" }, ones))).toHaveLength(100);
    expect(readDiceTrayDice(rollDice({ expression: "100d100" }, ones))).toHaveLength(200);
    expect(readDiceTrayDice(rollDice({ expression: "1d4+2d6" }, ones))).toEqual([{ sides: 4, value: 1 }, { sides: 6, value: 1 }, { sides: 6, value: 1 }]);
  });

  it("shows a d100 as a tens and a units d10, 100 as 00 and 0, and a d10 as itself (#322)", () => {
    expect(readDiceTrayDice(rollDice({ expression: "1d100" }, always(46)))).toEqual([
      { sides: 10, value: 4, kind: "tens" },
      { sides: 10, value: 7, kind: "units" }
    ]);
    // 100：十位 0、个位 0，两颗 d10 的点数 10 刻的是 00 与 0
    expect(readDiceTrayDice(rollDice({ expression: "1d100" }, always(99)))).toEqual([
      { sides: 10, value: 10, kind: "tens" },
      { sides: 10, value: 10, kind: "units" }
    ]);
    // 5：十位 0（刻 00）、个位 5
    expect(readDiceTrayDice(rollDice({ expression: "1d100" }, always(4)))).toEqual([
      { sides: 10, value: 10, kind: "tens" },
      { sides: 10, value: 5, kind: "units" }
    ]);
    expect(readDiceTrayDice(rollDice({ expression: "2d10+1d6" }, always(2)))).toEqual([
      { sides: 10, value: 3 },
      { sides: 10, value: 3 },
      { sides: 6, value: 3 }
    ]);
  });

  const roll: DiceTrayRoll = { id: 1, seed: 7, dice: [{ sides: 20, value: 17 }] };

  function render(loader: () => Promise<typeof import("./tray/DiceTray.js")>, props: { stageLayer?: "overlay" | "overlay-fullscreen"; fallback?: "hint" | "silent" } = {}) {
    const { DiceTraySlot } = createDiceTraySlot(loader);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<DiceTraySlot roll={roll} {...props} />));
  }

  it("holds the tray's place while the module loads, then hands the roll to the tray", async () => {
    let resolve!: (module: typeof import("./tray/DiceTray.js")) => void;
    const received: DiceTrayRoll[] = [];
    render(() => new Promise((done) => { resolve = done; }));
    // 占位与舞台一样挂在 body 下
    expect(document.querySelector('.workbench-dice__tray[data-dice-state="loading"]')?.parentElement).toBe(document.body);
    await act(async () => {
      resolve({ DiceTray: (props: { roll: DiceTrayRoll }) => { received.push(props.roll); return <div data-testid="tray" />; } });
    });
    expect(container!.querySelector('[data-testid="tray"]')).not.toBeNull();
    expect(document.querySelector('[data-dice-state="loading"]')).toBeNull();
    expect(received.at(-1)).toBe(roll);
  });

  it("says so and how to recover when the module cannot be loaded, without holding the tray's place", async () => {
    render(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
    await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    expect(document.querySelector(".workbench-dice__tray")).toBeNull();
    expect(container!.textContent).toContain("3D 演示没有加载出来");
    expect(container!.textContent).toContain("刷新页面后再试");
  });

  // #360 A5：结果本来就在调用方（Shaggai 的工具卡）里时，加载失败或没有 WebGL 都不在这里插一句会放错位置的话
  it("renders nothing on a failed load when the caller shows the result elsewhere", async () => {
    render(() => Promise.reject(new Error("Failed to fetch dynamically imported module")), { fallback: "silent" });
    await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    expect(container!.textContent).toBe("");
    expect(document.querySelector(".workbench-dice__tray")).toBeNull();
  });

  it("renders nothing instead of a misplaced hint when WebGL is unavailable and the fallback is silent", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<DiceTray roll={roll} fallback="silent" />));
    expect(container!.textContent).toBe("");
    act(() => root?.render(<DiceTray roll={roll} />));
    expect(container!.textContent).toContain("WebGL 不可用");
  });

  it("says so when the browser has no WebGL, with the real tray module", async () => {
    // 测试环境（happy-dom）没有 WebGL：真正的托盘建不起渲染器，写明一句、不留空白的托盘
    render(() => import("./tray/DiceTray.js"));
    // 真正的模块要先导入 three.js，等它到了、渲染器建不起来为止（至多 10 秒）
    for (let wait = 0; wait < 200 && !container!.querySelector('[data-dice-state="unavailable"]'); wait += 1) {
      await act(async () => { await new Promise((done) => setTimeout(done, 50)); });
    }
    expect(container!.querySelector('[data-dice-state="unavailable"]')?.textContent).toContain("WebGL 不可用");
    expect(document.querySelector(".workbench-dice__tray")).toBeNull();
  });
});
