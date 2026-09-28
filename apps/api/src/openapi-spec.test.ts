import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from "./openapi-spec";

describe("committed openapi.json", () => {
  it("matches the routes (run `pnpm generate` if this fails)", async () => {
    const committed = await readFile(OPENAPI_FILE, "utf8");
    expect(serializeOpenApi(generateOpenApiDocument())).toBe(committed);
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
