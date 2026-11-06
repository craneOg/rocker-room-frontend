/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

/** Set by vite.config.ts from package.json. */
declare const __APP_VERSION__: string
