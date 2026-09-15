/**
 * Sharing and picturing a Contract Graph workspace.
 *
 *  – A share link carries the whole estate — every specification, plus the
 *    arrangement the author dragged into place — compressed into the URL,
 *    the same way a single spec is shared. Above the URL limit the export
 *    file is the fallback, and the caller says so rather than copying a
 *    link that cannot open.
 *  – The picture is the on-screen SVG itself, serialised with its dot grid
 *    and fonts made explicit, so the PNG and SVG match the map exactly.
 */
import { compressSpec, decompressSpec, URL_LIMIT } from "./sharing";
import { scaleFor } from "./graphExport";

export const ESTATE_KIND = "contract-graph-estate";

/**
 * Everything a link or a file needs. Positions are keyed by service name
 * rather than id, because ids are minted per workspace and the receiver
 * mints its own.
 */
export const buildEstatePayload = ({ name, services, positionsByName = {} }) => ({
  vizroute: ESTATE_KIND,
  version: 1,
  name: String(name || "Shared estate"),
  services: (services || [])
    .filter((s) => s && s.spec)
    .map((s) => ({ name: s.name, sourceUrl: s.sourceUrl || "", spec: s.spec })),
  positions: positionsByName,
});

export const isEstatePayload = (data) =>
  Boolean(data && typeof data === "object" && (data.vizroute === ESTATE_KIND || data.vizroute === "contract-graph-workspace") && Array.isArray(data.services));

/** `{ ok, url }` when the estate fits in a link, `{ ok: false, reason, bytes }` when it does not. */
export const estateShareUrl = (payload, { origin = window.location.origin, path = "/graph" } = {}) => {
  let bytes = 0;
  try {
    bytes = JSON.stringify(payload).length;
  } catch {
    return { ok: false, reason: "unreadable", bytes: 0 };
  }
  const compressed = compressSpec(payload);
  if (!compressed) return { ok: false, reason: "too-large", bytes };
  const url = `${origin}${path}?estate=${compressed}`;
  if (url.length > URL_LIMIT) return { ok: false, reason: "too-large", bytes, urlLength: url.length };
  return { ok: true, url, bytes, urlLength: url.length };
};

export const estateEmbedSnippet = (payload, opts) => {
  const share = estateShareUrl(payload, { ...opts, path: "/embed-graph" });
  if (!share.ok) return share;
  return {
    ok: true,
    url: share.url,
    snippet: `<iframe src="${share.url}" width="100%" height="560" style="border:1px solid #222a39;border-radius:12px" loading="lazy" title="Service map"></iframe>`,
  };
};

/** The estate in the current URL, if any, or null. */
export const readSharedEstate = (search = window.location.search) => {
  const raw = new URLSearchParams(search).get("estate");
  if (!raw) return null;
  const data = decompressSpec(raw);
  return isEstatePayload(data) ? data : null;
};

// ─── Pictures ────────────────────────────────

const DOTS = `<pattern id="cg-export-dots" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="10.5" cy="10.5" r="1" fill="rgba(115,125,150,0.22)"/></pattern>`;

/**
 * A standalone SVG of the map as it is on screen.
 *
 * `svgEl` is the live canvas element; `extent` is the box that holds every
 * node (the element carries it as data-extent). The clone gets an explicit
 * size, the dot grid the container paints with CSS, and the page font.
 */
export const serviceMapSvg = (svgEl, { title = "Service map", extent: given } = {}) => {
  if (!svgEl) return null;
  const extent = given || parseExtent(svgEl.getAttribute("data-extent"));
  if (!extent) return null;
  const width = Math.ceil(extent.w);
  const height = Math.ceil(extent.h);
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.removeAttribute("role");
  clone.removeAttribute("aria-label");
  clone.removeAttribute("data-extent");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `${extent.x} ${extent.y} ${extent.w} ${extent.h}`);
  clone.setAttribute("font-family", "Inter, Segoe UI, system-ui, sans-serif");
  // Tooltips are noise in a file.
  clone.querySelectorAll("title").forEach((t) => t.remove());

  const ns = "http://www.w3.org/2000/svg";
  const titleEl = document.createElementNS(ns, "title");
  titleEl.textContent = title;
  const defs = clone.querySelector("defs") || clone.insertBefore(document.createElementNS(ns, "defs"), clone.firstChild);
  defs.insertAdjacentHTML("beforeend", DOTS);
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", String(extent.x));
  bg.setAttribute("y", String(extent.y));
  bg.setAttribute("width", String(extent.w));
  bg.setAttribute("height", String(extent.h));
  bg.setAttribute("fill", "#0a0e16");
  const dots = bg.cloneNode();
  dots.setAttribute("fill", "url(#cg-export-dots)");
  defs.after(bg, dots);
  clone.insertBefore(titleEl, clone.firstChild);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  return { svg, width, height };
};

const parseExtent = (text) => {
  const parts = String(text || "").split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
};

/** Rasterise an SVG string; resolves a PNG Blob or rejects with a reason. */
export const svgToPng = ({ svg, width, height, desiredScale = 2 }) =>
  new Promise((resolve, reject) => {
    const scale = scaleFor(width, height, desiredScale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("This browser cannot draw the picture."));
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve({ blob, scale }) : reject(new Error("The picture could not be encoded."))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The browser refused to draw the map as an image."));
    };
    img.src = url;
  });

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const safeFilename = (name, fallback = "service-map") =>
  String(name || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || fallback;
