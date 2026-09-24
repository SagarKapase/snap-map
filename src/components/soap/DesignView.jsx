import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, Sparkles } from "lucide-react";
import { Method, StatusBadge, Confidence } from "./common";
import { pluralize } from "./helpers";
import { MIGRATION_STATUSES } from "../../utils/soap/design";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const ParamList = ({ params, where }) => {
  if (!params.length) return null;
  return (
    <div>
      <h4>{where}</h4>
      <ul>
        {params.map((p) => (
          <li key={p.name}>
            <span className="sw-mono">{p.name}</span>
            {p.field && p.field !== p.name ? <span className="sw-muted"> ← {p.xmlName || p.field}</span> : p.xmlName && p.xmlName !== p.name ? <span className="sw-muted"> ← {p.xmlName}</span> : null}
            {"required" in p && !p.required ? <span className="sw-muted"> optional</span> : null}
            {!p.field && where === "Path" ? <span className="is-warn"> — no matching request field</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Detail = ({ row, ambiguities }) => {
  const related = ambiguities.filter((a) => [row.requestBody?.wrapper, row.response.wrapper, row.soap.inputWrapper, row.soap.outputWrapper].filter(Boolean).some((w) => a.path.startsWith(w)));
  return (
    <div className="sw-detail">
      <div>
        <h4>Why</h4>
        <ul>
          {row.rationale.map((r, i) => <li key={i}>{r}</li>)}
          {row.reviewReasons.map((r, i) => <li key={`r${i}`} className="is-warn"><AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{r}</li>)}
        </ul>
      </div>
      <div>
        <ParamList params={row.pathParams} where="Path" />
        <ParamList params={row.queryParams} where="Query" />
        {row.requestBody && (
          <div>
            <h4>Body</h4>
            <ul>{row.requestBody.fields.map((f) => <li key={f.name}><span className="sw-mono">{f.name}</span>{f.required ? "" : <span className="sw-muted"> optional</span>}</li>)}</ul>
          </div>
        )}
        {!row.pathParams.length && !row.queryParams.length && !row.requestBody && <div><h4>Request</h4><ul><li className="sw-muted">No parameters.</li></ul></div>}
      </div>
      <div>
        <h4>Responses</h4>
        <ul>
          <li><span className="sw-mono">{row.response.status}</span> {row.response.schema ? <span className="sw-mono">{row.response.schema.$ref ? row.response.schema.$ref.split("/").pop() : row.response.schema.type === "array" ? `${row.response.schema.items?.$ref?.split("/").pop() || row.response.schema.items?.type || "item"}[]` : row.response.schema.type || "object"}</span> : <span className="sw-muted">no body</span>}{row.response.unwrapped && <span className="sw-muted"> (unwrapped from {row.response.unwrapped})</span>}</li>
          {row.errors.map((e) => <li key={e.status}><span className="sw-mono">{e.status}</span> {e.reason}{e.faults.length ? <span className="sw-muted"> ← {e.faults.join(", ")}</span> : null}</li>)}
        </ul>
        {related.length > 0 && (
          <>
            <h4 style={{ marginTop: 10 }}>Schema ambiguities</h4>
            <ul>{related.map((a, i) => <li key={i}><span className="sw-mono">{a.path}</span> — {a.message} <span className="sw-muted">{a.decision}</span></li>)}</ul>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * The reviewable proposal: one row per operation with the method, path
 * and summary editable in place, the status, the confidence, and — when
 * opened — the rationale, parameters, responses and ambiguities.
 */
const DesignView = ({ design, options, onOption, onOverride, onStatus, onResetOverride, query = "", readOnly = false }) => {
  const [open, setOpen] = useState(() => new Set());
  const [onlyReview, setOnlyReview] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = design.operations.filter((r) => (!onlyReview || r.review) && (!q || `${r.soapOperation} ${r.method} ${r.path} ${r.summary}`.toLowerCase().includes(q)));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const commit = (row, key, value) => {
    if (readOnly) return;
    const current = design.operations.find((r) => r.id === row.id);
    const original = current.overridden[key] !== undefined ? current.overridden[key] : current[key];
    const next = String(value ?? "").trim();
    if (!next || next === current[key]) return;
    onOverride(row.id, { [key]: next === original ? undefined : next });
  };

  return (
    <div>
      <div className="sw-toolbar">
        <div className="sw-row">
          <label className="sw-field">
            Property names
            <select value={options.propertyCase} onChange={(e) => onOption({ propertyCase: e.target.value })} disabled={readOnly}>
              <option value="camel">camelCase</option>
              <option value="snake">snake_case</option>
              <option value="keep">as in the XSD</option>
            </select>
          </label>
          <label className="sw-field">
            Base path
            <input value={options.basePath} onChange={(e) => onOption({ basePath: e.target.value })} placeholder="/v1" style={{ width: 90 }} disabled={readOnly} />
          </label>
          <button type="button" className={`sw-btn is-small${onlyReview ? " is-active" : ""}`} onClick={() => setOnlyReview((v) => !v)} aria-pressed={onlyReview}>
            <AlertTriangle size={13} /> Needs review {design.stats.review ? `(${design.stats.review})` : ""}
          </button>
        </div>
        <span className="sw-muted" style={{ fontSize: 12 }}>
          {pluralize(design.stats.operations, "operation")} · {pluralize(design.stats.resources, "resource")} · {pluralize(design.stats.ambiguities, "schema ambiguity", "schema ambiguities")}
        </span>
      </div>

      <div className="sw-table-wrap">
        <table className="sw-table">
          <thead>
            <tr>
              <th />
              <th>SOAP operation</th>
              <th>Method</th>
              <th>Path</th>
              <th>Summary</th>
              <th>Status</th>
              <th>Confidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = open.has(row.id);
              const changed = Object.keys(row.overridden).length > 0;
              return (
                <RowGroup key={row.id}>
                  <tr className={isOpen ? "is-open" : ""}>
                    <td style={{ width: 28 }}>
                      <button type="button" className="hm-icon-btn" style={{ width: 24, height: 24 }} onClick={() => toggle(row.id)} aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={isOpen}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="sw-mono" style={{ whiteSpace: "nowrap" }}>
                      {row.soapOperation}
                      {row.review && <span className="sw-chip is-review" style={{ marginLeft: 8, height: 18, fontSize: 10 }}><AlertTriangle size={10} /> review</span>}
                    </td>
                    <td>
                      <select className={`sw-inline-edit sw-mono${row.overridden.method ? " is-changed" : ""}`} value={row.method} onChange={(e) => commit(row, "method", e.target.value)} aria-label={`Method for ${row.soapOperation}`} disabled={readOnly}>
                        {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td style={{ minWidth: 190 }}>
                      <input
                        className={`sw-inline-edit sw-mono${row.overridden.path ? " is-changed" : ""}`}
                        defaultValue={row.path}
                        key={`${row.id}:${row.path}`}
                        onBlur={(e) => commit(row, "path", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label={`Path for ${row.soapOperation}`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input
                        className={`sw-inline-edit${row.overridden.summary ? " is-changed" : ""}`}
                        defaultValue={row.summary}
                        key={`${row.id}:${row.summary}`}
                        onBlur={(e) => commit(row, "summary", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label={`Summary for ${row.soapOperation}`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td>
                      {readOnly ? <StatusBadge status={row.status} /> : (
                        <select className={`sw-inline-edit sw-status ${row.status}`} value={row.status} onChange={(e) => onStatus(row.id, e.target.value)} aria-label={`Status for ${row.soapOperation}`}>
                          {MIGRATION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td><Confidence value={row.confidence} /></td>
                    <td style={{ width: 32 }}>
                      {changed && !readOnly && (
                        <button type="button" className="hm-icon-btn" style={{ width: 24, height: 24 }} onClick={() => onResetOverride(row.id)} title="Back to the proposal" aria-label={`Reset ${row.soapOperation} to the proposal`}>
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="is-open">
                      <td />
                      <td colSpan={7}><Detail row={row} ambiguities={design.ambiguities} /></td>
                    </tr>
                  )}
                </RowGroup>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={8} className="sw-muted" style={{ textAlign: "center", padding: 24 }}>{onlyReview ? "Nothing needs review." : q ? "No operation matches the search." : "No operations to design."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="sw-muted" style={{ marginTop: 10, fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
        <Sparkles size={13} /> Edit a method, path or summary in place; a changed row is the reviewer's decision and stops being flagged. Use the status to track the migration.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {METHODS.map((m) => <span key={m} className="sw-muted" style={{ fontSize: 11 }}><Method m={m} /> {design.stats.byMethod[m] || 0}</span>)}
      </div>
    </div>
  );
};

// A fragment with a key, for the row pair.
const RowGroup = ({ children }) => <>{children}</>;

export default DesignView;
