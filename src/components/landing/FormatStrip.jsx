import { Link2, Import, Waypoints, Zap, ShieldCheck } from "lucide-react";
import {
  OpenApiIcon,
  SwaggerIcon,
  PostmanIcon,
  JsonIcon,
  YamlIcon,
} from "../icons/BrandIcons";

// Formats the parser actually accepts (see utils/parsers.js), each with its
// own mark so no two entries look alike.
const FORMATS = [
  { label: "OpenAPI", icon: OpenApiIcon },
  { label: "Swagger", icon: SwaggerIcon },
  { label: "Postman", icon: PostmanIcon },
  { label: "JSON", icon: JsonIcon },
  { label: "YAML", icon: YamlIcon },
  { label: "Remote Specs", icon: Link2 },
];

// Capabilities, not customer claims — each one is implemented in the app.
const CAPABILITIES = [
  {
    icon: Import,
    title: "Multi-format Import",
    body: "OpenAPI · Swagger · Postman",
  },
  {
    icon: Waypoints,
    title: "Visual Graph",
    body: "Explore API relationships",
  },
  {
    icon: Zap,
    title: "API Playground",
    body: "Run requests directly",
  },
  {
    icon: ShieldCheck,
    title: "Local Processing",
    body: "Specs stay in your browser",
  },
];

const FormatStrip = () => (
  <section
    aria-label="Supported specification formats"
    className="mx-auto max-w-[1500px] px-5 pb-10 pt-4 sm:px-8"
  >
    <div className="flex items-center gap-6">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#1d2532]" />
      <h2 className="whitespace-nowrap text-[10px] uppercase tracking-[0.2em] text-vz-dim">
        Built for modern API workflows
      </h2>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#1d2532]" />
    </div>

    <ul className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
      {FORMATS.map((format) => (
        <li
          key={format.label}
          className="flex h-14 items-center justify-center gap-2.5 text-[13px] font-semibold text-vz-soft"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-vz-line bg-vz-panel-2 text-vz-accent-2">
            <format.icon size={17} aria-hidden="true" />
          </span>
          {format.label}
        </li>
      ))}
    </ul>

    <ul className="mt-6 grid grid-cols-1 overflow-hidden rounded-[14px] border border-[#1d2634] bg-gradient-to-b from-[#0e141e] to-[#0a1018] sm:grid-cols-2 lg:grid-cols-4">
      {CAPABILITIES.map((capability, i) => (
        <li
          key={capability.title}
          className={`flex items-center justify-start gap-3 px-5 py-4 lg:justify-center ${
            i < CAPABILITIES.length - 1 ? "lg:border-r lg:border-vz-line" : ""
          } ${i % 2 === 0 ? "sm:border-r sm:border-vz-line lg:border-r" : ""}`}
        >
          <span className="grid h-[35px] w-[35px] flex-shrink-0 place-items-center rounded-[9px] border border-[#202a3a] bg-[#151c28] text-vz-accent-2">
            <capability.icon size={16} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[11px] font-semibold text-vz-text">
              {capability.title}
            </span>
            <span className="block text-[10px] text-vz-dim">
              {capability.body}
            </span>
          </span>
        </li>
      ))}
    </ul>
  </section>
);

export default FormatStrip;
