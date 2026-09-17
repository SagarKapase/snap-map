import { useState } from "react";
import { X, Server, Copy, Check, Settings2, Boxes, Play, Trash2, RefreshCw, Globe } from "lucide-react";
import { methodColor } from "../../utils/constants";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const relativePath = (path, servers = []) => {
  const server = servers.find((u) => u && path.startsWith(u));
  return server ? path.slice(server.length) || "/" : path;
};

const Method = ({ m }) => {
  const c = methodColor(m);
  return <span className={`cg-method ${c.text} ${c.bg || ""}`}>{m}</span>;
};

const Dot = ({ color }) => <span className="small-dot" style={{ background: color }} />;

const TABS = ["Overview", "Operations", "Entities", "Relationships"];

/**
 * The right-hand panel for one service. Everything shown is what the
 * document declares or what the graph computed; "depends on" means the
 * services this one calls or references, "used by" the reverse.
 */
const ServiceDetails = ({ graph, serviceId, impacted = [], onClose, onOpenInExplorer, onDelete, onReplace, onRefetch }) => {
  const [tab, setTab] = useState("Overview");
  const [copied, setCopied] = useState(false);
  const s = graph.services.find((x) => x.id === serviceId);
  if (!s) return null;
  const nameOf = (id) => graph.services.find((x) => x.id === id);
  const outgoing = graph.edges.filter((e) => e.from === s.id && e.kind !== "shares");
  const incoming = graph.edges.filter((e) => e.to === s.id && e.kind !== "shares");
  const shares = graph.edges.filter((e) => e.kind === "shares" && (e.from === s.id || e.to === s.id));
  const dependsOn = [...new Set(outgoing.map((e) => e.to))];
  const usedBy = [...new Set(incoming.map((e) => e.from))];
  const noAuth = !s.isCollection && s.operations.length > 0 && s.operations.every((op) => !op.auth.length);

  const copyServer = () => {
    navigator.clipboard?.writeText(s.servers.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside className="cg-details" aria-label={`${s.name} details`}>
      <div className="cg-details-head">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cg-details-title">
              <span className="cg-dot" style={{ background: s.color }} />
              <h2 title={s.name}>{s.name}</h2>
            </div>
            <div className="cg-details-sub">
              {s.formatLabel}{s.version ? ` · v${s.version.replace(/^v/i, "")}` : ""} · {plural(s.operations.length, "operation")} · {plural(s.entities.length, "entity", "entities")}
            </div>
          </div>
          <span className={`cg-pill ${s.isCollection ? "" : noAuth ? "warn" : "green"}`} style={{ marginTop: 2 }}>
            {s.isCollection ? "Consumer" : noAuth ? "No auth declared" : "Auth declared"}
          </span>
          <button type="button" onClick={onClose} aria-label="Close details" className="cg-btn icon" style={{ height: 30, width: 30, marginTop: -2 }}>
            <X size={14} />
          </button>
        </div>
        <div className="cg-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`cg-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="cg-details-body">
        {tab === "Overview" && (
          <>
            <div className="cg-card">
              <div className="cg-card-title">Description</div>
              <div className="cg-desc">{s.description || "The specification carries no description."}</div>
            </div>
            <div className="cg-card">
              <div className="cg-card-title">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Server size={13} /> Server{s.servers.length > 1 ? "s" : ""}</span>
                {s.servers.length > 0 && (
                  <button type="button" onClick={copyServer} className="cg-btn icon" style={{ height: 26, width: 26 }} aria-label="Copy server URL">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                )}
              </div>
              {s.servers.length ? s.servers.map((u) => <div key={u} className="cg-server">{u}</div>) : <div className="cg-desc">No server declared — paths are relative.</div>}
            </div>
            <div className="cg-card">
              <div className="cg-card-title">Depends on <span className="count">({dependsOn.length})</span></div>
              {dependsOn.length ? dependsOn.map((id) => {
                const t = nameOf(id);
                const kinds = [...new Set(outgoing.filter((e) => e.to === id).map((e) => e.kind))].join(", ");
                return <div key={id} className="cg-row"><Dot color={t?.color} />{t?.name}<span className="why">{kinds}</span></div>;
              }) : <div className="cg-desc">Calls or references nothing else on the map.</div>}
            </div>
            <div className="cg-card">
              <div className="cg-card-title">Used by <span className="count">({usedBy.length})</span></div>
              {usedBy.length ? usedBy.map((id) => {
                const t = nameOf(id);
                const kinds = [...new Set(incoming.filter((e) => e.from === id).map((e) => e.kind))].join(", ");
                return <div key={id} className="cg-row"><Dot color={t?.color} />{t?.name}<span className="why">{kinds}</span></div>;
              }) : <div className="cg-desc">No incoming calls or references.</div>}
              {impacted.length > usedBy.length && (
                <div className="cg-desc" style={{ marginTop: 6 }}>Indirectly, {plural(impacted.length, "service")} would feel a change here.</div>
              )}
            </div>
            <div className="cg-metrics">
              <button type="button" className="cg-metric" onClick={() => setTab("Operations")}>
                <span><Settings2 size={12} /> Operations</span>
                <strong>{s.operations.length}</strong>
                <em>View all →</em>
              </button>
              <button type="button" className="cg-metric" onClick={() => setTab("Entities")}>
                <span><Boxes size={12} /> Entities</span>
                <strong>{s.entities.length}</strong>
                <em>View all →</em>
              </button>
            </div>
            <button type="button" className="cg-action primary" onClick={() => onOpenInExplorer?.(s.id)}>
              <Play size={14} /> Open in API Explorer
            </button>
            {onReplace && (
              <div style={{ display: "grid", gridTemplateColumns: s.sourceUrl && onRefetch ? "1fr 1fr" : "1fr", gap: 8 }}>
                <button type="button" className="cg-action" style={{ marginTop: 12, color: "var(--cg-soft)", background: "var(--cg-panel-2)", border: "1px solid var(--cg-border)" }} onClick={() => onReplace(s.id)}>
                  <RefreshCw size={14} /> Replace spec…
                </button>
                {s.sourceUrl && onRefetch && (
                  <button type="button" className="cg-action" style={{ marginTop: 12, color: "var(--cg-soft)", background: "var(--cg-panel-2)", border: "1px solid var(--cg-border)" }} onClick={() => onRefetch(s.id)} title={s.sourceUrl}>
                    <Globe size={14} /> Re-fetch URL
                  </button>
                )}
              </div>
            )}
            {onDelete && (
              <button type="button" className="cg-action danger" onClick={() => onDelete(s.id)}>
                <Trash2 size={14} /> Remove from map
              </button>
            )}
          </>
        )}

        {tab === "Operations" && (
          <div className="cg-card">
            <div className="cg-card-title">Operations <span className="count">({s.operations.length})</span></div>
            {s.operations.map((op) => (
              <div key={op.id} className="cg-row" style={{ alignItems: "flex-start" }}>
                <Method m={op.method} />
                <span className="cg-server" style={{ flex: 1 }} title={op.path}>{relativePath(op.path, s.servers)}</span>
                {!op.auth.length && !s.isCollection && <span className="why">no auth</span>}
              </div>
            ))}
            {!s.operations.length && <div className="cg-desc">No operations.</div>}
          </div>
        )}

        {tab === "Entities" && (
          <>
            {s.entities.map((e) => (
              <div key={e.name} className="cg-card">
                <div className="cg-card-title">
                  <span className="cg-server" style={{ fontSize: 12.5 }}>{e.name}</span>
                  <span className="count">{plural(e.fields.length, "field")}{e.inferred ? " · inferred from examples" : ""}</span>
                </div>
                {e.fields.map((f) => (
                  <div key={f.name} className="cg-row">
                    <span className="cg-server">{f.name}</span>
                    <span className="why">{f.type}{f.format ? ` (${f.format})` : ""}{f.required ? " · required" : ""}</span>
                  </div>
                ))}
              </div>
            ))}
            {!s.entities.length && <div className="cg-card"><div className="cg-desc">{s.isCollection ? "A collection describes calls, not entities." : "No schemas declared and nothing could be inferred from responses."}</div></div>}
          </>
        )}

        {tab === "Relationships" && (
          <>
            <div className="cg-card">
              <div className="cg-card-title">Outgoing <span className="count">({outgoing.length})</span></div>
              {outgoing.length ? outgoing.map((e) => (
                <div key={`${e.to}-${e.kind}`} style={{ marginBottom: 8 }}>
                  <div className="cg-row"><Dot color={nameOf(e.to)?.color} />{e.kind} → {nameOf(e.to)?.name}<span className="why">{Math.round(e.confidence * 100)}%</span></div>
                  <ul className="cg-desc" style={{ paddingLeft: 18, fontSize: 11.5 }}>
                    {e.evidence.slice(0, 3).map((t) => <li key={t}>{t}</li>)}
                    {e.evidence.length > 3 && <li>… {e.evidence.length - 3} more</li>}
                  </ul>
                </div>
              )) : <div className="cg-desc">None.</div>}
            </div>
            <div className="cg-card">
              <div className="cg-card-title">Incoming <span className="count">({incoming.length})</span></div>
              {incoming.length ? incoming.map((e) => (
                <div key={`${e.from}-${e.kind}`} style={{ marginBottom: 8 }}>
                  <div className="cg-row"><Dot color={nameOf(e.from)?.color} />{nameOf(e.from)?.name} {e.kind} this<span className="why">{Math.round(e.confidence * 100)}%</span></div>
                  <ul className="cg-desc" style={{ paddingLeft: 18, fontSize: 11.5 }}>
                    {e.evidence.slice(0, 2).map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              )) : <div className="cg-desc">None.</div>}
            </div>
            {shares.length > 0 && (
              <div className="cg-card">
                <div className="cg-card-title">Shared entities <span className="count">({shares.length})</span></div>
                {shares.map((e) => {
                  const other = nameOf(e.from === s.id ? e.to : e.from);
                  return <div key={`${e.from}-${e.to}`} className="cg-row"><Dot color={other?.color} />{other?.name}<span className="why">{e.evidence[0]}</span></div>;
                })}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

/**
 * The panel for one relationship: what kind it is, how sure the engine is,
 * and every piece of evidence it was built from.
 */
export const EdgeDetails = ({ graph, edge, onClose, onSelectService }) => {
  if (!edge) return null;
  const from = graph.services.find((s) => s.id === edge.from);
  const to = graph.services.find((s) => s.id === edge.to);
  const verb = edge.kind === "calls" ? "calls" : edge.kind === "references" ? "references an entity owned by" : "shares an entity with";
  const explain = {
    calls: "A request in the first service matches an operation the second declares — on its server, or by path shape when the host is a variable.",
    references: "A field named like <entity>Id, <entity>Ref or <entity>Key in the first service points at a resource the second service owns.",
    shares: "Both services expose an entity of the same name. The Entities tab shows whether their shapes agree.",
  }[edge.kind];
  return (
    <aside className="cg-details" aria-label="Relationship details">
      <div className="cg-details-head" style={{ paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cg-details-title">
              <h2 style={{ fontSize: 15, whiteSpace: "normal" }}>
                <span style={{ color: from?.color }}>{from?.name}</span> <span style={{ color: "var(--cg-muted)", fontWeight: 400 }}>{verb}</span> <span style={{ color: to?.color }}>{to?.name}</span>
              </h2>
            </div>
            <div className="cg-details-sub">{edge.kind} · confidence {Math.round(edge.confidence * 100)}% · {plural(edge.evidence.length, "piece of evidence", "pieces of evidence")}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="cg-btn icon" style={{ height: 30, width: 30, marginTop: -2 }}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="cg-details-body" style={{ paddingTop: 0 }}>
        <div className="cg-card">
          <div className="cg-card-title">How this was found</div>
          <div className="cg-desc">{explain}</div>
        </div>
        <div className="cg-card">
          <div className="cg-card-title">Evidence <span className="count">({edge.evidence.length})</span></div>
          <ul className="cg-desc" style={{ paddingLeft: 18, margin: 0 }}>
            {edge.evidence.map((t) => <li key={t} style={{ marginBottom: 6 }}>{t}</li>)}
          </ul>
        </div>
        <div className="cg-metrics">
          <button type="button" className="cg-metric" onClick={() => onSelectService?.(edge.from)}>
            <span><Dot color={from?.color} /> From</span>
            <strong style={{ fontSize: 14 }}>{from?.name}</strong>
            <em>Open service →</em>
          </button>
          <button type="button" className="cg-metric" onClick={() => onSelectService?.(edge.to)}>
            <span><Dot color={to?.color} /> To</span>
            <strong style={{ fontSize: 14 }}>{to?.name}</strong>
            <em>Open service →</em>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default ServiceDetails;
