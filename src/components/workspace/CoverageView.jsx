import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Target,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  Copy,
  Check,
  Layers,
  ChevronRight,
} from "lucide-react";
import MethodBadge from "./MethodBadge";
import { compareCoverage } from "../../utils/coverage";
import { postmanItemsForNodes } from "../../utils/convert";

/**
 * What the loaded collection covers of a specification — and what it misses.
 *
 * The second document is loaded here rather than replacing the workspace: the
 * comparison is the point, so both sides have to be held at once.
 */

const FILTERS = [
  { id: "missing", label: "Not covered", icon: CircleSlash },
  { id: "covered", label: "Covered", icon: CheckCircle2 },
  { id: "extra", label: "No endpoint", icon: HelpCircle },
];

const CoverageView = ({
  nodes = [],
  detectedFormat = "",
  variables = null,
  compareNodes = null,
  compareName = "",
  compareFormat = "",
  onPickFile,
  onClearCompare,
  onSelectNode,
  onGenerate,
}) => {
  const [filter, setFilter] = useState("missing");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  // Whichever side looks like a specification is the yardstick; the other is
  // the collection being measured. A collection cannot "cover" a collection.
  const isSpec = (format) => /openapi|swagger/i.test(String(format || ""));
  const loadedIsSpec = isSpec(detectedFormat);

  const sides = useMemo(() => {
    if (!compareNodes) return null;
    return loadedIsSpec
      ? { specNodes: nodes, collectionNodes: compareNodes, specName: "this workspace", collectionName: compareName }
      : { specNodes: compareNodes, collectionNodes: nodes, specName: compareName, collectionName: "this workspace" };
  }, [compareNodes, nodes, loadedIsSpec, compareName]);

  const coverage = useMemo(
    () => (sides ? compareCoverage({ ...sides, variables }) : null),
    [sides, variables],
  );

  const rows = useMemo(() => {
    if (!coverage) return [];
    if (filter === "covered") return coverage.covered;
    if (filter === "extra") return coverage.extra.map((node) => ({ node, extra: true }));
    return coverage.missing;
  }, [coverage, filter]);

  const copyMissing = () => {
    if (!coverage) return;
    const text = coverage.missing
      .map((row) => `${row.method} ${row.path}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const generated = useMemo(
    () => (coverage ? postmanItemsForNodes(coverage.missing.map((r) => r.node), "Missing endpoints") : []),
    [coverage],
  );

  if (!coverage) {
    return (
      <div className="vz-scroll h-full overflow-auto">
        <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-5 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-vz-line bg-vz-panel-2 text-vz-accent">
            <Target size={24} />
          </span>
          <h2 className="mt-4 text-[17px] font-semibold text-vz-text">
            Compare against a second document
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-vz-soft">
            {loadedIsSpec
              ? "Load the Postman collection your team tests with, and this shows which of these endpoints nobody has written a request for."
              : "Load the OpenAPI or Swagger document this collection is meant to cover, and this shows which endpoints are missing from it."}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".json,.yaml,.yml,.har"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="vz-t mt-5 flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-4 py-2.5 text-[13px] font-semibold text-[#160a1d]"
          >
            <Upload size={14} />
            Choose a file to compare
          </button>
          <p className="mt-3 text-[11.5px] text-vz-dim">
            Nothing is uploaded — the file is read in this browser, like every
            other import.
          </p>
        </div>
      </div>
    );
  }

  const tone =
    coverage.percent >= 90
      ? "text-vz-green"
      : coverage.percent >= 60
        ? "text-vz-warn"
        : "text-vz-red";
  const bar =
    coverage.percent >= 90
      ? "bg-vz-green"
      : coverage.percent >= 60
        ? "bg-vz-warn"
        : "bg-vz-red";

  return (
    <div className="vz-scroll h-full overflow-auto">
      <div className="mx-auto w-full max-w-[900px] px-5 py-6 sm:px-7">
        <div className="rounded-[14px] border border-vz-line bg-vz-panel-2 p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-[44px] font-extrabold leading-none tabular-nums ${tone}`}>
                {coverage.percent}%
              </span>
              <span className="text-[15px] font-semibold text-vz-soft">
                {coverage.coveredCount} of {coverage.specCount} endpoints
              </span>
            </div>
            <button
              type="button"
              onClick={onClearCompare}
              className="vz-t ml-auto flex items-center gap-1.5 rounded-lg border border-vz-line px-2.5 py-1.5 text-[12px] text-vz-soft hover:text-vz-text"
            >
              <Layers size={12} />
              Comparing with {compareName || "second document"}
              {compareFormat ? ` · ${compareFormat}` : ""}
            </button>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-vz-bg">
            <div
              className={`h-full rounded-full ${bar}`}
              style={{ width: `${coverage.percent}%` }}
            />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-vz-dim">
            {coverage.specCount - coverage.coveredCount} endpoint
            {coverage.specCount - coverage.coveredCount === 1 ? "" : "s"} in{" "}
            {sides.specName} have no request in {sides.collectionName}.
            {coverage.extra.length > 0 &&
              ` ${coverage.extra.length} request${coverage.extra.length === 1 ? "" : "s"} hit paths the specification does not declare.`}
            {coverage.duplicated.length > 0 &&
              ` ${coverage.duplicated.length} endpoint${coverage.duplicated.length === 1 ? " has" : "s have"} more than one request.`}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((option) => {
            const count =
              option.id === "missing"
                ? coverage.missing.length
                : option.id === "covered"
                  ? coverage.covered.length
                  : coverage.extra.length;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`vz-t flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${
                  filter === option.id
                    ? "bg-vz-accent/18 text-vz-text"
                    : "text-vz-soft hover:bg-white/5 hover:text-vz-text"
                }`}
              >
                <option.icon size={12} />
                {option.label}
                <span className="tabular-nums text-vz-dim">{count}</span>
              </button>
            );
          })}

          {filter === "missing" && coverage.missing.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyMissing}
                className="vz-t flex items-center gap-1.5 rounded-lg border border-vz-line px-2.5 py-1.5 text-[12px] text-vz-soft hover:text-vz-text"
              >
                {copied ? <Check size={12} className="text-vz-green" /> : <Copy size={12} />}
                Copy list
              </button>
              {onGenerate && (
                <button
                  type="button"
                  onClick={() => onGenerate(generated, coverage.missing.length)}
                  className="vz-t flex items-center gap-1.5 rounded-lg bg-vz-accent/18 px-2.5 py-1.5 text-[12px] font-medium text-vz-text hover:bg-vz-accent/25"
                >
                  <ChevronRight size={12} />
                  Generate {coverage.missing.length} request
                  {coverage.missing.length === 1 ? "" : "s"}
                </button>
              )}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-green">
              <CheckCircle2 size={20} />
            </span>
            <p className="text-[13px] text-vz-soft">
              {filter === "missing"
                ? "Every endpoint has at least one request."
                : "Nothing in this group."}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[12px] border border-vz-line">
            {rows.map((row, i) => {
              const node = row.node;
              return (
                <div
                  key={node.id || `${row.method}-${row.path}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectNode?.(node)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectNode?.(node);
                    }
                  }}
                  className={`vz-t flex cursor-pointer items-center gap-3 bg-vz-panel px-3.5 py-2.5 hover:bg-white/3 ${
                    i > 0 ? "border-t border-vz-line-soft" : ""
                  }`}
                >
                  <MethodBadge method={row.method || node.method} size="xs" />
                  <span className="vz-mono min-w-0 flex-1 truncate text-[12.5px] text-vz-text">
                    {row.path || node.path}
                  </span>
                  {row.matches?.length > 1 && (
                    <span className="flex-shrink-0 rounded bg-vz-warn/14 px-1.5 py-0.5 text-[10.5px] text-vz-warn">
                      {row.matches.length} requests
                    </span>
                  )}
                  {row.matches?.length === 1 && (
                    <span className="min-w-0 max-w-[40%] flex-shrink-0 truncate text-[11.5px] text-vz-dim">
                      {row.matches[0].name}
                    </span>
                  )}
                  {row.extra && (
                    <span className="flex-shrink-0 text-[11.5px] text-vz-dim">
                      {node.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverageView;
