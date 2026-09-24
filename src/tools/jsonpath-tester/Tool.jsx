import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { CopyButton, ErrorLine, PasteArea, ResultPanel } from "../../components/tools/inputs";
import { parseJson } from "../../utils/tools/json";
import { queryJson, suggestPaths, describeMatches } from "../../utils/tools/jsonPath";
import { detectFormat, formatLabel } from "../../utils/parsers";

const SAMPLE = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99 },
      { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  },
  "expensive": 10
}`;

const EXAMPLES = [
  { path: "$..price", note: "every price, at any depth" },
  { path: "$.store.book[*].title", note: "each title" },
  { path: "$.store.book[?(@.price > 10)]", note: "the expensive ones" },
  { path: "$.store.book[?(@.isbn)].title", note: "the ones with an ISBN" },
  { path: "$.store.book[-1:]", note: "the last one" },
];

const JsonPathTool = () => {
  const [text, setText] = useState(SAMPLE);
  const [path, setPath] = useState("$..price");
  const inputRef = useRef(null);

  const document = useMemo(() => (text.trim() ? parseJson(text) : null), [text]);
  const result = useMemo(
    () => (document?.ok ? queryJson(document.value, path) : null),
    [document, path],
  );
  const suggestions = useMemo(
    () => (document?.ok ? suggestPaths(document.value, { limit: 14, depth: 3 }) : []),
    [document],
  );

  const output = useMemo(() => {
    if (!result?.ok) return "";
    if (!result.matches.length) return "";
    return JSON.stringify(
      result.matches.map((match) => match.value),
      null,
      2,
    );
  }, [result]);

  const known = useMemo(() => {
    if (!document?.ok || typeof document.value !== "object" || document.value === null) return null;
    return detectFormat(document.value) === "custom" ? null : formatLabel(document.value);
  }, [document]);

  return (
    <>
      <div className="tl-samples">
        <span className="tl-dim">Try one:</span>
        {EXAMPLES.map((example) => (
          <button key={example.path} type="button" className="tl-chip" title={example.note} onClick={() => setPath(example.path)}>
            {example.path}
          </button>
        ))}
      </div>

      <div className="tl-query">
        <label htmlFor="jsonpath-query" className="tl-pane-label">
          Path
        </label>
        <input
          id="jsonpath-query"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="tl-query-input"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="$.items[?(@.active)].name"
          aria-invalid={result && !result.ok ? true : undefined}
        />
        <span className="tl-query-count">
          {result?.ok ? describeMatches(result.matches) : ""}
        </span>
      </div>

      {result && !result.ok && (
        <p className="tl-note is-error" style={{ marginBottom: 14 }}>
          <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span className="tl-note-text">{result.error}</span>
        </p>
      )}

      <div className="tl-panes">
        <div>
          <PasteArea
            id="jsonpath-doc"
            label="Document"
            value={text}
            onChange={setText}
            textareaRef={inputRef}
            placeholder="Paste the JSON you want to query."
          />
          {document && !document.ok && (
            <div className="tl-notes">
              <ErrorLine error={document.errors[0]} tone="error" />
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="tl-suggest">
              <p className="tl-notes-title">Paths in this document</p>
              <div className="tl-suggest-list">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="tl-chip" onClick={() => setPath(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <ResultPanel
            label="Matches"
            value={output}
            empty={result?.ok ? "Nothing matched that path." : "Write a path to see what it selects."}
            actions={<CopyButton text={output} />}
          />
          {result?.ok && result.matches.length > 0 && (
            <div className="tl-suggest">
              <p className="tl-notes-title">Where each one came from</p>
              <div className="tl-suggest-list">
                {result.matches.slice(0, 40).map((match) => (
                  <button
                    key={match.path}
                    type="button"
                    className="tl-chip"
                    title="Narrow to this one"
                    onClick={() => setPath(match.path)}
                  >
                    {match.path}
                  </button>
                ))}
                {result.matches.length > 40 && <span className="tl-dim">…and {result.matches.length - 40} more</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {known && (
        <p className="tl-hook">
          <span>
            That is <strong>{known}</strong>. The playground in the API Map sends the real request and gives you a
            response to query instead of a file.
          </span>
          <Link to="/workspace" className="tl-hook-cta">
            Query a live response
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
    </>
  );
};

export default JsonPathTool;
