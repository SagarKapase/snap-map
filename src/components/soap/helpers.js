/** Small helpers shared by the workbench views: downloads, names, counts. */

export const downloadBytes = (name, bytes, type) => {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadText = (name, text, type = "text/plain") => downloadBytes(name, text, `${type};charset=utf-8`);

export const safeName = (name) => String(name || "service").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "service";

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const formatCalls = (n) => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
};
