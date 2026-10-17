import { CSV_DATE_FORMATS, zMinorUnits } from "@everycent/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { IsoDate } from "../../lib/dates";
import { jsonError } from "../../lib/errors";
import { requireAuth } from "../../middleware/require-auth";

const AccountParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
  accountId: z.string().openapi({ param: { name: "accountId", in: "path" } }),
});

const Column = z.number().int().min(0).max(200).nullable();

export const CsvImportSettingsSchema = z
  .object({
    columns: z
      .array(z.string().max(200))
      .max(200)
      .describe("The column names they were set for: the lowercased header, or A, B, C…"),
    mapping: z
      .object({ date: Column, payee: Column, memo: Column, outflow: Column, inflow: Column })
      .describe("The column (0-based) feeding each field; one column can be both amounts"),
    noHeaderRow: z.boolean(),
    swapInflowOutflow: z.boolean(),
    dateFormat: z.enum(CSV_DATE_FORMATS).nullable(),
  })
  .openapi("CsvImportSettings");

export const StatementImportSettingsSchema = z
  .object({ importMemos: z.boolean(), swapPayeeMemo: z.boolean(), swapInflowOutflow: z.boolean() })
  .openapi("StatementImportSettings");

const ImportContextSchema = z
  .object({
    startDate: IsoDate.nullable().describe("The account's oldest transaction"),
    reconciledThrough: IsoDate.nullable().describe("The newest reconciled transaction's date"),
    csvSettings: CsvImportSettingsSchema.nullable().describe(
      'What "Remember setting for this account" kept from the last CSV import',
    ),
    statementSettings: StatementImportSettingsSchema.nullable().describe(
      "The same for the last OFX/QFX or QIF import",
    ),
  })
  .openapi("ImportContext");

const ImportRowSchema = z.object({
  date: IsoDate,
  amount: zMinorUnits.describe("In the account's currency; negative is an outflow"),
  payee: z.string().max(500).describe("As the file names it (renaming rules apply)"),
  memo: z.string().max(2000),
});

const ImportBodySchema = z
  .object({
    transactions: z.array(ImportRowSchema).max(10000),
    csvSettings: CsvImportSettingsSchema.nullable()
      .optional()
      .describe("Saved for the account's next CSV import; null forgets them, left out keeps them"),
    statementSettings: StatementImportSettingsSchema.nullable()
      .optional()
      .describe("Saved for the account's next OFX/QFX or QIF import, like `csvSettings`"),
  })
  .openapi("ImportTransactions");

const ImportResultSchema = z
  .object({
    imported: z.number().int(),
    duplicates: z
      .number()
      .int()
      .describe("Rows skipped because the account already took them in (same import id)"),
    transactionIds: z.array(z.string()).describe("The new transactions, in the file's order"),
  })
  .openapi("ImportResult");

const notFound = jsonError("No such budget or account, or the caller isn't a member");

export const getImportContext = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/accounts/{accountId}/import-context",
  operationId: "getImportContext",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "What a file import into the account needs: its start date and remembered CSV settings",
  request: { params: AccountParams },
  responses: {
    200: {
      description: "Import context",
      content: { "application/json": { schema: ImportContextSchema } },
    },
    401: jsonError("Not signed in"),
    403: jsonError("The account's email address isn't confirmed"),
    404: notFound,
  },
});

export const importTransactions = createRoute({
  method: "post",
  path: "/budgets/{budgetId}/accounts/{accountId}/import",
  operationId: "importTransactions",
  tags: ["Transactions"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Import a bank file's transactions into the account (cleared, unapproved)",
  description:
    "The rows come already read from the file (CSV, OFX/QFX or QIF). Rows the account took in " +
    "before (same import id, even if since deleted) are skipped. Payees go through the plan's " +
    "renaming rules; categories follow the payee's.",
  request: {
    params: AccountParams,
    query: z.object({
      today: IsoDate.optional().describe(
        "The user's today: a row dated later is refused (`DATE_IN_FUTURE`)",
      ),
    }),
    body: { required: true, content: { "application/json": { schema: ImportBodySchema } } },
  },
  responses: {
    200: {
      description: "Imported",
      content: { "application/json": { schema: ImportResultSchema } },
    },
    400: jsonError("Invalid input, a closed account, or a row dated in the future"),
    401: jsonError("Not signed in"),
    403: jsonError(
      "The caller's role can't add transactions, or the account's email address isn't confirmed",
    ),
    404: notFound,
  },
});
