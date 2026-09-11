import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import yaml from "js-yaml";
import {
  ZoomIn, ZoomOut, RotateCcw, Search, Play, Share2,
  Check, Link2, Waypoints, Table2, Braces, Save, Activity, Zap, Globe,
  Server, BarChart3, Users, BookOpen, ShieldAlert, Network, GitCompareArrows,
  Wifi, Plus, Download, Scan, FolderOpen, Crosshair, Github, ShieldCheck,
  AlertCircle, Target, Upload, Code2,
} from "lucide-react";
import { GRAPH_STYLES, SAMPLE_DATA } from "./utils/constants";
import { parseCollection, formatLabel } from "./utils/parsers";
import {
  generateShareUrl, generateEmbedSnippet, extractSharedSpec, downloadSpecFile,
} from "./utils/sharing";
import {
  LAYOUT_LABELS, ancestorsOf, buildGroupTree, countSchemas,
} from "./utils/analysis";
import {
  computePositions, fitZoom, measureNodes,
  LOD_ZOOM, MAX_ZOOM, MIN_ZOOM, SCALE_SAFE_AT,
} from "./utils/layout";
import { auditSpec } from "./utils/audit";
import { addRecent, clearRecents, getRecents, loadRecentData } from "./utils/recents";
import BrandMark from "./components/BrandMark";
import ConnectionLines from "./components/ConnectionLines";
import GraphCard from "./components/GraphCard";
import Minimap from "./components/Minimap";
import JsonInputScreen from "./components/JsonInputScreen";
import ApiPlaygroundModal from "./components/ApiPlaygroundModal";
import ExportMenu from "./components/ExportMenu";
import { SaveCollectionModal, CollectionsModal } from "./components/CollectionManager";
import DiffView from "./components/DiffView";
import AutoImportPanel from "./components/AutoImport";
import HealthMonitor from "./components/HealthMonitor";
import FlowBuilder from "./components/FlowBuilder";
import EnvironmentManager from "./components/EnvironmentManager";
import { getEnvironmentForResolution, importEnvironment } from "./utils/environments";
import BreakingChangeDetector from "./components/BreakingChangeDetector";
import DocGenerator from "./components/DocGenerator";
import MultiServiceGraph from "./components/MultiServiceGraph";
import MockServer from "./components/MockServer";
import LoadTester from "./components/LoadTester";
import WorkspaceManager from "./components/WorkspaceManager";
import TopNav from "./components/workspace/TopNav";
import ApiExplorer from "./components/workspace/ApiExplorer";
import GraphToolbar from "./components/workspace/GraphToolbar";
import EndpointInspector from "./components/workspace/EndpointInspector";
import StatusBar from "./components/workspace/StatusBar";
import CommandPalette from "./components/workspace/CommandPalette";
import TableView from "./components/workspace/TableView";
import RawSpecView from "./components/workspace/RawSpecView";
import AuditView from "./components/workspace/AuditView";
import CoverageView from "./components/workspace/CoverageView";
import { PostmanIcon } from "./components/icons/BrandIcons";
import VariableFlowLines from "./components/workspace/VariableFlowLines";
import PostmanConnect from "./components/workspace/PostmanConnect";
import { collectVariables, analyseVariableFlow } from "./utils/variables";
import { curlToCollection, harToCollection, looksLikeCurl, looksLikeHar } from "./utils/importers";
import { isPostmanVariableFile, readPostmanVariableFile } from "./utils/parsers";
import { convertSpec } from "./utils/convert";
import { applyFixes } from "./utils/fixes";

const CENTER_TABS = [
  { id: "map", label: "API Map", icon: Waypoints },
  { id: "table", label: "Table View", icon: Table2 },
  { id: "raw", label: "Raw Spec", icon: Braces },
  { id: "audit", label: "Audit", icon: ShieldCheck },
  { id: "coverage", label: "Coverage", icon: Target },
];

// Past these thresholds the canvas stops doing per-card work that only pays
// off while every card is legible anyway.
const CULL_ABOVE = 220;     // start clipping to the viewport
const ANIMATE_UPTO = 150;   // entrance animation
const HOVER_FOCUS_UPTO = 250; // dim-siblings-on-hover
const VIEWPORT_MARGIN = 600; // graph px kept rendered outside the viewport

const PostmanGraphViewer = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const paperRef = useRef(null);
  const canvasShellRef = useRef(null);
  const searchInputRef = useRef(null);

  const [view, setView] = useState("input");
  const [returnView, setReturnView] = useState("input");
  const [collection, setCollection] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  // Dragged cards override the computed layout. Keyed by a layout signature so
  // a style change or a re-pack drops stale overrides instead of stranding
  // cards at coordinates the new layout never produced.
  const [dragOverrides, setDragOverrides] = useState({ base: null, moved: {} });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [graphStyle, setGraphStyle] = useState("graph");
  const [showPlayground, setShowPlayground] = useState(false);
  const [stats, setStats] = useState({ total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 });
  const [detectedFormat, setDetectedFormat] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [showParticles, setShowParticles] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const [focusedMatchIdx, setFocusedMatchIdx] = useState(0);
  // Phase 1 features
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // Phase 2 features
  const [showAutoImport, setShowAutoImport] = useState(false);
  const [showHealthMonitor, setShowHealthMonitor] = useState(false);
  const [showFlowBuilder, setShowFlowBuilder] = useState(false);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [activeEnvId, setActiveEnvId] = useState(null);
  // Phase 3 features
  const [showDocGenerator, setShowDocGenerator] = useState(false);
  const [showMockServer, setShowMockServer] = useState(false);
  const [showLoadTester, setShowLoadTester] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  // Workspace shell
  const [centerTab, setCenterTab] = useState("map");
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveResponses, setLiveResponses] = useState({});
  const [importedAt, setImportedAt] = useState(null);
  const [recents, setRecents] = useState(() => getRecents());
  // Scroll position of the canvas, tracked so the render set can be clipped
  // to what is actually on screen.
  const [viewport, setViewport] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const [shareState, setShareState] = useState(null);
  // Postman companion state
  const [showPostman, setShowPostman] = useState(false);
  const [pushPayload, setPushPayload] = useState(null);
  const [pushLabel, setPushLabel] = useState("");
  const [pulledEnvironment, setPulledEnvironment] = useState(null);
  const [compare, setCompare] = useState(null);

  const toggleFolderCollapse = useCallback((folderId) => {
    setCollapsedFolders((prev) => { const next = new Set(prev); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next; });
  }, []);

  const isLarge = nodes.length > SCALE_SAFE_AT;

  // Search and method filter, ignoring which groups happen to be collapsed.
  // The table and the list views want every match, not only the ones whose
  // group is open on the map.
  const listNodes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return nodes.filter((n) => {
      const ms =
        !q ||
        n.name.toLowerCase().includes(q) ||
        n.path?.toLowerCase().includes(q);
      const mf =
        filterMethod === "all" || n.method === filterMethod || n.type !== "request";
      return ms && mf;
    });
  }, [nodes, searchQuery, filterMethod]);

  // What the map is allowed to show: the above, minus collapsed children.
  const filteredNodes = useMemo(
    () => listNodes.filter((n) => !(n.parentId && collapsedFolders.has(n.parentId))),
    [listNodes, collapsedFolders],
  );

  // What the layout is computed from. On a large spec the collapsed groups are
  // packed on their own, so the first view is dense instead of a field of
  // holes where the hidden endpoints would have gone.
  const layoutNodes = useMemo(() => {
    if (!isLarge) return nodes;
    return nodes.filter((n) => !(n.parentId && collapsedFolders.has(n.parentId)));
  }, [isLarge, nodes, collapsedFolders]);

  const highlightedIds = useMemo(() => {
    if (!searchQuery) return new Set();
    return new Set(nodes.filter((n) => n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.path?.toLowerCase().includes(searchQuery.toLowerCase())).map((n) => n.id));
  }, [nodes, searchQuery]);

  // Nodes that stay lit while another node is hovered (itself, parent, children)
  const focusSet = useMemo(() => {
    if (!hoveredNodeId || filteredNodes.length > HOVER_FOCUS_UPTO) return null;
    const keep = new Set([hoveredNodeId]);
    const hovered = nodes.find((n) => n.id === hoveredNodeId);
    if (hovered?.parentId) keep.add(hovered.parentId);
    nodes.forEach((n) => { if (n.parentId === hoveredNodeId) keep.add(n.id); });
    return keep;
  }, [hoveredNodeId, nodes, filteredNodes.length]);

  const groups = useMemo(() => buildGroupTree(nodes), [nodes]);
  // An environment pulled from Postman wins over a locally defined one: it is
  // the live value, and it is what the user just chose.
  const activeEnvironment = useMemo(
    () => pulledEnvironment || (activeEnvId ? getEnvironmentForResolution(activeEnvId) : null),
    [pulledEnvironment, activeEnvId],
  );

  const variables = useMemo(
    () => collectVariables({ nodes, environment: activeEnvironment }),
    [nodes, activeEnvironment],
  );

  const variableFlow = useMemo(
    () => analyseVariableFlow(nodes, variables),
    [nodes, variables],
  );

  const audit = useMemo(
    () => auditSpec({ spec: collection, nodes, format: detectedFormat, flow: variableFlow }),
    [collection, nodes, detectedFormat, variableFlow],
  );
  const schemaCount = useMemo(() => countSchemas(collection), [collection]);

  const calculatePositions = useCallback(
    (nodesData) => computePositions(nodesData, graphStyle, { large: isLarge }),
    [graphStyle, isLarge],
  );

  // Layout runs against the currently visible tree, so collapsing a group on a
  // large spec re-packs the map instead of leaving a hole behind.
  const basePositions = useMemo(
    () => calculatePositions(layoutNodes),
    [layoutNodes, calculatePositions],
  );

  const nodePositions = useMemo(() => {
    if (dragOverrides.base !== basePositions) return basePositions;
    if (!Object.keys(dragOverrides.moved).length) return basePositions;
    return { ...basePositions, ...dragOverrides.moved };
  }, [basePositions, dragOverrides]);

  const moveNode = useCallback((nodeId, position) => {
    setDragOverrides((prev) => ({
      base: basePositions,
      moved: {
        ...(prev.base === basePositions ? prev.moved : {}),
        [nodeId]: position,
      },
    }));
  }, [basePositions]);

  // Bounds of what the map is currently showing — drives the paper size, the
  // fit buttons and the minimap.
  const visibleBounds = useMemo(
    () => measureNodes(filteredNodes, nodePositions),
    [filteredNodes, nodePositions],
  );

  // Mirrored into a ref so the deferred auto-fit can read the latest bounds
  // without re-running the layout effect on every collapse toggle.
  const boundsRef = useRef(visibleBounds);
  useEffect(() => {
    boundsRef.current = visibleBounds;
  }, [visibleBounds]);

  // Revealing a node expands its group, which re-packs the layout. The
  // deferred scroll therefore has to read the positions that exist when it
  // runs, not the ones captured when it was scheduled.
  const positionsRef = useRef(nodePositions);
  useEffect(() => {
    positionsRef.current = nodePositions;
  }, [nodePositions]);

  const contentBounds = useMemo(() => {
    if (!visibleBounds) return { w: 1600, h: 900 };
    return { w: visibleBounds.width + 400, h: visibleBounds.height + 300 };
  }, [visibleBounds]);

  // Cards are laid out absolutely across a canvas that can run to thousands of
  // pixels; only the ones near the viewport need to exist in the DOM. Parents
  // of visible cards are kept so their edges still have an anchor.
  const renderNodes = useMemo(() => {
    if (filteredNodes.length <= CULL_ABOVE || !viewport.w) return filteredNodes;

    const left = viewport.left - VIEWPORT_MARGIN;
    const top = viewport.top - VIEWPORT_MARGIN;
    const right = viewport.left + viewport.w + VIEWPORT_MARGIN;
    const bottom = viewport.top + viewport.h + VIEWPORT_MARGIN;

    const keep = new Set();
    filteredNodes.forEach((n) => {
      const p = nodePositions[n.id];
      if (!p) return;
      if (p.x > right || p.y > bottom || p.x + 260 < left || p.y + 110 < top) return;
      keep.add(n.id);
      if (n.parentId) keep.add(n.parentId);
    });
    return filteredNodes.filter((n) => keep.has(n.id));
  }, [filteredNodes, nodePositions, viewport]);

  const simplified = zoom < LOD_ZOOM;
  const animateCards = renderNodes.length <= ANIMATE_UPTO;


  /**
   * Route an import to the right reader before it reaches the parser.
   *
   * A HAR and a Postman environment export are both valid JSON that mean
   * something entirely different from a collection, and pasted cURL is not
   * JSON at all.
   */
  const handleImportText = useCallback((text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    if (looksLikeCurl(trimmed)) return { kind: "collection", data: curlToCollection(trimmed) };
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      try {
        data = yaml.load(trimmed);
      } catch {
        return null;
      }
    }
    if (!data || typeof data !== "object") return null;
    if (looksLikeHar(data)) {
      const { collection: har, stats } = harToCollection(data);
      return { kind: "collection", data: har, note: `${stats.imported} of ${stats.entries} recorded requests kept; ${stats.skipped} assets and ${stats.duplicates} repeats skipped.` };
    }
    if (isPostmanVariableFile(data)) {
      return { kind: "environment", data: readPostmanVariableFile(data) };
    }
    return { kind: "collection", data };
  }, []);

  const handleVisualize = useCallback((data) => {
    const parsed = parseCollection(data, setStats);
    const format = Array.isArray(data) ? "Custom JSON" : formatLabel(data);
    setDetectedFormat(format);
    setCollection(data); setNodes(parsed); setSelectedNode(null); setZoom(1); setPanX(0); setPanY(0);
    setCollapsedFolders(new Set(parsed.filter((n) => n.type === "folder").map((n) => n.id)));
    setSearchQuery(""); setFilterMethod("all"); setCenterTab("map");
    setLiveResponses({});
    setImportedAt(new Date().toISOString());
    setRecents(addRecent({
      name: data?.info?.name || data?.info?.title || data?.name || "API Collection",
      format,
      endpoints: parsed.filter((n) => n.type === "request").length,
      data,
    }));
    setView("graph");
  }, []);

  const handleLoadSample = useCallback((format = "postman") => { handleVisualize(SAMPLE_DATA[format] || SAMPLE_DATA.postman); }, [handleVisualize]);

  // Recent entries only carry metadata; the spec is fetched on demand.
  const handleOpenRecent = useCallback(async (entry) => {
    const data = await loadRecentData(entry);
    if (data) handleVisualize(data);
  }, [handleVisualize]);

  // ── Postman companion ──────────────────────
  // A collection pulled straight from a workspace behaves exactly like one
  // dragged in from a file; the only difference is where it came from.
  const handlePullFromPostman = useCallback((document, name) => {
    handleVisualize(document);
    setPushLabel(name ? `pulled from ${name}` : "");
  }, [handleVisualize]);

  const handlePulledEnvironment = useCallback((environment) => {
    setPulledEnvironment(environment);
    // Keep it for next time too, so a pulled environment behaves like any other.
    const stored = importEnvironment(environment);
    setActiveEnvId(stored.id);
  }, []);

  /** Hand the current collection to the push flow, converted if it is a spec. */
  const openPostmanPush = useCallback(() => {
    if (!nodes.length) return;
    try {
      const text = convertSpec("postman", { spec: collection, nodes }).text;
      setPushPayload(JSON.parse(text));
      setPushLabel(/postman/i.test(detectedFormat) ? "" : `converted from ${detectedFormat}`);
      setShowPostman(true);
    } catch {
      setPushPayload(null);
    }
  }, [collection, nodes, detectedFormat]);

  /** Apply the chosen repairs and reload the workspace from the result. */
  const handleApplyFixes = useCallback((ids) => {
    if (!collection || !ids.length) return;
    const { collection: fixed, changes } = applyFixes(collection, ids);
    handleVisualize(fixed);
    setPushPayload(fixed);
    setPushLabel(`${changes.length} repair${changes.length === 1 ? "" : "s"} applied`);
    setCenterTab("audit");
  }, [collection, handleVisualize]);

  // ── Coverage ───────────────────────────────
  const handleCompareFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = handleImportText(ev.target.result);
      if (!result || result.kind !== "collection") return;
      const parsed = parseCollection(result.data, () => {});
      setCompare({
        nodes: parsed,
        name: result.data?.info?.name || result.data?.info?.title || file.name,
        format: Array.isArray(result.data) ? "Custom JSON" : formatLabel(result.data),
      });
    };
    reader.readAsText(file);
  }, [handleImportText]);

  /** Turn the uncovered endpoints into a collection ready to push. */
  const handleGenerateMissing = useCallback((items, count) => {
    if (!items.length) return;
    setPushPayload({
      info: {
        name: `${collection?.info?.name || collection?.info?.title || "API"} — missing endpoints`,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: items,
    });
    setPushLabel(`${count} endpoint${count === 1 ? "" : "s"} with no request`);
    setShowPostman(true);
  }, [collection]);

  // ── Share link handler ─────────────────────
  // A link carries the whole spec in its query string. Past a few tens of
  // kilobytes that link is rejected by every proxy in the path, so the spec
  // is handed over as a file rather than as a URL nobody can open.
  const handleShare = useCallback(() => {
    if (!collection) return;
    const result = generateShareUrl(collection);
    if (result.ok) {
      navigator.clipboard?.writeText(result.url);
      setShareState(null);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      return;
    }
    setShareState({
      bytes: result.bytes,
      urlLength: result.urlLength || 0,
    });
  }, [collection]);

  /** An <iframe> snippet for a README, a wiki or a pull request. */
  const handleCopyEmbed = useCallback(() => {
    if (!collection) return;
    const result = generateEmbedSnippet(collection);
    if (result.ok) {
      navigator.clipboard?.writeText(result.snippet);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      return;
    }
    setShareState({ bytes: result.bytes, urlLength: result.urlLength || 0 });
  }, [collection]);

  const handleShareDownload = useCallback(() => {
    if (!collection) return;
    downloadSpecFile(
      collection,
      collection?.info?.name || collection?.info?.title || "api-spec",
    );
    setShareState(null);
  }, [collection]);

  // ── Auto-load a shared spec, or the sample the landing page asked for ──
  useEffect(() => {
    const shared = extractSharedSpec();
    if (shared) {
      // Clean URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
      handleVisualize(shared);
      return;
    }
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo && SAMPLE_DATA[demo]) {
      window.history.replaceState({}, "", window.location.pathname);
      handleLoadSample(demo);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit, but only when the spec or the layout actually changed —
  // collapsing a group should re-pack without yanking the viewport.
  const fitSignature = `${graphStyle}|${importedAt || ""}`;
  const lastFitRef = useRef(null);
  useEffect(() => {
    if (nodes.length === 0 || lastFitRef.current === fitSignature) return;
    lastFitRef.current = fitSignature;
    const rippleOn = setTimeout(() => setShowRipple(true), 0);
    const ripple = setTimeout(() => setShowRipple(false), 620);
    const fit = setTimeout(() => {
      const el = canvasRef.current;
      const bounds = boundsRef.current;
      if (!el || !bounds) return;
      const newZoom = fitZoom(bounds, el.offsetWidth, el.offsetHeight, 1.2);
      setZoom(newZoom);
      setPanX(-bounds.minX + 40 / newZoom);
      setPanY(-bounds.minY + 40 / newZoom);
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }, 80);
    return () => {
      clearTimeout(rippleOn);
      clearTimeout(ripple);
      clearTimeout(fit);
    };
  }, [fitSignature, nodes.length]);

  // Stable identity so memoised cards are not invalidated every render.
  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
    setInspectorOpen(true);
  }, []);

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    if (e.button !== 0) return; e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const cur = nodePositions[nodeId]; if (!cur) return;
    const scrollLeft = canvasRef.current?.scrollLeft || 0; const scrollTop = canvasRef.current?.scrollTop || 0;
    setDragOffset({ x: (e.clientX - rect.left + scrollLeft) / zoom - panX - cur.x, y: (e.clientY - rect.top + scrollTop) / zoom - panY - cur.y });
    setDraggedNodeId(nodeId);
  }, [nodePositions, zoom, panX, panY]);

  useEffect(() => {
    if (!draggedNodeId) return;
    const onMove = (e) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const scrollLeft = canvasRef.current?.scrollLeft || 0; const scrollTop = canvasRef.current?.scrollTop || 0; const mx = (e.clientX - rect.left + scrollLeft) / zoom - panX; const my = (e.clientY - rect.top + scrollTop) / zoom - panY; moveNode(draggedNodeId, { x: mx - dragOffset.x, y: my - dragOffset.y }); };
    const onUp = () => setDraggedNodeId(null);
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [draggedNodeId, dragOffset, zoom, panX, panY, moveNode]);

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSidebarOpen(true);
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (showPalette) { setShowPalette(false); return; }
        setSelectedNode(null); setShowPlayground(false);
        return;
      }
      if (showPalette) return;
      if (e.key === "Delete" && !typing) setSearchQuery("");
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (typing) return;
        e.preventDefault(); const s = 24;
        if (e.key === "ArrowUp") setPanY((p) => p + s);
        if (e.key === "ArrowDown") setPanY((p) => p - s);
        if (e.key === "ArrowLeft") setPanX((p) => p + s);
        if (e.key === "ArrowRight") setPanX((p) => p - s);
      }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [showPalette]);

  useEffect(() => {
    if (view !== "graph" || centerTab !== "map") return undefined;
    const el = canvasRef.current; if (!el) return undefined;
    const onWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, [view, centerTab]);

  // Track the visible slice of the canvas in graph coordinates. Coalesced to
  // one update per frame so a scroll gesture costs a single re-render.
  useEffect(() => {
    if (view !== "graph" || centerTab !== "map") return undefined;
    const el = canvasRef.current;
    if (!el) return undefined;

    let frame = 0;
    const read = () => {
      frame = 0;
      setViewport((prev) => {
        const next = {
          left: el.scrollLeft / zoom - panX,
          top: el.scrollTop / zoom - panY,
          w: el.clientWidth / zoom,
          h: el.clientHeight / zoom,
        };
        if (
          Math.abs(next.left - prev.left) < 1 &&
          Math.abs(next.top - prev.top) < 1 &&
          Math.abs(next.w - prev.w) < 1 &&
          Math.abs(next.h - prev.h) < 1
        ) {
          return prev;
        }
        return next;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [view, centerTab, zoom, panX, panY]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const handleReset = () => { setZoom(1); setPanX(0); setPanY(0); };
  const handleFitView = useCallback(() => {
    const el = canvasRef.current;
    if (!visibleBounds || !el) return;
    const newZoom = fitZoom(visibleBounds, el.offsetWidth, el.offsetHeight, 1.4);
    setZoom(newZoom);
    setPanX(-visibleBounds.minX + 40 / newZoom);
    setPanY(-visibleBounds.minY + 40 / newZoom);
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, [visibleBounds]);

  // ── Focus on a single node: zoom in + scroll to center it ──
  const focusOnNode = useCallback((nodeId) => {
    const pos = positionsRef.current[nodeId];
    if (!pos || !canvasRef.current) return;
    const el = canvasRef.current;
    const cW = el.offsetWidth;
    const cH = el.offsetHeight;
    // Zoom to a comfortable level to see the node clearly
    const targetZoom = 1.15;
    setZoom(targetZoom);
    // Pan so the node is centered in the viewport
    setPanX(0);
    setPanY(0);
    // After state updates, scroll to center the node
    requestAnimationFrame(() => {
      const nodeX = pos.x + 120; // approximate card center X
      const nodeY = pos.y + 45;  // approximate card center Y
      el.scrollTo({
        left: nodeX * targetZoom - cW / 2,
        top: nodeY * targetZoom - cH / 2,
        behavior: "smooth",
      });
    });
  }, []);

  // ── Select from a list (explorer, table, palette) and reveal on the map ──
  const selectAndReveal = useCallback((node) => {
    if (!node) return;
    setCollapsedFolders((prev) => {
      if (!prev.size) return prev;
      const chain = ancestorsOf(nodes, node.id);
      if (!chain.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      chain.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedNode(node);
    setInspectorOpen(true);
    setSidebarOpen(false);
    // Runs after the canvas has mounted; focusOnNode no-ops when it has not.
    setTimeout(() => focusOnNode(node.id), 60);
  }, [nodes, focusOnNode]);

  const openPlayground = useCallback(() => {
    const target = selectedNode?.type === "request"
      ? selectedNode
      : nodes.find((n) => n.type === "request");
    if (!target) return;
    if (target !== selectedNode) setSelectedNode(target);
    setShowPlayground(true);
  }, [selectedNode, nodes]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else canvasShellRef.current?.requestFullscreen?.();
  }, []);

  const openTool = useCallback((setter) => {
    setReturnView("graph");
    setter(true);
  }, []);

  const openFullView = useCallback((next) => {
    setReturnView(view);
    setView(next);
  }, [view]);

  // ── Sorted match list (stable order) ──
  const matchList = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return nodes.filter((n) =>
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.path?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [nodes, searchQuery]);

  // ── Reset index when search text changes ──
  useEffect(() => { setFocusedMatchIdx(0); }, [searchQuery]);

  // ── Focus on the currently indexed match ──
  useEffect(() => {
    if (view !== "graph" || centerTab !== "map" || matchList.length === 0) return;
    const idx = Math.min(focusedMatchIdx, matchList.length - 1);
    const target = matchList[idx];
    if (target) {
      setSelectedNode(target);
      const timer = setTimeout(() => focusOnNode(target.id), 120);
      return () => clearTimeout(timer);
    }
  }, [focusedMatchIdx, matchList, view, centerTab, focusOnNode]);

  // ── Navigate matches: Enter = next, Shift+Enter = prev ──
  const handleSearchKeyDown = useCallback((e) => {
    if (matchList.length === 0) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        setFocusedMatchIdx((i) => (i - 1 + matchList.length) % matchList.length);
      } else {
        setFocusedMatchIdx((i) => (i + 1) % matchList.length);
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      setFocusedMatchIdx((i) => (i + 1) % matchList.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      setFocusedMatchIdx((i) => (i - 1 + matchList.length) % matchList.length);
    }
  }, [matchList]);

  // ── Command palette actions (all wired to existing behaviour) ──
  const commands = useMemo(() => [
    { id: "import", group: "Actions", icon: Plus, label: "Import API", hint: "Back to the import screen", keywords: "upload paste url new spec", run: () => setView("input") },
    { id: "search", group: "Actions", icon: Search, label: "Search endpoints", hint: "Ctrl /", keywords: "find filter", run: () => { setSidebarOpen(true); setTimeout(() => searchInputRef.current?.focus(), 30); } },
    { id: "playground", group: "Actions", icon: Play, label: "Open playground", hint: "Send a real request", keywords: "try request http send", run: openPlayground },
    { id: "fit", group: "Canvas", icon: Scan, label: "Fit graph", keywords: "zoom fit all", run: () => { setCenterTab("map"); handleFitView(); } },
    { id: "reset", group: "Canvas", icon: RotateCcw, label: "Reset view", keywords: "zoom 100 pan", run: () => { setCenterTab("map"); handleReset(); } },
    { id: "focus", group: "Canvas", icon: Crosshair, label: "Center selected node", keywords: "focus", run: () => { if (selectedNode) { setCenterTab("map"); focusOnNode(selectedNode.id); } } },
    ...GRAPH_STYLES.map((style) => ({
      id: `layout-${style}`, group: "Layout", icon: Waypoints,
      label: `Switch layout: ${LAYOUT_LABELS[style] || style}`,
      keywords: `graph layout ${style}`,
      run: () => { setCenterTab("map"); setGraphStyle(style); },
    })),
    { id: "view-map", group: "Views", icon: Waypoints, label: "Open API Map", keywords: "graph canvas", run: () => setCenterTab("map") },
    { id: "view-table", group: "Views", icon: Table2, label: "Open Table View", keywords: "list rows", run: () => setCenterTab("table") },
    { id: "view-raw", group: "Views", icon: Braces, label: "Open Raw Spec", keywords: "json source", run: () => setCenterTab("raw") },
    { id: "view-audit", group: "Views", icon: ShieldCheck, label: "Open audit", hint: "Lint, security and quality checks", keywords: "lint score security quality issues", run: () => setCenterTab("audit") },
    { id: "view-coverage", group: "Views", icon: Target, label: "Open coverage", hint: "Compare a spec against a collection", keywords: "coverage missing endpoints gap compare spec collection qa", run: () => setCenterTab("coverage") },
    { id: "postman-open", group: "Tools", icon: Wifi, label: "Open a collection from Postman", hint: "Browse your workspaces", keywords: "postman workspace pull import account api key", run: () => { setPushPayload(null); setShowPostman(true); } },
    { id: "postman-push", group: "Tools", icon: Upload, label: "Send this collection to Postman", hint: "Create or overwrite in a workspace", keywords: "postman push export workspace upload sync", run: openPostmanPush },
    { id: "export", group: "Views", icon: Download, label: "Export or convert", hint: "OpenAPI, Swagger, Postman, PNG, SVG, CSV", keywords: "png svg json yaml download openapi swagger postman convert http csv", run: () => { setCenterTab("map"); setExportOpen(true); } },
    { id: "share", group: "Views", icon: Link2, label: "Copy share link", keywords: "url share", run: handleShare },
    { id: "embed", group: "Views", icon: Code2, label: "Copy embed code", hint: "An iframe for a README or wiki", keywords: "iframe embed readme confluence wiki publish", run: handleCopyEmbed },
    { id: "save", group: "Tools", icon: Save, label: "Save to collections", keywords: "store bookmark", run: () => openTool(setShowSaveModal) },
    { id: "collections", group: "Tools", icon: FolderOpen, label: "My collections", keywords: "saved open", run: () => openTool(setShowCollections) },
    { id: "docs", group: "Tools", icon: BookOpen, label: "Generate docs", keywords: "documentation markdown", run: () => openTool(setShowDocGenerator) },
    { id: "health", group: "Tools", icon: Activity, label: "Health monitor", keywords: "uptime ping", run: () => openTool(setShowHealthMonitor) },
    { id: "flow", group: "Tools", icon: Zap, label: "Test flow builder", keywords: "chain scenario", run: () => openTool(setShowFlowBuilder) },
    { id: "env", group: "Tools", icon: Globe, label: "Environments", keywords: "variables", run: () => openTool(setShowEnvManager) },
    { id: "mock", group: "Tools", icon: Server, label: "Mock server", keywords: "stub fake", run: () => openTool(setShowMockServer) },
    { id: "load", group: "Tools", icon: BarChart3, label: "Load tester", keywords: "benchmark stress", run: () => openTool(setShowLoadTester) },
    { id: "workspace", group: "Tools", icon: Users, label: "Workspaces", keywords: "team", run: () => openTool(setShowWorkspace) },
    { id: "autoimport", group: "Tools", icon: Wifi, label: "Auto-import from URL", keywords: "github sync remote", run: () => openTool(setShowAutoImport) },
    { id: "diff", group: "Tools", icon: GitCompareArrows, label: "API diff", keywords: "compare versions", run: () => openFullView("diff") },
    { id: "breaking", group: "Tools", icon: ShieldAlert, label: "Breaking changes", keywords: "compatibility", run: () => openFullView("breaking") },
    { id: "multi", group: "Tools", icon: Network, label: "Multi-service graph", keywords: "services dependencies", run: () => openFullView("multiservice") },
  ], [openPlayground, handleFitView, handleShare, handleCopyEmbed, focusOnNode, selectedNode, openTool, openFullView, openPostmanPush]);

  const endpointCount = stats.total || nodes.filter((n) => n.type === "request").length;
  const liveResponse = selectedNode ? liveResponses[selectedNode.id] : null;

  const inspector = (
    <EndpointInspector
      key={selectedNode?.id || "empty"}
      node={selectedNode}
      nodes={nodes}
      spec={collection}
      liveResponse={liveResponse}
      variables={variables}
      variableFlow={variableFlow}
      onTest={() => setShowPlayground(true)}
      onSelectNode={selectAndReveal}
      onClose={() => setInspectorOpen(false)}
    />
  );

  const modals = (
    <>
      {showPlayground && selectedNode?.type === "request" && (
        <ApiPlaygroundModal
          node={selectedNode}
          onClose={() => setShowPlayground(false)}
          onUpdate={(nodeId, updates) => {
            setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, ...updates } : n));
            setSelectedNode((prev) => prev?.id === nodeId ? { ...prev, ...updates } : prev);
          }}
          onResponse={(nodeId, result) => setLiveResponses((prev) => ({ ...prev, [nodeId]: result }))}
        />
      )}

      {/* Collection modals */}
      {showSaveModal && collection && (
        <SaveCollectionModal
          data={collection}
          format={detectedFormat}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => {}}
        />
      )}
      {showCollections && (
        <CollectionsModal
          onClose={() => setShowCollections(false)}
          onLoad={(data) => handleVisualize(data)}
        />
      )}

      {/* Phase 2 modals */}
      {showAutoImport && (
        <AutoImportPanel
          onImport={(data) => handleVisualize(data)}
          onClose={() => setShowAutoImport(false)}
        />
      )}
      {showHealthMonitor && (
        <HealthMonitor nodes={nodes} onClose={() => setShowHealthMonitor(false)} />
      )}
      {showFlowBuilder && (
        <FlowBuilder nodes={nodes} onClose={() => setShowFlowBuilder(false)} />
      )}
      {showPostman && (
        <PostmanConnect
          onClose={() => { setShowPostman(false); setPushPayload(null); }}
          onLoadCollection={handlePullFromPostman}
          onLoadEnvironment={handlePulledEnvironment}
          pushPayload={pushPayload}
          pushLabel={pushLabel}
        />
      )}
      {showEnvManager && (
        <EnvironmentManager
          activeEnvId={activeEnvId}
          onSelectEnv={setActiveEnvId}
          onClose={() => setShowEnvManager(false)}
        />
      )}

      {/* Phase 3 modals */}
      {showDocGenerator && collection && (
        <DocGenerator collection={collection} onBack={() => setShowDocGenerator(false)} />
      )}
      {showMockServer && collection && (
        <MockServer collection={collection} onClose={() => setShowMockServer(false)} />
      )}
      {showLoadTester && (
        <LoadTester nodes={nodes} onClose={() => setShowLoadTester(false)} />
      )}
      {showWorkspace && (
        <WorkspaceManager onClose={() => setShowWorkspace(false)} />
      )}

      <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,.har" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { const result = handleImportText(ev.target.result); if (!result) return; if (result.kind === "environment") { handlePulledEnvironment(result.data); return; } handleVisualize(result.data); }; reader.readAsText(file); e.target.value = ""; }} />
    </>
  );

  // ─── Workspace (after a spec is parsed) ───────────────────────
  if (view === "graph") {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-vz-bg text-vz-text">
        <TopNav
          onNavigateHome={() => navigate("/")}
          onOpenPalette={() => setShowPalette(true)}
          onOpenCollections={() => openTool(setShowCollections)}
          onOpenDocs={() => openTool(setShowDocGenerator)}
          onOpenGithubImport={() => openTool(setShowAutoImport)}
          onOpenWorkspaceManager={() => openTool(setShowWorkspace)}
          onOpenEnvManager={() => openTool(setShowEnvManager)}
          onResetView={() => { setCenterTab("map"); handleReset(); }}
          onGoWorkspace={() => setCenterTab("map")}
          recents={recents}
          onOpenRecent={handleOpenRecent}
          onClearRecents={() => setRecents(clearRecents())}
          showParticles={showParticles}
          onToggleParticles={() => setShowParticles((v) => !v)}
          showMinimap={showMinimap}
          onToggleMinimap={() => setShowMinimap((v) => !v)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
        />

        <div className="relative flex min-h-0 flex-1 gap-2.5 overflow-hidden p-2.5">
          {sidebarOpen && (
            <div className="fixed inset-0 z-[35] bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          {inspectorOpen && (
            <div className="fixed inset-0 z-[35] bg-black/50 xl:hidden" onClick={() => setInspectorOpen(false)} />
          )}

          {/* Explorer */}
          <aside
            className={`z-40 w-[300px] flex-shrink-0 flex-col overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel ${
              sidebarOpen ? "fixed bottom-[50px] left-2.5 top-[70px] flex" : "hidden"
            } lg:relative lg:inset-auto lg:flex xl:w-[312px]`}
          >
            <ApiExplorer
              key={importedAt || "explorer"}
              collection={collection}
              detectedFormat={detectedFormat}
              nodes={nodes}
              groups={groups}
              endpointCount={endpointCount}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchKeyDown={handleSearchKeyDown}
              searchInputRef={searchInputRef}
              matchCount={matchList.length}
              matchIndex={focusedMatchIdx}
              selectedNodeId={selectedNode?.id}
              onSelectNode={selectAndReveal}
              onImport={() => setView("input")}
              recents={recents}
              onOpenRecent={handleOpenRecent}
              onSeeAllRecents={() => openTool(setShowCollections)}
            />
          </aside>

          {/* Centre workspace */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel">
            <div className="flex h-[56px] flex-shrink-0 items-center justify-between gap-3 border-b border-vz-line-soft px-3">
              <div className="vz-scroll flex min-w-0 items-center gap-1 overflow-x-auto rounded-[9px] border border-vz-line-soft bg-vz-bg p-1">
                {CENTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCenterTab(tab.id)}
                    title={tab.label}
                    aria-label={tab.label}
                    className={`vz-t flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-[7px] text-[12px] ${
                      centerTab === tab.id
                        ? "bg-vz-accent/18 text-vz-text"
                        : "text-vz-soft hover:text-vz-text"
                    }`}
                  >
                    <tab.icon size={13} className="flex-shrink-0" />
                    <span
                      className={centerTab === tab.id ? "hidden sm:inline" : "hidden 2xl:inline"}
                    >
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={openPlayground}
                  className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] font-medium text-vz-soft hover:text-vz-text"
                >
                  <Play size={14} className="flex-shrink-0" />
                  <span className="hidden 2xl:inline">Playground</span>
                </button>

                <button
                  type="button"
                  onClick={openPostmanPush}
                  title="Open a collection from Postman, or send this one back"
                  className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] font-medium text-vz-soft hover:text-vz-text"
                >
                  <PostmanIcon size={14} className="flex-shrink-0 text-[#ff6c37]" />
                  <span className="hidden 2xl:inline">Postman</span>
                </button>

                <ExportMenu
                  nodes={filteredNodes}
                  allNodes={nodes}
                  positions={nodePositions}
                  graphStyle={graphStyle}
                  graphTitle={collection?.info?.name || collection?.info?.title || "API Graph"}
                  spec={collection}
                  sourceFormat={detectedFormat}
                  open={exportOpen}
                  onOpenChange={setExportOpen}
                />

                <div className="relative">
                  <button
                    type="button"
                    onClick={handleShare}
                    className={`vz-t flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold ${
                      shareCopied
                        ? "bg-vz-green/15 text-vz-green"
                        : "bg-gradient-to-r from-[#a855f7] to-[#c45cff] text-[#160a1d] hover:opacity-90"
                    }`}
                  >
                    {shareCopied ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Share</>}
                  </button>

                  {shareState && (
                    <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-xl border border-vz-line bg-vz-panel p-3.5 shadow-2xl shadow-black/50">
                      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-vz-soft">
                        <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-vz-warn" />
                        <span>
                          This specification is{" "}
                          <strong className="text-vz-text">
                            {(shareState.bytes / 1_048_576).toFixed(1)} MB
                          </strong>
                          {" "}— too large to travel in a link. Send the file instead.
                        </span>
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleShareDownload}
                          className="vz-t flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-vz-accent/18 text-[12.5px] font-semibold text-vz-text hover:bg-vz-accent/26"
                        >
                          <Download size={13} /> Download spec
                        </button>
                        <button
                          type="button"
                          onClick={() => setShareState(null)}
                          className="vz-t h-8 rounded-lg border border-vz-line px-3 text-[12.5px] text-vz-soft hover:text-vz-text"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              {centerTab === "map" ? (
                <div ref={canvasShellRef} className="vz-canvas-shell absolute inset-0 overflow-hidden bg-[#0a0e16]">
                  <GraphToolbar
                    graphStyle={graphStyle}
                    onChangeStyle={setGraphStyle}
                    zoom={zoom}
                    onFit={handleFitView}
                    onResetZoom={handleReset}
                    onFocusSelected={() => selectedNode && focusOnNode(selectedNode.id)}
                    canFocus={!!selectedNode}
                    onToggleFullscreen={toggleFullscreen}
                    isFullscreen={isFullscreen}
                    filterMethod={filterMethod}
                    onFilterMethod={setFilterMethod}
                    stats={stats}
                  />

                  <div
                    ref={canvasRef}
                    className="absolute inset-0 overflow-auto vz-scroll"
                    onClick={(e) => { if (e.target === canvasRef.current || e.target === paperRef.current) setSelectedNode(null); }}
                  >
                    <div
                      ref={paperRef}
                      className="relative"
                      style={{
                        width: contentBounds.w * zoom,
                        height: contentBounds.h * zoom,
                        minWidth: "100%",
                        minHeight: "100%",
                        backgroundColor: "#0a0e16",
                        backgroundImage: showGrid
                          ? "radial-gradient(circle, rgba(115,125,150,0.22) 1px, transparent 1px)"
                          : "none",
                        backgroundSize: `${21 * zoom}px ${21 * zoom}px`,
                      }}
                    >
                      {showRipple && nodePositions["node-root"] && (
                        <div className="pointer-events-none absolute" style={{
                          left: (nodePositions["node-root"].x + 112 + panX) * zoom,
                          top: (nodePositions["node-root"].y + 50 + panY) * zoom,
                          width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: "50%",
                          border: "2px solid rgba(168,85,247,0.25)", animation: "ripple 0.6s ease-out both", zIndex: 5,
                        }} />
                      )}

                      <div className="pointer-events-none absolute inset-0" style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "0 0" }}>
                        <ConnectionLines
                          nodes={renderNodes}
                          nodePositions={nodePositions}
                          graphStyle={graphStyle}
                          showParticles={showParticles}
                          activeId={hoveredNodeId || selectedNode?.id || null}
                        />
                        <VariableFlowLines
                          nodes={renderNodes}
                          nodePositions={nodePositions}
                          flow={variableFlow}
                          selectedId={selectedNode?.type === "request" ? selectedNode.id : null}
                        />
                      </div>

                      <div className="pointer-events-none absolute inset-0" style={{
                        transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "0 0",
                        transition: draggedNodeId ? "none" : "transform 0.15s cubic-bezier(0.2,0,0,1)",
                      }}>
                        {renderNodes.map((node, idx) => {
                          const pos = nodePositions[node.id];
                          if (!pos) return null;
                          return (
                            <GraphCard key={node.id} node={node} position={pos}
                              isSelected={selectedNode?.id === node.id} isDragging={draggedNodeId === node.id}
                              isHighlighted={highlightedIds.has(node.id)} isCollapsed={collapsedFolders.has(node.id)}
                              isDimmed={focusSet ? !focusSet.has(node.id) : false}
                              simplified={simplified}
                              animate={animateCards}
                              entranceDelay={animateCards ? Math.min(idx * 12, 220) : 0}
                              onMouseDown={handleNodeMouseDown}
                              onSelect={handleSelectNode}
                              onHoverChange={filteredNodes.length <= HOVER_FOCUS_UPTO ? setHoveredNodeId : undefined}
                              onToggleCollapse={node.type === "folder" ? toggleFolderCollapse : undefined} />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {showMinimap && (
                    <Minimap nodes={filteredNodes} nodePositions={nodePositions} canvasRef={canvasRef}
                      zoom={zoom} panX={panX} panY={panY} selectedId={selectedNode?.id}
                      viewportRect={viewport} />
                  )}

                  <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5">
                    <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))} title="Zoom in"
                      className="vz-t grid h-9 w-9 place-items-center rounded-lg border border-vz-line bg-vz-panel/92 text-vz-soft backdrop-blur hover:text-vz-text">
                      <ZoomIn size={15} />
                    </button>
                    <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))} title="Zoom out"
                      className="vz-t grid h-9 w-9 place-items-center rounded-lg border border-vz-line bg-vz-panel/92 text-vz-soft backdrop-blur hover:text-vz-text">
                      <ZoomOut size={15} />
                    </button>
                    <button type="button" onClick={handleReset} title="Reset view"
                      className="vz-t grid h-9 w-9 place-items-center rounded-lg border border-vz-line bg-vz-panel/92 text-vz-soft backdrop-blur hover:text-vz-text">
                      <RotateCcw size={15} />
                    </button>
                  </div>

                  {filteredNodes.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Search size={34} className="mx-auto mb-3 text-vz-line" />
                        <p className="text-[13px] text-vz-dim">No nodes match the current search or filter</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : centerTab === "table" ? (
                <div className="absolute inset-0">
                  <TableView
                    nodes={listNodes}
                    selectedNodeId={selectedNode?.id}
                    onSelectNode={(n) => { setSelectedNode(n); setInspectorOpen(true); }}
                    onShowInMap={(n) => { setCenterTab("map"); selectAndReveal(n); }}
                  />
                </div>
              ) : centerTab === "coverage" ? (
                <div className="absolute inset-0">
                  <CoverageView
                    nodes={nodes}
                    detectedFormat={detectedFormat}
                    variables={variables}
                    compareNodes={compare?.nodes || null}
                    compareName={compare?.name || ""}
                    compareFormat={compare?.format || ""}
                    onPickFile={handleCompareFile}
                    onClearCompare={() => setCompare(null)}
                    onSelectNode={(n) => { setCenterTab("map"); selectAndReveal(n); }}
                    onGenerate={handleGenerateMissing}
                  />
                </div>
              ) : centerTab === "audit" ? (
                <div className="absolute inset-0">
                  <AuditView
                    audit={audit}
                    nodes={nodes}
                    collection={collection}
                    onApplyFixes={handleApplyFixes}
                    onSelectNode={(n) => { setCenterTab("map"); selectAndReveal(n); }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0">
                  <RawSpecView spec={collection} title={collection?.info?.name || collection?.info?.title || "spec"} />
                </div>
              )}
            </div>
          </section>

          {/* Inspector */}
          <aside
            className={`z-40 w-[330px] flex-shrink-0 flex-col overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel ${
              inspectorOpen ? "fixed bottom-[50px] right-2.5 top-[70px] flex" : "hidden"
            } xl:relative xl:inset-auto xl:flex`}
          >
            {inspector}
          </aside>
        </div>

        <StatusBar
          endpointCount={endpointCount}
          schemaCount={schemaCount}
          warnings={audit.findings}
          score={audit.score}
          onOpenAudit={() => setCenterTab("audit")}
          detectedFormat={detectedFormat}
          importedAt={importedAt}
          activeEnvName={activeEnvironment?.name || null}
          onSelectWarning={(w) => {
            const node = nodes.find((n) => n.id === w.nodeId);
            if (node) { setCenterTab("map"); selectAndReveal(node); }
          }}
        />

        {showPalette && (
          <CommandPalette
            onClose={() => setShowPalette(false)}
            commands={commands}
            endpoints={nodes}
            onSelectEndpoint={selectAndReveal}
          />
        )}

        {modals}
      </div>
    );
  }

  // ─── Import screen and the full-page tools ────────────────────
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-vz-bg text-vz-text">
      <header className="relative z-50 flex h-[60px] flex-shrink-0 items-center justify-between gap-4 border-b border-vz-line-soft bg-vz-bg px-4 sm:px-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          title="Back to the Vizroute home page"
          className="vz-t flex items-center gap-2 rounded-lg px-1 py-0.5 hover:opacity-80"
        >
          <BrandMark size={24} />
          <span className="text-[17px] font-bold tracking-tight text-vz-text">
            Vizroute
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCollections(true)}
            className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel px-3 text-[13px] text-vz-soft hover:text-vz-text"
          >
            <FolderOpen size={14} />
            <span className="hidden sm:inline">Collections</span>
          </button>
          <a
            href="https://github.com/SagarKapase/snap-map"
            target="_blank"
            rel="noreferrer noopener"
            className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel px-3 text-[13px] text-vz-soft hover:text-vz-text"
          >
            <Github size={14} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          {nodes.length > 0 && (
            <button
              type="button"
              onClick={() => setView("graph")}
              className="vz-t flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-3.5 text-[13px] font-semibold text-[#160a1d] hover:opacity-90"
            >
              <Waypoints size={14} /> Back to map
            </button>
          )}
        </div>
      </header>

      {view === "input" ? (
        <JsonInputScreen
          onVisualize={handleVisualize}
          onLoadSample={handleLoadSample}
          onOpenCollections={() => setShowCollections(true)}
          onOpenDiff={() => openFullView("diff")}
          onOpenAutoImport={() => setShowAutoImport(true)}
          onOpenBreaking={() => openFullView("breaking")}
          onOpenMultiService={() => openFullView("multiservice")}
        />
      ) : view === "diff" ? (
        <DiffView onBack={() => setView(returnView)} />
      ) : view === "breaking" ? (
        <BreakingChangeDetector onBack={() => setView(returnView)} />
      ) : (
        <MultiServiceGraph onBack={() => setView(returnView)} />
      )}

      {modals}
    </div>
  );
};

export default PostmanGraphViewer;
