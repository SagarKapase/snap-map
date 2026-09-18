import { Sparkles, ShieldCheck, Network, Upload, Braces, FileJson, Send, Terminal } from "lucide-react";

// Formats the parser reads, drawn flowing into the import hub. Decoration.
const CHIPS = [
  { label: "OpenAPI", icon: Braces, style: { left: 0, top: 12 } },
  { label: "Swagger", icon: FileJson, style: { left: 18, bottom: 10 } },
  { label: "Postman", icon: Send, style: { right: 0, top: 6 } },
  { label: "cURL", icon: Terminal, style: { right: 22, bottom: 8 } },
];

// Chip centres → hub, in the 360×130 box.
const LINES = [
  [44, 27], [62, 105], [318, 21], [306, 107],
];

const ImportArt = () => (
  <div className="imp-art" aria-hidden="true">
    <svg viewBox="0 0 360 130" preserveAspectRatio="none">
      {LINES.map(([x, y]) => <line key={`${x}${y}`} x1={x} y1={y} x2="180" y2="65" />)}
    </svg>
    {CHIPS.map(({ label, icon: Icon, style }) => (
      <span key={label} className="imp-chip" style={style}><Icon size={12} /> {label}</span>
    ))}
    <span className="imp-hub"><Upload size={20} /></span>
  </div>
);

/** The compact heading over the import editor. */
const ImportHero = () => (
  <section className="imp-hero" aria-labelledby="imp-title">
    <div className="imp-hero-copy">
      <div className="hm-eyebrow">IMPORT API</div>
      <h1 id="imp-title">Import a <span className="hm-name">specification</span></h1>
      <p>Paste it, drop a file, or fetch a URL. Vizroute detects OpenAPI, Swagger, Postman collections, cURL, HAR, JSON or YAML and builds your map automatically.</p>
      <ul className="imp-caps">
        <li className="imp-cap"><Sparkles size={13} /> Auto-detect format</li>
        <li className="imp-cap ok"><ShieldCheck size={13} /> Instant validation</li>
        <li className="imp-cap map"><Network size={13} /> Builds interactive map</li>
      </ul>
    </div>
    <ImportArt />
  </section>
);

export default ImportHero;
