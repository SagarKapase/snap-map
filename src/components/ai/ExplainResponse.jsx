import { useEffect, useRef, useState } from "react";
import { WandSparkles, Loader2, X, AlertCircle } from "lucide-react";
import { AiError } from "../../utils/ai/client";
import { explainResponse } from "../../utils/ai/explain";
import Markdown from "./Markdown";

/**
 * The explanation block in the playground's response pane.
 *
 * Starts as soon as it mounts; the parent mounts it when the user clicks
 * "Explain" and keys it on the response, so a new response starts fresh.
 */
const ExplainResponse = ({ node, spec, request, response, onClose }) => {
  const [state, setState] = useState("running"); // running | done | error
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    explainResponse({ node, spec, request, response, signal: controller.signal, onToken: setText })
      .then((result) => {
        setText(result.content);
        setState("done");
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err instanceof AiError ? err.message : `Could not explain this response: ${err?.message || err}`);
        setState("error");
      });
    return () => controller.abort();
    // The parent re-keys this component per response, so one run per mount is intended.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-4 mt-3 rounded-xl border border-vz-accent/25 bg-vz-accent/[0.06] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <WandSparkles size={12} className="text-vz-accent-2" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vz-accent-2">
          {state === "running" ? "Explaining" : "Explanation"}
        </span>
        {state === "running" && <Loader2 size={11} className="animate-spin text-vz-dim" />}
        <button
          type="button"
          onClick={onClose}
          title="Dismiss"
          className="vz-t ml-auto grid h-6 w-6 place-items-center rounded text-vz-dim hover:bg-white/6 hover:text-vz-text"
        >
          <X size={12} />
        </button>
      </div>
      <div className="mt-2">
        {state === "error" ? (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-vz-soft">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-vz-red" /> {error}
          </p>
        ) : text ? (
          <Markdown text={text} className="text-[12.5px]" />
        ) : (
          <p className="text-[12px] text-vz-dim">Reading the request, the response and what the spec declares…</p>
        )}
      </div>
    </div>
  );
};

export default ExplainResponse;
