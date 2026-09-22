import { useMemo, useState } from "react";
import { Download, Waypoints, Network, ExternalLink, Info, CheckCircle2 } from "lucide-react";
import { openApiToYaml, openApiToJson } from "../../utils/soap/openapi";
import { CopyButton } from "./common";
import { downloadText, safeName } from "./helpers";

/**
 * The generated OpenAPI, as YAML or JSON, with the ways out: download,
 * open in the API Map, add to a Contract Graph workspace.
 */
const OpenApiView = ({ spec, serviceName, soapEndpoint = "", hostedUrl = "", hostingError = "", workspaces = [], onOpenInMap, onAddToGraph, adding = false }) => {
  const [format, setFormat] = useState("yaml");
  const [target, setTarget] = useState(() => workspaces[0]?.id || "new");
  const text = useMemo(() => (format === "yaml" ? openApiToYaml(spec) : openApiToJson(spec)), [spec, format]);
  const fileName = `${safeName(serviceName)}.openapi.${format}`;
  const operations = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  const flagged = Object.values(spec.paths).flatMap((p) => Object.values(p)).filter((op) => op["x-vizroute-review"]).length;
  const firstRoute = (() => {
    const [path, ops] = Object.entries(spec.paths)[0] || [];
    const method = ops ? Object.keys(ops)[0] : "";
    return path ? `${method.toUpperCase()} ${hostedUrl}${path}` : "";
  })();

  return (
    <div>
      <div className="sw-toolbar">
        <div className="sw-row">
          <div className="sw-row" role="group" aria-label="Format" style={{ gap: 0 }}>
            <button type="button" className={`sw-btn is-small${format === "yaml" ? " is-active" : ""}`} style={{ borderRadius: "8px 0 0 8px" }} onClick={() => setFormat("yaml")}>YAML</button>
            <button type="button" className={`sw-btn is-small${format === "json" ? " is-active" : ""}`} style={{ borderRadius: "0 8px 8px 0", marginLeft: -1 }} onClick={() => setFormat("json")}>JSON</button>
          </div>
          <CopyButton text={text} label="Copy" />
          <button type="button" className="sw-btn is-small" onClick={() => downloadText(fileName, text, format === "yaml" ? "application/yaml" : "application/json")}>
            <Download size={13} /> Download {fileName}
          </button>
        </div>
        <span className="sw-muted" style={{ fontSize: 12 }}>
          OpenAPI 3.0.3 · {operations} operation{operations === 1 ? "" : "s"} · {Object.keys(spec.components.schemas).length} schemas{flagged ? ` · ${flagged} flagged for review` : ""}
        </span>
      </div>

      <div className="sw-row" style={{ marginBottom: 12 }}>
        <button type="button" className="sw-btn" onClick={onOpenInMap}><Waypoints size={14} /> Open in API Map</button>
        <span className="sw-row" style={{ gap: 6 }}>
          <label className="sw-field" style={{ flexDirection: "row", alignItems: "center" }}>
            <span>Contract Graph</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "auto", padding: "5px 8px" }} aria-label="Workspace to add the service to">
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.services.length})</option>)}
              <option value="new">New workspace</option>
            </select>
          </label>
          <button type="button" className="sw-btn" onClick={() => onAddToGraph(target)} disabled={adding}>
            <Network size={14} /> {adding ? "Adding…" : "Add to Contract Graph"}
          </button>
        </span>
        <a className="sw-btn is-small" href="https://editor.swagger.io/" target="_blank" rel="noreferrer" title="Paste the YAML into the Swagger editor">
          <ExternalLink size={12} /> Swagger editor
        </a>
      </div>

      {hostedUrl ? (
        <p className="sw-warnings" style={{ marginTop: 0, marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start", borderColor: "rgba(52, 211, 153, 0.35)", background: "rgba(52, 211, 153, 0.07)" }}>
          <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>These endpoints are live.</b> The workbench hosts them at <span className="sw-mono">{hostedUrl}</span> and forwards every call to the SOAP service at <span className="sw-mono">{soapEndpoint || "its endpoint"}</span>; they follow every change made on the Design tab. Try one in the API Map playground or Postman, e.g. <span className="sw-mono">{firstRoute}</span>. To run them on your own servers, the Adapter tab has the same bridge as a program.
          </span>
        </p>
      ) : (
        <p className="sw-warnings" style={{ marginTop: 0, marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>These endpoints are not hosted here.</b> {hostingError || "No bridge host is reachable."} The SOAP service keeps answering only SOAP at <span className="sw-mono">{soapEndpoint || "its endpoint"}</span>. To make these URLs answer, run the adapter from the Adapter tab (it listens on <span className="sw-mono">{spec.servers[0].url}</span>) and point Postman there.
          </span>
        </p>
      )}
      <pre className="sw-code" aria-label="OpenAPI document">{text}</pre>
    </div>
  );
};

export default OpenApiView;
