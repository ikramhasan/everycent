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
import { ArchiveRestore, ChevronDown, FileSpreadsheet, Import, KeyRound } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { apiErrorMessage, invalidateBudgets } from "@/lib/budgets";
import { YnabApiImportDialog, YnabFilesImportDialog } from "./ynab-import";

type Backup = components["schemas"]["BudgetBackup"];

/**
 * The All budgets page's Import menu: a YNAB plan through YNAB's API or its exported files
 * (EVERYCENT-69), or an everycent backup (EVERYCENT-71), each as a new budget.
 */
export function ImportBudgetMenu() {
  const [dialog, setDialog] = useState<"ynab" | "files" | null>(null);
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
          <DropdownMenuItem onSelect={() => setDialog("ynab")}>
            <KeyRound /> From YNAB…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("files")}>
            <FileSpreadsheet /> From YNAB's exported files…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <ArchiveRestore /> Restore an everycent backup…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <YnabApiImportDialog
        open={dialog === "ynab"}
        onOpenChange={(open) => setDialog(open ? "ynab" : null)}
      />
      <YnabFilesImportDialog
        open={dialog === "files"}
        onOpenChange={(open) => setDialog(open ? "files" : null)}
      />
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
