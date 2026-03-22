import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import yaml from "js-yaml";
import {
  Upload, Download, ZoomIn, ZoomOut, RotateCcw, Maximize2, Search,
  ChevronDown, X, Code, Menu, ArrowLeft, Eye, Sparkles,
  Save, FolderOpen, Share2, GitCompareArrows, Link2, Check, Copy,
  Activity, Zap, Globe, ServerCog,
} from "lucide-react";
import { GRAPH_STYLES, SAMPLE_DATA } from "./utils/constants";
import { parseCollection, formatLabel } from "./utils/parsers";
import { generateShareUrl, extractSharedSpec } from "./utils/sharing";
import ConnectionLines from "./components/ConnectionLines";
import GraphCard from "./components/GraphCard";
import Minimap from "./components/Minimap";
import JsonInputScreen from "./components/JsonInputScreen";
import ApiPlaygroundModal from "./components/ApiPlaygroundModal";
import RequestDetailsPanel from "./components/RequestDetailsPanel";
import ExportMenu from "./components/ExportMenu";
import { SaveCollectionModal, CollectionsModal } from "./components/CollectionManager";
import DiffView from "./components/DiffView";
import AutoImportPanel from "./components/AutoImport";
import HealthMonitor from "./components/HealthMonitor";
import FlowBuilder from "./components/FlowBuilder";
import EnvironmentManager from "./components/EnvironmentManager";

const PostmanGraphViewer = () => {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const paperRef = useRef(null);

  const [view, setView] = useState("input");
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
  const [graphStyle, setGraphStyle] = useState("tree");
  const [showGraphMenu, setShowGraphMenu] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const [stats, setStats] = useState({ total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 });
  const [detectedFormat, setDetectedFormat] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [showParticles, setShowParticles] = useState(true);
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

  const contentBounds = useMemo(() => {
    const positions = Object.values(nodePositions);
    if (!positions.length) return { w: 1600, h: 900 };
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x));
    const maxY = Math.max(...positions.map((p) => p.y));
    return { w: (maxX - minX) + 600, h: (maxY - minY) + 400 };
  }, [nodePositions]);

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

          // Child orbit radius: scales with count so they don't overlap
          const R_CHILD = Math.max(200, children.length * 28);

          // Fan spread: wider for more children, capped at ~130°
          const fanSpread = Math.min(
            Math.PI * 0.72,
            Math.max(0.35, children.length * 0.22),
          );

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
    setDetectedFormat(Array.isArray(data) ? "Custom JSON" : formatLabel(data));
    setCollection(data); setNodes(parsed); setSelectedNode(null); setCollapsedFolders(new Set()); setZoom(1); setPanX(0); setPanY(0); setView("graph");
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

  // ── Auto-load shared spec from URL on mount ──
  useEffect(() => {
    const shared = extractSharedSpec();
    if (shared) {
      // Clean URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
      handleVisualize(shared);
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
        const positions = Object.values(newPos);
        if (!positions.length) return;
        const minX = Math.min(...positions.map((p) => p.x));
        const minY = Math.min(...positions.map((p) => p.y));
        const maxX = Math.max(...positions.map((p) => p.x)) + 280;
        const maxY = Math.max(...positions.map((p) => p.y)) + 120;
        const cW = canvasRef.current.offsetWidth;
        const cH = canvasRef.current.offsetHeight;
        const newZoom = Math.min(cW / (maxX - minX + 80), cH / (maxY - minY + 80), 1.2);
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
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); document.querySelector('input[placeholder*="Search"]')?.focus(); }
      if (e.key === "Escape") { setSelectedNode(null); setShowPlayground(false); }
      if (e.key === "Delete" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") setSearchQuery("");
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) { e.preventDefault(); const s = 24; if (e.key === "ArrowUp") setPanY((p) => p + s); if (e.key === "ArrowDown") setPanY((p) => p - s); if (e.key === "ArrowLeft") setPanX((p) => p + s); if (e.key === "ArrowRight") setPanX((p) => p - s); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (view !== "graph") return; const el = canvasRef.current; if (!el) return;
    const onWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(3, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  const handleReset = () => { setZoom(1); setPanX(0); setPanY(0); };
  const handleFitView = useCallback(() => {
    const positions = Object.values(nodePositions); if (!positions.length || !canvasRef.current) return;
    const minX = Math.min(...positions.map((p) => p.x)); const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x)) + 280; const maxY = Math.max(...positions.map((p) => p.y)) + 110;
    const cW = canvasRef.current.offsetWidth; const cH = canvasRef.current.offsetHeight;
    const newZoom = Math.min(cW / (maxX - minX + 80), cH / (maxY - minY + 80), 1.4);
    setZoom(newZoom); setPanX(-minX + 40 / newZoom); setPanY(-minY + 40 / newZoom);
    canvasRef.current.scrollLeft = 0; canvasRef.current.scrollTop = 0;
  }, [nodePositions]);

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
    if (view !== "graph" || matchList.length === 0) return;
    const idx = Math.min(focusedMatchIdx, matchList.length - 1);
    const target = matchList[idx];
    if (target) {
      setSelectedNode(target);
      const timer = setTimeout(() => focusOnNode(target.id), 120);
      return () => clearTimeout(timer);
    }
  }, [focusedMatchIdx, matchList, view, focusOnNode]);

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

  return (
    <div className="w-full h-screen bg-[#0c0e12] text-[#f8f9fe] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-[#0c0e12] border-b border-[#46484c]/20 px-5 py-3 flex items-center gap-4 backdrop-blur-xl flex-shrink-0 transition-all duration-300 relative z-50">
        <div className="flex items-center gap-3 flex-shrink-0">
          {view === "graph" && (
            <button onClick={() => setView("input")} className="p-1.5 hover:bg-[#22262b] rounded-lg text-[#a9abb0] hover:text-white transition-all duration-200 hover:scale-105 group">
              <ArrowLeft size={17} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
            </button>
          )}
          <div className="text-xl font-black text-[#e08efe] tracking-tight">Vizroute</div>
          {view === "graph" && collection && (<span className="text-sm text-[#73757a] truncate max-w-40">{collection.info?.name || "API Collection"}</span>)}
        </div>

        {view === "graph" && (
          <div className="flex items-center gap-3 ml-auto">
            {/* Search */}
            <div className="relative group">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#73757a] group-focus-within:text-[#a9abb0] transition-colors" />
              <input type="text" placeholder="Search... (Ctrl+K)" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-64 bg-[#22262b]/50 border border-[#46484c]/30 rounded-lg py-1.5 pl-9 pr-20 text-sm text-white placeholder:text-[#73757a] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all duration-200 backdrop-blur-sm" />
              {searchQuery && (
                <>
                  <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-[#a9abb0] font-mono tabular-nums">
                    {matchList.length > 0 ? (
                      <><span className="text-[#e08efe] font-bold">{Math.min(focusedMatchIdx + 1, matchList.length)}</span><span className="text-[#73757a]">/{matchList.length}</span></>
                    ) : (
                      <span className="text-[#ff6e84]">0</span>
                    )}
                  </span>
                  <button onClick={() => { setSearchQuery(""); setSelectedNode(null); handleFitView(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#73757a] hover:text-white transition-colors"><X size={13} /></button>
                </>
              )}
            </div>

            {/* Method filter */}
            <div className="flex items-center gap-0.5 bg-[#22262b]/40 border border-[#46484c]/30 rounded-lg p-1">
              {["all", "GET", "POST", "PUT", "DELETE"].map((m) => (
                <button key={m} onClick={() => setFilterMethod(m)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all duration-200 ${filterMethod === m ? "bg-[#e08efe] text-[#0c0e12] shadow-md shadow-[#e08efe]/20 animate-pill" : "text-[#73757a] hover:text-[#a9abb0]"}`}>
                  {m === "all" ? "All" : m}
                </button>
              ))}
            </div>

            {/* Graph style */}
            <div className="relative">
              <button onClick={() => setShowGraphMenu(!showGraphMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e08efe]/8 border border-[#e08efe]/20 rounded-lg hover:border-[#e08efe]/40 hover:bg-[#e08efe]/12 transition-all duration-200 text-[#e08efe] text-sm font-semibold group">
                <Code size={14} />{graphStyle.charAt(0).toUpperCase() + graphStyle.slice(1)}
                <ChevronDown size={14} className={`transition-transform duration-300 ${showGraphMenu ? "rotate-180" : ""}`} />
              </button>
              {showGraphMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-[#22262b]/95 border border-[#46484c]/40 rounded-xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden" style={{ animation: "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  {GRAPH_STYLES.map((s, i) => (
                    <button key={s} onClick={() => { setGraphStyle(s); setShowGraphMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-200 border-l-2 hover:bg-white/5 ${graphStyle === s ? "text-[#e08efe] border-[#e08efe] bg-[#e08efe]/8" : "text-[#a9abb0] border-transparent"}`}
                      style={{ animation: `slideInUp 0.2s ease-out ${i * 40}ms both` }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Particles toggle */}
            <button onClick={() => setShowParticles((v) => !v)}
              className={`p-2 rounded-lg transition-all duration-200 ${showParticles ? "bg-[#e08efe]/10 text-[#e08efe] border border-[#e08efe]/20" : "text-[#73757a] hover:text-[#a9abb0] hover:bg-[#22262b]"}`}
              title={showParticles ? "Hide particle flow" : "Show particle flow"}>
              <Sparkles size={15} />
            </button>

            <div className="w-px h-5 bg-[#46484c]/30 mx-0.5" />

            {/* Export */}
            <ExportMenu paperRef={paperRef} graphTitle={collection?.info?.name || collection?.info?.title || "API Graph"} />

            {/* Save to collection */}
            <button onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg hover:border-[#46484c]/60 hover:bg-[#22262b] transition-all duration-200 text-[#a9abb0] hover:text-white text-sm font-semibold"
              title="Save to collections">
              <Save size={14} /> Save
            </button>

            {/* Share link */}
            <button onClick={handleShare}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-sm font-semibold ${
                shareCopied
                  ? "bg-[#81ecff]/10 border-[#81ecff]/30 text-[#81ecff]"
                  : "bg-[#22262b]/60 border-[#46484c]/30 hover:border-[#46484c]/60 hover:bg-[#22262b] text-[#a9abb0] hover:text-white"
              }`}
              title="Copy shareable link">
              {shareCopied ? <><Check size={14} /> Copied!</> : <><Link2 size={14} /> Share</>}
            </button>

            <div className="w-px h-5 bg-[#46484c]/30 mx-0.5" />

            {/* Health Monitor */}
            <button onClick={() => setShowHealthMonitor(true)}
              className="p-2 rounded-lg text-[#a9abb0] hover:text-[#81ecff] hover:bg-[#22262b] transition-all duration-200"
              title="Health Monitor">
              <Activity size={15} />
            </button>

            {/* Flow Builder */}
            <button onClick={() => setShowFlowBuilder(true)}
              className="p-2 rounded-lg text-[#a9abb0] hover:text-[#e08efe] hover:bg-[#22262b] transition-all duration-200"
              title="Test Flow Builder">
              <Zap size={15} />
            </button>

            {/* Environment */}
            <button onClick={() => setShowEnvManager(true)}
              className={`p-2 rounded-lg transition-all duration-200 ${
                activeEnvId
                  ? "bg-[#e08efe]/10 text-[#e08efe] border border-[#e08efe]/20"
                  : "text-[#a9abb0] hover:text-white hover:bg-[#22262b]"
              }`}
              title="Environments">
              <Globe size={15} />
            </button>

            {/* Menu */}
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 text-[#a9abb0] hover:text-white"><Menu size={18} /></button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-[#22262b]/95 border border-[#46484c]/40 rounded-xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden" style={{ animation: "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  <button onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200"><Upload size={14} className="text-[#81ecff]" /> Import JSON / YAML</button>
                  <button onClick={() => { handleLoadSample("postman"); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200"><Download size={14} className="text-amber-400" /> Postman Sample</button>
                  <button onClick={() => { handleLoadSample("openapi"); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200"><Download size={14} className="text-[#3aa2ff]" /> OpenAPI Sample</button>
                  <button onClick={() => { handleLoadSample("custom"); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200"><Download size={14} className="text-[#e08efe]" /> Custom JSON Sample</button>
                  <div className="border-t border-[#46484c]/30 my-1" />
                  <button onClick={() => { handleReset(); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200"><RotateCcw size={14} className="text-[#73757a]" /> Reset View</button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Stats bar */}
      {view === "graph" && (
        <div className="bg-[#111417]/60 border-b border-[#46484c]/15 px-5 py-2 flex items-center gap-6 flex-shrink-0 backdrop-blur-sm" style={{ animation: "slideInUp 0.3s ease-out both" }}>
          {[
            { label: "TOTAL", val: stats.total, cls: "text-white" },
            { label: "GET", val: stats.get, cls: "text-emerald-400", dot: "bg-emerald-500" },
            { label: "POST", val: stats.post, cls: "text-amber-400", dot: "bg-amber-500" },
            { label: "PUT", val: stats.put, cls: "text-blue-400", dot: "bg-blue-500" },
            { label: "PATCH", val: stats.patch, cls: "text-purple-400", dot: "bg-purple-500" },
            { label: "DELETE", val: stats.delete, cls: "text-red-400", dot: "bg-red-500" },
          ].map(({ label, val, cls, dot }) => (
            <div key={label} className="flex items-center gap-2">
              {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
              <span className="text-xs text-[#73757a] font-bold">{label}</span>
              <span className={`text-sm font-bold ${cls}`}>{val}</span>
            </div>
          ))}
          {detectedFormat && (
            <div className="ml-auto flex items-center gap-1.5 bg-[#22262b]/60 border border-[#46484c]/30 rounded-full px-3 py-1 text-xs font-bold text-[#a9abb0]">
              <Code size={10} className="text-[#e08efe]" />{detectedFormat}
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {view === "input" ? (
        <JsonInputScreen
          onVisualize={handleVisualize}
          onLoadSample={handleLoadSample}
          onOpenCollections={() => setShowCollections(true)}
          onOpenDiff={() => setView("diff")}
          onOpenAutoImport={() => setShowAutoImport(true)}
        />
      ) : view === "diff" ? (
        <DiffView onBack={() => setView("input")} />
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ animation: "fadeIn 0.35s ease-out both" }}>
          <div className="flex-1 relative overflow-hidden">
            {/* Background ambient blurs */}
            <div className="absolute pointer-events-none" style={{ top: "-5%", left: "-5%", width: "35%", height: "35%", background: "rgba(224,142,254,0.03)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0 }} />
            <div className="absolute pointer-events-none" style={{ bottom: "10%", right: "5%", width: "25%", height: "25%", background: "rgba(58,162,255,0.03)", filter: "blur(80px)", borderRadius: "50%", zIndex: 0 }} />

            <div ref={canvasRef} className="absolute inset-0 overflow-auto"
              onClick={(e) => { if (e.target === canvasRef.current || e.target === paperRef.current) setSelectedNode(null); }}>
              {/* Paper — dot grid from reference */}
              <div ref={paperRef} className="relative" style={{
                width: contentBounds.w * zoom, height: contentBounds.h * zoom, minWidth: "100%", minHeight: "100%",
                backgroundImage: `radial-gradient(circle, rgba(70,72,76,0.4) 1px, transparent 1px)`,
                backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                backgroundColor: "#111417",
              }}>
                {/* Ripple effect */}
                {showRipple && nodePositions["node-root"] && (
                  <div className="absolute pointer-events-none" style={{
                    left: (nodePositions["node-root"].x + 112 + panX) * zoom, top: (nodePositions["node-root"].y + 50 + panY) * zoom,
                    width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: "50%",
                    border: "2px solid rgba(224,142,254,0.25)", animation: "ripple 0.6s ease-out both", zIndex: 5,
                  }} />
                )}

                <div className="absolute inset-0 pointer-events-none" style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "0 0" }}>
                  <ConnectionLines nodes={filteredNodes} nodePositions={nodePositions} graphStyle={graphStyle} showParticles={showParticles} />
                </div>

                <div className="absolute inset-0 pointer-events-none" style={{
                  transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: "0 0",
                  transition: draggedNodeId ? "none" : "transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                  {filteredNodes.map((node, idx) => {
                    const pos = nodePositions[node.id] || { x: 100, y: 100 };
                    return (
                      <GraphCard key={node.id} node={node} position={pos}
                        isSelected={selectedNode?.id === node.id} isDragging={draggedNodeId === node.id}
                        isHighlighted={highlightedIds.has(node.id)} isCollapsed={collapsedFolders.has(node.id)}
                        entranceDelay={Math.min(idx * 35, 500)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)} onSelect={() => setSelectedNode(node)} onCopy={() => {}}
                        onToggleCollapse={node.type === "folder" ? toggleFolderCollapse : undefined} />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="absolute bottom-5 left-5 flex items-center gap-1 bg-[#0c0e12]/85 border border-[#46484c]/30 rounded-xl p-1.5 z-30 backdrop-blur-xl shadow-2xl shadow-black/40"
              style={{ animation: "slideInUp 0.4s cubic-bezier(0.34,1.56,0.64,1) 300ms both" }}>
              <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 text-[#a9abb0] hover:text-[#e08efe] hover:scale-110" title="Zoom In"><ZoomIn size={15} /></button>
              <span className="text-xs text-[#a9abb0] w-10 text-center font-mono font-bold tabular-nums">{(zoom * 100).toFixed(0)}%</span>
              <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 text-[#a9abb0] hover:text-[#e08efe] hover:scale-110" title="Zoom Out"><ZoomOut size={15} /></button>
              <div className="w-px h-5 bg-[#46484c]/40 mx-0.5" />
              <button onClick={handleFitView} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 text-[#a9abb0] hover:text-[#e08efe] hover:scale-110" title="Fit All"><Maximize2 size={15} /></button>
              <button onClick={handleReset} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 text-[#a9abb0] hover:text-[#e08efe] hover:scale-110" title="Reset"><RotateCcw size={15} /></button>
            </div>

            <Minimap nodes={filteredNodes} nodePositions={nodePositions} canvasRef={canvasRef} zoom={zoom} panX={panX} panY={panY} />

            {filteredNodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center" style={{ animation: "scaleIn 0.4s ease-out both" }}>
                  <Search size={40} className="text-[#46484c] mx-auto mb-3" /><p className="text-[#73757a]">No nodes match your search</p>
                </div>
              </div>
            )}
          </div>

          <RequestDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} onTest={() => setShowPlayground(true)} />
        </div>
      )}

      {showPlayground && selectedNode && <ApiPlaygroundModal node={selectedNode} onClose={() => setShowPlayground(false)} />}

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
        <HealthMonitor
          nodes={nodes}
          onClose={() => setShowHealthMonitor(false)}
        />
      )}
      {showFlowBuilder && (
        <FlowBuilder
          nodes={nodes}
          onClose={() => setShowFlowBuilder(false)}
          activeEnv={activeEnvId ? undefined : undefined}
        />
      )}
      {showEnvManager && (
        <EnvironmentManager
          activeEnvId={activeEnvId}
          onSelectEnv={setActiveEnvId}
          onClose={() => setShowEnvManager(false)}
        />
      )}

      <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const text = ev.target.result; let data; try { data = JSON.parse(text); } catch { data = yaml.load(text); } if (data && typeof data === "object") handleVisualize(data); } catch {} }; reader.readAsText(file); e.target.value = ""; }} />
    </div>
  );
};

export default PostmanGraphViewer;
