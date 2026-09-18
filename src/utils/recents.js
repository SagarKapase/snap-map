// ─── Recently imported APIs (this browser only) ──
// Records every spec the user actually parses so the explorer's
// "Recent APIs" list and the History panel show real imports.
//
// Only the metadata lives in localStorage. The spec itself goes to IndexedDB,
// because a single real-world OpenAPI document (2.8 MB minified for the
// Shopware admin API) is already over half the localStorage quota — keeping
// payloads there meant the second import evicted the first, and there was no
// room left for saved collections at all.

import { putPayload, getPayload, deletePayload, prunePayloads, safeSetItem } from "./store";

const STORAGE_KEY = "vizroute_recent_apis";
const PAYLOAD_PREFIX = "recent:";
const MAX_ENTRIES = 8;

const payloadKey = (id) => `${PAYLOAD_PREFIX}${id}`;

export const getRecents = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    // Older builds inlined `data` on the entry; drop it so the list stays light.
    return parsed.map((entry) => ({
      id: entry.id,
      name: entry.name,
      format: entry.format,
      endpoints: entry.endpoints,
      openedAt: entry.openedAt,
      // Entries written before the split still carry their spec inline; keep
      // it so an existing history stays openable.
      ...(entry.data ? { data: entry.data } : null),
    }));
  } catch {
    return [];
  }
};

const persist = (entries) => {
  const list = entries.slice(0, MAX_ENTRIES);
  if (!safeSetItem(STORAGE_KEY, JSON.stringify(list))) {
    // Metadata is tiny, so a failure here means storage is off entirely.
    return [];
  }
  return list;
};

/**
 * Record an import. Returns the new list synchronously; the spec payload is
 * written in the background so a 3 MB import does not block the first paint
 * of the graph.
 */
export const addRecent = ({ name, format, endpoints, data }) => {
  if (!name) return getRecents();

  const entry = {
    id: `recent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    format: format || "Unknown",
    endpoints: endpoints || 0,
    openedAt: new Date().toISOString(),
  };

  const rest = getRecents().filter(
    (r) => !(r.name === name && r.format === entry.format),
  );
  const dropped = getRecents().filter(
    (r) => r.name === name && r.format === entry.format,
  );

  const list = persist([entry, ...rest]);

  Promise.resolve()
    .then(() => putPayload(payloadKey(entry.id), data))
    .then(() => {
      const keep = list.map((r) => payloadKey(r.id));
      return Promise.all([
        ...dropped.map((r) => deletePayload(payloadKey(r.id))),
        prunePayloads(PAYLOAD_PREFIX, keep),
      ]);
    })
    .catch(() => {
      /* the entry stays in the list; opening it will report the miss */
    });

  return list;
};

/** Load the spec behind a recent entry. Resolves null when it has been evicted. */
export const loadRecentData = async (entry) => {
  if (!entry) return null;
  if (entry.data) return entry.data; // entries written by an older build
  return getPayload(payloadKey(entry.id));
};

/** Forget one recent entry and the spec stored behind it. */
export const removeRecent = (id) => {
  const list = getRecents().filter((r) => r.id !== id);
  persist(list);
  deletePayload(payloadKey(id)).catch(() => {});
  return list;
};

export const clearRecents = () => {
  const list = getRecents();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  Promise.all(list.map((r) => deletePayload(payloadKey(r.id)))).catch(() => {});
  return [];
};
