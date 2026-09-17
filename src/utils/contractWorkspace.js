/**
 * Contract Graph workspaces.
 *
 * A workspace is a named set of services. The small record — names, colours,
 * formats — lives in localStorage so lists render synchronously; each
 * service's specification, which can run to megabytes, lives in IndexedDB
 * through the shared payload store. Workspaces are kept per signed-in user
 * so two accounts on one machine do not see each other's estates; an
 * anonymous visitor gets their own bucket.
 */
import { putPayload, getPayload, deletePayloads } from "./store";

const PREFIX = "vizroute_cg_workspaces:";
const COLORS = ["#a855f7", "#3aa2ff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c", "#22d3ee", "#e879f9", "#4ade80", "#f472b6", "#60a5fa"];
export const MAX_SERVICES = 60;
const NAME_LIMIT = 80;

const bucket = (userId) => `${PREFIX}${userId || "anonymous"}`;

// Every change reads the list, edits it and writes it back. Two changes in
// flight at once — a second file drop before the first has finished — would
// each write their own copy and the later one would drop the other's
// service. They run one after another instead.
let queue = Promise.resolve();
const serialized = (work) => {
  const run = queue.then(work, work);
  queue = run.catch(() => {});
  return run;
};

const read = (userId) => {
  try {
    const raw = localStorage.getItem(bucket(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((w) => w && typeof w === "object" && w.id) : [];
  } catch {
    return [];
  }
};

const write = (userId, list) => {
  try {
    localStorage.setItem(bucket(userId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

const cleanName = (name, fallback) => {
  const text = String(name ?? "").trim().slice(0, NAME_LIMIT);
  return text || fallback;
};

export const payloadKey = (workspaceId, serviceId) => `cg:${workspaceId}:${serviceId}`;

export const listWorkspaces = (userId) =>
  read(userId).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

export const getWorkspace = (userId, id) => read(userId).find((w) => w.id === id) || null;

export const createWorkspace = (userId, name) => {
  const list = read(userId);
  const workspace = { id: uid("ws"), name: cleanName(name, `Workspace ${list.length + 1}`), createdAt: now(), updatedAt: now(), services: [] };
  write(userId, [workspace, ...list]);
  return workspace;
};

export const renameWorkspace = (userId, id, name) => {
  const list = read(userId);
  const workspace = list.find((w) => w.id === id);
  if (!workspace) return null;
  workspace.name = cleanName(name, workspace.name);
  workspace.updatedAt = now();
  write(userId, list);
  return workspace;
};

export const deleteWorkspace = (userId, id) => serialized(() => deleteWorkspaceNow(userId, id));

const deleteWorkspaceNow = async (userId, id) => {
  const list = read(userId);
  const workspace = list.find((w) => w.id === id);
  if (!workspace) return false;
  write(userId, list.filter((w) => w.id !== id));
  await deletePayloads((workspace.services || []).map((s) => payloadKey(id, s.id)));
  return true;
};

/**
 * Add a service. `spec` is the parsed document; it is stored separately and
 * only its metadata goes on the workspace record. Throws when the workspace
 * is full or the name is already taken, so the caller can say why.
 */
export const addService = (userId, workspaceId, input) => serialized(() => addServiceNow(userId, workspaceId, input));

const addServiceNow = async (userId, workspaceId, { name, spec, sourceUrl = "", format = "" }) => {
  if (!spec || typeof spec !== "object") throw new Error("That file is not a specification the map can read.");
  const list = read(userId);
  const workspace = list.find((w) => w.id === workspaceId);
  if (!workspace) throw new Error("This workspace no longer exists.");
  if (workspace.services.length >= MAX_SERVICES) throw new Error(`A workspace holds up to ${MAX_SERVICES} services.`);
  const base = cleanName(name, `Service ${workspace.services.length + 1}`);
  let unique = base;
  let n = 2;
  while (workspace.services.some((s) => s.name.toLowerCase() === unique.toLowerCase())) unique = `${base} (${n++})`;
  const service = {
    id: uid("svc"),
    name: unique,
    format,
    sourceUrl,
    color: COLORS[workspace.services.length % COLORS.length],
    addedAt: now(),
    bytes: (() => {
      try {
        return JSON.stringify(spec).length;
      } catch {
        return 0;
      }
    })(),
  };
  const stored = await putPayload(payloadKey(workspaceId, service.id), spec);
  if (!stored) throw new Error("The browser refused to store this specification (storage may be full).");
  workspace.services.push(service);
  workspace.updatedAt = now();
  write(userId, list);
  return service;
};

/**
 * Swap a service's document for a newer one. The service keeps its id,
 * name and colour — so its position on the map and every link to it
 * survive — and only the payload, format and size change.
 */
export const replaceService = (userId, workspaceId, serviceId, input) => serialized(() => replaceServiceNow(userId, workspaceId, serviceId, input));

const replaceServiceNow = async (userId, workspaceId, serviceId, { spec, sourceUrl, format = "" }) => {
  if (!spec || typeof spec !== "object") throw new Error("That file is not a specification the map can read.");
  const list = read(userId);
  const workspace = list.find((w) => w.id === workspaceId);
  const service = workspace?.services.find((s) => s.id === serviceId);
  if (!service) throw new Error("This service no longer exists.");
  const stored = await putPayload(payloadKey(workspaceId, serviceId), spec);
  if (!stored) throw new Error("The browser refused to store this specification (storage may be full).");
  service.format = format || service.format;
  if (sourceUrl !== undefined) service.sourceUrl = sourceUrl;
  service.replacedAt = now();
  service.bytes = (() => {
    try {
      return JSON.stringify(spec).length;
    } catch {
      return 0;
    }
  })();
  workspace.updatedAt = now();
  write(userId, list);
  return service;
};

export const renameService = (userId, workspaceId, serviceId, name) => {
  const list = read(userId);
  const workspace = list.find((w) => w.id === workspaceId);
  const service = workspace?.services.find((s) => s.id === serviceId);
  if (!service) return null;
  service.name = cleanName(name, service.name);
  workspace.updatedAt = now();
  write(userId, list);
  return service;
};

export const removeService = (userId, workspaceId, serviceId) => serialized(() => removeServiceNow(userId, workspaceId, serviceId));

const removeServiceNow = async (userId, workspaceId, serviceId) => {
  const list = read(userId);
  const workspace = list.find((w) => w.id === workspaceId);
  if (!workspace) return false;
  workspace.services = workspace.services.filter((s) => s.id !== serviceId);
  workspace.updatedAt = now();
  write(userId, list);
  await deletePayloads([payloadKey(workspaceId, serviceId)]);
  return true;
};

/** The workspace's services with their specifications loaded, ready for the engine. */
export const loadServices = async (workspace) => {
  const services = await Promise.all(
    (workspace?.services || []).map(async (s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      sourceUrl: s.sourceUrl,
      spec: await getPayload(payloadKey(workspace.id, s.id)),
    })),
  );
  return services;
};

/** A portable file: the workspace with every specification inlined. */
export const exportWorkspace = async (workspace) => {
  const services = await loadServices(workspace);
  return {
    vizroute: "contract-graph-workspace",
    version: 1,
    name: workspace.name,
    exportedAt: now(),
    services: services.map((s) => ({ name: s.name, sourceUrl: s.sourceUrl || "", spec: s.spec })),
  };
};

/** Read a file produced by `exportWorkspace`; returns the new workspace or throws. */
export const importWorkspace = async (userId, data) => {
  if (!data || data.vizroute !== "contract-graph-workspace" || !Array.isArray(data.services)) {
    throw new Error("That file is not a Contract Graph workspace export.");
  }
  const workspace = createWorkspace(userId, data.name);
  const failures = [];
  for (const entry of data.services.slice(0, MAX_SERVICES)) {
    try {
      await addService(userId, workspace.id, { name: entry?.name, spec: entry?.spec, sourceUrl: entry?.sourceUrl || "" });
    } catch (e) {
      failures.push(`${entry?.name || "unnamed"}: ${e.message}`);
    }
  }
  return { workspace: getWorkspace(userId, workspace.id), failures };
};
