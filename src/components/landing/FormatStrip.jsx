import { Link2, Import, Waypoints, Zap, ShieldCheck, Terminal, Globe } from "lucide-react";
import {
  OpenApiIcon,
  SwaggerIcon,
  PostmanIcon,
  JsonIcon,
  YamlIcon,
} from "../icons/BrandIcons";
import { useReveal, useSpotlight } from "../../utils/motion";

// Formats the parser actually accepts: utils/parsers.js reads OpenAPI 2.0,
// 3.0 and 3.1 and Postman v1/v2; utils/importers.js reads cURL and HAR;
// anything else that is JSON or YAML is read as a plain endpoint list, and
// utils/readSpec.js fetches a remote URL.
const FORMATS = [
  { label: "OpenAPI 3.1", icon: OpenApiIcon },
  { label: "OpenAPI 3.0", icon: OpenApiIcon },
  { label: "Swagger 2.0", icon: SwaggerIcon },
  { label: "Postman v2", icon: PostmanIcon },
  { label: "Postman v1", icon: PostmanIcon },
  { label: "cURL", icon: Terminal },
  { label: "HAR", icon: Globe },
  { label: "JSON", icon: JsonIcon },
  { label: "YAML", icon: YamlIcon },
  { label: "Remote URL", icon: Link2 },
];

// Capabilities, not customer claims — each one is implemented in the app.
const CAPABILITIES = [
  { icon: Import, title: "Multi-format import", body: "Paste, drop, fetch or pull" },
  { icon: Waypoints, title: "Five map layouts", body: "Tree, radial, force and more" },
  { icon: Zap, title: "Real requests", body: "Playground, environments, cURL" },
  { icon: ShieldCheck, title: "Parsed in your browser", body: "No upload, no build step" },
];

const Capability = ({ capability, last, index }) => {
  const spotlight = useSpotlight();
  return (
    <li
      {...spotlight}
      className={`flex items-center justify-start gap-3 px-5 py-4 lg:justify-center ${spotlight.className || ""} ${
        !last ? "lg:border-r lg:border-vz-line" : ""
      } ${index % 2 === 0 ? "sm:border-r sm:border-vz-line lg:border-r" : ""}`}
    >
      <span className="grid h-[35px] w-[35px] flex-shrink-0 place-items-center rounded-[9px] border border-[#202a3a] bg-[#151c28] text-vz-accent-2">
        <capability.icon size={16} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-[11px] font-semibold text-vz-text">{capability.title}</span>
        <span className="block text-[10px] text-vz-dim">{capability.body}</span>
      </span>
    </li>
  );
};

const FormatStrip = () => {
  const [ref] = useReveal();
  // The track is rendered twice so the loop meets itself with no seam.
  const track = [...FORMATS, ...FORMATS];

  return (
    <section
      ref={ref}
      aria-label="Supported specification formats"
      className="reveal mx-auto max-w-[1500px] px-5 pb-10 pt-4 sm:px-8"
    >
      <div className="flex items-center gap-6">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#1d2532]" />
        <h2 className="whitespace-nowrap text-[10px] uppercase tracking-[0.2em] text-vz-dim">
          Reads what your team already has
        </h2>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#1d2532]" />
      </div>

      <div className="lp-marquee mt-7">
        <ul className="lp-marquee-track" aria-label="Formats Vizroute reads">
          {track.map((format, i) => (
            <li key={`${format.label}-${i}`} className="lp-marquee-item" aria-hidden={i >= FORMATS.length}>
              <span className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-[8px] border border-vz-line bg-vz-panel-2 text-vz-accent-2">
                <format.icon size={17} aria-hidden="true" />
              </span>
              {format.label}
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-6 grid grid-cols-1 overflow-hidden rounded-[14px] border border-[#1d2634] bg-gradient-to-b from-[#0e141e] to-[#0a1018] sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((capability, i) => (
          <Capability
            key={capability.title}
            capability={capability}
            index={i}
            last={i === CAPABILITIES.length - 1}
          />
        ))}
      </ul>
    </section>
  );
};

export default FormatStrip;
