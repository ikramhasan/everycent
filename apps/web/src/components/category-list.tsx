import { CollisionPriority } from "@dnd-kit/abstract";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@everycent/ui/components/alert-dialog";
import { Button } from "@everycent/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everycent/ui/components/empty";
import { Label } from "@everycent/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@everycent/ui/components/popover";
import { cn } from "@everycent/ui/lib/utils";
import { ChevronDown, ChevronRight, GripVertical, Plus, StickyNote } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type Category,
  type CategoryGroup,
  type CategoryList as CategoryListData,
  hiddenItems,
  locateCategory,
  nextId,
  type VisibleLayout,
  visibleLayout,
} from "@/lib/categories";
import type { BudgetMonthData, MonthTotals } from "@/lib/months";
import { type AssignActions, AssignedCell } from "./assigned-cell";
import { NamePopover } from "./name-popover";

export interface CategoryListActions {
  createGroup: (name: string) => Promise<void>;
  createCategory: (groupId: string, name: string) => Promise<void>;
  updateGroup: (groupId: string, patch: { name?: string; hidden?: boolean }) => Promise<void>;
  updateCategory: (
    categoryId: string,
    patch: { name?: string; note?: string; hidden?: boolean },
  ) => Promise<void>;
  /** `reassignTo` receives the history of categories that have transactions. */
  deleteGroup: (groupId: string, reassignTo?: string) => Promise<void>;
  deleteCategory: (categoryId: string, reassignTo?: string) => Promise<void>;
  moveGroup: (groupId: string, beforeGroupId: string | null) => Promise<void>;
  moveCategory: (
    categoryId: string,
    groupId: string,
    beforeCategoryId: string | null,
  ) => Promise<void>;
}

type PendingDelete = {
  kind: "group" | "category";
  id: string;
  name: string;
  /** Categories that disappear with it. */
  deletedIds: string[];
  hasTransactions: boolean;
} | null;

/** A month's numbers for the list, with the budget's amount formatting. */
export interface CategoryFigures {
  month: BudgetMonthData;
  /** Formats an amount in minor units (an integer string) in the month's currency. */
  format: (minorUnits: string) => string;
  /** Makes the Assigned column editable. */
  assign?: AssignActions;
}

const NO_GROUPS: ReadonlySet<string> = new Set();
/**
 * Every row shares one grid so the figures line up whatever a name's length. Like YNAB, a list
 * narrower than the columns scrolls sideways instead of squeezing them (mobile gets its own pass).
 */
const ROW = "grid grid-cols-[minmax(10rem,1fr)_7rem_7rem_7.5rem] items-center gap-x-1 px-2 py-1.5";
const NAME_CELL = "flex min-w-0 items-center gap-1";
const FIGURE = "min-w-0 truncate text-right tabular-nums";
/** Lets a name button shrink and truncate (shadcn's Button doesn't shrink by default). */
const NAME_BUTTON = "min-w-0 shrink justify-start";

/** Draggable types: payment categories only move within the Credit Card Payments group. */
const categoryType = (c: Category) => (c.linkedAccountId ? "payment" : "category");

/**
 * YNAB's budget screen: groups and categories with the month's Assigned, Activity and Available,
 * drag to reorder, collapsible groups and the Hidden Categories row.
 */
export function CategoryList({
  data,
  actions,
  figures,
  collapsed = NO_GROUPS,
  onCollapsedChange,
}: {
  data: CategoryListData;
  actions: CategoryListActions;
  figures?: CategoryFigures;
  collapsed?: ReadonlySet<string>;
  onCollapsedChange?: (collapsed: ReadonlySet<string>) => void;
}) {
  const serverLayout = useMemo(() => visibleLayout(data), [data]);
  const [layout, setLayout] = useState<VisibleLayout>(serverLayout);
  const beforeDrag = useRef(layout);
  const dragging = useRef(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [reassignTo, setReassignTo] = useState("");

  // Follow the server unless a drag is in progress.
  useEffect(() => {
    if (!dragging.current) setLayout(serverLayout);
  }, [serverLayout]);

  const groupsById = useMemo(() => new Map(data.groups.map((g) => [g.id, g])), [data]);
  const categoriesById = useMemo(
    () => new Map(data.groups.flatMap((g) => g.categories.map((c) => [c.id, c] as const))),
    [data],
  );
  const hidden = useMemo(() => hiddenItems(data), [data]);
  const categoryFigures = useMemo(
    () => new Map(figures?.month.categories.map((c) => [c.categoryId, c])),
    [figures],
  );
  const groupFigures = useMemo(
    () => new Map(figures?.month.groups.map((g) => [g.groupId, g])),
    [figures],
  );
  const allCollapsed =
    layout.groupOrder.length > 0 && layout.groupOrder.every((id) => collapsed.has(id));

  function toggleGroup(groupId: string) {
    const next = new Set(collapsed);
    if (!next.delete(groupId)) next.add(groupId);
    onCollapsedChange?.(next);
  }

  function requestDelete(kind: "group" | "category", id: string, name: string) {
    const deleted =
      kind === "group" ? (groupsById.get(id)?.categories ?? []) : [categoriesById.get(id)];
    setReassignTo("");
    setPendingDelete({
      kind,
      id,
      name,
      deletedIds: deleted.flatMap((c) => (c ? [c.id] : [])),
      hasTransactions: deleted.some((c) => c?.hasTransactions),
    });
  }

  // Where a deleted category's history can go: any other regular category.
  const reassignTargets = useMemo(
    () =>
      data.groups
        .filter((g) => !g.kind)
        .map((g) => ({
          group: g.name,
          categories: g.categories.filter((c) => !pendingDelete?.deletedIds.includes(c.id)),
        }))
        .filter((g) => g.categories.length > 0),
    [data, pendingDelete],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id, hasTransactions } = pendingDelete;
    const target = hasTransactions ? reassignTo : undefined;
    setPendingDelete(null);
    await (kind === "group" ? actions.deleteGroup(id, target) : actions.deleteCategory(id, target));
  }

  return (
    <div className="grid gap-4">
      <div>
        <NamePopover
          title="New category group"
          submitLabel="Add"
          onSubmit={({ name }) => actions.createGroup(name)}
          trigger={
            <Button variant="outline" size="sm">
              <Plus /> Category Group
            </Button>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-fit">
          <div
            className={cn(
              ROW,
              "border-b font-medium text-muted-foreground text-xs uppercase tracking-wide",
            )}
          >
            <div className={NAME_CELL}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={allCollapsed ? "Expand all groups" : "Collapse all groups"}
                onClick={() =>
                  onCollapsedChange?.(allCollapsed ? new Set() : new Set(layout.groupOrder))
                }
              >
                {allCollapsed ? <ChevronRight /> : <ChevronDown />}
              </Button>
              <span className="truncate px-1">Category</span>
            </div>
            {figures && (
              <>
                <span className={FIGURE}>Assigned</span>
                <span className={FIGURE}>Activity</span>
                <span className={FIGURE}>Available</span>
              </>
            )}
          </div>
          {figures?.month.uncategorized && (
            <div className={cn(ROW, "border-b text-sm")}>
              <div className={NAME_CELL}>
                <span className="size-6 shrink-0" />
                <span className="truncate px-2">Uncategorized Transactions</span>
              </div>
              {/* YNAB shows a dash: money can't be assigned to Uncategorized. */}
              <span className={FIGURE}>–</span>
              <span className={FIGURE}>{figures.format(figures.month.uncategorized.activity)}</span>
              <span className={FIGURE}>
                <AvailablePill
                  amount={figures.month.uncategorized.available}
                  format={figures.format}
                />
              </span>
            </div>
          )}
          <DragDropProvider
            onDragStart={() => {
              dragging.current = true;
              beforeDrag.current = layout;
            }}
            onDragOver={(event) => {
              const type = event.operation.source?.type;
              if (type !== "category" && type !== "payment") return;
              setLayout((l) => ({ ...l, items: move(l.items, event) }));
            }}
            onDragEnd={(event) => {
              dragging.current = false;
              const source = event.operation.source;
              if (event.canceled || !source) {
                setLayout(beforeDrag.current);
                return;
              }
              const id = String(source.id);
              if (source.type === "group") {
                const groupOrder = move(layout.groupOrder, event);
                setLayout((l) => ({ ...l, groupOrder }));
                // Credit Card Payments stays pinned first; order the other groups around it.
                const movable = (order: string[]) => order.filter((g) => !groupsById.get(g)?.kind);
                const before = nextId(movable(groupOrder), id);
                if (before !== nextId(movable(beforeDrag.current.groupOrder), id)) {
                  void actions.moveGroup(id, before);
                }
                return;
              }
              const now = locateCategory(layout.items, id);
              const was = locateCategory(beforeDrag.current.items, id);
              if (
                now &&
                (now.groupId !== was?.groupId || now.beforeCategoryId !== was?.beforeCategoryId)
              ) {
                void actions.moveCategory(id, now.groupId, now.beforeCategoryId);
              }
            }}
          >
            {layout.groupOrder.map((groupId, groupIndex) => {
              const group = groupsById.get(groupId);
              if (!group) return null;
              return (
                <GroupSection
                  key={groupId}
                  group={group}
                  index={groupIndex}
                  actions={actions}
                  totals={groupFigures.get(groupId)}
                  format={figures?.format}
                  collapsed={collapsed.has(groupId)}
                  onToggle={() => toggleGroup(groupId)}
                  onDelete={() => requestDelete("group", group.id, group.name)}
                >
                  {(layout.items[groupId] ?? []).map((categoryId, index) => {
                    const category = categoriesById.get(categoryId);
                    if (!category) return null;
                    return (
                      <CategoryRow
                        key={categoryId}
                        category={category}
                        index={index}
                        groupId={groupId}
                        actions={actions}
                        totals={categoryFigures.get(categoryId)}
                        format={figures?.format}
                        assign={figures?.assign}
                        onDelete={() => requestDelete("category", category.id, category.name)}
                      />
                    );
                  })}
                </GroupSection>
              );
            })}
          </DragDropProvider>
          {layout.groupOrder.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No categories yet</EmptyTitle>
                <EmptyDescription>Add a category group to get started.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <HiddenRow
            hidden={hidden}
            actions={actions}
            totals={figures?.month.hidden}
            format={figures?.format}
          />
        </div>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "group"
                ? "The group and all of its categories will be deleted."
                : "The category will be deleted."}{" "}
              If you might need it later, hide it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete?.hasTransactions && (
            <div className="grid gap-2">
              <Label htmlFor="reassign-to">Move its transactions to</Label>
              <NativeSelect
                id="reassign-to"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <NativeSelectOption value="" disabled>
                  Select a category…
                </NativeSelectOption>
                {reassignTargets.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.categories.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={pendingDelete?.hasTransactions === true && !reassignTo}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GroupSection({
  group,
  index,
  actions,
  totals,
  format,
  collapsed,
  onToggle,
  onDelete,
  children,
}: {
  group: CategoryGroup;
  index: number;
  actions: CategoryListActions;
  totals: MonthTotals | undefined;
  format: CategoryFigures["format"] | undefined;
  collapsed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const managed = group.kind === "credit_card_payments";
  const { ref, handleRef, isDragSource } = useSortable({
    id: group.id,
    index,
    type: "group",
    // Credit Card Payments is pinned and only takes payment categories.
    disabled: managed,
    accept: managed ? ["payment"] : ["group", "category"],
    // Let categories win collisions so they can be dropped between rows of this group.
    collisionPriority: CollisionPriority.Low,
  });

  return (
    <section
      ref={ref}
      aria-label={group.name}
      className={cn("border-b bg-background last:border-b-0", isDragSource && "opacity-60")}
    >
      <div className={cn(ROW, "group/header bg-muted/60")}>
        <div className={NAME_CELL}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.name}`}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
          {managed ? (
            <span className="w-5" />
          ) : (
            <DragHandle ref={handleRef} label={`Reorder ${group.name}`} />
          )}
          {managed ? (
            <span className="truncate px-1 font-semibold text-sm">{group.name}</span>
          ) : (
            <>
              <NamePopover
                title="Category group name"
                initial={{ name: group.name, note: "" }}
                onSubmit={({ name }) => actions.updateGroup(group.id, { name })}
                actions={(close) => (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        close();
                        await actions.updateGroup(group.id, { hidden: true });
                      }}
                    >
                      Hide
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        close();
                        onDelete();
                      }}
                    >
                      Delete
                    </Button>
                  </>
                )}
                trigger={
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(NAME_BUTTON, "font-semibold text-sm")}
                  >
                    <span className="truncate">{group.name}</span>
                  </Button>
                }
              />
              <NamePopover
                title={`New category in ${group.name}`}
                submitLabel="Add"
                onSubmit={({ name }) => actions.createCategory(group.id, name)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Add a category to ${group.name}`}
                  >
                    <Plus />
                  </Button>
                }
              />
            </>
          )}
        </div>
        {totals && format && <TotalCells totals={totals} format={format} />}
      </div>
      {!collapsed && <div className="min-h-2">{children}</div>}
    </section>
  );
}

function CategoryRow({
  category,
  index,
  groupId,
  actions,
  totals,
  format,
  assign,
  onDelete,
}: {
  category: Category;
  index: number;
  groupId: string;
  actions: CategoryListActions;
  totals: MonthTotals | undefined;
  format: CategoryFigures["format"] | undefined;
  assign: AssignActions | undefined;
  onDelete: () => void;
}) {
  const isPayment = Boolean(category.linkedAccountId);
  const { ref, handleRef, isDragSource } = useSortable({
    id: category.id,
    index,
    group: groupId,
    type: categoryType(category),
    accept: [categoryType(category)],
  });

  return (
    <div ref={ref} className={cn(ROW, "border-t first:border-t-0", isDragSource && "opacity-60")}>
      <div className={NAME_CELL}>
        <span className="size-6 shrink-0" />
        <DragHandle ref={handleRef} label={`Reorder ${category.name}`} />
        <NamePopover
          title="Category name"
          withNote
          nameLockedReason={
            isPayment ? "Named after its credit account. Rename the account instead." : undefined
          }
          initial={{ name: category.name, note: category.note }}
          onSubmit={({ name, note }) => actions.updateCategory(category.id, { name, note })}
          actions={(close) => (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  close();
                  await actions.updateCategory(category.id, { hidden: true });
                }}
              >
                Hide
              </Button>
              {!isPayment && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Delete
                </Button>
              )}
            </>
          )}
          trigger={
            <Button variant="ghost" size="xs" className={cn(NAME_BUTTON, "font-normal text-sm")}>
              <span className="truncate">{category.name}</span>
            </Button>
          }
        />
        {category.note && (
          <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a note" />
        )}
      </div>
      {totals && format && (
        <>
          {assign ? (
            <AssignedCell
              categoryId={category.id}
              categoryName={category.name}
              amount={totals.assigned}
              format={format}
              actions={assign}
            />
          ) : (
            <span className={cn(FIGURE, "text-sm")}>{format(totals.assigned)}</span>
          )}
          <span className={cn(FIGURE, "text-sm")}>{format(totals.activity)}</span>
          <span className={FIGURE}>
            <AvailablePill amount={totals.available} format={format} />
          </span>
        </>
      )}
    </div>
  );
}

/** Available as YNAB shows it: a pill, green with money, red when overspent, grey at zero. */
function AvailablePill({ amount, format }: { amount: string; format: CategoryFigures["format"] }) {
  const sign = amount === "0" ? 0 : amount.startsWith("-") ? -1 : 1;
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle font-medium text-sm",
        sign > 0 && "bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100",
        sign < 0 && "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
        sign === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {format(amount)}
    </span>
  );
}

/** A group's or the hidden row's totals: plain numbers, lined up with the pills above them. */
function TotalCells({
  totals,
  format,
}: {
  totals: MonthTotals;
  format: CategoryFigures["format"];
}) {
  return (
    <>
      <span className={cn(FIGURE, "font-medium text-sm")}>{format(totals.assigned)}</span>
      <span className={cn(FIGURE, "font-medium text-sm")}>{format(totals.activity)}</span>
      <span className={cn(FIGURE, "pr-2 font-medium text-sm")}>{format(totals.available)}</span>
    </>
  );
}

function DragHandle({ ref, label }: { ref: (el: Element | null) => void; label: string }) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
    >
      <GripVertical />
    </Button>
  );
}

/**
 * YNAB's "Hidden Categories" row at the bottom of the list, with the hidden categories' totals.
 * Clicking it lists them to unhide one, or all of them.
 */
function HiddenRow({
  hidden,
  actions,
  totals,
  format,
}: {
  hidden: ReturnType<typeof hiddenItems>;
  actions: CategoryListActions;
  totals: MonthTotals | undefined;
  format: CategoryFigures["format"] | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (hidden.groups.length + hidden.categories.length === 0) return null;

  // Hidden categories under their (visible) group's name, as YNAB lists them.
  const byGroup = new Map<string, typeof hidden.categories>();
  for (const c of hidden.categories)
    byGroup.set(c.groupName, [...(byGroup.get(c.groupName) ?? []), c]);

  async function showAll() {
    setOpen(false);
    await Promise.all([
      ...hidden.groups.map((g) => actions.updateGroup(g.id, { hidden: false })),
      ...hidden.categories.map((c) => actions.updateCategory(c.id, { hidden: false })),
    ]);
  }

  return (
    <div className={cn(ROW, "border-t bg-muted/60")}>
      <div className={NAME_CELL}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className={cn(NAME_BUTTON, "font-semibold text-sm")}>
              <span className="truncate">Hidden Categories</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <PopoverHeader>
              <PopoverTitle>Click to unhide a category</PopoverTitle>
            </PopoverHeader>
            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {hidden.groups.map((g) => (
                <div key={g.id} className="grid">
                  <Button
                    variant="link"
                    size="xs"
                    className="justify-start px-0 font-semibold"
                    onClick={() => {
                      setOpen(false);
                      void actions.updateGroup(g.id, { hidden: false });
                    }}
                  >
                    {g.name}
                  </Button>
                  {g.categories.map((c) => (
                    <span key={c.id} className="pl-3 text-muted-foreground text-xs">
                      {c.name}
                    </span>
                  ))}
                </div>
              ))}
              {[...byGroup].map(([groupName, categories]) => (
                <div key={groupName} className="grid">
                  <span className="font-semibold text-xs">{groupName}:</span>
                  {categories.map((c) => (
                    <Button
                      key={c.id}
                      variant="link"
                      size="xs"
                      className="justify-start pl-3"
                      onClick={() => {
                        setOpen(false);
                        void actions.updateCategory(c.id, { hidden: false });
                      }}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
            <Button size="sm" onClick={showAll}>
              Show all hidden categories
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {totals && format && <TotalCells totals={totals} format={format} />}
    </div>
  );
}
