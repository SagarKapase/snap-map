import { useEffect, useMemo, useState } from "react";
import { ErrorLine, PasteArea } from "../../components/tools/inputs";
import { parseJson, minifyJson, formatBytes } from "../../utils/tools/json";
import { profileJson, gzipSize, asPercent } from "../../utils/tools/jsonSize";

const SAMPLE = JSON.stringify(
  {
    page: 1,
    total: 3,
    results: Array.from({ length: 12 }, (_, i) => ({
      identifier: `ord_${1000 + i}`,
      customerDisplayName: `Customer number ${i}`,
      createdTimestampUtc: "2026-03-14T09:21:00.000Z",
      updatedTimestampUtc: "2026-03-14T09:21:00.000Z",
      status: "fulfilled",
      auditTrail: Array.from({ length: 6 }, (_, j) => ({
        eventIdentifier: `evt_${i}_${j}`,
        eventTimestampUtc: "2026-03-14T09:21:00.000Z",
        actorDisplayName: "system",
        description: "State transition recorded by the fulfilment service",
      })),
    })),
  },
  null,
  2,
);

const Bar = ({ share }) => (
  <span className="tl-bar" aria-hidden="true">
    <span className="tl-bar-fill" style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />
  </span>
);

const Figure = ({ label, value, note }) => (
  <div className="tl-figure">
    <span className="tl-figure-value">{value}</span>
    <span className="tl-figure-label">{label}</span>
    {note && <span className="tl-figure-note">{note}</span>}
  </div>
);

const JsonSizeTool = () => {
  const [text, setText] = useState("");
  // Keyed by the text it was measured from, so a figure from the last paste
  // is never shown beside a payload it does not belong to.
  const [gzip, setGzip] = useState({ of: "", bytes: null });

  const parsed = useMemo(() => (text.trim() ? parseJson(text) : null), [text]);
  const profile = useMemo(() => (parsed?.ok ? profileJson(parsed.ast) : null), [parsed]);
  const minified = useMemo(() => (parsed?.ok ? minifyJson(parsed.ast) : ""), [parsed]);

  // Measured rather than estimated — the browser has a real gzip in it.
  useEffect(() => {
    if (!minified) return undefined;
    let cancelled = false;
    gzipSize(minified).then((bytes) => {
      if (!cancelled) setGzip({ of: minified, bytes });
    });
    return () => {
      cancelled = true;
    };
  }, [minified]);

  const gzipped = gzip.of === minified ? gzip.bytes : null;

  const saved = profile && text.length ? new TextEncoder().encode(text).length - profile.bytes : 0;

  return (
    <>
      <div className="tl-samples">
        <span className="tl-dim">Try one:</span>
        <button type="button" className="tl-chip" onClick={() => setText(SAMPLE)}>
          A heavy API response
        </button>
      </div>

      <div className="tl-panes">
        <div>
          <PasteArea
            id="size-input"
            label="Your payload"
            value={text}
            onChange={setText}
            placeholder="Paste a response, or drop a .json file."
            hint="Nothing is uploaded — it is measured in your browser."
          />
          {parsed && !parsed.ok && (
            <div className="tl-notes">
              <ErrorLine error={parsed.errors[0]} tone="error" />
            </div>
          )}
        </div>

        <div>
          {profile ? (
            <>
              <div className="tl-figures">
                <Figure label="minified" value={formatBytes(profile.bytes)} note={saved > 0 ? `${formatBytes(saved)} of it was whitespace` : ""} />
                <Figure
                  label="gzipped"
                  value={gzipped === null ? "measuring…" : formatBytes(gzipped)}
                  note={gzipped === null ? "" : `${asPercent(gzipped / profile.bytes)} of the raw size`}
                />
                <Figure label="field names" value={asPercent(profile.keyShare)} note={formatBytes(profile.keyBytes)} />
                <Figure
                  label="values"
                  value={asPercent(profile.valueBytes / profile.bytes)}
                  note={formatBytes(profile.valueBytes)}
                />
              </div>

              {profile.keyShare > 0.3 && (
                <p className="tl-note is-warn" style={{ marginTop: 14 }}>
                  <span className="tl-note-text">
                    Field names are {asPercent(profile.keyShare)} of this payload. On a list of small records that is
                    usually the thing to fix first — shorter names, or a shape that does not repeat them per row.
                  </span>
                </p>
              )}
            </>
          ) : (
            <div className="tl-pane">
              <div className="tl-result tl-dim">Paste a payload to see where its bytes go.</div>
            </div>
          )}
        </div>
      </div>

      {profile && profile.heaviest.length > 0 && (
        <section className="tl-result-block" aria-label="The heaviest parts">
          <div className="tl-summary">
            <strong>Where the bytes are</strong>
            <span className="tl-dim">largest first, by minified size</span>
          </div>
          <ul className="tl-weights">
            {profile.heaviest.map((entry) => (
              <li key={entry.path}>
                <code className="tl-change-path">{entry.path}</code>
                <Bar share={entry.share} />
                <span className="tl-weight-bytes">{formatBytes(entry.bytes)}</span>
                <span className="tl-weight-share">{asPercent(entry.share)}</span>
                <span className="tl-dim tl-weight-kind">
                  {entry.kind}
                  {entry.count > 1 ? ` · ${entry.count}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

export default JsonSizeTool;
