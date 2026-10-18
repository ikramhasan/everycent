import type { Context } from "hono";
import { principalFromEnv } from "../agents/principal";
import { AppError } from "../errors";
import type { ObjectStorage, ServeOptions } from "./index";
import { contentDisposition } from "./s3";

/** Storage, or 503 when this server has none (no bucket in production). */
export function requireStorage(storage: ObjectStorage | null): ObjectStorage {
  if (!storage) {
    throw new AppError(
      503,
      "ATTACHMENTS_DISABLED",
      "File uploads are turned off on this server (it has no file storage)",
    );
  }
  return storage;
}

/**
 * Hands a stored file to the browser: a redirect to a signed link where storage has them (a
 * bucket), otherwise the bytes. The browser keeps either for `maxAgeSeconds` (never a shared cache),
 * less than the link lasts; callers put the file's version in the URL so a new one isn't hidden.
 * An agent's request (run in-process for an MCP tool or Agent Auth capability) always gets the
 * bytes: it hands the file to the agent as content, and a signed link would put a working bearer
 * URL in the agent's transcript.
 */
export async function serveStored(
  c: Context,
  storage: ObjectStorage,
  key: string,
  serve: ServeOptions & { maxAgeSeconds: number },
) {
  const { maxAgeSeconds, ...options } = serve;
  c.header("Cache-Control", `private, max-age=${maxAgeSeconds}`);
  const url = principalFromEnv(c.env) ? null : await storage.signedUrl(key, options);
  if (url) return c.redirect(url, 302);
  const bytes = await storage.get(key);
  if (!bytes) throw new AppError(404, "NOT_FOUND", "The file is missing");
  return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
    "Content-Type": options.contentType,
    "Content-Length": String(bytes.byteLength),
    "Content-Disposition": contentDisposition(options.fileName, options.download),
    "X-Content-Type-Options": "nosniff",
    // Served from the app's own origin: an SVG's scripts must not run here.
    "Content-Security-Policy":
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  });
}
