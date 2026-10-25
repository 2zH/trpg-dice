import { describe, expect, it } from "vitest";
import { rollDice } from "./rollDice.js";
describe("extracted rollDice", () => {
  it("rolls generic dice with replayable values and no ruleset mapping", () => {
    const values = [0xffff_ffff, 0, 5];
    const result = rollDice({ sides: 6, count: 2 }, () => values.shift()!);

    expect(result).toEqual({
      displayLabel: "2d6=1+6=7",
      requiresFollowup: true,
      notation: "2d6",
      sides: 6,
      count: 2,
      rolls: [1, 6],
      groups: [{ notation: "2d6", sides: 6, count: 2, rolls: [1, 6] }],
      bonuses: [],
      total: 7
    });
  });

  it("rolls mixed dice expressions and renders the expanded arithmetic", () => {
    const values = [1, 1, 2];
    const result = rollDice({ expression: "2d6 + 1d4 + 2" }, () => values.shift()!);

    expect(result).toEqual({
      displayLabel: "2d6+1d4+2=2+2+3+2=9",
      requiresFollowup: true,
      notation: "2d6+1d4+2",
      count: 3,
      rolls: [2, 2, 3],
      groups: [
        { notation: "2d6", sides: 6, count: 2, rolls: [2, 2] },
        { notation: "1d4", sides: 4, count: 1, rolls: [3] }
      ],
      bonuses: [2],
      total: 9
    });
  });

});
