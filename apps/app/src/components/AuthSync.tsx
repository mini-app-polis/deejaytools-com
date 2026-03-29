import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect } from "react";

const SESSION_KEY = "deejaytools_auth_sync_v1";

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
      console.warn("[AuthSync] Missing primary email; skipping sync");
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
          console.warn("[AuthSync] No session token");
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
          console.error("[AuthSync] POST /v1/auth/sync failed", res.status, await res.text());
        }
      } catch (err) {
        console.error("[AuthSync] sync error", err);
      }
    })();
  }, [authLoaded, userLoaded, isSignedIn, user, getToken]);

  return null;
}
