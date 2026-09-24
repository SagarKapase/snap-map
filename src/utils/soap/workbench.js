/**
 * The migration programme: every WSDL a person has brought in, with its
 * attached XSDs, the reviewer's decisions and each operation's migration
 * status. The small record lives in localStorage per signed-in user so the
 * list renders synchronously; the documents themselves, which run to
 * megabytes, live in IndexedDB through the shared payload store.
 *
 * Coverage — the number the programme is funded on — is computed here
 * from statuses and traffic weights so the dashboard and the tests agree.
 */
import { putPayload, getPayload, deletePayloads } from "../store";
import { MIGRATION_STATUSES } from "./design";

const PREFIX = "vizroute_soap_programme:";
export const MAX_SERVICES = 300;
const NAME_LIMIT = 80;
const MAX_ATTACHMENTS = 40;

const bucket = (userId) => `${PREFIX}${userId || "anonymous"}`;

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
    return Array.isArray(list) ? list.filter((s) => s && typeof s === "object" && typeof s.id === "string") : [];
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

const uid = () => `wsdl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();
const cleanName = (name, fallback) => String(name ?? "").trim().slice(0, NAME_LIMIT) || fallback;
export const payloadKey = (serviceId) => `soap:${serviceId}`;

/** Every service in the programme, newest first. */
export const listProgramme = (userId) => read(userId).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

export const getProgrammeService = (userId, id) => read(userId).find((s) => s.id === id) || null;

/**
 * Add a WSDL. `wsdl` is the text, `attachments` a map of file name → text
 * for its XSDs. `summary` is what the parser found (operation names,
 * warnings) so the list can show counts without re-parsing.
 */
export const addWsdl = (userId, input) => serialized(() => addWsdlNow(userId, input));

const addWsdlNow = async (userId, { name, wsdl, attachments = {}, sourceUrl = "", summary = {}, traffic = {} }) => {
  if (typeof wsdl !== "string" || !wsdl.trim()) throw new Error("That file is empty.");
  const list = read(userId);
  if (list.length >= MAX_SERVICES) throw new Error(`A programme holds up to ${MAX_SERVICES} services.`);
  const base = cleanName(name, `Service ${list.length + 1}`);
  let unique = base;
  let n = 2;
  while (list.some((s) => s.name.toLowerCase() === unique.toLowerCase())) unique = `${base} (${n++})`;
  const docs = Object.fromEntries(Object.entries(attachments || {}).filter(([k, v]) => k && typeof v === "string").slice(0, MAX_ATTACHMENTS));
  const service = {
    id: uid(),
    name: unique,
    sourceUrl,
    addedAt: now(),
    updatedAt: now(),
    bytes: wsdl.length + Object.values(docs).reduce((sum, t) => sum + t.length, 0),
    attachmentNames: Object.keys(docs),
    operations: Array.isArray(summary.operations) ? summary.operations.slice(0, 5000) : [],
    warnings: Number(summary.warnings) || 0,
    wsdlVersion: summary.version || "",
    overrides: {},
    statuses: {},
    traffic: sanitizeTraffic(traffic),
    options: { propertyCase: "camel", basePath: "/v1" },
  };
  const stored = await putPayload(payloadKey(service.id), { wsdl, attachments: docs });
  if (!stored) throw new Error("The browser refused to store this WSDL (storage may be full).");
  list.unshift(service);
  if (!write(userId, list)) {
    await deletePayloads([payloadKey(service.id)]);
    throw new Error("The browser refused to store the programme record (storage may be full).");
  }
  return service;
};

/** Attach an XSD (or an imported WSDL) to a service; re-parsing is the caller's job. */
export const attachDocument = (userId, serviceId, fileName, text) => serialized(async () => {
  if (typeof text !== "string" || !text.trim()) throw new Error("That file is empty.");
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) throw new Error("This service no longer exists.");
  const payload = (await getPayload(payloadKey(serviceId))) || { wsdl: "", attachments: {} };
  const attachments = { ...(payload.attachments || {}) };
  const name = cleanName(fileName, `schema-${Object.keys(attachments).length + 1}.xsd`);
  if (!Object.prototype.hasOwnProperty.call(attachments, name) && Object.keys(attachments).length >= MAX_ATTACHMENTS) throw new Error(`A service holds up to ${MAX_ATTACHMENTS} attached schemas.`);
  attachments[name] = text;
  const stored = await putPayload(payloadKey(serviceId), { ...payload, attachments });
  if (!stored) throw new Error("The browser refused to store this schema (storage may be full).");
  service.attachmentNames = Object.keys(attachments);
  service.bytes = (payload.wsdl || "").length + Object.values(attachments).reduce((sum, t) => sum + t.length, 0);
  service.updatedAt = now();
  write(userId, list);
  return service;
});

export const removeAttachment = (userId, serviceId, fileName) => serialized(async () => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  const payload = (await getPayload(payloadKey(serviceId))) || { wsdl: "", attachments: {} };
  const attachments = { ...(payload.attachments || {}) };
  delete attachments[fileName];
  await putPayload(payloadKey(serviceId), { ...payload, attachments });
  service.attachmentNames = Object.keys(attachments);
  service.updatedAt = now();
  write(userId, list);
  return service;
});

/** Record what the parser found, so the list stays right after a re-parse. */
export const updateSummary = (userId, serviceId, summary = {}) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  if (Array.isArray(summary.operations)) service.operations = summary.operations.slice(0, 5000);
  if (summary.warnings !== undefined) service.warnings = Number(summary.warnings) || 0;
  if (summary.version) service.wsdlVersion = summary.version;
  write(userId, list);
  return service;
};

export const renameProgrammeService = (userId, serviceId, name) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  service.name = cleanName(name, service.name);
  service.updatedAt = now();
  write(userId, list);
  return service;
};

export const removeProgrammeService = (userId, serviceId) => serialized(async () => {
  const list = read(userId);
  if (!list.some((s) => s.id === serviceId)) return false;
  write(userId, list.filter((s) => s.id !== serviceId));
  await deletePayloads([payloadKey(serviceId)]);
  return true;
});

/** The reviewer's decision for one operation: method, path, summary, notes. */
export const setOverride = (userId, serviceId, operation, override) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service || typeof operation !== "string" || !operation) return null;
  const clean = {};
  if (override && typeof override === "object") {
    if (typeof override.method === "string" && /^(GET|POST|PUT|PATCH|DELETE)$/i.test(override.method.trim())) clean.method = override.method.trim().toUpperCase();
    if (typeof override.path === "string" && override.path.trim()) clean.path = override.path.trim().slice(0, 300);
    if (typeof override.summary === "string" && override.summary.trim()) clean.summary = override.summary.trim().slice(0, 120);
    if (typeof override.notes === "string" && override.notes.trim()) clean.notes = override.notes.trim().slice(0, 2000);
  }
  service.overrides = { ...(service.overrides || {}) };
  if (Object.keys(clean).length) service.overrides[operation] = clean;
  else delete service.overrides[operation];
  service.updatedAt = now();
  write(userId, list);
  return service;
};

export const setStatus = (userId, serviceId, operation, status) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service || typeof operation !== "string" || !operation) return null;
  if (!MIGRATION_STATUSES.some((s) => s.id === status)) throw new Error(`"${status}" is not a migration status.`);
  service.statuses = { ...(service.statuses || {}), [operation]: status };
  service.updatedAt = now();
  write(userId, list);
  return service;
};

export const setStatuses = (userId, serviceId, statuses) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  const clean = {};
  Object.entries(statuses || {}).forEach(([op, status]) => {
    if (MIGRATION_STATUSES.some((s) => s.id === status)) clean[op] = status;
  });
  service.statuses = { ...(service.statuses || {}), ...clean };
  service.updatedAt = now();
  write(userId, list);
  return service;
};

export const setOptions = (userId, serviceId, options) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  const next = { ...(service.options || {}) };
  if (["keep", "camel", "snake"].includes(options?.propertyCase)) next.propertyCase = options.propertyCase;
  if (typeof options?.basePath === "string") next.basePath = options.basePath.trim().slice(0, 40);
  service.options = next;
  service.updatedAt = now();
  write(userId, list);
  return service;
};

const sanitizeTraffic = (traffic) => {
  const out = {};
  Object.entries(traffic || {}).forEach(([op, calls]) => {
    const n = Number(calls);
    if (op && Number.isFinite(n) && n >= 0) out[op] = Math.round(n);
  });
  return out;
};

/** Call counts per operation, for prioritisation. Replaces the previous set. */
export const setTraffic = (userId, serviceId, traffic) => {
  const list = read(userId);
  const service = list.find((s) => s.id === serviceId);
  if (!service) return null;
  service.traffic = sanitizeTraffic(traffic);
  service.updatedAt = now();
  write(userId, list);
  return service;
};

/**
 * Read "operation,calls" lines (CSV or whitespace separated; a header row
 * is skipped). Returns `{ traffic, unknown, bad }` so the page can say what
 * it ignored.
 */
export const parseTrafficText = (text, knownOperations = []) => {
  const known = new Set(knownOperations);
  const traffic = {};
  const unknown = [];
  const bad = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,;\t]|\s{2,}|\s+(?=\d+\s*$)/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) {
      bad.push(`Line ${i + 1}: "${trimmed.slice(0, 40)}" is not "operation, calls".`);
      return;
    }
    const [op, ...rest] = parts;
    // "1,200" split on the comma; digit-only tails are thousands groups.
    const calls = rest.length > 1 && rest.every((r) => /^\d+$/.test(r)) ? rest.join("") : rest[0];
    const n = Number(String(calls).replace(/[_,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      if (i === 0 && /calls|count|hits|requests/i.test(calls)) return; // header
      bad.push(`Line ${i + 1}: "${calls}" is not a number.`);
      return;
    }
    if (known.size && !known.has(op)) {
      const match = knownOperations.find((k) => k.toLowerCase() === op.toLowerCase());
      if (match) traffic[match] = (traffic[match] || 0) + Math.round(n);
      else unknown.push(op);
      return;
    }
    traffic[op] = (traffic[op] || 0) + Math.round(n);
  });
  return { traffic, unknown, bad };
};

/** The documents of a service, from IndexedDB. */
export const loadDocuments = async (serviceId) => {
  const payload = await getPayload(payloadKey(serviceId));
  return payload && typeof payload === "object" ? { wsdl: String(payload.wsdl || ""), attachments: payload.attachments && typeof payload.attachments === "object" ? payload.attachments : {} } : { wsdl: "", attachments: {} };
};

// ─── Coverage ────────────────────────────────

const DONE = new Set(["migrated", "skipped"]);

/**
 * Coverage across the programme. Each input service: `{ id, name,
 * operations: [names], statuses, traffic }`. Returns per-status counts,
 * the share of operations and of traffic that is done, per-service rows,
 * and the queue — operations ranked by traffic, undone first.
 */
export const coverageOf = (services = []) => {
  const byStatus = Object.fromEntries(MIGRATION_STATUSES.map((s) => [s.id, 0]));
  let total = 0;
  let done = 0;
  let trafficTotal = 0;
  let trafficDone = 0;
  const queue = [];
  const perService = services.map((service) => {
    const ops = Array.isArray(service.operations) ? service.operations : [];
    const statuses = service.statuses || {};
    const traffic = service.traffic || {};
    let serviceDone = 0;
    let serviceTraffic = 0;
    let serviceTrafficDone = 0;
    const serviceByStatus = Object.fromEntries(MIGRATION_STATUSES.map((s) => [s.id, 0]));
    ops.forEach((op) => {
      const status = MIGRATION_STATUSES.some((s) => s.id === statuses[op]) ? statuses[op] : "proposed";
      const calls = Number(traffic[op]) || 0;
      byStatus[status] += 1;
      serviceByStatus[status] += 1;
      total += 1;
      trafficTotal += calls;
      serviceTraffic += calls;
      if (DONE.has(status)) {
        done += 1;
        serviceDone += 1;
        trafficDone += calls;
        serviceTrafficDone += calls;
      }
      queue.push({ serviceId: service.id, serviceName: service.name, operation: op, status, calls, done: DONE.has(status) });
    });
    return {
      id: service.id,
      name: service.name,
      operations: ops.length,
      done: serviceDone,
      share: ops.length ? serviceDone / ops.length : 0,
      traffic: serviceTraffic,
      trafficDone: serviceTrafficDone,
      trafficShare: serviceTraffic ? serviceTrafficDone / serviceTraffic : 0,
      byStatus: serviceByStatus,
    };
  });
  queue.sort((a, b) => Number(a.done) - Number(b.done) || b.calls - a.calls || a.operation.localeCompare(b.operation));
  let running = 0;
  queue.forEach((item) => {
    item.trafficShare = trafficTotal ? item.calls / trafficTotal : 0;
    running += item.calls;
    item.cumulativeShare = trafficTotal ? running / trafficTotal : 0;
  });
  // How many operations carry 80 % of the calls — the Pareto slice to migrate first.
  const ranked = [...queue].sort((a, b) => b.calls - a.calls);
  let acc = 0;
  let pareto = 0;
  for (const item of ranked) {
    if (trafficTotal && acc / trafficTotal >= 0.8) break;
    acc += item.calls;
    pareto += 1;
  }
  return {
    services: services.length,
    operations: total,
    done,
    share: total ? done / total : 0,
    byStatus,
    traffic: trafficTotal,
    trafficDone,
    trafficShare: trafficTotal ? trafficDone / trafficTotal : 0,
    hasTraffic: trafficTotal > 0,
    pareto: trafficTotal ? pareto : 0,
    perService,
    queue,
  };
};

// ─── Export / import ─────────────────────────

export const exportProgramme = async (userId) => {
  const services = listProgramme(userId);
  const entries = [];
  for (const s of services) {
    const docs = await loadDocuments(s.id);
    entries.push({ name: s.name, sourceUrl: s.sourceUrl || "", wsdl: docs.wsdl, attachments: docs.attachments, overrides: s.overrides || {}, statuses: s.statuses || {}, traffic: s.traffic || {}, options: s.options || {} });
  }
  return { vizroute: "soap-migration-programme", version: 1, exportedAt: now(), services: entries };
};

export const importProgramme = async (userId, data) => {
  if (!data || data.vizroute !== "soap-migration-programme" || !Array.isArray(data.services)) {
    throw new Error("That file is not a SOAP Migration Workbench programme export.");
  }
  const added = [];
  const failures = [];
  for (const entry of data.services.slice(0, MAX_SERVICES)) {
    try {
      const service = await addWsdl(userId, { name: entry?.name, wsdl: entry?.wsdl, attachments: entry?.attachments || {}, sourceUrl: entry?.sourceUrl || "", traffic: entry?.traffic || {} });
      if (entry?.overrides && typeof entry.overrides === "object") Object.entries(entry.overrides).forEach(([op, o]) => setOverride(userId, service.id, op, o));
      if (entry?.statuses) setStatuses(userId, service.id, entry.statuses);
      if (entry?.options) setOptions(userId, service.id, entry.options);
      added.push(getProgrammeService(userId, service.id));
    } catch (e) {
      failures.push(`${entry?.name || "unnamed"}: ${e.message}`);
    }
  }
  return { added, failures };
};
