export const diceRollToolMetadata = {
  name: "dice_roll" as const,
  description: "Roll one or more fair dice locally and return the recorded results. This tool provides randomness only; resolve each result against the active RulePackage references.",
  readOnly: true,
  mutates: false,
  scope: "random",
  tags: ["dice", "random", "read"],
  inputExample: { expression: "2d6+1d4+2" },
  planning: {
    purpose: "Use when an activated guide or another authoritative source requires a dice roll, or when the user explicitly asks the Agent to roll.",
    input: "Provide either expression (for example 2d6+1d4+2) or sides/count for one dice pool. Expressions support NdM dice and non-negative integer bonuses joined with +. At most 100 dice may be rolled; sides must be from 2 to 1000.",
    sequencing: "Read the governing rule first, then roll exactly the required dice. Preserve the returned values in the conversation and map them only with the cited RulePackage table. Never reroll a resolved checkpoint unless the source or user explicitly authorizes a reroll."
  },
  labels: {
    running: "正在掷骰",
    done: "已完成掷骰",
    error: "掷骰失败"
  }
};
