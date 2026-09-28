/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin. Omit in dev (same-origin via the Vite proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
