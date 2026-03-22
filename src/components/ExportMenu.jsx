import { useState, useRef, useEffect } from "react";
import { Download, Image, FileCode2, Loader2, Check } from "lucide-react";
// Lazy-load html2canvas to avoid bloating the main bundle
const loadHtml2Canvas = () => import("html2canvas").then((m) => m.default);

const ExportMenu = ({ paperRef, graphTitle = "API Graph" }) => {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg hover:border-[#46484c]/60 hover:bg-[#22262b] transition-all duration-200 text-[#a9abb0] hover:text-white text-sm font-semibold"
      >
        <Download size={14} />
        Export
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-52 bg-[#22262b]/95 border border-[#46484c]/40 rounded-xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden"
          style={{ animation: "scaleIn 0.15s ease-out both" }}
        >
          <button
            onClick={handleExportPNG}
            disabled={!!exporting}
            className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200 disabled:opacity-50"
          >
            {exporting === "png" ? (
              <Loader2 size={14} className="text-[#e08efe] animate-spin" />
            ) : done === "png" ? (
              <Check size={14} className="text-[#81ecff]" />
            ) : (
              <Image size={14} className="text-[#e08efe]" />
            )}
            Export as PNG
            <span className="ml-auto text-[10px] text-[#73757a]">2x</span>
          </button>
          <button
            onClick={handleExportSVG}
            disabled={!!exporting}
            className="w-full text-left px-4 py-3 hover:bg-white/5 text-[#a9abb0] hover:text-white text-sm flex items-center gap-2.5 transition-all duration-200 disabled:opacity-50"
          >
            {exporting === "svg" ? (
              <Loader2 size={14} className="text-[#3aa2ff] animate-spin" />
            ) : done === "svg" ? (
              <Check size={14} className="text-[#81ecff]" />
            ) : (
              <FileCode2 size={14} className="text-[#3aa2ff]" />
            )}
            Export as SVG
            <span className="ml-auto text-[10px] text-[#73757a]">vector</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
