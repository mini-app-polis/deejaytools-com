/**
 * The web app's endpoint catalog against api-deejaytools' committed OpenAPI
 * document (the copy beside this file). Runs with the unit tests, so a pull
 * request here — and api-deejaytools' own pull requests, which run this test
 * with their new document in place of the copy — fail when the two disagree.
 *
 * Refresh the copy from api-deejaytools' dev branch with
 * `pnpm openapi:sync`.
 */
import { describe, expect, it } from "vitest";
import { allEndpoints } from "@/api/endpoints";
import snapshot from "./api-deejaytools.openapi.json?raw";
import { checkCatalog, type OpenApiDocument } from "./openapiCheck";

describe("the endpoint catalog against the API's OpenAPI snapshot", () => {
  it("finds every route, and every schema the app relies on, in the document", () => {
    const doc = JSON.parse(snapshot) as OpenApiDocument;
    expect(checkCatalog(doc, allEndpoints())).toEqual([]);
  });
});
