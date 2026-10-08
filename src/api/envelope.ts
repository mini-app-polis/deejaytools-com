/**
 * Response envelopes returned by the deejaytools API.
 *
 * Every response body is one of these two shapes: `{ data, meta }` on
 * success, `{ error }` on failure. `parseEnvelope()` in `client.ts` is the
 * only reader — it returns `data` or throws with `error.message`.
 */

export type SuccessEnvelope<T> = {
  data: T;
  meta: {
    version: "v1";
    count?: number;
  } & Record<string, unknown>;
};

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
};
