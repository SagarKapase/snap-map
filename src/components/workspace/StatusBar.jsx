import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Braces,
  Boxes,
  Globe,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { timeAgo } from "../../utils/analysis";
import { FormatMark } from "../icons/BrandIcons";

const MAX_POPOVER_NOTICES = 50;

const StatusBar = ({
  endpointCount,
  score,
  onOpenAudit,
  schemaCount,
  warnings = [],
  detectedFormat,
  importedAt,
  activeEnvName,
  onSelectWarning,
}) => {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Keep the relative timestamp honest without re-rendering the whole app.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const realWarnings = warnings.filter((w) => w.level === "warn");
  // The popover is a peek, not the list — a large spec reports four figures of
  // notices and the audit tab is where they are actually read.
  const shownWarnings = warnings.slice(0, MAX_POPOVER_NOTICES);
  const notices = warnings.length;
  const noticeLabel = realWarnings.length
    ? `${realWarnings.length} ${realWarnings.length === 1 ? "warning" : "warnings"}`
    : `${notices} ${notices === 1 ? "notice" : "notices"}`;

  return (
    <footer className="relative z-[45] flex h-[40px] flex-shrink-0 items-center gap-4 border-t border-vz-line-soft bg-vz-bg px-4 text-[11px] text-vz-dim sm:gap-6">
      <span className="flex flex-shrink-0 items-center gap-1.5 text-[#4ade80]">
        <CheckCircle2 size={13} /> Parsed successfully
      </span>

      <span className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
        <Braces size={12} /> {endpointCount} endpoints
      </span>

      {typeof score === "number" && (
        <button
          type="button"
          onClick={onOpenAudit}
          title="Open the specification audit"
          className={`vz-t hidden flex-shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/6 sm:flex ${
            score >= 90 ? "text-vz-green" : score >= 70 ? "text-vz-warn" : "text-vz-red"
          }`}
        >
          <ShieldCheck size={12} /> Score {score}
        </button>
      )}

      {schemaCount != null && (
        <span className="hidden flex-shrink-0 items-center gap-1.5 md:flex">
          <Boxes size={12} /> {schemaCount} schemas
        </span>
      )}

      {notices > 0 && (
        <div className="relative flex-shrink-0" ref={wrapRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`vz-t flex items-center gap-1.5 rounded-md px-1.5 py-1 ${
              realWarnings.length ? "text-vz-warn" : "text-vz-soft"
            } hover:bg-white/6`}
          >
            <AlertTriangle size={12} /> {noticeLabel}
          </button>

          {open && (
            <div className="absolute bottom-full left-0 mb-2 w-[360px] overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
              <p className="border-b border-vz-line-soft px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                Spec notices
              </p>
              <div className="vz-scroll max-h-64 overflow-auto py-1">
                {shownWarnings.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      onSelectWarning?.(w);
                      setOpen(false);
                    }}
                    className="vz-t flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/4"
                  >
                    <AlertTriangle
                      size={12}
                      className={`mt-0.5 flex-shrink-0 ${
                        w.level === "warn" ? "text-vz-warn" : "text-vz-dim"
                      }`}
                    />
                    <span className="text-[12px] leading-relaxed text-vz-soft">
                      {w.message}
                    </span>
                  </button>
                ))}

                {warnings.length > shownWarnings.length && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAudit?.();
                      setOpen(false);
                    }}
                    className="vz-t flex w-full items-center gap-2 border-t border-vz-line-soft px-3 py-2 text-left text-[12px] text-vz-soft hover:bg-white/4 hover:text-vz-text"
                  >
                    <ShieldCheck size={12} className="flex-shrink-0" />
                    {(warnings.length - shownWarnings.length).toLocaleString()} more
                    — open the audit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex flex-shrink-0 items-center gap-4 sm:gap-6">
        {activeEnvName && (
          <span className="flex items-center gap-1.5 text-vz-accent">
            <Globe size={12} /> {activeEnvName}
          </span>
        )}
        {detectedFormat && (
          <span className="hidden items-center gap-1.5 sm:flex">
            <FormatMark format={detectedFormat} size={12} /> {detectedFormat}
          </span>
        )}
        {importedAt && (
          <span className="flex items-center gap-1.5">
            <Clock size={12} /> Imported {timeAgo(importedAt)}
          </span>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;
