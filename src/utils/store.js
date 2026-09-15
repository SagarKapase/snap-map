// ─── Payload store ───────────────────────────
// Specs routinely run to several megabytes, which is past what localStorage
// will hold (~5 MB per origin, and it throws rather than degrading). Anything
// large therefore lives in IndexedDB and only the small metadata record stays
// in localStorage, so the lists stay synchronous while the payloads do not.

const DB_NAME = "vizroute";
const STORE = "payloads";
const DB_VERSION = 1;
const LS_PREFIX = "vizroute_payload_";

const hasIdb = () => {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
};

let dbPromise = null;

const openDb = () => {
  if (!hasIdb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);

  return dbPromise;
};

const tx = (db, mode, run) =>
  new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE, mode);
    } catch (e) {
      reject(e);
      return;
    }
    const request = run(transaction.objectStore(STORE));
    transaction.onabort = () => reject(transaction.error || new Error("aborted"));
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      transaction.oncomplete = () => resolve(undefined);
    }
  });

// ─── localStorage fallback (small payloads only) ──
const lsSet = (key, value) => {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const lsGet = (key) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const lsDelete = (key) => {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* storage unavailable */
  }
};

/**
 * Store a payload. Resolves to true when it was written somewhere it can be
 * read back — callers should treat false as "the metadata is all we kept".
 */
export const putPayload = async (key, value) => {
  const db = await openDb();
  if (db) {
    try {
      // Structured clone: no JSON round-trip, so a 3 MB spec costs nothing
      // on the main thread beyond the clone itself.
      await tx(db, "readwrite", (store) => store.put(value, key));
      return true;
    } catch {
      /* quota or a private-mode failure — fall through */
    }
  }
  return lsSet(key, value);
};

export const getPayload = async (key) => {
  const db = await openDb();
  if (db) {
    try {
      const value = await tx(db, "readonly", (store) => store.get(key));
      if (value !== undefined && value !== null) return value;
    } catch {
      /* fall through to the mirror */
    }
  }
  return lsGet(key);
};

export const deletePayload = async (key) => {
  const db = await openDb();
  if (db) {
    try {
      await tx(db, "readwrite", (store) => store.delete(key));
    } catch {
      /* best effort */
    }
  }
  lsDelete(key);
};

export const deletePayloads = async (keys) => {
  await Promise.all((keys || []).map((key) => deletePayload(key)));
};

/** Drop every payload whose key is not in `keep` — used when a list is trimmed. */
export const prunePayloads = async (prefix, keep) => {
  const kept = new Set(keep || []);
  const db = await openDb();
  if (db) {
    try {
      const keys = await tx(db, "readonly", (store) => store.getAllKeys());
      await Promise.all(
        (keys || [])
          .filter((k) => typeof k === "string" && k.startsWith(prefix) && !kept.has(k))
          .map((k) => deletePayload(k)),
      );
    } catch {
      /* best effort */
    }
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX + prefix))
      .map((k) => k.slice(LS_PREFIX.length))
      .filter((k) => !kept.has(k))
      .forEach(lsDelete);
  } catch {
    /* storage unavailable */
  }
};

/** Wrapper so callers get a boolean instead of an exception. */
export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
