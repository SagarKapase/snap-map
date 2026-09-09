import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import yaml from "js-yaml";
import {
  ZoomIn, ZoomOut, RotateCcw, Search, Play, Share2,
  Check, Link2, Waypoints, Table2, Braces, Save, Activity, Zap, Globe,
  Server, BarChart3, Users, BookOpen, ShieldAlert, Network, GitCompareArrows,
  Wifi, Plus, Download, Scan, FolderOpen, Crosshair, Github, ShieldCheck,
} from "lucide-react";
import { GRAPH_STYLES, SAMPLE_DATA } from "./utils/constants";
import { parseCollection, formatLabel } from "./utils/parsers";
import { generateShareUrl, extractSharedSpec } from "./utils/sharing";
import {
  LAYOUT_LABELS, ancestorsOf, buildGroupTree, countSchemas,
} from "./utils/analysis";
import { auditSpec } from "./utils/audit";
import { addRecent, clearRecents, getRecents } from "./utils/recents";
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

const CENTER_TABS = [
  { id: "map", label: "API Map", icon: Waypoints },
  { id: "table", label: "Table View", icon: Table2 },
  { id: "raw", label: "Raw Spec", icon: Braces },
  { id: "audit", label: "Audit", icon: ShieldCheck },
];

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
  const [nodePositions, setNodePositions] = useState({});
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

  const toggleFolderCollapse = useCallback((folderId) => {
    setCollapsedFolders((prev) => { const next = new Set(prev); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next; });
  }, []);

  const filteredNodes = useMemo(() => nodes.filter((n) => {
    if (n.parentId && collapsedFolders.has(n.parentId)) return false;
    const ms = n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.path?.toLowerCase().includes(searchQuery.toLowerCase());
    const mf = filterMethod === "all" || n.method === filterMethod || n.type !== "request";
    return ms && mf;
  }), [nodes, searchQuery, filterMethod, collapsedFolders]);

  const highlightedIds = useMemo(() => {
    if (!searchQuery) return new Set();
    return new Set(nodes.filter((n) => n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.path?.toLowerCase().includes(searchQuery.toLowerCase())).map((n) => n.id));
  }, [nodes, searchQuery]);

  // Nodes that stay lit while another node is hovered (itself, parent, children)
  const focusSet = useMemo(() => {
    if (!hoveredNodeId) return null;
    const keep = new Set([hoveredNodeId]);
    const hovered = nodes.find((n) => n.id === hoveredNodeId);
    if (hovered?.parentId) keep.add(hovered.parentId);
    nodes.forEach((n) => { if (n.parentId === hoveredNodeId) keep.add(n.id); });
    return keep;
  }, [hoveredNodeId, nodes]);

  const groups = useMemo(() => buildGroupTree(nodes), [nodes]);
  const audit = useMemo(
    () => auditSpec({ spec: collection, nodes, format: detectedFormat }),
    [collection, nodes, detectedFormat],
  );
  const schemaCount = useMemo(() => countSchemas(collection), [collection]);

  // Positions are computed for every node, but collapsed children are not
  // rendered — bounds, fit and the minimap must follow the visible set only.
  const visiblePositions = useMemo(
    () => filteredNodes.map((n) => nodePositions[n.id]).filter(Boolean),
    [filteredNodes, nodePositions],
  );

  // Mirrored into a ref so the deferred auto-fit can read the latest visible
  // set without re-running the layout effect on every collapse toggle.
  const visibleRef = useRef(visiblePositions);
  useEffect(() => {
    visibleRef.current = visiblePositions;
  }, [visiblePositions]);

  const contentBounds = useMemo(() => {
    const positions = visiblePositions;
    if (!positions.length) return { w: 1600, h: 900 };
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x));
    const maxY = Math.max(...positions.map((p) => p.y));
    return { w: (maxX - minX) + 600, h: (maxY - minY) + 400 };
  }, [visiblePositions]);

  const calculatePositions = useCallback((nodesData) => {
    const pos = {};
    const root = nodesData.find((n) => n.type === "root");
    if (!root) return pos;
    pos[root.id] = { x: 120, y: 300 };
    const rootFolders = nodesData.filter((n) => n.parentId === root.id && n.type === "folder");
    const rootRequests = nodesData.filter((n) => n.parentId === root.id && n.type === "request");
    const isFlatCollection = rootFolders.length === 0 && rootRequests.length > 0;

    if (graphStyle === "tree") {
      // ── Top-down vertical tree layout ────────────────────
      // Root at top-center, children spread horizontally below
      const CARD_H = { root: 110, folder: 80, request: 85 };
      const CARD_W = { root: 240, folder: 208, request: 256 };
      const SIBLING_GAP = 24;   // horizontal gap between sibling subtrees
      const LEVEL_GAP = 60;     // vertical gap between card bottom → child top
      const TREE_PAD_Y = 50;    // top padding

      // Build children lookup
      const childrenOf = {};
      nodesData.forEach((n) => {
        if (n.parentId) {
          if (!childrenOf[n.parentId]) childrenOf[n.parentId] = [];
          childrenOf[n.parentId].push(n);
        }
      });

      // 1. Bottom-up: calculate the horizontal width each subtree needs
      const subtreeWidth = {};
      const calcSubtreeW = (nodeId) => {
        if (subtreeWidth[nodeId] !== undefined) return subtreeWidth[nodeId];
        const nd = nodesData.find((n) => n.id === nodeId);
        const w = CARD_W[nd?.type || "request"];
        const children = childrenOf[nodeId] || [];
        if (children.length === 0) {
          subtreeWidth[nodeId] = w;
          return w;
        }
        const totalChildW = children.reduce((sum, ch) => sum + calcSubtreeW(ch.id), 0)
          + (children.length - 1) * SIBLING_GAP;
        // Subtree is at least as wide as the node itself
        subtreeWidth[nodeId] = Math.max(totalChildW, w);
        return subtreeWidth[nodeId];
      };
      calcSubtreeW(root.id);

      // 2. Top-down: position nodes, centering parents above children
      const placeNode = (nodeId, xCenter, y) => {
        const nd = nodesData.find((n) => n.id === nodeId);
        const w = CARD_W[nd?.type || "request"];
        const h = CARD_H[nd?.type || "request"];
        const children = childrenOf[nodeId] || [];

        // Place this node centered at xCenter
        pos[nodeId] = { x: xCenter - w / 2, y };

        if (children.length === 0) return;

        // Calculate total width of children subtrees
        const totalChildW = children.reduce((sum, ch) => sum + subtreeWidth[ch.id], 0)
          + (children.length - 1) * SIBLING_GAP;

        // Start X: center the children block under this node
        let cx = xCenter - totalChildW / 2;
        const childY = y + h + LEVEL_GAP;

        children.forEach((ch) => {
          const chSubW = subtreeWidth[ch.id];
          // Place child centered in its subtree allocation
          placeNode(ch.id, cx + chSubW / 2, childY);
          cx += chSubW + SIBLING_GAP;
        });
      };

      // Start: center root horizontally based on total subtree width
      const totalW = subtreeWidth[root.id];
      placeNode(root.id, totalW / 2 + 60, TREE_PAD_Y);
    } else if (graphStyle === "flowchart") {
      let y = 60;
      if (isFlatCollection) { rootRequests.forEach((node) => { pos[node.id] = { x: 440, y }; y += 110; }); pos[root.id] = { x: 120, y: Math.max(0, (y - 110) / 2 - 30) }; }
      else { rootFolders.forEach((node) => { pos[node.id] = { x: 420, y }; let childY = y - 30; nodesData.forEach((child) => { if (child.parentId !== node.id) return; pos[child.id] = { x: 740, y: childY }; childY += 110; }); y += Math.max(180, nodesData.filter((c) => c.parentId === node.id).length * 110 + 40); }); rootRequests.forEach((node) => { pos[node.id] = { x: 420, y }; y += 110; }); }
    } else if (graphStyle === "radial") {
      // ── Concentric-ring radial layout ────────────────────
      // Root at center, folders in ring 1, each folder's requests arc in ring 2
      const RW = { root: 240, folder: 208, request: 256 };
      const RH = { root: 110, folder: 80, request: 85 };
      const CX = 800, CY = 550;

      pos[root.id] = { x: CX - RW.root / 2, y: CY - RH.root / 2 };

      if (isFlatCollection) {
        // No folders — requests orbit root directly
        const r = Math.max(280, rootRequests.length * 50);
        rootRequests.forEach((node, i) => {
          const a = (i / rootRequests.length) * Math.PI * 2 - Math.PI / 2;
          pos[node.id] = {
            x: CX + Math.cos(a) * r - RW.request / 2,
            y: CY + Math.sin(a) * r - RH.request / 2,
          };
        });
      } else {
        // Ring 1: folders (+ bare requests treated as ring items)
        const ringItems = [...rootFolders, ...rootRequests];
        const ringCount = ringItems.length || 1;
        const R1 = Math.max(300, ringCount * 55);

        // Pre-calculate how much angular space each ring item needs
        // Folders with children need more arc, bare requests need minimal
        const childCounts = ringItems.map((item) =>
          item.type === "folder" ? nodesData.filter((c) => c.parentId === item.id).length : 0,
        );
        const totalWeight = childCounts.reduce((s, c) => s + Math.max(1, c), 0);

        let currentAngle = -Math.PI / 2; // start from top

        ringItems.forEach((item, i) => {
          const weight = Math.max(1, childCounts[i]);
          const arcSize = (weight / totalWeight) * Math.PI * 2;
          const itemAngle = currentAngle + arcSize / 2; // center of this item's arc

          const ix = CX + Math.cos(itemAngle) * R1;
          const iy = CY + Math.sin(itemAngle) * R1;
          const w = RW[item.type] || RW.request;
          const h = RH[item.type] || RH.request;
          pos[item.id] = { x: ix - w / 2, y: iy - h / 2 };

          // Ring 2: fan children outward from this folder
          if (item.type === "folder") {
            const children = nodesData.filter((c) => c.parentId === item.id);
            if (children.length > 0) {
              const R2 = Math.max(200, children.length * 26);
              // Fan within this item's arc allocation (with padding)
              const fanArc = arcSize * 0.8;
              children.forEach((child, ci) => {
                const ca = children.length === 1
                  ? itemAngle
                  : itemAngle - fanArc / 2 + (ci / (children.length - 1)) * fanArc;
                pos[child.id] = {
                  x: ix + Math.cos(ca) * R2 - RW.request / 2,
                  y: iy + Math.sin(ca) * R2 - RH.request / 2,
                };
              });
            }
          }

          currentAngle += arcSize;
        });
      }
    } else if (graphStyle === "graph") {
      // ── Clustered orbital graph layout ───────────────────
      // Root at center → folders in a ring → requests fan outward from each folder
      const CW = { root: 240, folder: 208, request: 256 };
      const CH = { root: 110, folder: 80, request: 85 };
      const CX = 750, CY = 500;

      // Place root at dead center
      pos[root.id] = { x: CX - CW.root / 2, y: CY - CH.root / 2 };

      // All direct children of root form the orbital ring
      const ringItems = nodesData.filter((n) => n.parentId === root.id);
      const ringCount = ringItems.length || 1;

      // Adaptive ring radius: more items = bigger ring
      const R_RING = Math.max(300, ringCount * 55);

      ringItems.forEach((item, i) => {
        // Evenly distribute around the circle, starting from top (−π/2)
        const angle = (i / ringCount) * Math.PI * 2 - Math.PI / 2;
        const ix = CX + Math.cos(angle) * R_RING;
        const iy = CY + Math.sin(angle) * R_RING;
        const w = CW[item.type] || CW.request;
        const h = CH[item.type] || CH.request;
        pos[item.id] = { x: ix - w / 2, y: iy - h / 2 };

        // If this ring item is a folder, fan its children outward
        if (item.type === "folder") {
          const children = nodesData.filter((c) => c.parentId === item.id);
          if (children.length === 0) return;

          // Orbit radius and fan angle are derived together so that adjacent
          // children always sit ~one card width apart along the arc.
          const CHILD_PITCH = 270;
          const R_CHILD = Math.max(320, children.length * 120);
          const fanSpread =
            children.length > 1
              ? Math.min(Math.PI * 0.8, (children.length * CHILD_PITCH) / R_CHILD)
              : 0;

          children.forEach((child, ci) => {
            // Single child goes straight out; multiple children fan symmetrically
            const ca =
              children.length === 1
                ? angle
                : angle - fanSpread / 2 + (ci / (children.length - 1)) * fanSpread;

            const rx = ix + Math.cos(ca) * R_CHILD;
            const ry = iy + Math.sin(ca) * R_CHILD;
            pos[child.id] = { x: rx - CW.request / 2, y: ry - CH.request / 2 };
          });
        }
      });
    } else {
      // mindmap
      const CHILD_STEP = 94, GROUP_GAP = 68, ROOT_X = 660, FOLD_X_L = 360, CHILD_X_L = 40, FOLD_X_R = 956, CHILD_X_R = 1228;
      if (isFlatCollection) { const lefts = rootRequests.filter((_, i) => i % 2 === 0); const rights = rootRequests.filter((_, i) => i % 2 !== 0); const totalH = Math.max(lefts.length, rights.length) * CHILD_STEP + GROUP_GAP; pos[root.id] = { x: ROOT_X, y: totalH / 2 - 44 }; lefts.forEach((node, i) => { pos[node.id] = { x: CHILD_X_L, y: i * CHILD_STEP }; }); rights.forEach((node, i) => { pos[node.id] = { x: CHILD_X_R, y: i * CHILD_STEP }; }); }
      else { const lefts = [], rights = []; rootFolders.forEach((n, fi) => (fi % 2 === 0 ? lefts : rights).push(n)); const numChildren = (f) => nodesData.filter((c) => c.parentId === f.id).length; const groupH = (f) => Math.max(1, numChildren(f)) * CHILD_STEP + GROUP_GAP; const totalH = (arr) => arr.reduce((s, f) => s + groupH(f), 0); const maxH = Math.max(totalH(lefts), totalH(rights), 260); pos[root.id] = { x: ROOT_X, y: maxH / 2 - 44 }; const placeGroup = (arr, folderX, childX) => { let y = 0; arr.forEach((folder) => { const children = nodesData.filter((c) => c.parentId === folder.id); const gh = groupH(folder); const usable = gh - GROUP_GAP; pos[folder.id] = { x: folderX, y: y + usable / 2 - 40 }; const span = (children.length - 1) * CHILD_STEP; const start = y + usable / 2 - span / 2 - 44; children.forEach((child, ci) => { pos[child.id] = { x: childX, y: start + ci * CHILD_STEP }; }); y += gh; }); }; placeGroup(lefts, FOLD_X_L, CHILD_X_L); placeGroup(rights, FOLD_X_R, CHILD_X_R); rootRequests.forEach((node, i) => { pos[node.id] = { x: CHILD_X_R, y: totalH(rights) + i * CHILD_STEP }; }); }
    }

    // ── Normalize: shift all positions so nothing is negative + add padding ──
    const allPos = Object.values(pos);
    if (allPos.length > 0) {
      const PAD = 50;
      const minX = Math.min(...allPos.map((p) => p.x));
      const minY = Math.min(...allPos.map((p) => p.y));
      if (minX < PAD || minY < PAD) {
        const shiftX = minX < PAD ? PAD - minX : 0;
        const shiftY = minY < PAD ? PAD - minY : 0;
        Object.keys(pos).forEach((id) => {
          pos[id] = { x: pos[id].x + shiftX, y: pos[id].y + shiftY };
        });
      }
    }

    return pos;
  }, [graphStyle]);

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

  // ── Share link handler ─────────────────────
  const handleShare = useCallback(() => {
    if (!collection) return;
    const url = generateShareUrl(collection);
    if (url) {
      navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
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

  useEffect(() => {
    if (nodes.length > 0) {
      const newPos = calculatePositions(nodes);
      setNodePositions(newPos);
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 600);
      // Auto-fit view after layout change so all nodes are visible
      setTimeout(() => {
        if (!canvasRef.current) return;
        const positions = visibleRef.current.length
          ? visibleRef.current
          : Object.values(newPos);
        if (!positions.length) return;
        const minX = Math.min(...positions.map((p) => p.x));
        const minY = Math.min(...positions.map((p) => p.y));
        const maxX = Math.max(...positions.map((p) => p.x)) + 280;
        const maxY = Math.max(...positions.map((p) => p.y)) + 120;
        const cW = canvasRef.current.offsetWidth;
        const cH = canvasRef.current.offsetHeight;
        const fitted = Math.min(cW / (maxX - minX + 80), cH / (maxY - minY + 80), 1.2);
        const newZoom = Math.max(fitted, 0.4);
        setZoom(newZoom);
        setPanX(-minX + 40 / newZoom);
        setPanY(-minY + 40 / newZoom);
        canvasRef.current.scrollLeft = 0;
        canvasRef.current.scrollTop = 0;
      }, 60);
    }
  }, [graphStyle, nodes, calculatePositions]);

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
    const onMove = (e) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const scrollLeft = canvasRef.current?.scrollLeft || 0; const scrollTop = canvasRef.current?.scrollTop || 0; const mx = (e.clientX - rect.left + scrollLeft) / zoom - panX; const my = (e.clientY - rect.top + scrollTop) / zoom - panY; setNodePositions((prev) => ({ ...prev, [draggedNodeId]: { x: mx - dragOffset.x, y: my - dragOffset.y } })); };
    const onUp = () => setDraggedNodeId(null);
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [draggedNodeId, dragOffset, zoom, panX, panY]);

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
    if (view !== "graph" || centerTab !== "map") return; const el = canvasRef.current; if (!el) return;
    const onWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(3, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, [view, centerTab]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const handleReset = () => { setZoom(1); setPanX(0); setPanY(0); };
  const handleFitView = useCallback(() => {
    const positions = visiblePositions; if (!positions.length || !canvasRef.current) return;
    const minX = Math.min(...positions.map((p) => p.x)); const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x)) + 280; const maxY = Math.max(...positions.map((p) => p.y)) + 110;
    const cW = canvasRef.current.offsetWidth; const cH = canvasRef.current.offsetHeight;
    const newZoom = Math.min(cW / (maxX - minX + 80), cH / (maxY - minY + 80), 1.4);
    setZoom(newZoom); setPanX(-minX + 40 / newZoom); setPanY(-minY + 40 / newZoom);
    canvasRef.current.scrollLeft = 0; canvasRef.current.scrollTop = 0;
  }, [visiblePositions]);

  // ── Focus on a single node: zoom in + scroll to center it ──
  const focusOnNode = useCallback((nodeId) => {
    const pos = nodePositions[nodeId];
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
  }, [nodePositions]);

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
    { id: "export", group: "Views", icon: Download, label: "Export graph", hint: "PNG, SVG or source JSON", keywords: "png svg json download", run: () => { setCenterTab("map"); setExportOpen(true); } },
    { id: "share", group: "Views", icon: Link2, label: "Copy share link", keywords: "url share", run: handleShare },
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
  ], [openPlayground, handleFitView, handleShare, focusOnNode, selectedNode, openTool, openFullView]);

  const endpointCount = stats.total || nodes.filter((n) => n.type === "request").length;
  const liveResponse = selectedNode ? liveResponses[selectedNode.id] : null;

  const inspector = (
    <EndpointInspector
      key={selectedNode?.id || "empty"}
      node={selectedNode}
      nodes={nodes}
      spec={collection}
      liveResponse={liveResponse}
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
      {showEnvManager && (
        <EnvironmentManager
          activeEnvId={activeEnvId}
          onSelectEnv={setActiveEnvId}
          onClose={() => setShowEnvManager(false)}
        />
      )}

      {/* Phase 3 modals */}
      {showDocGenerator && collection && (
        <DocGenerator collection={collection} detectedFormat={detectedFormat} onBack={() => setShowDocGenerator(false)} />
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

      <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const text = ev.target.result; let data; try { data = JSON.parse(text); } catch { data = yaml.load(text); } if (data && typeof data === "object") handleVisualize(data); } catch { /* ignore unreadable file */ } }; reader.readAsText(file); e.target.value = ""; }} />
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
          onOpenRecent={(r) => r.data && handleVisualize(r.data)}
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
              onOpenRecent={(r) => r.data && handleVisualize(r.data)}
              onSeeAllRecents={() => openTool(setShowCollections)}
            />
          </aside>

          {/* Centre workspace */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel">
            <div className="flex h-[56px] flex-shrink-0 items-center justify-between gap-3 border-b border-vz-line-soft px-3">
              <div className="flex items-center gap-1 rounded-[9px] border border-vz-line-soft bg-vz-bg p-1">
                {CENTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCenterTab(tab.id)}
                    className={`vz-t flex items-center gap-1.5 rounded-[7px] px-2.5 py-[7px] text-[12px] ${
                      centerTab === tab.id
                        ? "bg-vz-accent/18 text-vz-text"
                        : "text-vz-soft hover:text-vz-text"
                    }`}
                  >
                    <tab.icon size={13} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={openPlayground}
                  className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] font-medium text-vz-soft hover:text-vz-text"
                >
                  <Play size={14} />
                  <span className="hidden sm:inline">Playground</span>
                </button>

                <ExportMenu
                  paperRef={paperRef}
                  graphTitle={collection?.info?.name || collection?.info?.title || "API Graph"}
                  spec={collection}
                  open={exportOpen}
                  onOpenChange={setExportOpen}
                />

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
                          nodes={filteredNodes}
                          nodePositions={nodePositions}
                          graphStyle={graphStyle}
                          showParticles={showParticles}
                          activeId={hoveredNodeId || selectedNode?.id || null}
                        />
                      </div>

                      <div className="pointer-events-none absolute inset-0" style={{
                        transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "0 0",
                        transition: draggedNodeId ? "none" : "transform 0.15s cubic-bezier(0.2,0,0,1)",
                      }}>
                        {filteredNodes.map((node, idx) => {
                          const pos = nodePositions[node.id] || { x: 100, y: 100 };
                          return (
                            <GraphCard key={node.id} node={node} position={pos}
                              isSelected={selectedNode?.id === node.id} isDragging={draggedNodeId === node.id}
                              isHighlighted={highlightedIds.has(node.id)} isCollapsed={collapsedFolders.has(node.id)}
                              isDimmed={focusSet ? !focusSet.has(node.id) : false}
                              entranceDelay={Math.min(idx * 12, 220)}
                              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                              onSelect={() => { setSelectedNode(node); setInspectorOpen(true); }}
                              onHoverChange={setHoveredNodeId}
                              onCopy={() => {}}
                              onToggleCollapse={node.type === "folder" ? toggleFolderCollapse : undefined} />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {showMinimap && (
                    <Minimap nodes={filteredNodes} nodePositions={nodePositions} canvasRef={canvasRef}
                      zoom={zoom} panX={panX} panY={panY} selectedId={selectedNode?.id} />
                  )}

                  <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5">
                    <button type="button" onClick={() => setZoom((z) => Math.min(3, z * 1.2))} title="Zoom in"
                      className="vz-t grid h-9 w-9 place-items-center rounded-lg border border-vz-line bg-vz-panel/92 text-vz-soft backdrop-blur hover:text-vz-text">
                      <ZoomIn size={15} />
                    </button>
                    <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} title="Zoom out"
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
                    nodes={filteredNodes}
                    selectedNodeId={selectedNode?.id}
                    onSelectNode={(n) => { setSelectedNode(n); setInspectorOpen(true); }}
                    onShowInMap={(n) => { setCenterTab("map"); selectAndReveal(n); }}
                  />
                </div>
              ) : centerTab === "audit" ? (
                <div className="absolute inset-0">
                  <AuditView
                    audit={audit}
                    nodes={nodes}
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
          activeEnvName={activeEnvId ? "Environment active" : null}
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
