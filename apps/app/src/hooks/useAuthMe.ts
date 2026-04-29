import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ApiAuthMe } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";

/** Re-exported alias so callers can import `AuthMe` from this module. */
export type AuthMe = ApiAuthMe;

export function useAuthMe() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApiClient();
  const [me, setMe] = useState<ApiAuthMe | null>(null);
  const [fetching, setFetching] = useState(false);

  const reload = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setMe(null);
      return;
    }
    setFetching(true);
    try {
      const row = await api.get<ApiAuthMe>("/v1/auth/me");
      setMe(row);
    } catch (e) {
      setMe(null);
      toast.error(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setFetching(false);
    }
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!isSignedIn) {
      setMe(null);
      return;
    }
    void reload();
  }, [isLoaded, isSignedIn, reload]);

  // Keep loading=true until we actually have a me record (or know user isn't signed in),
  // otherwise AdminGuard can fire a redirect before the fetch even starts.
  const loading = !isLoaded || fetching || (isSignedIn === true && me === null);

  return {
    me,
    loading,
    reload,
    isAdmin: me?.role === "admin",
  };
}
