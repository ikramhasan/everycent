import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { ObjectStorage } from "./index";

/**
 * Objects as files under one directory: development, or a self-hosted server with a persistent
 * volume. The API serves the bytes itself.
 */
export class DiskStorage implements ObjectStorage {
  constructor(readonly root: string) {}

  /** The key's path, refusing one that would leave the root. */
  #path(key: string): string {
    const path = join(this.root, key);
    const inside = relative(this.root, path);
    if (inside === "" || inside.startsWith(`..${sep}`) || inside === "..") {
      throw new Error(`Storage key outside the storage directory: ${key}`);
    }
    return path;
  }

  async put(key: string, body: Uint8Array) {
    const path = this.#path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.#path(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async signedUrl() {
    return null;
  }

  async delete(keys: readonly string[]) {
    for (const key of keys) await rm(this.#path(key), { force: true });
  }
}
