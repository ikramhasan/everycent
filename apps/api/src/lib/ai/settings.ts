import type { Env } from "../../env";
import type { BudgetRow } from "../budget-access";
import { AppError } from "../errors";

/** Why the in-app AI features can't be turned on; null when they can. */
export type AiUnavailableReason = "NOT_CONFIGURED";

export function aiUnavailableReason(env: Env): AiUnavailableReason | null {
  return env.AI_API_KEY ? null : "NOT_CONFIGURED";
}

/** The budget's AI settings as they apply now: nothing is on while the server lacks AI. */
export function aiSettings(env: Env, b: Pick<BudgetRow, "aiEnabled" | "aiAssistantButton">) {
  const unavailableReason = aiUnavailableReason(env);
  const enabled = unavailableReason === null && b.aiEnabled;
  return {
    available: unavailableReason === null,
    unavailableReason,
    enabled,
    assistantButton: enabled && b.aiAssistantButton,
  };
}

/** Refuses an AI request for a budget that hasn't turned AI on (or a server without AI). */
export function assertAiAllowed(env: Env, b: Pick<BudgetRow, "aiEnabled">) {
  if (aiUnavailableReason(env)) {
    throw new AppError(503, "AI_UNAVAILABLE", "AI features aren't set up on this server.");
  }
  if (!b.aiEnabled) {
    throw new AppError(403, "AI_DISABLED", "AI features are turned off for this budget.");
  }
}
