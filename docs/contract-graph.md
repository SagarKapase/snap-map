# Contract Graph — plan and status

Contract Graph is the multi-service map: import every API contract an
organisation has and see what only shows up *between* them. This document is
the working plan; the product reasoning behind it is in
`API-Tooling-Opportunity-Map.docx`.

## Principles

- **Local-first.** Specifications stay in the browser (IndexedDB) unless a team
  workspace is chosen later. Signing in namespaces workspaces; it uploads nothing.
- **Evidence, not guesses.** Every edge, duplicate and concept carries the
  evidence it was built from and a confidence. Anything inferred from examples
  rather than declared is marked `inferred`. Nothing is joined on a guessed
  synonym or abbreviation.
- **Engine first.** `src/utils/contractGraph.js` is framework-free and unit
  tested; the page is a thin view over it, so the same analysis can later run
  in a CLI and in CI.

## Architecture

| Layer | File | Responsibility |
|---|---|---|
| Engine | `src/utils/contractGraph.js` | `normalizeService`, `buildContractGraph`, `impactOf`, `toMermaid`; shared entities, inconsistent models, duplicate endpoints, call/reference/share edges, concept clusters, findings |
| Layout | `src/utils/serviceLayout.js` | Deterministic force layout for the map |
| Storage | `src/utils/contractWorkspace.js` | Workspaces per user; metadata in localStorage, specs in IndexedDB; export/import file |
| Samples | `src/utils/contractSamples.js` | The "Northwind (sample)" estate, labelled as sample |
| Auth | `src/utils/auth.js`, `src/components/auth/*` | Provider interface: Supabase (GoTrue REST) when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, otherwise a local-only account (PBKDF2 via WebCrypto) that says so on the page |
| Pages | `src/pages/ContractGraphPage.jsx`, `LoginPage.jsx`, `SignupPage.jsx` | `/graph`, `/login`, `/signup` |
| Views | `src/components/contractgraph/*` | Map, Entities, Duplicates, Concepts, Findings, inspector |

The single-spec workspace hands its document to the map through
"Add to Contract Graph" (command palette and the import screen's tools).

## Rules the engine applies

- **Path shape**: base and `{{vars}}` removed, `v1`/`api` prefixes dropped,
  parameters → `{}`, plurals singularised. Same method + shape = duplicate;
  same method + resource with ≥50 % response-field overlap = near-duplicate.
  Collections are never producers, so their requests are call edges, not duplicates.
- **Entities**: declared schemas, or (when none) shapes inferred from resource
  responses and marked inferred. Same name across services → shared; differing
  fields or types → inconsistent, with a side-by-side diff.
- **Edges**: `calls` (a request matches an operation on its server, 0.95; or by
  shape when the host is a variable and the shape is unambiguous, 0.6),
  `references` (`<entity>Id/Ref/Key` fields → the service that owns the
  resource, 0.7), `shares` (same entity, 0.9, or 0.5 when inferred).
- **Concepts**: identifier form (`customerId`, `customer_id`), identifier of its
  resource (`id` on Customer, `{custId}` on `/customers/{custId}` — only when the
  prefix abbreviates the resource), same non-generic name, and a field moved by
  a shared example value. Generic names (`id`, `status`, …) only join on the
  same entity.

## Tests

- `npm test` — Vitest: 28 engine cases (positive: the retail estate; negative:
  empty/junk/duplicate ids/prototype keys/ambiguous shapes/1 200-operation
  estate under 4 s) and 12 auth cases (validation, hashing, same-message
  failures, corrupted storage, duplicate sign-up).
- Browser suite (Playwright, kept outside the repo): sample estate → every
  tab, inspector and impact; add files incl. a junk file; export → import;
  reload persistence; workspace menu; refused inputs (bad URL, unfetchable URL,
  `:::` YAML, `{}`); sign-up and sign-in negative paths; open-redirect refusal;
  per-user workspace isolation.

## Done (this iteration)

Engine with tests · workspaces with export/import · `/graph` page with map,
entity diff, duplicates, concepts, findings, inspector and impact · sample
estate · hand-off from the single-spec workspace · sign-up / sign-in pages with
a provider interface · landing-nav account state.

## Next

1. **Blast Radius**: diff a new version of one service against the workspace
   and list the consumers (edges) each breaking change reaches. The
   breaking-change detector and the edges already exist; this is the join.
2. **Share links / embeds** for a workspace (the single-spec share mechanism,
   extended; falls back to the export file above the URL limit).
3. **Web Worker** for `buildContractGraph` above ~40 services.
4. **Consumer discovery from code** (`callscan` for .NET, Java, Node) and from
   HAR captures, adding `calls` edges with their own evidence.
5. **Cloud workspaces** behind the same `auth.js` provider (Supabase tables),
   so a workspace can be shared with a team.
