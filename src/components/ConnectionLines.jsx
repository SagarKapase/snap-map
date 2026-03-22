import { methodColor } from "../utils/constants";

// Card dimensions matching GraphCard widths/heights
const CARD_DIM = {
  root:    { w: 240, h: 110 },
  folder:  { w: 208, h: 80 },
  request: { w: 256, h: 85 },
};
const getCardDim = (type) => CARD_DIM[type] || CARD_DIM.request;

const ConnectionLines = ({ nodes, nodePositions, graphStyle, showParticles = true }) => {
  const lines = [];
  // Build a quick lookup for parent node type
  const nodeMap = {};
  nodes.forEach((n) => { nodeMap[n.id] = n; });

  nodes.forEach((node, idx) => {
    if (!node.parentId) return;
    const p = nodePositions[node.parentId];
    const c = nodePositions[node.id];
    if (!p || !c) return;

    let path = "";
    let stroke = "rgba(58,162,255,0.45)";
    let strokeWidth = 2;

    if (graphStyle === "tree") {
      // ── Vertical S-curve: parent bottom-center → child top-center ──
      const parentNode = nodeMap[node.parentId];
      const pDim = getCardDim(parentNode?.type);
      const cDim = getCardDim(node.type);
      const x1 = p.x + pDim.w / 2;       // parent bottom center X
      const y1 = p.y + pDim.h;            // parent bottom edge
      const x2 = c.x + cDim.w / 2;       // child top center X
      const y2 = c.y;                     // child top edge
      const cpy = (y1 + y2) / 2;          // control point Y (midpoint)
      path = `M ${x1} ${y1} C ${x1} ${cpy}, ${x2} ${cpy}, ${x2} ${y2}`;
      // Color by child method for requests, purple for folders
      stroke = node.type === "request"
        ? methodColor(node.method).line
        : "rgba(224,142,254,0.45)";
      strokeWidth = node.type === "request" ? 1.5 : 2.2;
    } else if (graphStyle === "flowchart") {
      const x1 = p.x + 220, y1 = p.y + 50;
      const x2 = c.x,       y2 = c.y + 50;
      const mx = x1 + (x2 - x1) / 2;
      path = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
      stroke = "rgba(224,142,254,0.45)";
    } else if (graphStyle === "radial") {
      // ── Radial: smooth curve from parent center to child center ──
      const parentNode = nodeMap[node.parentId];
      const pDim = getCardDim(parentNode?.type);
      const cDim = getCardDim(node.type);
      const px = p.x + pDim.w / 2, py = p.y + pDim.h / 2;
      const cx2 = c.x + cDim.w / 2, cy2 = c.y + cDim.h / 2;
      const dx = cx2 - px, dy = cy2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      // Shorten at both ends to stop at card edge
      const pOff = Math.min(pDim.w, pDim.h) * 0.4;
      const cOff = Math.min(cDim.w, cDim.h) * 0.4;
      const x1 = px + ux * pOff, y1 = py + uy * pOff;
      const x2 = cx2 - ux * cOff, y2 = cy2 - uy * cOff;
      // Slight perpendicular curve for visual softness
      const midX = (x1 + x2) / 2 + (y2 - y1) * 0.05;
      const midY = (y1 + y2) / 2 - (x2 - x1) * 0.05;
      path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
      stroke = node.type === "request"
        ? methodColor(node.method).line
        : "rgba(129,236,255,0.45)";
      strokeWidth = node.type === "request" ? 1.5 : 2.2;
    } else if (graphStyle === "graph") {
      // ── Force-directed graph: straight lines from node center to node center ──
      const parentNode = nodeMap[node.parentId];
      const pDim = getCardDim(parentNode?.type);
      const cDim = getCardDim(node.type);
      // Node center points
      const px = p.x + pDim.w / 2, py = p.y + pDim.h / 2;
      const cx2 = c.x + cDim.w / 2, cy2 = c.y + cDim.h / 2;
      // Shorten line so it starts/ends at card edge (approximate with elliptical offset)
      const dx = cx2 - px, dy = cy2 - py;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const pOff = Math.min(pDim.w / 2, pDim.h / 2) * 0.75;
      const cOff = Math.min(cDim.w / 2, cDim.h / 2) * 0.75;
      const x1 = px + ux * pOff, y1 = py + uy * pOff;
      const x2 = cx2 - ux * cOff, y2 = cy2 - uy * cOff;
      // Gentle curve for visual softness
      const midX = (x1 + x2) / 2 + (y2 - y1) * 0.06;
      const midY = (y1 + y2) / 2 - (x2 - x1) * 0.06;
      path = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
      stroke = node.type === "request"
        ? methodColor(node.method).line
        : "rgba(224,142,254,0.40)";
      strokeWidth = node.type === "request" ? 1.5 : 2;
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
      stroke =
        node.type === "request"
          ? methodColor(node.method).line
          : "rgba(224,142,254,0.55)";
      strokeWidth = node.type === "request" ? 1.5 : 2.5;
    }

    const delay = Math.min(idx * 30, 600);
    const mc = node.type === "request" ? methodColor(node.method) : null;
    const particleColor = mc ? mc.dot : "#e08efe";
    const particleDur = 2.5 + (idx % 3) * 0.8;

    lines.push(
      <g key={`g-${node.id}`}>
        <path
          d={path}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="3000"
          pointerEvents="none"
          style={{
            animation: `drawPath 0.7s cubic-bezier(0.4,0,0.2,1) ${delay}ms both, pathPulse 4s ease-in-out ${delay + 700}ms infinite`,
            filter: `drop-shadow(0 0 6px ${stroke})`,
          }}
        />

        {showParticles && (
          <>
            <circle
              r="2.5"
              fill={particleColor}
              opacity="0"
              pointerEvents="none"
              style={{ filter: `drop-shadow(0 0 4px ${particleColor})` }}
            >
              <animateMotion
                dur={`${particleDur}s`}
                repeatCount="indefinite"
                begin={`${delay + 800}ms`}
                path={path}
                rotate="auto"
              />
              <animate
                attributeName="opacity"
                values="0;0.8;1;0.8;0"
                dur={`${particleDur}s`}
                repeatCount="indefinite"
                begin={`${delay + 800}ms`}
              />
              <animate
                attributeName="r"
                values="2;3.5;2"
                dur={`${particleDur}s`}
                repeatCount="indefinite"
                begin={`${delay + 800}ms`}
              />
            </circle>
            {node.type === "folder" && (
              <circle
                r="2"
                fill={particleColor}
                opacity="0"
                pointerEvents="none"
                style={{ filter: `drop-shadow(0 0 3px ${particleColor})` }}
              >
                <animateMotion
                  dur={`${particleDur + 1.2}s`}
                  repeatCount="indefinite"
                  begin={`${delay + 1600}ms`}
                  path={path}
                  rotate="auto"
                />
                <animate
                  attributeName="opacity"
                  values="0;0.5;0.7;0.5;0"
                  dur={`${particleDur + 1.2}s`}
                  repeatCount="indefinite"
                  begin={`${delay + 1600}ms`}
                />
              </circle>
            )}
          </>
        )}
      </g>,
    );
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1, overflow: "visible" }}
    >
      {lines}
    </svg>
  );
};

export default ConnectionLines;
