import type { z } from "zod";
import { Sentry } from "@/lib/instrument";

/**
 * Response validation at the API boundary.
 *
 * Every response the web app reads is checked against the schema its
 * endpoint declares in `endpoints.ts`. A mismatch means the API and the app
 * disagree about the contract — a field renamed, dropped, retyped or made
 * nullable — and it is caught here, where the payload enters, instead of
 * surfacing later as `undefined` somewhere in a component.
 *
 * Two behaviours, chosen by build mode:
 *   - strict (dev, test, the contract suite): throw `ContractViolation`.
 *     A mismatch is a bug to fix before it ships.
 *   - report (production): send one Sentry event naming the endpoint and
 *     the failing paths, then carry on with the data as received. A
 *     harmless drift — an extra field, a new enum value — must never take
 *     a page down for users, but it must never go unnoticed either.
 */
export type ContractMode = "strict" | "report";

let modeOverride: ContractMode | null = null;

/** Force a mode (tests and the contract suite). `null` restores the default. */
export function setContractMode(mode: ContractMode | null): void {
  modeOverride = mode;
}

export function contractMode(): ContractMode {
  if (modeOverride) return modeOverride;
  return import.meta.env.MODE === "production" ? "report" : "strict";
}

export class ContractViolation extends Error {
  readonly endpointId: string;
  readonly issues: z.ZodIssue[];

  constructor(endpointId: string, issues: z.ZodIssue[]) {
    const summary = issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    super(`API contract violation on ${endpointId}: ${summary}`);
    this.name = "ContractViolation";
    this.endpointId = endpointId;
    this.issues = issues;
  }
}

/** Check a response against its schema. Returns the parsed value when it
 * conforms, and — in report mode only — the raw value when it does not. */
export function checkResponse<T>(
  endpointId: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const violation = new ContractViolation(endpointId, result.error.issues);
  if (contractMode() === "strict") throw violation;
  Sentry.captureException(violation, {
    tags: { contract_endpoint: endpointId },
    extra: { issues: result.error.issues.slice(0, 20) },
  });
  return data as T;
}
