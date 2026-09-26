import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Wand2 } from "lucide-react";
import {
  CopyButton,
  DownloadButton,
  ErrorLine,
  PasteArea,
  ResultPanel,
  SampleMenu,
} from "../../components/tools/inputs";
import { goToPlace } from "../../utils/tools/caret";
import { parseJson, formatJson, describeStats, formatBytes } from "../../utils/tools/json";
import { detectFormat, formatLabel } from "../../utils/parsers";

const SAMPLES = [
  {
    label: "A broken one",
    text: `{
  // a config file, more or less
  "name": 'my-service',
  port: 8080,
  "tags": ["api", "http",],
  "retries": NaN
}`,
  },
  {
    label: "Duplicate keys",
    text: `{
  "id": 1,
  "name": "Ada",
  "id": 2
}`,
  },
  {
    label: "An OpenAPI file",
    text: `{"openapi":"3.1.0","info":{"title":"Example API","version":"1.0.0"},"paths":{"/v1/customers":{"get":{"summary":"List all customers","tags":["Customers"],"responses":{"200":{"description":"A list of customers"}}}}}}`,
  },
];

const INDENTS = [
  { id: "2", label: "2 spaces", value: 2 },
  { id: "4", label: "4 spaces", value: 4 },
  { id: "tab", label: "Tabs", value: "\t" },
  { id: "min", label: "Minified", value: 0 },
];

/**
 * The JSON formatter.
 *
 * Everything on the page is derived from the text in the box — there is no
 * "Format" button to press, because the answer is already known by the time
 * anybody could press it. What the buttons choose is the *shape* of the
 * output, and that is a preference, not an action.
 */
const JsonFormatterTool = () => {
  const [text, setText] = useState("");
  const [indent, setIndent] = useState("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [strict, setStrict] = useState(false);
  const inputRef = useRef(null);

  const result = useMemo(() => (text.trim() ? parseJson(text, { tolerant: !strict }) : null), [text, strict]);

  const output = useMemo(() => {
    if (!result?.ok) return "";
    const chosen = INDENTS.find((option) => option.id === indent) || INDENTS[0];
    return formatJson(result.ast, { indent: chosen.value, sortKeys });
  }, [result, indent, sortKeys]);

  // The hook: only when what was pasted is something the map can open.
  const known = useMemo(() => {
    if (!result?.ok || typeof result.value !== "object" || result.value === null) return null;
    const kind = detectFormat(result.value);
    return kind === "custom" ? null : { kind, label: formatLabel(result.value) };
  }, [result]);

  const goTo = (place) => goToPlace(inputRef.current, place);

  const error = result?.errors[0] || null;
  const repairs = result?.repairs || [];
  const duplicates = result?.duplicates || [];

  return (
    <>
      <SampleMenu samples={SAMPLES} onPick={setText} />

      <div className="tl-controls">
        {INDENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setIndent(option.id)}
            aria-pressed={indent === option.id}
            className={`tl-btn${indent === option.id ? " is-on" : ""}`}
          >
            {option.label}
          </button>
        ))}
        <span className="tl-controls-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSortKeys((v) => !v)}
          aria-pressed={sortKeys}
          className={`tl-btn${sortKeys ? " is-on" : ""}`}
        >
          Sort keys
        </button>
        <button
          type="button"
          onClick={() => setStrict((v) => !v)}
          aria-pressed={strict}
          className={`tl-btn${strict ? " is-on" : ""}`}
          title="Report comments, trailing commas and single quotes as errors instead of fixing them"
        >
          Strict JSON
        </button>
      </div>

      <div className="tl-panes">
        <div>
          <PasteArea
            id="json-input"
            label="Your JSON"
            value={text}
            onChange={setText}
            textareaRef={inputRef}
            placeholder={'Paste JSON here, or drop a .json file.\n\n{\n  "hello": "world"\n}'}
            hint={result?.stats ? `${formatBytes(result.stats.bytes)} · ${result.stats.lines} lines` : "Nothing is uploaded — this runs in your browser."}
          />

          {error && (
            <div className="tl-notes">
              <ErrorLine error={error} onGoTo={goTo} tone="error" />
            </div>
          )}

          {!error && repairs.length > 0 && (
            <div className="tl-notes">
              <p className="tl-notes-title">
                <Wand2 size={12} aria-hidden="true" /> Read anyway, with {repairs.length}{" "}
                {repairs.length === 1 ? "thing" : "things"} fixed
              </p>
              {repairs.slice(0, 8).map((repair) => (
                <ErrorLine key={`${repair.offset}-${repair.kind}`} error={repair} onGoTo={goTo} tone="warn" />
              ))}
              {repairs.length > 8 && <p className="tl-pane-foot">…and {repairs.length - 8} more.</p>}
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="tl-notes">
              <p className="tl-notes-title">
                <AlertTriangle size={12} aria-hidden="true" /> Duplicate{" "}
                {duplicates.length === 1 ? "key" : "keys"} — the last value wins and the earlier one is lost
              </p>
              {duplicates.slice(0, 6).map((dup) => (
                <ErrorLine
                  key={`${dup.offset}-${dup.key}`}
                  error={{ ...dup, message: `"${dup.path}" was already set on line ${dup.firstLine}.` }}
                  onGoTo={goTo}
                  tone="warn"
                />
              ))}
            </div>
          )}
        </div>

        <ResultPanel
          label="Formatted"
          value={output}
          empty={text.trim() ? "Fix the problem on the left and it appears here." : "Paste something on the left."}
          foot={result?.ok ? describeStats(result.stats) : ""}
          actions={
            <>
              <CopyButton text={output} />
              <DownloadButton text={output} filename="formatted.json" />
            </>
          }
        />
      </div>

      {known && (
        <p className="tl-hook">
          <span>
            That is <strong>{known.label}</strong>. It can be opened as a map — every endpoint, its parameters and
            its schemas, drawn out.
          </span>
          <Link to="/workspace" className="tl-hook-cta">
            Open it as a map
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
};

export default JsonFormatterTool;
