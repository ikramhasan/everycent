import { Avatar, AvatarFallback } from "@everycent/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { Separator } from "@everycent/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@everycent/ui/components/sidebar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  Landmark,
  LayoutGrid,
  LogOut,
  Settings,
  UserCog,
  Wallet,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { budgetQueryOptions, budgetsQueryOptions } from "@/lib/budgets";
import { lastViewedMonth } from "@/lib/months";
import { AccountsNav } from "./accounts-nav";
import { BudgetSwitcher } from "./budget-switcher";
import { ModeToggle } from "./mode-toggle";

export function AppShell({ user }: { user: { name: string; email: string } }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { budgetId } = useParams({ strict: false });
  const budgets = useQuery(budgetsQueryOptions());
  // Same query the budget route loads, so this reads the cache rather than fetching again.
  const currentBudget = useQuery({
    ...budgetQueryOptions(budgetId ?? ""),
    enabled: Boolean(budgetId),
  });

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/sign-in" });
  }

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <BudgetSwitcher
                // Archived budgets stay reachable from All budgets, like YNAB's plan list.
                budgets={(budgets.data?.budgets ?? []).filter(
                  (b) => !b.archivedAt || b.id === budgetId,
                )}
                currentBudgetId={budgetId}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {budgetId ? (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link
                        to="/budgets/$budgetId"
                        params={{ budgetId }}
                        // Back to the month last viewed, as YNAB's Plan link does.
                        search={{ month: lastViewedMonth(budgetId) }}
                        activeOptions={{ exact: true, includeSearch: false }}
                        activeProps={{ "data-active": true }}
                      >
                        <Wallet />
                        <span>Budget</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link
                        to="/budgets/$budgetId/accounts"
                        params={{ budgetId }}
                        activeOptions={{ exact: true }}
                        activeProps={{ "data-active": true }}
                      >
                        <Landmark />
                        <span>All Accounts</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link
                        to="/budgets/$budgetId/settings"
                        params={{ budgetId }}
                        activeProps={{ "data-active": true }}
                      >
                        <Settings />
                        <span>Budget settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/budgets" activeProps={{ "data-active": true }}>
                      <LayoutGrid />
                      <span>All budgets</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
          {budgetId && currentBudget.data && <AccountsNav budget={currentBudget.data} />}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
                >
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <UserCog /> Account settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
