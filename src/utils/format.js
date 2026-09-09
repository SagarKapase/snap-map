// ─── Display helpers shared across the workspace UI ──

/**
 * Full URLs are noisy in narrow panels — show the path, keep the URL in a title.
 * The origin is stripped textually rather than via `new URL`, which would
 * percent-encode spec placeholders (`/v1/customers/{id}` → `%7Bid%7D`).
 */
export const displayPath = (node) => {
  const raw = String(node?.path || "");
  if (!raw) return node?.name || "";
  const match = raw.match(/^[a-zA-Z][\w+.-]*:\/\/[^/?#]+([/?#].*)?$/);
  if (!match) return raw;
  return match[1] || "/";
};

/** Stringify anything for a code block without throwing on cycles. */
export const toJsonText = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
