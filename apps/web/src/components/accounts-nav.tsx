import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { formatAmount, money } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@everycent/ui/components/dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@everycent/ui/components/sidebar";
import { cn } from "@everycent/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type Account,
  accountsQueryOptions,
  type SidebarSection,
  sidebarSections,
} from "@/lib/accounts";
import { $api } from "@/lib/api";
import { apiErrorMessage, type Budget } from "@/lib/budgets";
import { categoriesQueryOptions, nextId } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { AddAccountForm, type NewAccountValues } from "./account-forms";

/** YNAB's account list in the sidebar: sections by type with totals, drag to reorder. */
export function AccountsNav({ budget }: { budget: Budget }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQueryOptions(budget.id));
  const moveAccount = $api.useMutation("post", "/v1/budgets/{budgetId}/accounts/{accountId}/move");
  const createAccount = $api.useMutation("post", "/v1/budgets/{budgetId}/accounts");
  const [adding, setAdding] = useState(false);

  const serverSections = useMemo(
    () => sidebarSections(accounts.data?.accounts ?? []),
    [accounts.data],
  );
  // Local order per section so a drag shows immediately.
  const [order, setOrder] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setOrder(Object.fromEntries(serverSections.map((s) => [s.id, s.accounts.map((a) => a.id)])));
  }, [serverSections]);

  const byId = useMemo(
    () => new Map((accounts.data?.accounts ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );
  const format = (minorUnits: bigint) => formatAmount(money(minorUnits, budget.currency), budget);

  async function handleAdd(values: NewAccountValues) {
    try {
      const created = await createAccount.mutateAsync({
        params: { path: { budgetId: budget.id } },
        body: { ...values, date: todayIso() },
      });
      await queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budget.id).queryKey });
      await queryClient.invalidateQueries({ queryKey: categoriesQueryOptions(budget.id).queryKey });
      setAdding(false);
      await navigate({
        to: "/budgets/$budgetId/accounts/$accountId",
        params: { budgetId: budget.id, accountId: created.id },
      });
      return null;
    } catch (error) {
      return apiErrorMessage(error, "Couldn't add the account.");
    }
  }

  async function handleMove(accountId: string, beforeAccountId: string | null) {
    try {
      const result = await moveAccount.mutateAsync({
        params: { path: { budgetId: budget.id, accountId } },
        body: { beforeAccountId },
      });
      queryClient.setQueryData(accountsQueryOptions(budget.id).queryKey, result);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't move the account."));
      await queryClient.invalidateQueries({ queryKey: accountsQueryOptions(budget.id).queryKey });
    }
  }

  return (
    <>
      <DragDropProvider
        onDragOver={(event) => {
          const section = event.operation.source?.data?.section as string | undefined;
          if (!section) return;
          setOrder((o) => ({ ...o, [section]: move(o[section] ?? [], event) }));
        }}
        onDragEnd={(event) => {
          const source = event.operation.source;
          if (event.canceled || !source) {
            setOrder(
              Object.fromEntries(serverSections.map((s) => [s.id, s.accounts.map((a) => a.id)])),
            );
            return;
          }
          const id = String(source.id);
          const section = source.data?.section as string;
          const now = order[section] ?? [];
          const was = serverSections.find((s) => s.id === section)?.accounts.map((a) => a.id) ?? [];
          if (nextId(now, id) !== nextId(was, id)) void handleMove(id, nextId(now, id));
        }}
      >
        {serverSections.map((section) => (
          <AccountSection
            key={section.id}
            section={section}
            ids={order[section.id] ?? section.accounts.map((a) => a.id)}
            byId={byId}
            budgetId={budget.id}
            format={format}
          />
        ))}
      </DragDropProvider>

      <SidebarGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="justify-start"
        >
          <Plus /> Add Account
        </Button>
      </SidebarGroup>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              Enter today's balance; everycent records it as the account's starting balance.
            </DialogDescription>
          </DialogHeader>
          <AddAccountForm settings={budget} onSubmit={handleAdd} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountSection({
  section,
  ids,
  byId,
  budgetId,
  format,
}: {
  section: SidebarSection;
  ids: string[];
  byId: Map<string, Account>;
  budgetId: string;
  format: (minorUnits: bigint) => string;
}) {
  const [open, setOpen] = useState(section.id !== "closed");
  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          <span className="uppercase tracking-wide">{section.title}</span>
          {section.id !== "closed" && (
            <span className="ml-auto tabular-nums">{format(section.total)}</span>
          )}
        </button>
      </SidebarGroupLabel>
      {open && (
        <SidebarGroupContent>
          <SidebarMenu>
            {ids.map((id, index) => {
              const account = byId.get(id);
              return account ? (
                <AccountItem
                  key={id}
                  account={account}
                  index={index}
                  section={section.id}
                  budgetId={budgetId}
                  format={format}
                />
              ) : null;
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

function AccountItem({
  account,
  index,
  section,
  budgetId,
  format,
}: {
  account: Account;
  index: number;
  section: string;
  budgetId: string;
  format: (minorUnits: bigint) => string;
}) {
  const { ref, isDragSource } = useSortable({
    id: account.id,
    index,
    group: section,
    type: `account-${section}`,
    accept: [`account-${section}`],
    data: { section },
  });
  const working = BigInt(account.balances.working);
  return (
    <SidebarMenuItem ref={ref} className={cn(isDragSource && "opacity-60")}>
      <SidebarMenuButton asChild>
        <Link
          to="/budgets/$budgetId/accounts/$accountId"
          params={{ budgetId, accountId: account.id }}
          activeProps={{ "data-active": true }}
        >
          <span className="truncate">{account.name}</span>
        </Link>
      </SidebarMenuButton>
      {/* `!` beats the sidebar's active-item colour so money owed always reads red, as in YNAB. */}
      <SidebarMenuBadge className={cn("tabular-nums", working < 0n && "text-destructive!")}>
        {format(working)}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}
