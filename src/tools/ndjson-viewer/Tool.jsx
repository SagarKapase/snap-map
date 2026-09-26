import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeftRight } from "lucide-react";
import { CopyButton, DownloadButton, PasteArea } from "../../components/tools/inputs";
import { formatJson } from "../../utils/tools/json";
import { parseNdjson, filterRecords, toJsonArray, fromJsonArray, describeNdjson } from "../../utils/tools/ndjson";

const SAMPLE = [
  '{"ts":"2026-03-14T09:21:00Z","level":"info","service":"orders","msg":"request received","status":200,"ms":14}',
  '{"ts":"2026-03-14T09:21:01Z","level":"warn","service":"orders","msg":"slow query","status":200,"ms":840}',
  '{"ts":"2026-03-14T09:21:02Z","level":"error","service":"payments","msg":"upstream refused","status":502,"ms":31}',
  '{"ts":"2026-03-14T09:21:03Z","level":"info","service":"orders","msg":"request received","status":200,"ms":11}',
  '{"ts":"2026-03-14T09:21:04Z","level":"error","service":"orders","msg":"validation failed","status":422}',
  '{"ts":"2026-03-14T09:21:05Z","level":"info","service":"payments"',
  '{"ts":"2026-03-14T09:21:06Z","level":"info","service":"orders","msg":"done","status":200,"ms":9}',
].join("\n");

const NdjsonTool = () => {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);

  const read = useMemo(() => parseNdjson(text), [text]);
  const filtered = useMemo(() => filterRecords(read.records, query), [read, query]);
  const asArray = useMemo(() => toJsonArray(filtered.records), [filtered]);

  const swap = () => {
    const back = fromJsonArray(text);
    if (back.text) setText(back.text);
  };

  return (
    <>
      <div className="tl-samples">
        <span className="tl-dim">Try one:</span>
        <button type="button" className="tl-chip" onClick={() => setText(SAMPLE)}>
          A log with one broken line
        </button>
        <button type="button" className="tl-chip" onClick={swap} title="Turn a pasted JSON array into one document per line">
          <ArrowLeftRight size={12} aria-hidden="true" /> Array → lines
        </button>
      </div>

      <div className="tl-query">
        <label htmlFor="ndjson-filter" className="tl-pane-label">
          Filter
        </label>
        <input
          id="ndjson-filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="tl-query-input"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="a word to search for, or $[?(@.status >= 500)]"
        />
        <span className="tl-query-count">
          {query ? `${filtered.records.length} of ${read.records.length}` : describeNdjson(read)}
        </span>
      </div>

      {filtered.error && (
        <p className="tl-note is-error" style={{ marginBottom: 14 }}>
          <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span className="tl-note-text">{filtered.error}</span>
        </p>
      )}

      <div className="tl-panes">
        <div>
          <PasteArea
            id="ndjson-input"
            label="JSON Lines"
            value={text}
            onChange={setText}
            accept=".ndjson,.jsonl,.json,.log,.txt,application/json,text/plain"
            placeholder={'Paste or drop a .ndjson or .jsonl file.\n\n{"id":1}\n{"id":2}'}
            hint={read.stats.lines ? `${read.stats.lines} records` : "One complete JSON document per line."}
          />

          {read.keys.length > 0 && (
            <div className="tl-suggest">
              <p className="tl-notes-title">Fields across the records</p>
              <div className="tl-suggest-list">
                {read.keys.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    className="tl-chip"
                    title={`In ${field.count} of ${read.stats.ok} records`}
                    onClick={() => setQuery(`$[?(@.${field.key})]`)}
                  >
                    {field.key}
                    <span className="tl-dim"> {field.share === 1 ? "all" : `${Math.round(field.share * 100)}%`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="tl-pane">
          <div className="tl-pane-head">
            <span className="tl-pane-label">Records</span>
            <div className="tl-pane-actions">
              <CopyButton text={asArray} label="Copy as array" />
              <DownloadButton text={asArray} filename="records.json" />
            </div>
          </div>

          <div className="tl-pane-body">
          <ol className="tl-records">
            {filtered.records.length === 0 && (
              <li className="tl-dim" style={{ padding: "14px 16px" }}>
                {read.stats.lines ? "No record matches that." : "Paste some JSON Lines on the left."}
              </li>
            )}
            {filtered.records.slice(0, 300).map((record) => (
              <li key={record.line} className={record.ok ? "" : "is-bad"}>
                <button
                  type="button"
                  className="tl-record"
                  onClick={() => setOpen(open === record.line ? null : record.line)}
                  aria-expanded={open === record.line}
                >
                  <span className="tl-record-line">{record.line}</span>
                  <span className="tl-record-text">
                    {record.ok ? record.raw : `${record.error?.message || "Could not be read."}`}
                  </span>
                </button>
                {open === record.line && record.ok && (
                  <pre className="tl-record-open">{formatJson(record.ast, { indent: 2 })}</pre>
                )}
              </li>
            ))}
            {filtered.records.length > 300 && (
              <li className="tl-dim" style={{ padding: "10px 16px" }}>
                …and {filtered.records.length - 300} more. Narrow the filter to see them.
              </li>
            )}
          </ol>
          </div>
          <div className="tl-pane-foot">
            <span>{query ? `${filtered.records.length} shown of ${read.records.length}` : describeNdjson(read)}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default NdjsonTool;
