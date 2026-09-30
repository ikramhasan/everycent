import { suggestFormatSettings } from "@everycent/engine";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BudgetForm, type BudgetFormValues } from "@/components/budget-form";
import { $api } from "@/lib/api";
import { apiErrorMessage, budgetsQueryOptions, invalidateBudgets } from "@/lib/budgets";

export const Route = createFileRoute("/_authed/budgets/new")({
  component: NewBudgetPage,
});

function NewBudgetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const budgets = useQuery(budgetsQueryOptions());
  const create = $api.useMutation("post", "/v1/budgets");
  const [defaults] = useState<BudgetFormValues>(() => ({
    name: "",
    ...suggestFormatSettings(navigator.language),
  }));
  const isFirst = budgets.data?.budgets.length === 0;

  async function handleSubmit(values: BudgetFormValues) {
    try {
      const created = await create.mutateAsync({ body: values });
      await invalidateBudgets(queryClient);
      await navigate({ to: "/budgets/$budgetId", params: { budgetId: created.id } });
      return null;
    } catch (error) {
      return apiErrorMessage(error, "Couldn't create the budget. Try again.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {isFirst ? "Create your first budget" : "New budget"}
          </CardTitle>
          <CardDescription>
            Pick the currency you budget in and how amounts and dates should look. You can change
            the formats later, but not the currency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetForm
            defaultValues={defaults}
            submitLabel="Create budget"
            pendingLabel="Creating…"
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
