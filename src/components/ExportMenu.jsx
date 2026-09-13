import { useState, useRef, useEffect, useMemo } from "react";
import {
  Download,
  Image,
  FileCode2,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Table2,
  AlertCircle,
  Info,
  Terminal,
} from "lucide-react";
import {
  buildGraphSvg,
  buildEndpointCsv,
  renderGraphCanvas,
  scaleFor,
} from "../utils/graphExport";
import { measureNodes } from "../utils/graphGeometry";
import { convertSpec, serializeSource } from "../utils/convert";
import {
  OpenApiIcon,
  SwaggerIcon,
  PostmanIcon,
  FormatMark,
} from "./icons/BrandIcons";

// Byte-order mark, so Excel opens an exported CSV as UTF-8 rather than ANSI.
const BOM = String.fromCharCode(0xfeff);

// The specification formats this menu can write. `icon` is the format's own
// brand mark so the row is recognisable before the label is read.
const SPEC_ROWS = [
  { id: "openapi-json", label: "OpenAPI 3.1", hint: "json", icon: OpenApiIcon, tone: "text-[#6ba43a]" },
  { id: "openapi-yaml", label: "OpenAPI 3.1", hint: "yaml", icon: OpenApiIcon, tone: "text-[#6ba43a]" },
  { id: "swagger-json", label: "Swagger 2.0", hint: "json", icon: SwaggerIcon, tone: "text-[#85ea2d]" },
  { id: "postman", label: "Postman collection", hint: "v2.1", icon: PostmanIcon, tone: "text-[#ff6c37]" },
  { id: "postman-environment", label: "Postman environment", hint: "variables", icon: PostmanIcon, tone: "text-[#ff6c37]" },
  { id: "http", label: "HTTP request file", hint: ".http", icon: Terminal, tone: "text-vz-blue" },
];

const Heading = ({ children }) => (
  <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
    {children}
  </p>
);

// `open`/`onOpenChange` are optional: pass them to let the command palette
// open this menu without duplicating the export logic.
// `nodes` is what the map is drawing (positions must match); `allNodes` is
// the whole spec, which is what a flat endpoint list or a converted document
// should cover even when every group on the map is collapsed.
const ExportMenu = ({
  nodes = [],
  allNodes = null,
  positions = {},
  graphStyle = "graph",
  graphTitle = "API Graph",
  spec = null,
  sourceFormat = "",
  // What the workspace knows beyond the document: the host given to the
  // playground for a relative spec, and the resolved variables. Both go
  // into the exported file so it runs where it lands.
  origin = "",
  variables = null,
  open: openProp,
  onOpenChange,
}) => {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp !== undefined ? openProp : openLocal;
  const setOpen = onOpenChange || setOpenLocal;
  const [exporting, setExporting] = useState(null); // "png" | "svg" | null
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { label, notes }
  const [notesOpen, setNotesOpen] = useState(false);
  const menuRef = useRef(null);

  const specNodes = allNodes || nodes;

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setError("");
      setResult(null);
      setNotesOpen(false);
    }
  }, [open]);

  const safeName = graphTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "api-graph";

  // What the bitmap will actually come out at. A 13,000 px graph cannot be
  // rasterised at 2x — saying so beats a silently blank PNG.
  const pngPlan = useMemo(() => {
    if (!open) return null;
    const bounds = measureNodes(nodes, positions);
    if (!bounds) return null;
    const w = Math.ceil(bounds.width + 120);
    const h = Math.ceil(bounds.height + 120);
    return { w, h, scale: scaleFor(w, h, 2) };
  }, [open, nodes, positions]);

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const flash = (kind) => {
    setDone(kind);
    setTimeout(() => setDone(null), 2000);
  };

  const handleExportPNG = async () => {
    setError("");
    setResult(null);
    setExporting("png");
    // Yield once so the spinner paints before the canvas work starts.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const canvasResult = renderGraphCanvas({ nodes, positions, graphStyle });
      if (!canvasResult) throw new Error("Nothing on the canvas to export yet.");
      await new Promise((resolve, reject) => {
        canvasResult.canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("The browser could not allocate a bitmap this large."));
            return;
          }
          downloadBlob(blob, `${safeName}.png`);
          resolve();
        }, "image/png");
      });
      flash("png");
    } catch (e) {
      setError(e.message || "PNG export failed.");
    } finally {
      setExporting(null);
    }
  };

  const handleExportSVG = () => {
    setError("");
    setResult(null);
    setExporting("svg");
    try {
      const svgResult = buildGraphSvg({ nodes, positions, graphStyle, title: graphTitle });
      if (!svgResult) throw new Error("Nothing on the canvas to export yet.");
      downloadBlob(
        new Blob([svgResult.svg], { type: "image/svg+xml;charset=utf-8" }),
        `${safeName}.svg`,
      );
      flash("svg");
    } catch (e) {
      setError(e.message || "SVG export failed.");
    } finally {
      setExporting(null);
    }
  };

  const handleExportSource = (as) => {
    if (!spec) return;
    setError("");
    setResult(null);
    try {
      const text = serializeSource(spec, as);
      downloadBlob(
        new Blob([text], {
          type: as === "yaml" ? "text/yaml;charset=utf-8" : "application/json;charset=utf-8",
        }),
        `${safeName}.${as === "yaml" ? "yaml" : "json"}`,
      );
      flash(`source-${as}`);
    } catch (e) {
      setError(e.message || "Could not serialise the specification.");
    }
  };

  const handleExportCSV = () => {
    setError("");
    setResult(null);
    try {
      const csv = buildEndpointCsv(specNodes);
      downloadBlob(
        new Blob([BOM + csv], { type: "text/csv;charset=utf-8" }),
        `${safeName}-endpoints.csv`,
      );
      flash("csv");
    } catch (e) {
      setError(e.message || "CSV export failed.");
    }
  };

  /** Convert the loaded specification into another format and download it. */
  const handleConvert = (row) => {
    setError("");
    setResult(null);
    setNotesOpen(false);
    setExporting(row.id);
    try {
      const converted = convertSpec(row.id, { spec, nodes: specNodes, origin, variables });
      downloadBlob(
        new Blob([converted.text], { type: converted.mime }),
        `${safeName}.${converted.ext}`,
      );
      flash(row.id);
      setResult({ label: row.label, notes: converted.notes });
    } catch (e) {
      setError(e.message || "That conversion failed.");
    } finally {
      setExporting(null);
    }
  };

  const rowClass =
    "vz-t flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text disabled:opacity-50";

  // A plain function, not a component: declaring a component inside another
  // component makes a new type on every render and remounts the subtree.
  const statusIcon = (id, Fallback, tone) => {
    if (exporting === id) return <Loader2 size={14} className="animate-spin text-vz-accent" />;
    if (done === id) return <Check size={14} className="text-vz-green" />;
    return <Fallback size={14} className={tone} />;
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] font-medium text-vz-soft hover:text-vz-text"
      >
        <Download size={14} className="flex-shrink-0" />
        <span className="hidden xl:inline">Export</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="vz-scroll absolute right-0 z-50 mt-2 max-h-[min(78vh,600px)] w-[302px] overflow-y-auto overflow-x-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
          <Heading>Specification</Heading>
          {SPEC_ROWS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => handleConvert(row)}
              disabled={!!exporting}
              className={rowClass}
            >
              {statusIcon(row.id, row.icon, row.tone)}
              {row.label}
              <span className="vz-mono ml-auto text-[11px] text-vz-dim">{row.hint}</span>
            </button>
          ))}

          <div className="mt-1 border-t border-vz-line-soft">
            <Heading>Diagram</Heading>
            <button type="button" onClick={handleExportPNG} disabled={!!exporting} className={rowClass}>
              {statusIcon("png", Image, "text-vz-accent")}
              Graph image
              <span className="ml-auto text-[11px] tabular-nums text-vz-dim">
                {pngPlan ? `png ${pngPlan.scale.toFixed(pngPlan.scale < 1 ? 2 : 0)}x` : "png 2x"}
              </span>
            </button>

            <button type="button" onClick={handleExportSVG} disabled={!!exporting} className={rowClass}>
              {statusIcon("svg", FileCode2, "text-vz-blue")}
              Graph vector
              <span className="vz-mono ml-auto text-[11px] text-vz-dim">svg</span>
            </button>
          </div>

          <div className="mt-1 border-t border-vz-line-soft">
            <Heading>Data</Heading>
            <button type="button" onClick={handleExportCSV} disabled={!!exporting} className={rowClass}>
              {statusIcon("csv", Table2, "text-vz-warn")}
              Endpoint list
              <span className="vz-mono ml-auto text-[11px] text-vz-dim">csv</span>
            </button>

            {spec && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-vz-soft">
                <FormatMark format={sourceFormat} size={14} className="text-vz-green" />
                <span className="min-w-0 truncate">
                  Source{sourceFormat ? ` · ${sourceFormat}` : ""}
                </span>
                <span className="ml-auto flex flex-shrink-0 items-center gap-1">
                  {["json", "yaml"].map((as) => (
                    <button
                      key={as}
                      type="button"
                      onClick={() => handleExportSource(as)}
                      className={`vz-t vz-mono rounded-md border px-1.5 py-0.5 text-[11px] ${
                        done === `source-${as}`
                          ? "border-vz-green/40 bg-vz-green/12 text-vz-green"
                          : "border-vz-line bg-vz-panel-2 text-vz-dim hover:text-vz-text"
                      }`}
                    >
                      {done === `source-${as}` ? "saved" : as}
                    </button>
                  ))}
                </span>
              </div>
            )}
          </div>

          {result && result.notes.length > 0 && (
            <div className="border-t border-vz-line-soft bg-vz-blue/[0.05]">
              <button
                type="button"
                onClick={() => setNotesOpen(!notesOpen)}
                className="vz-t flex w-full items-start gap-2 px-3.5 py-2 text-left text-[11.5px] leading-relaxed text-vz-soft hover:text-vz-text"
              >
                <Info size={12} className="mt-0.5 flex-shrink-0 text-vz-blue" />
                <span className="min-w-0 flex-1">
                  {result.label} saved — {result.notes.length}{" "}
                  {result.notes.length === 1 ? "thing to know" : "things to know"}
                </span>
                <ChevronRight
                  size={12}
                  className={`mt-0.5 flex-shrink-0 transition-transform duration-150 ${
                    notesOpen ? "rotate-90" : ""
                  }`}
                />
              </button>
              {notesOpen && (
                <ul className="vz-scroll max-h-40 overflow-y-auto px-3.5 pb-2.5">
                  {result.notes.map((note) => (
                    <li
                      key={note}
                      className="flex gap-1.5 py-1 text-[11px] leading-relaxed text-vz-dim"
                    >
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0">{note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {pngPlan && (
            <p className="border-t border-vz-line-soft px-3.5 py-2 text-[11px] leading-relaxed text-vz-dim">
              Graph is {pngPlan.w.toLocaleString()} × {pngPlan.h.toLocaleString()} px.
              {pngPlan.scale < 2 && " PNG scale reduced to stay inside the browser's canvas limit — SVG keeps full detail."}
            </p>
          )}

          {error && (
            <p className="flex items-start gap-2 border-t border-vz-line-soft bg-vz-red/[0.07] px-3.5 py-2 text-[11.5px] leading-relaxed text-[#fda4af]">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
