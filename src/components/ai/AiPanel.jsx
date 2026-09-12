import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Send, Square, Settings2, Eraser, WandSparkles, Loader2, AlertCircle,
  Search, FileText, Braces, ShieldCheck, Crosshair, Filter, ChevronDown,
} from "lucide-react";
import { hasApiKey, getModel, AiError } from "../../utils/ai/client";
import {
  SUGGESTIONS, buildSystemPrompt, createToolRunner, runAssistant,
} from "../../utils/ai/assistant";
import Markdown from "./Markdown";
import AiSetup from "./AiSetup";

const STEP_ICON = {
  search_endpoints: Search,
  get_endpoint: FileText,
  get_schema: Braces,
  get_audit_findings: ShieldCheck,
  show_on_map: Crosshair,
  filter_map: Filter,
};

const shortModel = (id) => String(id || "").split("/").pop().replace(/:free$/, " (free)");

const Steps = ({ steps }) => {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="vz-t flex items-center gap-1 text-[11px] text-vz-dim hover:text-vz-soft"
      >
        <ChevronDown size={11} className={`vz-t ${open ? "" : "-rotate-90"}`} />
        {steps.length} lookup{steps.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-vz-line-soft pl-2.5">
          {steps.map((s, i) => {
            const Icon = STEP_ICON[s.name] || Search;
            return (
              <li key={i} className="flex items-center gap-1.5 text-[11px] text-vz-dim">
                <Icon size={10} className="flex-shrink-0" />
                <span className="truncate">{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * "Ask the map": a drawer over the workspace.
 *
 * The thread lives in the parent so closing the drawer keeps the
 * conversation; a new import clears it. The system prompt is the spec index,
 * rebuilt only when the spec changes.
 */
const AiPanel = ({
  nodes = [],
  spec = null,
  format = "",
  audit = null,
  thread = [],
  onThreadChange,
  actions = {},
  onSelectNode,
  onClose,
}) => {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const ready = useMemo(() => hasApiKey(), [keyTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => getModel(), [keyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const system = useMemo(() => buildSystemPrompt({ nodes, spec, format }), [nodes, spec, format]);
  const runTool = useMemo(
    () => createToolRunner({ nodes, spec, audit, actions }),
    [nodes, spec, audit, actions],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  useEffect(() => {
    if (ready && !showSetup) inputRef.current?.focus();
  }, [ready, showSetup]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (patch) =>
    onThreadChange((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== "assistant") return prev;
      next[next.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
      return next;
    });

  const send = async (text) => {
    const userText = String(text || "").trim();
    if (!userText || busy || !ready) return;
    setInput("");
    setBusy(true);

    const history = thread
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    onThreadChange((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: "user", content: userText },
      { id: `a${Date.now()}`, role: "assistant", content: "", steps: [], pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runAssistant({
        system: system.text,
        history,
        userText,
        runTool,
        signal: controller.signal,
        onToken: (full) => patchLast({ content: full }),
        onStep: (step) => patchLast((last) => ({ steps: [...(last.steps || []), step], content: "" })),
      });
      patchLast({ content: result.content || "(no answer)", steps: result.steps, pending: false });
    } catch (err) {
      if (err?.name === "AbortError") {
        patchLast((last) => ({ pending: false, content: last.content || "", stopped: true }));
      } else {
        patchLast({
          pending: false,
          error: err instanceof AiError ? err.message : `Something went wrong: ${err?.message || err}`,
        });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const stop = () => abortRef.current?.abort();

  const clear = () => {
    stop();
    onThreadChange(() => []);
  };

  return (
    <aside
      className="fixed bottom-[50px] right-2.5 top-[70px] z-[46] flex w-[min(460px,calc(100vw-20px))] flex-col overflow-hidden rounded-[14px] border border-vz-line bg-vz-panel shadow-2xl shadow-black/60"
      aria-label="Assistant"
    >
      {/* Header */}
      <div className="flex h-[48px] flex-shrink-0 items-center gap-2 border-b border-vz-line-soft px-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-vz-accent/15 text-vz-accent-2">
          <WandSparkles size={14} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[13px] font-semibold text-vz-text">Ask the map</p>
          <p className="vz-mono truncate text-[10.5px] text-vz-dim" title={`${model} · index ≈ ${system.index.tokens.toLocaleString()} tokens`}>
            {shortModel(model)} · {system.index.endpoints.toLocaleString()} endpoints indexed
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={!thread.length}
          title="Clear conversation"
          className="vz-t grid h-8 w-8 place-items-center rounded-lg text-vz-dim hover:bg-white/5 hover:text-vz-text disabled:opacity-30"
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowSetup((v) => !v)}
          title="Key and model"
          className={`vz-t grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5 hover:text-vz-text ${showSetup ? "bg-white/6 text-vz-text" : "text-vz-dim"}`}
        >
          <Settings2 size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="vz-t grid h-8 w-8 place-items-center rounded-lg text-vz-dim hover:bg-white/5 hover:text-vz-text"
        >
          <X size={15} />
        </button>
      </div>

      {/* Setup / settings */}
      {(showSetup || !ready) && (
        <div className="vz-scroll flex-shrink-0 overflow-y-auto border-b border-vz-line-soft bg-vz-panel-2" style={{ maxHeight: ready ? "60%" : undefined }}>
          <AiSetup
            onChange={() => {
              setKeyTick((t) => t + 1);
              if (hasApiKey()) setShowSetup(false);
            }}
          />
        </div>
      )}

      {/* Thread */}
      <div ref={scrollRef} className="vz-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {thread.length === 0 && ready && !showSetup && (
          <div className="flex h-full flex-col justify-end gap-2">
            <p className="px-1 text-[12px] leading-relaxed text-vz-dim">
              Ask about this API. Answers come from the specification; endpoints the assistant mentions are
              clickable and can be highlighted on the map.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="vz-t rounded-lg border border-vz-line bg-vz-panel-2 px-3 py-2 text-left text-[12.5px] text-vz-soft hover:border-vz-accent/50 hover:text-vz-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {thread.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-vz-accent/18 px-3.5 py-2 text-[13px] leading-relaxed text-vz-text">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="pr-2">
                <Steps steps={m.steps} />
                {m.error ? (
                  <div className="flex items-start gap-2 rounded-lg border border-vz-red/30 bg-vz-red/[0.08] px-3 py-2.5">
                    <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-vz-red" />
                    <p className="text-[12.5px] leading-relaxed text-vz-soft">{m.error}</p>
                  </div>
                ) : m.pending && !m.content ? (
                  <p className="flex items-center gap-2 text-[12px] text-vz-dim">
                    <Loader2 size={12} className="animate-spin" />
                    {m.steps?.length ? m.steps[m.steps.length - 1].label : "Thinking"}…
                  </p>
                ) : (
                  <>
                    <Markdown text={m.content} nodes={nodes} onSelectNode={onSelectNode} />
                    {m.stopped && <p className="mt-1 text-[11px] italic text-vz-dim">Stopped.</p>}
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {/* Composer */}
      {ready && (
        <div className="flex-shrink-0 border-t border-vz-line-soft p-2.5">
          <div className="flex items-end gap-2 rounded-xl border border-vz-line bg-vz-bg px-3 py-2 focus-within:border-vz-accent/50">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about this API… (Enter to send)"
              className="vz-scroll max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-[13px] leading-[1.5] text-vz-text placeholder:text-vz-dim focus:outline-none"
              style={{ height: `${Math.min(120, 24 + (input.split("\n").length - 1) * 19)}px` }}
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                title="Stop"
                className="vz-t grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-vz-red/15 text-vz-red hover:bg-vz-red/25"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim()}
                title="Send"
                className="vz-t grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] text-[#160a1d] disabled:opacity-30"
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export default AiPanel;
