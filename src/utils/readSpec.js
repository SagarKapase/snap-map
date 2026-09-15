import yaml from "js-yaml";

/**
 * Read a pasted or uploaded document.
 *
 * Everything Vizroute accepts arrives as text and is either JSON or YAML, so
 * JSON is tried first — it is the common case and much faster — and YAML
 * catches the rest. Five files each carried their own copy of this, which is
 * four places for the two behaviours to drift apart.
 *
 * Returns `null` rather than throwing: a half-typed document is an ordinary
 * state for an editor to be in, not an error.
 */
export const parseSpecText = (text) => {
  const source = String(text ?? "");
  if (!source.trim()) return null;

  try {
    return JSON.parse(source);
  } catch {
    /* not JSON — YAML is a superset, so it gets the next go */
  }

  try {
    const value = yaml.load(source);
    return value && typeof value === "object" ? value : null;
  } catch {
    /* not YAML either; the caller decides what to tell the user */
  }

  return null;
};
