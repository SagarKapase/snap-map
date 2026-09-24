import { Sparkles, ShieldCheck, Network, Upload, Braces, FileJson, Send, Terminal, MoveDownLeft } from "lucide-react";

// Formats the parser reads, drawn as tiles feeding the import hub. Decoration.
const CHIPS = [
  { label: "OpenAPI", icon: Braces, style: { left: 14, top: 26, transform: "rotate(-6deg)" } },
  { label: "cURL", icon: Terminal, style: { left: 30, top: 108, transform: "rotate(5deg)" } },
  { label: "Swagger", icon: FileJson, style: { left: 236, top: 14, transform: "rotate(5deg)" } },
  { label: "Postman", icon: Send, style: { left: 250, top: 104, transform: "rotate(-5deg)" } },
];

// Tile centres → hub, in the 360×144 drawing box.
const LINES = [
  [62, 52], [72, 134], [286, 40], [296, 130],
];

const ImportArt = () => (
  <div className="imp-art" aria-hidden="true">
    <svg viewBox="0 0 360 144">
      {LINES.map(([x, y]) => <line key={`${x}${y}`} x1={x} y1={y} x2="180" y2="72" />)}
    </svg>
    {CHIPS.map(({ label, icon: Icon, style }) => (
      <span key={label} className="imp-chip" style={style}><Icon size={13} /> {label}</span>
    ))}
    <span className="imp-hub"><Upload size={24} /></span>
    <span className="imp-note-hand">
      Turn your API specs into a visual map
      <MoveDownLeft size={22} strokeWidth={1.5} />
    </span>
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
