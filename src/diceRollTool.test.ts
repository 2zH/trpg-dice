import { describe, expect, it } from "vitest";
import { dice_roll, diceRollTool } from "./diceRollTool.js";
import { parseDiceRollInput } from "./parseDiceRollInput.js";
import { rollDice } from "./rollDice.js";

describe("standalone dice_roll boundary", () => {
  it("accepts JSON and the original numeric-string inputs", () => {
    expect(parseDiceRollInput('{"sides":"20","count":"2"}')).toEqual({ sides: 20, count: 2 });
    const result = diceRollTool.execute({ expression: "2d6+1d4+2" });
    expect(result.count).toBe(3);
    expect(result.total).toBe(result.rolls.reduce((a, b) => a + b, 2));
    expect(result.rolls.every((n, i) => n >= 1 && n <= (i === 2 ? 4 : 6))).toBe(true);
  });
  it.each([null, [], "bad", {}, { sides: 1 }, { sides: 1001 }, { sides: 6, count: 101 },
    { expression: "d20", sides: 20 }, { expression: 20 }, { expression: "" },
    { expression: "1d6-2" }, { expression: "101d6" }, { expression: "50d6+51d4" },
    { expression: "1d6+1000001" }, { expression: "2" }, { expression: "d6++2" }
  ])("rejects invalid or conflicting input %j", input => {
    expect(() => dice_roll(input)).toThrow();
  });
  it("keeps the 100-die boundary and rejects invalid random-source values", () => {
    expect(rollDice({ expression: "100d1000" }, () => 999).total).toBe(100000);
    for (const n of [-1, 0x1_0000_0000, 0.5, NaN]) {
      expect(() => rollDice({ sides: 6 }, () => n)).toThrow("unsigned 32-bit integer");
    }
  });
});
