import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { SidebarMenuButton } from "@everycent/ui/components/sidebar";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDown, LayoutGrid, Plus, Wallet } from "lucide-react";
import type { Budget } from "@/lib/budgets";

export function BudgetSwitcher({
  budgets,
  currentBudgetId,
}: {
  budgets: readonly Budget[];
  currentBudgetId: string | undefined;
}) {
  const current = budgets.find((b) => b.id === currentBudgetId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" aria-label="Switch budget">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{current?.name ?? "Select a budget"}</span>
            <span className="truncate text-muted-foreground text-xs">
              {current ? current.currency : "everycent"}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel className="text-muted-foreground text-xs">Budgets</DropdownMenuLabel>
        {budgets.map((b) => (
          <DropdownMenuItem key={b.id} asChild>
            {/* No preload: opening a budget records it as last-used. */}
            <Link to="/budgets/$budgetId" params={{ budgetId: b.id }} preload={false}>
              <span className="truncate">{b.name}</span>
              {b.id === currentBudgetId && <CheckIcon className="ml-auto" />}
            </Link>
          </DropdownMenuItem>
        ))}
        {budgets.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem asChild>
          <Link to="/budgets/new">
            <Plus /> New budget
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/budgets">
            <LayoutGrid /> View all budgets
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
