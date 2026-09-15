import { Link } from "react-router-dom";
import { ArrowRight, Play, Layers, Waypoints, Zap, Search } from "lucide-react";
import WorkspacePreview from "./WorkspacePreview";

// Each of these maps to something the app actually does.
const MINI_FEATURES = [
  {
    icon: Layers,
    title: "Multiple Formats",
    body: "OpenAPI, Swagger, Postman, JSON, YAML.",
  },
  {
    icon: Waypoints,
    title: "Interactive Graph",
    body: "Five graph layouts to explore.",
  },
  {
    icon: Zap,
    title: "Built-in Playground",
    body: "Send real requests in place.",
  },
  {
    icon: Search,
    title: "Smart Search",
    body: "Jump to any endpoint with Ctrl K.",
  },
];

const Hero = () => (
  <section className="relative mx-auto grid max-w-[1500px] grid-cols-1 items-center gap-14 px-5 pb-10 pt-14 sm:px-8 lg:grid-cols-[0.86fr_1.34fr] lg:gap-16 lg:pt-[72px]">
    <div className="min-w-0">
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c55cff]/28 bg-vz-accent/9 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#d993ff]">
        <Zap size={12} aria-hidden="true" />
        API spec → visual graph
      </p>

      <h1 className="max-w-[620px] font-extrabold leading-[1.05] tracking-[-0.03em] text-vz-text [font-size:clamp(2.4rem,3.7vw,3.6rem)] [text-wrap:balance]">
        Turn any API specification into an{" "}
        <span className="bg-gradient-to-r from-[#b06bff] to-[#e0a8ff] bg-clip-text text-transparent">
          interactive map.
        </span>
      </h1>

      <p className="mt-6 max-w-[560px] text-[16px] leading-[1.72] text-vz-soft">
        Paste, upload, or fetch an OpenAPI, Swagger, Postman, JSON or YAML
        specification. Explore endpoints, relationships and dependencies
        visually — without digging through hundreds of lines of API
        documentation.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          to="/workspace"
          className="vz-t inline-flex h-[49px] items-center justify-center gap-3 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#cb68ff] px-6 text-[14px] font-bold text-[#150a1b] shadow-[0_10px_30px_rgba(168,85,247,0.14)] hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(168,85,247,0.2)]"
        >
          Start Mapping Now
          <ArrowRight size={16} aria-hidden="true" />
        </Link>

        <Link
          to="/workspace?demo=openapi"
          className="vz-t inline-flex h-[49px] items-center justify-center gap-2.5 rounded-[10px] border border-[#30384a] bg-vz-panel/70 px-5 text-[14px] font-semibold text-[#e5e8ee] hover:border-[#454f63] hover:bg-vz-panel-2"
        >
          <Play size={14} aria-hidden="true" />
          View Demo
        </Link>
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-4">
        {MINI_FEATURES.map((feature) => (
          <li key={feature.title} className="min-w-0">
            <span className="mb-2.5 grid h-[42px] w-[42px] place-items-center rounded-[11px] border border-[#202939] bg-gradient-to-b from-vz-elev to-[#101621] text-vz-accent-2">
              <feature.icon size={17} aria-hidden="true" />
            </span>
            <h2 className="mb-1 flex min-h-[32px] items-start text-[12px] font-semibold leading-[1.35] text-vz-text">
              {feature.title}
            </h2>
            <p className="text-[11px] leading-[1.5] text-vz-dim">
              {feature.body}
            </p>
          </li>
        ))}
      </ul>
    </div>

    <div className="preview-stage min-w-0">
      <div className="preview-arrive">
        <WorkspacePreview />
      </div>
    </div>
  </section>
);

export default Hero;
