/**
 * Coverage between a specification and a Postman collection.
 *
 * The question this answers is the one nothing in Postman can: the backend
 * publishes 90 endpoints, QA maintains a collection — which endpoints has
 * nobody written a request for?
 *
 * Matching is the whole problem, in two layers.
 *
 * Placeholders: a spec says `/users/{userId}`; the same endpoint in a
 * collection might be written `/users/:id`, `/users/{{userId}}` or, most
 * often, `/users/42`. All four have to land on the same row.
 *
 * Base paths: a spec's server is `https://api.test/v2` while the collection
 * writes `{{baseUrl}}/{{apiVersion}}/orders`. One side carries the version in
 * the host, the other in the path, so comparing paths literally matches
 * nothing at all. Rather than guess per URL, the offset that lines the two
 * sides up best is worked out once and applied to every comparison.
 */

import { splitOrigin } from "./convert";
import { resolveText } from "./variables";

/** Strip the origin, the query string and any trailing slash. */
const barePath = (raw) => {
  const { rest } = splitOrigin(String(raw || ""));
  const path = rest.split("?")[0].split("#")[0];
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
};

/** Every placeholder spelling collapses to one token so shapes can compare. */
const normalise = (raw) =>
  barePath(raw)
    .replace(/\{\{[^}]+\}\}/g, "{}")
    .replace(/\{[^}/]+\}/g, "{}")
    .replace(/:[a-zA-Z_][a-zA-Z0-9_-]*/g, "{}");

const segmentsOf = (raw) => normalise(raw).split("/").filter(Boolean);

const methodOf = (node) => String(node?.method || "").toUpperCase();

/** The path a node describes, preferring the declared template. */
export const pathOf = (node) => node?.template || barePath(node?.path);

/**
 * Segment-wise comparison where `{}` is a wildcard on either side, so a
 * concrete id in a collection URL still matches a templated spec path.
 */
const segmentsMatch = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === "{}" || b[i] === "{}") continue;
    if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
  }
  return true;
};

const keyOf = (method, segments) => `${method} /${segments.join("/")}`;

/**
 * How many leading segments to drop from each side.
 *
 * Only one side can carry the extra base — a version prefix lives either in
 * the spec's server URL or in the collection's, never split across both — so
 * the candidates are small and the best-scoring one wins.
 */
const chooseOffset = (specEntries, collectionEntries) => {
  if (!specEntries.length || !collectionEntries.length) {
    return { specDrop: 0, collectionDrop: 0 };
  }

  const candidates = [
    { specDrop: 0, collectionDrop: 0 },
    { specDrop: 0, collectionDrop: 1 },
    { specDrop: 0, collectionDrop: 2 },
    { specDrop: 0, collectionDrop: 3 },
    { specDrop: 1, collectionDrop: 0 },
    { specDrop: 2, collectionDrop: 0 },
    { specDrop: 3, collectionDrop: 0 },
  ];

  let best = candidates[0];
  let bestScore = -1;

  candidates.forEach((candidate) => {
    // Bucketing by method and length keeps the wildcard comparison cheap:
    // only paths that could possibly match are ever compared.
    const buckets = new Map();
    specEntries.forEach((entry) => {
      const segments = entry.segments.slice(candidate.specDrop);
      if (!segments.length) return;
      const bucket = `${entry.method}|${segments.length}`;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(segments);
    });

    let score = 0;
    collectionEntries.forEach((entry) => {
      const segments = entry.segments.slice(candidate.collectionDrop);
      if (!segments.length) return;
      const bucket = buckets.get(`${entry.method}|${segments.length}`);
      if (bucket && bucket.some((candidateSegments) => segmentsMatch(candidateSegments, segments))) {
        score += 1;
      }
    });

    // Ties go to the smaller offset: dropping nothing is the safer reading.
    const cost = candidate.specDrop + candidate.collectionDrop;
    const bestCost = best.specDrop + best.collectionDrop;
    if (score > bestScore || (score === bestScore && cost < bestCost)) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
};

/**
 * Compare the endpoints a specification declares against the requests a
 * collection actually contains.
 *
 * Both sides are node lists from the parser, so either can come from any
 * supported format — this also answers "does collection A cover collection B".
 * Pass `variables` to resolve `{{baseUrl}}` before comparing, which is what
 * makes a collection built on variables line up with a spec at all.
 */
export const compareCoverage = ({
  specNodes = [],
  collectionNodes = [],
  variables = null,
} = {}) => {
  const resolve = (text) =>
    variables ? resolveText(String(text || ""), variables).text : String(text || "");

  const specEntries = specNodes
    .filter((n) => n.type === "request")
    .map((node) => {
      const path = pathOf(node);
      return { node, method: methodOf(node), path, segments: segmentsOf(path) };
    });

  const collectionEntries = collectionNodes
    .filter((n) => n.type === "request")
    .map((node) => {
      const path = resolve(node.template || node.path);
      return { node, method: methodOf(node), path, segments: segmentsOf(path) };
    });

  const offset = chooseOffset(specEntries, collectionEntries);

  const specRows = specEntries.map((entry) => ({
    node: entry.node,
    method: entry.method,
    path: entry.path,
    segments: entry.segments.slice(offset.specDrop),
    matches: [],
  }));

  const exact = new Map();
  specRows.forEach((row) => {
    const key = keyOf(row.method, row.segments);
    if (!exact.has(key)) exact.set(key, row);
  });

  const extra = [];

  collectionEntries.forEach((entry) => {
    const segments = entry.segments.slice(offset.collectionDrop);

    const direct = exact.get(keyOf(entry.method, segments));
    if (direct) {
      direct.matches.push(entry.node);
      return;
    }

    // Then segment-wise, which is what catches a literal id in the URL.
    const loose = specRows.find(
      (row) => row.method === entry.method && segmentsMatch(row.segments, segments),
    );
    if (loose) {
      loose.matches.push(entry.node);
      return;
    }

    extra.push(entry.node);
  });

  const covered = specRows.filter((row) => row.matches.length > 0);
  const missing = specRows.filter((row) => row.matches.length === 0);

  return {
    covered,
    missing,
    extra,
    offset,
    specCount: specRows.length,
    collectionCount: collectionEntries.length,
    coveredCount: covered.length,
    percent: specRows.length ? Math.round((covered.length / specRows.length) * 100) : 0,
    // More than one request on the same endpoint is duplication, not a gap.
    duplicated: covered.filter((row) => row.matches.length > 1),
  };
};
