import { useState, useRef, useEffect } from "react";
import {
  Download,
  Image,
  FileCode2,
  Loader2,
  Check,
  Braces,
  ChevronDown,
} from "lucide-react";
// Lazy-load html2canvas to avoid bloating the main bundle
const loadHtml2Canvas = () => import("html2canvas").then((m) => m.default);

// `open`/`onOpenChange` are optional: pass them to let the command palette
// open this menu without duplicating the export logic.
const ExportMenu = ({ paperRef, graphTitle = "API Graph", spec = null, open: openProp, onOpenChange }) => {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp !== undefined ? openProp : openLocal;
  const setOpen = onOpenChange || setOpenLocal;
  const [exporting, setExporting] = useState(null); // "png" | "svg" | null
  const [done, setDone] = useState(null);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const safeName = graphTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

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

  const handleExportPNG = async () => {
    if (!paperRef?.current) return;
    setExporting("png");
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(paperRef.current, {
        backgroundColor: "#111417",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${safeName}.png`);
        setExporting(null);
        setDone("png");
        setTimeout(() => setDone(null), 2000);
      }, "image/png");
    } catch {
      setExporting(null);
    }
  };

  const handleExportSVG = () => {
    if (!paperRef?.current) return;
    setExporting("svg");
    try {
      // Grab the SVG connections element
      const svgEl = paperRef.current.querySelector("svg");
      const svgClone = svgEl ? svgEl.cloneNode(true) : null;

      // Get paper dimensions
      const w = paperRef.current.scrollWidth;
      const h = paperRef.current.scrollHeight;

      // Build a standalone SVG
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("xmlns", svgNS);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

      // Background
      const bg = document.createElementNS(svgNS, "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", "#111417");
      svg.appendChild(bg);

      // Dot grid pattern
      const defs = document.createElementNS(svgNS, "defs");
      const pattern = document.createElementNS(svgNS, "pattern");
      pattern.setAttribute("id", "dotgrid");
      pattern.setAttribute("width", "40");
      pattern.setAttribute("height", "40");
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", "20");
      dot.setAttribute("cy", "20");
      dot.setAttribute("r", "1");
      dot.setAttribute("fill", "rgba(70,72,76,0.4)");
      pattern.appendChild(dot);
      defs.appendChild(pattern);
      svg.appendChild(defs);
      const gridRect = document.createElementNS(svgNS, "rect");
      gridRect.setAttribute("width", "100%");
      gridRect.setAttribute("height", "100%");
      gridRect.setAttribute("fill", "url(#dotgrid)");
      svg.appendChild(gridRect);

      // Connection paths
      if (svgClone) {
        Array.from(svgClone.children).forEach((child) => {
          svg.appendChild(child.cloneNode(true));
        });
      }

      // Node cards as labeled rectangles
      const cards = paperRef.current.querySelectorAll("[data-node-id]");
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const paperRect = paperRef.current.getBoundingClientRect();
        const x = rect.left - paperRect.left;
        const y = rect.top - paperRect.top;
        const group = document.createElementNS(svgNS, "g");
        const r = document.createElementNS(svgNS, "rect");
        r.setAttribute("x", x);
        r.setAttribute("y", y);
        r.setAttribute("width", rect.width);
        r.setAttribute("height", rect.height);
        r.setAttribute("rx", "12");
        r.setAttribute("fill", "#171a1e");
        r.setAttribute("stroke", "#46484c");
        r.setAttribute("stroke-width", "1");
        group.appendChild(r);
        // Node label
        const label = card.querySelector("h3")?.textContent || "";
        if (label) {
          const text = document.createElementNS(svgNS, "text");
          text.setAttribute("x", x + 12);
          text.setAttribute("y", y + rect.height / 2 + 4);
          text.setAttribute("fill", "#f8f9fe");
          text.setAttribute("font-size", "12");
          text.setAttribute("font-family", "Inter, sans-serif");
          text.textContent = label;
          group.appendChild(text);
        }
        svg.appendChild(group);
      });

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, `${safeName}.svg`);
    } catch {
      // silent
    }
    setExporting(null);
    setDone("svg");
    setTimeout(() => setDone(null), 2000);
  };

  const handleExportJSON = () => {
    if (!spec) return;
    try {
      const blob = new Blob([JSON.stringify(spec, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, `${safeName}.json`);
      setDone("json");
      setTimeout(() => setDone(null), 2000);
    } catch {
      // silent
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[13px] font-medium text-vz-soft hover:text-vz-text"
      >
        <Download size={14} />
        Export
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
          <button
            type="button"
            onClick={handleExportPNG}
            disabled={!!exporting}
            className="vz-t flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text disabled:opacity-50"
          >
            {exporting === "png" ? (
              <Loader2 size={14} className="animate-spin text-vz-accent" />
            ) : done === "png" ? (
              <Check size={14} className="text-vz-green" />
            ) : (
              <Image size={14} className="text-vz-accent" />
            )}
            Export as PNG
            <span className="ml-auto text-[11px] text-vz-dim">2x</span>
          </button>
          <button
            type="button"
            onClick={handleExportSVG}
            disabled={!!exporting}
            className="vz-t flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text disabled:opacity-50"
          >
            {exporting === "svg" ? (
              <Loader2 size={14} className="animate-spin text-vz-blue" />
            ) : done === "svg" ? (
              <Check size={14} className="text-vz-green" />
            ) : (
              <FileCode2 size={14} className="text-vz-blue" />
            )}
            Export as SVG
            <span className="ml-auto text-[11px] text-vz-dim">vector</span>
          </button>
          {spec && (
            <button
              type="button"
              onClick={handleExportJSON}
              className="vz-t flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text"
            >
              {done === "json" ? (
                <Check size={14} className="text-vz-green" />
              ) : (
                <Braces size={14} className="text-vz-green" />
              )}
              Export source spec
              <span className="ml-auto text-[11px] text-vz-dim">json</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
