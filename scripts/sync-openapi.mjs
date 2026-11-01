// Refresh src/contract/api-deejaytools.openapi.json, the copy of
// api-deejaytools' committed OpenAPI document that
// src/contract/apiSnapshot.test.ts checks the endpoint catalog against.
//
//   pnpm openapi:sync              # from api-deejaytools' dev branch
//   pnpm openapi:sync main         # from another branch, tag or commit
//   pnpm openapi:sync ../api-deejaytools/docs/openapi.json   # a local file
//
// Commit the result with the change that needs it: CI reads only the copy,
// never the network.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("../src/contract/api-deejaytools.openapi.json", import.meta.url);
const source = process.argv[2] ?? "dev";

let text;
if (existsSync(source)) {
  text = readFileSync(source, "utf8");
} else {
  const url = `https://raw.githubusercontent.com/mini-app-polis/api-deejaytools/${source}/docs/openapi.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  text = await res.text();
}
JSON.parse(text); // refuse anything that is not a JSON document
writeFileSync(target, text);
console.log(`wrote src/contract/api-deejaytools.openapi.json from ${source}`);
