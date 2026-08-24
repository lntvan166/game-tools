/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated lowercase SHA-256 hex hashes of valid access codes. */
  readonly VITE_ACCESS_CODE_HASHES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
