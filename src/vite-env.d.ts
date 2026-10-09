/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_COMMIT_SHA?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  /** Injected by vite.config.ts from SENTRY_DSN_DEEJAYTOOLS; "" when unset. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_MAINTENANCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
