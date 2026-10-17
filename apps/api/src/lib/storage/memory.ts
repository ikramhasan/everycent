import type { ObjectStorage } from "./index";

/** Objects in a map: tests read what was stored (`objects`). */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }

  async signedUrl() {
    return null;
  }

  async delete(keys: readonly string[]) {
    for (const key of keys) this.objects.delete(key);
  }
}
