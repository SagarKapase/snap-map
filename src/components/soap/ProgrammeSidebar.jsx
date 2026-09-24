import { useRef, useState } from "react";
import { Upload, Link2, ClipboardPaste, LayoutDashboard, FileCode2, Download, FolderInput, Sparkles, Trash2, AlertTriangle } from "lucide-react";
import { pluralize } from "./helpers";

const pct = (n) => `${Math.round(n * 100)}%`;

/**
 * The drop zone and the three other ways in: files, pasted text, a URL.
 * Accepts WSDLs, XSDs (attached to the selected service, or to the WSDLs
 * dropped with them) and a programme export.
 */
export const AddPanel = ({ onFiles, onPaste, onUrl, onSample, fetching = false, compact = false, hasSelection = false }) => {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className={compact ? "sw-add" : ""}>
      <div
        className={`sw-drop${over ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files || []); }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Add WSDL or XSD files"
      >
        <Upload size={20} />
        <b>Drop WSDL and XSD files</b>
        <small>{hasSelection ? "XSDs attach to the selected service; WSDLs become services." : "Drop a WSDL with the XSDs it imports; or click to choose."}</small>
        <input ref={inputRef} type="file" multiple accept=".wsdl,.xsd,.xml,.json,text/xml,application/xml" className="sr-only" onChange={(e) => { onFiles(e.target.files || []); e.target.value = ""; }} aria-hidden="true" tabIndex={-1} />
      </div>
      <div className="sw-row" style={{ marginTop: 8 }}>
        <button type="button" className={`sw-btn is-small${mode === "paste" ? " is-active" : ""}`} onClick={() => setMode(mode === "paste" ? "" : "paste")}><ClipboardPaste size={13} /> Paste</button>
        <button type="button" className={`sw-btn is-small${mode === "url" ? " is-active" : ""}`} onClick={() => setMode(mode === "url" ? "" : "url")}><Link2 size={13} /> URL</button>
        {onSample && <button type="button" className="sw-btn is-small" onClick={onSample}><Sparkles size={13} /> Bank sample</button>}
      </div>
      {mode === "paste" && (
        <div style={{ marginTop: 8 }}>
          <label className="sw-field">
            WSDL text
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="<wsdl:definitions …" aria-label="WSDL text" />
          </label>
          <button type="button" className="sw-btn is-small is-primary" style={{ marginTop: 6 }} disabled={!text.trim()} onClick={() => { onPaste(text); setText(""); setMode(""); }}>Add service</button>
        </div>
      )}
      {mode === "url" && (
        <div style={{ marginTop: 8 }}>
          <label className="sw-field">
            WSDL URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/Service.svc?wsdl" aria-label="WSDL URL" onKeyDown={(e) => e.key === "Enter" && url.trim() && onUrl(url)} />
          </label>
          <button type="button" className="sw-btn is-small is-primary" style={{ marginTop: 6 }} disabled={!url.trim() || fetching} onClick={() => onUrl(url)}>{fetching ? "Fetching…" : "Fetch"}</button>
        </div>
      )}
    </div>
  );
};

/** The programme: the coverage entry, the services with their coverage, and the ways to add more. */
const ProgrammeSidebar = ({ services, coverage, activeId, view, onSelect, onShowCoverage, onRemove, onExport, onImport, query = "", addProps }) => {
  const q = query.trim().toLowerCase();
  const listed = services.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.operations || []).some((op) => op.toLowerCase().includes(q)));
  const importRef = useRef(null);

  return (
    <aside className="hm-panel sw-side" aria-label="Migration programme">
      <div className="hm-panel-head">
        <div className="hm-panel-title"><FileCode2 size={15} /> Programme</div>
        <div className="sw-row" style={{ gap: 4 }}>
          <button type="button" className="hm-icon-btn" onClick={onExport} title="Export the programme" aria-label="Export the programme" disabled={!services.length}><Download size={15} /></button>
          <button type="button" className="hm-icon-btn" onClick={() => importRef.current?.click()} title="Import a programme file" aria-label="Import a programme file"><FolderInput size={15} /></button>
          <input ref={importRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { onImport(e.target.files || []); e.target.value = ""; }} aria-hidden="true" tabIndex={-1} />
        </div>
      </div>
      <div className="sw-side-scroll">
        <ul className="sw-services">
          <li>
            <button type="button" className={`sw-service${view === "coverage" ? " is-active" : ""}`} onClick={onShowCoverage} aria-current={view === "coverage" ? "page" : undefined}>
              <span style={{ minWidth: 0 }}>
                <span className="sw-service-name"><LayoutDashboard size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Coverage</span>
                <span className="sw-service-meta">{pluralize(coverage.operations, "operation")} · {coverage.done} done{coverage.hasTraffic ? ` · ${pct(coverage.trafficShare)} of traffic` : ""}</span>
                <span className="sw-bar"><i style={{ width: pct(coverage.share) }} /></span>
              </span>
              <span className="sw-pct">{pct(coverage.share)}</span>
            </button>
          </li>
          {listed.map((s) => {
            const row = coverage.perService.find((p) => p.id === s.id);
            const active = view === "service" && s.id === activeId;
            return (
              <li key={s.id}>
                <button type="button" className={`sw-service${active ? " is-active" : ""}`} onClick={() => onSelect(s.id)} aria-current={active ? "page" : undefined}>
                  <span style={{ minWidth: 0 }}>
                    <span className="sw-service-name">{s.name}</span>
                    <span className="sw-service-meta">
                      {pluralize((s.operations || []).length, "operation")}
                      {s.attachmentNames?.length ? ` · ${pluralize(s.attachmentNames.length, "schema")}` : ""}
                      {s.warnings ? <span style={{ color: "#fcd34d" }}> · <AlertTriangle size={10} style={{ verticalAlign: -1 }} /> {s.warnings}</span> : ""}
                    </span>
                    <span className="sw-bar"><i style={{ width: pct(row?.share || 0) }} /></span>
                  </span>
                  <span className="sw-row" style={{ gap: 2, flexWrap: "nowrap" }}>
                    <span className="sw-pct">{pct(row?.share || 0)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="hm-icon-btn"
                      style={{ width: 24, height: 24 }}
                      onClick={(e) => { e.stopPropagation(); onRemove(s.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onRemove(s.id); } }}
                      title="Remove from the programme"
                      aria-label={`Remove ${s.name}`}
                    >
                      <Trash2 size={13} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!listed.length && services.length > 0 && <li className="hm-empty">No service matches the search.</li>}
        </ul>
        <AddPanel compact hasSelection={view === "service" && Boolean(activeId)} {...addProps} />
      </div>
    </aside>
  );
};

export default ProgrammeSidebar;
