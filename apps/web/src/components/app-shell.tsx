import { Avatar, AvatarFallback } from "@everycent/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { ScrollArea } from "@everycent/ui/components/scroll-area";
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
  useSidebar,
} from "@everycent/ui/components/sidebar";
import { type Theme, useTheme } from "@everycent/ui/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import {
  Activity,
  ChartColumn,
  ChevronsUpDown,
  Landmark,
  LayoutGrid,
  LogOut,
  Settings,
  UserCog,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { budgetQueryOptions, budgetsQueryOptions } from "@/lib/budgets";
import { lastViewedMonth } from "@/lib/months";
import { useShortcut } from "@/lib/shortcuts";
import { AccountsNav } from "./accounts-nav";
import { BudgetSwitcher } from "./budget-switcher";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { PageHeaderSlotProvider } from "./page-header";

const THEMES: readonly { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/**
 * A theme choice in the user menu: an equal share of the row, its label never pushing it wider, the
 * chosen one filled. The radio item's check (`[data-slot=...indicator]`) is hidden; the fill shows it.
 */
const THEME_ITEM =
  "min-w-0 flex-1 justify-center rounded-none border-l px-1 py-1.5 text-xs first:border-l-0 data-[state=checked]:bg-muted data-[state=checked]:font-medium [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden";

/** The page's scrolling element: the router resets it to the top on navigation and restores it. */
export const APP_SCROLL_ID = "app-scroll";

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

  const { theme, setTheme } = useTheme();
  // The top bar's header slot, where each page puts its title and actions.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

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
    // Narrower than the kit's 16rem, leaving the page more room (YNAB's is narrow too).
    <SidebarProvider style={{ "--sidebar-width": "14rem" } as React.CSSProperties}>
      <GlobalShortcuts />
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <BudgetSwitcher
                // Most recently used first; archived ones too, as in YNAB's Open Plan menu.
                budgets={budgets.data?.budgets ?? []}
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
                      {/* Between Plan and All Accounts, where YNAB has Reflect. */}
                      <Link
                        to="/budgets/$budgetId/reports"
                        params={{ budgetId }}
                        activeProps={{ "data-active": true }}
                      >
                        <ChartColumn />
                        <span>Reports</span>
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
                        to="/budgets/$budgetId/activity"
                        params={{ budgetId }}
                        activeProps={{ "data-active": true }}
                      >
                        <Activity />
                        <span>Activity</span>
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
                  className="w-(--radix-dropdown-menu-trigger-width)"
                >
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/account">
                      <UserCog /> Account settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/*
                   * Theme as a button group; picking one keeps the menu open. Text only, so the three
                   * share the menu's width (as wide as the sidebar's user button) evenly.
                   */}
                  <div className="grid gap-1.5 px-2 py-1.5">
                    <span className="text-muted-foreground text-xs">Theme</span>
                    {/*
                     * Menu radio items, laid out as a joined button group: the menu's arrow keys
                     * reach them (a ToggleGroup inside a menu can't be focused from the keyboard),
                     * and picking one keeps the menu open.
                     */}
                    <DropdownMenuRadioGroup
                      aria-label="Theme"
                      value={theme}
                      onValueChange={(value) => setTheme(value as Theme)}
                      className="flex overflow-hidden rounded-md border"
                    >
                      {THEMES.map(({ value, label }) => (
                        <DropdownMenuRadioItem
                          key={value}
                          value={value}
                          onSelect={(event) => event.preventDefault()}
                          className={THEME_ITEM}
                        >
                          {label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/*
       * The page scrolls inside an overlay ScrollArea under a fixed top bar, never the window: the
       * scrollbar matches the tables', the bar stays in view, and a dropdown's scroll lock (which
       * hides the window's scrollbar) has nothing to hide.
       */}
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center gap-2" />
        </header>
        <ScrollArea
          className="min-h-0 flex-1"
          // Radix wraps the content in a `display: table` box, which stops long text truncating.
          viewportClassName="[&>div]:block!"
          viewportProps={{ id: APP_SCROLL_ID, "data-scroll-restoration-id": APP_SCROLL_ID }}
        >
          <div className="p-4 md:p-5">
            <PageHeaderSlotProvider value={headerSlot}>
              <Outlet />
            </PageHeaderSlotProvider>
          </div>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** YNAB's Universal shortcuts that belong to the shell: "?" for the list, Shift+. for the sidebar. */
function GlobalShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { toggleSidebar } = useSidebar();
  useShortcut("help", () => setHelpOpen(true));
  useShortcut("sidebar", toggleSidebar);
  return <KeyboardShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />;
}
