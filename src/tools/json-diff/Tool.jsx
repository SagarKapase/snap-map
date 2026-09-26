import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Minus, MoveRight, Plus, PencilLine } from "lucide-react";
import { ErrorLine, PasteArea } from "../../components/tools/inputs";
import { parseJson } from "../../utils/tools/json";
import { diffJson, describeDiff, ARRAY_STRATEGIES } from "../../utils/tools/jsonDiff";
import { detectFormat, formatLabel } from "../../utils/parsers";

const BEFORE = `{
  "name": "orders-api",
  "version": "1.4.0",
  "scopes": ["orders:read", "orders:write"],
  "limits": { "rate": 100, "burst": 200 },
  "regions": [
    { "id": "eu", "latency": 30 },
    { "id": "us", "latency": 45 }
  ]
}`;

const AFTER = `{
  "version": "1.5.0",
  "name": "orders-api",
  "scopes": ["orders:write", "orders:read", "orders:admin"],
  "limits": { "rate": "100", "burst": 200, "concurrent": 8 },
  "regions": [
    { "id": "ap", "latency": 80 },
    { "id": "eu", "latency": 26 },
    { "id": "us", "latency": 45 }
  ]
}`;

const MARKS = {
  added: { icon: Plus, label: "added", tone: "add" },
  removed: { icon: Minus, label: "removed", tone: "remove" },
  changed: { icon: PencilLine, label: "changed", tone: "change" },
  moved: { icon: MoveRight, label: "moved", tone: "move" },
};

const Row = ({ change }) => {
  const mark = MARKS[change.op];
  const Icon = mark.icon;
  const typed = change.op === "changed" && change.fromType !== change.toType;
  return (
    <li className={`tl-change is-${mark.tone}`}>
      <span className="tl-change-mark" title={mark.label}>
        <Icon size={13} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <code className="tl-change-path">{change.path}</code>
        {typed && (
          <span className="tl-change-types">
            {change.fromType} → {change.toType}
          </span>
        )}
        <span className="tl-change-values">
          {change.op !== "added" && <code className="tl-change-from">{change.from}</code>}
          {(change.op === "changed" || change.op === "moved") && (
            <ArrowRight size={12} aria-hidden="true" className="tl-change-arrow" />
          )}
          {change.op !== "removed" && <code className="tl-change-to">{change.to}</code>}
        </span>
      </span>
    </li>
  );
};

const JsonDiffTool = () => {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [strategy, setStrategy] = useState("index");
  const [keyField, setKeyField] = useState("id");

  const a = useMemo(() => (left.trim() ? parseJson(left) : null), [left]);
  const b = useMemo(() => (right.trim() ? parseJson(right) : null), [right]);

  const result = useMemo(() => {
    if (!a?.ok || !b?.ok) return null;
    return diffJson(a.ast, b.ast, { arrays: strategy, keyField: keyField.trim() || "id" });
  }, [a, b, strategy, keyField]);

  // Both sides have to be something the map can open before offering it.
  const known = useMemo(() => {
    if (!a?.ok || !b?.ok) return null;
    const both = [a.value, b.value];
    if (both.some((value) => typeof value !== "object" || value === null)) return null;
    if (both.some((value) => detectFormat(value) === "custom")) return null;
    return formatLabel(a.value);
  }, [a, b]);

  const both = () => (
    <div className="tl-panes">
      <div>
        <PasteArea
          id="diff-left"
          label="Before"
          value={left}
          onChange={setLeft}
          placeholder="Paste the earlier document here."
        />
        {a && !a.ok && (
          <div className="tl-notes">
            <ErrorLine error={a.errors[0]} tone="error" />
          </div>
        )}
      </div>
      <div>
        <PasteArea
          id="diff-right"
          label="After"
          value={right}
          onChange={setRight}
          placeholder="…and the later one here."
        />
        {b && !b.ok && (
          <div className="tl-notes">
            <ErrorLine error={b.errors[0]} tone="error" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="tl-samples">
        <span className="tl-dim">Try one:</span>
        <button
          type="button"
          className="tl-chip"
          onClick={() => {
            setLeft(BEFORE);
            setRight(AFTER);
          }}
        >
          Two versions of a config
        </button>
        <button
          type="button"
          className="tl-chip"
          onClick={() => {
            setLeft("");
            setRight("");
          }}
        >
          Clear both
        </button>
      </div>

      <div className="tl-controls">
        <span className="tl-dim">Arrays:</span>
        {ARRAY_STRATEGIES.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.hint}
            onClick={() => setStrategy(option.id)}
            aria-pressed={strategy === option.id}
            className={`tl-btn${strategy === option.id ? " is-on" : ""}`}
          >
            {option.label}
          </button>
        ))}
        {strategy === "key" && (
          <>
            <span className="tl-controls-sep" aria-hidden="true" />
            <label htmlFor="diff-key" className="tl-dim">
              matched on
            </label>
            <input
              id="diff-key"
              value={keyField}
              onChange={(e) => setKeyField(e.target.value)}
              className="tl-inline-input"
              spellCheck={false}
            />
          </>
        )}
      </div>

      <p className="tl-pane-foot" style={{ marginTop: 0, marginBottom: 14 }}>
        {ARRAY_STRATEGIES.find((option) => option.id === strategy)?.hint}
      </p>

      {both()}

      {result && (
        <section className="tl-result-block" aria-label="Differences">
          <div className="tl-summary">
            <strong>{describeDiff(result)}</strong>
            {!result.identical && (
              <span className="tl-dim">
                {result.changes.length} place{result.changes.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {!result.identical && (
            <ul className="tl-changes">
              {result.changes.map((change) => (
                <Row key={`${change.op}-${change.path}-${change.from}-${change.to}`} change={change} />
              ))}
            </ul>
          )}
        </section>
      )}

      {known && (
        <p className="tl-hook">
          <span>
            Both of those are <strong>{known}</strong>. The API Map diffs them as APIs — which operations changed,
            and which changes would break the clients already calling you.
          </span>
          <Link to="/workspace" className="tl-hook-cta">
            Diff them as APIs
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
};

export default JsonDiffTool;
