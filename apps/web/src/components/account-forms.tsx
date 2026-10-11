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
import { Textarea } from "@everycent/ui/components/textarea";
import { type FormEvent, type ReactNode, useState } from "react";
import { type MoneySettings, parseMoneyInput, toMoneyInput } from "@/lib/money-input";

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

function LoanFields({
  values,
  onChange,
}: {
  values: LoanValues;
  onChange: (values: LoanValues) => void;
}) {
  const field = (key: keyof LoanValues, label: string, hint?: string) => (
    <Field>
      <FieldLabel htmlFor={`loan-${key}`}>{label}</FieldLabel>
      <Input
        id={`loan-${key}`}
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => onChange({ ...values, [key]: e.target.value })}
        placeholder={hint}
      />
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {field("interestRate", "Interest rate (%)", "6.125")}
      {field("minimumPayment", "Minimum payment")}
      {field("escrowAmount", "Monthly escrow", "Optional")}
    </div>
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
}

export function AddAccountForm({
  settings,
  onSubmit,
}: {
  settings: MoneySettings;
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
  const debt = isDebtAccount(type);
  const isLoan = accountFamily(type) === "loan";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseMoneyInput(balance || "0", settings);
    if (typeof parsed === "string") return setError(parsed);
    const loanValues = isLoan ? parseLoan(loan, settings) : null;
    if (loanValues && !loanValues.ok) return setError(loanValues.error);
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
    });
    setPending(false);
    setError(message);
  }

  return (
    <FormShell onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Add account">
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
      {isLoan && <LoanFields values={loan} onChange={setLoan} />}
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
  /** The account's working balance; null hides the field (closed accounts and loans, as YNAB). */
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
        <FieldLabel htmlFor="edit-account-type">Account type</FieldLabel>
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
      {isLoan && <LoanFields values={loan} onChange={setLoan} />}
      {workingBalance !== null && (
        <Field>
          <FieldLabel htmlFor="edit-account-balance">Working Balance</FieldLabel>
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
    </FormShell>
  );
}
