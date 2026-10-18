import type { JSONSchema } from "@tanstack/ai";

// A chart the assistant shows the person. The tool only checks the spec; the app draws it from
// the tool call's arguments (shadcn's chart component over Recharts), so it stays in the
// conversation. Money values are minor units, as the API gives them, so the model passes the
// numbers it read through and the app formats them in the budget's currency.

export const CHART_TYPES = ["bar", "line", "area", "pie", "radar", "radial"] as const;
const MAX_ROWS = 120;
const MAX_SERIES = 8;

export const chartInputSchema: JSONSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: [...CHART_TYPES],
      description:
        "bar: compare categories or months. line / area: a trend over time. pie: parts of a whole (one series). radar: several measures per category. radial: progress or shares as rings (one series).",
    },
    title: { type: "string", description: 'Short title, e.g. "Spending by category, October"' },
    description: { type: "string", description: "Optional one-line subtitle" },
    valueFormat: {
      type: "string",
      enum: ["money", "number", "percent"],
      description:
        'money: values are integer minor units of the budget\'s currency, exactly as the tools return them ("-1250" → -1250). percent: 12.5 means 12.5%.',
    },
    data: {
      type: "array",
      description: `The rows, in display order (at most ${MAX_ROWS}). Each has a \`label\` (the category, month or slice name) and a number for each series key.`,
      items: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
        additionalProperties: { type: "number" },
      },
    },
    series: {
      type: "array",
      description: `What each row's numbers are (at most ${MAX_SERIES}; pie and radial use exactly one).`,
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "The property name in each row" },
          label: { type: "string", description: "Its name in the legend and tooltip" },
        },
        required: ["key", "label"],
      },
    },
    stacked: { type: "boolean", description: "bar / area: stack the series" },
    horizontal: { type: "boolean", description: "bar: bars run left to right" },
    curve: {
      type: "string",
      enum: ["linear", "monotone", "step"],
      description: "line / area: how points are joined (default monotone)",
    },
    donut: { type: "boolean", description: "pie: leave a hole in the middle" },
  },
  required: ["type", "title", "valueFormat", "data", "series"],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks what the schema can't: series keys present and numeric in every row, and sizes. */
export function checkChart(input: unknown): { shown: true } | { error: string } {
  if (!isRecord(input)) return { error: "The chart must be an object" };
  const { type, data, series } = input;
  if (!CHART_TYPES.includes(type as (typeof CHART_TYPES)[number])) {
    return { error: `type must be one of ${CHART_TYPES.join(", ")}` };
  }
  if (!Array.isArray(data) || data.length === 0) return { error: "data needs at least one row" };
  if (data.length > MAX_ROWS) return { error: `data is limited to ${MAX_ROWS} rows` };
  if (!Array.isArray(series) || series.length === 0) {
    return { error: "series needs at least one entry" };
  }
  if (series.length > MAX_SERIES) return { error: `series is limited to ${MAX_SERIES}` };
  if ((type === "pie" || type === "radial") && series.length !== 1) {
    return { error: `A ${type} chart shows exactly one series` };
  }
  const keys = series.map((s) => (isRecord(s) ? s.key : undefined));
  if (keys.some((k) => typeof k !== "string" || k === "label")) {
    return { error: 'Every series needs a string key other than "label"' };
  }
  for (const [i, row] of data.entries()) {
    if (!isRecord(row) || typeof row.label !== "string") {
      return { error: `Row ${i + 1} needs a string label` };
    }
    for (const key of keys as string[]) {
      if (typeof row[key] !== "number" || !Number.isFinite(row[key])) {
        return { error: `Row ${i + 1} ("${row.label}") needs a number for "${key}"` };
      }
    }
  }
  return { shown: true };
}
