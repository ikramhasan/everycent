import { v7 } from "uuid";

/** Primary keys for every table: time-ordered UUIDv7 strings, generated in app code. */
export function newId(): string {
  return v7();
}
