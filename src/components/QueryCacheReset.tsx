import { useAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Most query keys carry no user id, so a sign-out followed by another sign-in
 * in the same tab would show the first user's cached lists to the second.
 * Clears the cache whenever the Clerk user id changes after it first loads.
 */
export default function QueryCacheReset() {
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const id = userId ?? null;
    if (previous.current !== undefined && previous.current !== id) {
      queryClient.clear();
    }
    previous.current = id;
  }, [isLoaded, userId, queryClient]);

  return null;
}
