import { useMemo, useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import JsonView from "./JsonView";
import { toJsonText } from "../../utils/format";

const RawSpecView = ({ spec, title = "spec" }) => {
  const text = useMemo(() => toJsonText(spec), [spec]);
  // A 6 MB document is 205,525 lines; counting them inside JSX meant walking
  // the whole string and allocating that array on every render.
  const stats = useMemo(
    () => ({
      lines: text ? text.split("\n").length : 0,
      kb: text.length / 1024,
    }),
    [text],
  );
  const [copied, setCopied] = useState(false);

  const safeName = String(title).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

  const handleCopy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName || "spec"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-vz-line-soft px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
          Source specification
        </span>
        <span className="vz-mono text-[11px] text-vz-dim">
          {stats.lines.toLocaleString()} lines ·{" "}
          {stats.kb > 1024
            ? `${(stats.kb / 1024).toFixed(1)} MB`
            : `${stats.kb.toFixed(1)} KB`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="vz-t flex h-8 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[12px] text-vz-soft hover:text-vz-text"
          >
            {copied ? (
              <Check size={13} className="text-vz-green" />
            ) : (
              <Copy size={13} />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="vz-t flex h-8 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[12px] text-vz-soft hover:text-vz-text"
          >
            <Download size={13} /> JSON
          </button>
        </div>
      </div>

      <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
        <JsonView value={text} className="text-[12px]" />
      </div>
    </div>
  );
};

export default RawSpecView;
