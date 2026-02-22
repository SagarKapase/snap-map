import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import yaml from "js-yaml";
import {
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Search,
  ChevronDown,
  Lock,
  X,
  Play,
  Code,
  Menu,
  Copy,
  Share2,
  Zap,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Send,
  Plus,
  Trash2,
  Globe,
  RefreshCw,
  Braces,
  Eye,
  Terminal,
  ChevronRight,
  Layers,
  FileJson,
  FileCode2,
} from "lucide-react";

// ─────────────────────────────────────────────
// Shared CSS animations injected once
// ─────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes nodeEntrance {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes drawPath {
    from { stroke-dashoffset: 3000; opacity: 0; }
    to   { stroke-dashoffset: 0;    opacity: 1; }
  }
  @keyframes pathPulse {
    0%,100% { opacity: 0.55; }
    50%     { opacity: 0.95; }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(28px); }
    to   { opacity: 1; transform: translateX(0);    }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-28px); }
    to   { opacity: 1; transform: translateX(0);     }
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1);    }
  }
  @keyframes float {
    0%,100% { transform: translateY(0);   }
    50%     { transform: translateY(-7px);}
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg);   }
    to   { transform: rotate(360deg); }
  }
  .animate-float   { animation: float    3s ease-in-out infinite; }
  .animate-spin-sl { animation: spin-slow 8s linear    infinite; }
  input:focus, textarea:focus { outline: none; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: rgba(15,23,42,0.4); }
  ::-webkit-scrollbar-thumb { background: rgba(71,85,105,0.5); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.7); }
`;

// ─────────────────────────────────────────────
// HTTP method colour map
// ─────────────────────────────────────────────
const METHOD_COLORS = {
  GET:    { bg:"bg-emerald-600/20", text:"text-emerald-400", badge:"bg-emerald-600", glow:"shadow-emerald-500/50", line:"rgba(52,211,153,0.55)" },
  POST:   { bg:"bg-amber-600/20",   text:"text-amber-400",   badge:"bg-amber-600",   glow:"shadow-amber-500/50",   line:"rgba(251,191,36,0.55)"  },
  PUT:    { bg:"bg-blue-600/20",    text:"text-blue-400",    badge:"bg-blue-600",    glow:"shadow-blue-500/50",    line:"rgba(96,165,250,0.55)"  },
  PATCH:  { bg:"bg-purple-600/20",  text:"text-purple-400",  badge:"bg-purple-600",  glow:"shadow-purple-500/50",  line:"rgba(167,139,250,0.55)" },
  DELETE: { bg:"bg-red-600/20",     text:"text-red-400",     badge:"bg-red-600",     glow:"shadow-red-500/50",     line:"rgba(248,113,113,0.55)" },
};
const methodColor = (m) => METHOD_COLORS[m] || METHOD_COLORS.GET;

// ─────────────────────────────────────────────
// Format detection & multi-format parsers
// ─────────────────────────────────────────────
const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"];

const detectFormat = (data) => {
  if (data.openapi || data.swagger) return "openapi";
  if (data.info && data.item && Array.isArray(data.item)) return "postman";
  return "custom";
};

const formatLabel = (data) => {
  if (data.openapi) return `OpenAPI ${data.openapi}`;
  if (data.swagger) return `Swagger ${data.swagger}`;
  if (data.info && data.item && Array.isArray(data.item)) return "Postman";
  return "Custom JSON";
};

/**
 * Parse an OpenAPI 3.x or Swagger 2.0 spec into the internal node tree.
 */
const parseOpenApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  // Resolve base URL
  let baseUrl = "";
  if (data.servers && data.servers.length > 0) {
    baseUrl = data.servers[0].url || "";
  } else if (data.host) {
    const scheme = (data.schemes && data.schemes[0]) || "https";
    baseUrl = `${scheme}://${data.host}${data.basePath || ""}`;
  }
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");

  const root = {
    id: "node-root",
    name: data.info?.title || "API Specification",
    version: data.info?.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  // Group operations by tag
  const tagGroups = {};
  const paths = data.paths || {};

  Object.entries(paths).forEach(([pathStr, pathObj]) => {
    if (!pathObj) return;
    HTTP_METHODS.forEach((method) => {
      const operation = pathObj[method];
      if (!operation) return;

      const tags = operation.tags && operation.tags.length > 0 ? operation.tags : ["Default"];
      const upperMethod = method.toUpperCase();

      // Extract request body info
      let body = null;
      if (operation.requestBody) {
        // OpenAPI 3.x
        const content = operation.requestBody.content;
        if (content) {
          const jsonContent = content["application/json"];
          if (jsonContent?.example) body = jsonContent.example;
          else if (jsonContent?.schema?.example) body = jsonContent.schema.example;
        }
      } else if (operation.parameters) {
        // Swagger 2.0 body parameter
        const bodyParam = operation.parameters.find((p) => p.in === "body");
        if (bodyParam?.schema?.example) body = bodyParam.schema.example;
      }

      tags.forEach((tag) => {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push({
          name: operation.summary || operation.operationId || `${upperMethod} ${pathStr}`,
          method: upperMethod,
          path: `${baseUrl}${pathStr}`,
          description: operation.description || operation.summary || "",
          body,
        });
      });

      s[method] = (s[method] || 0) + 1;
      s.total++;
    });
  });

  // Create folder + request nodes from tag groups
  Object.entries(tagGroups).forEach(([tag, endpoints]) => {
    const folderId = `node-${id++}`;
    allNodes.push({
      id: folderId,
      name: tag,
      type: "folder",
      parentId: "node-root",
      itemCount: endpoints.length,
      description: "",
    });

    endpoints.forEach((ep) => {
      allNodes.push({
        id: `node-${id++}`,
        name: ep.name,
        type: "request",
        parentId: folderId,
        method: ep.method,
        path: ep.path,
        description: ep.description,
        body: ep.body,
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
          { key: "Authorization", value: "Bearer <token>" },
        ],
      });
    });
  });

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

/**
 * Parse a custom/generic API JSON into the internal node tree.
 * Supports: flat array, grouped object, or { endpoints/routes: [...] }
 */
const parseCustomApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  const root = {
    id: "node-root",
    name: data.name || data.title || "API Collection",
    version: data.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  const normalizeEndpoint = (ep) => {
    const method = (ep.method || ep.type || ep.httpMethod || "GET").toUpperCase();
    const url = ep.url || ep.path || ep.endpoint || ep.route || "";
    const name = ep.name || ep.title || ep.summary || `${method} ${url}`;
    const description = ep.description || ep.summary || "";
    let body = null;
    if (ep.body) {
      try { body = typeof ep.body === "string" ? JSON.parse(ep.body) : ep.body; } catch { body = ep.body; }
    }
    return { method, url, name, description, body };
  };

  const addEndpoints = (endpoints, parentId) => {
    endpoints.forEach((ep) => {
      const norm = normalizeEndpoint(ep);
      const m = norm.method.toLowerCase();
      s[m] = (s[m] || 0) + 1;
      s.total++;
      allNodes.push({
        id: `node-${id++}`,
        name: norm.name,
        type: "request",
        parentId,
        method: norm.method,
        path: norm.url,
        description: norm.description,
        body: norm.body,
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
          { key: "Authorization", value: "Bearer <token>" },
        ],
      });
    });
  };

  if (Array.isArray(data)) {
    // Flat array of endpoints
    root.name = "API Collection";
    addEndpoints(data, "node-root");
  } else {
    // Check for endpoints/routes key
    const endpointsArr = data.endpoints || data.routes || data.apis || null;
    if (Array.isArray(endpointsArr)) {
      addEndpoints(endpointsArr, "node-root");
    } else {
      // Grouped object: { "GroupName": [...], ... }
      // Filter out known metadata keys
      const metaKeys = ["name", "title", "version", "description", "baseUrl", "base_url"];
      const groups = Object.entries(data).filter(
        ([key, val]) => Array.isArray(val) && !metaKeys.includes(key)
      );
      if (groups.length > 0) {
        groups.forEach(([groupName, endpoints]) => {
          const folderId = `node-${id++}`;
          allNodes.push({
            id: folderId,
            name: groupName,
            type: "folder",
            parentId: "node-root",
            itemCount: endpoints.length,
            description: "",
          });
          addEndpoints(endpoints, folderId);
        });
      } else {
        // Last resort: try to treat the whole object as a single endpoint
        const norm = normalizeEndpoint(data);
        if (norm.url) {
          const m = norm.method.toLowerCase();
          s[m] = (s[m] || 0) + 1;
          s.total++;
          allNodes.push({
            id: `node-${id++}`,
            name: norm.name,
            type: "request",
            parentId: "node-root",
            method: norm.method,
            path: norm.url,
            description: norm.description,
            body: norm.body,
            headers: [
              { key: "Content-Type", value: "application/json" },
              { key: "Accept", value: "*/*" },
            ],
          });
        }
      }
    }
  }

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─────────────────────────────────────────────
// ConnectionLines — SVG with draw-on-mount animation
// ─────────────────────────────────────────────
const ConnectionLines = ({ nodes, nodePositions, graphStyle }) => {
  const lines = [];

  nodes.forEach((node, idx) => {
    if (!node.parentId) return;
    const p = nodePositions[node.parentId];
    const c = nodePositions[node.id];
    if (!p || !c) return;

    let path = "";
    let stroke = "rgba(59,130,246,0.55)";
    let strokeWidth = 2;

    if (graphStyle === "tree") {
      const x1 = p.x + 220, y1 = p.y + 50;
      const x2 = c.x,       y2 = c.y + 50;
      const cx = x1 + (x2 - x1) * 0.45;
      path = `M ${x1} ${y1} Q ${cx} ${(y1+y2)/2} ${x2} ${y2}`;
    } else if (graphStyle === "flowchart") {
      const x1 = p.x + 220, y1 = p.y + 50;
      const x2 = c.x,       y2 = c.y + 50;
      const mx = x1 + (x2 - x1) / 2;
      path = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
      stroke = "rgba(168,85,247,0.55)";
    } else if (graphStyle === "radial") {
      const dx = c.x - p.x, dy = c.y - p.y;
      const angle = Math.atan2(dy, dx);
      path = `M ${p.x + Math.cos(angle)*130} ${p.y + Math.sin(angle)*50} L ${c.x - Math.cos(angle)*130} ${c.y - Math.sin(angle)*50}`;
      stroke = "rgba(34,197,94,0.55)";
    } else {
      // mindmap — organic bezier connecting the correct horizontal edge of each card
      const parentIsRoot = node.parentId === "node-root";
      const parentW      = parentIsRoot ? 224 : 208; // w-56 root / w-52 folder
      const childW       = node.type === "request" ? 256 : 208; // w-64 req / w-52 folder
      const isLeft       = c.x < p.x;
      const x1 = isLeft ? p.x          : p.x + parentW;
      const x2 = isLeft ? c.x + childW : c.x;
      const y1 = p.y + 44;
      const y2 = c.y + 44;
      const cp = (x1 + x2) / 2;
      path        = `M ${x1} ${y1} C ${cp} ${y1}, ${cp} ${y2}, ${x2} ${y2}`;
      stroke      = node.type === "request" ? methodColor(node.method).line : "rgba(249,115,22,0.65)";
      strokeWidth = node.type === "request" ? 1.5 : 2.5;
    }

    const delay = Math.min(idx * 30, 600);
    lines.push(
      <path
        key={`l-${node.id}`}
        d={path}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="3000"
        pointerEvents="none"
        style={{
          animation: `drawPath 0.7s cubic-bezier(0.4,0,0.2,1) ${delay}ms both, pathPulse 4s ease-in-out ${delay + 700}ms infinite`,
          filter: `drop-shadow(0 0 6px ${stroke})`,
        }}
      />
    );
  });

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, overflow: "visible" }}>
      {lines}
    </svg>
  );
};

// ─────────────────────────────────────────────
// GraphCard — node card with staggered entrance
// ─────────────────────────────────────────────
const GraphCard = ({ node, position, isSelected, isDragging, isHighlighted, onMouseDown, onSelect, onCopy, entranceDelay = 0 }) => {
  const [copyDone, setCopyDone] = useState(false);
  const [hovered, setHovered] = useState(false);

  const mc = node.type === "request" ? methodColor(node.method) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!node.path) return;
    navigator.clipboard.writeText(node.path);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
    onCopy?.();
  };

  return (
    // Outer: absolute position + staggered entrance animation only (pointer-events-none so canvas stays clickable)
    <div
      className="absolute pointer-events-none"
      style={{
        left: position.x,
        top:  position.y,
        zIndex: isSelected ? 50 : isDragging ? 45 : hovered ? 30 : 10,
        animation: `nodeEntrance 0.45s cubic-bezier(0.22,1,0.36,1) ${entranceDelay}ms both`,
      }}
    >
      {/* Inner: interactive scale + all mouse events — pointer-events-auto overrides parent's none */}
      <div
        className="pointer-events-auto"
        style={{
          transform: isSelected ? "scale(1.06)" : hovered ? "scale(1.02)" : "scale(1)",
          transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
          willChange: "transform",
        }}
        onMouseDown={onMouseDown}
        onClick={onSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
      {node.type === "root" ? (
        <div className={`w-60 rounded-2xl cursor-grab active:cursor-grabbing backdrop-blur-sm p-4 group transition-all duration-300 relative overflow-hidden
          ${isSelected
            ? "border-2 border-violet-400 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-violet-500/30"
            : isHighlighted
              ? "border-2 border-violet-500/50 bg-gradient-to-br from-slate-800/90 to-slate-900/90 shadow-lg shadow-violet-500/15"
              : "border border-violet-600/25 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-violet-500/45 hover:shadow-xl hover:shadow-violet-500/10"
          }`}
        >
          {/* Subtle top glow line */}
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          <div className="flex items-center gap-2.5 mb-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
              ${isSelected ? "bg-violet-500/25 border border-violet-400/40" : "bg-violet-600/15 border border-violet-600/25 group-hover:border-violet-500/40"}`}>
              <Lock size={13} className={`transition-colors duration-300 ${isSelected || hovered ? "text-violet-300" : "text-violet-500"}`} />
            </div>
            <span className="text-xs font-bold text-violet-400/80 uppercase tracking-widest">Root API</span>
          </div>
          <h3 className="text-base font-bold text-white mb-2.5 group-hover:text-violet-200 transition-colors duration-300 truncate leading-tight">{node.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/40 rounded-md px-2 py-0.5 font-mono">{node.version}</span>
            <span className="text-xs text-violet-400/70 font-semibold">{node.itemCount} nodes</span>
          </div>
        </div>
      ) : node.type === "folder" ? (
        <div className={`w-52 rounded-xl cursor-grab active:cursor-grabbing backdrop-blur-sm p-3.5 group transition-all duration-300
          ${isSelected
            ? "border-2 border-indigo-400/60 bg-slate-800/95 shadow-xl shadow-indigo-500/20"
            : isHighlighted
              ? "border border-slate-500/50 bg-slate-800/80 shadow-md"
              : "border border-slate-700/50 bg-slate-800/60 hover:border-slate-600/70 hover:bg-slate-800/80 hover:shadow-lg"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-600/15 border border-indigo-600/25 flex items-center justify-center flex-shrink-0">
                <Layers size={11} className="text-indigo-400" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Folder</span>
            </div>
            <span className="text-xs bg-slate-700/60 border border-slate-600/40 text-slate-300 px-2 py-0.5 rounded-full font-bold tabular-nums">{node.itemCount}</span>
          </div>
          <h3 className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors duration-300 truncate">{node.name}</h3>
        </div>
      ) : (
        <div className={`w-64 rounded-xl cursor-grab active:cursor-grabbing backdrop-blur-sm group transition-all duration-300 overflow-hidden
          ${isSelected
            ? "border border-slate-500/50 bg-slate-800/95 shadow-xl"
            : isHighlighted
              ? "border border-slate-600/50 bg-slate-800/80 shadow-md"
              : "border border-slate-700/40 bg-slate-800/60 hover:border-slate-600/60 hover:bg-slate-800/80 hover:shadow-lg"
          }`}
        >
          {/* Method accent bar */}
          {mc && <div className={`h-0.5 w-full ${mc.badge}`} />}
          <div className="p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              {mc && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${mc.bg} ${mc.text} uppercase flex-shrink-0 transition-all duration-300 ${isSelected ? `shadow-md ${mc.glow}` : ""}`}>
                  {node.method}
                </span>
              )}
              <span className="text-xs text-slate-600 uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300 tracking-wider ml-auto">Request</span>
            </div>
            <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-slate-100 transition-colors duration-300 line-clamp-2 leading-snug">{node.name}</h3>
            {node.path && (
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-cyan-400/70 font-mono truncate flex-1 group-hover:text-cyan-400 transition-colors duration-300">{node.path}</p>
                <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-1 hover:bg-slate-600/30 rounded flex-shrink-0">
                  {copyDone
                    ? <CheckCircle size={11} className="text-emerald-400" />
                    : <Copy size={11} className="text-slate-500 hover:text-slate-300 transition-colors" />
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// JsonInputScreen — unified glass workspace
// ─────────────────────────────────────────────
const JsonInputScreen = ({ onVisualize, onLoadSample }) => {
  const [jsonText,      setJsonText]      = useState("");
  const [error,         setError]         = useState("");
  const [isDragOver,    setIsDragOver]    = useState(false);
  const [isFormatting,  setIsFormatting]  = useState(false);
  const [showSampleMenu,setShowSampleMenu]= useState(false);
  const [activeTab,     setActiveTab]     = useState("editor"); // "editor" | "upload"
  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);
  const lineNumRef   = useRef(null);

  const tryParse = (text) => {
    try { return JSON.parse(text); } catch { /* ignore */ }
    try { return yaml.load(text); } catch { /* ignore */ }
    return null;
  };

  const validate = (text) => tryParse(text) !== null;

  const detectedInputFormat = useMemo(() => {
    if (!jsonText.trim()) return null;
    const parsed = tryParse(jsonText);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.openapi) return `OpenAPI ${parsed.openapi}`;
    if (parsed.swagger) return `Swagger ${parsed.swagger}`;
    if (parsed.info && parsed.item && Array.isArray(parsed.item)) return "Postman";
    if (Array.isArray(parsed)) return "Custom Array";
    if (parsed.endpoints || parsed.routes || parsed.apis) return "Custom";
    return "Custom JSON";
  }, [jsonText]);

  const handleVisualize = () => {
    if (!jsonText.trim()) { setError("Paste or upload an API specification first."); return; }
    const data = tryParse(jsonText);
    if (data && typeof data === "object") { setError(""); onVisualize(data); }
    else { setError("Invalid JSON/YAML — cannot parse"); }
  };

  const handleFormat = () => {
    if (!jsonText.trim()) return;
    setIsFormatting(true);
    const parsed = tryParse(jsonText);
    if (parsed && typeof parsed === "object") { setJsonText(JSON.stringify(parsed, null, 2)); setError(""); }
    else { setError("Cannot format — invalid JSON/YAML"); }
    setTimeout(() => setIsFormatting(false), 400);
  };

  const handleFileRead = (file) => {
    const validExts = [".json", ".yaml", ".yml"];
    if (!file || !validExts.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError("Upload a .json, .yaml, or .yml file"); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = tryParse(text);
      if (parsed && typeof parsed === "object") { setJsonText(text); setError(""); setActiveTab("editor"); }
      else { setError("Invalid file"); }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    handleFileRead(e.dataTransfer.files?.[0]);
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && jsonText.trim()) {
        e.preventDefault(); handleVisualize();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleTextareaScroll = () => {
    if (lineNumRef.current && textareaRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const lineCount = jsonText.split("\n").length;
  const charCount = jsonText.length;
  const isValid   = jsonText.trim() && validate(jsonText);

  const GLASS = {
    background: "rgba(12, 12, 20, 0.75)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "0 32px 64px -16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
  };

  return (
    <div className="flex-1 overflow-auto relative" style={{ animation: "fadeIn 0.3s ease-out both" }}>

      {/* Radial gradient background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "radial-gradient(circle at 18% 25%, rgba(99,102,241,0.11) 0%, transparent 45%), radial-gradient(circle at 82% 75%, rgba(217,70,239,0.07) 0%, transparent 45%)",
        zIndex: 0,
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

        {/* ── Left: Hero (4 cols) ── */}
        <div className="lg:col-span-4 flex flex-col gap-8 pt-2" style={{ animation: "slideInLeft 0.5s cubic-bezier(0.22,1,0.36,1) both" }}>

          {/* Status badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full w-fit"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" style={{ animation: "nodeEntrance 1s ease-in-out infinite alternate" }} />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">System Active</span>
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-5xl font-extrabold tracking-tight leading-[1.1] text-white">
              Build API<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #6366f1 0%, #d946ef 100%)" }}>
                Maps.
              </span>
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed tracking-wide font-light max-w-xs">
              Transform complex API specifications into navigable visual graphs. Supports Postman, OpenAPI, Swagger and custom JSON.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <Layers size={16} />,   label: "Topology",   sub: "4 auto-layouts" },
              { icon: <Zap size={16} />,       label: "Playground", sub: "Live API calls"  },
              { icon: <Search size={16} />,    label: "Search",     sub: "Filter endpoints"},
              { icon: <Share2 size={16} />,    label: "Canvas",     sub: "Drag & zoom"     },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="p-3.5 rounded-2xl space-y-2 transition-colors duration-200 hover:border-white/10"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="text-indigo-400">{icon}</span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-xs text-slate-500">{sub}</p>
              </div>
            ))}
          </div>

          {/* CTA button */}
          <button
            onClick={handleVisualize}
            disabled={!jsonText.trim()}
            className={`w-full group flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-sm tracking-wide uppercase transition-all duration-200 active:scale-[0.97]
              ${jsonText.trim()
                ? "text-white shadow-2xl hover:opacity-90"
                : "text-slate-600 cursor-not-allowed"
              }`}
            style={jsonText.trim() ? {
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              boxShadow: "0 20px 40px -10px rgba(99,102,241,0.35)",
            } : {
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Eye size={16} className={jsonText.trim() ? "" : "opacity-30"} />
            Initialize Visualization
            {jsonText.trim() && (
              <ChevronRight size={15} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
            )}
          </button>

          {/* Supported formats */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Accepts</p>
            {[
              { name: "Postman Collections", icon: <FileJson size={12} /> },
              { name: "OpenAPI / Swagger",   icon: <Globe size={12} /> },
              { name: "Custom API JSON",     icon: <FileCode2 size={12} /> },
            ].map(({ name, icon }) => (
              <div key={name} className="flex items-center gap-2.5">
                <span className="text-slate-600">{icon}</span>
                <span className="text-xs text-slate-500">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Glass editor panel (8 cols) ── */}
        <div className="lg:col-span-8" style={{ animation: "slideInRight 0.5s cubic-bezier(0.22,1,0.36,1) both" }}>
          <div className="rounded-3xl overflow-hidden flex flex-col" style={{ ...GLASS, height: 580 }}>

            {/* Tab bar */}
            <div className="flex items-center justify-between px-6 py-3.5 flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center gap-6">
                {[
                  { id: "editor", icon: <Terminal size={14} />, label: "Source Editor" },
                  { id: "upload", icon: <Upload size={14} />,   label: "File Upload" },
                ].map(({ id, icon, label }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest py-1 transition-colors duration-200
                      ${activeTab === id
                        ? "text-white border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-300"
                      }`}>
                    {icon}{label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {/* Sample dropdown */}
                <div className="relative">
                  <button onClick={() => setShowSampleMenu((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors duration-200">
                    <Download size={13} />
                    Sample
                    <ChevronDown size={11} className={`transition-transform duration-200 ${showSampleMenu ? "rotate-180" : ""}`} />
                  </button>
                  {showSampleMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50"
                      style={{ ...GLASS, animation: "scaleIn 0.12s ease-out both" }}>
                      {[
                        { key: "postman", label: "Postman Collection", desc: "Auth API"    },
                        { key: "openapi", label: "OpenAPI 3.0",        desc: "Petstore"    },
                        { key: "custom",  label: "Custom JSON",        desc: "E-Commerce"  },
                      ].map(({ key, label, desc }) => (
                        <button key={key}
                          onClick={() => { onLoadSample(key); setShowSampleMenu(false); }}
                          className="w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors duration-100 hover:bg-white/5">
                          <span className="text-xs font-medium text-slate-300">{label}</span>
                          <span className="text-xs text-slate-600">{desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.08)" }} />
                <button onClick={handleFormat}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors duration-200">
                  <RefreshCw size={12} className={isFormatting ? "animate-spin" : ""} />
                  Format
                </button>
                <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="text-xs font-mono text-slate-600">
                  Ln {lineCount}, Col 1
                </span>
              </div>
            </div>

            {/* Editor body */}
            <div className="flex-1 flex overflow-hidden">

              {activeTab === "editor" ? (
                <>
                  {/* Line numbers */}
                  <div ref={lineNumRef}
                    className="flex-shrink-0 w-16 overflow-hidden select-none pt-7 pb-4 flex flex-col items-center gap-0"
                    style={{ background: "rgba(0,0,0,0.2)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                    {Array.from({ length: Math.max(lineCount, 20) }, (_, i) => (
                      <div key={i} className="text-right w-full pr-4 text-xs font-mono leading-[1.75]"
                        style={{ color: "rgba(255,255,255,0.12)" }}>
                        {String(i + 1).padStart(2, "0")}
                      </div>
                    ))}
                  </div>

                  {/* Textarea + empty state */}
                  <div className="flex-1 relative">
                    {!jsonText.trim() && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10 pointer-events-none z-10"
                        style={{ animation: "fadeIn 0.4s ease-out both" }}>
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                          style={{ background: "rgba(99,102,241,0.06)" }}>
                          <Braces size={28} style={{ color: "rgba(99,102,241,0.35)" }} />
                        </div>
                        <h3 className="text-base font-bold text-slate-400 mb-2 tracking-wide">Input Specification</h3>
                        <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
                          Paste your OpenAPI, Swagger, Postman or custom JSON/YAML here to generate a real-time graph.
                        </p>
                        <div className="mt-8 flex gap-3 pointer-events-auto">
                          <div className="relative">
                            <button onClick={() => setShowSampleMenu((v) => !v)}
                              className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors duration-200 hover:bg-white/10 flex items-center gap-2"
                              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                              <Download size={12} /> Load Sample
                            </button>
                            {showSampleMenu && (
                              <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl overflow-hidden z-50"
                                style={{ ...GLASS, animation: "scaleIn 0.12s ease-out both" }}>
                                {[
                                  { key: "postman", label: "Postman Collection" },
                                  { key: "openapi", label: "OpenAPI 3.0 Spec"   },
                                  { key: "custom",  label: "Custom JSON"        },
                                ].map(({ key, label }) => (
                                  <button key={key}
                                    onClick={() => { onLoadSample(key); setShowSampleMenu(false); }}
                                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors duration-100">
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setJsonText(""); setError(""); }}
                            className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors duration-200 hover:bg-white/10 text-slate-500"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            Clear All
                          </button>
                        </div>
                      </div>
                    )}
                    <textarea
                      ref={textareaRef}
                      value={jsonText}
                      onChange={(e) => { setJsonText(e.target.value); setError(""); }}
                      onScroll={handleTextareaScroll}
                      placeholder=""
                      spellCheck={false}
                      className="w-full h-full bg-transparent resize-none font-mono text-sm text-slate-300 p-7 focus:outline-none"
                      style={{ lineHeight: "1.75", caretColor: "#6366f1" }}
                    />
                  </div>
                </>
              ) : (
                /* Upload tab */
                <div className="flex-1 flex flex-col items-center justify-center p-10"
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}>
                  <div
                    className="w-full max-w-sm flex flex-col items-center justify-center rounded-2xl py-14 cursor-pointer transition-all duration-200"
                    style={{
                      border: isDragOver
                        ? "2px dashed rgba(99,102,241,0.6)"
                        : "2px dashed rgba(255,255,255,0.08)",
                      background: isDragOver ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.02)",
                    }}
                    onClick={() => fileInputRef.current?.click()}>
                    <div className="p-4 rounded-2xl mb-4" style={{ background: isDragOver ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)" }}>
                      <Upload size={28} style={{ color: isDragOver ? "#6366f1" : "rgba(255,255,255,0.2)" }} />
                    </div>
                    <p className="text-sm font-semibold text-slate-400 mb-1">
                      {isDragOver ? "Release to upload" : "Drop your file here"}
                    </p>
                    <p className="text-xs text-slate-600">or click to browse · .json .yaml .yml</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden"
                    onChange={(e) => handleFileRead(e.target.files?.[0])} />
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.25)" }}>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Engine Ready</span>
                </div>
                {detectedInputFormat && (
                  <div className="flex items-center gap-2">
                    <Code size={11} className="text-slate-600" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest"
                      style={{ animation: "fadeIn 0.2s ease-out both" }}>
                      {detectedInputFormat}
                    </span>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={11} className="text-red-400/70" />
                    <span className="text-xs text-red-400/70 font-medium">{error}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                {/* Keyboard shortcut hint */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="px-1 py-0.5 rounded text-xs font-mono text-slate-500"
                    style={{ background: "rgba(255,255,255,0.07)" }}>⌘</span>
                  <span className="px-1 py-0.5 rounded text-xs font-mono text-slate-500"
                    style={{ background: "rgba(255,255,255,0.07)" }}>ENTER</span>
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider ml-1">to run</span>
                </div>
                {/* Build Map button */}
                <button
                  onClick={handleVisualize}
                  disabled={!jsonText.trim()}
                  className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-200 active:scale-[0.97]
                    ${jsonText.trim()
                      ? "text-white hover:opacity-90"
                      : "text-slate-600 cursor-not-allowed"
                    }`}
                  style={jsonText.trim() ? {
                    background: "#6366f1",
                    boxShadow: "0 8px 20px -4px rgba(99,102,241,0.4)",
                  } : {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  Build Map
                </button>
              </div>
            </div>
          </div>

          {/* Bottom meta */}
          <div className="flex justify-center gap-12 mt-6">
            {[
              { icon: <CheckCircle size={13} />, label: "Secure · Local Only" },
              { icon: <Zap size={13} />,         label: "Instant Rendering"   },
              { icon: <Layers size={13} />,      label: "Multi-format"        },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-widest">
                {icon}{label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ApiPlaygroundModal — test an endpoint
// ─────────────────────────────────────────────
const ApiPlaygroundModal = ({ node, onClose }) => {
  const [method,   setMethod]   = useState(node?.method || "GET");
  const [url,      setUrl]      = useState(node?.path   || "");
  const [headers,  setHeaders]  = useState([
    { key: "Content-Type", value: "application/json" },
    { key: "Accept",       value: "*/*"               },
  ]);
  const [body,     setBody]     = useState(node?.body ? JSON.stringify(node.body, null, 2) : "");
  const [response, setResponse] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [reqError, setReqError] = useState("");
  const [curlCopied, setCurlCopied] = useState(false);
  const [activeTab, setActiveTab]   = useState("headers");

  const methodOptions = ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"];
  const mc = methodColor(method);

  const addHeader = () => setHeaders((h) => [...h, { key: "", value: "" }]);
  const removeHeader = (i) => setHeaders((h) => h.filter((_, idx) => idx !== i));
  const updateHeader = (i, field, val) =>
    setHeaders((h) => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const handleSend = async () => {
    if (!url.trim()) { setReqError("URL is required"); return; }
    setLoading(true);
    setReqError("");
    setResponse(null);
    try {
      const hObj = {};
      headers.forEach((h) => { if (h.key.trim()) hObj[h.key.trim()] = h.value; });
      const opts = { method, headers: hObj };
      if (["POST","PUT","PATCH"].includes(method) && body.trim()) opts.body = body;
      const t0  = Date.now();
      const res = await fetch(url, opts);
      const elapsed = Date.now() - t0;
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      setResponse({ status: res.status, statusText: res.statusText, elapsed, data, isJson: typeof data === "object" });
    } catch (err) {
      setReqError(err.message.includes("Failed to fetch")
        ? "Network error — CORS may be blocking this request. Try using a proxy or the browser extension."
        : "Request failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCurl = () => {
    const h = headers.filter(r => r.key.trim()).map(r => `-H "${r.key}: ${r.value}"`).join(" ");
    const b = ["POST","PUT","PATCH"].includes(method) && body.trim() ? ` -d '${body.replace(/'/g,"\\'")}' ` : " ";
    const curl = `curl -X ${method} ${h}${b}"${url}"`;
    navigator.clipboard.writeText(curl);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2500);
  };

  const statusColor = (s) => {
    if (!s) return "text-slate-400";
    if (s < 300) return "text-emerald-400";
    if (s < 400) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: "fadeIn 0.25s ease-out both" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-4xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", animation: "scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700/50 flex-shrink-0 bg-slate-900/80">
          <Terminal size={18} className="text-violet-400" />
          <span className="font-bold text-white text-base">API Playground</span>
          <span className="text-slate-500 text-sm">—</span>
          <span className="text-slate-400 text-sm truncate">{node?.name}</span>
          <button onClick={onClose} className="ml-auto p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-200 hover:scale-110">
            <X size={18} className="text-slate-400 hover:text-white transition-colors" />
          </button>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/30 flex-shrink-0 bg-slate-900/40">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={`bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm font-bold ${mc.text} focus:outline-none focus:border-violet-500 flex-shrink-0 cursor-pointer transition-all duration-200`}
          >
            {methodOptions.map((m) => (
              <option key={m} value={m} className="text-white">{m}</option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 bg-slate-800/60 border border-slate-700/40 hover:border-slate-600/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 rounded-lg px-4 py-2 text-sm text-white font-mono placeholder:text-slate-600 transition-all duration-200"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 flex-shrink-0
              ${loading
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30"
              }`}
          >
            {loading
              ? <><RefreshCw size={15} className="animate-spin" /> Sending…</>
              : <><Send size={15} /> Send</>
            }
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: tabs */}
          <div className="w-1/2 flex flex-col border-r border-slate-700/40">
            <div className="flex border-b border-slate-700/30 flex-shrink-0">
              {["headers", "body"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                    activeTab === t ? "text-violet-400 border-b-2 border-violet-400 bg-slate-800/30" : "text-slate-500 hover:text-slate-400"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {activeTab === "headers" ? (
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center"
                    style={{ animation: `slideInUp 0.25s ease-out ${i*40}ms both` }}>
                    <input
                      value={h.key}
                      onChange={(e) => updateHeader(i, "key", e.target.value)}
                      placeholder="Key"
                      className="flex-1 bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 focus:border-cyan-500/70 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono placeholder:text-slate-600 transition-all duration-200 min-w-0"
                    />
                    <input
                      value={h.value}
                      onChange={(e) => updateHeader(i, "value", e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 focus:border-cyan-500/70 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono placeholder:text-slate-600 transition-all duration-200 min-w-0"
                    />
                    <button onClick={() => removeHeader(i)}
                      className="p-1.5 hover:bg-red-900/30 rounded text-slate-600 hover:text-red-400 transition-all duration-200 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={addHeader}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors duration-200 mt-2 group">
                  <Plus size={13} className="group-hover:rotate-90 transition-transform duration-300" />
                  Add Header
                </button>
              </div>
            ) : (
              <div className="flex-1 relative overflow-hidden p-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={'{\n  "key": "value"\n}'}
                  spellCheck={false}
                  className="w-full h-full bg-transparent resize-none text-xs font-mono text-slate-300 placeholder:text-slate-600 p-2 focus:outline-none"
                  style={{ lineHeight: "1.7" }}
                />
              </div>
            )}
          </div>

          {/* Right: Response */}
          <div className="w-1/2 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/30 flex-shrink-0 bg-slate-900/30">
              <Globe size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Response</span>
              {response && (
                <div className="flex items-center gap-2 ml-auto" style={{ animation: "fadeIn 0.3s ease-out both" }}>
                  <span className={`text-xs font-bold ${statusColor(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-xs text-slate-600">{response.elapsed}ms</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loading && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <RefreshCw size={28} className="text-violet-400 animate-spin" />
                  <p className="text-slate-500 text-sm">Sending request…</p>
                </div>
              )}
              {!loading && reqError && (
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4"
                  style={{ animation: "slideInUp 0.3s ease-out both" }}>
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300 leading-relaxed">{reqError}</p>
                  </div>
                </div>
              )}
              {!loading && !reqError && response && (
                <div style={{ animation: "slideInUp 0.3s ease-out both" }}>
                  <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                    {response.isJson
                      ? JSON.stringify(response.data, null, 2)
                      : response.data}
                  </pre>
                </div>
              )}
              {!loading && !reqError && !response && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                  <Send size={32} className="text-slate-700" />
                  <p className="text-slate-600 text-sm">Hit Send to see the response</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/40 flex-shrink-0 bg-slate-900/50">
          <button onClick={handleCopyCurl}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-violet-400 transition-all duration-200 group font-mono">
            {curlCopied
              ? <><CheckCircle size={13} className="text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
              : <><Copy size={13} className="group-hover:scale-110 transition-transform duration-200" /> Copy as cURL</>
            }
          </button>
          <p className="text-xs text-slate-600">CORS restrictions may apply when calling external APIs</p>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// RequestDetailsPanel
// ─────────────────────────────────────────────
const RequestDetailsPanel = ({ node, onClose, onTest }) => {
  const [copied,    setCopied]    = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => { setActiveTab("overview"); }, [node?.id]);

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!node || node.type !== "request") {
    return (
      <div className="w-80 bg-gradient-to-b from-slate-950/80 to-slate-950/60 border-l border-slate-700/40 flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-500">
        <div style={{ animation: "scaleIn 0.4s ease-out both" }} className="text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
            <Eye size={28} className="text-slate-600" />
          </div>
          <p className="text-slate-500 text-sm">Select a request node<br />to view its details</p>
        </div>
      </div>
    );
  }

  const mc  = methodColor(node.method);
  const tabs = ["overview","headers","body","docs"];

  return (
    <div className="w-80 bg-gradient-to-b from-slate-950/90 to-slate-950/70 border-l border-slate-700/40 flex flex-col backdrop-blur-sm transition-all duration-300"
      style={{ animation: "slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}>

      {/* Panel header */}
      <div className="px-4 py-3.5 border-b border-slate-700/40 flex items-center justify-between flex-shrink-0 bg-slate-900/60 backdrop-blur">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Request Details</p>
          <p className="text-base font-bold text-white mt-0.5 truncate">{node.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-200 hover:scale-110">
          <X size={17} className="text-slate-400 hover:text-white transition-colors" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/40 flex-shrink-0 bg-slate-900/30">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              activeTab === tab
                ? "text-violet-400 border-b-2 border-violet-400 bg-slate-800/30"
                : "text-slate-600 hover:text-slate-400"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">

        {activeTab === "overview" && (
          <div className="p-5 space-y-5" style={{ animation: "fadeIn 0.25s ease-out both" }}>
            <div>
              <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full uppercase ${mc.bg} ${mc.text}`}>{node.method}</span>
              <h3 className="text-lg font-bold text-white mt-2">{node.name}</h3>
            </div>

            {node.path && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Endpoint</p>
                  <button onClick={() => copyText(node.path)}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-all duration-200 hover:scale-105">
                    <Copy size={11} />{copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="bg-slate-900/50 border border-slate-700/40 rounded-lg p-3 hover:border-slate-600/60 transition-colors duration-200">
                  <p className="text-xs text-cyan-400 font-mono break-all">{node.path}</p>
                </div>
              </div>
            )}

            <div className="bg-slate-900/30 border border-slate-700/30 rounded-lg p-4 hover:border-slate-600/50 transition-colors duration-200">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-violet-400 animate-pulse" />
                <p className="text-sm font-semibold text-white">Quick Status</p>
              </div>
              {[
                { label: "Method", value: node.method, cls: "text-white font-semibold" },
                { label: "Status", value: <span className="text-emerald-400 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />Active</span> },
                { label: "Auth", value: <span className="text-amber-400 font-semibold">Required</span> },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between text-sm py-1 border-b border-slate-800/50 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className={cls}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "headers" && (
          <div className="p-5 space-y-3" style={{ animation: "fadeIn 0.25s ease-out both" }}>
            {node.headers?.length ? (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
                  Headers
                  <span className="text-violet-400 bg-violet-600/15 px-2 py-0.5 rounded-full">{node.headers.length} Active</span>
                </p>
                {node.headers.map((h, i) => (
                  <div key={i} className="bg-slate-900/30 border border-slate-700/30 rounded-lg p-3 hover:border-slate-600/50 transition-colors duration-200"
                    style={{ animation: `slideInUp 0.25s ease-out ${i*50}ms both` }}>
                    <p className="text-xs font-semibold text-slate-400 mb-0.5">{h.key}</p>
                    <p className="text-xs text-slate-300 font-mono break-all">{h.value}</p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-slate-600 text-sm text-center py-10">No headers configured</p>
            )}
          </div>
        )}

        {activeTab === "body" && (
          <div className="p-5 space-y-3" style={{ animation: "fadeIn 0.25s ease-out both" }}>
            {node.body ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Request Body</p>
                  <button onClick={() => copyText(JSON.stringify(node.body, null, 2))}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-all duration-200">
                    <Copy size={11} />{copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="bg-slate-900/40 border border-slate-700/30 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-auto max-h-72 whitespace-pre-wrap break-words hover:border-slate-600/50 transition-colors duration-200">
                  {JSON.stringify(node.body, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-slate-600 text-sm text-center py-10">No request body</p>
            )}
          </div>
        )}

        {activeTab === "docs" && (
          <div className="p-5 space-y-4" style={{ animation: "fadeIn 0.25s ease-out both" }}>
            {node.description ? (
              <div className="bg-slate-900/30 border border-slate-700/30 rounded-lg p-4 hover:border-slate-600/50 transition-colors duration-200">
                <p className="text-sm text-slate-300 leading-relaxed">{node.description}</p>
              </div>
            ) : (
              <p className="text-slate-600 text-sm text-center py-10">No documentation available</p>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-slate-700/40 flex-shrink-0 bg-slate-900/60 space-y-2.5">
        <button
          onClick={onTest}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all duration-250 flex items-center justify-center gap-2 group hover:shadow-lg hover:shadow-violet-500/25 active:scale-95"
        >
          <Play size={15} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          Test in Playground
        </button>
        <button className="w-full bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/40 hover:border-slate-600/60 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-250 flex items-center justify-center gap-2 active:scale-95">
          <Share2 size={15} />
          Share Request
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// PostmanGraphViewer — main component
// ─────────────────────────────────────────────
const PostmanGraphViewer = () => {
  const fileInputRef = useRef(null);
  const canvasRef    = useRef(null);
  const paperRef     = useRef(null);

  // view: 'input' | 'graph'
  const [view,           setView]          = useState("input");
  const [collection,     setCollection]    = useState(null);
  const [nodes,          setNodes]         = useState([]);
  const [selectedNode,   setSelectedNode]  = useState(null);
  const [nodePositions,  setNodePositions] = useState({});
  const [zoom,           setZoom]          = useState(1);
  const [panX,           setPanX]          = useState(0);
  const [panY,           setPanY]          = useState(0);
  const [draggedNodeId,  setDraggedNodeId] = useState(null);
  const [dragOffset,     setDragOffset]    = useState({ x: 0, y: 0 });
  const [searchQuery,    setSearchQuery]   = useState("");
  const [filterMethod,   setFilterMethod]  = useState("all");
  const [graphStyle,     setGraphStyle]    = useState("tree");
  const [showGraphMenu,  setShowGraphMenu] = useState(false);
  const [showMenu,       setShowMenu]      = useState(false);
  const [showPlayground, setShowPlayground]= useState(false);
  const [stats,          setStats]         = useState({ total:0, get:0, post:0, put:0, delete:0 });
  const [detectedFormat, setDetectedFormat] = useState("");

  // ── Derived state ────────────────────────
  const filteredNodes = useMemo(() => nodes.filter((n) => {
    const ms = n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
               n.path?.toLowerCase().includes(searchQuery.toLowerCase());
    const mf = filterMethod === "all" || n.method === filterMethod || n.type !== "request";
    return ms && mf;
  }), [nodes, searchQuery, filterMethod]);

  const highlightedIds = useMemo(() => {
    if (!searchQuery) return new Set();
    return new Set(nodes.filter((n) =>
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.path?.toLowerCase().includes(searchQuery.toLowerCase())
    ).map((n) => n.id));
  }, [nodes, searchQuery]);

  const contentBounds = useMemo(() => {
    const positions = Object.values(nodePositions);
    if (!positions.length) return { w: 1600, h: 900 };
    const maxX = Math.max(...positions.map((p) => p.x));
    const maxY = Math.max(...positions.map((p) => p.y));
    return { w: maxX + 520, h: maxY + 320 };
  }, [nodePositions]);

  // ── Layout calculation ───────────────────
  const calculatePositions = useCallback((nodesData) => {
    const pos = {};
    const root = nodesData.find((n) => n.type === "root");
    if (!root) return pos;
    pos[root.id] = { x: 120, y: 300 };

    // Helpers — separate root's direct children into folders vs bare requests
    const rootFolders   = nodesData.filter((n) => n.parentId === root.id && n.type === "folder");
    const rootRequests  = nodesData.filter((n) => n.parentId === root.id && n.type === "request");
    const isFlatCollection = rootFolders.length === 0 && rootRequests.length > 0;

    if (graphStyle === "tree") {
      let y = 60;

      if (isFlatCollection) {
        // Flat: place all requests in a single column to the right of root
        rootRequests.forEach((node) => {
          pos[node.id] = { x: 420, y };
          y += 100;
        });
        // Re-centre root vertically
        pos[root.id] = { x: 120, y: Math.max(0, (y - 100) / 2 - 30) };
      } else {
        rootFolders.forEach((node) => {
          pos[node.id] = { x: 400, y };
          let childY = y - 20;
          nodesData.forEach((child) => {
            if (child.parentId !== node.id) return;
            pos[child.id] = { x: 720, y: childY };
            childY += 100;
          });
          const childCount = nodesData.filter((c) => c.parentId === node.id).length;
          y += Math.max(170, childCount * 100 + 40);
        });
        // Also position any bare requests directly on root (mixed collections)
        rootRequests.forEach((node) => {
          pos[node.id] = { x: 400, y };
          y += 100;
        });
      }

    } else if (graphStyle === "flowchart") {
      let y = 60;

      if (isFlatCollection) {
        rootRequests.forEach((node) => {
          pos[node.id] = { x: 440, y };
          y += 110;
        });
        pos[root.id] = { x: 120, y: Math.max(0, (y - 110) / 2 - 30) };
      } else {
        rootFolders.forEach((node) => {
          pos[node.id] = { x: 420, y };
          let childY = y - 30;
          nodesData.forEach((child) => {
            if (child.parentId !== node.id) return;
            pos[child.id] = { x: 740, y: childY };
            childY += 110;
          });
          const childCount = nodesData.filter((c) => c.parentId === node.id).length;
          y += Math.max(180, childCount * 110 + 40);
        });
        rootRequests.forEach((node) => {
          pos[node.id] = { x: 420, y };
          y += 110;
        });
      }

    } else if (graphStyle === "radial") {
      const cx = 680, cy = 420, r1 = 280, r2 = 480;
      pos[root.id] = { x: cx - 112, y: cy - 50 };

      if (isFlatCollection) {
        // Place bare requests in a circle directly around root
        rootRequests.forEach((node, i) => {
          const a = (i / rootRequests.length) * Math.PI * 2 - Math.PI / 2;
          pos[node.id] = { x: cx + Math.cos(a) * r1 - 128, y: cy + Math.sin(a) * r1 - 50 };
        });
      } else {
        rootFolders.forEach((folder, fi) => {
          const a = (fi / rootFolders.length) * Math.PI * 2 - Math.PI / 2;
          pos[folder.id] = { x: cx + Math.cos(a) * r1 - 104, y: cy + Math.sin(a) * r1 - 50 };
          const children = nodesData.filter((c) => c.parentId === folder.id);
          children.forEach((child, ci) => {
            const spread = 0.4;
            const ca = a + (ci - (children.length - 1) / 2) * spread / Math.max(1, children.length - 1) * 2;
            pos[child.id] = { x: cx + Math.cos(ca) * r2 - 128, y: cy + Math.sin(ca) * r2 - 50 };
          });
        });
        rootRequests.forEach((node, i) => {
          const a = (i / Math.max(1, rootRequests.length)) * Math.PI * 2 - Math.PI / 2;
          pos[node.id] = { x: cx + Math.cos(a) * r2 - 128, y: cy + Math.sin(a) * r2 - 50 };
        });
      }

    } else {
      // mindmap — balanced branches expanding left / right from a vertically-centered root
      const CHILD_STEP = 94;
      const GROUP_GAP  = 68;
      const ROOT_X     = 660;
      const FOLD_X_L   = 360;
      const CHILD_X_L  = 40;
      const FOLD_X_R   = 956;
      const CHILD_X_R  = 1228;

      if (isFlatCollection) {
        // Split bare requests left / right
        const lefts  = rootRequests.filter((_, i) => i % 2 === 0);
        const rights = rootRequests.filter((_, i) => i % 2 !== 0);
        const totalH = Math.max(lefts.length, rights.length) * CHILD_STEP + GROUP_GAP;
        pos[root.id] = { x: ROOT_X, y: totalH / 2 - 44 };
        lefts.forEach((node, i) => {
          pos[node.id] = { x: CHILD_X_L, y: i * CHILD_STEP };
        });
        rights.forEach((node, i) => {
          pos[node.id] = { x: CHILD_X_R, y: i * CHILD_STEP };
        });
      } else {
        const folders = rootFolders;
        const lefts = [], rights = [];
        folders.forEach((n, fi) => (fi % 2 === 0 ? lefts : rights).push(n));

        const numChildren = (f) => nodesData.filter((c) => c.parentId === f.id).length;
        const groupH      = (f) => Math.max(1, numChildren(f)) * CHILD_STEP + GROUP_GAP;
        const totalH      = (arr) => arr.reduce((s, f) => s + groupH(f), 0);
        const maxH        = Math.max(totalH(lefts), totalH(rights), 260);

        pos[root.id] = { x: ROOT_X, y: maxH / 2 - 44 };

        const placeGroup = (arr, folderX, childX) => {
          let y = 0;
          arr.forEach((folder) => {
            const children = nodesData.filter((c) => c.parentId === folder.id);
            const gh        = groupH(folder);
            const usable    = gh - GROUP_GAP;
            pos[folder.id] = { x: folderX, y: y + usable / 2 - 40 };
            const span  = (children.length - 1) * CHILD_STEP;
            const start = y + usable / 2 - span / 2 - 44;
            children.forEach((child, ci) => {
              pos[child.id] = { x: childX, y: start + ci * CHILD_STEP };
            });
            y += gh;
          });
        };

        placeGroup(lefts,  FOLD_X_L, CHILD_X_L);
        placeGroup(rights, FOLD_X_R, CHILD_X_R);

        // Bare requests on root in a mixed collection — append to right side
        rootRequests.forEach((node, i) => {
          pos[node.id] = { x: CHILD_X_R, y: totalH(rights) + i * CHILD_STEP };
        });
      }
    }
    return pos;
  }, [graphStyle]);

  // ── Parse JSON / collection (multi-format) ──
  const parseCollection = useCallback((data) => {
    const format = Array.isArray(data) ? "custom" : detectFormat(data);
    setDetectedFormat(Array.isArray(data) ? "Custom JSON" : formatLabel(data));

    // OpenAPI / Swagger
    if (format === "openapi") return parseOpenApi(data, setStats);

    // Custom API JSON
    if (format === "custom") return parseCustomApi(data, setStats);

    // Postman collection (original logic)
    const allNodes = [];
    let id = 0;
    const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

    const root = {
      id: "node-root",
      name: data.info?.name || data.name || "API Collection",
      version: data.info?.version || "v1.0",
      type: "root",
      parentId: null,
      itemCount: 0,
    };
    allNodes.push(root);

    const processItem = (item, parentId) => {
      const nodeId = `node-${id++}`;
      if (item.item && Array.isArray(item.item)) {
        allNodes.push({
          id: nodeId,
          name: item.name,
          type: "folder",
          parentId,
          itemCount: item.item.length,
          description: item.description?.content || item.description || "",
        });
        item.item.forEach((child) => processItem(child, nodeId));
      } else {
        const req = item.request || item;
        const url = typeof req.url === "string" ? req.url : req.url?.raw || item.url || "";
        const method = (req.method || item.method || "GET").toUpperCase();
        s[method.toLowerCase()] = (s[method.toLowerCase()] || 0) + 1;
        s.total++;
        let body = null;
        try { body = req.body?.raw ? JSON.parse(req.body.raw) : req.body || null; } catch { body = req.body || null; }
        allNodes.push({
          id: nodeId,
          name: item.name,
          type: "request",
          parentId,
          method,
          path: url,
          description: item.description?.content || req.description?.content || item.description || "",
          body,
          headers: [
            { key: "Content-Type", value: "application/json" },
            { key: "Accept",       value: "*/*"               },
            { key: "Authorization",value: "Bearer <token>"    },
          ],
        });
      }
    };

    if (data.item && Array.isArray(data.item)) {
      data.item.forEach((item) => processItem(item, "node-root"));
    }
    root.itemCount = allNodes.length - 1;
    setStats(s);
    return allNodes;
  }, []);

  // ── Handle visualize / load ──────────────
  const handleVisualize = useCallback((data) => {
    const parsed = parseCollection(data);
    setCollection(data);
    setNodes(parsed);
    setSelectedNode(null);
    setZoom(1); setPanX(0); setPanY(0);
    setView("graph");
  }, [parseCollection]);

  const handleLoadSample = useCallback((format = "postman") => {
    const samples = {
      postman: {
        info: { name: "Auth API Collection", version: "v2.4.0" },
        item: [
          { name: "User Management", item: [
            { name: "User Login",     request: { method: "POST",   url: "https://api.example.com/v1/auth/login",    description: { content: "Authenticates a user and returns a bearer token." } } },
            { name: "Get Profile",    request: { method: "GET",    url: "https://api.example.com/v1/user/profile"  } },
            { name: "Update Profile", request: { method: "PUT",    url: "https://api.example.com/v1/user/profile"  } },
            { name: "Delete Account", request: { method: "DELETE", url: "https://api.example.com/v1/user/:id"      } },
          ]},
          { name: "Payment Gateway", item: [
            { name: "Create Payment",     request: { method: "POST", url: "https://api.example.com/v1/payments",     body: { raw: '{"amount":100,"currency":"USD"}' } } },
            { name: "Get Payment Status", request: { method: "GET",  url: "https://api.example.com/v1/payments/:id" } },
            { name: "Refund Payment",     request: { method: "POST", url: "https://api.example.com/v1/payments/:id/refund" } },
          ]},
          { name: "Products", item: [
            { name: "List Products",  request: { method: "GET",    url: "https://api.example.com/v1/products"        } },
            { name: "Create Product", request: { method: "POST",   url: "https://api.example.com/v1/products"        } },
            { name: "Update Product", request: { method: "PATCH",  url: "https://api.example.com/v1/products/:id"    } },
            { name: "Delete Product", request: { method: "DELETE", url: "https://api.example.com/v1/products/:id"    } },
          ]},
        ],
      },
      openapi: {
        openapi: "3.0.3",
        info: { title: "Petstore API", version: "1.0.0", description: "A sample pet store API" },
        servers: [{ url: "https://petstore.example.com/api/v1" }],
        paths: {
          "/pets": {
            get:  { tags: ["Pets"], operationId: "listPets", summary: "List all pets", description: "Returns a paginated list of pets" },
            post: { tags: ["Pets"], operationId: "createPet", summary: "Create a pet", description: "Creates a new pet in the store", requestBody: { content: { "application/json": { example: { name: "Buddy", species: "dog", age: 3 } } } } },
          },
          "/pets/{petId}": {
            get:    { tags: ["Pets"], operationId: "getPet", summary: "Get pet by ID", description: "Returns a single pet" },
            put:    { tags: ["Pets"], operationId: "updatePet", summary: "Update a pet", description: "Updates an existing pet", requestBody: { content: { "application/json": { example: { name: "Buddy", age: 4 } } } } },
            delete: { tags: ["Pets"], operationId: "deletePet", summary: "Delete a pet", description: "Deletes a pet from the store" },
          },
          "/store/inventory": {
            get: { tags: ["Store"], operationId: "getInventory", summary: "Get inventory", description: "Returns pet inventories by status" },
          },
          "/store/orders": {
            post: { tags: ["Store"], operationId: "placeOrder", summary: "Place an order", description: "Place a new order for a pet", requestBody: { content: { "application/json": { example: { petId: 1, quantity: 1 } } } } },
          },
          "/store/orders/{orderId}": {
            get:    { tags: ["Store"], operationId: "getOrder", summary: "Get order by ID", description: "Returns the order details" },
            delete: { tags: ["Store"], operationId: "deleteOrder", summary: "Delete order", description: "Cancel and delete an order" },
          },
          "/users/login":  { post: { tags: ["Users"], operationId: "loginUser", summary: "User login", description: "Logs in and returns auth token" } },
          "/users/logout": { post: { tags: ["Users"], operationId: "logoutUser", summary: "User logout", description: "Logs out the current user" } },
          "/users/{userId}": {
            get: { tags: ["Users"], operationId: "getUser", summary: "Get user profile", description: "Returns the user profile" },
            put: { tags: ["Users"], operationId: "updateUser", summary: "Update user", description: "Update user profile information" },
          },
        },
      },
      custom: {
        name: "E-Commerce API",
        version: "v3.1",
        "Authentication": [
          { name: "Register",       method: "POST",   url: "https://api.shop.io/v3/auth/register" },
          { name: "Login",          method: "POST",   url: "https://api.shop.io/v3/auth/login", body: { email: "user@example.com", password: "secret" } },
          { name: "Refresh Token",  method: "POST",   url: "https://api.shop.io/v3/auth/refresh" },
          { name: "Current User",   method: "GET",    url: "https://api.shop.io/v3/auth/me" },
        ],
        "Products": [
          { name: "Search Products", method: "GET",    url: "https://api.shop.io/v3/products?q=shoes" },
          { name: "Get Product",     method: "GET",    url: "https://api.shop.io/v3/products/:id" },
          { name: "Create Product",  method: "POST",   url: "https://api.shop.io/v3/products", body: { title: "Sneakers", price: 79.99 } },
          { name: "Update Product",  method: "PATCH",  url: "https://api.shop.io/v3/products/:id" },
          { name: "Delete Product",  method: "DELETE", url: "https://api.shop.io/v3/products/:id" },
        ],
        "Cart": [
          { name: "Get Cart",       method: "GET",    url: "https://api.shop.io/v3/cart" },
          { name: "Add to Cart",    method: "POST",   url: "https://api.shop.io/v3/cart/items", body: { productId: 42, quantity: 1 } },
          { name: "Remove Item",    method: "DELETE", url: "https://api.shop.io/v3/cart/items/:id" },
          { name: "Checkout",       method: "POST",   url: "https://api.shop.io/v3/cart/checkout" },
        ],
      },
    };
    handleVisualize(samples[format] || samples.postman);
  }, [handleVisualize]);

  // ── Recalculate on style / nodes change ──
  useEffect(() => {
    if (nodes.length > 0) {
      setNodePositions(calculatePositions(nodes));
    }
  }, [graphStyle, nodes, calculatePositions]);

  // ── Drag — corrected for zoom/pan ────────
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cur = nodePositions[nodeId];
    if (!cur) return;
    const scrollLeft = canvasRef.current?.scrollLeft || 0;
    const scrollTop  = canvasRef.current?.scrollTop  || 0;
    const mx = (e.clientX - rect.left + scrollLeft) / zoom - panX;
    const my = (e.clientY - rect.top  + scrollTop)  / zoom - panY;
    setDragOffset({ x: mx - cur.x, y: my - cur.y });
    setDraggedNodeId(nodeId);
  }, [nodePositions, zoom, panX, panY]);

  useEffect(() => {
    if (!draggedNodeId) return;
    const onMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollLeft = canvasRef.current?.scrollLeft || 0;
      const scrollTop  = canvasRef.current?.scrollTop  || 0;
      const mx = (e.clientX - rect.left + scrollLeft) / zoom - panX;
      const my = (e.clientY - rect.top  + scrollTop)  / zoom - panY;
      setNodePositions((prev) => ({
        ...prev,
        [draggedNodeId]: { x: mx - dragOffset.x, y: my - dragOffset.y },
      }));
    };
    const onUp = () => setDraggedNodeId(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  }, [draggedNodeId, dragOffset, zoom, panX, panY]);

  // ── Keyboard shortcuts ───────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector('input[placeholder*="Search"]')?.focus();
      }
      if (e.key === "Escape") { setSelectedNode(null); setShowPlayground(false); }
      if (e.key === "Delete" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA")
        setSearchQuery("");
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const s = 24;
        if (e.key === "ArrowUp")    setPanY((p) => p + s);
        if (e.key === "ArrowDown")  setPanY((p) => p - s);
        if (e.key === "ArrowLeft")  setPanX((p) => p + s);
        if (e.key === "ArrowRight") setPanX((p) => p - s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Wheel zoom ───────────────────────────
  useEffect(() => {
    if (view !== "graph") return;
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(3, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 0.9))));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  const handleReset = () => { setZoom(1); setPanX(0); setPanY(0); };

  const handleFitView = useCallback(() => {
    const positions = Object.values(nodePositions);
    if (!positions.length || !canvasRef.current) return;
    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x)) + 280;
    const maxY = Math.max(...positions.map((p) => p.y)) + 110;
    const cW   = canvasRef.current.offsetWidth;
    const cH   = canvasRef.current.offsetHeight;
    const newZoom = Math.min(cW / (maxX - minX + 80), cH / (maxY - minY + 80), 1.4);
    setZoom(newZoom);
    setPanX(-minX + 40 / newZoom);
    setPanY(-minY + 40 / newZoom);
    canvasRef.current.scrollLeft = 0;
    canvasRef.current.scrollTop  = 0;
  }, [nodePositions]);

  const GRAPH_STYLES = ["tree","flowchart","radial","mindmap"];

  // ──────────────────────────────────────────
  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-100 flex flex-col overflow-hidden">
      <style>{GLOBAL_STYLES}</style>

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-slate-900/90 to-slate-800/80 border-b border-slate-700/40 px-5 py-3 flex items-center gap-4 backdrop-blur-xl flex-shrink-0 transition-all duration-300 relative z-50">
        {/* Logo / Back */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {view === "graph" && (
            <button onClick={() => setView("input")}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all duration-200 hover:scale-105 group">
              <ArrowLeft size={17} className="group-hover:-translate-x-0.5 transition-transform duration-200" />
            </button>
          )}
          <div className="text-xl font-black bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent tracking-tight">
            Snap-Map
          </div>
          {view === "graph" && collection && (
            <span className="text-sm text-slate-500 truncate max-w-40">
              {collection.info?.name || "API Collection"}
            </span>
          )}
        </div>

        {view === "graph" && (
          <div className="flex items-center gap-3 ml-auto">
            {/* Search */}
            <div className="relative group">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-slate-400 transition-colors" />
              <input
                type="text"
                placeholder="Search… (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 bg-slate-800/50 border border-slate-700/40 rounded-lg py-1.5 pl-9 pr-8 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200 backdrop-blur-sm"
              />
              {searchQuery && (
                <>
                  <span className="absolute right-7 top-1/2 -translate-y-1/2 text-xs text-violet-400 font-semibold">
                    {highlightedIds.size}
                  </span>
                  <button onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                    <X size={13} />
                  </button>
                </>
              )}
            </div>

            {/* Method filter */}
            <div className="flex items-center gap-0.5 bg-slate-800/40 border border-slate-700/40 rounded-lg p-1">
              {["all","GET","POST","PUT","DELETE"].map((m) => (
                <button key={m} onClick={() => setFilterMethod(m)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all duration-200 ${
                    filterMethod === m
                      ? "bg-violet-600 text-white shadow-md shadow-violet-500/20"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {m === "all" ? "All" : m}
                </button>
              ))}
            </div>

            {/* Graph style picker */}
            <div className="relative">
              <button onClick={() => setShowGraphMenu(!showGraphMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/10 border border-violet-600/30 rounded-lg hover:border-violet-500/60 hover:bg-violet-600/20 transition-all duration-200 text-violet-400 text-sm font-semibold group">
                <Code size={14} />
                {graphStyle.charAt(0).toUpperCase() + graphStyle.slice(1)}
                <ChevronDown size={14} className={`transition-transform duration-300 ${showGraphMenu ? "rotate-180" : ""}`} />
              </button>
              {showGraphMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-slate-800/95 border border-slate-700/60 rounded-xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden"
                  style={{ animation: "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  {GRAPH_STYLES.map((s, i) => (
                    <button key={s} onClick={() => { setGraphStyle(s); setShowGraphMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-200 border-l-2 hover:bg-slate-700/40 ${
                        graphStyle === s ? "text-violet-400 border-violet-500 bg-violet-600/10" : "text-slate-300 border-transparent"
                      }`}
                      style={{ animation: `slideInUp 0.2s ease-out ${i*40}ms both` }}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Menu */}
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-slate-800/60 rounded-lg transition-all duration-200 text-slate-400 hover:text-white">
                <Menu size={18} />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-slate-800/95 border border-slate-700/60 rounded-xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden"
                  style={{ animation: "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  <button onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/40 text-slate-300 hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200">
                    <Upload size={14} className="text-cyan-400" /> Import JSON / YAML File
                  </button>
                  <button onClick={() => { handleLoadSample("postman"); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/40 text-slate-300 hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200">
                    <Download size={14} className="text-amber-400" /> Postman Sample
                  </button>
                  <button onClick={() => { handleLoadSample("openapi"); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/40 text-slate-300 hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200">
                    <Download size={14} className="text-blue-400" /> OpenAPI Sample
                  </button>
                  <button onClick={() => { handleLoadSample("custom"); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/40 text-slate-300 hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200">
                    <Download size={14} className="text-violet-400" /> Custom JSON Sample
                  </button>
                  <div className="border-t border-slate-700/40 my-1" />
                  <button onClick={() => { handleReset(); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/40 text-slate-300 hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200">
                    <RotateCcw size={14} className="text-slate-400" /> Reset View
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Stats bar (graph view only) ── */}
      {view === "graph" && (
        <div className="bg-slate-900/40 border-b border-slate-700/30 px-5 py-2 flex items-center gap-6 flex-shrink-0 backdrop-blur-sm"
          style={{ animation: "slideInUp 0.3s ease-out both" }}>
          {[
            { label: "TOTAL",  val: stats.total,  cls: "text-white"       },
            { label: "GET",    val: stats.get,    cls: "text-emerald-400", dot: "bg-emerald-500" },
            { label: "POST",   val: stats.post,   cls: "text-amber-400",   dot: "bg-amber-500"   },
            { label: "PUT",    val: stats.put,    cls: "text-blue-400",    dot: "bg-blue-500"    },
            { label: "PATCH",  val: stats.patch,  cls: "text-purple-400",  dot: "bg-purple-500"  },
            { label: "DELETE", val: stats.delete, cls: "text-red-400",     dot: "bg-red-500"     },
          ].map(({ label, val, cls, dot }) => (
            <div key={label} className="flex items-center gap-2">
              {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
              <span className="text-xs text-slate-500 font-bold">{label}</span>
              <span className={`text-sm font-bold ${cls}`}>{val}</span>
            </div>
          ))}
          {detectedFormat && (
            <div className="ml-auto flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/40 rounded-full px-3 py-1 text-xs font-bold text-slate-400">
              <Code size={10} className="text-violet-400" />
              {detectedFormat}
            </div>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      {view === "input" ? (
        <JsonInputScreen onVisualize={handleVisualize} onLoadSample={handleLoadSample} />
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ animation: "fadeIn 0.35s ease-out both" }}>

          {/* Canvas wrapper — relative so toolbar can stay pinned while canvas scrolls */}
          <div className="flex-1 relative overflow-hidden">

            {/* Scrollable canvas */}
            <div
              ref={canvasRef}
              className="absolute inset-0 overflow-auto"
              onClick={(e) => {
                if (e.target === canvasRef.current || e.target === paperRef.current) setSelectedNode(null);
              }}
            >
              {/* Paper — explicit size triggers native scrollbars when content overflows */}
              <div
                ref={paperRef}
                style={{
                  position: "relative",
                  width: contentBounds.w * zoom,
                  height: contentBounds.h * zoom,
                  minWidth: "100%",
                  minHeight: "100%",
                  backgroundImage: `linear-gradient(rgba(71,85,105,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.12) 1px, transparent 1px)`,
                  backgroundSize: `${36 * zoom}px ${36 * zoom}px`,
                }}
              >
                {/* SVG Connections */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                    transformOrigin: "0 0",
                  }}
                >
                  <ConnectionLines nodes={filteredNodes} nodePositions={nodePositions} graphStyle={graphStyle} />
                </div>

                {/* Node cards */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                    transformOrigin: "0 0",
                    transition: draggedNodeId ? "none" : "transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  {filteredNodes.map((node, idx) => {
                    const pos = nodePositions[node.id] || { x: 100, y: 100 };
                    return (
                      <GraphCard
                        key={node.id}
                        node={node}
                        position={pos}
                        isSelected={selectedNode?.id === node.id}
                        isDragging={draggedNodeId === node.id}
                        isHighlighted={highlightedIds.has(node.id)}
                        entranceDelay={Math.min(idx * 35, 500)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onSelect={() => setSelectedNode(node)}
                        onCopy={() => {}}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Toolbar — pinned to bottom-left of wrapper, unaffected by scroll */}
            <div className="absolute bottom-5 left-5 flex items-center gap-1 bg-slate-900/85 border border-slate-700/50 rounded-xl p-1.5 z-30 backdrop-blur-xl shadow-2xl shadow-black/40"
              style={{ animation: "slideInUp 0.4s cubic-bezier(0.34,1.56,0.64,1) 300ms both" }}>
              <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200 text-slate-400 hover:text-violet-400 hover:scale-110" title="Zoom In (Ctrl+scroll)">
                <ZoomIn size={15} />
              </button>
              <span className="text-xs text-slate-400 w-10 text-center font-mono font-bold tabular-nums">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200 text-slate-400 hover:text-violet-400 hover:scale-110" title="Zoom Out">
                <ZoomOut size={15} />
              </button>
              <div className="w-px h-5 bg-slate-700/60 mx-0.5" />
              <button onClick={handleFitView}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200 text-slate-400 hover:text-violet-400 hover:scale-110" title="Fit All Nodes">
                <Maximize2 size={15} />
              </button>
              <button onClick={handleReset}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all duration-200 text-slate-400 hover:text-violet-400 hover:scale-110" title="Reset View">
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Empty state hint */}
            {filteredNodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center" style={{ animation: "scaleIn 0.4s ease-out both" }}>
                  <Search size={40} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-600">No nodes match your search</p>
                </div>
              </div>
            )}
          </div>

          {/* Details Panel */}
          <RequestDetailsPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onTest={() => setShowPlayground(true)}
          />
        </div>
      )}

      {/* ── Playground Modal ── */}
      {showPlayground && selectedNode && (
        <ApiPlaygroundModal
          node={selectedNode}
          onClose={() => setShowPlayground(false)}
        />
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const text = ev.target.result;
              let data;
              try { data = JSON.parse(text); } catch { data = yaml.load(text); }
              if (data && typeof data === "object") handleVisualize(data);
            } catch { /* ignore */ }
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default PostmanGraphViewer;
