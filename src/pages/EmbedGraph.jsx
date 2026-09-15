import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import BrandMark from "../components/BrandMark";
import ServiceMap from "../components/contractgraph/ServiceMap";
import { buildContractGraph } from "../utils/contractGraph";
import { readSharedEstate, estateShareUrl } from "../utils/serviceMapExport";
import "../contractgraph.css";

/**
 * A service map on its own, sized for an <iframe> in a wiki or a README.
 * The estate comes from the link; nothing is stored. The map keeps its
 * hover and pan, and a corner link opens the full page.
 */
const EmbedGraph = () => {
  const [estate] = useState(() => readSharedEstate());
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 520 });

  const services = useMemo(
    () => (estate ? estate.services.map((s, i) => ({ id: `shared-${i}`, name: s.name || `Service ${i + 1}`, spec: s.spec })) : []),
    [estate],
  );
  const graph = useMemo(() => buildContractGraph(services), [services]);
  const overrides = useMemo(() => {
    const out = {};
    if (!estate?.positions) return out;
    estate.services.forEach((s, i) => {
      const p = estate.positions[s.name];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[`shared-${i}`] = { x: p.x, y: p.y };
    });
    return out;
  }, [estate]);
  const [live, setLive] = useState(overrides);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fullLink = estate ? estateShareUrl(estate) : null;

  if (!estate) {
    return (
      <div className="cg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: "var(--cg-soft)", fontSize: 14 }}>This link does not carry a readable estate.</p>
      </div>
    );
  }

  return (
    <div className="cg" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--cg-border)", background: "var(--cg-panel)" }}>
        <BrandMark size={18} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{estate.name}</span>
        <span style={{ fontSize: 12, color: "var(--cg-dim)" }}>· {graph.stats.services} services · {graph.stats.edges} relationships</span>
        {fullLink?.ok && (
          <a href={fullLink.url} target="_blank" rel="noreferrer noopener" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--cg-purple-2)", textDecoration: "none" }}>
            Open in Vizroute <ArrowUpRight size={12} />
          </a>
        )}
      </div>
      <div ref={ref} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 8 }}>
        <ServiceMap graph={graph} width={size.w - 16} height={size.h - 16} overrides={live} onOverridesChange={setLive} />
      </div>
    </div>
  );
};

export default EmbedGraph;
