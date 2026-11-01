import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allEndpoints, endpoints, type Endpoint } from "@/api/endpoints";
import snapshot from "./api-deejaytools.openapi.json?raw";
import {
  checkCatalog,
  checkEndpointAgainst,
  incompatibilities,
  matchPath,
  type JsonSchema,
  type OpenApiDocument,
  resolve,
  zodSide,
} from "./openapiCheck";

type AnyEndpoint = Endpoint<unknown, unknown, unknown>;

const api = (schema: JsonSchema, root: unknown = {}) => ({ schema, root });
const check = (producer: JsonSchema, consumer: z.ZodType) =>
  incompatibilities(api(producer), zodSide(consumer, "input"));

function realDocument(): OpenApiDocument {
  return JSON.parse(snapshot) as OpenApiDocument;
}

/** The real document with one component schema edited. */
function edited(name: string, edit: (schema: Record<string, unknown>) => void): OpenApiDocument {
  const doc = realDocument();
  edit(doc.components!.schemas![name] as Record<string, unknown>);
  return doc;
}

describe("the real snapshot catches what would break the app", () => {
  it("a renamed field", () => {
    const doc = edited("SessionData", (s) => {
      const props = s.properties as Record<string, unknown>;
      props.title = props.name;
      delete props.name;
      s.required = (s.required as string[]).map((r) => (r === "name" ? "title" : r));
    });
    expect(checkEndpointAgainst(doc, endpoints.sessions.get as AnyEndpoint)).toEqual([
      "sessions.get (GET /v1/sessions/{id}) 200 data.name: required, but not in the schema",
    ]);
  });

  it("a field made nullable, and a retyped one", () => {
    const doc = edited("SessionData", (s) => {
      const props = s.properties as Record<string, Record<string, unknown>>;
      props.name = { anyOf: [{ type: "string" }, { type: "null" }] };
      props.created_at = { type: "string" };
    });
    const issues = checkEndpointAgainst(doc, endpoints.sessions.get as AnyEndpoint);
    expect(issues).toContain("sessions.get (GET /v1/sessions/{id}) 200 data.name: may be null, expected string");
    expect(issues.some((i) => i.includes("data.created_at: may be string"))).toBe(true);
  });

  it("a removed route, and a removed method", () => {
    const doc = realDocument();
    delete doc.paths["/v1/divisions"];
    delete doc.paths["/v1/teams/{id}"].delete;
    expect(checkCatalog(doc, [endpoints.divisions.list, endpoints.teams.remove] as AnyEndpoint[])).toEqual([
      "divisions.list: no route for GET /v1/divisions",
      "teams.remove: /v1/teams/{id} has no DELETE",
    ]);
  });

  it("a request field the API starts to require", () => {
    const doc = edited("CreateCheckinBody", (s) => {
      s.required = [...(s.required as string[]), "notes"];
    });
    expect(checkEndpointAgainst(doc, endpoints.checkins.create as AnyEndpoint)).toEqual([
      "checkins.create (POST /v1/checkins) request body.notes: required, but may be left out",
    ]);
  });

  it("a meta the app does not read", () => {
    const doc = edited("Meta", (s) => {
      (s.properties as Record<string, unknown>).count = { type: "string" };
    });
    const issues = checkEndpointAgainst(doc, endpoints.divisions.list as AnyEndpoint);
    expect(issues).toEqual(["divisions.list (GET /v1/divisions) 200 meta.count: may be string, expected integer"]);
  });

  it("and passes the catalog as it is", () => {
    expect(checkCatalog(realDocument(), allEndpoints())).toEqual([]);
  });
});

describe("incompatibilities", () => {
  it("accepts anything when the consumer constrains nothing, or the producer says nothing", () => {
    expect(check({ type: "string" }, z.unknown())).toEqual([]);
    expect(check({}, z.string())).toEqual([]);
  });

  it("checks enums and constants against the consumer's values and types", () => {
    expect(check({ enum: ["a", "b"] }, z.enum(["a", "b", "c"]))).toEqual([]);
    expect(check({ enum: ["a", "d"] }, z.enum(["a", "b"]))).toEqual([
      '(root): may be "d", which the other side does not accept',
    ]);
    expect(check({ const: 3 }, z.string())).toEqual(["(root): may be 3, expected string"]);
    // A plain string the app narrows to an enum cannot be checked.
    expect(check({ type: "string" }, z.enum(["a"]))).toEqual([]);
  });

  it("accepts an integer where a number is expected, not the reverse", () => {
    expect(check({ type: "integer" }, z.number())).toEqual([]);
    expect(check({ type: "number" }, z.number().int())).toEqual(["(root): may be number, expected integer"]);
  });

  it("requires every producer branch to fit some consumer branch", () => {
    expect(check({ type: ["string", "null"] }, z.string().nullable())).toEqual([]);
    expect(check({ anyOf: [{ type: "string" }, { type: "null" }] }, z.string())).toEqual([
      "(root): may be null, expected string",
    ]);
    expect(check({ oneOf: [{ type: "integer" }] }, z.union([z.string(), z.number()]))).toEqual([]);
    expect(check({ allOf: [{ type: "boolean" }] }, z.string())).toEqual(["(root): may be boolean, expected string"]);
  });

  it("checks array items, dictionaries and objects", () => {
    expect(check({ type: "array", items: { type: "string" } }, z.array(z.number()))).toEqual([
      "[]: may be string, expected number",
    ]);
    expect(check({ type: "array" }, z.array(z.number()))).toEqual([]);
    expect(
      check({ type: "object", additionalProperties: { type: "integer" } }, z.record(z.string(), z.string()))
    ).toEqual(["{}: may be integer, expected string"]);
    // A dictionary may hold the key the app requires; its type is checked.
    expect(check({ type: "object", additionalProperties: { type: "boolean" } }, z.object({ ok: z.literal(true) }))).toEqual(
      []
    );
    expect(
      check(
        { type: "object", properties: { a: { type: "string" } } },
        z.object({ a: z.string(), b: z.string().optional(), c: z.number() })
      )
    ).toEqual(["c: required, but not in the schema"]);
  });

  it("checks both sides of an intersection, and a consumer that refuses everything", () => {
    const both = z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() }));
    expect(check({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, both)).toEqual([
      "b: required, but not in the schema",
    ]);
    expect(incompatibilities(api({ type: "string" }), api(false))).toEqual(["(root): refused outright"]);
  });
});

describe("resolve", () => {
  const root = { components: { schemas: { A: { type: "string" }, "a/b": { $ref: "#/components/schemas/A" } } } };

  it("follows refs, escaped ones included, and keeps the keywords beside them", () => {
    expect(resolve({ $ref: "#/components/schemas/a~1b", description: "x" }, root)).toEqual({
      type: "string",
      description: "x",
    });
  });

  it("gives up on cycles and external refs, and throws on a dangling one", () => {
    expect(resolve({ $ref: "#/c" }, { c: { $ref: "#/c" } })).toBe(true);
    expect(resolve({ $ref: "other.json#/A" }, root)).toBe(true);
    expect(() => resolve({ $ref: "#/components/schemas/Z" }, root)).toThrow("Unresolvable $ref");
  });
});

describe("matchPath", () => {
  const doc: OpenApiDocument = { paths: { "/v1/x/{id}": {}, "/v1/x/mine": {}, "/v1/y": {} } };

  it("prefers the template with the most literal segments, and ignores the query", () => {
    expect(matchPath(doc, "/v1/x/mine")).toBe("/v1/x/mine");
    expect(matchPath(doc, "/v1/x/abc")).toBe("/v1/x/{id}");
    expect(matchPath(doc, "/v1/y?q=1")).toBe("/v1/y");
    expect(matchPath(doc, "/v1/x/")).toBeUndefined();
    expect(matchPath(doc, "/v1/z")).toBeUndefined();
  });
});

describe("checkEndpointAgainst", () => {
  const ep = (over: Partial<AnyEndpoint>): AnyEndpoint => ({
    id: "t.ep",
    method: "GET",
    access: "public",
    path: () => "/v1/t",
    response: z.object({ a: z.string() }),
    ...over,
  });
  const doc = (op: Record<string, unknown>): OpenApiDocument => ({
    paths: { "/v1/t": { get: op, post: op } },
    components: { schemas: { Meta: { type: "object", properties: { version: { type: "string" } }, required: ["version"] } } },
  });
  const json = (schema: JsonSchema) => ({ content: { "application/json": { schema } } });

  it("reports a route with no success, or with one that has no JSON body", () => {
    expect(checkEndpointAgainst(doc({ responses: {} }), ep({}))).toEqual(["t.ep (GET /v1/t): documents no success response"]);
    expect(checkEndpointAgainst(doc({ responses: { "200": {} } }), ep({}))).toEqual([
      "t.ep (GET /v1/t): 200 has no JSON body, the app reads one",
    ]);
  });

  it("reports a body outside the envelope, and checks a bare body whole", () => {
    expect(checkEndpointAgainst(doc({ responses: { "200": json({ type: "object" }) } }), ep({}))).toEqual([
      "t.ep (GET /v1/t): 200 is not the {data, meta} envelope",
    ]);
    const bare = doc({ responses: { "200": json({ type: "object", properties: { a: { type: "integer" } } }) } });
    expect(checkEndpointAgainst(bare, ep({ envelope: false }))).toEqual([
      "t.ep (GET /v1/t) 200 a: may be integer, expected string",
    ]);
  });

  it("only needs the route for an endpoint with no response body", () => {
    expect(checkEndpointAgainst(doc({ responses: { "204": {} } }), ep({ method: "DELETE", response: null }))).toEqual([
      "t.ep: /v1/t has no DELETE",
    ]);
    expect(checkEndpointAgainst(doc({ responses: { "204": {} } }), ep({ response: null }))).toEqual([]);
  });

  it("reports a request body the route does not document", () => {
    const envelope = json({
      type: "object",
      properties: { data: { type: "object", properties: { a: { type: "string" } } }, meta: { $ref: "#/components/schemas/Meta" } },
    });
    expect(
      checkEndpointAgainst(doc({ responses: { "200": envelope } }), ep({ method: "POST", request: z.object({}) }))
    ).toEqual(["t.ep (POST /v1/t): the app sends a JSON body the route does not document"]);
  });
});
