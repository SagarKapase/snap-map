import { useState } from "react";
import { KeyRound, ShieldAlert, ArrowUpRight, Trash2, Check } from "lucide-react";
import {
  DEFAULT_MODEL,
  forgetApiKey,
  getModel,
  keySource,
  looksLikeApiKey,
  saveApiKey,
  saveModel,
} from "../../utils/ai/client";

/**
 * The "no key yet" card, and the settings behind the gear once there is one.
 *
 * Two routes to a key: `VITE_OPENROUTER_API_KEY` in `.env.local` for local
 * development, or a key pasted here and kept in this browser. The same
 * disclosure the Postman panel makes applies — the key goes to OpenRouter
 * and nowhere else, because there is no Vizroute server for it to go to.
 */
const AiSetup = ({ onChange, compact = false }) => {
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState(getModel());
  const [saved, setSaved] = useState(false);
  const source = keySource();

  const commitKey = () => {
    const key = draftKey.trim();
    if (!key) return;
    saveApiKey(key);
    setDraftKey("");
    onChange?.();
  };

  const commitModel = () => {
    const model = draftModel.trim();
    saveModel(model === DEFAULT_MODEL ? "" : model);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    onChange?.();
  };

  return (
    <div className={compact ? "" : "px-4 py-4"}>
      {source === "none" ? (
        <>
          <p className="text-[13px] leading-relaxed text-vz-soft">
            The assistant runs on OpenRouter. Add a key to <span className="vz-mono text-vz-text">.env.local</span> and
            restart the dev server:
          </p>
          <pre className="vz-mono mt-2 overflow-x-auto rounded-lg border border-vz-line-soft bg-vz-bg px-3 py-2 text-[11.5px] leading-[1.7] text-vz-soft">
            {`VITE_OPENROUTER_API_KEY=sk-or-v1-…\nVITE_OPENROUTER_MODEL=${DEFAULT_MODEL}`}
          </pre>
          <p className="mt-3 text-[12px] leading-relaxed text-vz-dim">
            Or paste a key here to keep it in this browser only.
          </p>
        </>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-vz-soft">
          Key loaded from{" "}
          <span className="text-vz-text">{source === "env" ? ".env.local" : "this browser"}</span>. Pasting a
          key below overrides it for this browser.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitKey(); }}
          placeholder="sk-or-v1-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="OpenRouter API key"
          className="vz-mono h-9 min-w-0 flex-1 rounded-lg border border-vz-line bg-vz-bg px-3 text-[12.5px] text-vz-text outline-none focus:border-vz-accent/60"
        />
        <button
          type="button"
          disabled={!draftKey.trim()}
          onClick={commitKey}
          className="vz-t flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-3.5 text-[12.5px] font-semibold text-[#160a1d] disabled:opacity-40"
        >
          <KeyRound size={13} /> Save
        </button>
      </div>
      {draftKey.trim() && !looksLikeApiKey(draftKey) && (
        <p className="mt-1.5 text-[11.5px] text-vz-dim">
          OpenRouter keys begin with <span className="vz-mono">sk-or-v1-</span>. This will still be tried as entered.
        </p>
      )}

      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
        Model
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={draftModel}
          onChange={(e) => setDraftModel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitModel(); }}
          spellCheck={false}
          aria-label="OpenRouter model id"
          className="vz-mono h-9 min-w-0 flex-1 rounded-lg border border-vz-line bg-vz-bg px-3 text-[12px] text-vz-text outline-none focus:border-vz-accent/60"
        />
        <button
          type="button"
          onClick={commitModel}
          className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12.5px] text-vz-soft hover:text-vz-text"
        >
          {saved ? <Check size={13} className="text-vz-green" /> : null}
          {saved ? "Saved" : "Use"}
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-vz-dim">
        Any OpenRouter model id works; ones that support tool calling give the best results.
      </p>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-vz-warn/25 bg-vz-warn/[0.07] px-3.5 py-3">
        <ShieldAlert size={14} className="mt-0.5 flex-shrink-0 text-vz-warn" />
        <p className="text-[12px] leading-relaxed text-vz-soft">
          The loaded specification is sent to OpenRouter and the model you choose — never to Vizroute,
          which has no server. Values that look like credentials are redacted before they leave the browser.
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <a
          href="https://openrouter.ai/settings/keys"
          target="_blank"
          rel="noreferrer noopener"
          className="vz-t inline-flex items-center gap-1 text-[12px] text-vz-accent-2 hover:underline"
        >
          Create a key on OpenRouter <ArrowUpRight size={12} />
        </a>
        {source === "browser" && (
          <button
            type="button"
            onClick={() => { forgetApiKey(); onChange?.(); }}
            className="vz-t ml-auto inline-flex items-center gap-1 text-[12px] text-vz-dim hover:text-vz-red"
          >
            <Trash2 size={12} /> Forget saved key
          </button>
        )}
      </div>
    </div>
  );
};

export default AiSetup;
