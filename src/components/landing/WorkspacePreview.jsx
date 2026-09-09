import {
  Search,
  ChevronRight,
  ChevronDown,
  Lock,
  Play,
  Copy,
  CreditCard,
  ShoppingCart,
  FileText,
  RefreshCw,
  Box,
  Webhook,
  Users,
} from "lucide-react";
import BrandMark from "../BrandMark";
import MethodBadge from "../workspace/MethodBadge";
import JsonView from "../workspace/JsonView";

/**
 * A static, non-interactive rendering of the Vizroute workspace.
 *
 * It deliberately does not mount the real workspace: that would run the layout
 * maths, keyboard listeners and localStorage reads for a decorative panel. It
 * uses the same design tokens and the real MethodBadge / JsonView components so
 * it stays in step with the product.
 */

// Node centres are percentages of the canvas so the graph reflows with it.
const NODES = [
  { id: "customers", label: "Customers", count: 12, icon: Users, x: 50, y: 47, selected: true },
  { id: "authentication", label: "Authentication", count: 3, icon: Lock, x: 50, y: 13 },
  { id: "payments", label: "Payments", count: 18, icon: CreditCard, x: 19, y: 29 },
  { id: "invoices", label: "Invoices", count: 14, icon: FileText, x: 50, y: 82 },
  { id: "orders", label: "Orders", count: 9, icon: ShoppingCart, x: 81, y: 29, minor: true },
  { id: "webhooks", label: "Webhooks", count: 7, icon: Webhook, x: 81, y: 63, minor: true },
  { id: "products", label: "Products", count: 11, icon: Box, x: 19, y: 76, minor: true },
  { id: "subscriptions", label: "Subscriptions", count: 16, icon: RefreshCw, x: 81, y: 82, minor: true },
];

const CENTRE = NODES[0];

const GROUPS = [
  { name: "Authentication", count: 3 },
  { name: "Customers", count: 12, open: true },
  { name: "Payments", count: 18 },
  { name: "Invoices", count: 14 },
  { name: "Subscriptions", count: 16 },
  { name: "Products", count: 11 },
  { name: "Orders", count: 9 },
  { name: "Webhooks", count: 7 },
];

const ENDPOINTS = [
  { method: "GET", path: "/v1/customers", active: true },
  { method: "POST", path: "/v1/customers" },
  { method: "GET", path: "/v1/customers/{id}" },
  { method: "DELETE", path: "/v1/customers/{id}" },
];

const RESPONSE = {
  object: "list",
  data: [
    {
      id: "cus_123",
      object: "customer",
      email: "user@example.com",
      name: "Jane Doe",
    },
  ],
  has_more: true,
};

/** Compact graph node, reused by the feature showcase. */
export const PreviewNode = ({ label, count, icon, selected, className = "", style }) => {
  const Icon = icon;
  return (
  <div
    className={`flex w-[104px] items-center gap-1.5 rounded-lg border px-2 py-[7px] sm:w-[112px] sm:gap-2 sm:px-2.5 sm:py-2 xl:w-[126px] ${
      selected
        ? "border-vz-accent/80 bg-[#1c1231] shadow-[0_0_22px_rgba(168,85,247,0.16)]"
        : "border-[#2a3345] bg-gradient-to-b from-vz-elev to-vz-panel-2"
    } ${className}`}
    style={style}
  >
    <span
      className={`grid h-[20px] w-[20px] flex-shrink-0 place-items-center rounded-[6px] xl:h-[24px] xl:w-[24px] ${
        selected ? "bg-vz-accent/20 text-vz-accent-2" : "bg-vz-blue/10 text-vz-blue"
      }`}
    >
      <Icon size={11} />
    </span>
    <span className="min-w-0">
      <span className="block truncate text-[9px] font-semibold text-vz-text xl:text-[10px]">
        {label}
      </span>
      <span className="block text-[8px] text-vz-dim xl:text-[9px]">
        {count} endpoints
      </span>
    </span>
  </div>
  );
};

const Chip = ({ children, active }) => (
  <span
    className={`whitespace-nowrap rounded-[5px] px-2 py-1 text-[8px] sm:text-[9px] ${
      active
        ? "bg-vz-accent/12 text-[#c786ef]"
        : "border border-vz-line bg-vz-panel-2 text-vz-dim"
    }`}
  >
    {children}
  </span>
);

const WorkspacePreview = () => (
  <figure className="relative m-0">
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[16px] border border-vz-accent/25 bg-gradient-to-b from-[#101420] to-[#090d14] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),0_0_70px_-40px_rgba(168,85,247,0.4)]"
    >
      {/* ── App top bar ───────────────────────────── */}
      <div className="flex h-[46px] items-center justify-between gap-3 border-b border-vz-line-soft px-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-bold text-vz-text">
            <BrandMark size={16} />
            Vizroute
          </span>
          <nav className="hidden items-center gap-3.5 text-[9px] text-vz-dim md:flex">
            <span className="border-b border-vz-accent-2 pb-1 text-[#d798ff]">
              Workspace
            </span>
            <span>Collections</span>
            <span>History</span>
            <span>Docs</span>
          </nav>
        </div>

        <div className="flex h-[26px] w-[150px] flex-shrink-0 items-center gap-1.5 rounded-[6px] border border-vz-line bg-vz-panel-2 px-2 text-[9px] text-vz-dim lg:w-[210px]">
          <Search size={10} />
          <span className="truncate">Search or run a command</span>
          <span className="ml-auto hidden rounded border border-vz-line bg-vz-elev px-1 py-px text-[8px] lg:inline">
            Ctrl K
          </span>
        </div>
      </div>

      {/* ── Three-column workspace ─────────────────── */}
      <div className="grid h-[368px] grid-cols-1 sm:h-[404px] sm:grid-cols-[152px_1fr] lg:grid-cols-[152px_1fr_178px] 2xl:grid-cols-[172px_1fr_196px]">
        {/* Explorer */}
        <aside className="hidden flex-col border-r border-vz-line-soft bg-[#0b1018] p-2.5 sm:flex">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-[11px] font-bold text-white">
              E
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[9px] font-semibold text-vz-text">
                Example API
              </span>
              <span className="block text-[8px] text-vz-dim">
                OpenAPI 3.1 · 90 endpoints
              </span>
            </span>
          </div>

          <div className="mb-2.5 flex h-[26px] items-center gap-1.5 rounded-[6px] border border-vz-line bg-vz-bg px-2 text-[8px] text-vz-dim">
            <Search size={9} />
            Search endpoints...
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-[#0b1018] to-transparent"
            />
            {GROUPS.map((group) => (
              <div key={group.name}>
                <div className="flex items-center gap-1.5 px-1 py-[6px] text-[9px] text-[#d5dae4]">
                  {group.open ? (
                    <ChevronDown size={9} className="text-vz-dim" />
                  ) : (
                    <ChevronRight size={9} className="text-vz-dim" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <span className="text-[8px] tabular-nums text-vz-dim">
                    {group.count}
                  </span>
                </div>

                {group.open &&
                  ENDPOINTS.map((endpoint) => (
                    <div
                      key={`${endpoint.method}-${endpoint.path}`}
                      className={`ml-2 flex items-center gap-1.5 rounded-[5px] px-1.5 py-[5px] text-[8px] ${
                        endpoint.active
                          ? "bg-vz-accent/18 text-vz-text shadow-[inset_2px_0_0_#b45cff]"
                          : "text-vz-soft"
                      }`}
                    >
                      <MethodBadge method={endpoint.method} size="xs" />
                      <span className="vz-mono truncate">{endpoint.path}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Graph */}
        <section className="relative min-w-0">
          <div className="flex h-[38px] items-center gap-1.5 border-b border-vz-line-soft px-2.5">
            <Chip active>API Map</Chip>
            <Chip>Force Directed</Chip>
            <span className="hidden xl:inline">
              <Chip>Fit</Chip>
            </span>
            <span className="hidden 2xl:inline">
              <Chip>100%</Chip>
            </span>
            <div className="ml-auto hidden items-center gap-2 text-[8px] text-vz-soft lg:flex">
              {[
                ["GET", "#34d399"],
                ["POST", "#60a5fa"],
                ["PUT", "#fb923c"],
                ["DELETE", "#f43f5e"],
              ].map(([label, colour]) => (
                <span key={label} className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: colour }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 top-[38px]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(115,125,150,0.16) 0.9px, transparent 0.9px)",
              backgroundSize: "17px 17px",
            }}
          >
            <svg
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
            >
              {NODES.filter((node) => !node.selected).map((node) => (
                <line
                  key={node.id}
                  x1={`${CENTRE.x}%`}
                  y1={`${CENTRE.y}%`}
                  x2={`${node.x}%`}
                  y2={`${node.y}%`}
                  stroke="rgba(122,136,163,0.32)"
                  strokeWidth="1"
                  className={node.minor ? "hidden sm:block" : ""}
                />
              ))}
            </svg>

            {NODES.map((node) => (
              <PreviewNode
                key={node.id}
                label={node.label}
                count={node.count}
                icon={node.icon}
                selected={node.selected}
                className={`absolute ${node.minor ? "hidden sm:flex" : ""}`}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
          </div>
        </section>

        {/* Inspector */}
        <aside className="hidden flex-col border-l border-vz-line-soft bg-[#0b1018] lg:flex">
          <div className="flex h-[38px] items-end gap-3 border-b border-vz-line-soft px-2.5">
            {["Endpoint", "Schema", "Examples"].map((tab, i) => (
              <span
                key={tab}
                className={`flex h-full items-center text-[8px] ${
                  i === 0
                    ? "border-b border-vz-accent-2 text-[#e0afff]"
                    : "text-vz-dim"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <MethodBadge method="GET" size="xs" />
              <span className="vz-mono text-[9px] font-semibold text-vz-text">
                /v1/customers
              </span>
              <Copy size={9} className="ml-auto text-vz-dim" />
            </div>

            <p className="mb-2.5 text-[8px] leading-relaxed text-vz-soft">
              List all customers.
            </p>

            <div className="mb-2 rounded-[7px] border border-vz-line bg-vz-panel-2 p-2">
              <span className="mb-1.5 block text-[8px] font-semibold text-vz-text">
                Authentication
              </span>
              <span className="flex items-center gap-1 text-[8px] text-[#c692ec]">
                <Lock size={8} /> Bearer token required
              </span>
            </div>

            <div className="mb-2.5 rounded-[7px] border border-vz-line bg-vz-panel-2 p-2">
              <span className="mb-1.5 block text-[8px] font-semibold text-vz-text">
                Parameters
              </span>
              <span className="text-[8px] text-vz-dim">No parameters</span>
            </div>

            <div className="mb-2.5 flex h-[26px] items-center justify-center gap-1 rounded-[6px] bg-gradient-to-r from-[#a855f7] to-[#c760ff] text-[8px] font-bold text-[#16091c]">
              <Play size={8} /> Try Request
            </div>

            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[8px] font-semibold text-vz-text">
                Response
              </span>
              <span className="rounded bg-vz-green/14 px-1 py-px text-[7px] font-bold text-vz-green">
                200
              </span>
            </div>

            <div className="h-[104px] overflow-hidden rounded-[7px] border border-vz-line bg-vz-bg p-2">
              <JsonView value={RESPONSE} className="text-[7px] leading-[1.5]" />
            </div>
          </div>
        </aside>
      </div>
    </div>

    <figcaption className="sr-only">
      A preview of the Vizroute workspace: an API explorer listing endpoint
      groups on the left, an interactive API map in the centre, and an endpoint
      inspector showing authentication, parameters and a sample response on the
      right.
    </figcaption>
  </figure>
);

export default WorkspacePreview;
