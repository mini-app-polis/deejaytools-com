import { vi } from "vitest";

process.env.CLERK_JWKS_URL ??= "https://clerk.test/.well-known/jwks.json";
process.env.NODE_ENV ??= "test";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));
