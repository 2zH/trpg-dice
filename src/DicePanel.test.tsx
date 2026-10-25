import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DicePanel, diceResultLimit } from "./DicePanel.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<DicePanel />));
}

function unmount() {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
}

function rollExpression(expression: string) {
  const input = container!.querySelector<HTMLInputElement>(".workbench-dice__input")!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, expression);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => container!.querySelector<HTMLFormElement>(".workbench-dice__form")!.requestSubmit());
}

function results(): string[] {
  return Array.from(container?.querySelectorAll(".workbench-dice__notation") ?? []).map((element) => element.textContent ?? "");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  unmount();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

// 骰子面板（#25，PRD §10.2、DOCK-4，决定 10）
describe("dice panel", () => {
  it("rolls an expression and the common dice, newest first, with the dice_roll rules", () => {
    mount();
    rollExpression("2d6 + 2");
    act(() => Array.from(container!.querySelectorAll<HTMLButtonElement>(".workbench-dice__die")).find((button) => button.textContent === "d20")!.click());

    expect(results()).toEqual(["1d20", "2d6+2"]);
    const totals = Array.from(container!.querySelectorAll(".workbench-dice__total")).map((element) => Number(element.textContent));
    expect(totals[0]).toBeGreaterThanOrEqual(1);
    expect(totals[0]).toBeLessThanOrEqual(20);
    expect(totals[1]).toBeGreaterThanOrEqual(4);
    expect(totals[1]).toBeLessThanOrEqual(14);
  });

  it("explains an expression it cannot roll and keeps the earlier results", () => {
    mount();
    rollExpression("1d6");
    rollExpression("2d6*3");
    expect(container!.querySelector('[role="alert"]')?.textContent).toContain("NdM");
    expect(container!.querySelector(".workbench-dice__input")?.getAttribute("aria-invalid")).toBe("true");
    expect(results()).toEqual(["1d6"]);
    rollExpression("101d6");
    expect(results()).toEqual(["1d6"]);
  });

  it("keeps at most 50 results only in the panel: nothing in localStorage or on the network, and a remounted panel starts empty", () => {
    mount();
    for (let index = 0; index < diceResultLimit + 3; index += 1) rollExpression(`1d${(index % 6) + 4}`);
    expect(results()).toHaveLength(diceResultLimit);
    expect(window.localStorage.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();

    unmount();
    mount();
    expect(results()).toEqual([]);
  });

  // #315、#322：最近一次能演的掷骰（d4–d20 与 d100，颗数不限）放上铺满视口的 3D 舞台（挂在 body 下）；演不了的写明原因
  it("shows the latest roll on the 3D stage when it can, and says why when it cannot", () => {
    const tray = () => document.querySelector(".workbench-dice__tray");
    const hint = () => Array.from(container!.querySelectorAll(".workbench-tool__hint")).map((element) => element.textContent).join("");
    mount();
    expect(tray()).toBeNull();
    rollExpression("2d6+1d20");
    expect(tray()).not.toBeNull();
    expect(hint()).not.toContain("没有 3D 演示");
    rollExpression("1d2");
    expect(tray()).toBeNull();
    expect(hint()).toContain("没有 3D 演示");
    // d100 用两颗 d10 演，d4 也能演（#322）
    rollExpression("1d100");
    expect(tray()).not.toBeNull();
    rollExpression("1d4");
    expect(tray()).not.toBeNull();
    // 颗数不设上限（#322）
    rollExpression("100d6");
    expect(tray()).not.toBeNull();
    rollExpression("1d8+1d12+3");
    expect(tray()).not.toBeNull();
  });
});
