/**
 * OpenAPI 3.0.3 from an approved design.
 *
 * Every operation carries `x-soap-operation` and `x-soap-action` so the
 * adapter, the parity tests and Contract Graph can trace a REST endpoint
 * back to the SOAP operation it fronts. Errors are RFC 9457 problem
 * details; the fault's own detail schema, when there is one, rides along
 * as `x-soap-fault-detail`.
 */
import yaml from "js-yaml";
import { splitWords } from "./design";

const PROBLEM_SCHEMA = {
  type: "object",
  description: "RFC 9457 problem details. `type` names the SOAP fault the adapter translated when there was one.",
  properties: {
    type: { type: "string", format: "uri", example: "urn:soap-fault:AccountNotFoundFault" },
    title: { type: "string" },
    status: { type: "integer", format: "int32" },
    detail: { type: "string" },
    instance: { type: "string", format: "uri" },
  },
  required: ["title", "status"],
};

const camelId = (name) => {
  const words = splitWords(name).map((w) => w.replace(/[^A-Za-z0-9]/g, ""));
  const joined = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
  return /^[A-Za-z_]/.test(joined) ? joined : `op${joined}`;
};

const parameter = (p, where) => {
  const schema = p.schema && !p.schema.$ref ? { ...p.schema } : p.schema ? { $ref: p.schema.$ref } : { type: "string" };
  delete schema.nullable;
  const out = { name: p.name, in: where, required: where === "path" ? true : Boolean(p.required), schema };
  if (p.description) out.description = p.description;
  if (p.xmlName && p.xmlName !== p.name) out["x-soap-field"] = p.xmlName;
  return out;
};

/** Where the scaffolded adapter listens when run as generated (Kestrel and Spring Boot defaults). */
export const ADAPTER_LOCAL_URL = "http://localhost:8080";

/** The base URL the REST version would live at: the SOAP host with the version prefix. */
export const proposedServerUrl = (service, basePath = "/v1") => {
  const address = service?.endpoints?.find((e) => e.address)?.address || "";
  const prefix = basePath ? `/${String(basePath).replace(/^\/+|\/+$/g, "")}` : "";
  try {
    const url = new URL(address);
    return `${url.protocol}//${url.host}${prefix}`;
  } catch {
    return `https://api.example.com${prefix}`;
  }
};

/** The request-body schema without the fields that moved to the path or query. */
const bodySchema = (row, components) => {
  const body = row.requestBody;
  if (!body) return null;
  const moved = new Set([...row.pathParams.map((p) => p.field), ...row.queryParams.map((q) => q.field)]);
  const full = body.schema?.$ref ? components[body.schema.$ref.split("/").pop()] : body.schema;
  if (!full || !full.properties) return body.schema || { type: "object" };
  const keep = Object.entries(full.properties).filter(([name]) => !moved.has(name));
  if (keep.length === Object.keys(full.properties).length) return body.schema;
  const schema = { type: "object", properties: Object.fromEntries(keep) };
  const required = (full.required || []).filter((r) => !moved.has(r));
  if (required.length) schema.required = required;
  if (full.description) schema.description = full.description;
  return schema;
};

/**
 * Build the OpenAPI document. `service` supplies the title, description
 * and endpoint host; `design` everything else.
 */
export const buildOpenApi = (design, service, { serverUrl, serverDescription } = {}) => {
  // The problem shape is inlined per response rather than shared as a
  // component: a named "Problem" schema in every migrated service would
  // show up on the Contract Graph as an entity they all share.
  const components = { ...design.components };
  const paths = {};
  const usedIds = new Set();
  const tags = design.resources.map((r) => ({ name: r.tag, description: `Operations on ${r.name}.` }));

  design.operations.forEach((row) => {
    let operationId = camelId(row.soapOperation);
    let n = 2;
    while (usedIds.has(operationId)) operationId = `${camelId(row.soapOperation)}${n++}`;
    usedIds.add(operationId);

    const resource = design.resources.find((r) => r.operations.includes(row.id));
    const responses = {};
    const ok = { description: row.response.status === 204 ? "No content." : row.response.status === 202 ? "Accepted; the request is processed asynchronously." : row.response.status === 201 ? "Created." : "OK." };
    if (row.response.schema && row.response.status !== 204) ok.content = { "application/json": { schema: row.response.schema } };
    responses[String(row.response.status)] = ok;
    row.errors.forEach((err) => {
      const entry = { description: err.description, content: { "application/problem+json": { schema: PROBLEM_SCHEMA } } };
      if (err.faults.length) entry["x-soap-faults"] = err.faults;
      if (err.schema) entry["x-soap-fault-detail"] = err.schema;
      responses[String(err.status)] = entry;
    });
    if (!responses["500"]) responses["500"] = { description: "The SOAP service failed or answered with an unmapped fault.", content: { "application/problem+json": { schema: PROBLEM_SCHEMA } } };

    const operation = {
      operationId,
      summary: row.summary,
      tags: [resource?.tag || row.resource],
      "x-soap-operation": row.soapOperation,
    };
    const description = [row.documentation, row.notes ? `Reviewer notes: ${row.notes}` : "", `Proposed from SOAP operation ${row.soapOperation}${row.soap.action ? ` (SOAPAction ${row.soap.action})` : ""}.`].filter(Boolean).join("\n\n");
    if (description) operation.description = description;
    if (row.soap.action) operation["x-soap-action"] = row.soap.action;
    if (row.soap.inputElement?.local) operation["x-soap-request-element"] = row.soap.inputElement.local;
    if (row.soap.outputElement?.local) operation["x-soap-response-element"] = row.soap.outputElement.local;
    operation["x-vizroute-confidence"] = row.confidence;
    if (row.review) operation["x-vizroute-review"] = row.reviewReasons;
    const params = [...row.pathParams.map((p) => parameter(p, "path")), ...row.queryParams.map((q) => parameter(q, "query"))];
    if (params.length) operation.parameters = params;
    const body = bodySchema(row, components);
    if (body && row.method !== "GET" && row.method !== "DELETE") {
      operation.requestBody = { required: true, content: { "application/json": { schema: body } } };
    }
    operation.responses = responses;
    if (row.status === "skipped") operation.deprecated = true;

    const path = row.path;
    if (!paths[path]) paths[path] = {};
    const method = row.method.toLowerCase();
    if (paths[path][method]) {
      // Should not happen after collision handling; keep both reachable rather than lose one.
      const alt = `${path}/${camelId(row.soapOperation)}`;
      paths[alt] = { ...(paths[alt] || {}), [method]: operation };
    } else paths[path][method] = operation;
  });

  const info = {
    title: service?.name || design.serviceName || "Migrated service",
    version: "1.0.0-proposed",
    description: [service?.documentation, `REST design proposed by the Vizroute SOAP Migration Workbench from the ${service?.name || "SOAP"} WSDL${service?.version ? ` (WSDL ${service.version})` : ""}. ${design.stats.review ? `${design.stats.review} operation${design.stats.review === 1 ? "" : "s"} still flagged for review.` : "Every operation has been reviewed or needed no review."}`].filter(Boolean).join("\n\n"),
    "x-soap-source": { service: service?.name || "", targetNamespace: service?.targetNamespace || "", wsdlVersion: service?.version || "", endpoints: (service?.endpoints || []).map((e) => e.address).filter(Boolean) },
  };

  return {
    openapi: "3.0.3",
    info,
    // Two servers, both honest: the adapter's local address (which answers
    // once `dotnet run` / `mvn spring-boot:run` is up) and the proposed
    // production URL, which nothing serves until the adapter is deployed.
    servers: [
      { url: serverUrl || ADAPTER_LOCAL_URL, description: serverUrl ? serverDescription || "REST adapter." : "The generated REST adapter running locally (node adapter.mjs / dotnet run / mvn spring-boot:run). Nothing answers here until it does." },
      { url: proposedServerUrl(service, design.basePath), description: "Proposed production base URL — the SOAP host with a version prefix. This is a design; the SOAP service does not serve it." },
    ],
    tags,
    paths,
    components: { schemas: components },
  };
};

export const openApiToYaml = (doc) => yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
export const openApiToJson = (doc) => JSON.stringify(doc, null, 2);
