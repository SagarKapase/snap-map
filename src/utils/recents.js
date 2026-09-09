// ─── Recently imported APIs (this browser only) ──
// Records every spec the user actually parses so the explorer's
// "Recent APIs" list and the History panel show real imports.

const STORAGE_KEY = "vizroute_recent_apis";
const MAX_ENTRIES = 8;

export const getRecents = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persist = (entries) => {
  // Large specs can exceed the quota — drop the oldest until it fits.
  let list = entries.slice(0, MAX_ENTRIES);
  while (list.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return list;
    } catch {
      list = list.slice(0, list.length - 1);
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return [];
};

export const addRecent = ({ name, format, endpoints, data }) => {
  if (!name) return getRecents();
  const entry = {
    id: `recent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    format: format || "Unknown",
    endpoints: endpoints || 0,
    openedAt: new Date().toISOString(),
    data,
  };
  const rest = getRecents().filter(
    (r) => !(r.name === name && r.format === entry.format),
  );
  return persist([entry, ...rest]);
};

export const clearRecents = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return [];
};
