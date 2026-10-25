/** Structural subset of the original Shaggai ToolEvent; no agent runtime required. */
export interface DiceRollToolEvent {
  id: string;
  toolCallId: string;
  toolName: string;
  status: "running" | "done" | "error" | "cancelled";
  input?: unknown;
  output?: { toolCallId: string; toolName: string; output: unknown };
  errorText?: string;
}
