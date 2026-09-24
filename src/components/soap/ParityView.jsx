import { useEffect, useMemo, useState } from "react";
import { FolderArchive, Terminal, Send } from "lucide-react";
import { buildEnvelope, buildRestRequest, buildParityPlan, parityFiles, curlFor } from "../../utils/soap/parity";
import { ADAPTER_LOCAL_URL } from "../../utils/soap/openapi";
import { createZip } from "../../utils/soap/zip";
import { CopyButton, Method } from "./common";
import { downloadBytes, safeName } from "./helpers";

/**
 * Parity: for each operation, the SOAP request and its REST twin with
 * the same values, the comparison rules, and the runnable test set.
 */
const ParityView = ({ design, service, hostedUrl = "" }) => {
  const rows = design.operations.filter((r) => r.status !== "skipped");
  const [selected, setSelected] = useState(() => rows[0]?.id || "");
  const [restBase, setRestBase] = useState(hostedUrl || ADAPTER_LOCAL_URL);
  const [restBaseTouched, setRestBaseTouched] = useState(false);
  // Follow the hosted URL until the person types their own.
  useEffect(() => {
    if (!restBaseTouched && hostedUrl) setRestBase(hostedUrl);
  }, [hostedUrl, restBaseTouched]);
  // The REST request sent to the running adapter from here; the adapter allows any origin.
  const [sent, setSent] = useState(null); // { status, type, body, error, ms }
  const [sending, setSending] = useState(false);
  const [soapUrl, setSoapUrl] = useState(() => service.endpoints.find((e) => e.address)?.address || "");
  const row = rows.find((r) => r.id === selected) || rows[0];

  const current = useMemo(() => {
    if (!row) return null;
    const envelope = buildEnvelope(service, design, row);
    const rest = buildRestRequest(design, row, envelope.values, restBase);
    const soapRequest = { method: "POST", url: soapUrl || envelope.url, headers: envelope.headers, body: envelope.xml };
    return { envelope, rest, soapCurl: curlFor(soapRequest), restCurl: curlFor(rest), plan: buildParityPlan(service, design, { restBaseUrl: restBase, soapUrl }).cases.find((c) => c.id === row.soapOperation) };
  }, [row, service, design, restBase, soapUrl]);

  const sendRest = async () => {
    if (!current) return;
    setSending(true);
    const started = Date.now();
    try {
      const res = await fetch(current.rest.url, { method: current.rest.method, headers: current.rest.headers, body: current.rest.body ? JSON.stringify(current.rest.body) : undefined });
      const text = await res.text();
      let body = text;
      try { body = text ? JSON.stringify(JSON.parse(text), null, 2) : ""; } catch { /* not JSON; shown as is */ }
      setSent({ status: res.status, type: res.headers.get("content-type") || "", body, error: "", ms: Date.now() - started });
    } catch (e) {
      setSent({ status: 0, type: "", body: "", error: `${e.message}. Is the adapter running at ${restBase}? Download it from the Adapter tab and start it first.`, ms: Date.now() - started });
    } finally {
      setSending(false);
    }
  };

  const download = () => {
    const plan = buildParityPlan(service, design, { restBaseUrl: restBase, soapUrl });
    downloadBytes(`${safeName(service.name)}-parity.zip`, createZip(parityFiles(plan)), "application/zip");
  };

  if (!rows.length) return <p className="sw-muted">Every operation is skipped, so there is nothing to compare.</p>;

  return (
    <div>
      <div className="sw-toolbar">
        <div className="sw-row">
          <label className="sw-field">
            SOAP endpoint
            <input value={soapUrl} onChange={(e) => setSoapUrl(e.target.value)} placeholder="https://esb/Service.svc" style={{ width: 300 }} className="sw-mono" />
          </label>
          <label className="sw-field" title={hostedUrl ? "The REST API the workbench hosts for this service." : "Where the REST adapter runs. Nothing answers here until you start it from the Adapter tab."}>
            {hostedUrl ? "REST API (hosted)" : "REST adapter URL"}
            <input value={restBase} onChange={(e) => { setRestBase(e.target.value); setRestBaseTouched(true); }} placeholder="http://localhost:8080" style={{ width: 300 }} className="sw-mono" />
          </label>
        </div>
        <button type="button" className="sw-btn is-small is-primary" onClick={download}>
          <FolderArchive size={13} /> Download parity tests ({rows.length} cases)
        </button>
      </div>

      <div className="sw-row" style={{ marginBottom: 12, gap: 4 }} role="tablist" aria-label="Operation">
        {rows.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={row?.id === r.id} className={`sw-btn is-small sw-mono${row?.id === r.id ? " is-active" : ""}`} onClick={() => setSelected(r.id)}>
            {r.soapOperation}
          </button>
        ))}
      </div>

      {current && (
        <>
          <div className="sw-two">
            <div style={{ minWidth: 0 }}>
              <div className="sw-pane-title">
                <span>SOAP {current.envelope.version} request · <span className="sw-mono">{row.soapOperation}</span></span>
                <span className="sw-row" style={{ gap: 6 }}>
                  <CopyButton text={current.envelope.xml} label="Copy XML" />
                  <CopyButton text={current.soapCurl} label="cURL" />
                </span>
              </div>
              <pre className="sw-code is-short">{`POST ${soapUrl || current.envelope.url || "(no endpoint)"}\n${Object.entries(current.envelope.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${current.envelope.xml}`}</pre>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sw-pane-title">
                <span>REST request · <Method m={row.method} /> <span className="sw-mono">{row.path}</span></span>
                <span className="sw-row" style={{ gap: 6 }}>
                  <CopyButton text={current.restCurl} label="cURL" />
                  <button type="button" className="sw-btn is-small is-primary" disabled={sending} onClick={sendRest} title="Send this request to the adapter at the REST adapter URL"><Send size={12} /> {sending ? "Sending…" : "Send"}</button>
                </span>
              </div>
              <pre className="sw-code is-short">{`${current.rest.method} ${current.rest.url}\n${Object.entries(current.rest.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}${current.rest.body ? `\n\n${JSON.stringify(current.rest.body, null, 2)}` : ""}`}</pre>
            </div>
          </div>

          {sent && (
            <div style={{ marginTop: 12 }}>
              <div className="sw-pane-title">
                <span>Adapter answered {sent.status ? <span className="sw-mono">{sent.status}</span> : "nothing"}{sent.type ? <span className="sw-muted"> · {sent.type}</span> : null}<span className="sw-muted"> · {sent.ms} ms</span>{sent.status === row.response.status && <span className="sw-chip is-ok" style={{ marginLeft: 8 }}>expected status</span>}</span>
                <button type="button" className="sw-btn is-small" onClick={() => setSent(null)}>Clear</button>
              </div>
              <pre className="sw-code is-short" style={sent.error ? { color: "#fda4af" } : undefined}>{sent.error || sent.body || "(empty body)"}</pre>
            </div>
          )}

          <div className="sw-detail" style={{ marginTop: 14 }}>
            <div>
              <h4>Comparison</h4>
              <ul>
                <li>Expect REST status <span className="sw-mono">{current.plan.compare.expectStatus}</span>.</li>
                <li>SOAP result at <span className="sw-mono">{current.plan.compare.soapResultPath}</span>; REST result at <span className="sw-mono">{current.plan.compare.restResultPath}</span>.</li>
                <li>Normalised: {current.plan.compare.normalize.join(", ")}.</li>
                <li>Values are samples from the XSD; replace them with recorded traffic in <span className="sw-mono">parity.json</span>.</li>
                <li>{hostedUrl ? "Both sides answer now: the SOAP request against the live service, the REST request through the hosted bridge — press Send to see it." : "The SOAP request works today against the live service; the REST request answers once the adapter from the Adapter tab is running — press Send to try it from here."}</li>
              </ul>
            </div>
            <div>
              <h4>Run</h4>
              <pre className="sw-code is-short" style={{ padding: "8px 10px" }}>{`node parity.test.mjs parity.json \\\n  --soap ${soapUrl || "https://soap-host/Service"} \\\n  --rest ${restBase || "https://rest-host/v1"}`}</pre>
              <p className="sw-muted" style={{ marginTop: 6, fontSize: 11.5, display: "flex", gap: 6 }}><Terminal size={13} /> Runs outside the browser: SOAP endpoints sit on private networks and behind CORS.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ParityView;
