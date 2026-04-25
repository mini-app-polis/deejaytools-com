import { zValidator as honoZValidator } from "@hono/zod-validator";
import { CommonErrors } from "common-typescript-utils";
import type { ZodSchema } from "zod";

/**
 * Wrapper around @hono/zod-validator that reshapes validation failures
 * into the ecosystem-canonical { error: { code, message } } envelope.
 *
 * Hono's default zValidator returns { success: false, error: ZodError } on
 * failure, which violates API-005 / XSTACK-002 (response envelope shape).
 * This helper passes a hook that returns CommonErrors.validationError(...)
 * so 400s match the same envelope as every other error response.
 *
 * Use this everywhere instead of importing zValidator directly from
 * @hono/zod-validator.
 */
export const zValidator = <T extends ZodSchema>(
  target: "json" | "query" | "param" | "header" | "cookie" | "form",
  schema: T
) =>
  honoZValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(CommonErrors.validationError(result.error.issues), 400);
    }
  });
