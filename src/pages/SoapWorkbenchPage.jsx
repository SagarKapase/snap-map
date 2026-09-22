import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FileCode2, Ruler, Braces, Boxes, FlaskConical, AlertTriangle, X, Pencil, Paperclip, ArrowRightLeft, Globe } from "lucide-react";
import AppShell from "../components/shell/AppShell";
import { useAuth } from "../components/auth/useAuth";
import ProgrammeSidebar, { AddPanel } from "../components/soap/ProgrammeSidebar";
import ContractView from "../components/soap/ContractView";
import DesignView from "../components/soap/DesignView";
import OpenApiView from "../components/soap/OpenApiView";
import AdapterView from "../components/soap/AdapterView";
import ParityView from "../components/soap/ParityView";
import CoverageView from "../components/soap/CoverageView";
import { pluralize } from "../components/soap/helpers";
import { parseWsdl } from "../utils/soap/wsdl";
import { classifyXml } from "../utils/soap";
import { proposeDesign } from "../utils/soap/design";
import { buildOpenApi } from "../utils/soap/openapi";
import { buildBridge } from "../utils/soap/bridge";
import { publishBridge, unpublishBridge } from "../utils/soap/hosting";
import {
  listProgramme, addWsdl, attachDocument, removeAttachment, removeProgrammeService, renameProgrammeService, updateSummary,
  setOverride, setStatus, setOptions, setTraffic, loadDocuments, coverageOf, exportProgramme, importProgramme,
} from "../utils/soap/workbench";
import { SAMPLE_PROGRAMME } from "../utils/soap/samples";
import { listWorkspaces, createWorkspace, getWorkspace, addService as addGraphService } from "../utils/contractWorkspace";
import "../soap.css";

const TABS = [
  { id: "contract", label: "Contract", icon: FileCode2, count: (d) => d.operations.length },
  { id: "design", label: "Design", icon: Ruler, count: (d) => d.stats.review, alert: (d) => d.stats.review > 0 },
  { id: "openapi", label: "OpenAPI", icon: Braces },
  { id: "adapter", label: "Adapter", icon: Boxes },
  { id: "parity", label: "Parity", icon: FlaskConical },
];

const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });

const downloadJson = (name, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const stripExtension = (name) => String(name || "").replace(/\.(wsdl|xml|xsd|json)$/i, "");

/**
 * The SOAP Migration Workbench: a programme of WSDLs, each with a
 * reviewable REST design, the generated OpenAPI, an adapter scaffold and
 * parity tests; and the coverage dashboard across the estate.
 */
const SoapWorkbenchPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id || null;
  const params = new URLSearchParams(location.search);
  const wantedId = params.get("svc");
  const wantSample = params.get("sample") === "bank";

  const [services, setServices] = useState(() => listProgramme(userId));
  const [activeId, setActiveId] = useState(() => (wantedId && listProgramme(userId).some((s) => s.id === wantedId) ? wantedId : listProgramme(userId)[0]?.id || null));
  const [view, setView] = useState(() => (listProgramme(userId).length ? "service" : "coverage"));
  const [tab, setTab] = useState("design");
  const [docs, setDocs] = useState(null);
  const [notices, setNotices] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = useCallback(() => setServices(listProgramme(userId)), [userId]);
  const notify = useCallback((kind, text) => {
    const id = `${Date.now()}${Math.random()}`;
    setNotices((prev) => [...prev.slice(-4), { id, kind, text }]);
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);

  // A different account is a different programme.
  useEffect(() => {
    const list = listProgramme(userId);
    setServices(list);
    setActiveId(list[0]?.id || null);
    setView(list.length ? "service" : "coverage");
  }, [userId]);

  const active = services.find((s) => s.id === activeId) || null;

  // The documents of the selected service come from IndexedDB.
  useEffect(() => {
    let stale = false;
    setDocs(null);
    if (!activeId) return undefined;
    loadDocuments(activeId).then((loaded) => {
      if (!stale) setDocs({ id: activeId, ...loaded });
    });
    return () => {
      stale = true;
    };
  }, [activeId]);

  const parsed = useMemo(() => {
    if (!docs || docs.id !== activeId || !active) return null;
    try {
      return { service: parseWsdl(docs.wsdl, { name: active.name, documents: docs.attachments }), error: "" };
    } catch (e) {
      return { service: null, error: e.message };
    }
  }, [docs, activeId, active]);

  // Keep the list's counts in step with what the parser found (an attached XSD can clear warnings).
  useEffect(() => {
    if (!parsed?.service || !active) return;
    const summary = { operations: parsed.service.operations.map((o) => o.name), warnings: parsed.service.warnings.length, version: parsed.service.version };
    if (summary.operations.length !== (active.operations || []).length || summary.warnings !== active.warnings || summary.version !== active.wsdlVersion) {
      updateSummary(userId, active.id, summary);
      refresh();
    }
  }, [parsed, active, userId, refresh]);

  const design = useMemo(() => {
    if (!parsed?.service || !active) return null;
    return proposeDesign(parsed.service, { ...(active.options || {}), overrides: active.overrides || {}, statuses: active.statuses || {} });
  }, [parsed, active]);
  // Hosting: the bridge for the open service is published to the app's own
  // server as soon as the design exists, and again whenever it changes, so
  // the REST routes answer without anything being downloaded or run.
  const bridge = useMemo(() => (design && parsed?.service ? buildBridge(design, parsed.service) : null), [design, parsed]);
  const bridgeKey = useMemo(() => (bridge ? JSON.stringify({ ...bridge, generatedAt: "" }) : ""), [bridge]);
  const [hosted, setHosted] = useState(null); // { id, baseUrl, routes, error, forId }
  useEffect(() => {
    if (!bridge || !active) return undefined;
    let stale = false;
    const serviceId = active.id;
    const timer = setTimeout(() => {
      publishBridge(serviceId, bridge)
        .then((result) => !stale && setHosted({ ...result, error: "", forId: serviceId }))
        .catch((e) => !stale && setHosted({ id: "", baseUrl: "", routes: [], error: e.message, forId: serviceId }));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // bridgeKey stands for the bridge's content; the id keeps a switch of service from reusing a stale result.
  }, [bridgeKey, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hostedUrl = hosted && hosted.forId === active?.id && !hosted.error ? hosted.baseUrl : "";
  const hostingError = hosted && hosted.forId === active?.id ? hosted.error : "";
  const spec = useMemo(() => (design && parsed?.service ? buildOpenApi(design, parsed.service, hostedUrl ? { serverUrl: hostedUrl, serverDescription: "Hosted by the workbench — answers now, forwarding to the SOAP service." } : {}) : null), [design, parsed, hostedUrl]);
  const coverage = useMemo(() => coverageOf(services), [services]);
  // Contract Graph workspaces, re-read after a service is added to one.
  const [workspaces, setWorkspaces] = useState(() => listWorkspaces(userId));
  useEffect(() => setWorkspaces(listWorkspaces(userId)), [userId]);

  // ─── Adding ────────────────────────────────

  const addServiceFromText = useCallback(async (name, wsdl, attachments = {}, sourceUrl = "") => {
    let summary;
    let serviceName = name;
    try {
      const service = parseWsdl(wsdl, { name, documents: attachments });
      summary = { operations: service.operations.map((o) => o.name), warnings: service.warnings.length, version: service.version };
      serviceName = service.name || name;
    } catch (e) {
      notify("error", `${name || "That document"}: ${e.message}`);
      return null;
    }
    try {
      const record = await addWsdl(userId, { name: serviceName, wsdl, attachments, sourceUrl, summary });
      refresh();
      setActiveId(record.id);
      setView("service");
      setTab("design");
      notify("ok", `${record.name}: ${pluralize(summary.operations.length, "operation")} read${summary.warnings ? `, ${pluralize(summary.warnings, "warning")}` : ""}.`);
      return record;
    } catch (e) {
      notify("error", e.message);
      return null;
    }
  }, [userId, refresh, notify]);

  const addFiles = useCallback(async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const wsdls = [];
    const xsds = [];
    for (const file of files) {
      const text = await readFileText(file).catch((e) => {
        notify("error", e.message);
        return null;
      });
      if (text === null) continue;
      const trimmed = text.trimStart();
      if (trimmed.startsWith("{")) {
        try {
          const data = JSON.parse(text);
          if (data?.vizroute === "soap-migration-programme") {
            const { added, failures } = await importProgramme(userId, data);
            failures.forEach((f) => notify("error", f));
            refresh();
            if (added.length) {
              setActiveId(added[0].id);
              setView("service");
              notify("ok", `Imported ${pluralize(added.length, "service")} into the programme.`);
            }
            continue;
          }
        } catch {
          /* falls through to the message below */
        }
        notify("error", `${file.name}: JSON is not a WSDL. OpenAPI and Postman files belong in the API Map.`);
        continue;
      }
      const kind = classifyXml(text);
      if (kind === "wsdl") wsdls.push({ name: stripExtension(file.name), text });
      else if (kind === "xsd") xsds.push({ name: file.name, text });
      else {
        try {
          parseWsdl(text, { name: file.name });
        } catch (e) {
          notify("error", `${file.name}: ${e.message}`);
        }
      }
    }
    if (wsdls.length) {
      const attachments = Object.fromEntries(xsds.map((x) => [x.name, x.text]));
      for (const w of wsdls) await addServiceFromText(w.name, w.text, attachments);
      return;
    }
    if (xsds.length) {
      if (!active || view !== "service") {
        notify("error", `${pluralize(xsds.length, "schema")} dropped without a WSDL. Drop them together with the WSDL that imports them, or select a service first.`);
        return;
      }
      try {
        for (const x of xsds) await attachDocument(userId, active.id, x.name, x.text);
        const loaded = await loadDocuments(active.id);
        setDocs({ id: active.id, ...loaded });
        refresh();
        notify("ok", `Attached ${xsds.map((x) => x.name).join(", ")} to ${active.name}.`);
      } catch (e) {
        notify("error", e.message);
      }
    }
  }, [userId, active, view, refresh, notify, addServiceFromText]);

  const addPasted = useCallback((text) => addServiceFromText("Pasted WSDL", text), [addServiceFromText]);

  const addFromUrl = useCallback(async (raw) => {
    const url = String(raw || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      notify("error", "Enter a full http(s) URL, usually ending in ?wsdl.");
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const text = await res.text();
      const name = stripExtension(url.split("?")[0].split("/").pop()) || "Service";
      await addServiceFromText(name, text, {}, url);
    } catch (e) {
      notify("error", /Failed to fetch|NetworkError/.test(e.message) ? "The browser could not fetch that URL (blocked by CORS, or offline). Save the WSDL and drop the file instead." : e.message);
    } finally {
      setFetching(false);
    }
  }, [addServiceFromText, notify]);

  const loadSample = useCallback(async () => {
    const existing = new Set(listProgramme(userId).map((s) => s.name));
    let first = null;
    for (const s of SAMPLE_PROGRAMME.services) {
      if (existing.has(s.name)) continue;
      try {
        const service = parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
        const record = await addWsdl(userId, { name: s.name, wsdl: s.wsdl, attachments: s.attachments, summary: { operations: service.operations.map((o) => o.name), warnings: service.warnings.length, version: service.version }, traffic: s.traffic });
        first = first || record;
      } catch (e) {
        notify("error", `${s.name}: ${e.message}`);
      }
    }
    refresh();
    if (first) {
      setActiveId(first.id);
      setView("service");
      setTab("design");
      notify("ok", `Loaded the ${SAMPLE_PROGRAMME.name}: three WSDLs with traffic figures.`);
    } else notify("ok", "The sample services are already in the programme.");
  }, [userId, refresh, notify]);

  // ?sample=bank from Home loads the sample once.
  useEffect(() => {
    if (!wantSample) return;
    navigate("/soap", { replace: true });
    loadSample();
  }, [wantSample, navigate, loadSample]);

  // ─── Editing ───────────────────────────────

  const updateOverride = (opId, patch) => {
    if (!active) return;
    const next = { ...(active.overrides?.[opId] || {}) };
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined) delete next[k];
      else next[k] = v;
    });
    setOverride(userId, active.id, opId, next);
    refresh();
  };
  const resetOverride = (opId) => {
    if (!active) return;
    setOverride(userId, active.id, opId, {});
    refresh();
  };
  const changeStatus = (opId, status) => {
    if (!active) return;
    setStatus(userId, active.id, opId, status);
    refresh();
  };
  const changeOptions = (patch) => {
    if (!active) return;
    setOptions(userId, active.id, { ...(active.options || {}), ...patch });
    refresh();
  };
  const saveTraffic = (serviceId, traffic) => {
    setTraffic(userId, serviceId, traffic);
    refresh();
    notify("ok", "Traffic saved; the queue is re-ranked.");
  };
  const rename = () => {
    if (!active) return;
    const name = window.prompt("Service name", active.name);
    if (name === null) return;
    renameProgrammeService(userId, active.id, name);
    refresh();
  };
  const remove = async (id) => {
    const target = services.find((s) => s.id === id);
    if (!target || !window.confirm(`Remove ${target.name} from the programme? Its design decisions go with it.`)) return;
    await removeProgrammeService(userId, id);
    unpublishBridge(id);
    const list = listProgramme(userId);
    setServices(list);
    if (activeId === id) {
      setActiveId(list[0]?.id || null);
      if (!list.length) setView("coverage");
    }
  };
  const detach = async (fileName) => {
    if (!active) return;
    await removeAttachment(userId, active.id, fileName);
    const loaded = await loadDocuments(active.id);
    setDocs({ id: active.id, ...loaded });
    refresh();
  };

  const exportAll = async () => {
    const file = await exportProgramme(userId);
    downloadJson("soap-migration-programme.json", file);
  };
  const importFiles = async (fileList) => addFiles(fileList);

  const openInMap = () => {
    if (!spec || !parsed?.service) return;
    navigate("/workspace", { state: { openSpec: spec, name: parsed.service.name } });
  };
  const addToGraph = async (target) => {
    if (!spec || !parsed?.service) return;
    setAdding(true);
    try {
      const ws = target === "new" || !getWorkspace(userId, target) ? createWorkspace(userId, "SOAP migration") : getWorkspace(userId, target);
      await addGraphService(userId, ws.id, { name: parsed.service.name, spec, format: "OpenAPI 3 (from WSDL)" });
      setWorkspaces(listWorkspaces(userId));
      notify("ok", <span>Added {parsed.service.name} to <Link to={`/graph?ws=${encodeURIComponent(ws.id)}`} style={{ color: "#d8b4fe", fontWeight: 600 }}>{ws.name}</Link> in Contract Graph.</span>);
    } catch (e) {
      notify("error", e.message);
    } finally {
      setAdding(false);
    }
  };

  const selectService = (id) => {
    setActiveId(id);
    setView("service");
  };

  const addProps = { onFiles: addFiles, onPaste: addPasted, onUrl: addFromUrl, onSample: loadSample, fetching };
  const empty = services.length === 0;

  return (
    <AppShell query={query} onQueryChange={setQuery} searchPlaceholder="Search services and operations">
      {empty ? (
        <section className="sw-hero" aria-labelledby="sw-hero-title">
          <div>
            <div className="hm-eyebrow">SOAP MIGRATION WORKBENCH</div>
            <h1 id="sw-hero-title">From WSDL to a REST design, with the parity tests to prove it.</h1>
            <p>Drop a WSDL and see it as a readable service with a proposed REST design next to it — resources, verbs, paths, errors, each with its reasoning. Review it, and the REST API is already live: the workbench hosts every uploaded service and forwards each call to the SOAP endpoint. Take the OpenAPI, the parity tests and the adapter for your own servers whenever you want them. The WSDL itself stays in this browser.</p>
            <div className="sw-hero-steps">
              <div className="sw-step"><b>1 · Read</b><span>WSDL 1.1/2.0 and XSD, imports resolved from the files you attach.</span></div>
              <div className="sw-step"><b>2 · Design</b><span>A resource-oriented proposal per operation; ambiguities listed, not guessed.</span></div>
              <div className="sw-step"><b>3 · Serve</b><span>The REST routes answer at once, hosted here; OpenAPI 3 and Node, .NET or Spring adapters to take away.</span></div>
              <div className="sw-step"><b>4 · Prove</b><span>Parity tests that call both sides, and a coverage dashboard by traffic.</span></div>
            </div>
          </div>
          <div>
            <AddPanel {...addProps} />
          </div>
        </section>
      ) : (
        <div className="sw">
          <ProgrammeSidebar
            services={services}
            coverage={coverage}
            activeId={activeId}
            view={view}
            onSelect={selectService}
            onShowCoverage={() => setView("coverage")}
            onRemove={remove}
            onExport={exportAll}
            onImport={importFiles}
            query={query}
            addProps={addProps}
          />

          <section className="hm-panel sw-main" aria-live="polite">
            {view === "coverage" || !active ? (
              <>
                <div className="sw-head">
                  <div>
                    <h2><ArrowRightLeft size={18} /> Migration coverage</h2>
                    <p>What the programme is funded on: how much of the estate — by operation and by traffic — has moved. Set each operation's status on its Design tab; paste traffic per service to rank the queue.</p>
                  </div>
                </div>
                <div className="sw-body">
                  <CoverageView coverage={coverage} services={services} onSelectService={selectService} onSaveTraffic={saveTraffic} query={query} />
                </div>
              </>
            ) : (
              <>
                <div className="sw-head">
                  <div style={{ minWidth: 0 }}>
                    <h2>
                      {active.name}
                      <button type="button" className="hm-icon-btn" style={{ width: 26, height: 26 }} onClick={rename} title="Rename" aria-label="Rename service"><Pencil size={13} /></button>
                    </h2>
                    {parsed?.service?.documentation && <p>{parsed.service.documentation}</p>}
                    <div className="sw-chips">
                      {parsed?.service && <span className="sw-chip">WSDL {parsed.service.version}</span>}
                      {parsed?.service && <span className="sw-chip">{pluralize(parsed.service.operations.length, "operation")}</span>}
                      {[...new Set((parsed?.service?.endpoints || []).map((e) => `SOAP ${e.soapVersion || "?"} · ${e.style || "document"}`))].map((label) => <span key={label} className="sw-chip">{label}</span>)}
                      {design && (design.stats.review ? <span className="sw-chip is-review"><AlertTriangle size={11} /> {pluralize(design.stats.review, "operation")} to review</span> : <span className="sw-chip is-ok">Nothing flagged</span>)}
                      {hostedUrl && <span className="sw-chip is-ok sw-mono" title="The REST API of this service, served by the workbench"><Globe size={11} /> live at {hostedUrl}</span>}
                      {hostingError && <span className="sw-chip is-warn" title={hostingError}><AlertTriangle size={11} /> not hosted</span>}
                      {(active.attachmentNames || []).map((n) => (
                        <span key={n} className="sw-chip" title="Attached schema">
                          <Paperclip size={11} /> {n}
                          <button type="button" className="hm-icon-btn" style={{ width: 16, height: 16, marginLeft: 2 }} onClick={() => detach(n)} aria-label={`Detach ${n}`}><X size={10} /></button>
                        </span>
                      ))}
                      {active.sourceUrl && <span className="sw-chip sw-mono" title={active.sourceUrl}>{active.sourceUrl}</span>}
                    </div>
                    {parsed?.error && <div className="sw-warnings"><b>This document could not be read:</b> {parsed.error}</div>}
                    {parsed?.service?.warnings.length > 0 && (
                      <div className="sw-warnings">
                        <b>{pluralize(parsed.service.warnings.length, "warning")}</b> — drop the missing schema files onto the programme panel to attach them.
                        <ul>{parsed.service.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
                      </div>
                    )}
                  </div>
                </div>

                {design && (
                  <div className="sw-tabs" role="tablist">
                    {TABS.map((t) => {
                      const Icon = t.icon;
                      const count = t.count ? t.count(design) : null;
                      return (
                        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`sw-tab${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
                          <Icon size={14} /> {t.label}
                          {count ? <span className={`sw-tab-count${t.alert?.(design) ? " is-alert" : ""}`}>{count}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="sw-body">
                  {!docs && <p className="sw-muted">Loading the documents…</p>}
                  {docs && !design && !parsed?.error && <p className="sw-muted">Reading the WSDL…</p>}
                  {design && tab === "contract" && <ContractView service={parsed.service} design={design} query={query} />}
                  {design && tab === "design" && (
                    <DesignView design={design} options={{ propertyCase: active.options?.propertyCase || "camel", basePath: active.options?.basePath ?? "/v1" }} onOption={changeOptions} onOverride={updateOverride} onStatus={changeStatus} onResetOverride={resetOverride} query={query} />
                  )}
                  {design && tab === "openapi" && spec && <OpenApiView spec={spec} serviceName={parsed.service.name} soapEndpoint={parsed.service.endpoints.find((e) => e.address)?.address || ""} hostedUrl={hostedUrl} hostingError={hostingError} workspaces={workspaces} onOpenInMap={openInMap} onAddToGraph={addToGraph} adding={adding} />}
                  {design && tab === "adapter" && <AdapterView design={design} service={parsed.service} spec={spec} hostedUrl={hostedUrl} />}
                  {design && tab === "parity" && <ParityView design={design} service={parsed.service} hostedUrl={hostedUrl} />}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {notices.length > 0 && (
        <div className="sw-notices" aria-live="assertive">
          {notices.map((n) => (
            <div key={n.id} className={`sw-notice is-${n.kind}`} role={n.kind === "error" ? "alert" : "status"}>
              {n.kind === "error" && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: "#fda4af" }} />}
              <span style={{ minWidth: 0 }}>{n.text}</span>
              <button type="button" className="hm-icon-btn" style={{ width: 22, height: 22 }} onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))} aria-label="Dismiss"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};

export default SoapWorkbenchPage;
