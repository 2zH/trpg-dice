import { useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { DicePanel, DiceRollOverlay, type DiceRollToolEvent } from "../src/index.js";
import { diceRollTool, type DiceRollPayload } from "../src/core.js";
import "../src/styles.css";
import "./style.css";

const listeners = new Set<(event: DiceRollToolEvent) => void>();
const runtime = {
  subscribeToolEvents(listener: (event: DiceRollToolEvent) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};
const emit = (event: DiceRollToolEvent) => { for (const listener of listeners) listener(event); };

function ToolDemo() {
  const [input, setInput] = useState('{"expression":"2d6+1d4+2"}');
  const [result, setResult] = useState<DiceRollPayload | null>(null);
  const [error, setError] = useState("");
  const execute = (event: FormEvent) => {
    event.preventDefault();
    const toolCallId = crypto.randomUUID();
    const base = { id: toolCallId, toolCallId, toolName: "dice_roll" };
    emit({ ...base, status: "running", input });
    try {
      const output = diceRollTool.execute(input);
      setResult(output);
      setError("");
      emit({ ...base, status: "done", output: { toolCallId, toolName: "dice_roll", output } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResult(null);
      emit({ ...base, status: "error", errorText: message });
    }
  };
  return <section className="tool-demo">
    <h1>dice_roll 工具</h1>
    <p>输入 JSON，直接执行独立工具；返回的点数驱动同一套 3D 骰子。</p>
    <form onSubmit={execute}>
      <label htmlFor="tool-input">工具参数</label>
      <textarea id="tool-input" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} rows={4} />
      <button type="submit">执行 dice_roll</button>
    </form>
    {error && <p role="alert" className="workbench-dice__error">{error}</p>}
    {result && <><p className="tool-result" aria-live="polite">{result.displayLabel}</p><details open><summary>工具返回 JSON</summary><pre>{JSON.stringify(result, null, 2)}</pre></details></>}
    <DiceRollOverlay runtime={runtime} />
  </section>;
}

function App() {
  const [tab, setTab] = useState("manual");
  return <main>
    <header><a className="wordmark" href="./">TRPG DICE</a><a href="https://github.com/2zH/trpg-dice">GitHub ↗</a></header>
    <div className="intro"><span className="eyebrow">从 trpg-editor 独立提取</span><h1>让骰子落在桌上。</h1><p>公平掷骰 · 3D 物理回放 · 可独立调用的 dice_roll</p></div>
    <nav aria-label="演示模式">
      <button aria-pressed={tab === "manual"} onClick={() => setTab("manual")}>手动掷骰</button>
      <button aria-pressed={tab === "tool"} onClick={() => setTab("tool")}>工具调用</button>
    </nav>
    {tab === "manual" ? <DicePanel /> : <ToolDemo />}
    <footer>3D 支持 d4 / d6 / d8 / d10 / d12 / d20 / d100。点数先由安全随机数生成，动画按结果回放。<br />仅支持加号连接；最多 100 颗骰。结果只保留在本次页面中。</footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
