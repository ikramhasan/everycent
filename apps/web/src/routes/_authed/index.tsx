import { formatMoney, zero } from "@everycent/engine";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@everycent/ui/components/card";
import { Skeleton } from "@everycent/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { $api } from "@/lib/api";

export const Route = createFileRoute("/_authed/")({
  component: BudgetPage,
});

function BudgetPage() {
  const me = $api.useQuery("get", "/v1/me");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Budget</h1>
        <div className="text-muted-foreground">
          {me.isPending ? (
            <Skeleton className="mt-1 h-5 w-48" />
          ) : me.isError ? (
            "Couldn't load your profile."
          ) : (
            `Welcome, ${me.data.name}.`
          )}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Ready to Assign</CardDescription>
          <CardTitle className="text-4xl tabular-nums">{formatMoney(zero("USD"))}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Every cent needs a job. Accounts and categories are coming next.
        </CardContent>
      </Card>
    </div>
  );
}
