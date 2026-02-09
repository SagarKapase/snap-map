import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Settings,
  ChevronDown,
  Lock,
  X,
  Play,
  Code,
  Eye,
  Menu,
  Copy,
  Share2,
  HardDrive,
  Zap,
  Filter,
  AlertCircle,
  CheckCircle,
  Maximize2,
} from "lucide-react";

// Enhanced SVG Connection Lines with smooth animations
const ConnectionLines = ({ nodes, nodePositions, graphStyle }) => {
  if (!nodes.length) return null;

  const lines = [];

  nodes.forEach((node) => {
    if (node.parentId) {
      const parentPos = nodePositions[node.parentId];
      const childPos = nodePositions[node.id];

      if (parentPos && childPos) {
        let path = "";
        let stroke = "rgba(59, 130, 246, 0.5)";
        let strokeDasharray = "none";
        let filter = "none";

        if (graphStyle === "tree") {
          const x1 = parentPos.x + 220;
          const y1 = parentPos.y + 50;
          const x2 = childPos.x;
          const y2 = childPos.y + 50;
          const controlX = x1 + (x2 - x1) * 0.4;
          path = `M ${x1} ${y1} Q ${controlX} ${(y1 + y2) / 2} ${x2} ${y2}`;
          filter = "drop-shadow(0 0 8px rgba(59, 130, 246, 0.3))";
        } else if (graphStyle === "flowchart") {
          const x1 = parentPos.x + 220;
          const y1 = parentPos.y + 50;
          const x2 = childPos.x;
          const y2 = childPos.y + 50;
          path = `M ${x1} ${y1} L ${x1 + (x2 - x1) / 2} ${y1} L ${x1 + (x2 - x1) / 2} ${y2} L ${x2} ${y2}`;
          strokeDasharray = "5,5";
          stroke = "rgba(168, 85, 247, 0.5)";
          filter = "drop-shadow(0 0 8px rgba(168, 85, 247, 0.2))";
        } else if (graphStyle === "radial") {
          const dx = childPos.x - parentPos.x;
          const dy = childPos.y - parentPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          const x1 = parentPos.x + Math.cos(angle) * 130;
          const y1 = parentPos.y + Math.sin(angle) * 50;
          const x2 = childPos.x - Math.cos(angle) * 130;
          const y2 = childPos.y - Math.sin(angle) * 50;

          path = `M ${x1} ${y1} L ${x2} ${y2}`;
          stroke = "rgba(34, 197, 94, 0.5)";
          filter = "drop-shadow(0 0 8px rgba(34, 197, 94, 0.2))";
        } else if (graphStyle === "mindmap") {
          const x1 = parentPos.x + 220;
          const y1 = parentPos.y + 50;
          const x2 = childPos.x;
          const y2 = childPos.y + 50;
          const controlX = x1 + 40;
          const controlX2 = x2 - 40;
          path = `M ${x1} ${y1} C ${controlX} ${y1}, ${controlX2} ${y2}, ${x2} ${y2}`;
          stroke = "rgba(249, 115, 22, 0.5)";
          filter = "drop-shadow(0 0 8px rgba(249, 115, 22, 0.2))";
        }

        lines.push(
          <path
            key={`line-${node.id}`}
            d={path}
            stroke={stroke}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={strokeDasharray}
            pointerEvents="none"
            filter={filter}
            style={{
              animation: "pathGlow 3s ease-in-out infinite",
              strokeOpacity: 0.7,
            }}
          />,
        );
      }
    }
  });

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1, overflow: "visible" }}
    >
      <defs>
        <style>{`
          @keyframes pathGlow {
            0%, 100% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.3)); opacity: 0.7; }
            50% { filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.5)); opacity: 0.9; }
          }
        `}</style>
      </defs>
      {lines}
    </svg>
  );
};

// Enhanced Card Component with smooth transitions
const GraphCard = ({
  node,
  position,
  isSelected,
  isDragging,
  isHighlighted,
  onMouseDown,
  onSelect,
  onCopy,
}) => {
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const getMethodColor = (method) => {
    const colors = {
      GET: {
        bg: "bg-emerald-600/20",
        text: "text-emerald-400",
        badge: "bg-emerald-600",
        glow: "shadow-emerald-500/50",
      },
      POST: {
        bg: "bg-amber-600/20",
        text: "text-amber-400",
        badge: "bg-amber-600",
        glow: "shadow-amber-500/50",
      },
      PUT: {
        bg: "bg-blue-600/20",
        text: "text-blue-400",
        badge: "bg-blue-600",
        glow: "shadow-blue-500/50",
      },
      PATCH: {
        bg: "bg-purple-600/20",
        text: "text-purple-400",
        badge: "bg-purple-600",
        glow: "shadow-purple-500/50",
      },
      DELETE: {
        bg: "bg-red-600/20",
        text: "text-red-400",
        badge: "bg-red-600",
        glow: "shadow-red-500/50",
      },
    };
    return colors[method] || colors.GET;
  };

  const isFolderOrRoot = node.type === "folder" || node.type === "root";
  const methodColor = !isFolderOrRoot ? getMethodColor(node.method) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (node.path) {
      navigator.clipboard.writeText(node.path);
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
      onCopy?.();
    }
  };

  return (
    <div
      className="absolute transition-all duration-300 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: isSelected ? 50 : isDragging ? 45 : isHovered ? 30 : 10,
        transform: isSelected
          ? "scale(1.05)"
          : isHovered
            ? "scale(1.02)"
            : "scale(1)",
      }}
      onMouseDown={onMouseDown}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {node.type === "root" ? (
        <div
          className={`w-56 rounded-xl border-2 cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isSelected
              ? "border-cyan-500 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl shadow-cyan-500/50"
              : isHighlighted
                ? "border-cyan-500/60 bg-gradient-to-br from-slate-800/80 to-slate-900/80 shadow-lg shadow-cyan-500/30"
                : "border-cyan-600/40 bg-gradient-to-br from-slate-800/60 to-slate-900/60 hover:border-cyan-500/70 hover:shadow-lg hover:shadow-cyan-500/20"
          } p-4 group pointer-events-auto backdrop-blur-sm`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Lock
              size={16}
              className={`flex-shrink-0 transition-colors duration-300 ${
                isSelected || isHovered ? "text-cyan-300" : "text-cyan-400"
              }`}
            />
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Root API
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mb-1 group-hover:text-cyan-300 transition-colors duration-300 truncate">
            {node.name}
          </h3>
          <p className="text-xs text-slate-400 space-x-2">
            <span>{node.version}</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-500/70 font-semibold">
              {node.itemCount} Nodes
            </span>
          </p>
        </div>
      ) : node.type === "folder" ? (
        <div
          className={`w-52 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isSelected
              ? "border-cyan-500 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl shadow-cyan-500/50"
              : isHighlighted
                ? "border-slate-500/60 bg-gradient-to-br from-slate-700/80 to-slate-800/80 shadow-lg shadow-slate-600/30"
                : "border-slate-600/40 bg-gradient-to-br from-slate-700/60 to-slate-800/60 hover:border-slate-500/70 hover:shadow-lg hover:shadow-slate-600/20"
          } p-4 group pointer-events-auto backdrop-blur-sm`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              📁 Folder
            </span>
            <span className="text-xs bg-slate-600/60 text-slate-200 px-2 py-0.5 rounded-full flex-shrink-0 font-semibold">
              {node.itemCount}
            </span>
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors duration-300 truncate">
            {node.name}
          </h3>
        </div>
      ) : (
        <div
          className={`w-64 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isSelected
              ? "border-cyan-500 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl shadow-cyan-500/50"
              : isHighlighted
                ? "border-slate-500/60 bg-gradient-to-br from-slate-700/80 to-slate-800/80 shadow-lg shadow-slate-600/30"
                : "border-slate-600/40 bg-gradient-to-br from-slate-700/60 to-slate-800/60 hover:border-slate-500/70 hover:shadow-lg hover:shadow-slate-600/20"
          } p-3 group pointer-events-auto backdrop-blur-sm`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            {methodColor && (
              <>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${methodColor.bg} ${methodColor.text} uppercase flex-shrink-0 transition-all duration-300 ${
                    isSelected ? `shadow-lg ${methodColor.glow}` : ""
                  }`}
                >
                  {node.method}
                </span>
                <span className="text-xs text-slate-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex-shrink-0 tracking-wider">
                  Request
                </span>
              </>
            )}
          </div>
          <h3 className="text-sm font-bold text-white mb-2 group-hover:text-cyan-300 transition-colors duration-300 line-clamp-2">
            {node.name}
          </h3>
          {node.path && (
            <div className="flex items-start gap-2">
              <p className="text-xs text-cyan-400 font-mono truncate flex-1 break-words opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                {node.path}
              </p>
              <button
                onClick={handleCopy}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-1 hover:bg-slate-600/40 rounded flex-shrink-0"
                title="Copy endpoint"
              >
                <Copy
                  size={12}
                  className="text-slate-400 hover:text-cyan-400 transition-colors duration-300"
                />
              </button>
            </div>
          )}
          {showCopyFeedback && (
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1 animate-in fade-in duration-300">
              <CheckCircle size={12} />
              Copied!
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Enhanced Request Details Panel with smooth transitions
const RequestDetailsPanel = ({ node, onClose, onTest }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!node || node.type !== "request") {
    return (
      <div className="w-96 bg-gradient-to-b from-slate-950/90 to-slate-950/70 border-l border-slate-700/50 p-6 flex flex-col items-center justify-center h-full backdrop-blur-sm transition-all duration-500">
        <div className="animate-in fade-in zoom-in duration-500">
          <AlertCircle size={48} className="text-slate-600 mb-4" />
          <p className="text-slate-500 text-center">
            Select a request to view details
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-gradient-to-b from-slate-950/90 to-slate-950/70 border-l border-slate-700/50 flex flex-col h-full overflow-hidden backdrop-blur-sm transition-all duration-300">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-950/80 backdrop-blur z-40 transition-all duration-300">
        <div className="animate-in fade-in slide-in-from-left duration-300">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            Request Details
          </h2>
          <p className="text-lg font-bold text-white mt-1 truncate">
            {node.name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded transition-all duration-300 flex-shrink-0 hover:scale-110"
        >
          <X
            size={20}
            className="text-slate-400 hover:text-white transition-colors duration-300"
          />
        </button>
      </div>

      <div className="flex gap-0 border-b border-slate-700/50 px-4 bg-slate-950/50 sticky top-16 z-40 overflow-x-auto backdrop-blur">
        {["overview", "headers", "body", "docs"].map((tab, idx) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-xs font-semibold uppercase border-b-2 transition-all duration-300 whitespace-nowrap tracking-wide ${
              activeTab === tab
                ? "text-cyan-400 border-cyan-400"
                : "text-slate-500 border-transparent hover:text-slate-400"
            }`}
            style={{
              animationDelay: `${idx * 50}ms`,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto scroll-smooth">
        {activeTab === "overview" && (
          <div className="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <span
                className={`inline-block text-xs font-bold px-3 py-1 rounded-full uppercase transition-all duration-300 ${
                  node.method === "GET"
                    ? "bg-emerald-600/30 text-emerald-400"
                    : node.method === "POST"
                      ? "bg-amber-600/30 text-amber-400"
                      : node.method === "PUT"
                        ? "bg-blue-600/30 text-blue-400"
                        : node.method === "PATCH"
                          ? "bg-purple-600/30 text-purple-400"
                          : "bg-red-600/30 text-red-400"
                }`}
              >
                {node.method}
              </span>
              <h3 className="text-2xl font-bold text-white mt-3">
                {node.name}
              </h3>
            </div>

            {node.path && (
              <div className="transform transition-all duration-300 hover:scale-105 origin-left">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2 flex justify-between tracking-wider">
                  Endpoint
                  <button
                    onClick={() => copyToClipboard(node.path)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-all duration-300 hover:scale-110"
                  >
                    <Copy size={12} />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </p>
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/70">
                  <p className="text-sm text-cyan-400 font-mono break-all">
                    {node.path}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/70">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={16} className="text-cyan-400 animate-pulse" />
                <p className="text-sm font-semibold text-white">Quick Status</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between transition-all duration-300 hover:text-white">
                  <span className="text-slate-400">Method:</span>
                  <span className="text-white font-semibold">
                    {node.method}
                  </span>
                </div>
                <div className="flex justify-between transition-all duration-300 hover:text-white">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                    Active
                  </span>
                </div>
                <div className="flex justify-between transition-all duration-300 hover:text-white">
                  <span className="text-slate-400">Auth:</span>
                  <span className="text-amber-400 font-semibold">Required</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "headers" && (
          <div className="p-6 space-y-4 animate-in fade-in duration-300">
            {node.headers && node.headers.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-slate-400 uppercase flex justify-between tracking-wider">
                  Headers{" "}
                  <span className="text-cyan-400 bg-cyan-600/20 px-2 py-0.5 rounded-full">
                    {node.headers.length} Active
                  </span>
                </p>
                {node.headers.map((header, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-3 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/70 hover:shadow-md"
                    style={{
                      animation: "slideInUp 0.3s ease-out",
                      animationDelay: `${idx * 50}ms`,
                      animationFillMode: "both",
                    }}
                  >
                    <p className="text-xs font-semibold text-slate-400 mb-1 tracking-wide">
                      {header.key}
                    </p>
                    <p className="text-sm text-cyan-400 font-mono break-all">
                      {header.value}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-slate-500 text-center py-8">
                No headers configured
              </p>
            )}
          </div>
        )}

        {activeTab === "body" && (
          <div className="p-6 space-y-4 animate-in fade-in duration-300">
            {node.body ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Request Body
                  </p>
                  <button
                    onClick={() =>
                      copyToClipboard(JSON.stringify(node.body, null, 2))
                    }
                    className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-1 transition-all duration-300 hover:scale-110"
                  >
                    <Copy size={12} />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4 text-xs text-slate-300 font-mono overflow-auto max-h-96 whitespace-pre-wrap break-words backdrop-blur-sm transition-all duration-300 hover:border-slate-600/70">
                  {JSON.stringify(node.body, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-slate-500 text-center py-8">No request body</p>
            )}
          </div>
        )}

        {activeTab === "docs" && (
          <div className="p-6 space-y-4 animate-in fade-in duration-300">
            {node.description ? (
              <>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-3 tracking-wider">
                  Documentation
                </p>
                <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/70">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {node.description}
                  </p>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 mb-3 tracking-wide">
                    Additional Info
                  </p>
                  <div className="space-y-2 text-sm text-slate-400">
                    <p className="transition-all duration-300 hover:text-slate-300 hover:translate-x-1">
                      • Requires authentication
                    </p>
                    <p className="transition-all duration-300 hover:text-slate-300 hover:translate-x-1">
                      • Rate limited: 1000 req/hour
                    </p>
                    <p className="transition-all duration-300 hover:text-slate-300 hover:translate-x-1">
                      • Response time: ~200ms avg
                    </p>
                    <p className="transition-all duration-300 hover:text-slate-300 hover:translate-x-1">
                      • Deprecated: No
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-8">
                No documentation available
              </p>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-700/50 bg-slate-950/80 space-y-3 sticky bottom-0 backdrop-blur z-30 transition-all duration-300">
        <button
          onClick={onTest}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 group hover:shadow-lg hover:shadow-cyan-500/30 active:scale-95"
        >
          <Play
            size={16}
            className="group-hover:translate-x-1 transition-transform duration-300"
          />
          Test in Playground
        </button>
        <button className="w-full bg-slate-800/50 hover:bg-slate-700/50 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-md active:scale-95 border border-slate-700/50">
          <Share2 size={16} />
          Share Request
        </button>
      </div>
    </div>
  );
};

// Main Component with Enhanced Features
const PostmanGraphViewer = () => {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
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
  const [activeTab, setActiveTab] = useState("tree");
  const [showMenu, setShowMenu] = useState(false);
  const [filterMethod, setFilterMethod] = useState("all");
  const [graphStyle, setGraphStyle] = useState("tree");
  const [showGraphMenu, setShowGraphMenu] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    get: 0,
    post: 0,
    put: 0,
    delete: 0,
  });

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const matchesSearch =
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.path?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        filterMethod === "all" ||
        node.method === filterMethod ||
        node.type !== "request";

      return matchesSearch && matchesFilter;
    });
  }, [nodes, searchQuery, filterMethod]);

  const highlightedNodeIds = useMemo(() => {
    if (!searchQuery) return new Set();
    return new Set(
      nodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.path?.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .map((n) => n.id),
    );
  }, [nodes, searchQuery]);

  // Calculate positions based on graph style
  const calculatePositions = useCallback(
    (nodesData) => {
      const positions = {};
      const rootNode = nodesData.find((n) => n.type === "root");

      if (!rootNode) return positions;

      positions[rootNode.id] = { x: 120, y: 300 };

      if (graphStyle === "tree") {
        let yOffset = 120;
        nodesData.forEach((node) => {
          if (node.parentId === rootNode.id && node.type === "folder") {
            positions[node.id] = { x: 400, y: yOffset };
            yOffset += 180;

            nodesData.forEach((child) => {
              if (child.parentId === node.id) {
                const childX = positions[node.id].x + 300;
                const childY =
                  positions[node.id].y + 30 + (Math.random() * 40 - 20);
                positions[child.id] = { x: childX, y: childY };
              }
            });
          }
        });
      } else if (graphStyle === "flowchart") {
        let xOffset = 400;
        let yOffset = 120;
        const folderCount = nodesData.filter(
          (n) => n.parentId === rootNode.id && n.type === "folder",
        ).length;

        nodesData.forEach((node) => {
          if (node.parentId === rootNode.id && node.type === "folder") {
            positions[node.id] = { x: xOffset, y: yOffset };
            yOffset += 180;

            nodesData.forEach((child) => {
              if (child.parentId === node.id) {
                positions[child.id] = {
                  x: xOffset + 320,
                  y: positions[node.id].y - 40,
                };
              }
            });
          }
        });
      } else if (graphStyle === "radial") {
        const centerX = 700;
        const centerY = 400;
        const radius = 300;

        const folders = nodesData.filter(
          (n) => n.parentId === rootNode.id && n.type === "folder",
        );
        folders.forEach((folder, idx) => {
          const angle = (idx / folders.length) * Math.PI * 2;
          positions[folder.id] = {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          };

          nodesData.forEach((child) => {
            if (child.parentId === folder.id) {
              const childRadius = radius * 0.6;
              const childAngle = angle + (Math.random() - 0.5) * 0.5;
              positions[child.id] = {
                x: centerX + Math.cos(childAngle) * childRadius,
                y: centerY + Math.sin(childAngle) * childRadius,
              };
            }
          });
        });
      } else if (graphStyle === "mindmap") {
        let yOffset = 50;
        const leftFolders = [];
        const rightFolders = [];

        nodesData.forEach((node) => {
          if (node.parentId === rootNode.id && node.type === "folder") {
            if (leftFolders.length <= rightFolders.length) {
              leftFolders.push(node);
            } else {
              rightFolders.push(node);
            }
          }
        });

        leftFolders.forEach((folder, idx) => {
          positions[folder.id] = { x: 100, y: 150 + idx * 200 };
          nodesData.forEach((child) => {
            if (child.parentId === folder.id) {
              positions[child.id] = {
                x: 350,
                y: positions[folder.id].y - 40 + Math.random() * 80,
              };
            }
          });
        });

        rightFolders.forEach((folder, idx) => {
          positions[folder.id] = { x: 1300, y: 150 + idx * 200 };
          nodesData.forEach((child) => {
            if (child.parentId === folder.id) {
              positions[child.id] = {
                x: 1050,
                y: positions[folder.id].y - 40 + Math.random() * 80,
              };
            }
          });
        });
      }

      return positions;
    },
    [graphStyle],
  );

  // Parse Postman collection
  const parseCollection = (data) => {
    const allNodes = [];
    let nodeId = 0;
    let stats = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

    const rootNode = {
      id: `node-root`,
      name: data.info?.name || "API Collection",
      version: data.info?.version || "v1.0.0",
      type: "root",
      parentId: null,
      itemCount: 0,
      x: 120,
      y: 300,
    };

    let totalNodes = 0;

    const processItem = (item, parentId) => {
      const newId = `node-${nodeId++}`;

      if (item.item && Array.isArray(item.item)) {
        totalNodes++;
        const folderNode = {
          id: newId,
          name: item.name,
          type: "folder",
          parentId: parentId,
          itemCount: item.item.length,
          description: item.description?.content || "",
          x: 0,
          y: 0,
        };

        item.item.forEach((child) => {
          processItem(child, newId);
        });

        allNodes.push(folderNode);
      } else {
        totalNodes++;
        const request = item.request;
        const url =
          typeof request.url === "string"
            ? request.url
            : request.url?.raw || "";
        const method = request.method || "GET";

        stats[method.toLowerCase()] = (stats[method.toLowerCase()] || 0) + 1;
        stats.total++;

        const requestNode = {
          id: newId,
          name: item.name,
          type: "request",
          parentId: parentId,
          method: method,
          path: url,
          description:
            item.description?.content || request.description?.content || "",
          body: request.body?.raw
            ? JSON.parse(request.body.raw)
            : request.body || null,
          headers: [
            { key: "Content-Type", value: "application/json" },
            { key: "Accept", value: "*/*" },
            { key: "Authorization", value: "None" },
          ],
          x: 0,
          y: 0,
        };

        allNodes.push(requestNode);
      }
    };

    allNodes.push(rootNode);

    if (data.item && Array.isArray(data.item)) {
      data.item.forEach((item) => {
        processItem(item, "node-root");
      });
    }

    rootNode.itemCount = totalNodes;
    setStats(stats);
    return allNodes;
  };

  // Handle file import
  const handleFileImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result);
        setCollection(data);
        const parsedNodes = parseCollection(data);
        setNodes(parsedNodes);
        setSelectedNode(null);
      } catch (error) {
        alert("Invalid Postman collection JSON");
      }
    };
    reader.readAsText(file);
  };

  // Update positions when graph style changes
  useEffect(() => {
    if (nodes.length > 0) {
      const newPositions = calculatePositions(nodes);
      setNodePositions(newPositions);
      setZoom(1);
      setPanX(0);
      setPanY(0);
    }
  }, [graphStyle, nodes, calculatePositions]);

  // Handle node dragging
  const handleNodeMouseDown = useCallback(
    (e, nodeId) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const currentPos = nodePositions[nodeId];
      if (!currentPos) return;

      setDragOffset({
        x: e.clientX - currentPos.x,
        y: e.clientY - currentPos.y,
      });

      setDraggedNodeId(nodeId);
    },
    [nodePositions],
  );

  // Handle mouse move for dragging
  useEffect(() => {
    if (!draggedNodeId) return;

    const handleMouseMove = (e) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const newX = e.clientX - canvasRect.left - dragOffset.x;
      const newY = e.clientY - canvasRect.top - dragOffset.y;

      setNodePositions((prev) => ({
        ...prev,
        [draggedNodeId]: {
          x: newX,
          y: newY,
        },
      }));
    };

    const handleMouseUp = () => {
      setDraggedNodeId(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggedNodeId, dragOffset]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[placeholder*="Search"]',
        );
        searchInput?.focus();
      }

      if (e.key === "Escape") {
        setSelectedNode(null);
      }

      if (e.key === "Delete" && document.activeElement?.tagName !== "INPUT") {
        setSearchQuery("");
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const speed = 20;
        if (e.key === "ArrowUp") setPanY((p) => p + speed);
        if (e.key === "ArrowDown") setPanY((p) => p - speed);
        if (e.key === "ArrowLeft") setPanX((p) => p + speed);
        if (e.key === "ArrowRight") setPanX((p) => p - speed);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Download sample
  const handleDownloadSample = () => {
    const sampleCollection = {
      info: {
        name: "Auth API Collection",
        version: "v2.4.0",
      },
      item: [
        {
          name: "User Management",
          item: [
            {
              name: "User Login",
              request: {
                method: "POST",
                url: "https://api.gateway.main/api/v1/auth/login",
                description: {
                  content:
                    "Authenticates a user and returns a bearer token for subsequent API calls.",
                },
              },
            },
            {
              name: "Get Profile",
              request: {
                method: "GET",
                url: "https://api.gateway.main/api/v1/user/profile",
              },
            },
            {
              name: "Update Profile",
              request: {
                method: "PUT",
                url: "https://api.gateway.main/api/v1/user/profile",
              },
            },
          ],
        },
        {
          name: "Payment Gateway",
          item: [
            {
              name: "Create Payment",
              request: {
                method: "POST",
                url: "https://api.gateway.main/api/v1/payments",
              },
            },
            {
              name: "Get Payment Status",
              request: {
                method: "GET",
                url: "https://api.gateway.main/api/v1/payments/:id",
              },
            },
          ],
        },
        {
          name: "Products",
          item: [
            {
              name: "List Products",
              request: {
                method: "GET",
                url: "https://api.gateway.main/api/v1/products",
              },
            },
            {
              name: "Delete Product",
              request: {
                method: "DELETE",
                url: "https://api.gateway.main/api/v1/products/:id",
              },
            },
          ],
        },
      ],
    };

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," +
        encodeURIComponent(JSON.stringify(sampleCollection, null, 2)),
    );
    element.setAttribute("download", "api-collection.json");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Reset view
  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-slate-100 flex flex-col overflow-hidden">
      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes zoomIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .scroll-smooth {
          scroll-behavior: smooth;
        }

        input:focus {
          outline: none;
        }
      `}</style>

      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between backdrop-blur-xl transition-all duration-500">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            ✨ Snap-Map
          </div>
          <div className="text-sm text-slate-400">
            {collection ? collection.info?.name : "API Collection"}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative w-80 group">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 group-hover:text-slate-400 transition-all duration-300"
              size={18}
            />
            <input
              type="text"
              placeholder="Search endpoints or folders (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 transition-all duration-300 backdrop-blur-sm hover:border-slate-600/70"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-all duration-300 hover:scale-110"
              >
                <X size={16} />
              </button>
            )}
            {searchQuery && (
              <span className="absolute right-12 top-1/2 transform -translate-y-1/2 text-xs text-cyan-400 font-semibold animate-pulse">
                {highlightedNodeIds.size} found
              </span>
            )}
          </div>

          {/* Filter Methods */}
          <div className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1 backdrop-blur-sm">
            {["all", "GET", "POST", "PUT", "DELETE"].map((method) => (
              <button
                key={method}
                onClick={() => setFilterMethod(method)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all duration-300 whitespace-nowrap ${
                  filterMethod === method
                    ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/30"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {method === "all" ? "All" : method}
              </button>
            ))}
          </div>

          {/* Graph Style */}
          <div className="relative">
            <button
              onClick={() => setShowGraphMenu(!showGraphMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-600/40 rounded-lg hover:border-cyan-500/70 hover:from-cyan-600/30 hover:to-blue-600/30 transition-all duration-300 text-cyan-400 font-semibold text-sm group whitespace-nowrap backdrop-blur-sm hover:shadow-lg hover:shadow-cyan-500/20"
            >
              <Code size={16} />
              {graphStyle.charAt(0).toUpperCase() + graphStyle.slice(1)}
              <ChevronDown
                size={16}
                className={`transition-transform duration-300 ${
                  showGraphMenu ? "rotate-180" : ""
                }`}
              />
            </button>
            {showGraphMenu && (
              <div className="absolute right-0 mt-3 w-48 bg-slate-800/95 border border-slate-700/70 rounded-lg shadow-2xl z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300 overflow-hidden">
                {["tree", "flowchart", "radial", "mindmap"].map(
                  (style, idx) => (
                    <button
                      key={style}
                      onClick={() => {
                        setGraphStyle(style);
                        setShowGraphMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-slate-700/50 text-white text-sm transition-all duration-300 border-l-2 ${
                        graphStyle === style
                          ? "bg-cyan-600/20 text-cyan-400 border-cyan-500"
                          : "border-transparent"
                      }`}
                      style={{
                        animation: "slideInUp 0.3s ease-out",
                        animationDelay: `${idx * 50}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2.5 hover:bg-slate-800/50 rounded-lg transition-all duration-300 text-slate-400 hover:text-white hover:scale-110"
            >
              <Menu size={20} />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-3 w-56 bg-slate-800/95 border border-slate-700/70 rounded-lg shadow-2xl z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300 overflow-hidden">
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-white text-sm flex items-center gap-2 transition-all duration-300 hover:pl-5"
                >
                  <Upload size={14} />
                  Import Collection
                </button>
                <button
                  onClick={() => {
                    handleDownloadSample();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-white text-sm flex items-center gap-2 transition-all duration-300 hover:pl-5"
                >
                  <Download size={14} />
                  Load Sample
                </button>
                <div className="border-t border-slate-700/50 my-2"></div>
                <button
                  onClick={() => {
                    handleReset();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700/50 text-white text-sm flex items-center gap-2 transition-all duration-300 hover:pl-5"
                >
                  <RotateCcw size={14} />
                  Reset View
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>
      </header>

      {/* Stats Bar */}
      {collection && (
        <div className="bg-slate-900/40 border-b border-slate-700/50 px-6 py-3 flex gap-8 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">TOTAL</span>
            <span className="text-lg font-bold text-white">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            <span className="text-xs text-slate-500 font-semibold">GET</span>
            <span className="text-sm font-bold text-emerald-400">
              {stats.get}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
            <span className="text-xs text-slate-500 font-semibold">POST</span>
            <span className="text-sm font-bold text-amber-400">
              {stats.post}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span className="text-xs text-slate-500 font-semibold">PUT</span>
            <span className="text-sm font-bold text-blue-400">{stats.put}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-xs text-slate-500 font-semibold">DELETE</span>
            <span className="text-sm font-bold text-red-400">
              {stats.delete}
            </span>
          </div>
        </div>
      )}

      {!collection ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="text-7xl opacity-30 animate-bounce">📦</div>
            <div>
              <h2 className="text-4xl font-bold text-white mb-3">
                No Collection Loaded
              </h2>
              <p className="text-slate-400 mb-8 max-w-md">
                Import a Postman collection or load sample data to visualize
                your API structure with beautiful interactive graphs
              </p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-95"
              >
                <Upload size={18} />
                Import Collection
              </button>
              <button
                onClick={handleDownloadSample}
                className="bg-slate-800/50 hover:bg-slate-700/50 text-white font-semibold py-3 px-8 rounded-lg inline-flex items-center gap-2 transition-all duration-300 border border-slate-700/50 hover:border-slate-600/70"
              >
                <Download size={18} />
                Load Sample
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas */}
          <div
            ref={canvasRef}
            className="flex-1 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 relative overflow-auto transition-all duration-300"
            style={{
              backgroundImage: `radial-gradient(rgba(71, 85, 105, 0.08) 1px, transparent 1px)`,
              backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
            }}
          >
            {/* Connection Lines */}
            <ConnectionLines
              nodes={nodes}
              nodePositions={nodePositions}
              graphStyle={graphStyle}
            />

            {/* Nodes Container */}
            <div
              style={{
                transform: `scale(${zoom}) translateX(${panX}px) translateY(${panY}px)`,
                transformOrigin: "0 0",
                transition: draggedNodeId
                  ? "none"
                  : "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
              className="absolute inset-0 pointer-events-none"
            >
              {nodes.map((node) => {
                const pos = nodePositions[node.id] || { x: node.x, y: node.y };
                const isHighlighted = highlightedNodeIds.has(node.id);

                return (
                  <GraphCard
                    key={node.id}
                    node={node}
                    position={pos}
                    isSelected={selectedNode?.id === node.id}
                    isDragging={draggedNodeId === node.id}
                    isHighlighted={isHighlighted}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onSelect={() => setSelectedNode(node)}
                    onCopy={() => {}}
                  />
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 rounded-lg p-2 z-30 backdrop-blur-xl transition-all duration-300 hover:bg-slate-900/90">
              <button
                onClick={() => setZoom(Math.min(3, zoom * 1.2))}
                className="p-2.5 hover:bg-slate-800 rounded transition-all duration-300 text-slate-400 hover:text-cyan-400 hover:scale-110"
                title="Zoom In"
              >
                <ZoomIn size={18} />
              </button>
              <span className="text-xs text-slate-400 w-12 text-center font-semibold">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom(Math.max(0.5, zoom / 1.2))}
                className="p-2.5 hover:bg-slate-800 rounded transition-all duration-300 text-slate-400 hover:text-cyan-400 hover:scale-110"
                title="Zoom Out"
              >
                <ZoomOut size={18} />
              </button>
              <div className="w-px h-6 bg-slate-700/50" />
              <button
                onClick={handleReset}
                className="p-2.5 hover:bg-slate-800 rounded transition-all duration-300 text-slate-400 hover:text-cyan-400 hover:scale-110"
                title="Reset View"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>

          {/* Request Details Panel */}
          <RequestDetailsPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onTest={() =>
              alert("Opening Playground for: " + selectedNode?.name)
            }
          />
        </div>
      )}
    </div>
  );
};

export default PostmanGraphViewer;
