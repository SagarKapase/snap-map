import { useMemo, useState } from "react";
import { Download, FolderArchive, CheckCircle2, AlertTriangle } from "lucide-react";
import { scaffoldAdapter, ADAPTER_TARGETS } from "../../utils/soap/adapters";
import { createZip } from "../../utils/soap/zip";
import { CopyButton } from "./common";
import { downloadBytes, downloadText, safeName } from "./helpers";

const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The adapter scaffold for the chosen target: a file tree, a preview,
 * and the ZIP. Every TODO in the generated code is where the SOAP client
 * gets wired.
 */
const AdapterView = ({ design, service, spec, hostedUrl = "" }) => {
  const [target, setTarget] = useState("node");
  const [selected, setSelected] = useState("");
  const result = useMemo(() => {
    try {
      return { files: scaffoldAdapter(design, service, target, spec), error: "" };
    } catch (e) {
      return { files: [], error: e.message };
    }
  }, [design, service, target, spec]);
  const files = result.files;
  const current = files.find((f) => f.path === selected) || files.find((f) => f.path === "README.md") || files[0];
  const chosen = ADAPTER_TARGETS.find((t) => t.id === target) || ADAPTER_TARGETS[0];
  const routeCount = design.operations.filter((r) => r.status !== "skipped").length;
  const soapUrl = service?.endpoints?.find((e) => e.address)?.address || "";
  const zipName = `${safeName(service.name)}-${target}-adapter.zip`;
  const groups = useMemo(() => {
    const byDir = new Map();
    files.forEach((f) => {
      const dir = dirOf(f.path);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(f);
    });
    return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const download = () => {
    try {
      downloadBytes(zipName, createZip(files), "application/zip");
    } catch {
      /* nothing to zip; the button is disabled in that case */
    }
  };

  return (
    <div>
      <div className="sw-toolbar">
        <div className="sw-row" role="group" aria-label="Adapter target">
          {ADAPTER_TARGETS.map((t) => (
            <button key={t.id} type="button" className={`sw-btn is-small${target === t.id ? " is-active" : ""}`} onClick={() => { setTarget(t.id); setSelected(""); }} title={t.hint} aria-pressed={target === t.id}>
              {t.label}
            </button>
          ))}
          <button type="button" className="sw-btn is-small is-primary" onClick={download} disabled={!files.length}>
            <FolderArchive size={13} /> Download {zipName}
          </button>
        </div>
        <span className="sw-muted" style={{ fontSize: 12 }}>{files.length} files · {routeCount} route{routeCount === 1 ? "" : "s"} served · nothing to wire</span>
      </div>

      <p className="sw-warnings" style={{ marginTop: 0, marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start", borderColor: chosen.unverified ? undefined : "rgba(52, 211, 153, 0.35)", background: chosen.unverified ? undefined : "rgba(52, 211, 153, 0.07)" }}>
        {chosen.unverified ? <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
        <span>
          {hostedUrl && <><b>Already running:</b> the workbench hosts this service's REST API at <span className="sw-mono">{hostedUrl}</span>. The downloads below are the same bridge as a program, for running it on your own servers.<br /></>}
          <b>Works as generated.</b> Download, then <span className="sw-mono">{chosen.run}</span> — every route answers by calling the SOAP operation and translating the reply; faults become <span className="sw-mono">problem+json</span>.
          {" "}{chosen.unverified ? <>This target is {chosen.unverified}.</> : <>This target was {chosen.verified}.</>}
          <span style={{ display: "block", marginTop: 8 }} className="sw-mono">
            your client → <b>REST adapter</b> http://localhost:8080 (this program, on the machine that runs it) → <b>SOAP</b> {soapUrl || "(no address in the WSDL — start it with an explicit SOAP URL)"} (unchanged)
          </span>
          <span style={{ display: "block", marginTop: 6 }}>
            The SOAP host stays where it is and keeps answering SOAP only; it cannot serve these REST routes. To give them a shared URL, deploy this adapter (a server, a container, a cloud app) and put that address in the OpenAPI <span className="sw-mono">servers</span> — <span className="sw-mono">localhost:8080</span> is only its address while it runs on your machine. Point it at another SOAP environment with <span className="sw-mono">{chosen.id === "node" ? "--soap <url>" : chosen.id === "dotnet" ? "--Soap:Url <url>" : "SOAP_URL=<url>"}</span>.
          </span>
        </span>
      </p>

      {result.error && <p className="sw-warnings">{result.error}</p>}

      {files.length > 0 && (
        <div className="sw-split">
          <ul className="sw-files" aria-label="Scaffold files">
            {groups.map(([dir, list]) => (
              <li key={dir || "root"}>
                {dir && <div className="sw-file-dir" title={dir}>{dir.split("/").length > 2 ? `…/${dir.split("/").slice(-2).join("/")}` : dir}</div>}
                {list.map((f) => (
                  <button key={f.path} type="button" className={`sw-file${current?.path === f.path ? " is-active" : ""}`} onClick={() => setSelected(f.path)} title={f.path}>
                    {baseOf(f.path)}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <div style={{ minWidth: 0 }}>
            <div className="sw-pane-title">
              <span className="sw-mono">{current?.path}</span>
              <span className="sw-row" style={{ gap: 6 }}>
                <CopyButton text={current?.content || ""} />
                <button type="button" className="sw-btn is-small" onClick={() => downloadText(baseOf(current.path), current.content)}><Download size={13} /> File</button>
              </span>
            </div>
            <pre className="sw-code" aria-label={`Contents of ${current?.path}`}>{current?.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdapterView;
