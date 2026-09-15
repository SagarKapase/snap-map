// ─── Derived data helpers ────────────────────
// Everything here is computed from the parsed spec — no placeholder values.

export const LAYOUT_LABELS = {
  tree: "Tree",
  flowchart: "Flowchart",
  radial: "Radial",
  mindmap: "Mindmap",
  graph: "Force Directed",
};

export const timeAgo = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

// ─── Sidebar tree: folders → children, with request counts ──
export const buildGroupTree = (nodes) => {
  const root = nodes.find((n) => n.type === "root");
  if (!root) return [];

  const byParent = new Map();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  });

  const build = (parentId, depth) =>
    (byParent.get(parentId) || []).map((node) => {
      const children = node.type === "folder" ? build(node.id, depth + 1) : [];
      const count =
        node.type === "request"
          ? 1
          : children.reduce((sum, c) => sum + c.count, 0);
      return { node, children, count, depth };
    });

  return build(root.id, 0);
};

// ─── Ancestors of a node (nearest parent first) ──
export const ancestorsOf = (nodes, nodeId) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = [];
  let cur = byId.get(nodeId);
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    out.push(parent.id);
    cur = parent;
  }
  return out;
};

// ─── Real spec warnings (no fabricated counts) ──
export const collectWarnings = (nodes) => {
  const out = [];
  const seen = new Map();

  nodes.forEach((n) => {
    if (n.type === "request") {
      if (!n.path || !String(n.path).trim()) {
        out.push({
          id: `nopath-${n.id}`,
          nodeId: n.id,
          level: "warn",
          message: `"${n.name}" has no URL`,
        });
        return;
      }
      const key = `${n.method} ${n.path}`;
      if (seen.has(key)) {
        out.push({
          id: `dup-${n.id}`,
          nodeId: n.id,
          level: "warn",
          message: `Duplicate endpoint — ${key}`,
        });
      } else {
        seen.set(key, n.id);
      }
    } else if (n.type === "folder" && !nodes.some((c) => c.parentId === n.id)) {
      out.push({
        id: `empty-${n.id}`,
        nodeId: n.id,
        level: "info",
        message: `Group "${n.name}" has no endpoints`,
      });
    }
  });

  return out;
};

// ─── Schema count — only when the spec actually declares schemas ──
export const countSchemas = (spec) => {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;
  const schemas = spec.components?.schemas || spec.definitions;
  if (schemas && typeof schemas === "object") return Object.keys(schemas).length;
  return null;
};

// ─── JSON-pointer $ref resolution ──
export const resolveRef = (spec, ref) => {
  if (!spec || typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return (
    ref
      .slice(2)
      .split("/")
      .reduce(
        (acc, part) =>
          acc?.[part.replace(/~1/g, "/").replace(/~0/g, "~")],
        spec,
      ) ?? null
  );
};

// ─── Inline $refs so a schema can be displayed as plain JSON ──
export const resolveSchema = (spec, schema, depth = 0, seen = new Set()) => {
  if (!schema || typeof schema !== "object" || depth > 4) return schema;

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { $ref: schema.$ref };
    const target = resolveRef(spec, schema.$ref);
    if (!target) return schema;
    return resolveSchema(spec, target, depth + 1, new Set([...seen, schema.$ref]));
  }

  if (Array.isArray(schema))
    return schema.map((s) => resolveSchema(spec, s, depth + 1, seen));

  const out = {};
  Object.entries(schema).forEach(([k, v]) => {
    out[k] =
      v && typeof v === "object" ? resolveSchema(spec, v, depth + 1, seen) : v;
  });
  return out;
};

// ─── Related endpoints: siblings first, then same base path ──
export const relatedEndpoints = (nodes, node, limit = 10) => {
  if (!node || node.type !== "request") return [];

  const base = String(node.path || "")
    .split("?")[0]
    .replace(/\/(\{[^}]+\}|:[^/]+)$/, "");

  const siblings = nodes.filter(
    (n) =>
      n.type === "request" && n.id !== node.id && n.parentId === node.parentId,
  );
  const samePath = nodes.filter(
    (n) =>
      n.type === "request" &&
      n.id !== node.id &&
      n.parentId !== node.parentId &&
      base &&
      String(n.path || "").split("?")[0].startsWith(base),
  );

  const out = [];
  const seen = new Set();
  [...samePath, ...siblings].forEach((n) => {
    if (seen.has(n.id) || out.length >= limit) return;
    seen.add(n.id);
    out.push(n);
  });
  return out;
};

// ─── Method breakdown for an arbitrary node subset ──
export const methodBreakdown = (nodes) => {
  const out = {};
  nodes.forEach((n) => {
    if (n.type !== "request") return;
    const m = n.method || "GET";
    out[m] = (out[m] || 0) + 1;
  });
  return out;
};
