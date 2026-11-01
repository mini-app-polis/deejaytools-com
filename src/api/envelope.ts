import { z } from "zod";

/**
 * Response envelopes returned by the deejaytools API.
 *
 * Every response body is one of these two shapes: `{ data, meta }` on
 * success, `{ error }` on failure. `parseEnvelope()` in `client.ts` is the
 * only reader in the app — it returns `data` or throws with `error.message`.
 */

/**
 * `meta` on a success. `version` is always "v1". `count` and `total` are the
 * fleet's shared envelope fields: the number of items in `data` and the
 * number that matched (1 and 1 for a single object). Both are optional here,
 * so a response with or without them is accepted; unknown keys are kept.
 */
export const SuccessMetaSchema = z.looseObject({
  version: z.literal("v1"),
  count: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});
export type SuccessMeta = z.infer<typeof SuccessMetaSchema>;

export type SuccessEnvelope<T> = {
  data: T;
  meta: SuccessMeta;
};

export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
};
