import { useMemo } from "react";
import { getCardDim } from "../../utils/graphGeometry";

/**
 * The state a collection passes between its requests, drawn on the map.
 *
 * These edges are not the folder hierarchy the graph already shows — they run
 * from the request whose test script writes a variable to every request that
 * reads it, which routinely crosses folders and is invisible in Postman.
 *
 * Only the selected request's edges are drawn. A token written once and read
 * by two hundred requests would otherwise bury the map in lines, and the
 * question people actually have is about one request at a time.
 */

// Even for a single selection, a very popular variable needs a ceiling.
const MAX_EDGES = 60;

const centreOf = (node, positions) => {
  const position = positions[node.id];
  if (!position) return null;
  const dim = getCardDim(node.type);
  return { x: position.x + dim.w / 2, y: position.y + dim.h / 2 };
};

/** A gentle arc, so a flow edge never hides under a hierarchy edge. */
const arc = (from, to) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  // Bow perpendicular to the line, scaled down on long runs.
  const bow = Math.min(70, distance * 0.18);
  const midX = (from.x + to.x) / 2 - (dy / distance) * bow;
  const midY = (from.y + to.y) / 2 + (dx / distance) * bow;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
};

const VariableFlowLines = ({
  nodes = [],
  nodePositions = {},
  flow = null,
  selectedId = null,
  visible = true,
}) => {
  const edges = useMemo(() => {
    if (!visible || !flow || !selectedId) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));

    return flow.edges
      .filter((edge) => edge.from === selectedId || edge.to === selectedId)
      .map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const a = centreOf(from, nodePositions);
        const b = centreOf(to, nodePositions);
        if (!a || !b) return null;
        return {
          key: `${edge.from}->${edge.to}:${edge.variable}`,
          d: arc(a, b),
          variable: edge.variable,
          outgoing: edge.from === selectedId,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      })
      .filter(Boolean)
      .slice(0, MAX_EDGES);
  }, [flow, selectedId, nodes, nodePositions, visible]);

  if (!edges.length) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="vz-flow-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#34d399" />
        </marker>
      </defs>

      {edges.map((edge) => (
        <g key={edge.key}>
          <path
            d={edge.d}
            fill="none"
            stroke={edge.outgoing ? "rgba(52,211,153,0.75)" : "rgba(96,165,250,0.6)"}
            strokeWidth="1.6"
            strokeDasharray="5 4"
            markerEnd={edge.outgoing ? "url(#vz-flow-arrow)" : undefined}
          />
          <text
            x={edge.mid.x}
            y={edge.mid.y - 4}
            textAnchor="middle"
            fontSize="10"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill={edge.outgoing ? "#34d399" : "#60a5fa"}
          >
            {edge.variable}
          </text>
        </g>
      ))}
    </svg>
  );
};

export default VariableFlowLines;
