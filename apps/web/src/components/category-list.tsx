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
import { cn } from "@everycent/ui/lib/utils";
import { ChevronRight, EyeOff, GripVertical, Plus, StickyNote } from "lucide-react";
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
import { NamePopover } from "./name-popover";

export interface CategoryListActions {
  createGroup: (name: string) => Promise<void>;
  createCategory: (groupId: string, name: string) => Promise<void>;
  updateGroup: (groupId: string, patch: { name?: string; hidden?: boolean }) => Promise<void>;
  updateCategory: (
    categoryId: string,
    patch: { name?: string; note?: string; hidden?: boolean },
  ) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  moveGroup: (groupId: string, beforeGroupId: string | null) => Promise<void>;
  moveCategory: (
    categoryId: string,
    groupId: string,
    beforeCategoryId: string | null,
  ) => Promise<void>;
}

type PendingDelete = { kind: "group" | "category"; id: string; name: string } | null;

/** The category side of YNAB's budget screen: groups, categories, drag to reorder, hidden section. */
export function CategoryList({
  data,
  actions,
}: {
  data: CategoryListData;
  actions: CategoryListActions;
}) {
  const serverLayout = useMemo(() => visibleLayout(data), [data]);
  const [layout, setLayout] = useState<VisibleLayout>(serverLayout);
  const beforeDrag = useRef(layout);
  const dragging = useRef(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

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

  function requestDelete(kind: "group" | "category", id: string, name: string) {
    setPendingDelete({ kind, id, name });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    await (kind === "group" ? actions.deleteGroup(id) : actions.deleteCategory(id));
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

      <div className="overflow-hidden rounded-lg border">
        <DragDropProvider
          onDragStart={() => {
            dragging.current = true;
            beforeDrag.current = layout;
          }}
          onDragOver={(event) => {
            if (event.operation.source?.type !== "category") return;
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
              const before = nextId(groupOrder, id);
              if (before !== nextId(beforeDrag.current.groupOrder, id)) {
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
                      onDelete={() => requestDelete("category", category.id, category.name)}
                    />
                  );
                })}
              </GroupSection>
            );
          })}
        </DragDropProvider>
        {layout.groupOrder.length === 0 && (
          <p className="p-4 text-muted-foreground text-sm">
            No categories yet. Add a category group to get started.
          </p>
        )}
      </div>

      <HiddenSection hidden={hidden} actions={actions} />

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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
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
  onDelete,
  children,
}: {
  group: CategoryGroup;
  index: number;
  actions: CategoryListActions;
  onDelete: () => void;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: group.id,
    index,
    type: "group",
    accept: ["group", "category"],
    // Let categories win collisions so they can be dropped between rows of this group.
    collisionPriority: CollisionPriority.Low,
  });

  return (
    <section
      ref={ref}
      aria-label={group.name}
      className={cn("border-b bg-background last:border-b-0", isDragSource && "opacity-60")}
    >
      <div className="group/header flex items-center gap-1 bg-muted/60 px-2 py-1.5">
        <DragHandle ref={handleRef} label={`Reorder ${group.name}`} />
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
            <button
              type="button"
              className="truncate rounded px-1 font-semibold text-sm hover:bg-accent"
            >
              {group.name}
            </button>
          }
        />
        <NamePopover
          title={`New category in ${group.name}`}
          submitLabel="Add"
          onSubmit={({ name }) => actions.createCategory(group.id, name)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Add a category to ${group.name}`}>
              <Plus />
            </Button>
          }
        />
      </div>
      <div className="min-h-2">{children}</div>
    </section>
  );
}

function CategoryRow({
  category,
  index,
  groupId,
  actions,
  onDelete,
}: {
  category: Category;
  index: number;
  groupId: string;
  actions: CategoryListActions;
  onDelete: () => void;
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: category.id,
    index,
    group: groupId,
    type: "category",
    accept: ["category"],
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-1 border-t px-2 py-1.5 first:border-t-0",
        isDragSource && "opacity-60",
      )}
    >
      <DragHandle ref={handleRef} label={`Reorder ${category.name}`} />
      <NamePopover
        title="Category name"
        withNote
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
          <button type="button" className="truncate rounded px-1 text-sm hover:bg-accent">
            {category.name}
          </button>
        }
      />
      {category.note && (
        <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a note" />
      )}
    </div>
  );
}

function DragHandle({ ref, label }: { ref: (el: Element | null) => void; label: string }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

function HiddenSection({
  hidden,
  actions,
}: {
  hidden: ReturnType<typeof hiddenItems>;
  actions: CategoryListActions;
}) {
  const [open, setOpen] = useState(false);
  const count = hidden.groups.length + hidden.categories.length;
  if (count === 0) return null;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-muted-foreground text-sm hover:bg-accent/50"
      >
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        <EyeOff className="size-4" /> Hidden Categories ({count})
      </button>
      {open && (
        <ul className="divide-y border-t">
          {hidden.groups.map((g) => (
            <li key={g.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="truncate font-semibold">{g.name}</span>
              <span className="text-muted-foreground text-xs">
                group · {g.categories.length} categories
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => actions.updateGroup(g.id, { hidden: false })}
              >
                Show
              </Button>
            </li>
          ))}
          {hidden.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="truncate">{c.name}</span>
              <span className="text-muted-foreground text-xs">in {c.groupName}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => actions.updateCategory(c.id, { hidden: false })}
              >
                Show
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
