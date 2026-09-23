import { Link } from "react-router-dom";
import { Waypoints, Network, ArrowRight, Check, Lock } from "lucide-react";
import { useReveal } from "../../utils/motion";

/**
 * The two products, and the honest difference between them: the API Map
 * opens one specification and needs no account; Contract Graph keeps a
 * whole estate, so it needs somewhere to keep it.
 *
 * Every line names something the app does today — the Contract Graph tabs
 * are Map, Entities, Duplicates, Concepts and Findings.
 */
const PRODUCTS = [
  {
    id: "map",
    icon: Waypoints,
    eyebrow: "One specification",
    title: "API Map",
    body: "Open a file and work on it: read it, send requests against it, check it, and pass it on.",
    points: [
      "Map, table, raw spec and an endpoint inspector",
      "Playground, environments, mock data, load and health checks",
      "Audit, coverage, diff and breaking changes",
      "Export, docs, share links and embeds",
    ],
    cta: { label: "Open the workspace", to: "/workspace" },
    note: "No account. Specs are parsed and kept in this browser.",
    accent: false,
  },
  {
    id: "graph",
    icon: Network,
    eyebrow: "Many services",
    title: "Contract Graph",
    body: "Put every contract your teams have on one map, and see what only shows up between them.",
    points: [
      "Entities more than one service exposes — and where their shapes disagree",
      "Duplicate and near-duplicate endpoints across services",
      "One concept under several names, with the evidence for each match",
      "Which services depend on which, and what a change would reach",
    ],
    cta: { label: "Map an estate", to: "/graph" },
    note: "Needs an account — an estate has to belong to someone. WSDL is read too, so SOAP services sit on the same map.",
    accent: true,
    locked: true,
  },
];

const Products = () => {
  const [ref] = useReveal();
  const [cardsRef] = useReveal({ threshold: 0.12 });
  return (
  <section
    ref={ref}
    id="products"
    aria-labelledby="products-heading"
    className="reveal mx-auto max-w-[1500px] scroll-mt-24 px-5 py-16 sm:px-8 lg:py-20"
  >
    <h2
      id="products-heading"
      className="max-w-[620px] text-[clamp(1.9rem,2.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.028em] text-vz-text"
    >
      One API, or all of them.
    </h2>
    <p className="mt-4 max-w-[620px] text-[15px] leading-[1.72] text-vz-soft">
      Start with the specification in front of you. When the question becomes
      how twelve services fit together, the same parser draws that too.
    </p>

    <div ref={cardsRef} className="reveal-stagger lift-scene mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {PRODUCTS.map((product) => (
        <article
          key={product.id}
          className={`lift-card flex h-full flex-col overflow-hidden rounded-[16px] border p-7 ${
            product.accent
              ? "border-vz-accent/25 bg-gradient-to-b from-[#150e22] to-[#0a0e16]"
              : "border-vz-line bg-gradient-to-b from-vz-panel to-[#0a0f18]"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <span
              className={`grid h-[44px] w-[44px] flex-shrink-0 place-items-center rounded-[12px] border ${
                product.accent
                  ? "border-vz-accent/30 bg-vz-accent/12 text-vz-accent-2"
                  : "border-vz-line bg-vz-panel-2 text-vz-accent-2"
              }`}
            >
              <product.icon size={19} aria-hidden="true" />
            </span>
            {product.locked && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-vz-line bg-vz-panel-2 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-vz-soft">
                <Lock size={11} aria-hidden="true" />
                Account
              </span>
            )}
          </div>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-vz-dim">
            {product.eyebrow}
          </p>
          <h3 className="mt-1.5 text-[21px] font-bold tracking-[-0.02em] text-vz-text">
            {product.title}
          </h3>
          <p className="mt-3 text-[14px] leading-[1.68] text-vz-soft">
            {product.body}
          </p>

          <ul className="mt-6 space-y-2.5">
            {product.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[13.5px] leading-[1.55] text-vz-soft">
                <Check size={15} className="mt-0.5 flex-shrink-0 text-vz-green" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-7">
            <Link
              to={product.cta.to}
              className={`vz-t inline-flex h-[44px] items-center justify-center gap-2.5 rounded-[10px] px-5 text-[13.5px] font-bold ${
                product.accent
                  ? "bg-gradient-to-r from-[#a855f7] to-[#cb68ff] text-[#150a1b] hover:-translate-y-0.5"
                  : "border border-[#30384a] bg-vz-panel/70 text-[#e5e8ee] hover:border-[#454f63] hover:bg-vz-panel-2"
              }`}
            >
              {product.cta.label}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <p className="mt-3.5 text-[12px] leading-[1.55] text-vz-dim">{product.note}</p>
          </div>
        </article>
      ))}
    </div>
  </section>
  );
};

export default Products;
