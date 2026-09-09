import { useMemo, useState } from "react";
import { ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";

const SEVERITIES = [
  { id: "all", label: "All" },
  { id: "error", label: "Errors" },
  { id: "warning", label: "Warnings" },
  { id: "info", label: "Notes" },
];

const SEVERITY_LABEL = { error: "errors", warning: "warnings", info: "notes" };

const SEVERITY_STYLE = {
  error: { icon: AlertCircle, tone: "text-vz-red", chip: "bg-vz-red/14 text-[#fda4af]" },
  warning: { icon: AlertTriangle, tone: "text-vz-warn", chip: "bg-vz-warn/14 text-vz-warn" },
  info: { icon: Info, tone: "text-vz-dim", chip: "bg-white/6 text-vz-soft" },
};

const scoreTone = (score) =>
  score >= 90 ? "text-vz-green" : score >= 70 ? "text-vz-warn" : "text-vz-red";

const scoreBar = (score) =>
  score >= 90 ? "bg-vz-green" : score >= 70 ? "bg-vz-warn" : "bg-vz-red";

const AuditView = ({ audit, onSelectNode, nodes = [] }) => {
  const [severity, setSeverity] = useState("all");

  const visible = useMemo(
    () =>
      severity === "all"
        ? audit.findings
        : audit.findings.filter((f) => f.severity === severity),
    [audit.findings, severity],
  );

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((f) => {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category).push(f);
    });
    return [...map.entries()];
  }, [visible]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="vz-scroll h-full overflow-auto">
      <div className="mx-auto w-full max-w-[900px] px-5 py-6 sm:px-7">
        {/* Score */}
        <div className="rounded-[14px] border border-vz-line bg-vz-panel-2 p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-[44px] font-extrabold leading-none tabular-nums ${scoreTone(audit.score)}`}>
                {audit.score}
              </span>
              <span className="text-[15px] font-semibold text-vz-soft">
                / 100 · {audit.grade}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {["error", "warning", "info"].map((key) => {
                const style = SEVERITY_STYLE[key];
                return (
                  <span
                    key={key}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium ${style.chip}`}
                  >
                    <style.icon size={12} />
                    {audit.counts[key]}{" "}
                    {audit.counts[key] === 1
                      ? SEVERITY_LABEL[key].replace(/s$/, "")
                      : SEVERITY_LABEL[key]}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-vz-bg">
            <div
              className={`h-full rounded-full ${scoreBar(audit.score)}`}
              style={{ width: `${audit.score}%` }}
            />
          </div>

          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-vz-dim">
            <ShieldCheck size={13} className="mt-px flex-shrink-0" />
            Static checks against the specification only — no requests are sent.
            {!audit.openApi &&
              " Some rules apply to OpenAPI and Swagger documents and were skipped for this format."}
          </p>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {SEVERITIES.map((option) => {
            const count =
              option.id === "all"
                ? audit.findings.length
                : audit.counts[option.id];
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSeverity(option.id)}
                className={`vz-t rounded-lg px-2.5 py-1.5 text-[12px] ${
                  severity === option.id
                    ? "bg-vz-accent/18 text-vz-text"
                    : "text-vz-soft hover:bg-white/5 hover:text-vz-text"
                }`}
              >
                {option.label}
                <span className="ml-1.5 tabular-nums text-vz-dim">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Findings */}
        {visible.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-green">
              <ShieldCheck size={20} />
            </span>
            <p className="text-[13px] text-vz-soft">
              {audit.findings.length === 0
                ? "No issues found in this specification."
                : "Nothing at this severity."}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {grouped.map(([category, items]) => (
              <section key={category}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
                  {category}
                  <span className="ml-2 tabular-nums text-vz-line">{items.length}</span>
                </h3>

                <div className="overflow-hidden rounded-[12px] border border-vz-line">
                  {items.map((finding, i) => {
                    const style = SEVERITY_STYLE[finding.severity];
                    const target = finding.nodeId ? nodeById.get(finding.nodeId) : null;
                    const clickable = Boolean(target);

                    return (
                      <div
                        key={finding.id}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => onSelectNode(target) : undefined}
                        onKeyDown={
                          clickable
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onSelectNode(target);
                                }
                              }
                            : undefined
                        }
                        className={`vz-t flex items-start gap-3 bg-vz-panel px-3.5 py-3 ${
                          i > 0 ? "border-t border-vz-line-soft" : ""
                        } ${clickable ? "cursor-pointer hover:bg-white/3" : ""}`}
                      >
                        <style.icon
                          size={14}
                          className={`mt-0.5 flex-shrink-0 ${style.tone}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-vz-text">{finding.title}</p>
                          {finding.detail && (
                            <p className="vz-mono mt-1 break-all text-[11.5px] text-vz-dim">
                              {finding.detail}
                            </p>
                          )}
                        </div>
                        <span className="vz-mono flex-shrink-0 text-[10px] text-vz-line">
                          {finding.rule}
                        </span>
                        {clickable && (
                          <ChevronRight
                            size={14}
                            className="mt-0.5 flex-shrink-0 text-vz-dim"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditView;
