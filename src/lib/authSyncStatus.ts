/**
 * Whether this tab's POST /v1/auth/sync has settled.
 *
 * GET /v1/auth/me answers 401 USER_NOT_SYNCED until the sync has created the
 * caller's users row. On a brand-new account AuthSync and the first /me start
 * together, so /me can lose that race; useAuthMe then waits here before
 * asking once more. AuthSync reports when a sync starts and when it has
 * finished (succeeded, failed, or was not needed).
 */
type Status = "unknown" | "pending" | "settled";

let status: Status = "unknown";
let waiters: (() => void)[] = [];

/** How long /me waits for a sync that has not reported back. */
export const AUTH_SYNC_WAIT_MS = 10_000;

export function markAuthSyncPending(): void {
  status = "pending";
}

export function markAuthSyncSettled(): void {
  status = "settled";
  const settled = waiters;
  waiters = [];
  for (const done of settled) done();
}

/** Forgets the status, as on sign-out: the next account syncs afresh. */
export function resetAuthSyncStatus(): void {
  status = "unknown";
}

/**
 * Resolves once the sync has settled — at once if it already has, or after
 * `timeoutMs` if it never reports back.
 */
export function waitForAuthSync(timeoutMs = AUTH_SYNC_WAIT_MS): Promise<void> {
  if (status === "settled") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters = waiters.filter((w) => w !== done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    waiters.push(done);
  });
}
