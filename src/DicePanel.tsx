import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { DiceTraySlot, loadDiceTray, readDiceTrayDice } from "./DiceTraySlot.js";
import { rollDice, type DiceRollPayload } from "./rollDice.js";
import type { DiceTrayRoll } from "./tray/diceStage.js";

// 骰子（PRD §10.2、DOCK-4，决定 10）：表达式规则与 Shaggai 的 dice_roll 相同。结果只在这个面板的组件状态里，最多 50 条；
// 不写工作区、布局文档或 localStorage，不同步、不发给 Shaggai，面板卸载（关闭、切换标签、刷新）即清空。
// 最近一次掷骰演成 3D 落桌（#315，DiceTraySlot）：点数仍是 rollDice 算的，托盘只负责演出来；演不了的掷骰只出文字结果。
const commonDice = [4, 6, 8, 10, 12, 20, 100] as const;
export const diceResultLimit = 50;

interface DiceResult {
  id: number;
  expression: string;
  roll: DiceRollPayload;
  /** 能演成落桌时的骰子与点数；种子在掷的时候定下，重新渲染不会换一种落法 */
  tray: DiceTrayRoll | null;
}

export function DicePanel(props: { autoFocus?: boolean }) {
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly DiceResult[]>([]);
  const nextIdRef = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const autoFocus = props.autoFocus === true;
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  // 打开面板就开始下载 3D 托盘，第一次掷骰不用等
  useEffect(() => {
    loadDiceTray().catch(() => undefined);
  }, []);

  const roll = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      const result = rollDice({ expression: trimmed });
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      const trayDice = readDiceTrayDice(result);
      const tray = trayDice ? { id, seed: crypto.getRandomValues(new Uint32Array(1))[0]!, dice: trayDice } : null;
      setResults((current) => [{ id, expression: trimmed, roll: result, tray }, ...current].slice(0, diceResultLimit));
      setError(null);
    } catch {
      setError("只支持 NdM 骰与非负整数加值，用 + 连接；至多 100 颗骰，面数 2–1000");
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    roll(expression);
  };
  const latest = results[0];

  return (
    <div className="application-route-content workbench-tool workbench-dice">
      <h1 className="workbench-tool__title">骰子</h1>
      <form className="workbench-dice__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={`${idPrefix}-expression`}>掷骰表达式</label>
        <input
          aria-describedby={error ? `${idPrefix}-error` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="workbench-dice__input"
          id={`${idPrefix}-expression`}
          onChange={(event) => setExpression(event.currentTarget.value)}
          placeholder="例如 2d6+1d4+2"
          ref={inputRef}
          value={expression}
        />
        <button className="workbench-dice__roll" type="submit">掷骰</button>
      </form>
      {error ? <p className="workbench-dice__error" id={`${idPrefix}-error`} role="alert">{error}</p> : null}
      <ul aria-label="常用骰" className="workbench-dice__common">
        {commonDice.map((sides) => (
          <li key={sides}>
            <button className="workbench-dice__die" onClick={() => roll(`1d${sides}`)} type="button">d{sides}</button>
          </li>
        ))}
      </ul>
      {latest?.tray ? <DiceTraySlot roll={latest.tray} /> : null}
      {latest && !latest.tray && latest.roll.count > 0 ? (
        <p className="workbench-tool__hint">这次没有 3D 演示：只演示 d4、d6、d8、d10、d12、d20 与 d100（两颗 d10）</p>
      ) : null}
      <p aria-live="polite" className="sr-only">{latest ? `${latest.roll.notation} 掷出 ${latest.roll.total}` : ""}</p>
      {results.length > 0 ? (
        <ol aria-label="掷骰结果" className="workbench-dice__results">
          {results.map((result) => (
            <li className="workbench-dice__result" key={result.id}>
              <span className="workbench-dice__notation">{result.roll.notation}</span>
              <span className="workbench-dice__detail">{result.roll.displayLabel}</span>
              <span className="workbench-dice__total">{result.roll.total}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="workbench-tool__hint">结果只留在这个面板里，关闭面板或刷新页面后清空</p>
      )}
    </div>
  );
}
