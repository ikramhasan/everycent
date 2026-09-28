import { writeFile } from "node:fs/promises";
import { generateOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from "../openapi-spec";

await writeFile(OPENAPI_FILE, serializeOpenApi(generateOpenApiDocument()));
console.log(`Wrote ${OPENAPI_FILE}`);
