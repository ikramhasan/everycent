import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type AccountType,
  accountFamily,
  isDebtAccount,
} from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@everycent/ui/components/field";
import { Input } from "@everycent/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { RadioGroup, RadioGroupItem } from "@everycent/ui/components/radio-group";
import { Textarea } from "@everycent/ui/components/textarea";
import { type FormEvent, type ReactNode, useState } from "react";
import type { CategoryList } from "@/lib/categories";
import { hasEscrow } from "@/lib/loans";
import { type MoneySettings, parseMoneyInput, toMoneyInput } from "@/lib/money-input";
import { PairCategoryFields, type PairChoice, pairChoiceReady } from "./loan-dialogs";

const TYPE_GROUPS: Array<{ label: string; types: AccountType[] }> = [
  {
    label: "Budget accounts",
    types: ACCOUNT_TYPES.filter((t) => ["cash", "credit"].includes(accountFamily(t))),
  },
  { label: "Loans", types: ACCOUNT_TYPES.filter((t) => accountFamily(t) === "loan") },
  {
    label: "Tracking (off budget)",
    types: ACCOUNT_TYPES.filter((t) => accountFamily(t) === "tracking"),
  },
];

const RATE = /^\d{1,3}(\.\d{1,3})?$/;

interface LoanValues {
  interestRate: string;
  minimumPayment: string;
  escrowAmount: string;
}

type LoanResult =
  | {
      ok: true;
      interestRate: string | null;
      minimumPayment: string | null;
      escrowAmount: string | null;
    }
  | { ok: false; error: string };

function parseLoan(values: LoanValues, settings: MoneySettings): LoanResult {
  const rate = values.interestRate.trim().replace(/%$/, "").replace(",", ".");
  if (rate && !RATE.test(rate)) return { ok: false, error: "Enter the interest rate like 6.125" };
  const amounts: Record<"minimumPayment" | "escrowAmount", string | null> = {
    minimumPayment: null,
    escrowAmount: null,
  };
  for (const key of ["minimumPayment", "escrowAmount"] as const) {
    if (!values[key].trim()) continue;
    const parsed = parseMoneyInput(values[key], settings);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    amounts[key] = parsed.toString();
  }
  return { ok: true, interestRate: rate || null, ...amounts };
}

const ESCROW_HINT =
  "This would only apply if your bank collects your property taxes on behalf of your city or if it collects other fees as part of your payment.";

/**
 * A loan's terms with YNAB's wording (2026-10-13): Add Account asks for the "Monthly payment
 * required by your lender" and, for a mortgage, whether it includes escrow; Edit Account has
 * Minimum Monthly Payment, Interest Rate (%) and, for a mortgage, Monthly Escrow or Fee Amount.
 */
function LoanFields({
  values,
  onChange,
  type,
  adding = false,
}: {
  values: LoanValues;
  onChange: (values: LoanValues) => void;
  type: AccountType;
  adding?: boolean;
}) {
  const [escrowAsked, setEscrowAsked] = useState(values.escrowAmount.trim() !== "");
  const field = (key: keyof LoanValues, label: string, description?: string, hint?: string) => (
    <Field>
      <FieldLabel htmlFor={`loan-${key}`}>{label}</FieldLabel>
      <Input
        id={`loan-${key}`}
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => onChange({ ...values, [key]: e.target.value })}
        placeholder={hint}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
  if (adding) {
    return (
      <>
        {field("interestRate", "Interest rate (%)", undefined, "6.125")}
        {field(
          "minimumPayment",
          "Monthly payment required by your lender",
          "Enter the total amount you are required to pay your lender each month, including principal, interest, escrow, fees, etc.",
        )}
        {hasEscrow(type) && (
          <Field>
            <FieldLabel>
              Are there escrow installments or other fees included in your mortgage payments?
            </FieldLabel>
            <FieldDescription>{ESCROW_HINT}</FieldDescription>
            <RadioGroup
              value={escrowAsked ? "yes" : "no"}
              onValueChange={(v) => {
                setEscrowAsked(v === "yes");
                if (v === "no") onChange({ ...values, escrowAmount: "" });
              }}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem id="loan-escrow-no" value="no" />
                <label htmlFor="loan-escrow-no">No</label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem id="loan-escrow-yes" value="yes" />
                <label htmlFor="loan-escrow-yes">Yes</label>
              </div>
            </RadioGroup>
          </Field>
        )}
        {hasEscrow(type) &&
          escrowAsked &&
          field("escrowAmount", "How much is the monthly escrow or fee?")}
      </>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("minimumPayment", "Minimum Monthly Payment")}
        {field("interestRate", "Interest Rate (%)", undefined, "6.125")}
      </div>
      {hasEscrow(type) && field("escrowAmount", "Monthly Escrow or Fee Amount", ESCROW_HINT)}
    </>
  );
}

function FormShell({
  onSubmit,
  error,
  pending,
  submitLabel,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  pending: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {children}
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" disabled={pending} className="justify-self-end">
        {submitLabel}
      </Button>
    </form>
  );
}

export interface NewAccountValues {
  name: string;
  type: AccountType;
  /** Minor units; negative when money is owed. */
  balance: string;
  interestRate?: string;
  minimumPayment?: string;
  escrowAmount?: string;
  /** Loans: YNAB's optional "Pair a Category" step. */
  pairing?: PairChoice;
}

export function AddAccountForm({
  settings,
  categories,
  onSubmit,
}: {
  settings: MoneySettings;
  /** The plan's categories, for a loan's pairing step (skipped while they load). */
  categories?: CategoryList;
  onSubmit: (values: NewAccountValues) => Promise<string | null>;
}) {
  const [type, setType] = useState<AccountType>("checking");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [loan, setLoan] = useState<LoanValues>({
    interestRate: "",
    minimumPayment: "",
    escrowAmount: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Loans go on to "Optional: Pair a Category" (YNAB, 2026-10-13). */
  const [pairStep, setPairStep] = useState(false);
  const [pairing, setPairing] = useState<PairChoice>(null);
  const debt = isDebtAccount(type);
  const isLoan = accountFamily(type) === "loan";

  async function handleSubmit(event: FormEvent<HTMLFormElement>, skipPairing = false) {
    event.preventDefault();
    const parsed = parseMoneyInput(balance || "0", settings);
    if (typeof parsed === "string") return setError(parsed);
    const loanValues = isLoan ? parseLoan(loan, settings) : null;
    if (loanValues && !loanValues.ok) return setError(loanValues.error);
    if (isLoan && categories && !pairStep) {
      setError(null);
      return setPairStep(true);
    }
    if (pairStep && !skipPairing && !pairChoiceReady(pairing)) {
      return setError("Choose a category, or skip this step");
    }
    setPending(true);
    setError(null);
    const message = await onSubmit({
      name: name.trim(),
      type,
      // Debt forms ask for the amount owed; the balance is its negative.
      balance: (debt ? -parsed : parsed).toString(),
      ...(loanValues?.ok
        ? {
            interestRate: loanValues.interestRate ?? undefined,
            minimumPayment: loanValues.minimumPayment ?? undefined,
            escrowAmount: loanValues.escrowAmount ?? undefined,
          }
        : {}),
      ...(pairStep && !skipPairing && pairing ? { pairing } : {}),
    });
    setPending(false);
    setError(message);
  }

  if (pairStep && categories) {
    return (
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-1">
          <p className="font-semibold text-sm">Optional: Pair a Category</p>
          <p className="font-medium text-sm">Pair your loan with a plan category</p>
        </div>
        <PairCategoryFields list={categories} value={pairing} onChange={setPairing} />
        {error && <FieldError>{error}</FieldError>}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => setPairStep(false)}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={(e) => void handleSubmit(e as unknown as FormEvent<HTMLFormElement>, true)}
            >
              Skip
            </Button>
            <Button type="submit" disabled={pending}>
              Next
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <FormShell
      onSubmit={handleSubmit}
      error={error}
      pending={pending}
      submitLabel={isLoan && categories ? "Next" : "Add account"}
    >
      <Field>
        <FieldLabel htmlFor="account-type">Account type</FieldLabel>
        <NativeSelect
          id="account-type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          {TYPE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </NativeSelectOption>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="account-name">Nickname</FieldLabel>
        <Input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="account-balance">
          {debt ? "How much do you owe today?" : "What's the balance today?"}
        </FieldLabel>
        <Input
          id="account-balance"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder={toMoneyInput("0", settings)}
        />
      </Field>
      {isLoan && <LoanFields values={loan} onChange={setLoan} type={type} adding />}
    </FormShell>
  );
}

export interface AccountEdit {
  name: string;
  note: string;
  type: AccountType;
  interestRate: string | null;
  minimumPayment: string | null;
  escrowAmount: string | null;
  /** Minor units; set only when changed (an adjustment makes up the difference). */
  workingBalance?: string;
}

export function EditAccountForm({
  settings,
  initial,
  workingBalance,
  onSubmit,
}: {
  settings: MoneySettings;
  initial: AccountEdit;
  /** The account's working balance; null hides the field (closed accounts, as YNAB). */
  workingBalance: bigint | null;
  onSubmit: (values: AccountEdit) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial.name);
  const [balance, setBalance] = useState(toMoneyInput(workingBalance, settings));
  const [note, setNote] = useState(initial.note);
  const [type, setType] = useState(initial.type);
  const [loan, setLoan] = useState<LoanValues>({
    interestRate: initial.interestRate ?? "",
    minimumPayment: toMoneyInput(initial.minimumPayment, settings),
    escrowAmount: toMoneyInput(initial.escrowAmount, settings),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const family = accountFamily(initial.type);
  const isLoan = family === "loan";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const loanValues = isLoan
      ? parseLoan(loan, settings)
      : ({ ok: true, interestRate: null, minimumPayment: null, escrowAmount: null } as const);
    if (!loanValues.ok) return setError(loanValues.error);
    // YNAB takes the working balance as typed (signed): a card's "70" is $70 in credit.
    const newBalance = workingBalance === null ? null : parseMoneyInput(balance || "0", settings);
    if (typeof newBalance === "string") return setError(newBalance);
    setPending(true);
    setError(null);
    const message = await onSubmit({
      name: name.trim(),
      note,
      type,
      interestRate: loanValues.interestRate,
      minimumPayment: loanValues.minimumPayment,
      escrowAmount: loanValues.escrowAmount,
      ...(newBalance !== null && newBalance !== workingBalance
        ? { workingBalance: newBalance.toString() }
        : {}),
    });
    setPending(false);
    setError(message);
  }

  return (
    <FormShell onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Save">
      <Field>
        <FieldLabel htmlFor="edit-account-name">Nickname</FieldLabel>
        <Input
          id="edit-account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="edit-account-type">{isLoan ? "Loan Type" : "Account type"}</FieldLabel>
        <NativeSelect
          id="edit-account-type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.filter((t) => accountFamily(t) === family).map((t) => (
            <NativeSelectOption key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="edit-account-note">Notes</FieldLabel>
        <Textarea
          id="edit-account-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </Field>
      {workingBalance !== null && (
        <Field>
          <FieldLabel htmlFor="edit-account-balance">
            {isLoan ? "Today's Balance" : "Working Balance"}
          </FieldLabel>
          <Input
            id="edit-account-balance"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          <FieldDescription>
            An adjustment transaction will be created automatically if you change this amount.
          </FieldDescription>
        </Field>
      )}
      {isLoan && <LoanFields values={loan} onChange={setLoan} type={type} />}
    </FormShell>
  );
}
