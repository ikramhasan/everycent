import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentOperations, type OpenApiDocument } from "../agents/operations";
import { toolSchema } from "./assistant";

const doc = JSON.parse(
  readFileSync(new URL("../../../openapi.json", import.meta.url), "utf8"),
) as OpenApiDocument;
const operation = (name: string) => {
  const op = agentOperations(doc).find((o) => o.name === name);
  if (!op) throw new Error(`no ${name}`);
  return op;
};

describe("assistant tool schemas", () => {
  it("inline every reference, since the Anthropic adapter drops $defs", () => {
    for (const op of agentOperations(doc)) {
      const schema = JSON.stringify(toolSchema(op.inputSchema, !op.readOnly));
      expect(schema, op.name).not.toContain("$ref");
      expect(schema, op.name).not.toContain("$defs");
    }
    const body = (
      toolSchema(operation("createTransaction").inputSchema, true) as {
        properties: { body: { type: string; properties: Record<string, unknown> } };
      }
    ).properties.body;
    expect(body.type).toBe("object");
    expect(Object.keys(body.properties)).toContain("accountId");
  });

  it("leave out budgetId, and ask a change for a plain-language summary", () => {
    const change = toolSchema(operation("createTransaction").inputSchema, true) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(change.properties).not.toHaveProperty("budgetId");
    expect(change.required).toEqual(expect.arrayContaining(["summary", "body"]));
    expect(change.required).not.toContain("budgetId");
    const read = toolSchema(operation("listAccounts").inputSchema, false) as {
      properties: Record<string, unknown>;
    };
    expect(read.properties).not.toHaveProperty("summary");
  });
});
