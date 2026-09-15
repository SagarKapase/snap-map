import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Upload, Sparkles, Network, Waypoints, Clock, Plus, ArrowRight, Terminal, ShieldAlert, GitCompareArrows,
  Globe, Activity, Gauge, Server, BookOpen, ClipboardCheck, Target, ArrowRightLeft, WandSparkles, Send,
} from "lucide-react";
import ProductSwitcher from "../components/shell/ProductSwitcher";
import AccountMenu from "../components/shell/AccountMenu";
import { useAuth } from "../components/auth/useAuth";
import { getRecents } from "../utils/recents";
import { listWorkspaces } from "../utils/contractWorkspace";
import { timeAgo } from "../utils/analysis";

/**
 * Everything the product can do, grouped by where it lives. Tools that need
 * an API loaded link into the API Map with a hint; the two that work on
 * their own deep-link straight to their view.
 */
const TOOLS = [
  { label: "Playground", hint: "Send real requests with variables, auth and every body type", icon: Terminal, to: "/workspace", needsSpec: true },
  { label: "Breaking changes", hint: "Compare two versions and see what breaks", icon: ShieldAlert, to: "/workspace?view=breaking" },
  { label: "API diff", hint: "Added, removed and changed endpoints between two documents", icon: GitCompareArrows, to: "/workspace?view=diff" },
  { label: "Audit", hint: "Documentation and consistency issues with fixes", icon: ClipboardCheck, to: "/workspace", needsSpec: true },
  { label: "Coverage", hint: "Which endpoints a collection exercises", icon: Target, to: "/workspace", needsSpec: true },
  { label: "Environments", hint: "Variable sets for every request", icon: Globe, to: "/workspace", needsSpec: true },
  { label: "Health monitor", hint: "Poll endpoints and watch status over time", icon: Activity, to: "/workspace", needsSpec: true },
  { label: "Load tester", hint: "Concurrency and latency from the browser", icon: Gauge, to: "/workspace", needsSpec: true },
  { label: "Mock server", hint: "Responses generated from the schema", icon: Server, to: "/workspace", needsSpec: true },
  { label: "Documentation", hint: "Generated reference docs", icon: BookOpen, to: "/workspace", needsSpec: true },
  { label: "Convert & export", hint: "OpenAPI, Swagger, Postman, .http", icon: ArrowRightLeft, to: "/workspace", needsSpec: true },
  { label: "Postman companion", hint: "Pull and push collections", icon: Send, to: "/workspace", needsSpec: true, needsAccount: true },
  { label: "Ask the map", hint: "AI assistant over the loaded specification", icon: WandSparkles, to: "/workspace", needsSpec: true },
];

const Section = ({ title, action, children }) => (
  <section>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Card = ({ to, icon: Icon, title, hint, meta, accent = false }) => (
  <Link
    to={to}
    className={`vz-t group flex items-start gap-3 rounded-xl border p-4 ${accent ? "border-vz-accent/30 bg-vz-accent/[0.08] hover:bg-vz-accent/[0.14]" : "border-vz-line bg-vz-panel hover:border-vz-accent/40"}`}
  >
    <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${accent ? "bg-vz-accent/20 text-[#e6c4ff]" : "bg-white/6 text-vz-soft group-hover:text-vz-text"}`}>
      <Icon size={16} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13.5px] font-semibold text-vz-text">{title}</span>
      {hint && <span className="mt-0.5 block text-[12px] leading-snug text-vz-dim">{hint}</span>}
      {meta && <span className="mt-1 block text-[11px] text-vz-dim">{meta}</span>}
    </span>
    <ArrowRight size={14} className="mt-1 flex-shrink-0 text-vz-dim opacity-0 transition-opacity group-hover:opacity-100" />
  </Link>
);

const HomePage = () => {
  const { user } = useAuth();
  // Both lists are read from storage; the account decides which bucket.
  const recents = useMemo(() => getRecents(), []);
  const workspaces = useMemo(() => listWorkspaces(user?.id || null), [user]);

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <div className="min-h-screen bg-vz-bg text-vz-text">
      <header className="flex h-[60px] items-center justify-between gap-4 border-b border-vz-line-soft px-4 sm:px-6">
        <ProductSwitcher />
        <AccountMenu />
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-[26px] font-extrabold tracking-tight" style={{ textWrap: "balance" }}>
            {firstName ? `Welcome back, ${firstName}` : "Welcome to Vizroute"}
          </h1>
          <p className="mt-1 text-[14px] text-vz-soft">Pick up an API you were working on, open an estate, or start something new.</p>
        </div>

        <div className="space-y-10">
          <Section title="Start">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card to="/workspace" icon={Upload} title="Import an API" hint="OpenAPI, Swagger, Postman, cURL, HAR, WSDL — file, paste or URL" accent />
              <Card to="/graph" icon={Network} title="Map an estate" hint="Many services on one map: shared entities, duplicates, dependencies" accent />
              <Card to="/workspace?demo=openapi" icon={Sparkles} title="Try a sample API" hint="A small OpenAPI document, ready to explore" />
              <Card to="/workspace?view=breaking" icon={ShieldAlert} title="Check a change" hint="Two versions in, breaking changes out" />
            </div>
          </Section>

          <div className="grid gap-10 lg:grid-cols-2">
            <Section
              title="Recent APIs"
              action={<Link to="/workspace" className="vz-t flex items-center gap-1 text-[12px] text-vz-soft hover:text-vz-text"><Waypoints size={12} /> Open API Map</Link>}
            >
              {recents.length === 0 ? (
                <p className="rounded-xl border border-dashed border-vz-line px-4 py-6 text-center text-[12.5px] text-vz-dim">
                  APIs you import appear here. They stay in this browser.
                </p>
              ) : (
                <ul className="divide-y divide-vz-line-soft rounded-xl border border-vz-line bg-vz-panel">
                  {recents.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link to={`/workspace?recent=${encodeURIComponent(r.id)}`} className="vz-t flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/6 text-vz-soft"><Clock size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-vz-text">{r.name}</span>
                          <span className="block text-[11.5px] text-vz-dim">{r.format} · {r.endpoints} endpoints</span>
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-vz-dim">{timeAgo(r.openedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Contract Graph workspaces"
              action={<Link to="/graph" className="vz-t flex items-center gap-1 text-[12px] text-vz-soft hover:text-vz-text"><Plus size={12} /> New workspace</Link>}
            >
              {workspaces.length === 0 ? (
                <p className="rounded-xl border border-dashed border-vz-line px-4 py-6 text-center text-[12.5px] text-vz-dim">
                  No estates mapped yet{user ? "" : " in this browser"}. <Link to="/graph" className="text-vz-accent-2 hover:underline">Add your first services</Link>.
                </p>
              ) : (
                <ul className="divide-y divide-vz-line-soft rounded-xl border border-vz-line bg-vz-panel">
                  {workspaces.slice(0, 6).map((w) => (
                    <li key={w.id}>
                      <Link to={`/graph?ws=${encodeURIComponent(w.id)}`} className="vz-t flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/6 text-vz-soft"><Network size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-vz-text">{w.name}</span>
                          <span className="block text-[11.5px] text-vz-dim">{w.services.length} service{w.services.length === 1 ? "" : "s"}</span>
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-vz-dim">{timeAgo(w.updatedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Tools in the API Map">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((t) => (
                <Card key={t.label} to={t.to} icon={t.icon} title={t.label} hint={t.hint} meta={t.needsAccount && !user ? "Needs an account — sign in first" : t.needsSpec ? "Opens the API Map — import an API first" : "Works on its own"} />
              ))}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
};

export default HomePage;
