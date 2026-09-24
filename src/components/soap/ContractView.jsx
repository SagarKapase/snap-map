import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { pluralize } from "./helpers";

/** A field list from the schema builder's `fields`, one line each. */
const FieldList = ({ fields, builder }) => {
  if (!fields.length) return <span className="sw-muted">— empty —</span>;
  return (
    <div className="sw-fields">
      {fields.map((f) => {
        const resolved = builder.resolveRef(f.schema) || {};
        const type = f.array ? `${typeName(resolved.items ? builder.resolveRef(resolved.items) || resolved.items : resolved, f.schema)}[]` : typeName(resolved, f.schema);
        return (
          <div key={f.name}>
            <span className="sw-mono">{f.xmlName}</span>
            <span className="sw-muted sw-mono">{type}</span>
            {f.required ? "" : <span className="sw-muted">optional</span>}
            {f.attribute && <span className="sw-muted">attribute</span>}
            {f.description && <span className="sw-muted">{f.description}</span>}
          </div>
        );
      })}
    </div>
  );
};

const typeName = (resolved, raw) => {
  if (raw?.$ref) return raw.$ref.split("/").pop();
  if (raw?.allOf?.[0]?.$ref) return raw.allOf[0].$ref.split("/").pop();
  if (!resolved) return "?";
  if (resolved.enum) return `enum(${resolved.enum.slice(0, 4).join("|")}${resolved.enum.length > 4 ? "…" : ""})`;
  if (resolved.type === "array") return `${typeName(resolved.items, resolved.items)}[]`;
  if (resolved.type === "object" || resolved.properties) return "object";
  return `${resolved.type || "any"}${resolved.format ? `<${resolved.format}>` : ""}`;
};

const OperationRow = ({ row, builder, open, onToggle }) => (
  <>
    <tr className={open ? "is-open" : ""}>
      <td style={{ width: 28 }}>
        <button type="button" className="hm-icon-btn" style={{ width: 24, height: 24 }} onClick={onToggle} aria-label={open ? "Collapse" : "Expand"} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </td>
      <td className="sw-mono"><b>{row.soapOperation}</b>{row.documentation && <div className="sw-muted" style={{ fontFamily: "inherit", fontSize: 11.5, marginTop: 2 }}>{row.documentation}</div>}</td>
      <td className="sw-mono">{row.soap.inputElement?.local || <span className="sw-muted">—</span>}</td>
      <td className="sw-mono">{row.soap.outputElement?.local || <span className="sw-muted">one-way</span>}</td>
      <td>{row.errors.filter((e) => e.faults.length).flatMap((e) => e.faults).join(", ") || <span className="sw-muted">—</span>}</td>
      <td className="sw-mono sw-muted" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.soap.action}>{row.soap.action || "—"}</td>
    </tr>
    {open && (
      <tr className="is-open">
        <td />
        <td colSpan={5}>
          <div className="sw-detail">
            <div>
              <h4>Request · {row.soap.inputElement?.local || row.soapOperation}{row.soap.rpc ? " (rpc parts)" : ""}</h4>
              <FieldList fields={row.shapes.input.fields} builder={builder} />
            </div>
            <div>
              <h4>Response · {row.soap.outputElement?.local || "none"}</h4>
              <FieldList fields={row.shapes.output.fields} builder={builder} />
            </div>
            <div>
              <h4>Binding</h4>
              <ul>
                <li>{row.soap.style}/literal, SOAP {row.soap.version || "1.1"}</li>
                {row.soap.endpoint && <li className="sw-mono">{row.soap.endpoint}</li>}
                {row.soap.action && <li className="sw-mono">SOAPAction {row.soap.action}</li>}
              </ul>
            </div>
          </div>
        </td>
      </tr>
    )}
  </>
);

/**
 * The readable WSDL: endpoints, operations with their messages, the
 * types — the free viewer that is the funnel into the workbench.
 */
const ContractView = ({ service, design, query = "" }) => {
  const [open, setOpen] = useState(() => new Set());
  const [showTypes, setShowTypes] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = design.operations.filter((r) => !q || `${r.soapOperation} ${r.soap.inputElement?.local || ""} ${r.documentation}`.toLowerCase().includes(q));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const typeNames = Object.keys(design.components).filter((n) => n !== "Problem");

  return (
    <div>
      <div className="sw-toolbar">
        <div className="sw-row">
          {service.endpoints.map((e) => (
            <span key={`${e.name}-${e.address}`} className="sw-chip sw-mono" title={`${e.binding} · ${e.protocol}${e.soapVersion ? ` · SOAP ${e.soapVersion}` : ""}`}>
              {e.address || e.name}{e.soapVersion ? ` · SOAP ${e.soapVersion}` : ""}
            </span>
          ))}
          {!service.endpoints.length && <span className="sw-chip is-warn"><AlertTriangle size={12} /> No endpoint address declared</span>}
        </div>
        <span className="sw-muted" style={{ fontSize: 12 }}>{pluralize(rows.length, "operation")} · {pluralize(typeNames.length, "type")} · WSDL {service.version}</span>
      </div>

      <div className="sw-table-wrap">
        <table className="sw-table">
          <thead>
            <tr>
              <th />
              <th>Operation</th>
              <th>Input element</th>
              <th>Output element</th>
              <th>Faults</th>
              <th>SOAPAction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <OperationRow key={row.id} row={row} builder={design.builder} open={open.has(row.id)} onToggle={() => toggle(row.id)} />)}
            {!rows.length && <tr><td colSpan={6} className="sw-muted" style={{ textAlign: "center", padding: 24 }}>{q ? "No operation matches the search." : "This WSDL declares no operations."}</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <button type="button" className="sw-btn is-small" onClick={() => setShowTypes((v) => !v)} aria-expanded={showTypes}>
          {showTypes ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {pluralize(typeNames.length, "type")} as JSON Schema
        </button>
        {showTypes && (
          <div className="sw-two" style={{ marginTop: 10 }}>
            {typeNames.map((name) => (
              <div key={name}>
                <div className="sw-pane-title sw-mono">{name}</div>
                <pre className="sw-code is-short">{JSON.stringify(design.components[name], null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractView;
