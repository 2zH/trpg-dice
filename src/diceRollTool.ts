import { parseDiceRollInput } from "./parseDiceRollInput.js";
import { rollDice, type DiceRollPayload } from "./rollDice.js";
import { diceRollToolMetadata } from "./toolMetadata.js";

/** Framework-neutral JSON Schema; runtime validation also checks expression limits. */
export const diceRollParameters = {
  type: "object",
  properties: {
    expression: { type: "string", minLength: 1, maxLength: 200, description: "NdM dice and non-negative integer bonuses joined with +, e.g. 2d6+1d4+2." },
    sides: { type: "integer", minimum: 2, maximum: 1000 },
    count: { type: "integer", minimum: 1, maximum: 100 }
  },
  oneOf: [
    { required: ["expression"], not: { anyOf: [{ required: ["sides"] }, { required: ["count"] }] } },
    { required: ["sides"], not: { required: ["expression"] } }
  ]
} as const;

/** Accepts an object or JSON string, like the original local tool input boundary. */
export function dice_roll(input: unknown): DiceRollPayload {
  return rollDice(parseDiceRollInput(input));
}

export const diceRollTool = {
  ...diceRollToolMetadata,
  parameters: diceRollParameters,
  inputSchema: { parse: parseDiceRollInput },
  execute: dice_roll
};
