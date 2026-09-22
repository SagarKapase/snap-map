/**
 * Publishing a bridge to the host that serves it.
 *
 * The host is the application's own server (`/bridge` on the dev and
 * preview servers) or, for a static deployment, the standalone host named
 * by `VITE_BRIDGE_HOST`. A published service's REST routes answer at
 * `<host>/bridge/b/<id>/...` immediately; the workbench republishes
 * whenever the design changes so the routes follow the reviewer's edits.
 */

const trimSlash = (s) => String(s || "").replace(/\/+$/, "");

/** Where bridges are published: an absolute origin, or "" for same-origin. */
export const bridgeHostOrigin = () => {
  const configured = import.meta.env?.VITE_BRIDGE_HOST;
  return configured ? trimSlash(configured) : "";
};

const managementUrl = (id) => `${bridgeHostOrigin()}/bridge/bridges/${encodeURIComponent(id)}`;

/** A stable, URL-safe id for a service record. */
export const bridgeIdFor = (serviceId) => String(serviceId || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80) || "service";

/**
 * Publish (or republish) a bridge. Resolves to `{ baseUrl, routes, id }`
 * with an absolute `baseUrl`, or throws with a plain reason: the host is
 * not there (a static build without VITE_BRIDGE_HOST), or it refused.
 */
export const publishBridge = async (serviceId, bridge, { fetchImpl = fetch, origin = typeof location !== "undefined" ? location.origin : "http://localhost" } = {}) => {
  const id = bridgeIdFor(serviceId);
  let res;
  try {
    res = await fetchImpl(managementUrl(id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bridge) });
  } catch {
    throw new Error(`No bridge host at ${bridgeHostOrigin() || origin}/bridge. The dev and preview servers host it; a static deployment needs VITE_BRIDGE_HOST pointing at \`node server/bridge-host.mjs\`.`);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail || body?.title || detail;
    } catch {
      /* not JSON */
    }
    throw new Error(`The bridge host refused the service: ${detail}`);
  }
  const data = await res.json();
  const baseUrl = /^https?:\/\//.test(data.baseUrl) ? data.baseUrl : new URL(data.baseUrl, origin).toString();
  return { id, baseUrl: trimSlash(baseUrl), routes: data.routes || [] };
};

export const unpublishBridge = async (serviceId, { fetchImpl = fetch } = {}) => {
  try {
    await fetchImpl(managementUrl(bridgeIdFor(serviceId)), { method: "DELETE" });
  } catch {
    /* the host is gone; nothing to remove */
  }
};
