import { HTTP_METHODS } from "./constants";

/**
 * Extract a flat list of endpoints from any spec format.
 * Returns: [{ method, path, name, description, body }]
 */
const extractEndpoints = (data) => {
  const endpoints = [];

  if (!data || typeof data !== "object") return endpoints;

  // OpenAPI / Swagger
  if (data.openapi || data.swagger) {
    let baseUrl = "";
    if (data.servers?.[0]?.url) baseUrl = data.servers[0].url.replace(/\/+$/, "");
    else if (data.host) {
      const scheme = data.schemes?.[0] || "https";
      baseUrl = `${scheme}://${data.host}${data.basePath || ""}`.replace(/\/+$/, "");
    }
    Object.entries(data.paths || {}).forEach(([pathStr, pathObj]) => {
      if (!pathObj) return;
      HTTP_METHODS.forEach((m) => {
        const op = pathObj[m];
        if (!op) return;
        endpoints.push({
          method: m.toUpperCase(),
          path: `${baseUrl}${pathStr}`,
          name: op.summary || op.operationId || `${m.toUpperCase()} ${pathStr}`,
          description: op.description || "",
          tags: op.tags || [],
        });
      });
    });
    return endpoints;
  }

  // Postman
  if (data.info && data.item && Array.isArray(data.item)) {
    const walk = (items) => {
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (item.item && Array.isArray(item.item)) {
          walk(item.item);
        } else {
          const req = item.request || item;
          const url = typeof req.url === "string" ? req.url : req.url?.raw || item.url || "";
          const method = (req.method || item.method || "GET").toUpperCase();
          endpoints.push({
            method,
            path: url,
            name: item.name || `${method} ${url}`,
            description: item.description?.content || req.description?.content || "",
            tags: [],
          });
        }
      });
    };
    walk(data.item);
    return endpoints;
  }

  // Custom JSON — flat array
  if (Array.isArray(data)) {
    data.forEach((ep) => {
      if (!ep || typeof ep !== "object") return;
      const method = (ep.method || ep.type || "GET").toUpperCase();
      const path = ep.url || ep.path || ep.endpoint || "";
      endpoints.push({
        method,
        path,
        name: ep.name || ep.title || `${method} ${path}`,
        description: ep.description || "",
        tags: [],
      });
    });
    return endpoints;
  }

  // Custom JSON — grouped object
  const metaKeys = ["name", "title", "version", "description", "baseUrl", "base_url"];
  Object.entries(data).forEach(([key, val]) => {
    if (Array.isArray(val) && !metaKeys.includes(key)) {
      val.forEach((ep) => {
        if (!ep || typeof ep !== "object") return;
        const method = (ep.method || ep.type || "GET").toUpperCase();
        const path = ep.url || ep.path || ep.endpoint || "";
        endpoints.push({
          method,
          path,
          name: ep.name || ep.title || `${method} ${path}`,
          description: ep.description || "",
          tags: [key],
        });
      });
    }
  });

  return endpoints;
};

/**
 * Compute the diff between two specs.
 * Returns { added, removed, modified, unchanged }
 * Each entry: { method, path, name, description, tags, changeDetails? }
 */
export const computeDiff = (specA, specB) => {
  const endpointsA = extractEndpoints(specA);
  const endpointsB = extractEndpoints(specB);

  // Key = "METHOD /path"
  const keyOf = (ep) => `${ep.method} ${ep.path}`;

  const mapA = new Map();
  endpointsA.forEach((ep) => mapA.set(keyOf(ep), ep));

  const mapB = new Map();
  endpointsB.forEach((ep) => mapB.set(keyOf(ep), ep));

  const added = [];     // in B but not in A
  const removed = [];   // in A but not in B
  const modified = [];  // in both but different
  const unchanged = []; // identical

  // Check B against A
  mapB.forEach((epB, key) => {
    const epA = mapA.get(key);
    if (!epA) {
      added.push(epB);
    } else {
      // Compare: name or description changed
      const nameChanged = epA.name !== epB.name;
      const descChanged = epA.description !== epB.description;
      if (nameChanged || descChanged) {
        modified.push({
          ...epB,
          changeDetails: {
            nameChanged,
            descChanged,
            oldName: epA.name,
            oldDescription: epA.description,
          },
        });
      } else {
        unchanged.push(epB);
      }
    }
  });

  // Check A for removed (not in B)
  mapA.forEach((epA, key) => {
    if (!mapB.has(key)) {
      removed.push(epA);
    }
  });

  return {
    added,
    removed,
    modified,
    unchanged,
    totalA: endpointsA.length,
    totalB: endpointsB.length,
  };
};
