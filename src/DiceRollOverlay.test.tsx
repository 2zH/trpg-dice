import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiceRollToolEvent as ToolEvent } from "./toolEvents.js";
import type { DiceTrayRoll } from "./tray/diceStage.js";
import { createDiceRollOverlay, readDiceRollGroups, type DiceRollToolEventSource } from "./DiceRollOverlay.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const diceOutput = {
  displayLabel: "2d6=3+4=7",
  requiresFollowup: true,
  notation: "2d6",
  sides: 6,
  count: 2,
  rolls: [3, 4],
  groups: [{ notation: "2d6", sides: 6, count: 2, rolls: [3, 4] }],
  bonuses: [],
  total: 7
};

function createEventSource() {
  const listeners = new Set<(event: ToolEvent) => void>();
  return {
    subscribeToolEvents(listener: (event: ToolEvent) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(event: ToolEvent) {
      for (const listener of [...listeners]) listener(event);
    },
    get listenerCount() { return listeners.size; }
  } satisfies DiceRollToolEventSource & { emit(event: ToolEvent): void; listenerCount: number };
}

function runningEvent(toolCallId = "roll-1", toolName = "dice_roll"): ToolEvent {
  return { id: toolCallId, toolCallId, toolName, status: "running", input: { expression: "2d6" } };
}

function doneEvent(output: unknown = diceOutput, toolCallId = "roll-1", toolName = "dice_roll"): ToolEvent {
  return { id: toolCallId, toolCallId, toolName, status: "done", output: { toolCallId, toolName, output } };
}

let lastStageLayer: string | undefined;

function RecordingTray(props: { roll: DiceTrayRoll; stageLayer?: string }) {
  lastStageLayer = props.stageLayer;
  return <div data-testid="tray" data-roll-id={props.roll.id}>{props.roll.dice.map((die) => `${die.sides}:${die.value}`).join(",")}</div>;
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

let trayLoads: number[] = [];

function render(source: DiceRollToolEventSource) {
  trayLoads = [];
  const Overlay = createDiceRollOverlay(RecordingTray, () => { trayLoads.push(1); return Promise.resolve({}); });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Overlay runtime={source} />));
}

describe("readDiceRollGroups (#360 A5)", () => {
  it("reads the groups the tray needs from a dice_roll output", () => {
    expect(readDiceRollGroups(diceOutput)).toEqual({ groups: [{ sides: 6, rolls: [3, 4] }] });
  });

  it("rejects outputs that are not a roll, point past the face, or exceed the tool's die limit", () => {
    expect(readDiceRollGroups(undefined)).toBeNull();
    expect(readDiceRollGroups({ groups: [] })).toBeNull();
    expect(readDiceRollGroups({ groups: [{ sides: 6, rolls: [7] }] })).toBeNull();
    expect(readDiceRollGroups({ groups: [{ sides: 6, rolls: [0] }] })).toBeNull();
    expect(readDiceRollGroups({ groups: [{ sides: 1, rolls: [1] }] })).toBeNull();
    expect(readDiceRollGroups({ groups: [{ sides: 6, rolls: ["3"] }] })).toBeNull();
    expect(readDiceRollGroups({ groups: Array.from({ length: 2 }, () => ({ sides: 6, rolls: [1] })) })).not.toBeNull();
    expect(readDiceRollGroups({ groups: Array.from({ length: 101 }, () => ({ sides: 6, rolls: [1] })) })).toBeNull();
  });
});

describe("Shaggai dice roll overlay (#360 A5)", () => {
  it("plays the tray when a dice_roll the panel saw start completes", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent()));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
    act(() => source.emit(doneEvent()));
    const tray = container!.querySelector("[data-testid=tray]");
    expect(tray?.getAttribute("data-roll-id")).toBe("1");
    expect(tray?.textContent).toBe("6:3,6:4");
  });

  it("starts fetching the 3D chunk when the roll starts, not only when it finishes", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent()));
    expect(trayLoads).toHaveLength(1);
    act(() => source.emit(doneEvent()));
    expect(trayLoads).toHaveLength(1);
  });

  it("does not replay a dice_roll that finished before the panel subscribed", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(doneEvent()));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
  });

  it("ignores other tools, and dice_roll events that failed or were cancelled", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent("other-1", "describe_entity")));
    act(() => source.emit(doneEvent(diceOutput, "other-1", "describe_entity")));
    act(() => source.emit(runningEvent("roll-error")));
    act(() => source.emit({ id: "roll-error", toolCallId: "roll-error", toolName: "dice_roll", status: "error", errorText: "boom" }));
    act(() => source.emit(runningEvent("roll-cancelled")));
    act(() => source.emit({ id: "roll-cancelled", toolCallId: "roll-cancelled", toolName: "dice_roll", status: "cancelled" }));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
  });

  it("stays silent for a roll the tray cannot act out or an output it cannot read", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent("roll-d2")));
    act(() => source.emit(doneEvent({ groups: [{ sides: 2, rolls: [1] }] }, "roll-d2")));
    act(() => source.emit(runningEvent("roll-malformed")));
    act(() => source.emit(doneEvent({ groups: [{ sides: 6, rolls: [9] }] }, "roll-malformed")));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
  });

  it("replaces the tray with each new roll and stops listening after unmount", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent("roll-a")));
    act(() => source.emit(doneEvent(diceOutput, "roll-a")));
    expect(container!.querySelector("[data-testid=tray]")?.textContent).toBe("6:3,6:4");
    act(() => source.emit(runningEvent("roll-b")));
    act(() => source.emit(doneEvent({ groups: [{ sides: 20, rolls: [17] }] }, "roll-b")));
    const second = container!.querySelector("[data-testid=tray]");
    expect(second?.getAttribute("data-roll-id")).toBe("2");
    expect(second?.textContent).toBe("20:17");
    act(() => root?.unmount());
    root = undefined;
    expect(source.listenerCount).toBe(0);
  });

  it("clears the old dice as soon as a later roll starts, even when that roll cannot be shown", () => {
    const source = createEventSource();
    render(source);
    act(() => source.emit(runningEvent("roll-a")));
    act(() => source.emit(doneEvent(diceOutput, "roll-a")));
    expect(container!.querySelector("[data-testid=tray]")).not.toBeNull();
    // 新的一次一开始就撤掉上一批：它演不了或失败时，旧点数不会留在台面上冒充这次的结果
    act(() => source.emit(runningEvent("roll-b")));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
    act(() => source.emit(doneEvent({ groups: [{ sides: 2, rolls: [1] }] }, "roll-b")));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
    act(() => source.emit(runningEvent("roll-c")));
    act(() => source.emit({ id: "roll-c", toolCallId: "roll-c", toolName: "dice_roll", status: "error", errorText: "boom" }));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
  });

  it("moves the stage to the high layer only while the panel is fullscreen", () => {
    const source = createEventSource();
    const Overlay = createDiceRollOverlay(RecordingTray, () => Promise.resolve({}));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<Overlay runtime={source} fullscreen={false} />));
    act(() => source.emit(runningEvent()));
    act(() => source.emit(doneEvent()));
    expect(lastStageLayer).toBe("overlay");
    act(() => root?.render(<Overlay runtime={source} fullscreen />));
    expect(lastStageLayer).toBe("overlay-fullscreen");
  });

  it("clears the table when the active conversation changes", () => {
    const first = createEventSource();
    const Overlay = createDiceRollOverlay(RecordingTray, () => Promise.resolve({}));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<Overlay runtime={first} />));
    act(() => first.emit(runningEvent()));
    act(() => first.emit(doneEvent()));
    expect(container!.querySelector("[data-testid=tray]")).not.toBeNull();
    const second = createEventSource();
    act(() => root?.render(<Overlay runtime={second} />));
    expect(container!.querySelector("[data-testid=tray]")).toBeNull();
    expect(first.listenerCount).toBe(0);
  });
});
