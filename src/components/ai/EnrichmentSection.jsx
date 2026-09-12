import { useEffect, useMemo, useState } from "react";
import { WandSparkles, Loader2, Check, AlertCircle, Square, ChevronDown } from "lucide-react";
import { AiError, hasApiKey } from "../../utils/ai/client";
import { applyEnrichment, draftEnrichment, findEnrichmentCandidates } from "../../utils/ai/enrich";
import MethodBadge from "../workspace/MethodBadge";
import AiSetup from "./AiSetup";

// One run is bounded so a 1,600-operation spec does not become one giant bill.
const MAX_PER_RUN = 100;

const FIELD_LABEL = {
  summary: "summary",
  description: "description",
  operationId: "operationId",
  tags: "tags",
  name: "name",
};

/**
 * "Draft the missing docs": the audit's documentation findings, answered.
 *
 * Sits under the deterministic repairs in the audit view and follows the
 * same contract — propose, let the user pick, apply to a copy.
 */
const EnrichmentSection = ({ nodes = [], spec = null, format = "", onApply }) => {
  const [phase, setPhase] = useState("idle"); // idle | drafting | review
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [proposals, setProposals] = useState([]);
  const [infoDescription, setInfoDescription] = useState("");
  const [chosen, setChosen] = useState(new Set());
  const [includeInfo, setIncludeInfo] = useState(true);
  const [error, setError] = useState("");
  const [controller, setController] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const ready = useMemo(() => hasApiKey(), [keyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const { candidates, infoMissing } = useMemo(
    () => findEnrichmentCandidates({ nodes, spec, format }),
    [nodes, spec, format],
  );

  // A new spec means new candidates; anything drafted for the old one is stale.
  useEffect(() => {
    setPhase("idle");
    setProposals([]);
    setInfoDescription("");
    setError("");
  }, [spec]);

  useEffect(() => () => controller?.abort(), [controller]);

  const fieldCounts = useMemo(() => {
    const counts = {};
    candidates.forEach((c) => c.needs.forEach((f) => { counts[f] = (counts[f] || 0) + 1; }));
    return counts;
  }, [candidates]);

  if (!candidates.length && !infoMissing) return null;

  const apiName = spec?.info?.title || spec?.info?.name || "";
  const batch = candidates.slice(0, MAX_PER_RUN);

  const start = async () => {
    const ac = new AbortController();
    setController(ac);
    setPhase("drafting");
    setError("");
    setProgress({ done: 0, total: batch.length });
    try {
      const result = await draftEnrichment({
        candidates: batch,
        infoMissing,
        apiName,
        signal: ac.signal,
        onProgress: setProgress,
      });
      setProposals(result.proposals);
      setInfoDescription(result.infoDescription);
      setChosen(new Set(result.proposals.map((p) => p.id)));
      setIncludeInfo(Boolean(result.infoDescription));
      setPhase("review");
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err instanceof AiError ? err.message : `Drafting failed: ${err?.message || err}`);
      }
      setPhase("idle");
    } finally {
      setController(null);
    }
  };

  const apply = () => {
    const picked = proposals.filter((p) => chosen.has(p.id));
    const result = applyEnrichment({
      spec,
      format,
      proposals: picked,
      infoDescription: includeInfo ? infoDescription : "",
    });
    onApply?.(result);
    setPhase("idle");
    setProposals([]);
  };

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const summaryLine = Object.entries(fieldCounts)
    .map(([f, n]) => `${n} ${FIELD_LABEL[f]}${n === 1 ? "" : "s"}`)
    .join(", ");

  return (
    <div className="mt-5 overflow-hidden rounded-[14px] border border-vz-line">
      <div className="flex items-center gap-2 border-b border-vz-line-soft bg-vz-panel-2 px-3.5 py-2.5">
        <WandSparkles size={13} className="text-vz-accent-2" />
        <span className="text-[12.5px] font-semibold text-vz-text">Documentation the AI can draft</span>
        <span className="ml-auto text-[11px] text-vz-dim">proposed, then applied to a copy</span>
      </div>

      {/* Idle */}
      {phase === "idle" && (
        <div className="bg-vz-panel px-3.5 py-3">
          <p className="text-[12.5px] leading-relaxed text-vz-soft">
            {candidates.length ? (
              <>
                <span className="text-vz-text">{candidates.length.toLocaleString()}</span> operation
                {candidates.length === 1 ? " is" : "s are"} missing {summaryLine}
                {infoMissing ? ", and the API has no description" : ""}.
              </>
            ) : (
              "The API itself has no description."
            )}{" "}
            Drafts are written from the paths, parameters and schemas the spec already declares — nothing
            is applied until you choose it.
          </p>
          {candidates.length > MAX_PER_RUN && (
            <p className="mt-1.5 text-[11.5px] text-vz-dim">
              Drafted {MAX_PER_RUN} operations at a time; run it again after applying for the rest.
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-vz-red/30 bg-vz-red/[0.08] px-3 py-2.5">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-vz-red" />
              <p className="text-[12.5px] leading-relaxed text-vz-soft">{error}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ready ? (
              <button
                type="button"
                onClick={start}
                className="vz-t flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#160a1d]"
              >
                <WandSparkles size={13} />
                Draft {batch.length ? `for ${batch.length} operation${batch.length === 1 ? "" : "s"}` : "the API description"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSetup((v) => !v)}
                className="vz-t flex items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3.5 py-1.5 text-[12.5px] font-medium text-vz-soft hover:text-vz-text"
              >
                <ChevronDown size={13} className={`vz-t ${showSetup ? "" : "-rotate-90"}`} />
                Set up the OpenRouter key first
              </button>
            )}
          </div>

          {!ready && showSetup && (
            <div className="mt-3 rounded-xl border border-vz-line bg-vz-panel-2 px-3.5 py-3">
              <AiSetup compact onChange={() => setKeyTick((t) => t + 1)} />
            </div>
          )}
        </div>
      )}

      {/* Drafting */}
      {phase === "drafting" && (
        <div className="flex items-center gap-3 bg-vz-panel px-3.5 py-3">
          <Loader2 size={14} className="animate-spin text-vz-accent-2" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-vz-text">
              Drafting… {progress.total ? `${Math.min(progress.done, progress.total)} of ${progress.total}` : ""}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-vz-bg">
              <div
                className="h-full rounded-full bg-vz-accent"
                style={{ width: progress.total ? `${Math.min(100, (progress.done / progress.total) * 100)}%` : "30%" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => controller?.abort()}
            className="vz-t flex items-center gap-1 rounded-lg border border-vz-line px-2.5 py-1 text-[12px] text-vz-soft hover:text-vz-text"
          >
            <Square size={11} /> Stop
          </button>
        </div>
      )}

      {/* Review */}
      {phase === "review" && (
        <>
          {infoDescription && (
            <label className="flex cursor-pointer items-start gap-2.5 bg-vz-panel px-3.5 py-2.5">
              <input
                type="checkbox"
                checked={includeInfo}
                onChange={(e) => setIncludeInfo(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-[#a855f7]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-vz-text">API description</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-vz-soft">{infoDescription}</span>
              </span>
            </label>
          )}

          {proposals.length === 0 && !infoDescription && (
            <p className="bg-vz-panel px-3.5 py-3 text-[12.5px] text-vz-soft">The model returned nothing usable. Try again.</p>
          )}

          <div className="vz-scroll max-h-[520px] overflow-y-auto">
            {proposals.map((p, i) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-2.5 bg-vz-panel px-3.5 py-2.5 ${i > 0 || infoDescription ? "border-t border-vz-line-soft" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="mt-1 h-3.5 w-3.5 flex-shrink-0 accent-[#a855f7]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <MethodBadge method={p.method} size="xs" />
                    <span className="vz-mono truncate text-[11.5px] text-vz-soft" title={p.path}>{p.path}</span>
                    {p.fields.tags?.length ? (
                      <span className="ml-auto flex gap-1">
                        {p.fields.tags.map((t) => (
                          <span key={t} className="rounded bg-vz-blue/15 px-1.5 py-px text-[10.5px] text-vz-blue">{t}</span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {(p.fields.summary || p.fields.name) && (
                    <span className="mt-1 block text-[12.5px] text-vz-text">{p.fields.summary || p.fields.name}</span>
                  )}
                  {p.fields.description && (
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-vz-soft">{p.fields.description}</span>
                  )}
                  {p.fields.operationId && (
                    <span className="vz-mono mt-1 block text-[10.5px] text-vz-dim">operationId: {p.fields.operationId}</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-vz-line-soft bg-vz-panel-2 px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => setChosen(new Set(proposals.map((p) => p.id)))}
              className="vz-t text-[12px] text-vz-soft hover:text-vz-text"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setChosen(new Set())}
              className="vz-t text-[12px] text-vz-soft hover:text-vz-text"
            >
              None
            </button>
            <button
              type="button"
              onClick={() => { setPhase("idle"); setProposals([]); }}
              className="vz-t text-[12px] text-vz-dim hover:text-vz-text"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!chosen.size && !(includeInfo && infoDescription)}
              onClick={apply}
              className="vz-t ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#160a1d] disabled:opacity-40"
            >
              <Check size={13} />
              Apply {chosen.size || ""} {chosen.size === 1 ? "draft" : "drafts"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EnrichmentSection;
