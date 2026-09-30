import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type AccountType,
  accountFamily,
  type BudgetFormatSettings,
  type CurrencyCode,
  formatAmount,
  isDebtAccount,
  MoneyParseError,
  money,
  parseAmount,
} from "@everycent/engine";
import { Button } from "@everycent/ui/components/button";
import { Input } from "@everycent/ui/components/input";
import { Label } from "@everycent/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@everycent/ui/components/native-select";
import { Textarea } from "@everycent/ui/components/textarea";
import { type FormEvent, type ReactNode, useState } from "react";

export interface MoneySettings extends BudgetFormatSettings {
  currency: CurrencyCode;
}

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

/** Parses an amount typed in the budget's number format into minor units, or explains why not. */
function parseInput(text: string, settings: MoneySettings): bigint | string {
  try {
    return parseAmount(text, settings.currency, settings.numberFormat).amount;
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return `Enter an amount like ${formatAmount(money(123456n, settings.currency), {
        ...settings,
        currencySymbolPosition: "none",
      })}`;
    }
    throw error;
  }
}

/** Formats minor units for an input field (no symbol), e.g. "1,234.56". */
function toInput(amount: string | null, settings: MoneySettings) {
  if (amount === null) return "";
  return formatAmount(money(BigInt(amount), settings.currency), {
    ...settings,
    currencySymbolPosition: "none",
  });
}

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
    const parsed = parseInput(values[key], settings);
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
    <div className="grid gap-1.5">
      <Label htmlFor={`loan-${key}`}>{label}</Label>
      <Input
        id={`loan-${key}`}
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => onChange({ ...values, [key]: e.target.value })}
        placeholder={hint}
      />
    </div>
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
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
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
    const parsed = parseInput(balance || "0", settings);
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
      <div className="grid gap-1.5">
        <Label htmlFor="account-type">Account type</Label>
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
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-name">Nickname</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-balance">
          {debt ? "How much do you owe today?" : "What's the balance today?"}
        </Label>
        <Input
          id="account-balance"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder={toInput("0", settings)}
        />
      </div>
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
}

export function EditAccountForm({
  settings,
  initial,
  onSubmit,
}: {
  settings: MoneySettings;
  initial: AccountEdit;
  onSubmit: (values: AccountEdit) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note);
  const [type, setType] = useState(initial.type);
  const [loan, setLoan] = useState<LoanValues>({
    interestRate: initial.interestRate ?? "",
    minimumPayment: toInput(initial.minimumPayment, settings),
    escrowAmount: toInput(initial.escrowAmount, settings),
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
    setPending(true);
    setError(null);
    const message = await onSubmit({
      name: name.trim(),
      note,
      type,
      interestRate: loanValues.interestRate,
      minimumPayment: loanValues.minimumPayment,
      escrowAmount: loanValues.escrowAmount,
    });
    setPending(false);
    setError(message);
  }

  return (
    <FormShell onSubmit={handleSubmit} error={error} pending={pending} submitLabel="Save">
      <div className="grid gap-1.5">
        <Label htmlFor="edit-account-name">Nickname</Label>
        <Input
          id="edit-account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-account-type">Account type</Label>
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
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-account-note">Notes</Label>
        <Textarea
          id="edit-account-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </div>
      {isLoan && <LoanFields values={loan} onChange={setLoan} />}
    </FormShell>
  );
}
