import { isOnBudget } from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@everycent/ui/components/popover";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import type { Account } from "@/lib/accounts";
import { useBudget } from "@/lib/budget-context";
import { isCaution } from "@/lib/budget-view";
import { type MoneySettings, toMoneyInput } from "@/lib/money-input";
import { currentMonth, monthQueryOptions } from "@/lib/months";
import { type Draft, directionOf, emptyDraft, transferChoiceLabel } from "@/lib/transactions";
import { AvailablePill } from "./move-money";

/**
 * What a card's Record Payment fills in (YNAB, 2026-10-14, x-130 Card): the lower of the payment
 * category's Available and the card's cleared balance owed; nothing when either is zero or less.
 */
export function cardPaymentAmount(available: bigint, cleared: bigint): bigint {
  const owed = -cleared;
  if (available <= 0n || owed <= 0n) return 0n;
  return available < owed ? available : owed;
}

/**
 * YNAB's Record Payment on a credit card (2026-10-14) opens a new register row rather than a
 * dialog: today's date, a transfer from the account of the transfer into the card entered last
 * ("Payment from F Cash", or "Transfer from" another card: 2026-10-15), for `cardPaymentAmount` as
 * an inflow. With no earlier payment the payee is left empty.
 */
export function cardPaymentDraft({
  card,
  accounts,
  available,
  settings,
  today,
}: {
  card: Account;
  accounts: readonly Account[];
  available: bigint;
  settings: MoneySettings;
  today: string;
}): Draft {
  const from = accounts.find(
    (a) => a.id === card.lastPaymentFromAccountId && !a.closed && isOnBudget(a.type),
  );
  const amount = cardPaymentAmount(available, BigInt(card.balances.cleared));
  return {
    ...emptyDraft(card.id, today),
    ...(from
      ? {
          // YNAB words it by the amount: "Payment from F Cash", or "To/From F Cash" with none.
          payeeName: transferChoiceLabel(card.type, from, directionOf(amount)),
          transferAccountId: from.id,
        }
      : {}),
    inflow: amount > 0n ? toMoneyInput(amount, settings) : "",
  };
}

/** The card's payment category this month, as the plan shows it. */
export function useCardPayment(card: Account | undefined) {
  const { budget } = useBudget();
  const month = currentMonth();
  const data = useQuery({
    ...monthQueryOptions(budget.id, month),
    enabled: card !== undefined && card.paymentCategoryId !== null,
  });
  const totals = data.data?.categories.find((c) => c.categoryId === card?.paymentCategoryId);
  if (!card?.paymentCategoryId || !totals) return null;
  return {
    categoryId: card.paymentCategoryId,
    available: BigInt(totals.available),
    caution: isCaution(totals, month, month),
  };
}

/**
 * The "Payment" figure at the right of a card's balance row (YNAB, 2026-10-14): its payment
 * category's Available, coloured as in the plan. While it doesn't cover the card (yellow, with a
 * "!") it opens "You don't have enough money set aside for your payment." with a link to the
 * category in this month's plan.
 */
export function PaymentFigure({
  categoryId,
  available,
  caution,
  format,
}: {
  categoryId: string;
  available: bigint;
  caution: boolean;
  format: (minorUnits: string) => string;
}) {
  const { budget } = useBudget();
  const pill = (
    <AvailablePill
      amount={available.toString()}
      format={format}
      caution={caution}
      icon={caution ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : undefined}
    />
  );
  return (
    <div className="grid justify-items-end">
      {caution ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto rounded-full p-0 hover:bg-transparent"
              aria-label={`Payment ${format(available.toString())}: not enough set aside`}
            >
              {pill}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-72 gap-2 text-sm">
            <p>You don't have enough money set aside for your payment.</p>
            <p>
              You can{" "}
              <Link
                to="/budgets/$budgetId"
                params={{ budgetId: budget.id }}
                search={{ month: currentMonth(), category: categoryId }}
                className="font-medium underline underline-offset-4"
              >
                fix this in your plan.
              </Link>
            </p>
          </PopoverContent>
        </Popover>
      ) : (
        <span title={format(available.toString())}>{pill}</span>
      )}
      <span className="text-muted-foreground text-xs">Payment</span>
    </div>
  );
}
