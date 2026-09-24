import { Link } from "react-router-dom";
import { ArrowRight, Play, Zap, ShieldCheck } from "lucide-react";
import WorkspacePreview from "./WorkspacePreview";
import { usePointerParallax, useCountUp } from "../../utils/motion";

/**
 * Every number here is one the product can be held to: eight things the
 * parser reads, the tools in the command palette, the graph layouts, and
 * the zero that matters most — nothing is uploaded.
 */
const STATS = [
  { value: 8, suffix: "", label: "formats read", hint: "OpenAPI, Swagger, Postman, cURL, HAR, JSON, YAML, a URL" },
  { value: 21, suffix: "", label: "tools included", hint: "Playground, audit, diff, mock, docs, export…" },
  { value: 5, suffix: "", label: "map layouts", hint: "Tree, flowchart, radial, mindmap, force directed" },
  { value: 0, suffix: "", label: "files uploaded", hint: "Specifications are parsed in this browser" },
];

const Stat = ({ value, label, hint }) => {
  const [ref, shown] = useCountUp(value);
  return (
    <div ref={ref} className="min-w-0" title={hint}>
      <p className="lp-stat-value text-[26px] font-extrabold text-vz-text sm:text-[30px]">{shown}</p>
      <p className="mt-0.5 text-[11.5px] leading-[1.35] text-vz-dim">{label}</p>
    </div>
  );
};

const Hero = () => {
  const parallaxRef = usePointerParallax({ depth: 12 });

  return (
    <section className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-14 px-5 pb-10 pt-14 sm:px-8 lg:grid-cols-[0.92fr_1.28fr] lg:gap-16 lg:pt-[72px]">
      <div className="lp-enter min-w-0">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c55cff]/28 bg-vz-accent/9 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#d993ff]">
          <Zap size={12} aria-hidden="true" />
          API spec → visual graph
        </p>

        <h1 className="max-w-[620px] font-extrabold leading-[1.05] tracking-[-0.03em] text-vz-text [font-size:clamp(2.4rem,3.7vw,3.6rem)] [text-wrap:balance]">
          Understand any API in a minute,{" "}
          <span className="lp-gradient-text">not an afternoon.</span>
        </h1>

        <p className="mt-6 max-w-[560px] text-[16px] leading-[1.72] text-vz-soft">
          Drop in an OpenAPI, Swagger or Postman file — or a cURL command, a
          HAR recording, plain JSON — and read the shape of the API on a map.
          Then send a real request, audit it, diff it against the last
          version, and hand it on as docs, an image or a link.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to="/workspace"
            className="lp-cta lp-cta-primary vz-t inline-flex h-[49px] items-center justify-center gap-3 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#cb68ff] px-6 text-[14px] font-bold text-[#150a1b]"
          >
            Map your first API
            <ArrowRight size={16} className="lp-cta-arrow" aria-hidden="true" />
          </Link>

          <Link
            to="/workspace?demo=openapi"
            className="lp-cta vz-t inline-flex h-[49px] items-center justify-center gap-2.5 rounded-[10px] border border-[#30384a] bg-vz-panel/70 px-5 text-[14px] font-semibold text-[#e5e8ee] hover:border-[#454f63] hover:bg-vz-panel-2"
          >
            <Play size={14} aria-hidden="true" />
            Open a live sample
          </Link>
        </div>

        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-vz-dim">
          <ShieldCheck size={13} aria-hidden="true" className="text-vz-green" />
          No account, no upload, no install — it runs in this tab.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-6 border-t border-vz-line-soft pt-7 sm:grid-cols-4">
          {STATS.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      <div className="preview-stage min-w-0" style={{ perspective: "1600px" }}>
        <div ref={parallaxRef} className="lp-parallax preview-arrive">
          <WorkspacePreview />
        </div>
      </div>
    </section>
  );
};

export default Hero;
