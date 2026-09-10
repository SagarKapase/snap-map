import LZString from "lz-string";

// A share link carries the whole spec in its query string, which only works
// while the spec is small. The Shopware admin API compresses to 570,973
// characters — every CDN and proxy in the path rejects a request line that
// long, so the old code copied a link that could never be opened. These
// limits keep the link honest and hand large specs to a file instead.
export const URL_LIMIT = 16_000;

// Above this the compression itself is the problem: 2.8 MB of JSON took
// 1.2 s on the main thread, and the result was never going to fit anyway.
const SOURCE_LIMIT = 200_000;

/**
 * Compress a spec object into a URL-safe string.
 * Returns null when the spec is too large to be worth compressing.
 */
export const compressSpec = (data) => {
  try {
    const json = JSON.stringify(data);
    if (json.length > SOURCE_LIMIT) return null;
    return LZString.compressToEncodedURIComponent(json);
  } catch {
    return null;
  }
};

/**
 * Decompress a URL-safe string back into a spec object.
 */
export const decompressSpec = (compressed) => {
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    const data = JSON.parse(json);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
};

/** Rough size of a spec, for messages — never throws on a cyclic object. */
export const specSize = (data) => {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
};

/**
 * Build a shareable URL.
 * `{ ok: true, url }` when it fits, `{ ok: false, reason, bytes }` otherwise,
 * so the caller can offer the file fallback rather than copying a dead link.
 */
export const generateShareUrl = (data) => {
  const bytes = specSize(data);
  if (!bytes) return { ok: false, reason: "unreadable", bytes: 0 };

  const compressed = compressSpec(data);
  if (!compressed) return { ok: false, reason: "too-large", bytes };

  const base = window.location.origin + window.location.pathname;
  const url = `${base}?spec=${compressed}`;
  if (url.length > URL_LIMIT) {
    return { ok: false, reason: "too-large", bytes, urlLength: url.length };
  }
  return { ok: true, url, bytes, urlLength: url.length };
};

/**
 * Check if the current URL has a shared spec and extract it.
 */
export const extractSharedSpec = () => {
  const params = new URLSearchParams(window.location.search);
  const specParam = params.get("spec");
  if (!specParam) return null;
  return decompressSpec(specParam);
};

/** The fallback for specs a URL cannot carry: hand over the file itself. */
export const downloadSpecFile = (data, name = "api-spec") => {
  try {
    const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "api-spec";
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
};
