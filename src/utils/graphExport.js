// ─── Graph exporters ─────────────────────────
// Everything here draws from the node list and the position map rather than
// from the live DOM. Reading the DOM meant the export could only ever contain
// the cards React had mounted, cost a forced reflow per card, and — through
// html2canvas — asked the browser for a bitmap far past its own limits. Going
// straight from data is O(n), independent of zoom and scroll, and lets the
// PNG pick a scale that the canvas can actually allocate.

import { getCardDim, edgePath, measureNodes } from "./graphGeometry";
import { methodColor } from "./constants";
import { displayPath } from "./format";

// Chrome allows a far larger canvas, but Safari caps a side at 16,384 px and
// every engine caps total area. Staying inside the strictest limit is what
// makes the export succeed everywhere instead of silently coming back blank.
export const MAX_CANVAS_DIM = 16384;
// Chrome's own ceiling is 268M pixels, but a bitmap that size needs about a
// gigabyte of RAM before it is even encoded. 80M keeps a full-graph export
// around 320 MB, which browsers actually hand over.
export const MAX_CANVAS_AREA = 80_000_000;

const MARGIN = 60;
const BG = "#0a0e16";
const PANEL = "#141a24";
const LINE = "#2a3446";
const TEXT = "#e8ebf2";
const MUTED = "#8b93a6";
const EDGE = "rgba(122,136,163,0.42)";

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Trim a label to fit a card, in the same spirit as the CSS truncation. */
const clip = (text, maxChars) => {
  const value = String(text ?? "");
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
};

const cardLabels = (node) => {
  if (node.type === "root") {
    return { title: node.name, sub: node.version || "API root", accent: "#a855f7" };
  }
  if (node.type === "folder") {
    return {
      title: node.name,
      sub: `${node.itemCount || 0} endpoint${node.itemCount === 1 ? "" : "s"}`,
      accent: "#60a5fa",
    };
  }
  return {
    title: node.name,
    sub: displayPath(node),
    accent: methodColor(node.method).dot,
    method: node.method,
  };
};

/**
 * Shared drawing plan: the edges and cards to paint, already translated so
 * the top-left of the content sits at (MARGIN, MARGIN).
 */
const buildPlan = (nodes, positions, graphStyle) => {
  const bounds = measureNodes(nodes, positions);
  if (!bounds) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dx = MARGIN - bounds.minX;
  const dy = MARGIN - bounds.minY;
  const shifted = {};
  nodes.forEach((n) => {
    const p = positions[n.id];
    if (p) shifted[n.id] = { x: p.x + dx, y: p.y + dy };
  });

  const edges = [];
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const parent = byId.get(node.parentId);
    const p = shifted[node.parentId];
    const c = shifted[node.id];
    if (!p || !c) return;
    edges.push(edgePath(graphStyle, node, parent?.type, p, c));
  });

  const cards = nodes
    .filter((n) => shifted[n.id])
    .map((node) => ({
      node,
      pos: shifted[node.id],
      dim: getCardDim(node.type),
      ...cardLabels(node),
    }));

  return {
    edges,
    cards,
    width: Math.ceil(bounds.width + MARGIN * 2),
    height: Math.ceil(bounds.height + MARGIN * 2),
  };
};

// ─── SVG ─────────────────────────────────────
export const buildGraphSvg = ({ nodes, positions, graphStyle, title }) => {
  const plan = buildPlan(nodes, positions, graphStyle);
  if (!plan) return null;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}" font-family="Inter, Segoe UI, system-ui, sans-serif">`,
  );
  parts.push(`<title>${escapeXml(title || "API graph")}</title>`);
  parts.push(
    `<defs><pattern id="vz-dots" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="10.5" cy="10.5" r="1" fill="rgba(115,125,150,0.22)"/></pattern></defs>`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${BG}"/>`);
  parts.push(`<rect width="100%" height="100%" fill="url(#vz-dots)"/>`);

  parts.push(`<g fill="none" stroke="${EDGE}" stroke-width="1.4" stroke-linecap="round">`);
  plan.edges.forEach((d) => {
    if (d) parts.push(`<path d="${d}"/>`);
  });
  parts.push("</g>");

  plan.cards.forEach(({ pos, dim, title: label, sub, accent, method }) => {
    const { x, y } = pos;
    parts.push("<g>");
    parts.push(
      `<rect x="${x}" y="${y}" width="${dim.w}" height="${dim.h}" rx="12" fill="${PANEL}" stroke="${LINE}"/>`,
    );
    parts.push(
      `<rect x="${x}" y="${y + 12}" width="3" height="${dim.h - 24}" rx="1.5" fill="${accent}"/>`,
    );

    let textY = y + 30;
    if (method) {
      parts.push(
        `<text x="${x + 16}" y="${textY}" font-size="10" font-weight="700" fill="${accent}" letter-spacing="0.06em">${escapeXml(method)}</text>`,
      );
      parts.push(
        `<text x="${x + 62}" y="${textY}" font-size="13" font-weight="600" fill="${TEXT}">${escapeXml(clip(label, 24))}</text>`,
      );
    } else {
      parts.push(
        `<text x="${x + 16}" y="${textY}" font-size="13.5" font-weight="700" fill="${TEXT}">${escapeXml(clip(label, 26))}</text>`,
      );
    }

    textY += 22;
    if (sub) {
      parts.push(
        `<text x="${x + 16}" y="${textY}" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${method ? accent : MUTED}">${escapeXml(clip(sub, 34))}</text>`,
      );
    }
    parts.push("</g>");
  });

  parts.push("</svg>");
  return { svg: parts.join(""), width: plan.width, height: plan.height };
};

// ─── PNG (2D canvas) ─────────────────────────
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** The largest scale this bitmap can use without exceeding the canvas limits. */
export const scaleFor = (width, height, desired = 2) => {
  const byDim = Math.min(MAX_CANVAS_DIM / width, MAX_CANVAS_DIM / height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.max(0.05, Math.min(desired, byDim, byArea));
};

export const renderGraphCanvas = ({
  nodes,
  positions,
  graphStyle,
  desiredScale = 2,
}) => {
  const plan = buildPlan(nodes, positions, graphStyle);
  if (!plan) return null;

  const scale = scaleFor(plan.width, plan.height, desiredScale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(plan.width * scale));
  canvas.height = Math.max(1, Math.floor(plan.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, plan.width, plan.height);

  // Dot grid — skipped when it would be sub-pixel anyway.
  if (scale > 0.4) {
    ctx.fillStyle = "rgba(115,125,150,0.22)";
    for (let gx = 10; gx < plan.width; gx += 21) {
      for (let gy = 10; gy < plan.height; gy += 21) {
        ctx.fillRect(gx, gy, 1, 1);
      }
    }
  }

  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  plan.edges.forEach((d) => {
    if (!d) return;
    try {
      ctx.stroke(new Path2D(d));
    } catch {
      /* an unparseable path is not worth failing the export over */
    }
  });

  const font = "Inter, Segoe UI, system-ui, sans-serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

  plan.cards.forEach(({ pos, dim, title: label, sub, accent, method }) => {
    const { x, y } = pos;
    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, dim.w, dim.h, 12);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = accent;
    roundRect(ctx, x, y + 12, 3, dim.h - 24, 1.5);
    ctx.fill();

    let textY = y + 30;
    if (method) {
      ctx.font = `700 10px ${font}`;
      ctx.fillStyle = accent;
      ctx.fillText(method, x + 16, textY);
      ctx.font = `600 13px ${font}`;
      ctx.fillStyle = TEXT;
      ctx.fillText(clip(label, 24), x + 62, textY);
    } else {
      ctx.font = `700 13.5px ${font}`;
      ctx.fillStyle = TEXT;
      ctx.fillText(clip(label, 26), x + 16, textY);
    }

    textY += 22;
    if (sub) {
      ctx.font = `11px ${mono}`;
      ctx.fillStyle = method ? accent : MUTED;
      ctx.fillText(clip(sub, 34), x + 16, textY);
    }
  });

  return { canvas, scale, width: plan.width, height: plan.height };
};

// ─── CSV ─────────────────────────────────────
const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A flat endpoint list. On a spec with a couple of thousand operations this is
 * the export people actually want — a picture of 2,000 cards is not a review
 * artefact, a sortable sheet is.
 */
export const buildEndpointCsv = (nodes) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rows = [
    ["group", "method", "name", "path", "deprecated", "parameters", "responses", "auth", "description"],
  ];

  nodes
    .filter((n) => n.type === "request")
    .forEach((node) => {
      rows.push([
        byId.get(node.parentId)?.name || "",
        node.method || "",
        node.name || "",
        node.path || "",
        node.deprecated ? "yes" : "",
        (node.params || []).length,
        (node.responses || []).map((r) => r.status).join(" "),
        (node.auth || []).map((a) => a.name).join(" "),
        String(node.description || "").replace(/\s+/g, " ").trim(),
      ]);
    });

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
};
