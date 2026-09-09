import { methodColor } from "../utils/constants";

// Card dimensions matching GraphCard widths/heights
const CARD_DIM = {
  root: { w: 240, h: 110 },
  folder: { w: 208, h: 80 },
  request: { w: 256, h: 85 },
};
const getCardDim = (type) => CARD_DIM[type] || CARD_DIM.request;

const BASE_STROKE = "rgba(122,136,163,0.34)";
const DIM_STROKE = "rgba(122,136,163,0.12)";
const ACTIVE_STROKE = "rgba(168,85,247,0.85)";

// Above this many edges the entrance animation and particles are skipped so
// large specs stay responsive.
const ANIMATION_LIMIT = 140;

const ConnectionLines = ({
  nodes,
  nodePositions,
  graphStyle,
  showParticles = false,
  activeId = null,
}) => {
  const lines = [];
  const nodeMap = {};
  nodes.forEach((n) => {
    nodeMap[n.id] = n;
  });

  const edgeCount = nodes.filter((n) => n.parentId).length;
  const animate = edgeCount <= ANIMATION_LIMIT;

  nodes.forEach((node, idx) => {
    if (!node.parentId) return;
    const p = nodePositions[node.parentId];
    const c = nodePositions[node.id];
    if (!p || !c) return;

    let path = "";

    if (graphStyle === "tree") {
      // ── Vertical S-curve: parent bottom-center → child top-center ──
      const pDim = getCardDim(nodeMap[node.parentId]?.type);
      const cDim = getCardDim(node.type);
      const x1 = p.x + pDim.w / 2;
      const y1 = p.y + pDim.h;
      const x2 = c.x + cDim.w / 2;
      const y2 = c.y;
      const cpy = (y1 + y2) / 2;
      path = `M ${x1} ${y1} C ${x1} ${cpy}, ${x2} ${cpy}, ${x2} ${y2}`;
    } else if (graphStyle === "flowchart") {
      const x1 = p.x + 220,
        y1 = p.y + 50;
      const x2 = c.x,
        y2 = c.y + 50;
      const mx = x1 + (x2 - x1) / 2;
      path = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    } else if (graphStyle === "radial") {
      // ── Radial: smooth curve from parent centre to child centre ──
      const pDim = getCardDim(nodeMap[node.parentId]?.type);
      const cDim = getCardDim(node.type);
      const px = p.x + pDim.w / 2,
        py = p.y + pDim.h / 2;
      const cx2 = c.x + cDim.w / 2,
        cy2 = c.y + cDim.h / 2;
      const dx = cx2 - px,
        dy = cy2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist,
        uy = dy / dist;
      const pOff = Math.min(pDim.w, pDim.h) * 0.4;
      const cOff = Math.min(cDim.w, cDim.h) * 0.4;
      const x1 = px + ux * pOff,
        y1 = py + uy * pOff;
      const x2 = cx2 - ux * cOff,
        y2 = cy2 - uy * cOff;
      const midX = (x1 + x2) / 2 + (y2 - y1) * 0.05;
      const midY = (y1 + y2) / 2 - (x2 - x1) * 0.05;
      path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
    } else if (graphStyle === "graph") {
      // ── Force-directed: centre to centre, trimmed at the card edge ──
      const pDim = getCardDim(nodeMap[node.parentId]?.type);
      const cDim = getCardDim(node.type);
      const px = p.x + pDim.w / 2,
        py = p.y + pDim.h / 2;
      const cx2 = c.x + cDim.w / 2,
        cy2 = c.y + cDim.h / 2;
      const dx = cx2 - px,
        dy = cy2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist,
        uy = dy / dist;
      const pOff = Math.min(pDim.w / 2, pDim.h / 2) * 0.75;
      const cOff = Math.min(cDim.w / 2, cDim.h / 2) * 0.75;
      const x1 = px + ux * pOff,
        y1 = py + uy * pOff;
      const x2 = cx2 - ux * cOff,
        y2 = cy2 - uy * cOff;
      const midX = (x1 + x2) / 2 + (y2 - y1) * 0.06;
      const midY = (y1 + y2) / 2 - (x2 - x1) * 0.06;
      path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
    } else {
      // mindmap
      const parentIsRoot = node.parentId === "node-root";
      const parentW = parentIsRoot ? 224 : 208;
      const childW = node.type === "request" ? 256 : 208;
      const isLeft = c.x < p.x;
      const x1 = isLeft ? p.x : p.x + parentW;
      const x2 = isLeft ? c.x + childW : c.x;
      const y1 = p.y + 44;
      const y2 = c.y + 44;
      const cp = (x1 + x2) / 2;
      path = `M ${x1} ${y1} C ${cp} ${y1}, ${cp} ${y2}, ${x2} ${y2}`;
    }

    const isActive =
      activeId != null && (node.id === activeId || node.parentId === activeId);
    const stroke = isActive
      ? ACTIVE_STROKE
      : activeId != null
        ? DIM_STROKE
        : BASE_STROKE;
    const strokeWidth = isActive ? 2 : node.type === "request" ? 1.3 : 1.6;

    const delay = animate ? Math.min(idx * 12, 260) : 0;
    const mc = node.type === "request" ? methodColor(node.method) : null;
    const particleColor = mc ? mc.dot : "#a855f7";
    const particleDur = 2.6 + (idx % 3) * 0.8;

    lines.push(
      <g key={`g-${node.id}`}>
        <path
          d={path}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
          style={{
            transition:
              "stroke 150ms cubic-bezier(0.2,0,0,1), stroke-width 150ms cubic-bezier(0.2,0,0,1)",
            ...(animate
              ? {
                  strokeDasharray: 3000,
                  animation: `drawPath 0.45s cubic-bezier(0.2,0,0,1) ${delay}ms both`,
                }
              : null),
          }}
        />

        {showParticles && animate && (
          <circle r="2.2" fill={particleColor} opacity="0" pointerEvents="none">
            <animateMotion
              dur={`${particleDur}s`}
              repeatCount="indefinite"
              begin={`${delay + 500}ms`}
              path={path}
              rotate="auto"
            />
            <animate
              attributeName="opacity"
              values="0;0.7;0.9;0.7;0"
              dur={`${particleDur}s`}
              repeatCount="indefinite"
              begin={`${delay + 500}ms`}
            />
          </circle>
        )}
      </g>,
    );
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 1, overflow: "visible" }}
    >
      {lines}
    </svg>
  );
};

export default ConnectionLines;
