import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";

// Keyed by Clerk user id. A bare key would survive a sign-out/sign-in in the
// same tab and suppress the sync for whoever signed in second, leaving them
// with a session Clerk considers valid and an API that 401s every call.
const sessionKey = (userId: string) => `deejaytools_auth_sync_v1:${userId}`;

// The sync creates the row requireAuth looks up. A user without one gets
// USER_NOT_SYNCED (401) on every authenticated endpoint, so a failure here is
// not cosmetic -- it is a broken session. Retry a few times, then stop rather
// than hammer the API from a render loop.
const MAX_ATTEMPTS = 3;

const logger = createLogger("deejaytools-app");

export default function AuthSync() {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  // In-flight guard. StrictMode invokes effects twice in development, and a
  // re-render can re-enter before the request resolves; sessionStorage cannot
  // dedupe that because it is only written once the sync has succeeded.
  const inFlight = useRef(false);
  const attempts = useRef(0);

  useEffect(() => {
    if (!authLoaded || !userLoaded || !isSignedIn || !user) {
      return;
    }

    const key = sessionKey(user.id);
    if (sessionStorage.getItem(key)) {
      return;
    }
    if (inFlight.current || attempts.current >= MAX_ATTEMPTS) {
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) {
      logger.warn({
        event: "auth_sync_skipped",
        category: "api",
        context: { reason: "missing_primary_email" },
      });
      return;
    }

    const base = import.meta.env.VITE_API_URL ?? "";
    const body = {
      email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      displayName: user.fullName ?? undefined,
    };

    inFlight.current = true;
    attempts.current += 1;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          logger.warn({
            event: "auth_sync_skipped",
            category: "api",
            context: { reason: "no_session_token", attempt: attempts.current },
          });
          return;
        }

        const res = await fetch(`${base}/v1/auth/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          logger.error({
            event: "auth_sync_failed",
            category: "api",
            context: { status: res.status, body: await res.text(), attempt: attempts.current },
          });
          return;
        }

        // Only now is the row guaranteed to exist. Marking success earlier is
        // what turned a single transient failure into a session that 401s
        // every request and never retries.
        sessionStorage.setItem(key, "1");
      } catch (err) {
        logger.error({
          event: "auth_sync_error",
          category: "api",
          error: err,
          context: { attempt: attempts.current },
        });
      } finally {
        inFlight.current = false;
      }
    })();
  }, [authLoaded, userLoaded, isSignedIn, user, getToken]);

  return null;
}
