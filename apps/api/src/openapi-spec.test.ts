import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from "./openapi-spec";

describe("committed openapi.json", () => {
  it("matches the routes (run `pnpm generate` if this fails)", async () => {
    const committed = await readFile(OPENAPI_FILE, "utf8");
    expect(serializeOpenApi(generateOpenApiDocument())).toBe(committed);
  });

  it("writes the currency codes out once, as a named schema every use refers to", () => {
    const doc = generateOpenApiDocument();
    const text = JSON.stringify(doc);
    expect(text.match(/"AED"/g)).toHaveLength(1);
    const named = (doc.components?.schemas ?? {}) as Record<string, { enum?: string[] }>;
    expect(named.CurrencyCode?.enum).toContain("USD");
    expect(text).toContain('"$ref":"#/components/schemas/CurrencyCode"');
  });

  it("documents every route with an operationId", () => {
    const doc = generateOpenApiDocument();
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, { operationId?: string }>)) {
        expect(op.operationId, `${method.toUpperCase()} ${path}`).toBeTruthy();
      }
    }
  });
});
