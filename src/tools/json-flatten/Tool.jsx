import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { CopyButton, DownloadButton, ErrorLine, PasteArea, ResultPanel } from "../../components/tools/inputs";
import { parseJson } from "../../utils/tools/json";
import { flattenJson, unflattenJson, toCsv, toEnvLines, ARRAY_STYLES } from "../../utils/tools/flatten";

const SAMPLE = `{
  "service": { "name": "orders", "port": 8080 },
  "database": { "host": "localhost", "replicas": ["a", "b"] },
  "features": { "beta": true, "experiments": [] },
  "owners": [
    { "name": "Ada", "email": "ada@example.com" },
    { "name": "Grace", "email": "grace@example.com" }
  ]
}`;

const DELIMITERS = [
  { id: ".", label: "a.b" },
  { id: "/", label: "a/b" },
  { id: "__", label: "a__b" },
];

const OUTPUTS = [
  { id: "json", label: "Flat JSON" },
  { id: "csv", label: "CSV" },
  { id: "env", label: "Environment" },
];

const JsonFlattenTool = () => {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState("flatten");
  const [delimiter, setDelimiter] = useState(".");
  const [arrays, setArrays] = useState("brackets");
  const [output, setOutput] = useState("json");

  const parsed = useMemo(() => (text.trim() ? parseJson(text) : null), [text]);
  const options = { delimiter, arrays };

  const flattened = useMemo(() => {
    if (direction !== "flatten" || !parsed?.ok) return null;
    return flattenJson(parsed.value, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, direction, delimiter, arrays]);

  const restored = useMemo(() => {
    if (direction !== "unflatten" || !parsed?.ok) return null;
    return unflattenJson(parsed.value, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, direction, delimiter, arrays]);

  const result = useMemo(() => {
    if (direction === "unflatten") {
      return restored ? JSON.stringify(restored.value, null, 2) : "";
    }
    if (!flattened || !parsed?.ok) return "";
    if (output === "csv") return toCsv(parsed.value, options);
    if (output === "env") return toEnvLines(flattened.entries);
    return JSON.stringify(Object.fromEntries(flattened.entries.map((entry) => [entry.key, entry.value])), null, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, flattened, restored, output, parsed, delimiter, arrays]);

  const collisions = flattened?.collisions || [];
  const problems = restored?.problems || [];
  const filename = direction === "unflatten" ? "nested.json" : output === "csv" ? "flat.csv" : output === "env" ? ".env" : "flat.json";

  return (
    <>
      <div className="tl-samples">
        <span className="tl-dim">Try one:</span>
        <button type="button" className="tl-chip" onClick={() => { setText(SAMPLE); setDirection("flatten"); }}>
          A nested config
        </button>
        <button
          type="button"
          className="tl-chip"
          onClick={() => {
            setText('{\n  "service.name": "orders",\n  "service.port": 8080,\n  "tags[0]": "api",\n  "tags[1]": "http"\n}');
            setDirection("unflatten");
          }}
        >
          Dotted keys to nest
        </button>
      </div>

      <div className="tl-controls">
        <button
          type="button"
          onClick={() => setDirection(direction === "flatten" ? "unflatten" : "flatten")}
          className="tl-btn is-on"
        >
          <ArrowLeftRight size={14} aria-hidden="true" />
          {direction === "flatten" ? "Nested → flat" : "Flat → nested"}
        </button>
        <span className="tl-controls-sep" aria-hidden="true" />
        <span className="tl-dim">Separator</span>
        {DELIMITERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setDelimiter(option.id)}
            aria-pressed={delimiter === option.id}
            className={`tl-btn${delimiter === option.id ? " is-on" : ""}`}
          >
            {option.label}
          </button>
        ))}
        <span className="tl-controls-sep" aria-hidden="true" />
        <span className="tl-dim">Indices</span>
        {ARRAY_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            title={style.hint}
            onClick={() => setArrays(style.id)}
            aria-pressed={arrays === style.id}
            className={`tl-btn${arrays === style.id ? " is-on" : ""}`}
          >
            {style.label}
          </button>
        ))}
        {direction === "flatten" && (
          <>
            <span className="tl-controls-sep" aria-hidden="true" />
            {OUTPUTS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setOutput(option.id)}
                aria-pressed={output === option.id}
                className={`tl-btn${output === option.id ? " is-on" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="tl-panes">
        <div>
          <PasteArea
            id="flatten-input"
            label={direction === "flatten" ? "Nested JSON" : "Flat JSON"}
            value={text}
            onChange={setText}
            placeholder={
              direction === "flatten"
                ? 'Paste nested JSON.\n\n{ "a": { "b": 1 } }'
                : 'Paste one level of dotted keys.\n\n{ "a.b": 1 }'
            }
          />
          {parsed && !parsed.ok && (
            <div className="tl-notes">
              <ErrorLine error={parsed.errors[0]} tone="error" />
            </div>
          )}
          {collisions.length > 0 && (
            <div className="tl-notes">
              <p className="tl-notes-title">
                <AlertTriangle size={12} aria-hidden="true" />
                {collisions.length} key{collisions.length === 1 ? "" : "s"} already contain the separator
              </p>
              <p className="tl-pane-foot">
                Flattened, {collisions.slice(0, 4).map((key) => `"${key}"`).join(", ")}
                {collisions.length > 4 ? " and others" : ""} cannot be told from a nested key. Choose a separator that
                does not appear in your keys.
              </p>
            </div>
          )}
          {problems.length > 0 && (
            <div className="tl-notes">
              <p className="tl-notes-title">
                <AlertTriangle size={12} aria-hidden="true" />
                {problems.length} key{problems.length === 1 ? "" : "s"} overwrote something already set
              </p>
              <p className="tl-pane-foot">{problems.slice(0, 5).join(", ")}</p>
            </div>
          )}
        </div>

        <ResultPanel
          label={direction === "flatten" ? OUTPUTS.find((o) => o.id === output).label : "Nested JSON"}
          value={result}
          empty="Paste something on the left."
          foot={flattened ? `${flattened.entries.length} key${flattened.entries.length === 1 ? "" : "s"}` : ""}
          actions={
            <>
              <CopyButton text={result} />
              <DownloadButton
                text={result}
                filename={filename}
                type={output === "csv" && direction === "flatten" ? "text/csv" : "application/json"}
              />
            </>
          }
        />
      </div>
    </>
  );
};

export default JsonFlattenTool;
