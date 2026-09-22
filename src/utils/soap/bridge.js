/**
 * The bridge: a REST adapter that works as generated.
 *
 * Everything the runtime needs to turn a REST request into the SOAP call
 * and the SOAP answer into JSON is known from the WSDL — the element and
 * namespace of each message, the SOAPAction, which field went to the path
 * or the query, the response wrapper and the result field, the fault →
 * status table, and the schemas with each property's XML name. That is
 * written out as `bridge.json`; the runtime (`adapter.mjs` for Node, the
 * `SoapBridge` class in the .NET and Spring scaffolds) is generic and
 * reads it. No SOAP client generation, no per-operation code to fill in.
 */

import adapterSource from "../../../server/adapter.mjs?raw";

const resolveName = (schema) => (schema?.$ref ? schema.$ref.split("/").pop() : "");

/** Everything the runtime needs, as plain data. */
export const buildBridge = (design, service) => {
  const soapUrl = service?.endpoints?.find((e) => e.address)?.address || "";
  const version = service?.operations?.[0]?.soapVersion === "1.2" ? "1.2" : "1.1";
  const routes = design.operations
    .filter((row) => row.status !== "skipped")
    .map((row) => {
      const requestSchema = row.shapes.input.schema;
      const responseSchema = row.shapes.output.schema;
      return {
        operation: row.soapOperation,
        method: row.method,
        path: row.path,
        soapAction: row.soap.action || "",
        soapVersion: row.soap.version === "1.2" ? "1.2" : "1.1",
        endpoint: row.soap.endpoint || soapUrl,
        pathParams: row.pathParams.map((p) => ({ name: p.name, field: p.field || p.name })),
        queryParams: row.queryParams.map((q) => ({ name: q.name, field: q.field || q.name, required: Boolean(q.required) })),
        hasBody: Boolean(row.requestBody) && row.method !== "GET" && row.method !== "DELETE",
        request: {
          element: row.soap.inputElement?.local || "",
          namespace: row.soap.inputElement?.ns || "",
          schema: resolveName(requestSchema),
          inline: requestSchema && !requestSchema.$ref ? requestSchema : null,
          rpc: Boolean(row.soap.rpc),
        },
        response: {
          element: row.soap.outputElement?.local || "",
          schema: resolveName(responseSchema),
          inline: responseSchema && !responseSchema.$ref ? responseSchema : null,
          unwrap: row.response.unwrapped || "",
          status: row.response.status,
          oneWay: !row.shapes.output.element && !row.shapes.output.fields.length && row.response.status === 202,
        },
        faults: row.errors.flatMap((e) => e.faults.map((name) => ({ name, status: e.status, reason: e.reason }))),
      };
    });
  return {
    vizroute: "soap-bridge",
    version: 1,
    service: service?.name || design.serviceName || "",
    soap: { url: soapUrl, version },
    generatedAt: new Date().toISOString(),
    routes,
    schemas: design.components,
  };
};

/**
 * The Node runtime is a real file, `server/adapter.mjs` — a zero-dependency
 * HTTP server (`node adapter.mjs`, reads bridge.json next to it; `--port`
 * and `--soap` override). The workbench's own server runs the same code to
 * host every uploaded service (see `server/bridgeHost.mjs`), and the download
 * contains this file verbatim.
 */
export const nodeAdapterSource = () => adapterSource;

/** The Node bridge download: the runtime, the data, and how to run it. */
export const nodeBridgeFiles = (bridge) => [
  { path: "adapter.mjs", content: nodeAdapterSource() },
  { path: "bridge.json", content: JSON.stringify(bridge, null, 2) },
  {
    path: "README.md",
    content: `# ${bridge.service} — REST adapter (Node)

A working REST front for the SOAP service, generated from the WSDL. Every route below answers by calling the SOAP operation and translating the reply.

\`\`\`sh
node adapter.mjs                     # http://localhost:8080 → ${bridge.soap.url || "(set --soap)"}
node adapter.mjs --port 9090 --soap https://other-host/Service.svc
curl http://localhost:8080/__routes  # what is served
\`\`\`

| REST | SOAP operation |
|---|---|
${bridge.routes.map((r) => `| \`${r.method} ${r.path}\` | ${r.operation} |`).join("\n")}

Faults come back as \`application/problem+json\` with the status the design chose (\`type\` names the fault). Node 18+, no dependencies. \`bridge.json\` is the mapping; edit it if a name or a status should differ — the runtime reads it on start.
`,
  },
];
