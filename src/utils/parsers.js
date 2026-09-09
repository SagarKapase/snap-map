import { HTTP_METHODS } from "./constants";

// ─── Format detection ────────────────────────
export const detectFormat = (data) => {
  if (data.openapi || data.swagger) return "openapi";
  if (data.info && data.item && Array.isArray(data.item)) return "postman";
  return "custom";
};

export const formatLabel = (data) => {
  if (data.openapi) return `OpenAPI ${data.openapi}`;
  if (data.swagger) return `Swagger ${data.swagger}`;
  if (data.info && data.item && Array.isArray(data.item)) return "Postman";
  return "Custom JSON";
};

// ─── Parameters inferred from a URL string ───
// Path placeholders ({id} or :id) and query keys are real parts of the spec,
// so they are surfaced as parameters when the format declares none.
export const extractUrlParams = (url) => {
  const params = [];
  if (!url || typeof url !== "string") return params;

  const [pathPart, queryPart] = url.split("?");

  const pathMatches =
    pathPart.match(/\{[^}/]+\}|:[a-zA-Z_][a-zA-Z0-9_-]*/g) || [];
  pathMatches.forEach((raw) => {
    const name = raw.startsWith("{") ? raw.slice(1, -1) : raw.slice(1);
    if (name)
      params.push({
        name,
        in: "path",
        required: true,
        type: "",
        description: "",
        inferred: true,
      });
  });

  if (queryPart) {
    queryPart.split("&").forEach((pair) => {
      if (!pair) return;
      const [key, value = ""] = pair.split("=");
      if (key)
        params.push({
          name: key,
          in: "query",
          required: false,
          type: "",
          description: "",
          example: value,
          inferred: true,
        });
    });
  }

  return params;
};

const dedupeParams = (params) => {
  const seen = new Set();
  return params.filter((p) => {
    const key = `${p.in}:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ─── OpenAPI / Swagger helpers ───────────────
const openApiAuth = (spec, operation) => {
  const schemes =
    spec.components?.securitySchemes || spec.securityDefinitions || {};
  const security = operation.security ?? spec.security;
  if (!Array.isArray(security) || security.length === 0) return [];

  const out = [];
  security.forEach((requirement) => {
    Object.entries(requirement || {}).forEach(([name, scopes]) => {
      const scheme = schemes[name] || {};
      out.push({
        name,
        type: scheme.type || "",
        scheme: scheme.scheme || "",
        location: scheme.in || "",
        headerName: scheme.name || "",
        scopes: Array.isArray(scopes) ? scopes : [],
      });
    });
  });
  return out;
};

const openApiResponses = (operation) => {
  const responses = operation.responses || {};
  return Object.entries(responses).map(([status, res]) => {
    const content = res?.content || {};
    const contentType = Object.keys(content)[0] || "";
    const media = contentType ? content[contentType] : null;

    let example = media?.example;
    if (example === undefined && media?.examples) {
      example = Object.values(media.examples)[0]?.value;
    }
    if (example === undefined) example = media?.schema?.example;
    // Swagger 2.0 keeps examples on the response object itself
    if (example === undefined && res?.examples) {
      example =
        res.examples["application/json"] ?? Object.values(res.examples)[0];
    }

    return {
      status,
      description: res?.description || "",
      contentType: contentType || (res?.examples ? "application/json" : ""),
      example,
      schema: media?.schema || res?.schema || null,
    };
  });
};

// ─── OpenAPI / Swagger parser ────────────────
export const parseOpenApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  let baseUrl = "";
  if (data.servers && data.servers.length > 0) {
    baseUrl = data.servers[0].url || "";
  } else if (data.host) {
    const scheme = (data.schemes && data.schemes[0]) || "https";
    baseUrl = `${scheme}://${data.host}${data.basePath || ""}`;
  }
  baseUrl = baseUrl.replace(/\/+$/, "");

  const root = {
    id: "node-root",
    name: data.info?.title || "API Specification",
    version: data.info?.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  const tagGroups = {};
  const paths = data.paths || {};

  Object.entries(paths).forEach(([pathStr, pathObj]) => {
    if (!pathObj) return;
    HTTP_METHODS.forEach((method) => {
      const operation = pathObj[method];
      if (!operation) return;

      const tags =
        operation.tags && operation.tags.length > 0
          ? operation.tags
          : ["Default"];
      const upperMethod = method.toUpperCase();

      let body = null;
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        if (content) {
          const jsonContent = content["application/json"];
          if (jsonContent?.example) body = jsonContent.example;
          else if (jsonContent?.schema?.example)
            body = jsonContent.schema.example;
        }
      } else if (operation.parameters) {
        const bodyParam = operation.parameters.find((p) => p.in === "body");
        if (bodyParam?.schema?.example) body = bodyParam.schema.example;
      }

      const declared = [
        ...(Array.isArray(pathObj.parameters) ? pathObj.parameters : []),
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ]
        .filter((p) => p && p.in !== "body")
        .map((p) => ({
          name: p.name,
          in: p.in || "query",
          required: !!p.required,
          type: p.schema?.type || p.type || "",
          description: p.description || "",
          example: p.example ?? p.schema?.example,
        }));

      const params = dedupeParams([...declared, ...extractUrlParams(pathStr)]);

      const headers = params
        .filter((p) => p.in === "header")
        .map((p) => ({
          key: p.name,
          value: p.example != null ? String(p.example) : "",
        }));

      tags.forEach((tag) => {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push({
          name:
            operation.summary ||
            operation.operationId ||
            `${upperMethod} ${pathStr}`,
          method: upperMethod,
          path: `${baseUrl}${pathStr}`,
          template: pathStr,
          description: operation.description || operation.summary || "",
          body,
          params,
          headers,
          auth: openApiAuth(data, operation),
          responses: openApiResponses(operation),
          requestBodySchema:
            operation.requestBody?.content?.["application/json"]?.schema || null,
          deprecated: !!operation.deprecated,
        });
      });

      s[method] = (s[method] || 0) + 1;
      s.total++;
    });
  });

  Object.entries(tagGroups).forEach(([tag, endpoints]) => {
    const folderId = `node-${id++}`;
    allNodes.push({
      id: folderId,
      name: tag,
      type: "folder",
      parentId: "node-root",
      itemCount: endpoints.length,
      description:
        (data.tags || []).find((t) => t.name === tag)?.description || "",
    });

    endpoints.forEach((ep) => {
      allNodes.push({
        id: `node-${id++}`,
        type: "request",
        parentId: folderId,
        ...ep,
      });
    });
  });

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Custom / generic JSON parser ────────────
export const parseCustomApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  const root = {
    id: "node-root",
    name: data.name || data.title || "API Collection",
    version: data.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  const normalizeEndpoint = (ep) => {
    const method = (ep.method || ep.type || ep.httpMethod || "GET").toUpperCase();
    const url = ep.url || ep.path || ep.endpoint || ep.route || "";
    const name = ep.name || ep.title || ep.summary || `${method} ${url}`;
    const description = ep.description || ep.summary || "";
    let body = null;
    if (ep.body) {
      try {
        body = typeof ep.body === "string" ? JSON.parse(ep.body) : ep.body;
      } catch {
        body = ep.body;
      }
    }
    return { method, url, name, description, body };
  };

  // Response examples, only when the source JSON actually carries one
  const customResponses = (ep) => {
    const raw = ep.response ?? ep.responses ?? ep.example ?? ep.sampleResponse;
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.filter(Boolean).map((r) => ({
        status: String(r.status ?? r.code ?? 200),
        description: r.name || r.description || "",
        contentType: r.contentType || "application/json",
        example: r.body ?? r.example ?? r.data ?? r,
      }));
    }
    if (typeof raw === "object" && (raw.status || raw.code || raw.body)) {
      return [
        {
          status: String(raw.status ?? raw.code ?? 200),
          description: raw.name || raw.description || "",
          contentType: raw.contentType || "application/json",
          example: raw.body ?? raw.example ?? raw.data ?? raw,
        },
      ];
    }
    return [
      {
        status: "200",
        description: "",
        contentType: "application/json",
        example: raw,
      },
    ];
  };

  const normalizeHeaders = (ep) => {
    const raw = ep.headers;
    if (!raw) return [];
    if (Array.isArray(raw))
      return raw
        .filter((h) => h && (h.key || h.name))
        .map((h) => ({ key: h.key || h.name, value: String(h.value ?? "") }));
    if (typeof raw === "object")
      return Object.entries(raw).map(([key, value]) => ({
        key,
        value: String(value ?? ""),
      }));
    return [];
  };

  const addEndpoints = (endpoints, parentId) => {
    endpoints.forEach((ep) => {
      const norm = normalizeEndpoint(ep);
      const m = norm.method.toLowerCase();
      s[m] = (s[m] || 0) + 1;
      s.total++;
      allNodes.push({
        id: `node-${id++}`,
        name: norm.name,
        type: "request",
        parentId,
        method: norm.method,
        path: norm.url,
        description: norm.description,
        body: norm.body,
        params: extractUrlParams(norm.url),
        headers: normalizeHeaders(ep),
        auth: [],
        responses: customResponses(ep),
      });
    });
  };

  if (Array.isArray(data)) {
    root.name = "API Collection";
    addEndpoints(data, "node-root");
  } else {
    const endpointsArr = data.endpoints || data.routes || data.apis || null;
    if (Array.isArray(endpointsArr)) {
      addEndpoints(endpointsArr, "node-root");
    } else {
      const metaKeys = [
        "name",
        "title",
        "version",
        "description",
        "baseUrl",
        "base_url",
      ];
      const groups = Object.entries(data).filter(
        ([key, val]) => Array.isArray(val) && !metaKeys.includes(key),
      );
      if (groups.length > 0) {
        groups.forEach(([groupName, endpoints]) => {
          const folderId = `node-${id++}`;
          allNodes.push({
            id: folderId,
            name: groupName,
            type: "folder",
            parentId: "node-root",
            itemCount: endpoints.length,
            description: "",
          });
          addEndpoints(endpoints, folderId);
        });
      } else {
        const norm = normalizeEndpoint(data);
        if (norm.url) {
          const m = norm.method.toLowerCase();
          s[m] = (s[m] || 0) + 1;
          s.total++;
          allNodes.push({
            id: `node-${id++}`,
            name: norm.name,
            type: "request",
            parentId: "node-root",
            method: norm.method,
            path: norm.url,
            description: norm.description,
            body: norm.body,
            params: extractUrlParams(norm.url),
            headers: normalizeHeaders(data),
            auth: [],
            responses: customResponses(data),
          });
        }
      }
    }
  }

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Postman helpers ─────────────────────────
const postmanAuth = (auth) => {
  if (!auth || !auth.type) return [];
  return [
    {
      name: auth.type,
      type: auth.type,
      scheme: auth.type === "bearer" ? "bearer" : "",
      location: "header",
      headerName: auth.type === "apikey" ? "" : "Authorization",
      scopes: [],
    },
  ];
};

const postmanResponses = (item) => {
  const list = Array.isArray(item.response) ? item.response : [];
  return list.filter(Boolean).map((r) => {
    let example = r.body;
    try {
      if (typeof r.body === "string") example = JSON.parse(r.body);
    } catch {
      example = r.body;
    }
    const ct = (r.header || []).find(
      (h) => h && String(h.key).toLowerCase() === "content-type",
    );
    return {
      status: String(r.code ?? r.status ?? ""),
      description: r.name || r.status || "",
      contentType: ct?.value || "",
      example,
    };
  });
};

// ─── Postman collection parser ───────────────
export const parsePostmanCollection = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  const root = {
    id: "node-root",
    name: data.info?.name || data.name || "API Collection",
    version: data.info?.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  const processItem = (item, parentId) => {
    const nodeId = `node-${id++}`;
    if (item.item && Array.isArray(item.item)) {
      allNodes.push({
        id: nodeId,
        name: item.name,
        type: "folder",
        parentId,
        itemCount: item.item.length,
        description: item.description?.content || item.description || "",
      });
      item.item.forEach((child) => processItem(child, nodeId));
    } else {
      const req = item.request || item;
      const url =
        typeof req.url === "string" ? req.url : req.url?.raw || item.url || "";
      const method = (req.method || item.method || "GET").toUpperCase();
      s[method.toLowerCase()] = (s[method.toLowerCase()] || 0) + 1;
      s.total++;
      let body = null;
      try {
        body = req.body?.raw ? JSON.parse(req.body.raw) : req.body || null;
      } catch {
        body = req.body || null;
      }

      const declared = [];
      if (req.url && typeof req.url === "object") {
        (req.url.variable || []).forEach((v) => {
          if (v?.key)
            declared.push({
              name: v.key,
              in: "path",
              required: true,
              type: "",
              description: v.description?.content || v.description || "",
              example: v.value,
            });
        });
        (req.url.query || []).forEach((q) => {
          if (q?.key)
            declared.push({
              name: q.key,
              in: "query",
              required: false,
              type: "",
              description: q.description?.content || q.description || "",
              example: q.value,
            });
        });
      }

      const headers = (Array.isArray(req.header) ? req.header : [])
        .filter((h) => h && h.key && !h.disabled)
        .map((h) => ({ key: h.key, value: String(h.value ?? "") }));

      allNodes.push({
        id: nodeId,
        name: item.name,
        type: "request",
        parentId,
        method,
        path: url,
        description:
          item.description?.content ||
          req.description?.content ||
          item.description ||
          "",
        body,
        params: dedupeParams([...declared, ...extractUrlParams(url)]),
        headers,
        auth: postmanAuth(req.auth || item.auth || data.auth),
        responses: postmanResponses(item),
      });
    }
  };

  if (data.item && Array.isArray(data.item)) {
    data.item.forEach((item) => processItem(item, "node-root"));
  }
  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Unified parse dispatcher ────────────────
export const parseCollection = (data, setStats) => {
  const format = Array.isArray(data) ? "custom" : detectFormat(data);
  if (format === "openapi") return parseOpenApi(data, setStats);
  if (format === "custom") return parseCustomApi(data, setStats);
  return parsePostmanCollection(data, setStats);
};
