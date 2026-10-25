import { parseRecord, readOptionalPositiveInteger } from "./inputValues.js";
import { type DiceRollInput, parseDiceExpression } from "./rollDice.js";


export function parseDiceRollInput(input: unknown): DiceRollInput {
  const record = parseRecord(input);
  if (record.expression !== undefined) {
    if (typeof record.expression !== "string" || !record.expression.trim()) {
      throw new Error("expression must be a non-empty string");
    }
    if (record.sides !== undefined || record.count !== undefined) {
      throw new Error("provide either expression or sides/count, not both");
    }
    const parsed = { expression: record.expression.trim() };
    parseDiceExpression(parsed);
    return parsed;
  }
  const sides = readOptionalPositiveInteger(record, "sides");
  if (sides === undefined) throw new Error("sides is required");
  const count = readOptionalPositiveInteger(record, "count") ?? 1;
  if (sides > 1_000) throw new Error("sides must be an integer from 2 to 1000");
  if (sides < 2) throw new Error("sides must be an integer from 2 to 1000");
  if (count > 100) throw new Error("count must be an integer from 1 to 100");
  const parsed = { sides, count };
  parseDiceExpression(parsed);
  return parsed;
}
