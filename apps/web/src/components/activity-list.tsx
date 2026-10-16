import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { accountsQueryOptions } from "@/lib/accounts";
import { type ActivityEvent, type ActivityLookups, actorName, describeEvent } from "@/lib/activity";
import { $api } from "@/lib/api";
import { useBudget } from "@/lib/budget-context";
import { categoriesQueryOptions } from "@/lib/categories";
import { sessionQueryOptions } from "@/lib/session";
import { payeesQueryOptions } from "@/lib/transactions";
import { MemberAvatar } from "./member-avatar";

/** Names for an event's ids, from the budget's accounts, categories, payees and members. */
export function useActivityLookups(): ActivityLookups {
  const { budget, formatAmount, formatDate } = useBudget();
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const categories = useQuery(categoriesQueryOptions(budget.id));
  const payees = useQuery(payeesQueryOptions(budget.id));
  const members = $api.useQuery("get", "/v1/budgets/{budgetId}/members", {
    params: { path: { budgetId: budget.id } },
  });
  return useMemo(() => {
    const byId = <T extends { id: string; name: string }>(rows: readonly T[] | undefined) =>
      new Map((rows ?? []).map((r) => [r.id, r.name]));
    const groups = categories.data?.groups ?? [];
    const accountNames = byId(accounts.data?.accounts);
    const categoryNames = byId(groups.flatMap((g) => g.categories));
    const groupNames = byId(groups);
    const payeeNames = byId(payees.data?.payees);
    const memberNames = new Map((members.data?.members ?? []).map((m) => [m.userId, m.name]));
    return {
      account: (id) => accountNames.get(id),
      category: (id) => categoryNames.get(id),
      group: (id) => groupNames.get(id),
      payee: (id) => payeeNames.get(id),
      member: (id) => memberNames.get(id),
      formatAmount,
      formatDate,
      currency: budget.currency,
    } satisfies ActivityLookups;
  }, [accounts.data, categories.data, payees.data, members.data, formatAmount, formatDate, budget]);
}

/** Changes as lines: who, what, and each field before → after. */
export function ActivityList({
  events,
  showTime = true,
}: {
  events: readonly ActivityEvent[];
  showTime?: boolean;
}) {
  const lookups = useActivityLookups();
  const session = useQuery(sessionQueryOptions);
  if (events.length === 0) {
    return <p className="py-6 text-center text-muted-foreground text-sm">No changes yet.</p>;
  }
  return (
    <ol className="grid gap-2">
      {events.map((event) => {
        const line = describeEvent(event, lookups);
        return (
          <li key={event.id} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
            <MemberAvatar
              userId={event.actor?.userId ?? null}
              userName={event.actor ? actorName(event) : null}
              avatarColor={event.actor?.avatarColor ?? null}
              currentUserId={session.data?.user.id}
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <p>
                <strong>{actorName(event)}</strong> {line.action}
                {line.subject && <span className="text-muted-foreground"> · {line.subject}</span>}
              </p>
              {line.changes.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                  {line.changes.map((c) => (
                    <div key={c.label} className="contents">
                      <dt>{c.label}</dt>
                      <dd className="min-w-0 break-words">
                        {c.before !== null && c.after !== null ? (
                          <>
                            <span className="line-through">{c.before}</span> →{" "}
                            <span className="text-foreground">{c.after}</span>
                          </>
                        ) : (
                          <span className="text-foreground">{c.after ?? c.before}</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {showTime && (
              <time
                dateTime={event.at}
                className="shrink-0 text-muted-foreground text-xs tabular-nums"
              >
                {new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
