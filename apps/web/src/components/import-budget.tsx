import type { components } from "@everycent/api-client";
import { Button } from "@everycent/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@everycent/ui/components/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveRestore, ChevronDown, Import } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { apiErrorMessage, invalidateBudgets } from "@/lib/budgets";

type Backup = components["schemas"]["BudgetBackup"];

/**
 * The All budgets page's Import menu: restore an everycent backup as a new budget (EVERYCENT-71),
 * plus whatever other sources `children` adds.
 */
export function ImportBudgetMenu({ children }: { children?: ReactNode }) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function restore(chosen: File) {
    setPending(true);
    try {
      let backup: Backup;
      try {
        backup = JSON.parse(await chosen.text()) as Backup;
      } catch {
        toast.error("That file isn't an everycent backup.");
        return;
      }
      const { data, error } = await apiClient.POST("/v1/budgets/import", {
        params: { query: {} },
        body: backup,
      });
      if (error || !data) throw error;
      await invalidateBudgets(queryClient);
      toast.success(`Restored "${data.budget.name}".`);
      await navigate({ to: "/budgets/$budgetId", params: { budgetId: data.budget.id } });
    } catch (e) {
      toast.error(apiErrorMessage(e, "Couldn't restore the backup."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <Import /> {pending ? "Importing…" : "Import"} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <ArchiveRestore /> Restore an everycent backup…
          </DropdownMenuItem>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Backup file"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (chosen) void restore(chosen);
        }}
      />
    </>
  );
}
