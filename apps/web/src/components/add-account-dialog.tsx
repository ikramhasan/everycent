import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@everycent/ui/components/dialog";
import { useNavigate } from "@tanstack/react-router";
import type { Budget } from "@/lib/budgets";
import { useCreateAccount } from "@/lib/use-create-account";
import { AddAccountForm } from "./account-forms";

/** The Add Account dialog; opens the new account's page when it's created. */
export function AddAccountDialog({
  budget,
  open,
  onOpenChange,
}: {
  budget: Budget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createAccount = useCreateAccount(budget.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
          <DialogDescription>
            Enter today's balance; everycent records it as the account's starting balance.
          </DialogDescription>
        </DialogHeader>
        <AddAccountForm
          settings={budget}
          onSubmit={async (values) => {
            const result = await createAccount(values);
            if ("error" in result) return result.error;
            onOpenChange(false);
            await navigate({
              to: "/budgets/$budgetId/accounts/$accountId",
              params: { budgetId: budget.id, accountId: result.id },
            });
            return null;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
