import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { createLogger } from "@/lib/logger";

const SESSION_KEY = "deejaytools_auth_sync_v1";
const logger = createLogger("deejaytools-app");

export default function AuthSync() {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  useEffect(() => {
    if (!authLoaded || !userLoaded || !isSignedIn || !user) {
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY)) {
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

    sessionStorage.setItem(SESSION_KEY, "1");

    const base = import.meta.env.VITE_API_URL ?? "";
    const body = {
      email,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      displayName: user.fullName ?? undefined,
    };

    void (async () => {
      try {
        const token = await getToken();
        if (!token) {
          logger.warn({
            event: "auth_sync_skipped",
            category: "api",
            context: { reason: "no_session_token" },
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
            context: { status: res.status, body: await res.text() },
          });
        }
      } catch (err) {
        logger.error({
          event: "auth_sync_error",
          category: "api",
          error: err,
        });
      }
    })();
  }, [authLoaded, userLoaded, isSignedIn, user, getToken]);

  return null;
}
