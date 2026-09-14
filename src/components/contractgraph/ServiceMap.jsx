import { useMemo, useState } from "react";
import { layoutServices } from "../../utils/serviceLayout";

const EDGE_STYLE = {
  calls: { dash: "", width: 1.8, opacity: 0.85, label: "calls" },
  references: { dash: "5 4", width: 1.4, opacity: 0.7, label: "references" },
  shares: { dash: "1.5 4", width: 1.1, opacity: 0.45, label: "shares entity" },
};

/**
 * The map. Hovering a service lights the services that depend on it; clicking
 * selects it for the inspector. Edges are drawn by kind, and each carries its
 * evidence as a tooltip.
 */
const ServiceMap = ({ graph, selectedId, onSelect, impacted = [], width = 900, height = 560 }) => {
  const [hovered, setHovered] = useState(null);
  const positions = useMemo(() => layoutServices(graph.services, graph.edges, width, height), [graph, width, height]);
  const maxOps = Math.max(1, ...graph.services.map((s) => s.operations.length));
  const radiusOf = (s) => 18 + Math.round(16 * Math.sqrt(s.operations.length / maxOps));
  const impactSet = new Set(impacted);
  const active = hovered || selectedId;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Service map">
      <defs>
        <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <g>
        {graph.edges.map((edge) => {
          const a = positions.get(edge.from);
          const b = positions.get(edge.to);
          if (!a || !b) return null;
          const style = EDGE_STYLE[edge.kind] || EDGE_STYLE.shares;
          const source = graph.services.find((s) => s.id === edge.from);
          const dim = active && edge.from !== active && edge.to !== active;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const rb = radiusOf(graph.services.find((s) => s.id === edge.to)) + 4;
          const ra = radiusOf(source) + 2;
          const x1 = a.x + (dx / d) * ra;
          const y1 = a.y + (dy / d) * ra;
          const x2 = b.x - (dx / d) * rb;
          const y2 = b.y - (dy / d) * rb;
          return (
            <g key={`${edge.from}-${edge.to}-${edge.kind}`} style={{ color: source?.color || "#a4acbc" }} opacity={dim ? 0.12 : style.opacity}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={style.width} strokeDasharray={style.dash} markerEnd={edge.kind === "shares" ? undefined : "url(#cg-arrow)"}>
                <title>{`${source?.name} ${style.label} ${graph.services.find((s) => s.id === edge.to)?.name}\n${edge.evidence.slice(0, 4).join("\n")}${edge.evidence.length > 4 ? `\n… ${edge.evidence.length - 4} more` : ""}`}</title>
              </line>
            </g>
          );
        })}
      </g>
      <g>
        {graph.services.map((s) => {
          const p = positions.get(s.id);
          const r = radiusOf(s);
          const isActive = active === s.id;
          const isImpacted = impactSet.has(s.id);
          const dim = active && !isActive && !isImpacted;
          return (
            <g
              key={s.id}
              transform={`translate(${p.x} ${p.y})`}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect?.(s.id)}
              className="cursor-pointer"
              opacity={dim ? 0.35 : 1}
              role="button"
              aria-label={`${s.name}: ${s.operations.length} operations`}
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(s.id)}
            >
              {isImpacted && <circle r={r + 7} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 3" />}
              <circle r={r} fill={s.color} fillOpacity={s.isCollection ? 0.25 : 0.9} stroke={isActive ? "#f6f7fb" : s.color} strokeWidth={isActive ? 2.5 : s.isCollection ? 2 : 0} strokeDasharray={s.isCollection ? "4 3" : ""} />
              <text textAnchor="middle" dy="0.35em" fontSize="11" fontWeight="700" fill={s.isCollection ? s.color : "#0b0710"} style={{ pointerEvents: "none" }}>
                {s.operations.length}
              </text>
              <text textAnchor="middle" y={r + 16} fontSize="12" fontWeight="600" fill="#f6f7fb" style={{ pointerEvents: "none" }}>
                {s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name}
              </text>
              {s.isCollection && (
                <text textAnchor="middle" y={r + 30} fontSize="10" fill="#6f7788" style={{ pointerEvents: "none" }}>
                  consumer
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export default ServiceMap;
