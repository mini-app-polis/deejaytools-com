/**
 * The web app's catalog, checked against the API's committed OpenAPI
 * document instead of a running API.
 *
 * api-deejaytools commits the OpenAPI document its app generates
 * (docs/openapi.json, kept current by its own CI). A copy lives beside this
 * file. `checkCatalog()` walks every endpoint in `src/api/endpoints.ts` and
 * asks of the document:
 *   - does the route exist, with that method?
 *   - will every response the API documents satisfy the endpoint's schema:
 *     each field the app requires present, of a type the app accepts, and
 *     null only where the app allows null? And `meta` the envelope the app
 *     reads?
 *   - will the API accept the request body the app sends, where the
 *     endpoint declares one?
 *
 * It is a static check, so it runs in every pull request with no network,
 * and it is deliberately lenient where the document cannot say: an API field
 * typed loosely (any value, a plain string the app narrows to an enum, a
 * dictionary) is not reported. A field the API leaves out only for some
 * requests (`response_model_exclude_unset`) still reads as present. The live
 * contract suite (`api.contract.ts`) remains the check that the running API
 * sends what it documents.
 */
import { z } from "zod";
import { SuccessMetaSchema } from "@/api/envelope";
import type { Endpoint } from "@/api/endpoints";

export type JsonSchema = { [key: string]: unknown } | boolean;

interface OpenApiOperation {
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
}

export interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

/**
 * A schema and the document its `$ref`s point into. `optionalMeansAbsent`
 * says whether a property left out of `required` may really be missing. True
 * for a zod schema. False for the API's document: FastAPI lists a field with
 * a default as optional, without the default, yet always sends it.
 */
interface Side {
  schema: JsonSchema;
  root: unknown;
  optionalMeansAbsent?: boolean;
}

const CONSTRAINING = ["type", "enum", "const", "anyOf", "oneOf", "allOf", "properties", "items", "additionalProperties"];

function obj(s: JsonSchema): Record<string, unknown> {
  return typeof s === "object" && s !== null ? s : {};
}

/** Follow `$ref`s (local JSON pointers) until the schema is not one. */
export function resolve(schema: JsonSchema, root: unknown): JsonSchema {
  let s = schema;
  const seen = new Set<string>();
  while (typeof s === "object" && typeof s.$ref === "string") {
    const ref = s.$ref;
    if (seen.has(ref) || !ref.startsWith("#")) return true;
    seen.add(ref);
    let target: unknown = root;
    for (const part of ref.slice(1).split("/").filter(Boolean)) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      target = (target as Record<string, unknown> | undefined)?.[key];
    }
    if (target === undefined) throw new Error(`Unresolvable $ref ${ref}`);
    // Keywords beside the $ref (a description, a default) are kept.
    const beside = Object.fromEntries(Object.entries(s).filter(([k]) => k !== "$ref"));
    s = { ...(target as Record<string, unknown>), ...beside };
  }
  return s;
}

function types(s: Record<string, unknown>): string[] {
  if (Array.isArray(s.type)) return s.type as string[];
  if (typeof s.type === "string") return [s.type];
  if (s.properties || s.additionalProperties) return ["object"];
  if (s.items) return ["array"];
  return [];
}

function values(s: Record<string, unknown>): unknown[] | null {
  if ("const" in s) return [s.const];
  if (Array.isArray(s.enum)) return s.enum;
  return null;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function accepts(consumerTypes: string[], t: string): boolean {
  return consumerTypes.includes(t) || (t === "integer" && consumerTypes.includes("number"));
}

const at = (path: string) => path || "(root)";

/**
 * Where a value the producer may send would be refused by the consumer:
 * one message per problem, empty when every value the producer's schema
 * allows is one the consumer's schema accepts.
 */
export function incompatibilities(producer: Side, consumer: Side, path = ""): string[] {
  const resolved = resolve(consumer.schema, consumer.root);
  if (resolved === false) return [`${at(path)}: refused outright`];
  const c = obj(resolved);
  if (!CONSTRAINING.some((k) => k in c)) return [];

  const p = obj(resolve(producer.schema, producer.root));
  const next = (schema: JsonSchema): Side => ({ ...producer, schema });
  const cNext = (schema: JsonSchema): Side => ({ ...consumer, schema });

  // `type: ["string", "null"]` is a union too.
  if (Array.isArray(p.type) && p.type.length > 1) {
    return (p.type as string[]).flatMap((t) => incompatibilities(next({ ...p, type: t }), consumer, path));
  }

  // Producer sends any branch of a union: every branch must fit.
  const pBranches = (p.anyOf ?? p.oneOf) as JsonSchema[] | undefined;
  if (pBranches) return pBranches.flatMap((b) => incompatibilities(next(b), consumer, path));
  const pAll = p.allOf as JsonSchema[] | undefined;
  if (pAll?.length === 1) return incompatibilities(next(pAll[0]), consumer, path);

  // Consumer accepts any branch: one must fit. Report the closest miss.
  const cBranches = (c.anyOf ?? c.oneOf) as JsonSchema[] | undefined;
  if (cBranches) {
    const misses = cBranches.map((b) => incompatibilities(producer, cNext(b), path));
    const fit = misses.find((m) => m.length === 0);
    if (fit) return [];
    return misses.reduce((best, m) => (m.length < best.length ? m : best));
  }
  const cAll = c.allOf as JsonSchema[] | undefined;
  if (cAll) return cAll.flatMap((b) => incompatibilities(producer, cNext(b), path));

  const pValues = values(p);
  const pTypes = types(p);
  // A producer that says nothing about its values cannot be checked.
  if (!pValues && pTypes.length === 0) return [];

  const cValues = values(c);
  const cTypes = types(c);
  if (pValues) {
    const issues: string[] = [];
    for (const v of pValues) {
      if (cValues && !cValues.some((cv) => JSON.stringify(cv) === JSON.stringify(v))) {
        issues.push(`${at(path)}: may be ${JSON.stringify(v)}, which the other side does not accept`);
      } else if (!cValues && cTypes.length && !accepts(cTypes, typeOf(v))) {
        issues.push(`${at(path)}: may be ${JSON.stringify(v)}, expected ${cTypes.join(" | ")}`);
      }
    }
    return issues;
  }

  const issues: string[] = [];
  for (const t of pTypes) {
    if (cTypes.length && !accepts(cTypes, t)) {
      issues.push(`${at(path)}: may be ${t}, expected ${cTypes.join(" | ")}`);
      continue;
    }
    if (t === "object") issues.push(...objectIssues(p, c, producer, consumer, path));
    if (t === "array" && c.items !== undefined) {
      issues.push(...incompatibilities(next((p.items as JsonSchema) ?? true), cNext(c.items as JsonSchema), `${path}[]`));
    }
  }
  return issues;
}

function objectIssues(
  p: Record<string, unknown>,
  c: Record<string, unknown>,
  producer: Side,
  consumer: Side,
  path: string
): string[] {
  const next = (schema: JsonSchema): Side => ({ ...producer, schema });
  const cNext = (schema: JsonSchema): Side => ({ ...consumer, schema });
  const issues: string[] = [];
  const pProps = (p.properties ?? {}) as Record<string, JsonSchema>;
  const pRequired = new Set((p.required ?? []) as string[]);
  const pExtra = p.additionalProperties;
  const cRequired = new Set((c.required ?? []) as string[]);
  for (const [key, cs] of Object.entries((c.properties ?? {}) as Record<string, JsonSchema>)) {
    const where = path ? `${path}.${key}` : key;
    let ps = pProps[key];
    if (ps === undefined) {
      // A dictionary producer may send the key; nothing says it will.
      if (typeof pExtra === "object" && pExtra !== null) ps = pExtra as JsonSchema;
      else {
        if (cRequired.has(key)) issues.push(`${where}: required, but not in the schema`);
        continue;
      }
    } else if (producer.optionalMeansAbsent && cRequired.has(key) && !pRequired.has(key)) {
      issues.push(`${where}: required, but may be left out`);
    }
    issues.push(...incompatibilities(next(ps), cNext(cs), where));
  }
  const cExtra = c.additionalProperties;
  if (typeof cExtra === "object" && cExtra !== null && typeof pExtra === "object" && pExtra !== null) {
    issues.push(...incompatibilities(next(pExtra as JsonSchema), cNext(cExtra as JsonSchema), `${path}{}`));
  }
  return issues;
}

/** A zod schema as JSON Schema: what it accepts (`input`) or produces (`output`). */
export function zodSide(schema: z.ZodType, io: "input" | "output"): Side {
  const json = z.toJSONSchema(schema, { io, unrepresentable: "any", cycles: "ref", reused: "inline" });
  return { schema: json as JsonSchema, root: json, optionalMeansAbsent: true };
}

/** The OpenAPI path template a request path would be served by, if any. */
export function matchPath(doc: OpenApiDocument, path: string): string | undefined {
  const segments = path.split("?")[0].split("/");
  let best: { template: string; literal: number } | undefined;
  for (const template of Object.keys(doc.paths)) {
    const parts = template.split("/");
    if (parts.length !== segments.length) continue;
    let literal = 0;
    const ok = parts.every((part, i) => {
      if (/^\{[^}]+\}$/.test(part)) return segments[i] !== "";
      if (part !== segments[i]) return false;
      literal++;
      return true;
    });
    if (ok && (!best || literal > best.literal)) best = { template, literal };
  }
  return best?.template;
}

/** Path parameters stand-in: every parameter reads as this value. */
const PARAM = "param";
const anyParams = new Proxy({}, { get: () => PARAM });

const JSON_TYPE = "application/json";

/** What the endpoint's route answers on success, from the document. */
function successSchemas(op: OpenApiOperation): { status: string; schema: JsonSchema | undefined }[] {
  return Object.entries(op.responses ?? {})
    .filter(([status]) => status.startsWith("2"))
    .map(([status, r]) => ({ status, schema: r.content?.[JSON_TYPE]?.schema }));
}

/** Every disagreement between one endpoint and the document. */
export function checkEndpointAgainst(doc: OpenApiDocument, ep: Endpoint<unknown, unknown, unknown>): string[] {
  const path = ep.path(anyParams);
  const template = matchPath(doc, path);
  if (!template) return [`${ep.id}: no route for ${ep.method} ${path.split("?")[0]}`];
  const op = doc.paths[template][ep.method.toLowerCase()];
  if (!op) return [`${ep.id}: ${template} has no ${ep.method}`];
  const label = `${ep.id} (${ep.method} ${template})`;
  const api = (schema: JsonSchema): Side => ({ schema, root: doc });
  const issues: string[] = [];

  const successes = successSchemas(op);
  if (successes.length === 0) issues.push(`${label}: documents no success response`);
  if (ep.response !== null) {
    const app = zodSide(ep.response, "input");
    for (const { status, schema } of successes) {
      if (!schema) {
        issues.push(`${label}: ${status} has no JSON body, the app reads one`);
        continue;
      }
      if (ep.envelope === false) {
        issues.push(...incompatibilities(api(schema), app, "").map((m) => `${label} ${status} ${m}`));
        continue;
      }
      const body = obj(resolve(schema, doc));
      const props = (body.properties ?? {}) as Record<string, JsonSchema>;
      if (!props.data || !props.meta) {
        issues.push(`${label}: ${status} is not the {data, meta} envelope`);
        continue;
      }
      issues.push(...incompatibilities(api(props.data), app, "data").map((m) => `${label} ${status} ${m}`));
      issues.push(
        ...incompatibilities(api(props.meta), zodSide(SuccessMetaSchema, "input"), "meta").map(
          (m) => `${label} ${status} ${m}`
        )
      );
    }
  }

  if (ep.request) {
    const body = op.requestBody?.content?.[JSON_TYPE]?.schema;
    if (!body) issues.push(`${label}: the app sends a JSON body the route does not document`);
    else {
      issues.push(
        ...incompatibilities(zodSide(ep.request, "input"), api(body), "body").map((m) => `${label} request ${m}`)
      );
    }
  }
  return issues;
}

/** Every disagreement between the catalog and the document. */
export function checkCatalog(doc: OpenApiDocument, catalog: Endpoint<unknown, unknown, unknown>[]): string[] {
  return catalog.flatMap((ep) => checkEndpointAgainst(doc, ep));
}
