import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Upload, Globe, Download, FileJson, Waypoints, Boxes, CopyMinus, Tags, ListChecks,
  AlertCircle, ChevronDown, LogIn, LogOut, Sparkles, X, Share2, Check,
} from "lucide-react";
import BrandMark from "../components/BrandMark";
import { useAuth } from "../components/auth/useAuth";
import ServiceMap from "../components/contractgraph/ServiceMap";
import { EntitiesView, DuplicatesView, ConceptsView, FindingsView, ServiceInspector } from "../components/contractgraph/Views";
import { buildContractGraph, impactOf, toMermaid, normalizeService } from "../utils/contractGraph";
import { parseSpecText } from "../utils/readSpec";
import { formatLabel } from "../utils/parsers";
import {
  listWorkspaces, createWorkspace, deleteWorkspace, renameWorkspace, addService, removeService,
  loadServices, exportWorkspace, importWorkspace, MAX_SERVICES,
} from "../utils/contractWorkspace";
import { SAMPLE_ESTATE } from "../utils/contractSamples";

const TABS = [
  { id: "map", label: "Map", icon: Waypoints },
  { id: "entities", label: "Entities", icon: Boxes, count: (g) => g.entities.length, alert: (g) => g.stats.inconsistentEntities > 0 },
  { id: "duplicates", label: "Duplicates", icon: CopyMinus, count: (g) => g.duplicateEndpoints.length, alert: (g) => g.duplicateEndpoints.some((d) => d.kind === "duplicate") },
  { id: "concepts", label: "Concepts", icon: Tags, count: (g) => g.concepts.filter((c) => c.divergentNames).length },
  { id: "findings", label: "Findings", icon: ListChecks, count: (g) => g.findings.length, alert: (g) => g.findings.some((f) => f.severity === "high") },
];

const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });

const downloadJson = (name, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const ContractGraphPage = () => {
  const { user, signOut, isLocal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id || null;

  const [workspaces, setWorkspaces] = useState(() => listWorkspaces(userId));
  const [activeId, setActiveId] = useState(() => listWorkspaces(userId)[0]?.id || null);
  const [services, setServices] = useState([]); // with specs loaded
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("map");
  const [selectedId, setSelectedId] = useState(null);
  const [notices, setNotices] = useState([]); // {kind, text}
  const [addOpen, setAddOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [urlText, setUrlText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const mapRef = useRef(null);
  const [mapSize, setMapSize] = useState({ w: 900, h: 560 });

  const refresh = useCallback(() => {
    const list = listWorkspaces(userId);
    setWorkspaces(list);
    return list;
  }, [userId]);

  // Switching account switches the bucket of workspaces.
  useEffect(() => {
    const list = listWorkspaces(userId);
    setWorkspaces(list);
    setActiveId(list[0]?.id || null);
  }, [userId]);

  const active = workspaces.find((w) => w.id === activeId) || null;

  // Load the specs of the active workspace.
  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setServices([]);
      return undefined;
    }
    setLoading(true);
    loadServices(active).then((loaded) => {
      if (cancelled) return;
      setServices(loaded.filter((s) => s.spec));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const graph = useMemo(() => buildContractGraph(services), [services]);
  const impacted = useMemo(() => (selectedId ? impactOf(graph, selectedId) : []), [graph, selectedId]);

  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setMapSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  const notify = (kind, text) => setNotices((n) => [...n.slice(-4), { id: Date.now() + Math.random(), kind, text }]);
  const dismiss = (id) => setNotices((n) => n.filter((x) => x.id !== id));

  const ensureWorkspace = useCallback(() => {
    if (active) return active;
    const ws = createWorkspace(userId, "My estate");
    refresh();
    setActiveId(ws.id);
    return ws;
  }, [active, userId, refresh]);

  /** Add one parsed spec; reports failure instead of throwing. */
  const addParsed = useCallback(
    async (name, spec, sourceUrl = "", target = null) => {
      const ws = target || ensureWorkspace();
      try {
        // A document the parsers accept but find nothing in is not a
        // contract; adding it would only put an empty circle on the map.
        const probe = normalizeService({ id: "probe", name, spec });
        if (!probe.operations.length && !probe.entities.length) {
          throw new Error("no operations or schemas were found in it — is it an API specification?");
        }
        const format = Array.isArray(spec) ? "Custom JSON" : formatLabel(spec);
        await addService(userId, ws.id, { name, spec, sourceUrl, format });
        return true;
      } catch (e) {
        notify("error", `${name || "Service"}: ${e.message}`);
        return false;
      }
    },
    [ensureWorkspace, userId],
  );

  const addFiles = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const ws = ensureWorkspace();
    let added = 0;
    for (const file of list) {
      const text = await readFileText(file).catch((e) => {
        notify("error", e.message);
        return null;
      });
      if (text === null) continue;
      const spec = parseSpecText(text);
      if (!spec || typeof spec !== "object") {
        notify("error", `${file.name}: not valid JSON or YAML.`);
        continue;
      }
      if (spec.vizroute === "contract-graph-workspace") {
        const { workspace, failures } = await importWorkspace(userId, spec);
        failures.forEach((f) => notify("error", f));
        refresh();
        setActiveId(workspace.id);
        notify("ok", `Imported workspace "${workspace.name}" with ${workspace.services.length} services.`);
        continue;
      }
      const name = spec?.info?.title || spec?.info?.name || file.name.replace(/\.(json|ya?ml)$/i, "");
      if (await addParsed(name, spec, "", ws)) added += 1;
    }
    refresh();
    if (added) notify("ok", `Added ${added} service${added === 1 ? "" : "s"}.`);
  };

  const addPasted = async () => {
    const spec = parseSpecText(pasteText);
    if (!spec || typeof spec !== "object") {
      notify("error", "That text is not valid JSON or YAML.");
      return;
    }
    const name = pasteName.trim() || spec?.info?.title || spec?.info?.name || "";
    if (await addParsed(name, spec)) {
      setPasteText("");
      setPasteName("");
      refresh();
      notify("ok", `Added ${name || "service"}.`);
    }
  };

  const addFromUrl = async () => {
    const url = urlText.trim();
    if (!/^https?:\/\//i.test(url)) {
      notify("error", "Enter a full http(s) URL.");
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const text = await res.text();
      const spec = parseSpecText(text);
      if (!spec || typeof spec !== "object") throw new Error("The response is not JSON or YAML.");
      const name = spec?.info?.title || spec?.info?.name || url.split("/").pop();
      if (await addParsed(name, spec, url)) {
        setUrlText("");
        refresh();
        notify("ok", `Added ${name}.`);
      }
    } catch (e) {
      notify("error", /Failed to fetch|NetworkError/.test(e.message) ? "The browser could not fetch that URL (blocked by CORS, or offline)." : e.message);
    } finally {
      setFetching(false);
    }
  };

  const loadSample = async () => {
    const ws = createWorkspace(userId, SAMPLE_ESTATE.name);
    for (const s of SAMPLE_ESTATE.services) await addParsed(s.name, s.spec, "", ws);
    refresh();
    setActiveId(ws.id);
    setTab("map");
    notify("ok", "Loaded the sample estate. It is a made-up set of services for trying the map.");
  };

  // A spec handed over from the single-spec workspace ("Add to Contract Graph").
  useEffect(() => {
    const handoff = location.state?.addSpec;
    if (!handoff) return;
    navigate(location.pathname, { replace: true, state: null });
    addParsed(location.state.name || "", handoff).then((ok) => {
      refresh();
      if (ok) notify("ok", `Added ${location.state.name || "the current API"} to the map.`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (serviceId) => {
    if (!active) return;
    await removeService(userId, active.id, serviceId);
    if (selectedId === serviceId) setSelectedId(null);
    refresh();
  };

  const newWorkspace = () => {
    const name = window.prompt("Name for the new workspace", `Workspace ${workspaces.length + 1}`);
    if (name === null) return;
    const ws = createWorkspace(userId, name);
    refresh();
    setActiveId(ws.id);
    setWsMenuOpen(false);
  };

  const rename = () => {
    if (!active) return;
    const name = window.prompt("Rename workspace", active.name);
    if (name === null) return;
    renameWorkspace(userId, active.id, name);
    refresh();
  };

  const destroy = async () => {
    if (!active) return;
    if (!window.confirm(`Delete "${active.name}" and its ${active.services.length} services? This cannot be undone.`)) return;
    await deleteWorkspace(userId, active.id);
    const list = refresh();
    setActiveId(list[0]?.id || null);
    setWsMenuOpen(false);
  };

  const exportJson = async () => {
    if (!active) return;
    downloadJson(`${active.name.replace(/[^a-z0-9_-]+/gi, "_")}.contract-graph.json`, await exportWorkspace(active));
  };

  const copyMermaid = () => {
    navigator.clipboard?.writeText(toMermaid(graph));
    setCopied("mermaid");
    setTimeout(() => setCopied(""), 1500);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files || []);
  };

  const hasServices = services.length > 0;

  return (
    <div className="flex h-screen flex-col bg-vz-bg text-vz-text" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      {/* ── Top bar ── */}
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-vz-line px-4">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
          <BrandMark size={22} /> Vizroute
        </Link>
        <span className="hidden text-vz-dim sm:inline">/</span>
        <span className="hidden text-[13px] font-semibold text-vz-soft sm:inline">Contract Graph</span>

        <div className="relative ml-2">
          <button type="button" onClick={() => setWsMenuOpen((v) => !v)} className="vz-t flex h-9 max-w-[260px] items-center gap-2 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] text-vz-text hover:border-vz-accent/40" aria-haspopup="menu" aria-expanded={wsMenuOpen}>
            <span className="truncate">{active ? active.name : "No workspace"}</span>
            <ChevronDown size={13} className="flex-shrink-0 text-vz-dim" />
          </button>
          {wsMenuOpen && (
            <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-vz-line bg-vz-panel p-1.5 shadow-2xl" role="menu">
              {workspaces.map((w) => (
                <button key={w.id} type="button" role="menuitem" onClick={() => { setActiveId(w.id); setWsMenuOpen(false); setSelectedId(null); }} className={`vz-t flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${w.id === activeId ? "bg-vz-accent/12 text-[#e6c4ff]" : "text-vz-soft hover:bg-white/5 hover:text-vz-text"}`}>
                  <span className="truncate">{w.name}</span>
                  <span className="ml-2 flex-shrink-0 text-[11px] text-vz-dim">{w.services.length}</span>
                </button>
              ))}
              <div className="my-1 border-t border-vz-line-soft" />
              <button type="button" role="menuitem" onClick={newWorkspace} className="vz-t flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text"><Plus size={13} /> New workspace</button>
              {active && (
                <>
                  <button type="button" role="menuitem" onClick={rename} className="vz-t flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text">Rename</button>
                  <button type="button" role="menuitem" onClick={() => importInputRef.current?.click()} className="vz-t flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text"><Upload size={13} /> Import workspace file</button>
                  <button type="button" role="menuitem" onClick={destroy} className="vz-t flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-[#fda4af] hover:bg-vz-red/10"><Trash2 size={13} /> Delete workspace</button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasServices && (
            <>
              <button type="button" onClick={copyMermaid} title="Copy the map as a Mermaid diagram" className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12.5px] text-vz-soft hover:text-vz-text">
                {copied === "mermaid" ? <Check size={13} className="text-vz-green" /> : <Share2 size={13} />}<span className="hidden md:inline">Mermaid</span>
              </button>
              <button type="button" onClick={exportJson} title="Download the workspace with every spec" className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12.5px] text-vz-soft hover:text-vz-text">
                <Download size={13} /><span className="hidden md:inline">Export</span>
              </button>
            </>
          )}
          {user ? (
            <div className="flex items-center gap-2 pl-2">
              <span className="hidden text-[12.5px] text-vz-soft sm:inline" title={user.email}>{user.name || user.email}</span>
              <button type="button" onClick={() => signOut()} className="vz-t flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-vz-dim hover:text-vz-text" title="Sign out"><LogOut size={14} /></button>
            </div>
          ) : (
            <Link to="/login?next=/graph" className="vz-t flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-3.5 text-[12.5px] font-bold text-[#160a1d] hover:opacity-90"><LogIn size={14} /> Sign in</Link>
          )}
        </div>
      </header>

      {/* ── Notices ── */}
      {notices.length > 0 && (
        <div className="flex-shrink-0 space-y-1 px-4 pt-2">
          {notices.map((n) => (
            <div key={n.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${n.kind === "error" ? "border-vz-red/25 bg-vz-red/[0.08] text-[#fda4af]" : "border-vz-green/25 bg-vz-green/[0.08] text-vz-green"}`} role={n.kind === "error" ? "alert" : "status"}>
              {n.kind === "error" ? <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> : <Check size={14} className="mt-0.5 flex-shrink-0" />}
              <span className="min-w-0 flex-1">{n.text}</span>
              <button type="button" onClick={() => dismiss(n.id)} className="vz-t opacity-60 hover:opacity-100" aria-label="Dismiss"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Services rail ── */}
        <aside className="flex w-[280px] flex-shrink-0 flex-col border-r border-vz-line">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">Services {active ? `· ${active.services.length}/${MAX_SERVICES}` : ""}</span>
            <button type="button" onClick={() => setAddOpen((v) => !v)} className="vz-t flex items-center gap-1 rounded-md border border-vz-line bg-vz-panel-2 px-2 py-1 text-[11.5px] text-vz-soft hover:text-vz-text"><Plus size={12} /> Add</button>
          </div>

          {(addOpen || !hasServices) && (
            <div className="space-y-3 border-b border-vz-line-soft px-4 pb-4">
              <button type="button" onClick={() => fileInputRef.current?.click()} className={`vz-t flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-4 text-[12px] ${dragOver ? "border-vz-accent bg-vz-accent/10 text-vz-text" : "border-vz-line text-vz-soft hover:border-vz-accent/50 hover:text-vz-text"}`}>
                <Upload size={16} />
                Drop spec files here, or click
                <span className="text-[11px] text-vz-dim">OpenAPI, Swagger, Postman, WSDL · JSON or YAML · many at once</span>
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".json,.yaml,.yml,.wsdl,.xml,application/json" className="sr-only" aria-label="Add specification files" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />
              <input ref={importInputRef} type="file" accept=".json" className="sr-only" aria-label="Import workspace file" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />
              <div className="flex gap-1.5">
                <input value={urlText} onChange={(e) => setUrlText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFromUrl()} placeholder="https://…/openapi.json" aria-label="Specification URL" className="vz-mono vz-t h-8 min-w-0 flex-1 rounded-lg border border-vz-line bg-vz-bg px-2.5 text-[11.5px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50" />
                <button type="button" onClick={addFromUrl} disabled={fetching} className="vz-t flex h-8 items-center gap-1 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[11.5px] text-vz-soft hover:text-vz-text disabled:opacity-50"><Globe size={12} /> {fetching ? "…" : "Fetch"}</button>
              </div>
              <details className="text-[12px]">
                <summary className="cursor-pointer text-vz-soft hover:text-vz-text">Paste a specification</summary>
                <div className="mt-2 space-y-1.5">
                  <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Service name (optional)" aria-label="Service name" className="vz-t h-8 w-full rounded-lg border border-vz-line bg-vz-bg px-2.5 text-[12px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50" />
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="{ openapi: … } or a Postman collection" aria-label="Specification text" rows={5} className="vz-mono vz-t w-full resize-y rounded-lg border border-vz-line bg-vz-bg px-2.5 py-2 text-[11.5px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50" />
                  <button type="button" onClick={addPasted} disabled={!pasteText.trim()} className="vz-t flex h-8 items-center gap-1 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[11.5px] text-vz-soft hover:text-vz-text disabled:opacity-50"><FileJson size={12} /> Add pasted spec</button>
                </div>
              </details>
              {!hasServices && (
                <button type="button" onClick={loadSample} className="vz-t flex w-full items-center justify-center gap-1.5 rounded-lg bg-vz-accent/12 px-3 py-2 text-[12px] font-semibold text-[#e6c4ff] hover:bg-vz-accent/20"><Sparkles size={13} /> Load a sample estate</button>
              )}
            </div>
          )}

          <ul className="vz-scroll min-h-0 flex-1 overflow-auto px-2 py-2">
            {loading && <li className="px-2 py-3 text-[12px] text-vz-dim">Loading…</li>}
            {!loading && active?.services.map((s) => {
              const built = graph.services.find((g) => g.id === s.id);
              const failed = graph.errors.find((e) => e.id === s.id);
              return (
                <li key={s.id} className={`group flex items-center gap-1 rounded-lg ${selectedId === s.id ? "bg-vz-accent/12" : "hover:bg-white/[0.04]"}`}>
                  <button type="button" onClick={() => { setSelectedId(s.id); if (tab !== "map") setTab("map"); }} className="vz-t flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left">
                    <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-vz-text">{s.name}</span>
                      <span className="block truncate text-[11px] text-vz-dim">
                        {failed ? <span className="text-[#fda4af]">{failed.message}</span> : built ? `${built.formatLabel} · ${built.operations.length} ops · ${built.entities.length} ${built.entities.length === 1 ? "entity" : "entities"}` : s.format}
                      </span>
                    </span>
                  </button>
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)} className="vz-t mr-1 rounded-md p-1 text-vz-dim opacity-0 hover:bg-vz-red/10 hover:text-vz-red focus:opacity-100 group-hover:opacity-100"><Trash2 size={12} /></button>
                </li>
              );
            })}
          </ul>

          {isLocal && user && (
            <p className="border-t border-vz-line-soft px-4 py-2 text-[11px] leading-relaxed text-vz-dim">Workspaces are stored in this browser for {user.email}.</p>
          )}
        </aside>

        {/* ── Main ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          {hasServices ? (
            <>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-vz-line px-4 text-[12px] text-vz-dim">
                <div className="flex items-center">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const count = t.count ? t.count(graph) : null;
                    const alert = t.alert ? t.alert(graph) : false;
                    return (
                      <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`vz-t relative flex items-center gap-1.5 px-3 py-3 text-[12.5px] ${tab === t.id ? "text-[#e6c4ff] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-vz-accent-2" : "text-vz-soft hover:text-vz-text"}`}>
                        <Icon size={13} /> {t.label}
                        {count !== null && count > 0 && <span className="tabular-nums text-vz-dim">{count}</span>}
                        {alert && <span className="inline-block h-1.5 w-1.5 rounded-full bg-vz-warn" />}
                      </button>
                    );
                  })}
                </div>
                <div className="ml-auto flex flex-wrap gap-x-3 py-2 tabular-nums">
                  <span>{graph.stats.services} services</span>
                  <span>{graph.stats.operations} operations</span>
                  <span>{graph.stats.entities} entities</span>
                  <span>{graph.stats.edges} relationships</span>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="vz-scroll min-w-0 flex-1 overflow-auto">
                  {tab === "map" && (
                    <div className="flex h-full flex-col">
                      <div ref={mapRef} className="min-h-[360px] flex-1">
                        <ServiceMap graph={graph} selectedId={selectedId} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} impacted={impacted} width={mapSize.w} height={mapSize.h} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-vz-line-soft px-4 py-2 text-[11px] text-vz-dim">
                        <span><span className="mr-1.5 inline-block h-0.5 w-5 bg-vz-soft align-middle" />calls</span>
                        <span><span className="mr-1.5 inline-block w-5 border-t border-dashed border-vz-soft align-middle" />references an entity it owns</span>
                        <span><span className="mr-1.5 inline-block w-5 border-t border-dotted border-vz-soft align-middle" />shares an entity</span>
                        <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full border-2 border-dashed border-vz-soft align-middle" />consumer collection</span>
                        <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full border-2 border-dashed border-vz-warn align-middle" />depends on the selected service</span>
                        <span className="ml-auto">Number in a circle = operations. Hover an edge for its evidence.</span>
                      </div>
                    </div>
                  )}
                  {tab === "entities" && <div className="p-4"><EntitiesView graph={graph} /></div>}
                  {tab === "duplicates" && <div className="p-4"><DuplicatesView graph={graph} /></div>}
                  {tab === "concepts" && <div className="p-4"><ConceptsView graph={graph} /></div>}
                  {tab === "findings" && <div className="p-4"><FindingsView graph={graph} /></div>}
                </div>
                {selectedId && graph.services.some((s) => s.id === selectedId) && (
                  <aside className="w-[320px] flex-shrink-0 border-l border-vz-line">
                    <ServiceInspector graph={graph} serviceId={selectedId} impacted={impacted} onClose={() => setSelectedId(null)} />
                  </aside>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-vz-accent/25 bg-vz-accent/10 text-vz-accent-2"><Waypoints size={26} /></span>
              <h1 className="mt-5 text-[22px] font-bold" style={{ textWrap: "balance" }}>See your whole API estate on one map</h1>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-vz-soft">
                Add the contracts your teams already have — OpenAPI, Swagger, Postman collections, WSDL — and Contract Graph finds what only shows up between them: entities with more than one shape, duplicated endpoints, one concept under three names, and which services depend on which. Nothing leaves your browser.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="vz-t flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-4 text-[13px] font-bold text-[#160a1d] hover:opacity-90"><Upload size={14} /> Add spec files</button>
                <button type="button" onClick={loadSample} className="vz-t flex h-10 items-center gap-2 rounded-lg border border-vz-line bg-vz-panel-2 px-4 text-[13px] text-vz-soft hover:text-vz-text"><Sparkles size={14} /> Try the sample estate</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ContractGraphPage;
