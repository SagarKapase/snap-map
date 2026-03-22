import LZString from "lz-string";

/**
 * Compress a spec object into a URL-safe string.
 */
export const compressSpec = (data) => {
  try {
    const json = JSON.stringify(data);
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

/**
 * Generate a shareable URL for the current spec.
 */
export const generateShareUrl = (data) => {
  const compressed = compressSpec(data);
  if (!compressed) return null;
  const base = window.location.origin + window.location.pathname;
  return `${base}?spec=${compressed}`;
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
