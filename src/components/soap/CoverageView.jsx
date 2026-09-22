import { useState } from "react";
import { Upload, X } from "lucide-react";
import { MIGRATION_STATUSES } from "../../utils/soap/design";
import { parseTrafficText } from "../../utils/soap/workbench";
import { StatusBadge } from "./common";
import { formatCalls, pluralize } from "./helpers";

const pct = (n) => `${Math.round(n * 100)}%`;

const StatusBar = ({ byStatus, total }) => (
  <div className="sw-status-bar" role="img" aria-label={MIGRATION_STATUSES.map((s) => `${s.label} ${byStatus[s.id]}`).join(", ")}>
    {MIGRATION_STATUSES.map((s) => (byStatus[s.id] ? <i key={s.id} className={`sw-status-${s.id}`} style={{ width: `${(byStatus[s.id] / Math.max(1, total)) * 100}%` }} /> : null))}
  </div>
);

const TrafficDialog = ({ service, operations, onSave, onClose }) => {
  const [text, setText] = useState("");
  const parsed = parseTrafficText(text, operations);
  return (
    <div className="hm-panel" style={{ padding: 14, marginBottom: 14 }}>
      <div className="sw-pane-title">
        <span>Traffic for {service.name}</span>
        <button type="button" className="hm-icon-btn" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <p className="sw-muted" style={{ fontSize: 12, marginBottom: 8 }}>Paste one line per operation: <span className="sw-mono">operation, calls</span> — from the gateway's report or a log count. Operation names are matched case-insensitively.</p>
      <label className="sw-field">
        Calls per operation
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={`${operations[0] || "GetAccountBalance"}, 412000\n${operations[1] || "OpenAccount"}, 1200`} aria-label="Traffic per operation" />
      </label>
      <div className="sw-row" style={{ marginTop: 8, justifyContent: "space-between" }}>
        <span className="sw-muted" style={{ fontSize: 12 }}>
          {Object.keys(parsed.traffic).length} matched{parsed.unknown.length ? ` · ${parsed.unknown.length} unknown (${parsed.unknown.slice(0, 3).join(", ")}${parsed.unknown.length > 3 ? "…" : ""})` : ""}{parsed.bad.length ? ` · ${parsed.bad.length} line${parsed.bad.length === 1 ? "" : "s"} ignored` : ""}
        </span>
        <button type="button" className="sw-btn is-small is-primary" disabled={!Object.keys(parsed.traffic).length} onClick={() => onSave(parsed.traffic)}>Save traffic</button>
      </div>
    </div>
  );
};

/**
 * The programme dashboard: coverage by operation and by traffic, per
 * service, and the queue — what to migrate next.
 */
const CoverageView = ({ coverage, services, onSelectService, onSaveTraffic, query = "" }) => {
  const [trafficFor, setTrafficFor] = useState(null);
  const q = query.trim().toLowerCase();
  const queue = coverage.queue.filter((item) => !q || `${item.operation} ${item.serviceName}`.toLowerCase().includes(q)).slice(0, 60);
  const target = trafficFor ? services.find((s) => s.id === trafficFor) : null;

  return (
    <div>
      <div className="sw-tiles">
        <div className="sw-tile"><b>{coverage.services}</b><span>services in the programme</span></div>
        <div className="sw-tile"><b>{coverage.operations}</b><span>operations</span></div>
        <div className="sw-tile"><b>{pct(coverage.share)}</b><span>migrated or retired ({coverage.done} of {coverage.operations})</span></div>
        <div className="sw-tile"><b>{coverage.hasTraffic ? pct(coverage.trafficShare) : "—"}</b><span>{coverage.hasTraffic ? `of ${formatCalls(coverage.traffic)} calls covered` : "no traffic entered yet"}</span></div>
        <div className="sw-tile"><b>{coverage.hasTraffic ? coverage.pareto : "—"}</b><span>{coverage.hasTraffic ? "operations carry 80 % of calls" : "Pareto slice needs traffic"}</span></div>
      </div>

      <StatusBar byStatus={coverage.byStatus} total={coverage.operations} />
      <div className="sw-legend">
        {MIGRATION_STATUSES.map((s) => <span key={s.id}><i className={`sw-status-${s.id}`} />{s.label} {coverage.byStatus[s.id]}</span>)}
      </div>

      {target && (
        <div style={{ marginTop: 14 }}>
          <TrafficDialog service={target} operations={target.operations} onClose={() => setTrafficFor(null)} onSave={(traffic) => { onSaveTraffic(target.id, traffic); setTrafficFor(null); }} />
        </div>
      )}

      <h3 style={{ margin: "18px 0 8px", fontSize: 13, fontWeight: 700 }}>By service</h3>
      <div className="sw-table-wrap">
        <table className="sw-table">
          <thead>
            <tr><th>Service</th><th>Operations</th><th>Done</th><th style={{ minWidth: 160 }}>Coverage</th><th>Traffic</th><th style={{ minWidth: 160 }}>Traffic covered</th><th /></tr>
          </thead>
          <tbody>
            {coverage.perService.map((s) => (
              <tr key={s.id}>
                <td><button type="button" className="sw-btn is-small" onClick={() => onSelectService(s.id)}>{s.name}</button></td>
                <td>{s.operations}</td>
                <td>{s.done}</td>
                <td><div className="sw-bar"><i style={{ width: pct(s.share) }} /></div><span className="sw-pct">{pct(s.share)}</span></td>
                <td>{s.traffic ? formatCalls(s.traffic) : <span className="sw-muted">—</span>}</td>
                <td>{s.traffic ? <><div className="sw-bar"><i className="is-traffic" style={{ width: pct(s.trafficShare) }} /></div><span className="sw-pct" style={{ color: "#d8b4fe" }}>{pct(s.trafficShare)}</span></> : <span className="sw-muted">—</span>}</td>
                <td><button type="button" className="sw-btn is-small" onClick={() => setTrafficFor(s.id)}><Upload size={12} /> Traffic</button></td>
              </tr>
            ))}
            {!coverage.perService.length && <tr><td colSpan={7} className="sw-muted" style={{ textAlign: "center", padding: 24 }}>Add a WSDL to start the programme.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: "18px 0 8px", fontSize: 13, fontWeight: 700 }}>Queue — {coverage.hasTraffic ? "undone operations by traffic" : "undone operations"} {queue.length < coverage.queue.length ? <span className="sw-muted" style={{ fontWeight: 500 }}>(first {queue.length} of {coverage.queue.length})</span> : null}</h3>
      <div className="sw-table-wrap">
        <table className="sw-table">
          <thead>
            <tr><th>#</th><th>Operation</th><th>Service</th><th>Status</th><th>Calls</th><th>Share</th><th>Cumulative</th></tr>
          </thead>
          <tbody>
            {queue.map((item, i) => (
              <tr key={`${item.serviceId}:${item.operation}`} style={item.done ? { opacity: 0.55 } : undefined}>
                <td className="sw-muted">{i + 1}</td>
                <td className="sw-mono">{item.operation}</td>
                <td><button type="button" className="sw-btn is-small" onClick={() => onSelectService(item.serviceId)}>{item.serviceName}</button></td>
                <td><StatusBadge status={item.status} /></td>
                <td>{coverage.hasTraffic ? formatCalls(item.calls) : <span className="sw-muted">—</span>}</td>
                <td>{coverage.hasTraffic ? pct(item.trafficShare) : <span className="sw-muted">—</span>}</td>
                <td>{coverage.hasTraffic ? pct(item.cumulativeShare) : <span className="sw-muted">—</span>}</td>
              </tr>
            ))}
            {!queue.length && <tr><td colSpan={7} className="sw-muted" style={{ textAlign: "center", padding: 24 }}>{q ? "No operation matches the search." : "Nothing queued."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sw-muted" style={{ marginTop: 8, fontSize: 11.5 }}>{pluralize(coverage.operations, "operation")} across {pluralize(coverage.services, "service")}. Migrated and skipped both count as done; traffic weights come from the gateway or a log count you paste per service.</p>
    </div>
  );
};

export default CoverageView;
