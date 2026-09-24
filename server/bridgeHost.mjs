/**
 * The bridge host: every uploaded service's REST routes, served by the
 * application itself, so a person uploads a WSDL and the REST API answers
 * with nothing to download or run.
 *
 *   PUT    /bridge/bridges/:id        body: bridge.json → { id, baseUrl, routes }
 *   GET    /bridge/bridges            what is hosted
 *   GET    /bridge/bridges/:id        one bridge's routes
 *   DELETE /bridge/bridges/:id
 *   ANY    /bridge/b/:id/<route>      the REST API of that service
 *
 * Mounted on the Vite dev and preview servers (see vite.config.js), and
 * runnable on its own (`node server/bridge-host.mjs`) for a shared
 * deployment inside the network that can reach the SOAP services. Bridges
 * are kept in memory and, when a data directory is given, as JSON files
 * so they survive a restart. No dependencies.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createAdapter } from "./adapter.mjs";

const MAX_BRIDGE_BYTES = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const problem = (res, status, title, detail) => json(res, status, { type: "about:blank", title, status, detail });

const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const validBridge = (b) => b && typeof b === "object" && b.vizroute === "soap-bridge" && Array.isArray(b.routes) && b.routes.every((r) => r && typeof r.path === "string" && typeof r.method === "string");

/**
 * Create the host. `prefix` is where it is mounted; `dataDir` (optional)
 * persists bridges; `soapUrlFor(id)` (optional) can override the SOAP
 * endpoint per bridge, e.g. to pin a shared host to one environment.
 */
export const createBridgeHost = ({ prefix = "/bridge", dataDir = "", publicBase = "", log = () => {} } = {}) => {
  const bridges = new Map(); // id → { bridge, adapter, updatedAt }
  const base = prefix.replace(/\/+$/, "");

  const install = (id, bridge) => {
    const adapter = createAdapter(bridge, { log: (line) => log(`[${id}] ${line}`) });
    bridges.set(id, { bridge, adapter, updatedAt: new Date().toISOString() });
    return bridges.get(id);
  };

  if (dataDir) {
    try {
      mkdirSync(dataDir, { recursive: true });
      readdirSync(dataDir).filter((f) => f.endsWith(".json")).forEach((f) => {
        try {
          const bridge = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
          const id = f.slice(0, -5);
          if (ID.test(id) && validBridge(bridge)) install(id, bridge);
        } catch {
          /* a damaged file is skipped, not fatal */
        }
      });
    } catch {
      /* no persistence; memory only */
    }
  }

  const summary = (id, entry, req) => {
    const origin = publicBase || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host || "localhost"}`;
    return {
      id,
      service: entry.bridge.service,
      soap: entry.bridge.soap?.url || "",
      baseUrl: `${origin}${base}/b/${id}`,
      routes: entry.adapter.routes.map((r) => `${r.method} ${r.path}`),
      updatedAt: entry.updatedAt,
    };
  };

  /** Connect-style middleware: handles requests under the prefix, passes the rest on. */
  const handler = async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) {
      if (typeof next === "function") next();
      else problem(res, 404, "Not Found", `The bridge host lives under ${base}.`);
      return;
    }
    const rest = url.pathname.slice(base.length) || "/";
    if (req.method === "OPTIONS") {
      json(res, 204, undefined);
      return;
    }
    try {
      // Management.
      if (rest === "/" || rest === "/bridges") {
        if (req.method !== "GET") {
          problem(res, 405, "Method Not Allowed", "PUT /bridges/:id to publish a bridge.");
          return;
        }
        json(res, 200, { bridges: [...bridges.entries()].map(([id, entry]) => summary(id, entry, req)) });
        return;
      }
      const manage = rest.match(/^\/bridges\/([^/]+)$/);
      if (manage) {
        const id = manage[1];
        if (!ID.test(id)) {
          problem(res, 400, "Bad Request", "A bridge id is 1–80 letters, digits, _ or -.");
          return;
        }
        if (req.method === "PUT" || req.method === "POST") {
          let body;
          try {
            body = JSON.parse(await readBody(req, MAX_BRIDGE_BYTES));
          } catch (e) {
            problem(res, e.message === "too large" ? 413 : 400, e.message === "too large" ? "Payload Too Large" : "Bad Request", e.message === "too large" ? `A bridge is at most ${MAX_BRIDGE_BYTES / 1024 / 1024} MB.` : `The body is not JSON: ${e.message}`);
            return;
          }
          if (!validBridge(body)) {
            problem(res, 400, "Bad Request", "The body is not a bridge produced by the workbench (vizroute: \"soap-bridge\" with routes).");
            return;
          }
          const entry = install(id, body);
          if (dataDir) {
            try {
              writeFileSync(join(dataDir, `${id}.json`), JSON.stringify(body));
            } catch {
              /* memory only */
            }
          }
          log(`published ${id}: ${entry.adapter.routes.length} routes → ${body.soap?.url || "(no SOAP url)"}`);
          json(res, 200, summary(id, entry, req));
          return;
        }
        if (req.method === "DELETE") {
          const existed = bridges.delete(id);
          if (dataDir && existsSync(join(dataDir, `${id}.json`))) unlinkSync(join(dataDir, `${id}.json`));
          json(res, existed ? 204 : 404, existed ? undefined : { type: "about:blank", title: "Not Found", status: 404, detail: `No bridge ${id}.` });
          return;
        }
        if (req.method === "GET") {
          const entry = bridges.get(id);
          if (!entry) {
            problem(res, 404, "Not Found", `No bridge ${id}.`);
            return;
          }
          json(res, 200, summary(id, entry, req));
          return;
        }
        problem(res, 405, "Method Not Allowed", "GET, PUT or DELETE.");
        return;
      }
      // The hosted REST APIs.
      const serve = rest.match(/^\/b\/([^/]+)(\/.*)?$/);
      if (serve) {
        const entry = bridges.get(serve[1]);
        if (!entry) {
          problem(res, 404, "Not Found", `No service is hosted as ${serve[1]}. It is published when its WSDL is open in the workbench; GET ${base}/bridges lists what is hosted.`);
          return;
        }
        await entry.adapter.respond(req, res, `${serve[2] || "/"}${url.search}`);
        return;
      }
      problem(res, 404, "Not Found", `Nothing at ${rest}. GET ${base}/bridges lists the hosted services.`);
    } catch (e) {
      problem(res, 500, "Bridge host error", e.message);
    }
  };

  return { handler, bridges, install, prefix: base };
};

/** A standalone HTTP server around the host. */
export const startBridgeHost = ({ port = 8090, host = "0.0.0.0", ...options } = {}) => {
  const bridgeHost = createBridgeHost(options);
  const server = createServer((req, res) => bridgeHost.handler(req, res));
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => resolve({ server, bridgeHost, port: server.address().port }));
  });
};
