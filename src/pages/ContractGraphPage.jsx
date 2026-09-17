import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Upload, Globe, Download, FileJson, Waypoints, Boxes, CopyMinus, Tags, ListChecks,
  AlertCircle, ChevronDown, ChevronRight, Sparkles, X, Share2, Check, WandSparkles, Search, Table2,
  Minus, Maximize2, BookOpen, ArrowRight, Scan, Link2, Code2, Image, FileCode2, Save,
} from "lucide-react";
import {
  buildEstatePayload, estateShareUrl, estateEmbedSnippet, readSharedEstate, serviceMapSvg, svgToPng, downloadBlob, safeFilename,
} from "../utils/serviceMapExport";
import "../contractgraph.css";
import AiPanel from "../components/ai/AiPanel";
import { GRAPH_SUGGESTIONS, GRAPH_TOOLS, buildGraphSystemPrompt, createGraphToolRunner, describeGraphStep } from "../utils/ai/graphAssistant";
import ProductSwitcher from "../components/shell/ProductSwitcher";
import AccountMenu from "../components/shell/AccountMenu";
import { useAuth } from "../components/auth/useAuth";
import ServiceMap from "../components/contractgraph/ServiceMap";
import { EntitiesView, DuplicatesView, ConceptsView, FindingsView, ServicesListView, OperationsTableView } from "../components/contractgraph/Views";
import ServiceDetails, { EdgeDetails } from "../components/contractgraph/ServiceDetails";
import { LAYOUTS } from "../utils/serviceLayout";
import { buildContractGraph, impactOf, toMermaid, normalizeService } from "../utils/contractGraph";
import { parseSpecText } from "../utils/readSpec";
import { formatLabel } from "../utils/parsers";
import {
  listWorkspaces, createWorkspace, deleteWorkspace, renameWorkspace, addService, removeService, replaceService,
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
  const { user, isLocal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id || null;

  // A link from Home can name the workspace to open.
  const wanted = new URLSearchParams(location.search).get("ws");
  const [workspaces, setWorkspaces] = useState(() => listWorkspaces(userId));
  const [activeId, setActiveId] = useState(() => {
    const list = listWorkspaces(userId);
    return (wanted && list.find((w) => w.id === wanted)?.id) || list[0]?.id || null;
  });
  const [services, setServices] = useState([]); // with specs loaded
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("map");
  const [selectedId, setSelectedId] = useState(null);
  // A selected relationship shows its evidence in place of the service panel.
  const [selectedEdge, setSelectedEdge] = useState(null);
  const replaceInputRef = useRef(null);
  const replaceTargetRef = useRef(null);
  const [notices, setNotices] = useState([]); // {kind, text}
  const [addOpen, setAddOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [urlText, setUrlText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);
  // An estate opened from a share link is shown without being saved; the
  // visitor decides whether it becomes one of their workspaces.
  const [shared, setShared] = useState(() => readSharedEstate());
  // "Ask the estate": the thread outlives the drawer; a workspace switch clears it.
  const [showAssistant, setShowAssistant] = useState(false);
  const [assistantThread, setAssistantThread] = useState([]);
  const [aiHighlight, setAiHighlight] = useState(() => ({ ids: [], reason: "" }));
  // Map toolbar: graph / list / table, layout, zoom, and the header search.
  const [viewMode, setViewMode] = useState("graph");
  const [layout, setLayout] = useState("force");
  const [zoom, setZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  // Node positions moved by hand, remembered per workspace and layout.
  const arrangementKey = shared ? null : activeId ? `vizroute_cg_positions:${activeId}:${layout}` : null;
  const [positionOverrides, setPositionOverrides] = useState({});
  useEffect(() => {
    if (shared) {
      // The author's arrangement, keyed by name in the link, re-keyed to this view's ids.
      const byName = shared.positions || {};
      const next = {};
      shared.services.forEach((s, i) => {
        const pos = byName[s.name];
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) next[`shared-${i}`] = { x: pos.x, y: pos.y };
      });
      setPositionOverrides(next);
      return;
    }
    if (!arrangementKey) return;
    try {
      const raw = localStorage.getItem(arrangementKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setPositionOverrides(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setPositionOverrides({});
    }
  }, [arrangementKey, shared]);
  const moveNode = useCallback((next) => {
    setPositionOverrides(next);
    if (!arrangementKey) return;
    try {
      localStorage.setItem(arrangementKey, JSON.stringify(next));
    } catch {
      /* storage full: the arrangement lasts for the session only */
    }
  }, [arrangementKey]);
  const resetPositions = () => {
    setPositionOverrides({});
    if (arrangementKey) {
      try {
        localStorage.removeItem(arrangementKey);
      } catch {
        /* nothing to clear */
      }
    }
    setLayoutMenuOpen(false);
  };
  const layoutMenuRef = useRef(null);
  const [search, setSearch] = useState("");
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
    setActiveId((current) => (current && list.some((w) => w.id === current) ? current : list[0]?.id || null));
  }, [userId]);

  const active = workspaces.find((w) => w.id === activeId) || null;

  // Load the specs of the active workspace — or show the shared estate.
  useEffect(() => {
    let cancelled = false;
    if (shared) {
      setServices(shared.services.map((s, i) => ({ id: `shared-${i}`, name: s.name || `Service ${i + 1}`, color: undefined, sourceUrl: s.sourceUrl || "", spec: s.spec })));
      setLoading(false);
      return undefined;
    }
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
  }, [active, shared]);

  const graph = useMemo(() => buildContractGraph(services), [services]);
  const hasServicesForResize = services.length > 0;
  const impacted = useMemo(() => (selectedId ? impactOf(graph, selectedId) : []), [graph, selectedId]);

  /** Services that do not match the search, by name or by any operation. */
  const dimmed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      graph.services
        .filter((s) => !s.name.toLowerCase().includes(q) && !s.operations.some((op) => `${op.method} ${op.path} ${op.name}`.toLowerCase().includes(q)))
        .map((s) => s.id),
    );
  }, [graph, search]);

  const edgeOpen = Boolean(selectedEdge) && graph.edges.some((e) => `${e.from}|${e.to}|${e.kind}` === selectedEdge);
  const detailsOpen = edgeOpen || (Boolean(selectedId) && graph.services.some((s) => s.id === selectedId));
  const currentEdge = edgeOpen ? graph.edges.find((e) => `${e.from}|${e.to}|${e.kind}` === selectedEdge) : null;
  const pickService = (id) => {
    setSelectedEdge(null);
    setSelectedId(id);
  };

  /** Hand a service's document to the single-spec workspace. */
  const openInExplorer = useCallback((id) => {
    const svc = services.find((s) => s.id === id);
    if (!svc?.spec) return;
    navigate("/workspace", { state: { openSpec: svc.spec, name: svc.name } });
  }, [services, navigate]);

  const toggleFullscreen = () => {
    const el = mapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  useEffect(() => {
    if (!layoutMenuOpen) return undefined;
    const onDown = (e) => layoutMenuRef.current && !layoutMenuRef.current.contains(e.target) && setLayoutMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [layoutMenuOpen]);

  // The assistant's view of the graph, and what it may do to the page.
  const assistantActions = useMemo(
    () => ({
      highlightServices: (ids, reason) => {
        setAiHighlight({ ids, reason });
        setSelectedId(ids[0] || null);
        setTab("map");
      },
      openTab: (next) => setTab(next),
    }),
    [],
  );
  const assistantEngine = useMemo(() => {
    const system = buildGraphSystemPrompt(graph);
    const byId = new Map(graph.services.map((s) => [s.id, s]));
    return {
      title: "Ask the estate",
      subtitle: `${graph.services.length} service${graph.services.length === 1 ? "" : "s"} indexed`,
      intro: "Ask about these services together. Answers come from the graph — shared entities, duplicates, concepts, dependencies — and services the assistant mentions are clickable.",
      placeholder: "Ask about this estate… (Enter to send)",
      suggestions: GRAPH_SUGGESTIONS,
      system,
      tools: GRAPH_TOOLS,
      describe: describeGraphStep,
      runTool: createGraphToolRunner({ graph, actions: assistantActions }),
      chipFor: (id, key) => {
        const s = byId.get(id);
        if (!s) return null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => { setSelectedId(s.id); setTab("map"); }}
            className="vz-t inline-flex max-w-full items-center gap-1.5 rounded-md border border-vz-line bg-vz-panel-2 px-1.5 py-px align-middle text-[11.5px] text-vz-text hover:border-vz-accent/60 hover:bg-vz-accent/10"
          >
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate">{s.name}</span>
          </button>
        );
      },
    };
  }, [graph, assistantActions]);

  // A different workspace is a different conversation.
  useEffect(() => {
    setAssistantThread([]);
    setAiHighlight({ ids: [], reason: "" });
  }, [activeId]);

  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setMapSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, viewMode, hasServicesForResize]);

  // The workspace menu closes on an outside click or Escape, like every other menu.
  const wsMenuRef = useRef(null);
  useEffect(() => {
    if (!wsMenuOpen) return undefined;
    const onDown = (e) => wsMenuRef.current && !wsMenuRef.current.contains(e.target) && setWsMenuOpen(false);
    const onKey = (e) => e.key === "Escape" && setWsMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [wsMenuOpen]);

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
      if (spec.vizroute === "contract-graph-workspace" || spec.vizroute === "contract-graph-estate") {
        const { workspace, failures } = await importWorkspace(userId, { ...spec, vizroute: "contract-graph-workspace" });
        failures.forEach((f) => notify("error", f));
        if (spec.positions && workspace) {
          const next = {};
          workspace.services.forEach((s) => {
            const pos = spec.positions[s.name];
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) next[s.id] = pos;
          });
          try {
            localStorage.setItem(`vizroute_cg_positions:${workspace.id}:${layout}`, JSON.stringify(next));
          } catch {
            /* optional */
          }
        }
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

  /** Put a newer document under an existing service; colour and position stay. */
  const replaceWith = async (serviceId, spec, sourceUrl) => {
    if (!active) return;
    const svc = active.services.find((s) => s.id === serviceId);
    if (!svc) return;
    try {
      const probe = normalizeService({ id: "probe", name: svc.name, spec });
      if (!probe.operations.length && !probe.entities.length) {
        throw new Error("no operations or schemas were found in it — is it an API specification?");
      }
      const before = graph.services.find((s) => s.id === serviceId);
      await replaceService(userId, active.id, serviceId, { spec, sourceUrl, format: Array.isArray(spec) ? "Custom JSON" : formatLabel(spec) });
      refresh();
      const delta = before ? ` ${before.operations.length} → ${probe.operations.length} operations, ${before.entities.length} → ${probe.entities.length} entities.` : "";
      notify("ok", `Replaced ${svc.name}.${delta}`);
    } catch (e) {
      notify("error", `${svc.name}: ${e.message}`);
    }
  };

  const chooseReplacement = (serviceId) => {
    replaceTargetRef.current = serviceId;
    replaceInputRef.current?.click();
  };

  const onReplacementFile = async (fileList) => {
    const file = fileList?.[0];
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !target) return;
    const text = await readFileText(file).catch((e) => {
      notify("error", e.message);
      return null;
    });
    if (text === null) return;
    const spec = parseSpecText(text);
    if (!spec || typeof spec !== "object") {
      notify("error", `${file.name}: not valid JSON or YAML.`);
      return;
    }
    await replaceWith(target, spec, "");
  };

  const refetch = async (serviceId) => {
    const svc = active?.services.find((s) => s.id === serviceId);
    if (!svc?.sourceUrl) return;
    setFetching(true);
    try {
      const res = await fetch(svc.sourceUrl);
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const spec = parseSpecText(await res.text());
      if (!spec || typeof spec !== "object") throw new Error("The response is not JSON or YAML.");
      await replaceWith(serviceId, spec, svc.sourceUrl);
    } catch (e) {
      notify("error", `${svc.name}: ${/Failed to fetch|NetworkError/.test(e.message) ? "the browser could not fetch that URL (blocked by CORS, or offline)." : e.message}`);
    } finally {
      setFetching(false);
    }
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
    setWsMenuOpen(false);
  };

  const destroy = async () => {
    if (!active) return;
    if (!window.confirm(`Delete "${active.name}" and its ${active.services.length} services? This cannot be undone.`)) return;
    await deleteWorkspace(userId, active.id);
    const list = refresh();
    setActiveId(list[0]?.id || null);
    setWsMenuOpen(false);
  };

  /** The estate as a link or a file carries: specs plus the arrangement, positions keyed by name. */
  const estatePayload = useCallback(async () => {
    const positionsByName = {};
    graph.services.forEach((s) => {
      const p = positionOverrides[s.id];
      if (p) positionsByName[s.name] = { x: Math.round(p.x), y: Math.round(p.y) };
    });
    if (shared) return { ...buildEstatePayload({ name: shared.name, services: services, positionsByName }) };
    if (!active) return null;
    const file = await exportWorkspace(active);
    return { ...file, vizroute: "contract-graph-workspace", positions: positionsByName };
  }, [graph, positionOverrides, shared, services, active]);

  const exportJson = async () => {
    const payload = await estatePayload();
    if (!payload) return;
    downloadJson(`${safeFilename(payload.name, "estate")}.contract-graph.json`, payload);
    setShareOpen(false);
  };

  const flash = (what) => {
    setCopied(what);
    setTimeout(() => setCopied(""), 1800);
  };

  const copyShareLink = async () => {
    const payload = await estatePayload();
    if (!payload) return;
    const share = estateShareUrl(payload);
    if (!share.ok) {
      notify("error", `This estate is ${(share.bytes / 1024).toFixed(0)} KB — too large for a link. Download the file instead; it opens with "Import workspace file".`);
      return;
    }
    await navigator.clipboard?.writeText(share.url);
    flash("link");
  };

  const copyEmbed = async () => {
    const payload = await estatePayload();
    if (!payload) return;
    const embed = estateEmbedSnippet(payload);
    if (!embed.ok) {
      notify("error", "This estate is too large for an embed link. Share the file instead.");
      return;
    }
    await navigator.clipboard?.writeText(embed.snippet);
    flash("embed");
  };

  const pictureTitle = () => `${shared?.name || active?.name || "Service map"} — service map`;
  const liveSvg = () => mapRef.current?.querySelector("svg.cg-canvas");

  const downloadSvg = () => {
    const out = serviceMapSvg(liveSvg(), { title: pictureTitle() });
    if (!out) {
      notify("error", "Open the Graph view to export a picture of the map.");
      return;
    }
    downloadBlob(new Blob([out.svg], { type: "image/svg+xml;charset=utf-8" }), `${safeFilename(shared?.name || active?.name)}.svg`);
    setShareOpen(false);
  };

  const downloadPng = async () => {
    const out = serviceMapSvg(liveSvg(), { title: pictureTitle() });
    if (!out) {
      notify("error", "Open the Graph view to export a picture of the map.");
      return;
    }
    try {
      const { blob } = await svgToPng(out);
      downloadBlob(blob, `${safeFilename(shared?.name || active?.name)}.png`);
    } catch (e) {
      notify("error", e.message);
    }
    setShareOpen(false);
  };

  /** Keep a shared estate: it becomes a workspace of the visitor's own, arrangement included. */
  const saveShared = async () => {
    if (!shared) return;
    const { workspace, failures } = await importWorkspace(userId, { vizroute: "contract-graph-workspace", name: shared.name, services: shared.services });
    failures.forEach((f) => notify("error", f));
    if (shared.positions && workspace) {
      const next = {};
      workspace.services.forEach((s) => {
        const pos = shared.positions[s.name];
        if (pos) next[s.id] = pos;
      });
      try {
        localStorage.setItem(`vizroute_cg_positions:${workspace.id}:${layout}`, JSON.stringify(next));
      } catch {
        /* the arrangement is optional */
      }
    }
    navigate("/graph", { replace: true });
    setShared(null);
    refresh();
    if (workspace) setActiveId(workspace.id);
    notify("ok", `Saved "${shared.name}" to your workspaces.`);
  };

  useEffect(() => {
    if (!shareOpen) return undefined;
    const onDown = (e) => shareRef.current && !shareRef.current.contains(e.target) && setShareOpen(false);
    const onKey = (e) => e.key === "Escape" && setShareOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);

  const copyMermaid = () => {
    navigator.clipboard?.writeText(toMermaid(graph));
    flash("mermaid");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files || []);
  };

  const hasServices = services.length > 0;

  const TAB_META = {
    map: { title: "Service Map", sub: "Visualize how your services, operations and entities are connected" },
    entities: { title: "Entities", sub: "Entities exposed by more than one service, and where their shapes disagree" },
    duplicates: { title: "Duplicates", sub: "Endpoints that duplicate or nearly duplicate each other across services" },
    concepts: { title: "Concepts", sub: "Fields that mean the same thing under different names" },
    findings: { title: "Findings", sub: "Everything the graph noticed, by severity" },
  };
  const meta = TAB_META[tab] || TAB_META.map;

  return (
    <div className="cg" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      {/* ── Header ── */}
      <header className="cg-header">
        <ProductSwitcher compact />
        {shared ? (
          <span className="cg-pill" title="Opened from a share link — not saved yet">
            <Link2 size={12} /> Shared · {shared.name}
          </span>
        ) : (
        <div className="relative" ref={wsMenuRef}>
          <button type="button" onClick={() => setWsMenuOpen((v) => !v)} className="cg-btn" style={{ maxWidth: 240 }} aria-haspopup="menu" aria-expanded={wsMenuOpen}>
            <span className="truncate">{active ? active.name : "No workspace"}</span>
            <ChevronDown size={13} />
          </button>
          {wsMenuOpen && (
            <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border p-1.5 shadow-2xl" style={{ background: "var(--cg-panel-2)", borderColor: "var(--cg-border)" }} role="menu">
              {workspaces.map((w) => (
                <button key={w.id} type="button" role="menuitem" onClick={() => { setActiveId(w.id); setWsMenuOpen(false); setSelectedId(null); }} className={`vz-t flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${w.id === activeId ? "bg-vz-accent/12 text-[#e6c4ff]" : "text-vz-soft hover:bg-white/5 hover:text-vz-text"}`}>
                  <span className="truncate">{w.name}</span>
                  <span className="ml-2 flex-shrink-0 text-[11px]" style={{ color: "var(--cg-dim)" }}>{w.services.length}</span>
                </button>
              ))}
              <div className="my-1 border-t" style={{ borderColor: "var(--cg-border)" }} />
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
        )}

        {hasServices && (
          <nav className="cg-nav hidden lg:flex" aria-label="Views">
            {TABS.map((t) => {
              const Icon = t.icon;
              const count = t.count ? t.count(graph) : null;
              const alert = t.alert ? t.alert(graph) : false;
              return (
                <button key={t.id} type="button" className={`cg-nav-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                  <Icon size={14} /> {t.label}
                  {count !== null && count > 0 && <span className="cg-nav-count">{count}</span>}
                  {alert && <span className="cg-nav-alert" />}
                </button>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {hasServices && (
            <>
              <label className="relative hidden md:block">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--cg-dim)" }} />
                <input className="cg-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services, operations…" aria-label="Search services and operations" />
              </label>
              <button type="button" onClick={() => setShowAssistant((v) => !v)} title="Ask the estate — AI assistant over these services" className={`cg-btn ${showAssistant ? "active" : ""}`}>
                <WandSparkles size={14} /><span className="hidden xl:inline">Ask AI</span>
              </button>
              {shared && (
                <button type="button" onClick={saveShared} className="cg-btn primary"><Save size={14} /> Save to my workspaces</button>
              )}
              <div className="relative" ref={shareRef}>
                <button type="button" onClick={() => setShareOpen((v) => !v)} className={`cg-btn ${shareOpen ? "active" : ""}`} aria-haspopup="menu" aria-expanded={shareOpen}>
                  <Share2 size={14} /><span className="hidden xl:inline">Share</span>
                </button>
                {shareOpen && (
                  <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-xl border p-1.5 shadow-2xl" style={{ background: "var(--cg-panel-2)", borderColor: "var(--cg-border)" }}>
                    {[
                      { id: "link", icon: Link2, label: copied === "link" ? "Link copied" : "Copy share link", hint: "Opens this estate, arrangement included", run: copyShareLink },
                      { id: "embed", icon: Code2, label: copied === "embed" ? "Embed copied" : "Copy embed code", hint: "An <iframe> of the map", run: copyEmbed },
                      { id: "png", icon: Image, label: "Download PNG", hint: "2× bitmap of the map", run: downloadPng, mapOnly: true },
                      { id: "svg", icon: FileCode2, label: "Download SVG", hint: "Vector, editable", run: downloadSvg, mapOnly: true },
                      { id: "mermaid", icon: Share2, label: copied === "mermaid" ? "Mermaid copied" : "Copy as Mermaid", hint: "For wikis and READMEs", run: copyMermaid },
                      { id: "file", icon: Download, label: "Download workspace file", hint: "Every spec; opens with Import", run: exportJson },
                    ].map((item) => {
                      const Icon = item.icon;
                      const disabled = item.mapOnly && !(tab === "map" && viewMode === "graph");
                      return (
                        <button key={item.id} type="button" role="menuitem" onClick={item.run} disabled={disabled} title={disabled ? "Open the Graph view first" : undefined} className="vz-t flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-vz-soft hover:bg-white/5 hover:text-vz-text disabled:opacity-40">
                          <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: copied === item.id ? "var(--cg-green)" : undefined }} />
                          <span className="min-w-0">
                            <span className="block text-[13px]">{item.label}</span>
                            <span className="block text-[11px]" style={{ color: "var(--cg-dim)" }}>{item.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          <AccountMenu />
        </div>
      </header>

      {/* ── Notices ── */}
      {notices.length > 0 && (
        <div className="flex-shrink-0 space-y-1 px-4 pt-2" style={{ background: "var(--cg-panel)" }}>
          {notices.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]" style={n.kind === "error" ? { borderColor: "rgba(244,63,94,0.35)", background: "rgba(244,63,94,0.08)", color: "#fda4af" } : { borderColor: "rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.08)", color: "#34d399" }} role={n.kind === "error" ? "alert" : "status"}>
              {n.kind === "error" ? <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> : <Check size={14} className="mt-0.5 flex-shrink-0" />}
              <span className="min-w-0 flex-1">{n.text}</span>
              <button type="button" onClick={() => dismiss(n.id)} className="vz-t opacity-60 hover:opacity-100" aria-label="Dismiss"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className={`cg-app ${detailsOpen ? "with-details" : ""}`} style={showAssistant && hasServices ? { marginRight: 446 } : undefined}>
        {/* ── Sidebar ── */}
        <aside className="cg-sidebar">
          {/* Always mounted: "Replace spec…" in the details panel opens it whether or not the add panel is showing. */}
          {!shared && <input ref={replaceInputRef} type="file" accept=".json,.yaml,.yml,.wsdl,.xml,application/json" className="sr-only" aria-label="Replacement specification file" onChange={(e) => { onReplacementFile(e.target.files); e.target.value = ""; }} />}
          <div className="cg-sidebar-title">
            <span>Services{active ? ` · ${active.services.length} / ${MAX_SERVICES}` : ""}</span>
            {!shared && <button type="button" className="cg-add" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}><Plus size={13} /> Add Service</button>}
          </div>

          {!shared && (addOpen || !hasServices) && (
            <div className="cg-add-panel">
              <button type="button" onClick={() => fileInputRef.current?.click()} className={`cg-drop ${dragOver ? "over" : ""}`}>
                <Upload size={16} />
                Drop spec files here, or click
                <small>OpenAPI, Swagger, Postman, WSDL · JSON or YAML · many at once</small>
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".json,.yaml,.yml,.wsdl,.xml,application/json" className="sr-only" aria-label="Add specification files" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />
              <input ref={importInputRef} type="file" accept=".json" className="sr-only" aria-label="Import workspace file" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />
              <div className="mt-2 flex gap-1.5">
                <input value={urlText} onChange={(e) => setUrlText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFromUrl()} placeholder="https://…/openapi.json" aria-label="Specification URL" className="cg-field mono" />
                <button type="button" onClick={addFromUrl} disabled={fetching} className="cg-btn" style={{ height: 32 }}><Globe size={12} /> {fetching ? "…" : "Fetch"}</button>
              </div>
              <details className="mt-2 text-[12px]">
                <summary className="cursor-pointer" style={{ color: "var(--cg-soft)" }}>Paste a specification</summary>
                <div className="mt-2 space-y-1.5">
                  <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Service name (optional)" aria-label="Service name" className="cg-field" />
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="{ openapi: … } or a Postman collection" aria-label="Specification text" rows={5} className="cg-field mono" />
                  <button type="button" onClick={addPasted} disabled={!pasteText.trim()} className="cg-btn" style={{ height: 32 }}><FileJson size={12} /> Add pasted spec</button>
                </div>
              </details>
              {!hasServices && (
                <button type="button" onClick={loadSample} className="cg-btn primary mt-2 w-full justify-center"><Sparkles size={13} /> Load a sample estate</button>
              )}
            </div>
          )}

          <div className="cg-services">
            {loading && <div className="cg-service-meta" style={{ padding: "8px 10px" }}>Loading…</div>}
            {!loading && (shared ? services : active?.services || []).map((s) => {
              const built = graph.services.find((g) => g.id === s.id);
              const failed = graph.errors.find((e) => e.id === s.id);
              const hidden = dimmed?.has(s.id);
              return (
                <button key={s.id} type="button" className={`cg-service ${selectedId === s.id ? "active" : ""} ${hidden ? "hidden" : ""}`} onClick={() => { setSelectedId((cur) => (cur === s.id ? null : s.id)); if (tab !== "map") setTab("map"); }}>
                  <span className="cg-dot" style={{ background: built?.color || s.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="cg-service-name truncate block">{s.name}</span>
                    <span className={`cg-service-meta ${failed ? "error" : ""}`}>
                      {failed ? failed.message : built ? (built.isCollection ? `${built.operations.length} requests · consumer` : `${built.operations.length} ops · ${built.entities.length} ${built.entities.length === 1 ? "entity" : "entities"}`) : s.format}
                    </span>
                  </span>
                  <ChevronRight size={18} className="cg-chevron" />
                </button>
              );
            })}
          </div>

          <Link to="/home" className="cg-help">
            <BookOpen size={18} style={{ color: "var(--cg-purple-2)", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <strong>Need help?</strong>
              <span>View docs and examples</span>
            </span>
            <ArrowRight size={14} style={{ color: "var(--cg-muted)" }} />
          </Link>
          {isLocal && user && <p className="mt-2 text-[11px]" style={{ color: "var(--cg-dim)" }}>Workspaces are stored in this browser for {user.email}.</p>}
        </aside>

        {/* ── Main ── */}
        <main className="cg-main">
          {hasServices ? (
            <>
              <div className="cg-main-header">
                <div className="cg-title">
                  <h1>{meta.title}</h1>
                  <p>{meta.sub}</p>
                </div>
                {tab === "map" && (
                  <div className="cg-toolbar">
                    <div className="cg-segment" role="radiogroup" aria-label="View">
                      {[["graph", Waypoints, "Graph"], ["list", ListChecks, "List"], ["table", Table2, "Table"]].map(([id, Icon, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={viewMode === id} className={`cg-btn ${viewMode === id ? "active" : ""}`} onClick={() => setViewMode(id)}>
                          <Icon size={13} /> {label}
                        </button>
                      ))}
                    </div>
                    {viewMode === "graph" && (
                      <>
                        <div className="relative" ref={layoutMenuRef}>
                          <button type="button" className="cg-btn" onClick={() => setLayoutMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={layoutMenuOpen}>
                            Layouts <ChevronDown size={13} />
                          </button>
                          {layoutMenuOpen && (
                            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border p-1" style={{ background: "var(--cg-panel-2)", borderColor: "var(--cg-border)" }} role="menu">
                              {LAYOUTS.map((l) => (
                                <button key={l.id} type="button" role="menuitem" onClick={() => { setLayout(l.id); setLayoutMenuOpen(false); }} className={`vz-t flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px] ${layout === l.id ? "bg-vz-accent/12 text-[#e6c4ff]" : "text-vz-soft hover:bg-white/5 hover:text-vz-text"}`}>
                                  {l.label}{layout === l.id && <Check size={12} />}
                                </button>
                              ))}
                              <div className="my-1 border-t" style={{ borderColor: "var(--cg-border)" }} />
                              <button type="button" role="menuitem" onClick={resetPositions} disabled={!Object.keys(positionOverrides).length} className="vz-t flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text disabled:opacity-40">
                                Reset positions
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="cg-zoom" role="group" aria-label="Zoom">
                          <button type="button" className="cg-btn" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} aria-label="Zoom out"><Minus size={13} /></button>
                          <button type="button" className="cg-btn" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
                          <button type="button" className="cg-btn" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} aria-label="Zoom in"><Plus size={13} /></button>
                        </div>
                        <button type="button" className="cg-btn" onClick={() => setFitRequest((n) => n + 1)} title="Bring every service into view"><Scan size={13} /> Fit</button>
                        <button type="button" className="cg-btn icon" onClick={toggleFullscreen} aria-label="Full screen"><Maximize2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {tab === "map" && viewMode === "graph" && (
                <div ref={mapRef} className="flex min-h-0 flex-1 flex-col">
                  <ServiceMap
                    graph={graph}
                    selectedId={selectedId}
                    onSelect={(id) => { setSelectedEdge(null); setSelectedId((cur) => (cur === id ? null : id)); }}
                    selectedEdge={edgeOpen ? selectedEdge : null}
                    onSelectEdge={(edge) => { if (!edge) { setSelectedEdge(null); return; } setSelectedId(null); setSelectedEdge(`${edge.from}|${edge.to}|${edge.kind}`); }}
                    impacted={impacted}
                    highlighted={aiHighlight.ids}
                    highlightReason={aiHighlight.reason}
                    onClearHighlight={() => setAiHighlight({ ids: [], reason: "" })}
                    dimmed={dimmed}
                    layout={layout}
                    zoom={zoom}
                    width={mapSize.w}
                    height={mapSize.h}
                    overrides={positionOverrides}
                    onOverridesChange={moveNode}
                    onZoomChange={setZoom}
                    fitRequest={fitRequest}
                  />
                </div>
              )}
              {tab === "map" && viewMode === "list" && <div className="cg-graph flex flex-col" style={{ backgroundImage: "none" }}><ServicesListView graph={graph} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} /></div>}
              {tab === "map" && viewMode === "table" && <div className="cg-graph flex flex-col" style={{ backgroundImage: "none" }}><OperationsTableView graph={graph} onSelect={(id) => setSelectedId(id)} filter={search} /></div>}
              {tab === "entities" && <div className="cg-scroll pr-1"><EntitiesView graph={graph} /></div>}
              {tab === "duplicates" && <div className="cg-scroll pr-1"><DuplicatesView graph={graph} /></div>}
              {tab === "concepts" && <div className="cg-scroll pr-1"><ConceptsView graph={graph} /></div>}
              {tab === "findings" && <div className="cg-scroll pr-1"><FindingsView graph={graph} /></div>}
            </>
          ) : (
            <div className="cg-empty">
              <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(168,85,247,0.12)", color: "#e6c4ff" }}><Waypoints size={26} /></span>
              <h1 className="mt-5 text-[22px] font-bold" style={{ textWrap: "balance" }}>See your whole API estate on one map</h1>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed" style={{ color: "var(--cg-muted)" }}>
                Add the contracts your teams already have — OpenAPI, Swagger, Postman collections, WSDL — and Contract Graph finds what only shows up between them: entities with more than one shape, duplicated endpoints, one concept under three names, and which services depend on which. Nothing leaves your browser.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="cg-btn primary"><Upload size={14} /> Add spec files</button>
                <button type="button" onClick={loadSample} className="cg-btn"><Sparkles size={14} /> Try the sample estate</button>
              </div>
            </div>
          )}
        </main>

        {/* ── Details ── */}
        {detailsOpen && currentEdge && (
          <EdgeDetails graph={graph} edge={currentEdge} onClose={() => setSelectedEdge(null)} onSelectService={pickService} />
        )}
        {detailsOpen && !currentEdge && (
          <ServiceDetails
            graph={graph}
            serviceId={selectedId}
            impacted={impacted}
            onClose={() => setSelectedId(null)}
            onOpenInExplorer={openInExplorer}
            onReplace={shared ? null : chooseReplacement}
            onRefetch={shared ? null : refetch}
            onDelete={shared ? null : (id) => {
              const svc = active?.services.find((x) => x.id === id);
              if (svc && window.confirm(`Remove "${svc.name}" from this map?`)) remove(id);
            }}
          />
        )}
      </div>

      {showAssistant && hasServices && (
        <AiPanel
          engine={assistantEngine}
          placement="page"
          thread={assistantThread}
          onThreadChange={setAssistantThread}
          onClose={() => setShowAssistant(false)}
        />
      )}
    </div>
  );
};

export default ContractGraphPage;
