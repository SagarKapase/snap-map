# SOAP Migration Workbench — plan and status

From WSDL to a REST design, with the parity tests to prove it. This is the
working plan for the Rank 10 idea in `API-Tooling-Opportunity-Map.docx`; the
product reasoning is there, the build is here.

## The problem, in one paragraph

Banks, insurers, logistics and the public sector run thousands of SOAP
services. Every migration follows the same manual path: open the WSDL in
SoapUI, read `GetAccountBalanceRequest` and its XSD, invent a REST shape,
write a facade, test it by hand. Four services per quarter per developer; a
240-service programme is projected at eleven years and gets cancelled every
eighteen months. No product owns "SOAP to REST" — it is consultancy work.

## What the user sees in the first five minutes

Drop a WSDL on the page and see it as a readable service with a proposed REST
design next to it — and the first OpenAPI file thirty seconds later. Then an
adapter scaffold, parity tests, and the coverage dashboard the programme is
funded on.

## Principles (inherited from Contract Graph)

- **Local-first, but live.** WSDLs stay in the browser (IndexedDB). The one thing that leaves it is the *bridge* — routes and schemas, no traffic — published to the workbench's own server (`/bridge` on the dev and preview servers, or the host named by `VITE_BRIDGE_HOST`) so the REST API answers the moment a WSDL is uploaded.
- **Deterministic, with the reasoning shown.** Every proposed method, path,
  parameter and error code carries a rationale and a confidence. Anything the
  heuristics could not settle is flagged `review` with the alternatives —
  never silently guessed. The XSD → JSON Schema mapping lists every ambiguity
  it met (`xs:choice`, `xs:any`, nillable versus optional, mixed content,
  unions, recursion).
- **Engine first.** Every module under `src/utils/soap/` is framework-free
  and unit tested in Node; the page is a thin view over it, so the same
  engine can later run in a CLI and in CI.
- **Same map.** A migrated WSDL is a service like any other: the generated
  OpenAPI drops straight into Contract Graph and the API Map, so the SOAP
  warehouse service sits on the same map as the REST services.

## Architecture

| Layer | File | Responsibility |
|---|---|---|
| XML | `src/utils/soap/xml.js` | Dependency-free namespace-aware XML parser (declaration, comments, CDATA, PIs, entities, self-closing). Refuses DOCTYPE with internal entities (no billion-laughs), reports position on malformed input. Runs in Node, so the engine needs no DOMParser. |
| WSDL/XSD | `src/utils/soap/wsdl.js` | WSDL 1.1 (`definitions`) and 2.0 (`description`) → one `SoapService` model: endpoints, bindings (style, SOAP 1.1/1.2, transport, soapAction), operations (input/output/faults, message parts → elements), documentation. XSD: elements, complex/simple types, sequence/choice/all, attributes, extension/restriction, enumerations, facets, `nillable`, `minOccurs`/`maxOccurs`, `xs:any`, `xs:list`/`xs:union`. `import`/`include` resolved from attached documents by `schemaLocation` or namespace; unresolved ones become warnings. |
| Schema | `src/utils/soap/jsonSchema.js` | XSD → JSON Schema (OpenAPI 3.0 dialect) with the ambiguity list. Recursive types become `$ref`s; the mapping never loops. |
| Design | `src/utils/soap/design.js` | The REST design proposal: operation names → verb + resource (`GetAccountBalance` → `GET /accounts/{accountId}/balance`), identifier detection from the input message, list versus single, sub-resources, query parameters, request bodies, response codes (200/201/204), fault → HTTP status mapping, collisions, RPC fallback (`POST /accounts/{id}/transfer`) for verbs it does not recognise. Naming conventions (camel/snake/keep) and a version prefix are options. Reviewer overrides (method, path, summary, status) are applied on top and remembered. |
| OpenAPI | `src/utils/soap/openapi.js` | OpenAPI 3.0.3 from an approved design: paths, parameters, request bodies, `components.schemas`, `problem+json` errors, tags per resource, `x-soap-*` provenance on every operation. Emits JSON or YAML. |
| Bridge | `src/utils/soap/bridge.js` | **The adapter that works as generated.** `bridge.json` holds everything the runtime needs per route (element, namespace, SOAPAction, which field is in the path/query/body, response wrapper and result field, fault → status, the schemas with each property’s XML name). A generic runtime turns each REST call into the envelope (schema order, `xsi:nil`, attributes, rpc parts), posts it, parses the answer, maps faults to `problem+json` (declared faults → their status; `Client`/`Sender` → 400; else 500) and returns typed JSON. Node runtime (`adapter.mjs`, zero dependencies) lives here. |
| Host | `server/bridgeHost.mjs`, `server/bridge-host.mjs`, `src/utils/soap/hosting.js` | **Upload a WSDL, get a working REST API.** The app's own server hosts every service's bridge under `/bridge/b/<id>/…` (mounted on `vite dev`/`vite preview`; `npm run bridge` runs it standalone inside a network that can reach the SOAP services, and `VITE_BRIDGE_HOST` points a static build at it). The page publishes the bridge when a service opens and republishes on every design change; the OpenAPI `servers`, the API Map playground and the Parity tab use the hosted URL. Bridges persist as JSON files and survive a restart. |
| Adapters | `src/utils/soap/adapters.js` | Three targets sharing the bridge: Node (`node adapter.mjs`), ASP.NET Core minimal API (`Soap/SoapBridge.cs` + typed models) and Spring Boot (`soap/SoapBridge.java` + records). No SOAP client generation, no TODOs. Identifiers sanitised for C# and Java. |
| Parity | `src/utils/soap/parity.js` | Per operation: a SOAP envelope (built from the XSD with example values), the equivalent REST request, and the comparison rules (normalised JSON, ignoring order and whitespace). Emitted as a plan (`parity.json`), a runnable Node script (`parity.test.mjs`) and cURL for the envelope. The page can **Send** the REST request to the running adapter (all three runtimes allow any origin). |
| Zip | `src/utils/soap/zip.js` | Store-only ZIP writer (CRC-32, local headers, central directory) so a scaffold downloads as one file. |
| Storage | `src/utils/soap/workbench.js` | The programme: WSDL services per user (metadata in localStorage, documents in IndexedDB), attached XSDs, reviewer overrides, per-operation migration status, traffic weights. Export/import of a programme file. |
| Samples | `src/utils/soap/samples.js` | "Regional bank (sample)": `AccountService` (WCF-style document/literal), `WarehouseService` (rpc/literal) with an imported XSD, and a WSDL 2.0 `NotificationService`. |
| Page | `src/pages/SoapWorkbenchPage.jsx` (`/soap`) | Inside the app shell. Left: the programme (services, coverage, add WSDL/XSD by drop, paste or URL). Main: tabs — Contract (the readable WSDL viewer, free funnel), Design (the reviewable proposal), OpenAPI, Adapter, Parity, Coverage. |
| Integration | `src/pages/ContractGraphPage.jsx`, `src/utils/readSpec.js` | Contract Graph accepts a `.wsdl`/`.xml` drop and adds it as a service through the generated OpenAPI. The workbench hands a design to Contract Graph and to the API Map. |

## Design heuristics (the art)

1. **Verb** from the leading word of the operation name:
   `Get/Find/Fetch/Retrieve/Read/List/Search/Query/Lookup/Check/Is/Has/Count…` → GET ·
   `Create/Add/Insert/Register/Submit/Place/Open/New/Send…` → POST ·
   `Update/Set/Modify/Change/Edit/Save/Replace/Assign…` → PUT ·
   `Patch/Adjust/Amend` → PATCH · `Delete/Remove/Cancel/Close/Revoke/Unregister…` → DELETE ·
   a command (`Transfer/Validate/Approve/Calculate/Reserve/Release…`) → POST
   `/{resource}[/{id}]/{command}` with a small confidence cost and no flag ·
   anything else → GET when there is a result and every input is a scalar,
   otherwise POST, at −0.3 and flagged `review` ("No HTTP verb matches
   *Frobnicate*").
2. **Resource** from the remaining words: the first noun is the collection
   (pluralised, conservatively); what follows is a sub-resource (`Balance`,
   `Transactions`). Operations sharing a resource share one tag.
3. **Identifier** from the input message: a scalar field whose name is
   `{resource}Id/Number/Code/Ref/Key…` (or a bare `id`) → path parameter.
   More than one candidate → the one naming the resource wins and the row
   is flagged listing the others.
4. **Clauses**: `…By/For/Of <X>` — when `X` identifies another resource
   (`GetOrdersForCustomer(customerId)`) the route nests
   (`/customers/{customerId}/orders`); otherwise `X` is a required query
   filter.
5. **List versus item**: GET without an identifier is the collection with
   the remaining scalars as query parameters; with one, the item. A GET
   whose input carries structured criteria becomes `POST /…/search` at
   −0.1, flagged as a compromise.
6. **Body**: POST/PUT/PATCH take the input element minus the fields that
   moved to the path or query; GET and DELETE never have a body (a DELETE
   with structured input is flagged).
7. **Responses**: a single `…Result/return/value` field is unwrapped; 201
   for a create with a result, 202 for one-way or resultless creates, 204
   for an empty response element, 200 otherwise.
8. **Errors**: faults map by name — `NotFound/Unknown/Missing` → 404,
   `Invalid/Validation/BadRequest/Malformed` → 400, `Unauthori[sz]ed/
   Authentication/Token/Session` → 401, `Forbidden/Permission/Denied` → 403,
   `Conflict/Duplicate/AlreadyExists/Locked/Stale` → 409, `Insufficient/
   Limit/Quota/Funds` → 422, `Timeout/Unavailable/Busy` → 503,
   `Unsupported/NotImplemented` → 501, everything else → 500 and flagged.
   Every error is RFC 9457 `problem+json`, `type` = `urn:soap-fault:<name>`;
   400 and 404 are added where a request or a path parameter exists.
9. **Collisions**: two operations on the same method and path — the first
   keeps the route (−0.1), the rest get the operation name appended (−0.2);
   all are flagged.
10. **Review**: a row is `review` when its confidence is below 0.7 or it
    carries a reason. A row the reviewer changed is their decision and is
    only flagged when the override itself is broken (a `{param}` that
    matches no request field).

## Tests

`npm test` — Vitest, 79 workbench cases alongside the existing 64:

- **XML** (`soapXml.test.js`, 12): namespaces, CDATA, entities, QName
  resolution, documentation, a 20 000-element document under 3 s; refused:
  empty, non-XML, unclosed/mismatched tags with line and column, two roots,
  unquoted/duplicate attributes, DOCTYPE with an internal subset (billion
  laughs), undeclared prefixes, unknown entities, unterminated comments.
- **WSDL/XSD** (`soapWsdl.test.js`, 16): WCF document/literal with an
  imported XSD, rpc/literal with inline types, WSDL 2.0 with in-only and
  SOAP 1.2, imports resolved by namespace and by base name, `wsdl:import`
  of the abstract half, schemas importing each other, groups/attribute
  groups/extension/restriction/list/union; refused or warned: empty, JSON,
  YAML, HTML, an XSD alone, plain XML, malformed XML with position,
  unresolved import (warning, design still builds), broken attachment,
  missing message, no port type, 25 MB limit, 5 000 operations under 8 s.
- **Design, schema, OpenAPI, Contract Graph** (`soapDesign.test.js`, 17):
  the bank service lands on the eight routes an architect would draw; rpc
  and WSDL 2.0; verbs, identifiers, sub-resources, filters, parents;
  reviewer overrides and how fields move with them; naming conventions
  and base path; fault → status; plurals; flagged rows (unknown verb, two
  identifiers, DELETE/PUT without an id, collisions, unmapped fault);
  empty service, missing messages, duplicate operation names, junk
  overrides, a path parameter with no field; every XSD ambiguity listed
  with its decision; built-ins, bounded arrays, nillable refs, unknown
  types, same local name in two namespaces; the OpenAPI is read back by
  `parseOpenApi`, `normalizeService` and `buildContractGraph` (a
  `customerId` reference edge to a REST Customers service), YAML/JSON
  round-trip, unique operationIds, odd names, skipped → deprecated.
- **Bridge, end to end** (`soapBridge.test.js`, 8): the generated `adapter.mjs` is written to disk, imported and served on an ephemeral port in front of a mock SOAP service that records every envelope: GET path/query → document/literal envelope in schema order with the right namespaces, the reply → typed JSON (arrays, attributes, simple content, `xsi:nil` → null); JSON body → envelope with nested types; declared fault → 404 with `soapDetail`, `soap:Client` → 400, unknown → 500; 204 for an empty response, 202 for one-way with SOAP 1.2 headers; rpc/literal parts unqualified; 400 for bad JSON / missing required; 405/404; CORS preflight; HTML instead of SOAP → 502, unreachable → 502; `xs:any` children kept.
- **Bridge host** (`soapBridgeHost.test.js`, 4): a real host on an ephemeral port in front of a mock SOAP service — publish, call the hosted route through to SOAP, list, republish in place, delete (file gone), 404 for an unknown service; bad JSON / not-a-bridge / bad id / 4 MB+ refused, CORS preflight; middleware passes other paths on; the page's `publishBridge`/`unpublishBridge` contract.
- **Adapter startup** (in `soapBridge.test.js`): missing `bridge.json`, a foreign file and a taken port each exit 1 with the fix in the message.
- **Playground diagnosis** (`playgroundFailure.test.js`, 3): nothing listening locally vs remote host down vs CORS refused vs not a URL.
- **Adapters, parity, ZIP** (`soapArtifacts.test.js`, 14): all three targets
  for all three samples with every route, model, fault and TODO; names that
  are not identifiers (`123-do it!`, `class`, `namespace`, `default`,
  `object`) in both languages; unknown target and empty design refused;
  SOAP 1.1 and 1.2 envelopes with attributes, simple content, `xsi:nil`,
  choice, rpc parts with `xmlns=""`; the REST twin; comparison rules; the
  download set, cURL quoting, a script that parses; skipped operations left
  out; sample values that stop at recursion; ZIP round-trip incl. `..`
  paths, duplicates and UTF-8 names; empty archive and garbage refused.
- **Programme storage** (`soapWorkbench.test.js`, 11): add with
  attachments, attach/replace/detach, rename, ten parallel adds, overrides,
  statuses, options, traffic (and pasted CSV with thousands separators,
  headers, unknown and bad lines), coverage arithmetic incl. the Pareto
  slice, export → import into another account; refused: empty documents,
  unknown services, bad statuses, the 300-service cap, a foreign export
  file; duplicate names suffixed, users isolated, corrupted localStorage.
- **Browser** (Playwright, run against `vite` on this machine, script kept
  outside the repo): empty state → bank sample → every tab; expand a row;
  override a path (marked, not flagged) and a bad override (flagged), reset;
  statuses move the sidebar and coverage; traffic paste with unknown and
  bad lines; refused drops (HTML, XSD alone, JSON, malformed WSDL) and URLs
  (unreachable, not a URL); paste a WSDL without its XSD (warning), attach
  the XSD (warning clears); reload keeps everything; Add to Contract Graph
  opens the workspace with the service; a `.wsdl` dropped on Contract Graph
  joins the map; Home card and product switcher; 400 px wide without
  horizontal overflow; no page errors.

## Turned off for now

**The workbench is disabled** (22 Sep 2026, at the product owner's request) — `SOAP_WORKBENCH` in `src/features.js`, which reads `VITE_SOAP_WORKBENCH`. While it is off:

- the product switcher has no SOAP Workbench entry, Home has no bank sample card, and `/soap` redirects to Home;
- its page is not bundled at all (the flag is a bare `import.meta.env` comparison, so the bundler folds the branch and drops the chunk);
- the bridge host is not mounted on the dev or preview server, so `/bridge/...` serves nothing.

Nothing was deleted: the engine, the page, the host and all 79 of their cases stay in the repository and run on every `npm test`. To bring it back, set `VITE_SOAP_WORKBENCH=on` in the environment `vite` runs in (`.env.local`, or inline: `VITE_SOAP_WORKBENCH=on npm run dev`); nothing else changes.

Contract Graph still reads a dropped, pasted or fetched `.wsdl` — that is its own import path (`readSpecOrWsdl`), unaffected by the flag.

## Status

**Verified outside the unit tests** (this machine, 22 Sep 2026): with only `npm run dev` running, uploading the public `dneonline.com` calculator WSDL made `POST http://localhost:5179/bridge/b/<id>/calculator/add {"intA":120,"intB":140}` answer `260` from curl and from the API Map playground, and Parity **Send** answered 200 — nothing downloaded or started. Earlier (21 Sep): the Node adapter and the compiled .NET adapter (`dotnet build`, 0 warnings) generated for the public `dneonline.com` calculator WSDL both answered `POST /calculator/add {7,5}` → `12` by calling the live SOAP service, mapped a divide-by-zero SOAP fault to `problem+json`, and rejected a missing field with 400; the page’s Parity **Send** button showed the answer coming back through the adapter. The Spring target is generated to the same design but was **not compiled** here (no JDK on this machine) and the page says so.

**Done (this iteration).** Everything in the architecture table: the XML
reader, WSDL 1.1/2.0 and XSD, JSON Schema with the ambiguity list, the
design engine with reviewer overrides and statuses, OpenAPI 3.0.3, .NET and
Spring scaffolds, parity plan + script + envelopes, ZIP download, the
programme store with export/import, the `/soap` page (Contract, Design,
OpenAPI, Adapter, Parity, Coverage), the bank sample with traffic, Contract
Graph and API Map hand-offs, a `.wsdl` drop accepted by Contract Graph, the
Home sample card and the product switcher entry.

## Out of scope for this iteration

Traffic capture from gateways (weights are entered by hand or pasted as
CSV), XSLT generation, consumer impact from Blast Radius (that feature is
not built yet), running the parity tests inside the browser (CORS and SOAP
endpoints on private networks make that a CLI job — the script is
generated for it).
