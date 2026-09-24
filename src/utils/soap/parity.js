/**
 * Parity: prove the REST adapter answers what the SOAP service answers.
 *
 * For each operation this builds the SOAP envelope (from the XSD, with
 * sample values), the equivalent REST request (same values, placed where
 * the design put them — path, query or body), and the comparison rules
 * (where the result sits in each response, how to normalise). The plan is
 * data (`parity.json`) so recorded traffic can replace the samples, and
 * `parity.test.mjs` is a runnable Node script that calls both and compares.
 *
 * Nothing runs in the browser: SOAP endpoints sit on private networks and
 * behind CORS, so the script is the artefact.
 */
import { escapeXml } from "./xml";

export const SOAP11_ENV = "http://schemas.xmlsoap.org/soap/envelope/";
export const SOAP12_ENV = "http://www.w3.org/2003/05/soap-envelope";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

const resolve = (schema, components, seen = new Set()) => {
  let current = schema;
  while (current?.$ref) {
    const name = current.$ref.split("/").pop();
    if (seen.has(name)) return null;
    seen.add(name);
    current = components[name];
  }
  if (current?.allOf && !current.properties) {
    const merged = { type: "object", properties: {}, required: [], "x-xml": {} };
    current.allOf.forEach((part) => {
      const r = resolve(part, components, new Set(seen));
      if (!r) return;
      Object.assign(merged.properties, r.properties || {});
      merged.required.push(...(r.required || []));
      Object.assign(merged["x-xml"], r["x-xml"] || {});
    });
    return merged;
  }
  return current || null;
};

// ─── Sample values ───────────────────────────

const sampleString = (name, schema) => {
  if (Array.isArray(schema.enum) && schema.enum.length) return String(schema.enum[0]);
  if (schema.format === "date-time") return "2024-01-15T09:30:00Z";
  if (schema.format === "date") return "2024-01-15";
  if (schema.format === "time") return "09:30:00";
  if (schema.format === "uri") return "https://example.com/resource/1";
  if (schema.format === "byte") return "U0FNUExF";
  if (schema.format === "uuid") return "3f2b1d4e-9c8a-4b7e-8f6d-1a2b3c4d5e6f";
  if (schema.format === "email") return "sample@example.com";
  const lower = String(name || "").toLowerCase();
  if (/(^|[^a-z])(id|identifier|key|ref|reference|guid|uuid|number|no|code)$/.test(lower) || /id$/.test(lower)) return `${String(name || "id").replace(/(id|identifier|key|ref|reference|number|no|code)$/i, "").replace(/[^A-Za-z]/g, "").toUpperCase() || "ID"}-1001`;
  if (/iban/.test(lower)) return "GB29NWBK60161331926819";
  if (/currency/.test(lower)) return "GBP";
  if (/country/.test(lower)) return "GB";
  if (/(email|mail)/.test(lower)) return "sample@example.com";
  if (/(phone|mobile|tel)/.test(lower)) return "+441632960000";
  if (/(postcode|zip)/.test(lower)) return "SW1A 1AA";
  if (/(city|town)/.test(lower)) return "London";
  if (/(name|description|message|reason|title|text|note|comment|line)/.test(lower)) return `Sample ${String(name || "text")}`;
  if (/sku/.test(lower)) return "SKU-0001";
  let value = `sample-${lower || "value"}`;
  if (schema.minLength && value.length < schema.minLength) value = value.padEnd(schema.minLength, "x");
  if (schema.maxLength && value.length > schema.maxLength) value = value.slice(0, schema.maxLength);
  return value;
};

/** A plausible value for a schema; recursive refs stop rather than loop. */
export const sampleValue = (schema, components, name = "", depth = 0, stack = new Set()) => {
  if (!schema || depth > 6) return undefined;
  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop();
    if (stack.has(refName)) return undefined;
    const next = new Set(stack);
    next.add(refName);
    return sampleValue(components[refName], components, name || refName, depth, next);
  }
  const s = resolve(schema, components) || schema;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined && s.type !== "object") {
    if (s.type === "integer" || s.type === "number") return Number.isFinite(Number(s.default)) ? Number(s.default) : s.default;
    if (s.type === "boolean") return String(s.default) === "true";
    return s.default;
  }
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.anyOf || s.oneOf) return sampleValue((s.anyOf || s.oneOf)[0], components, name, depth + 1, stack);
  switch (s.type) {
    case "string": return sampleString(name, s);
    case "integer": return s.minimum !== undefined ? Math.max(1, s.minimum) : /(count|quantity|max|limit|size|page)/i.test(name) ? 10 : 1;
    case "number": return s.minimum !== undefined ? Math.max(1, s.minimum) : 100.5;
    case "boolean": return true;
    case "array": {
      const item = sampleValue(s.items, components, name.replace(/s$/, ""), depth + 1, stack);
      return item === undefined ? [] : [item];
    }
    default: {
      if (!s.properties) return s.type === "object" || !s.type ? {} : undefined;
      const out = {};
      const required = new Set(s.required || []);
      Object.entries(s.properties).forEach(([prop, ps]) => {
        const target = resolve(ps, components) || ps;
        const scalar = target && target.type !== "object" && target.type !== "array" && !target.properties;
        if (!required.has(prop) && !scalar && depth >= 1) return;
        if (!required.has(prop) && s["x-xsd-choice"]?.some((group) => group.includes(prop) && group[0] !== prop)) return;
        const value = sampleValue(ps, components, prop, depth + 1, stack);
        if (value !== undefined) out[prop] = value;
      });
      return out;
    }
  }
};

// ─── JSON → XML ──────────────────────────────

const xmlNode = (name, ns, parentNs, attrs, inner, selfClose) => {
  const nsDecl = ns !== parentNs ? ` xmlns="${escapeXml(ns)}"` : "";
  const attrText = Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("");
  return selfClose ? `<${name}${nsDecl}${attrText}/>` : `<${name}${nsDecl}${attrText}>${inner}</${name}>`;
};

const valueToXml = (value, schema, components, name, ns, parentNs, indent) => {
  const s = resolve(schema, components) || schema || {};
  const pad = "  ".repeat(indent);
  if (value === null) return `${pad}${xmlNode(name, ns, parentNs, { "xsi:nil": "true" }, "", true)}`;
  if (Array.isArray(value)) return value.map((item) => valueToXml(item, s.items || {}, components, name, ns, parentNs, indent)).join("\n");
  if (value && typeof value === "object") {
    const xml = s["x-xml"] || {};
    const attrs = {};
    let text = null;
    const children = [];
    Object.entries(value).forEach(([prop, v]) => {
      const info = xml[prop] || { name: prop, ns: "" };
      const ps = s.properties?.[prop] || {};
      if (info.attribute) attrs[info.name] = v;
      else if (info.text) text = v;
      // An unqualified child (elementFormDefault="unqualified", rpc parts) gets xmlns="" under a namespaced parent.
      else children.push(valueToXml(v, ps, components, info.name, info.ns || "", ns, indent + 1));
    });
    if (text !== null && !children.length) return `${pad}${xmlNode(name, ns, parentNs, attrs, escapeXml(text), false)}`;
    if (!children.length) return `${pad}${xmlNode(name, ns, parentNs, attrs, "", true)}`;
    return `${pad}${xmlNode(name, ns, parentNs, attrs, `\n${children.join("\n")}\n${pad}`, false)}`;
  }
  return `${pad}${xmlNode(name, ns, parentNs, {}, escapeXml(value), false)}`;
};

/**
 * The SOAP request for one designed operation with the given values (the
 * REST-side field names; sample values when omitted). Returns
 * `{ xml, url, headers, contentType, values }`.
 */
export const buildEnvelope = (service, design, row, values) => {
  const components = design.components;
  const input = row.shapes.input;
  const element = row.soap.inputElement;
  const version = row.soap.version === "1.2" ? "1.2" : "1.1";
  const envNs = version === "1.2" ? SOAP12_ENV : SOAP11_ENV;
  const filled = values || (input.schema ? sampleValue(input.schema, components, element?.local || row.soapOperation) : {}) || {};
  let body = "";
  if (element?.local) {
    body = valueToXml(filled, input.schema || { type: "object" }, components, element.local, element.ns || "", "", 2);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="${envNs}" xmlns:xsi="${XSI}">
  <soapenv:Header/>
  <soapenv:Body>
${body || "    <!-- no input message -->"}
  </soapenv:Body>
</soapenv:Envelope>`;
  const url = row.soap.endpoint || service?.endpoints?.find((e) => e.address)?.address || "";
  const contentType = version === "1.2" ? `application/soap+xml; charset=utf-8${row.soap.action ? `; action="${row.soap.action}"` : ""}` : "text/xml; charset=utf-8";
  const headers = { "Content-Type": contentType };
  if (version === "1.1") headers.SOAPAction = `"${row.soap.action || ""}"`;
  return { xml, url, headers, contentType, values: filled, version };
};

/** The same values placed where the REST design put them. */
export const buildRestRequest = (design, row, values, baseUrl = "") => {
  const filled = values || {};
  let path = row.path;
  row.pathParams.forEach((p) => {
    const v = filled[p.field];
    path = path.split(`{${p.name}}`).join(encodeURIComponent(v === undefined || v === null ? `sample-${p.name}` : String(v)));
  });
  const query = {};
  row.queryParams.forEach((q) => {
    const v = filled[q.field];
    if (v !== undefined && v !== null && typeof v !== "object") query[q.name] = String(v);
  });
  let body = null;
  if (row.requestBody && row.method !== "GET" && row.method !== "DELETE") {
    const moved = new Set([...row.pathParams.map((p) => p.field), ...row.queryParams.map((q) => q.field)]);
    body = Object.fromEntries(Object.entries(filled).filter(([k]) => !moved.has(k)));
  }
  const qs = Object.keys(query).length ? `?${Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  return { method: row.method, url: `${String(baseUrl || "").replace(/\/+$/, "")}${path}${qs}`, path, query, headers, body };
};

const curlEscape = (text) => `'${String(text).replace(/'/g, "'\\''")}'`;

export const curlFor = ({ method = "POST", url, headers = {}, body }) => {
  const parts = [`curl -X ${method}`, ...Object.entries(headers).map(([k, v]) => `-H ${curlEscape(`${k}: ${v}`)}`)];
  if (body !== null && body !== undefined) parts.push(`--data-binary ${curlEscape(typeof body === "string" ? body : JSON.stringify(body))}`);
  parts.push(curlEscape(url || "http://localhost/"));
  return parts.join(" \\\n  ");
};

/** Where the result sits in each response, and how to compare. */
const comparisonFor = (row, components) => {
  const output = resolve(row.shapes.output.schema, components) || {};
  const resultElement = row.response.unwrapped ? output["x-xml"]?.[row.response.unwrapped]?.name || row.response.unwrapped : "";
  const soapPath = ["Envelope", "Body", row.soap.outputElement?.local || `${row.soapOperation}Response`, resultElement].filter(Boolean);
  return {
    soapResultPath: soapPath.join("/"),
    restResultPath: "$",
    expectStatus: row.response.status,
    normalize: ["keys-case-insensitive", "numbers-as-numbers", "trim-strings", "drop-nulls", "xsi-nil-to-null", "single-item-arrays"],
    ignore: [],
  };
};

/**
 * The parity plan for a service: one case per operation that is not
 * skipped. `restBaseUrl` defaults to the proposed server; `soapUrl` to the
 * WSDL's endpoint.
 */
export const buildParityPlan = (service, design, { restBaseUrl = "", soapUrl = "" } = {}) => {
  const cases = design.operations
    .filter((row) => row.status !== "skipped")
    .map((row) => {
      const envelope = buildEnvelope(service, design, row);
      const rest = buildRestRequest(design, row, envelope.values, restBaseUrl);
      return {
        id: row.soapOperation,
        title: `${row.soapOperation} ↔ ${row.method} ${row.path}`,
        status: row.status,
        soap: { url: soapUrl || envelope.url, headers: envelope.headers, body: envelope.xml, version: envelope.version, action: row.soap.action },
        rest: { method: rest.method, url: rest.url, headers: rest.headers, body: rest.body },
        values: envelope.values,
        compare: comparisonFor(row, design.components),
      };
    });
  return {
    vizroute: "soap-parity-plan",
    version: 1,
    service: service?.name || design.serviceName,
    generatedAt: new Date().toISOString(),
    soapUrl: soapUrl || service?.endpoints?.find((e) => e.address)?.address || "",
    restBaseUrl,
    cases,
  };
};

/** The runnable Node script: reads parity.json, calls both sides, compares. */
export const parityScript = () => `#!/usr/bin/env node
// Parity tests generated by the Vizroute SOAP Migration Workbench.
// Usage: node parity.test.mjs [parity.json] [--rest https://host/v1] [--soap https://host/Service.svc] [--only Op1,Op2]
// Node 18+ (fetch). Exit code 1 when any case differs.
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? "" : args[i + 1] || ""; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const planFile = positional[0] || "parity.json";
const plan = JSON.parse(await readFile(planFile, "utf8"));
const restBase = flag("--rest") || plan.restBaseUrl;
const soapUrl = flag("--soap") || plan.soapUrl;
const only = flag("--only") ? new Set(flag("--only").split(",")) : null;

// A small XML → JSON reader: elements become objects, repeats become arrays, text becomes strings.
const xmlToJson = (xml) => {
  const stack = [{ children: {} }];
  const re = /<\\/?([A-Za-z_][\\w.-]*:)?([A-Za-z_][\\w.-]*)([^>]*?)(\\/?)>|<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|<!--[\\s\\S]*?-->|<\\?[\\s\\S]*?\\?>|([^<]+)/g;
  let m;
  const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  while ((m = re.exec(xml))) {
    if (m[6] !== undefined) { if (m[6].trim()) stack[stack.length - 1].text = (stack[stack.length - 1].text || "") + decode(m[6]); continue; }
    if (m[5] !== undefined) { stack[stack.length - 1].text = (stack[stack.length - 1].text || "") + m[5]; continue; }
    if (!m[2]) continue;
    const closing = m[0].startsWith("</");
    const name = m[2];
    if (closing) {
      const node = stack.pop();
      const parent = stack[stack.length - 1];
      const value = finish(node);
      if (parent.children[name] === undefined) parent.children[name] = value;
      else parent.children[name] = [].concat(parent.children[name], [value]);
      continue;
    }
    const node = { children: {}, nil: /xsi:nil="true"/.test(m[3]) };
    if (m[4] === "/") {
      const parent = stack[stack.length - 1];
      const value = finish(node);
      if (parent.children[name] === undefined) parent.children[name] = value;
      else parent.children[name] = [].concat(parent.children[name], [value]);
    } else stack.push(node);
  }
  return stack[0].children;
  function finish(node) {
    if (node.nil) return null;
    const keys = Object.keys(node.children);
    if (!keys.length) return node.text === undefined ? null : node.text;
    return node.children;
  }
};

const dig = (value, path) => path.split("/").filter(Boolean).reduce((acc, key) => {
  if (acc === undefined || acc === null) return undefined;
  if (key === "$") return acc;
  return acc[key];
}, value);

const normalize = (value, rules) => {
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(v, rules));
    return rules.includes("single-item-arrays") && items.length === 1 ? items[0] : items;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = rules.includes("keys-case-insensitive") ? k.toLowerCase().replace(/[^a-z0-9]/g, "") : k;
      const n = normalize(v, rules);
      if (rules.includes("drop-nulls") && (n === null || n === undefined)) continue;
      out[key] = n;
    }
    return out;
  }
  if (typeof value === "string") {
    const s = rules.includes("trim-strings") ? value.trim() : value;
    if (rules.includes("numbers-as-numbers") && /^-?\\d+(\\.\\d+)?$/.test(s)) return Number(s);
    if (s === "true") return true;
    if (s === "false") return false;
    return s;
  }
  return value;
};

const diff = (a, b, path = "$", out = []) => {
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff(a[k], b[k], path + "." + k, out);
    return out;
  }
  if (a !== b) out.push({ path, soap: a, rest: b });
  return out;
};

const results = [];
for (const c of plan.cases) {
  if (only && !only.has(c.id)) continue;
  const soapTarget = soapUrl || c.soap.url;
  const restTarget = c.rest.url.startsWith("http") ? c.rest.url : restBase.replace(/\\/+$/, "") + c.rest.url;
  const one = { id: c.id, title: c.title, ok: false, differences: [], error: "" };
  try {
    const soapRes = await fetch(soapTarget, { method: "POST", headers: c.soap.headers, body: c.soap.body });
    const soapText = await soapRes.text();
    const restRes = await fetch(restTarget, { method: c.rest.method, headers: c.rest.headers, body: c.rest.body ? JSON.stringify(c.rest.body) : undefined });
    const restText = await restRes.text();
    one.soapStatus = soapRes.status;
    one.restStatus = restRes.status;
    if (restRes.status !== c.compare.expectStatus) one.differences.push({ path: "status", soap: c.compare.expectStatus, rest: restRes.status });
    const soapJson = xmlToJson(soapText);
    const restJson = restText ? JSON.parse(restText) : null;
    const left = normalize(dig(soapJson, c.compare.soapResultPath), c.compare.normalize);
    const right = normalize(dig(restJson, c.compare.restResultPath), c.compare.normalize);
    const differences = diff(left, right).filter((d) => !c.compare.ignore.some((ig) => d.path.startsWith("$." + ig)));
    one.differences.push(...differences);
    one.ok = one.differences.length === 0;
  } catch (e) {
    one.error = e.message;
  }
  results.push(one);
  console.log((one.ok ? "PASS " : "FAIL ") + one.title + (one.error ? "  — " + one.error : "") + (one.differences.length ? "  (" + one.differences.length + " difference" + (one.differences.length === 1 ? "" : "s") + ")" : ""));
  for (const d of one.differences.slice(0, 10)) console.log("     " + d.path + ": soap=" + JSON.stringify(d.soap) + " rest=" + JSON.stringify(d.rest));
}
await writeFile("parity-results.json", JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(\`\\n\${results.length - failed}/\${results.length} in parity\${failed ? \`, \${failed} differ\` : ""}. Details in parity-results.json.\`);
process.exit(failed ? 1 : 0);
`;

/** Everything the parity download holds. */
export const parityFiles = (plan) => {
  const files = [
    { path: "parity.json", content: JSON.stringify(plan, null, 2) },
    { path: "parity.test.mjs", content: parityScript() },
    {
      path: "README.md",
      content: `# Parity tests — ${plan.service}

One case per operation: the SOAP envelope and the equivalent REST request with the same values, and where the result sits in each response.

- \`parity.json\` — the plan. Replace the sample \`values\`/\`body\` with recorded traffic where you have it; add field paths to \`compare.ignore\` for values that legitimately differ (timestamps, generated ids).
- \`parity.test.mjs\` — runs every case against both sides and prints the differences. Node 18+.
- \`soap/*.xml\` — each request envelope on its own, for SoapUI or curl.

\`\`\`sh
node parity.test.mjs parity.json --soap ${plan.soapUrl || "https://soap-host/Service"} --rest ${plan.restBaseUrl || "https://rest-host/v1"}
\`\`\`
`,
    },
  ];
  plan.cases.forEach((c) => files.push({ path: `soap/${c.id}.xml`, content: c.soap.body }));
  return files;
};
