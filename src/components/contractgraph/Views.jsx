import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Info, ShieldAlert, Copy, Check } from "lucide-react";
import { methodColor } from "../../utils/constants";

const serviceOf = (graph, id) => graph.services.find((s) => s.id === id);

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The path without the server it was declared on, for compact display. */
const relativePath = (path, servers = []) => {
  const server = servers.find((u) => u && path.startsWith(u));
  return server ? path.slice(server.length) || "/" : path;
};

export const ServiceDot = ({ graph, id, withName = true }) => {
  const s = serviceOf(graph, id);
  if (!s) return <span className="text-vz-dim">{id}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-vz-soft">
      <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: s.color }} />
      {withName && s.name}
    </span>
  );
};

const Method = ({ m }) => {
  const c = methodColor(m);
  return <span className={`vz-mono rounded px-1.5 py-0.5 text-[10.5px] font-bold ${c.text} ${c.bg || "bg-white/6"}`}>{m}</span>;
};

const Empty = ({ children }) => <p className="px-1 py-6 text-center text-[13px] text-vz-dim">{children}</p>;

const Row = ({ title, meta, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-vz-line bg-vz-panel">
      <button type="button" onClick={() => setOpen((v) => !v)} className="vz-t flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-white/[0.03]">
        {open ? <ChevronDown size={14} className="mt-0.5 flex-shrink-0 text-vz-dim" /> : <ChevronRight size={14} className="mt-0.5 flex-shrink-0 text-vz-dim" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-vz-text">{title}</div>
          {meta && <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-vz-dim">{meta}</div>}
        </div>
      </button>
      {open && <div className="border-t border-vz-line-soft px-4 py-3">{children}</div>}
    </div>
  );
};

// ─── Entities ────────────────────────────────

export const EntitiesView = ({ graph }) => {
  if (!graph.entities.length) return <Empty>No entity is exposed by more than one service{graph.services.length < 2 ? " — add a second service to compare." : "."}</Empty>;
  return (
    <div className="space-y-2">
      {graph.entities.map((entity) => {
        const fieldNames = [...new Set(entity.occurrences.flatMap((o) => o.fields.map((f) => f.name)))];
        return (
          <Row
            key={entity.key}
            defaultOpen={!entity.consistent}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {entity.name}
                {entity.consistent ? (
                  <span className="rounded bg-vz-green/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-vz-green">consistent</span>
                ) : (
                  <span className="rounded bg-vz-warn/14 px-1.5 py-0.5 text-[10.5px] font-semibold text-vz-warn">{entity.shapes} shapes</span>
                )}
                {entity.inferred && <span className="rounded bg-white/6 px-1.5 py-0.5 text-[10.5px] text-vz-dim">partly inferred from examples</span>}
              </span>
            }
            meta={entity.services.map((id) => <ServiceDot key={id} graph={graph} id={id} />)}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-vz-dim">
                    <th className="py-1.5 pr-3 font-semibold">Field</th>
                    {entity.occurrences.map((o, i) => (
                      <th key={i} className="py-1.5 pr-3 font-semibold">
                        <ServiceDot graph={graph} id={o.serviceId} /> <span className="vz-mono normal-case text-vz-dim">{o.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fieldNames.map((name) => {
                    const cells = entity.occurrences.map((o) => o.fields.find((f) => f.name === name));
                    const types = new Set(cells.filter(Boolean).map((f) => f.type));
                    const missing = cells.some((c) => !c);
                    return (
                      <tr key={name} className="border-t border-vz-line-soft">
                        <td className={`vz-mono py-1.5 pr-3 ${missing ? "text-vz-warn" : "text-vz-text"}`}>{name}</td>
                        {cells.map((f, i) => (
                          <td key={i} className={`vz-mono py-1.5 pr-3 ${!f ? "text-vz-dim" : types.size > 1 ? "text-[#fda4af]" : "text-vz-soft"}`}>
                            {f ? `${f.type}${f.format ? ` (${f.format})` : ""}${f.required ? " *" : ""}` : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-vz-dim">— not present · red: types differ · * required</p>
          </Row>
        );
      })}
    </div>
  );
};

// ─── Duplicates ──────────────────────────────

export const DuplicatesView = ({ graph }) => {
  if (!graph.duplicateEndpoints.length) return <Empty>No endpoint is duplicated across services.</Empty>;
  return (
    <div className="space-y-2">
      {graph.duplicateEndpoints.map((d, i) => (
        <Row
          key={i}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <Method m={d.method} />
              <span className="vz-mono">{d.shape}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${d.kind === "duplicate" ? "bg-vz-red/14 text-[#fda4af]" : "bg-vz-warn/14 text-vz-warn"}`}>
                {d.kind} · {Math.round(d.score * 100)}%
              </span>
            </span>
          }
          meta={d.operations.map((o) => (
            <span key={o.id}>
              <ServiceDot graph={graph} id={o.serviceId} /> <span className="vz-mono">{o.path}</span>
            </span>
          ))}
        >
          <ul className="list-disc space-y-1 pl-5 text-[12px] text-vz-soft">
            {d.evidence.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </Row>
      ))}
    </div>
  );
};

// ─── Concepts ────────────────────────────────

export const ConceptsView = ({ graph }) => {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? graph.concepts : graph.concepts.filter((c) => c.divergentNames || c.divergentTypes);
  if (!graph.concepts.length) return <Empty>No field appears in more than one service.</Empty>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-1 text-[12px] text-vz-dim">
        <span>{graph.concepts.filter((c) => c.divergentNames).length} concepts with more than one name</span>
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[#a855f7]" />
          show consistent ones too
        </label>
      </div>
      {list.length === 0 && <Empty>Every shared concept is spelled the same way everywhere.</Empty>}
      {list.map((c) => (
        <Row
          key={c.key}
          defaultOpen={c.divergentTypes}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="vz-mono">{c.canonical}</span>
              {c.names.filter((n) => n !== c.canonical).map((n) => (
                <span key={n} className="vz-mono rounded bg-vz-warn/12 px-1.5 py-0.5 text-[11px] text-vz-warn">{n}</span>
              ))}
              {c.divergentTypes && <span className="rounded bg-vz-red/14 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#fda4af]">types differ: {c.types.join(", ")}</span>}
            </span>
          }
          meta={[
            <span key="rule">{c.rule} · confidence {Math.round(c.confidence * 100)}%</span>,
            ...c.services.map((id) => <ServiceDot key={id} graph={graph} id={id} />),
          ]}
        >
          <table className="w-full text-[12px]">
            <tbody>
              {c.members.map((m, i) => (
                <tr key={i} className="border-t border-vz-line-soft first:border-t-0">
                  <td className="py-1.5 pr-3"><ServiceDot graph={graph} id={m.serviceId} /></td>
                  <td className="vz-mono py-1.5 pr-3 text-vz-text">{m.name}</td>
                  <td className="vz-mono py-1.5 pr-3 text-vz-dim">{m.type}</td>
                  <td className="py-1.5 pr-3 text-vz-soft">{m.on}</td>
                  <td className="py-1.5 text-vz-dim">{m.rule}{m.example !== undefined ? ` · e.g. ${String(m.example)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Row>
      ))}
    </div>
  );
};

// ─── Findings ────────────────────────────────

const SEVERITY = {
  high: { icon: ShieldAlert, cls: "text-[#fda4af] bg-vz-red/12", label: "High" },
  medium: { icon: AlertTriangle, cls: "text-vz-warn bg-vz-warn/12", label: "Medium" },
  info: { icon: Info, cls: "text-vz-blue bg-vz-blue/12", label: "Info" },
};

export const FindingsView = ({ graph }) => {
  const [filter, setFilter] = useState("all");
  const categories = ["all", ...new Set(graph.findings.map((f) => f.category))];
  const list = graph.findings.filter((f) => filter === "all" || f.category === filter);
  if (!graph.findings.length) return <Empty>Nothing to report{graph.services.length < 2 ? " yet — add a second service." : "."}</Empty>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 px-1">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setFilter(c)} className={`vz-t rounded-md border px-2 py-1 text-[11.5px] capitalize ${filter === c ? "border-vz-accent/40 bg-vz-accent/12 text-[#e6c4ff]" : "border-vz-line bg-vz-panel-2 text-vz-soft hover:text-vz-text"}`}>
            {c}
          </button>
        ))}
      </div>
      {list.map((f) => {
        const sev = SEVERITY[f.severity] || SEVERITY.info;
        const Icon = sev.icon;
        return (
          <div key={f.id} className="flex gap-3 rounded-xl border border-vz-line bg-vz-panel px-4 py-3">
            <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${sev.cls}`}><Icon size={14} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-vz-text">{f.title}</div>
              {f.detail && <div className="mt-0.5 text-[12px] leading-relaxed text-vz-soft">{f.detail}</div>}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
                <span className="capitalize text-vz-dim">{f.category}</span>
                {f.services.map((id) => <ServiceDot key={id} graph={graph} id={id} />)}
                {f.inferred && <span className="text-vz-dim">partly inferred</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Inspector ───────────────────────────────

export const ServiceInspector = ({ graph, serviceId, impacted, onClose }) => {
  const s = serviceOf(graph, serviceId);
  const [copied, setCopied] = useState(false);
  if (!s) return null;
  const outgoing = graph.edges.filter((e) => e.from === s.id);
  const incoming = graph.edges.filter((e) => e.to === s.id);
  const copyServers = () => {
    navigator.clipboard?.writeText(s.servers.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-vz-line-soft px-4 py-3">
        <span className="mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: s.color }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-vz-text">{s.name}</div>
          <div className="text-[11.5px] text-vz-dim">{s.formatLabel}{s.isCollection ? " · consumer" : ""} · {plural(s.operations.length, "operation")} · {plural(s.entities.length, "entity", "entities")}</div>
        </div>
        <button type="button" onClick={onClose} className="vz-t rounded-md p-1 text-vz-dim hover:text-vz-text" aria-label="Close inspector">×</button>
      </div>
      <div className="vz-scroll min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3 text-[12px]">
        {s.servers.length > 0 && (
          <section>
            <h4 className="mb-1 flex items-center text-[10.5px] font-semibold uppercase tracking-wider text-vz-dim">
              Servers
              <button type="button" onClick={copyServers} className="vz-t ml-auto flex items-center gap-1 text-vz-dim hover:text-vz-text">{copied ? <Check size={11} /> : <Copy size={11} />}</button>
            </h4>
            {s.servers.map((u) => <div key={u} className="vz-mono break-all text-vz-soft">{u}</div>)}
          </section>
        )}
        {impacted.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-vz-warn">If this changes, {impacted.length} depend on it</h4>
            <div className="flex flex-wrap gap-2">{impacted.map((id) => <ServiceDot key={id} graph={graph} id={id} />)}</div>
          </section>
        )}
        {(outgoing.length > 0 || incoming.length > 0) && (
          <section>
            <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-vz-dim">Relationships</h4>
            <ul className="space-y-1.5">
              {outgoing.map((e) => (
                <li key={`o-${e.to}-${e.kind}`} className="text-vz-soft">
                  <span className="text-vz-dim">{e.kind}</span> <ServiceDot graph={graph} id={e.to} />
                  <ul className="ml-3 mt-0.5 list-disc pl-3 text-[11px] text-vz-dim">{e.evidence.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
                </li>
              ))}
              {incoming.map((e) => (
                <li key={`i-${e.from}-${e.kind}`} className="text-vz-soft">
                  <ServiceDot graph={graph} id={e.from} /> <span className="text-vz-dim">{e.kind} this</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-vz-dim">Operations</h4>
          <ul className="space-y-1">
            {s.operations.map((op) => (
              <li key={op.id} className="flex items-center gap-2">
                <Method m={op.method} />
                <span className="vz-mono min-w-0 truncate text-vz-soft" title={op.path}>{relativePath(op.path, s.servers)}</span>
                {!op.auth.length && !s.isCollection && <span className="ml-auto flex-shrink-0 text-[10px] text-vz-dim">no auth</span>}
              </li>
            ))}
          </ul>
        </section>
        {s.entities.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-vz-dim">Entities</h4>
            <ul className="space-y-1">
              {s.entities.map((e) => (
                <li key={e.name} className="text-vz-soft">
                  <span className="vz-mono text-vz-text">{e.name}</span> <span className="text-vz-dim">{e.fields.length} fields{e.inferred ? " · inferred" : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

// ─── Map alternatives: list and table ─────────

/** Every service as a row: what it is, what it depends on, what uses it. */
export const ServicesListView = ({ graph, selectedId, onSelect }) => (
  <div className="cg-scroll">
    <table className="cg-table">
      <thead>
        <tr><th>Service</th><th>Format</th><th>Operations</th><th>Entities</th><th>Depends on</th><th>Used by</th></tr>
      </thead>
      <tbody>
        {graph.services.map((s) => {
          const out = [...new Set(graph.edges.filter((e) => e.from === s.id && e.kind !== "shares").map((e) => e.to))];
          const inn = [...new Set(graph.edges.filter((e) => e.to === s.id && e.kind !== "shares").map((e) => e.from))];
          const name = (id) => graph.services.find((x) => x.id === id)?.name || id;
          return (
            <tr key={s.id} onClick={() => onSelect?.(s.id)} style={{ cursor: "pointer", background: selectedId === s.id ? "rgba(168,85,247,0.12)" : undefined }}>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#f6f7fb", fontWeight: 600 }}><span className="cg-dot" style={{ background: s.color }} />{s.name}</span></td>
              <td>{s.isCollection ? "Consumer collection" : s.formatLabel}</td>
              <td>{s.operations.length}</td>
              <td>{s.entities.length}</td>
              <td>{out.length ? out.map(name).join(", ") : "—"}</td>
              <td>{inn.length ? inn.map(name).join(", ") : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/** Every operation across the estate, with the service it belongs to. */
export const OperationsTableView = ({ graph, onSelect, filter = "" }) => {
  const q = filter.trim().toLowerCase();
  const rows = graph.services.flatMap((s) =>
    s.operations
      .filter((op) => !q || `${s.name} ${op.method} ${op.path} ${op.name}`.toLowerCase().includes(q))
      .map((op) => ({ s, op })));
  return (
    <div className="cg-scroll">
      <table className="cg-table">
        <thead>
          <tr><th>Service</th><th>Method</th><th>Path</th><th>Summary</th><th>Returns</th><th>Auth</th></tr>
        </thead>
        <tbody>
          {rows.map(({ s, op }) => (
            <tr key={op.id} onClick={() => onSelect?.(s.id)} style={{ cursor: "pointer" }}>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="cg-dot" style={{ width: 8, height: 8, background: s.color }} />{s.name}</span></td>
              <td><Method m={op.method} /></td>
              <td className="mono">{s.servers[0] && op.path.startsWith(s.servers[0]) ? op.path.slice(s.servers[0].length) || "/" : op.path}</td>
              <td>{op.name !== `${op.method} ${op.path}` ? op.name : ""}</td>
              <td className="mono">{op.responseRef || (op.responseFields.length ? `${op.responseFields.length} fields` : "")}</td>
              <td>{s.isCollection ? "" : op.auth.length ? op.auth.join(", ") : <span style={{ color: "#fbbf24" }}>none</span>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24 }}>No operations match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};
