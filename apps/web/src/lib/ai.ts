import type { components } from "@everycent/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { $api } from "./api";
import { apiErrorMessage } from "./budgets";

export type AiSettings = components["schemas"]["AiSettings"];
export type AiConversationSummary = components["schemas"]["AiConversationSummary"];

const SETTINGS = "/v1/budgets/{budgetId}/ai" as const;

/** The budget's AI settings (and whether the server can run AI at all). */
export function useAiSettings(budgetId: string | undefined) {
  return $api.useQuery(
    "get",
    SETTINGS,
    { params: { path: { budgetId: budgetId ?? "" } } },
    { enabled: Boolean(budgetId) },
  );
}

/** Changes the budget's AI settings, showing the result at once. */
export function useUpdateAiSettings(budgetId: string) {
  const queryClient = useQueryClient();
  const update = $api.useMutation("patch", SETTINGS);
  const init = { params: { path: { budgetId } } };
  return async (body: { enabled?: boolean; assistantButton?: boolean }) => {
    try {
      const next = await update.mutateAsync({ ...init, body });
      queryClient.setQueryData(["get", SETTINGS, init], next);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't change the AI settings. Try again."));
    }
  };
}

/** Why AI can't be turned on, in words for the settings. */
export function aiUnavailableMessage(reason: AiSettings["unavailableReason"]): string | null {
  switch (reason) {
    case "NOT_CONFIGURED":
      return "AI isn't set up on this everycent server yet. Whoever runs it needs to add an AI key (AI_API_KEY) before AI features can be turned on.";
    case null:
      return null;
  }
}
