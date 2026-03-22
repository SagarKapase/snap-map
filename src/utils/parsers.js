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

      tags.forEach((tag) => {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push({
          name:
            operation.summary ||
            operation.operationId ||
            `${upperMethod} ${pathStr}`,
          method: upperMethod,
          path: `${baseUrl}${pathStr}`,
          description: operation.description || operation.summary || "",
          body,
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
      description: "",
    });

    endpoints.forEach((ep) => {
      allNodes.push({
        id: `node-${id++}`,
        name: ep.name,
        type: "request",
        parentId: folderId,
        method: ep.method,
        path: ep.path,
        description: ep.description,
        body: ep.body,
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
          { key: "Authorization", value: "Bearer <token>" },
        ],
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
    const method = (
      ep.method ||
      ep.type ||
      ep.httpMethod ||
      "GET"
    ).toUpperCase();
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
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
          { key: "Authorization", value: "Bearer <token>" },
        ],
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
            headers: [
              { key: "Content-Type", value: "application/json" },
              { key: "Accept", value: "*/*" },
            ],
          });
        }
      }
    }
  }

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
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
        description:
          item.description?.content || item.description || "",
      });
      item.item.forEach((child) => processItem(child, nodeId));
    } else {
      const req = item.request || item;
      const url =
        typeof req.url === "string"
          ? req.url
          : req.url?.raw || item.url || "";
      const method = (req.method || item.method || "GET").toUpperCase();
      s[method.toLowerCase()] = (s[method.toLowerCase()] || 0) + 1;
      s.total++;
      let body = null;
      try {
        body = req.body?.raw
          ? JSON.parse(req.body.raw)
          : req.body || null;
      } catch {
        body = req.body || null;
      }
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
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
          { key: "Authorization", value: "Bearer <token>" },
        ],
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
