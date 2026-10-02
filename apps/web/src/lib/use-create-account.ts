import { useQueryClient } from "@tanstack/react-query";
import type { NewAccountValues } from "@/components/account-forms";
import { accountsQueryOptions } from "./accounts";
import { $api } from "./api";
import { apiErrorMessage } from "./budgets";
import { categoriesQueryOptions } from "./categories";
import { todayIso } from "./dates";
import { invalidateMonths } from "./months";

/**
 * Creates an account dated the user's today and refreshes what it touches (the account list and,
 * for credit accounts, the categories). Resolves to the new account's id, or an error message.
 */
export function useCreateAccount(budgetId: string) {
  const queryClient = useQueryClient();
  const create = $api.useMutation("post", "/v1/budgets/{budgetId}/accounts");
  return async (values: NewAccountValues): Promise<{ id: string } | { error: string }> => {
    try {
      const created = await create.mutateAsync({
        params: { path: { budgetId } },
        body: { ...values, date: todayIso() },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budgetId).queryKey }),
        queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budgetId).queryKey }),
        invalidateMonths(queryClient),
      ]);
      return { id: created.id };
    } catch (error) {
      return { error: apiErrorMessage(error, "Couldn't add the account.") };
    }
  };
}
