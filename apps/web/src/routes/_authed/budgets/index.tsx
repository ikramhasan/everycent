import { formatDate } from "@everycent/engine";
import { Alert, AlertTitle } from "@everycent/ui/components/alert";
import { Button } from "@everycent/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@everycent/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everycent/ui/components/empty";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { z } from "zod";
import { currencyName } from "@/components/currency-picker";
import { type Budget, budgetsQueryOptions, lastUsedLabel } from "@/lib/budgets";

export const Route = createFileRoute("/_authed/budgets/")({
  // A category template on its way to a budget (the import dialog's "Choose Another Budget"):
  // the budget opened, or created, next shows its import dialog (YNAB, 2026-10-16).
  validateSearch: z.object({ template: z.string().optional().catch(undefined) }),
  component: AllBudgetsPage,
});

function AllBudgetsPage() {
  const budgets = useQuery(budgetsQueryOptions());
  const { template } = Route.useSearch();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">All budgets</h1>
        <Button asChild>
          <Link to="/budgets/new" search={{ template }}>
            <Plus /> New budget
          </Link>
        </Button>
      </div>
      {template && (
        <p className="text-muted-foreground text-sm">
          Open a budget, or create a new one, to import the category template into it.
        </p>
      )}
      {budgets.isPending ? (
        <Skeleton className="h-24" />
      ) : budgets.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load your budgets.</AlertTitle>
        </Alert>
      ) : budgets.data.budgets.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No budgets yet</EmptyTitle>
            <EmptyDescription>Create one to start giving every dollar a job.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/*
           * YNAB's plan list: "Your Plans", then "Plans Shared With You", most recently used
           * first (the API's order). Archived budgets are among them, their names stamped
           * "(Archived on …)" (YNAB, 2026-10-15).
           */}
          <BudgetGrid
            budgets={budgets.data.budgets.filter((b) => b.role === "owner")}
            template={template}
          />
          <section className="grid gap-3">
            <h2 className="font-medium text-muted-foreground text-sm">Budgets shared with you</h2>
            {budgets.data.budgets.some((b) => b.role !== "owner") ? (
              <BudgetGrid
                budgets={budgets.data.budgets.filter((b) => b.role !== "owner")}
                template={template}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No budgets have been shared with you yet.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BudgetGrid({ budgets, template }: { budgets: Budget[]; template?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {budgets.map((b) => (
        <Link
          key={b.id}
          to="/budgets/$budgetId"
          params={{ budgetId: b.id }}
          search={{ template }}
          preload={false}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle className="truncate">{b.name}</CardTitle>
              <CardDescription>
                {b.currency} · {currencyName(b.currency)}
              </CardDescription>
              <CardDescription>
                {b.role === "owner" ? "Owner" : "Shared with you"} · Created{" "}
                {formatDate(b.createdAt.slice(0, 10), b.dateFormat)}
              </CardDescription>
              {b.lastUsedAt && <CardDescription>{lastUsedLabel(b.lastUsedAt)}</CardDescription>}
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
