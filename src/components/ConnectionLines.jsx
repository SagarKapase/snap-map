import { memo } from "react";
import { methodColor } from "../utils/constants";
import { edgePath } from "../utils/graphGeometry";

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
  const typeById = new Map();
  nodes.forEach((n) => typeById.set(n.id, n.type));

  const edgeCount = nodes.filter((n) => n.parentId).length;
  const animate = edgeCount <= ANIMATION_LIMIT;

  nodes.forEach((node, idx) => {
    if (!node.parentId) return;
    const p = nodePositions[node.parentId];
    const c = nodePositions[node.id];
    if (!p || !c) return;

    // The parent may have been culled from the render set; its position is
    // still known, and the type falls back to a folder-sized card.
    const path = edgePath(
      graphStyle,
      node,
      typeById.get(node.parentId) || "folder",
      p,
      c,
    );
    if (!path) return;

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

export default memo(ConnectionLines);
