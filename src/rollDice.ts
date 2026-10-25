// 掷骰（PRD §10.2）：dock 的骰子面板与 Shaggai 的 dice_roll 工具共用同一套规则，NdM 骰与非负整数加值以 + 连接，至多 100 颗骰、
// 面数 2–1000。不依赖 Shaggai（它按需加载，骰子面板不能从那里导入）；src/features/shaggai/localTools.ts 从这里导入并原样导出。

export interface DiceRollInput {
  expression?: string;
  sides?: number;
  count?: number;
}
export interface DiceRollGroupPayload {
  notation: string;
  sides: number;
  count: number;
  rolls: number[];
}
export interface DiceRollPayload {
  displayLabel: string;
  requiresFollowup: true;
  notation: string;
  sides?: number;
  count: number;
  rolls: number[];
  groups: DiceRollGroupPayload[];
  bonuses: number[];
  total: number;
}

const uint32Range = 0x1_0000_0000;

export function rollDice(
  input: DiceRollInput,
  randomUint32: () => number = secureRandomUint32
): DiceRollPayload {
  const expression = parseDiceExpression(input);
  const rolls: number[] = [];
  const groups: DiceRollGroupPayload[] = [];
  const bonuses: number[] = [];
  const expandedValues: number[] = [];
  for (const term of expression.terms) {
    if (term.kind === "constant") {
      bonuses.push(term.value);
      expandedValues.push(term.value);
      continue;
    }
    const groupRolls = Array.from({ length: term.count }, () => (
      rollFairDie(term.sides, randomUint32)
    ));
    groups.push({
      notation: `${term.count}d${term.sides}`,
      sides: term.sides,
      count: term.count,
      rolls: groupRolls
    });
    rolls.push(...groupRolls);
    expandedValues.push(...groupRolls);
  }
  const total = expandedValues.reduce((sum, value) => sum + value, 0);

  return {
    displayLabel: `${expression.notation}=${expandedValues.join("+")}=${total}`,
    requiresFollowup: true,
    notation: expression.notation,
    ...(groups.length === 1 ? { sides: groups[0]!.sides } : {}),
    count: rolls.length,
    rolls,
    groups,
    bonuses,
    total
  };
}

type ParsedDiceTerm =
  | { kind: "dice"; count: number; sides: number }
  | { kind: "constant"; value: number };

export function parseDiceExpression(input: DiceRollInput): {
  notation: string;
  terms: ParsedDiceTerm[];
} {
  if (input.expression !== undefined) {
    const compact = input.expression.replace(/\s+/gu, "").toLowerCase();
    if (!compact || compact.length > 200) {
      throw new Error("expression must be between 1 and 200 characters");
    }
    const tokens = compact.split("+");
    if (tokens.some((token) => !token)) {
      throw new Error("expression must join dice and bonuses with +");
    }
    const terms = tokens.map(parseDiceExpressionTerm);
    validateDiceExpressionTerms(terms);
    return {
      notation: terms.map(formatDiceExpressionTerm).join("+"),
      terms
    };
  }

  const sides = input.sides;
  const count = input.count ?? 1;
  if (!Number.isInteger(sides) || (sides ?? 0) < 2 || (sides ?? 0) > 1_000) {
    throw new Error("sides must be an integer from 2 to 1000");
  }
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("count must be an integer from 1 to 100");
  }
  return {
    notation: `${count}d${sides}`,
    terms: [{ kind: "dice", count, sides: sides! }]
  };
}

function parseDiceExpressionTerm(token: string): ParsedDiceTerm {
  const dice = token.match(/^(\d*)d(\d+)$/u);
  if (dice) {
    return {
      kind: "dice",
      count: dice[1] ? Number(dice[1]) : 1,
      sides: Number(dice[2])
    };
  }
  if (/^\d+$/u.test(token)) {
    return { kind: "constant", value: Number(token) };
  }
  throw new Error("expression supports only NdM dice and non-negative integer bonuses joined with +");
}

function validateDiceExpressionTerms(terms: ParsedDiceTerm[]): void {
  const diceTerms = terms.filter((term): term is Extract<ParsedDiceTerm, { kind: "dice" }> => (
    term.kind === "dice"
  ));
  if (diceTerms.length === 0) throw new Error("expression must include at least one die");
  if (terms.length > 100) throw new Error("expression must contain at most 100 terms");
  if (diceTerms.some((term) => (
    !Number.isInteger(term.count)
    || term.count < 1
    || !Number.isInteger(term.sides)
    || term.sides < 2
    || term.sides > 1_000
  ))) {
    throw new Error("each dice term must use 1 to 100 dice with 2 to 1000 sides");
  }
  const totalDice = diceTerms.reduce((sum, term) => sum + term.count, 0);
  if (totalDice > 100) throw new Error("expression must roll at most 100 dice");
  if (terms.some((term) => (
    term.kind === "constant"
    && (!Number.isSafeInteger(term.value) || term.value > 1_000_000)
  ))) {
    throw new Error("each bonus must be an integer from 0 to 1000000");
  }
}

function formatDiceExpressionTerm(term: ParsedDiceTerm): string {
  return term.kind === "dice" ? `${term.count}d${term.sides}` : String(term.value);
}

function rollFairDie(sides: number, randomUint32: () => number): number {
  const rejectionLimit = Math.floor(uint32Range / sides) * sides;
  let value: number;
  do {
    value = randomUint32();
    if (!Number.isInteger(value) || value < 0 || value >= uint32Range) {
      throw new Error("random source must return an unsigned 32-bit integer");
    }
  } while (value >= rejectionLimit);
  return value % sides + 1;
}

function secureRandomUint32(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!;
}
