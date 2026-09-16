import { Link } from "react-router-dom";
import { Upload, Network, FlaskConical, GitCompareArrows, ArrowRight } from "lucide-react";

/**
 * The welcome card: greeting, the four ways to start, and a quiet service
 * map on the right that says what the product does. The four links are the
 * workspace's real entry points (import screen, Contract Graph, the sample
 * document, the breaking-changes view).
 */
const ACTIONS = [
  { to: "/workspace", icon: Upload, accent: "#a855f7", title: "Import an API", text: "OpenAPI, Swagger, Postman, cURL, HAR — file, paste or URL" },
  { to: "/graph", icon: Network, accent: "#60a5fa", title: "Map an estate", text: "Many services on one map: shared entities, duplicates, dependencies" },
  { to: "/workspace?demo=openapi", icon: FlaskConical, accent: "#34d399", title: "Try a sample API", text: "A small OpenAPI document, ready to explore" },
  { to: "/workspace?view=breaking", icon: GitCompareArrows, accent: "#fbbf24", title: "Check a change", text: "Two versions in, breaking changes out" },
];

const QuickActionCard = ({ to, icon: Icon, accent, title, text }) => (
  <Link to={to} className="hm-quick-card" style={{ "--qa": accent }}>
    <span className="hm-quick-icon"><Icon size={19} /></span>
    <span style={{ minWidth: 0 }}>
      <h3>{title}</h3>
      <p>{text}</p>
    </span>
    <span className="hm-arrow"><ArrowRight size={13} /></span>
  </Link>
);

// Example services only — the drawing is decoration, not anyone's estate.
const NODES = [
  { label: "User Service", x: 28, y: 46, w: 112, tint: "#a855f7", root: true },
  { label: "Auth Service", x: 250, y: 4, w: 108, tint: "#34d399" },
  { label: "Payment Service", x: 262, y: 46, w: 128, tint: "#60a5fa" },
  { label: "Notification Service", x: 236, y: 88, w: 150, tint: "#fb923c" },
];

const EDGES = [
  "M140 62 C 190 62, 200 20, 250 20",
  "M140 62 C 190 62, 210 62, 262 62",
  "M140 62 C 190 62, 190 104, 236 104",
];

const ApiGraphPreview = () => (
  <svg className="hm-hero-art" viewBox="0 0 440 124" aria-hidden="true" focusable="false">
    {EDGES.map((d) => <path key={d} className="base" d={d} />)}
    {EDGES.map((d) => <path key={`p${d}`} className="pulse" d={d} />)}
    {NODES.map((n) => (
      <g key={n.label} transform={`translate(${n.x} ${n.y})`}>
        <rect className={`node${n.root ? " root" : ""}`} width={n.w} height="32" rx="8" />
        <circle className={n.root ? "dot" : undefined} cx="14" cy="16" r="3.5" fill={n.tint} />
        <text x="26" y="20">{n.label}</text>
      </g>
    ))}
  </svg>
);

const WelcomeHero = ({ firstName }) => (
  <section className="hm-hero" aria-labelledby="hm-welcome">
    <div className="hm-hero-copy">
      <div className="hm-eyebrow">{firstName ? "GOOD TO SEE YOU AGAIN" : "WELCOME"}</div>
      <h1 id="hm-welcome">
        {firstName ? (
          <>Welcome back, <span className="hm-name">{firstName}</span></>
        ) : (
          <>Welcome to <span className="hm-name">Vizroute</span></>
        )}
      </h1>
      <p className="hm-hero-lede">Pick up an API you were working on, open an estate, or start something new.</p>
    </div>
    <ApiGraphPreview />
    <div className="hm-quick">
      {ACTIONS.map((a) => <QuickActionCard key={a.title} {...a} />)}
    </div>
  </section>
);

export default WelcomeHero;
