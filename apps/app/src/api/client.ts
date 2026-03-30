import type { ErrorEnvelope, PartnerRole, SuccessEnvelope } from "@deejaytools/ts-utils";

/** Partner record from `/v1/partners`. */
export type Partner = {
  id: string;
  first_name: string;
  last_name: string;
  partner_role: PartnerRole;
  email: string | null;
};
import { useAuth } from "@clerk/clerk-react";
import { useCallback, useMemo } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!res.ok || "error" in json) {
    const msg =
      "error" in json ? json.error.message : `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return json.data;
}

export function useApiClient() {
  const { getToken } = useAuth();

  const withAuth = useCallback(
    async (init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return { ...init, headers };
    },
    [getToken]
  );

  const get = useCallback(
    async <T>(path: string) => {
      const res = await fetch(`${base}${path}`, await withAuth());
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const post = useCallback(
    async <T>(path: string, body?: unknown) => {
      const res = await fetch(
        `${base}${path}`,
        await withAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })
      );
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const postForm = useCallback(
    async <T>(path: string, form: FormData) => {
      const res = await fetch(`${base}${path}`, await withAuth({ method: "POST", body: form }));
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const patch = useCallback(
    async <T>(path: string, body: unknown) => {
      const res = await fetch(
        `${base}${path}`,
        await withAuth({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const del = useCallback(
    async (path: string) => {
      const res = await fetch(`${base}${path}`, await withAuth({ method: "DELETE" }));
      if (res.status === 204) return;
      await parseEnvelope<unknown>(res);
    },
    [withAuth]
  );

  return useMemo(
    () => ({
      get,
      post,
      postForm,
      patch,
      del,
    }),
    [get, post, postForm, patch, del]
  );
}
