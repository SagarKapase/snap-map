// ─── Shared graph geometry ───────────────────
// Card sizes and edge paths live here so the canvas, the connection layer,
// the minimap and the exporters all agree on where a node actually is.

export const CARD_DIM = {
  root: { w: 240, h: 110 },
  folder: { w: 208, h: 80 },
  request: { w: 256, h: 85 },
};

export const getCardDim = (type) => CARD_DIM[type] || CARD_DIM.request;

/**
 * Bounding box of a set of nodes, including the space each card occupies.
 * Returns null when nothing is positioned yet.
 */
export const measureNodes = (nodes, positions) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  nodes.forEach((node) => {
    const pos = positions[node.id];
    if (!pos) return;
    const dim = getCardDim(node.type);
    count += 1;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + dim.w > maxX) maxX = pos.x + dim.w;
    if (pos.y + dim.h > maxY) maxY = pos.y + dim.h;
  });

  if (!count) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, count };
};

/**
 * The curve between a node and its parent, in graph coordinates.
 * `parent` may be undefined when the parent has been culled from the render
 * set — the caller still has its position, which is all this needs.
 */
export const edgePath = (graphStyle, node, parentType, parentPos, childPos) => {
  const p = parentPos;
  const c = childPos;
  if (!p || !c) return "";

  const pDim = getCardDim(parentType);
  const cDim = getCardDim(node.type);

  if (graphStyle === "tree") {
    const x1 = p.x + pDim.w / 2;
    const y1 = p.y + pDim.h;
    const x2 = c.x + cDim.w / 2;
    const y2 = c.y;
    const cpy = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${cpy}, ${x2} ${cpy}, ${x2} ${y2}`;
  }

  if (graphStyle === "flowchart") {
    const x1 = p.x + pDim.w;
    const y1 = p.y + pDim.h / 2;
    const x2 = c.x;
    const y2 = c.y + cDim.h / 2;
    const mx = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
  }

  if (graphStyle === "radial" || graphStyle === "graph") {
    const px = p.x + pDim.w / 2;
    const py = p.y + pDim.h / 2;
    const cx = c.x + cDim.w / 2;
    const cy = c.y + cDim.h / 2;
    const dx = cx - px;
    const dy = cy - py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const trim = graphStyle === "radial" ? 0.4 : 0.375;
    const pOff = Math.min(pDim.w, pDim.h) * trim;
    const cOff = Math.min(cDim.w, cDim.h) * trim;
    const x1 = px + ux * pOff;
    const y1 = py + uy * pOff;
    const x2 = cx - ux * cOff;
    const y2 = cy - uy * cOff;
    const bow = graphStyle === "radial" ? 0.05 : 0.06;
    const midX = (x1 + x2) / 2 + (y2 - y1) * bow;
    const midY = (y1 + y2) / 2 - (x2 - x1) * bow;
    return `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
  }

  // mindmap — leave the card on the side the child sits on
  const isLeft = c.x < p.x;
  const x1 = isLeft ? p.x : p.x + pDim.w;
  const x2 = isLeft ? c.x + cDim.w : c.x;
  const y1 = p.y + pDim.h / 2;
  const y2 = c.y + cDim.h / 2;
  const cp = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cp} ${y1}, ${cp} ${y2}, ${x2} ${y2}`;
};
