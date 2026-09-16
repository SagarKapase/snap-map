import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// A hub and four spokes: what a Contract Graph workspace draws.
const SPOKES = [
  { label: "Service", x: 110, y: 18 },
  { label: "Endpoint", x: 28, y: 65 },
  { label: "Dependency", x: 192, y: 65 },
  { label: "Change", x: 110, y: 114 },
];

const MapArt = () => (
  <svg className="hm-cta-art" viewBox="0 0 220 130" aria-hidden="true" focusable="false">
    {SPOKES.map((s) => <line key={s.label} x1="110" y1="65" x2={s.x} y2={s.y} />)}
    {SPOKES.map((s) => (
      <g key={s.label}>
        <rect className="sat" x={s.x - 30} y={s.y - 10} width="60" height="20" rx="6" />
        <text x={s.x} y={s.y + 3.5}>{s.label}</text>
      </g>
    ))}
    <rect className="core" x="88" y="49" width="44" height="32" rx="9" />
    <text className="core-label" x="110" y="69">API</text>
  </svg>
);

/** The pitch for the multi-service map, pointing at Contract Graph. */
const ApiMapCta = () => (
  <section className="hm-cta" aria-labelledby="hm-cta-title">
    <div>
      <h2 id="hm-cta-title">Turn your APIs into a visual map</h2>
      <p>Understand relationships, detect breaking changes, and explore your entire API estate — visually.</p>
      <Link to="/graph" className="hm-btn-primary">Create a workspace <ArrowRight size={14} /></Link>
    </div>
    <MapArt />
  </section>
);

export default ApiMapCta;
