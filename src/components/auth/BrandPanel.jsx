import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Network, ShieldCheck, Zap, Box, UserRound, CreditCard, Bell, Plus, Minus, Scan } from "lucide-react";
import BrandMark from "../BrandMark";

/**
 * The product side of the account pages: the brand, the pitch, and a
 * floating preview of the service map with a spec card under it. The
 * preview is decorative — its services are examples, not anyone's estate.
 */

const FEATURES = [
  { icon: Network, title: "Contract Graph", text: "Workspaces are kept per account, so an estate you map today is there tomorrow." },
  { icon: ShieldCheck, title: "Stay in your browser", text: "Specifications stay in your browser. No uploads, no hassle." },
  { icon: Zap, title: "Everything, always on", text: "Single-spec workspace keeps working without an account." },
];

// The real workspace's views, so the preview looks like the product.
const TABS = ["Map", "Table", "Audit", "Coverage"];

const NODES = [
  { name: "User Service", icon: Box, tint: "#a855f7", root: true, style: { left: 28, top: 110 } },
  { name: "Auth Service", icon: UserRound, tint: "#34d399", style: { right: 40, top: 40 } },
  { name: "Payment Service", icon: CreditCard, tint: "#60a5fa", style: { right: 18, top: 130 } },
  { name: "Notification Service", icon: Bell, tint: "#fb923c", style: { right: 88, bottom: 28 } },
];

// From the root's right edge to each dependent's left edge.
const LINES = [
  "M182 133 C 232 133, 250 63, 300 63",
  "M182 133 C 232 133, 250 153, 296 153",
  "M182 133 C 222 133, 210 249, 236 249",
];

const FeatureList = () => (
  <ul className="auth-features">
    {FEATURES.map(({ icon: Icon, title, text }) => (
      <li key={title} className="auth-feature">
        <span className="auth-feature-icon"><Icon size={22} strokeWidth={1.8} /></span>
        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </li>
    ))}
  </ul>
);

const ApiGraphPreview = () => (
  <div className="auth-graph" aria-hidden="true">
    <div className="auth-graph-float">
      <div className="auth-graph-head">
        <BrandMark size={14} /> Vizroute
        <div className="auth-graph-tabs">
          {TABS.map((t, i) => (
            <span key={t} className={`auth-graph-tab${i === 0 ? " is-active" : ""}`}>{t}</span>
          ))}
        </div>
      </div>
      <div className="auth-graph-area">
        <svg className="auth-graph-lines" viewBox="0 0 480 290" preserveAspectRatio="none">
          {LINES.map((d) => <path key={d} className="base" d={d} />)}
          {LINES.map((d) => <path key={`p${d}`} className="pulse" d={d} />)}
        </svg>
        {NODES.map(({ name, icon: Icon, tint, root, style }) => (
          <div key={name} className={`auth-node${root ? " is-root" : ""}`} style={style}>
            <span className="auth-node-icon" style={{ background: `${tint}26`, color: tint }}><Icon size={14} /></span>
            {name}
            {root && <span className="auth-status" />}
          </div>
        ))}
        <div className="auth-zoom">
          <span><Plus size={12} /></span>
          <span><Minus size={12} /></span>
          <span><Scan size={12} /></span>
        </div>
      </div>
    </div>
  </div>
);

const OpenApiPreview = () => (
  <div className="auth-code" aria-hidden="true">
    <div className="auth-code-float">
      <div className="auth-code-tabs">
        <span className="is-active">OpenAPI</span>
        <span>JSON</span>
        <span>cURL</span>
      </div>
      <pre>{"{\n  "}<span className="k">"openapi"</span>{": "}<span className="s">"3.1.0"</span>{",\n  "}<span className="k">"info"</span>{": {\n    "}<span className="k">"title"</span>{": "}<span className="s">"User Service"</span>{",\n    "}<span className="k">"version"</span>{": "}<span className="s">"1.0.0"</span>{"\n  }\n}"}</pre>
    </div>
  </div>
);

/** A few pixels of parallax on a mouse, none on touch or with reduced motion. */
const useParallax = (ref) => {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    if (still || !fine) return undefined;
    let frame = 0;
    const onMove = (e) => {
      if (window.innerWidth < 1180) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--px", `${((e.clientX / window.innerWidth) - 0.5) * 6}px`);
        el.style.setProperty("--py", `${((e.clientY / window.innerHeight) - 0.5) * 6}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
};

const BrandPanel = ({ title, lede }) => {
  const ref = useRef(null);
  useParallax(ref);
  return (
    <section ref={ref} className="auth-brand">
      <Link to="/" className="auth-brand-link">
        <BrandMark size={28} />
        Vizroute
      </Link>
      <div className="auth-copy">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-lede">{lede}</p>
        <FeatureList />
      </div>
      <ApiGraphPreview />
      <OpenApiPreview />
    </section>
  );
};

export default BrandPanel;
