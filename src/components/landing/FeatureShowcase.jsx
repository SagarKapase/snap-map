import {
  Waypoints,
  Zap,
  GitCompareArrows,
  Network,
  FolderOpen,
  Download,
  ArrowRight,
  Lock,
  CreditCard,
  FileText,
  Users,
} from "lucide-react";
import { PreviewNode } from "./WorkspacePreview";

const SPEC_SAMPLE = `openapi: 3.1.0
info:
  title: Example API
  version: "2024-06-20"
paths:
  /v1/customers:
    get:
      tags: [Customers]
      summary: List all customers
      security:
        - bearerAuth: []
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Customer"
    post:
      tags: [Customers]
      summary: Create a customer
  /v1/customers/{id}:
    get:
      tags: [Customers]
      summary: Retrieve a customer
    delete:
      tags: [Customers]
      summary: Delete a customer
  /v1/payments:
    get:
      tags: [Payments]`;

// The three strongest differentiators get the large treatment.
const PRIMARY = [
  {
    icon: Waypoints,
    title: "Interactive API maps",
    body: "Five layouts — tree, flowchart, radial, mindmap and force directed. Drag nodes, collapse groups, and fit or focus the graph as you explore.",
  },
  {
    icon: Zap,
    title: "Inspector and playground",
    body: "Read the auth, parameters and response schema the spec declares, then fire a real request and copy it as cURL — in the same panel.",
  },
  {
    icon: GitCompareArrows,
    title: "Diff and breaking changes",
    body: "Compare two versions of a specification and surface the changes that will break consumers before you ship them.",
  },
];

const SECONDARY = [
  {
    icon: Network,
    title: "Multi-service maps",
    body: "Chart how several specifications depend on one another.",
  },
  {
    icon: FolderOpen,
    title: "Collections and sharing",
    body: "Save specs in your browser, or share a map through a compressed link.",
  },
  {
    icon: Download,
    title: "Export and docs",
    body: "Export the map as PNG or SVG, the source as JSON, or generate documentation.",
  },
];

// Laid out as a diamond so the cards clear each other in a narrow panel.
const GLANCE_NODES = [
  { label: "Customers", count: 12, icon: Users, selected: true, x: 50, y: 26 },
  { label: "Authentication", count: 3, icon: Lock, x: 24, y: 58 },
  { label: "Payments", count: 18, icon: CreditCard, x: 76, y: 58 },
  { label: "Invoices", count: 14, icon: FileText, x: 50, y: 86 },
];

const FeatureShowcase = () => (
  <section
    id="features"
    className="approach-scene mx-auto max-w-[1500px] scroll-mt-24 px-5 py-16 sm:px-8 lg:py-24"
  >
    {/* ── Spec → map ─────────────────────────────── */}
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {/* min-w-0 on both columns keeps the code panel from widening the page */}
      <div className="min-w-0">
        <h2 className="max-w-[520px] text-[clamp(1.9rem,2.6vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-0.028em] text-vz-text">
          Understand an API at a glance.
        </h2>
        <p className="mt-5 max-w-[520px] text-[15px] leading-[1.72] text-vz-soft">
          A specification is a list. An API is a structure. Vizroute reads the
          tags, paths and operations you already wrote and draws the services,
          resources and relationships they describe — so an unfamiliar API takes
          a minute to grasp instead of an afternoon.
        </p>

        <ul className="mt-7 space-y-3">
          {[
            "Endpoints grouped by the tags and folders in your spec",
            "Auth, parameters and response schemas read straight from the source",
            "Search, filter by method, and jump to any endpoint from the map",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[14px] text-vz-soft">
              <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vz-accent" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="approach grid min-w-0 grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel">
          <div className="flex items-center gap-2 border-b border-vz-line-soft px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-vz-dim">
              openapi.yaml
            </span>
          </div>
          <pre className="vz-mono h-[248px] overflow-hidden px-3 py-2.5 text-[9.5px] leading-[1.65] text-vz-dim">
            {SPEC_SAMPLE}
          </pre>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-vz-panel to-transparent"
          />
        </div>

        <div className="hidden items-center justify-center sm:flex">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-vz-line bg-vz-panel-2 text-vz-accent-2">
            <ArrowRight size={15} aria-hidden="true" />
          </span>
        </div>

        <div
          className="relative min-w-0 overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(115,125,150,0.14) 0.9px, transparent 0.9px)",
            backgroundSize: "17px 17px",
          }}
        >
          <div className="flex items-center gap-2 border-b border-vz-line-soft bg-vz-panel px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-vz-dim">
              API map
            </span>
          </div>
          <div className="relative h-[248px]">
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {GLANCE_NODES.slice(1).map((node) => (
                <line
                  key={node.label}
                  x1="50%"
                  y1="26%"
                  x2={`${node.x}%`}
                  y2={`${node.y}%`}
                  stroke="rgba(122,136,163,0.32)"
                  strokeWidth="1"
                />
              ))}
            </svg>
            {GLANCE_NODES.map((node) => (
              <PreviewNode
                key={node.label}
                label={node.label}
                count={node.count}
                icon={node.icon}
                selected={node.selected}
                className="absolute"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* ── Feature grid ───────────────────────────── */}
    <div className="approach lift-scene mt-20 grid grid-cols-1 gap-4 md:grid-cols-3">
      {PRIMARY.map((feature) => (
        <article
          key={feature.title}
          className="lift-card h-full overflow-hidden rounded-[14px] border border-vz-line bg-gradient-to-b from-vz-panel to-[#0a0f18] p-6"
        >
          <span className="mb-5 grid h-[42px] w-[42px] place-items-center rounded-[11px] border border-vz-accent/25 bg-vz-accent/10 text-vz-accent-2">
            <feature.icon size={18} aria-hidden="true" />
          </span>
          <h3 className="mb-2.5 text-[16px] font-semibold text-vz-text">
            {feature.title}
          </h3>
          <p className="text-[13.5px] leading-[1.65] text-vz-soft">
            {feature.body}
          </p>
        </article>
      ))}
    </div>

    <div className="approach lift-scene mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      {SECONDARY.map((feature) => (
        <article
          key={feature.title}
          className="lift-card flex items-start gap-3.5 overflow-hidden rounded-[12px] border border-vz-line-soft bg-vz-panel/50 p-4"
        >
          <span className="mt-0.5 grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-[9px] border border-vz-line bg-vz-panel-2 text-vz-soft">
            <feature.icon size={14} aria-hidden="true" />
          </span>
          <span>
            <h3 className="mb-1 text-[13.5px] font-semibold text-vz-text">
              {feature.title}
            </h3>
            <p className="text-[12.5px] leading-[1.6] text-vz-dim">
              {feature.body}
            </p>
          </span>
        </article>
      ))}
    </div>
  </section>
);

export default FeatureShowcase;
