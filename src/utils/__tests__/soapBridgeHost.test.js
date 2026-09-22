import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridgeHost, startBridgeHost } from "../../../server/bridgeHost.mjs";
import { parseWsdl } from "../soap/wsdl";
import { proposeDesign } from "../soap/design";
import { buildBridge } from "../soap/bridge";
import { publishBridge, unpublishBridge, bridgeIdFor } from "../soap/hosting";
import { SAMPLE_PROGRAMME } from "../soap/samples";

/**
 * The host that makes "upload a WSDL, get REST" true: publish a bridge,
 * call its routes, see the SOAP service answer through them. A mock SOAP
 * service stands in for the real one; nothing depends on the network.
 */

const sample = (name) => {
  const s = SAMPLE_PROGRAMME.services.find((x) => x.name === name);
  return parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
};
const bridgeFor = (name, soapUrl) => {
  const svc = sample(name);
  const b = buildBridge(proposeDesign(svc), svc);
  b.soap.url = soapUrl;
  b.routes.forEach((r) => { r.endpoint = soapUrl; });
  return b;
};
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => server.close(resolve));

const soapCalls = [];
const soap = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    soapCalls.push(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetAccountBalanceResponse xmlns="http://bank.example.com/accounts"><GetAccountBalanceResult><AccountId xmlns="http://bank.example.com/accounts/types">A1</AccountId><AsOf xmlns="http://bank.example.com/accounts/types">2024-01-15T09:30:00Z</AsOf></GetAccountBalanceResult></GetAccountBalanceResponse></soap:Body></soap:Envelope>`);
  });
});

let soapUrl = "";
let hostUrl = "";
let started;
let dataDir;

beforeAll(async () => {
  soapUrl = await listen(soap);
  dataDir = mkdtempSync(join(tmpdir(), "vizroute-host-"));
  started = await startBridgeHost({ port: 0, host: "127.0.0.1", dataDir });
  hostUrl = `http://127.0.0.1:${started.port}`;
});
afterAll(async () => {
  await close(started.server);
  await close(soap);
});

const call = async (path, init) => {
  const res = await fetch(`${hostUrl}${path}`, init);
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type") || "", json: text ? JSON.parse(text) : null };
};

describe("bridge host", () => {
  it("publishes a bridge and serves its REST routes through to SOAP", async () => {
    const bridge = bridgeFor("AccountService", soapUrl);
    const put = await call("/bridge/bridges/wsdl_abc", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bridge) });
    expect(put.status).toBe(200);
    expect(put.json).toMatchObject({ id: "wsdl_abc", service: "AccountService", soap: soapUrl, baseUrl: `${hostUrl}/bridge/b/wsdl_abc` });
    expect(put.json.routes).toContain("GET /accounts/{accountId}/balance");

    soapCalls.length = 0;
    const r = await call("/bridge/b/wsdl_abc/accounts/A1/balance");
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^application\/json/);
    expect(r.json).toEqual({ accountId: "A1", asOf: "2024-01-15T09:30:00Z" });
    expect(soapCalls).toHaveLength(1);
    expect(soapCalls[0]).toContain("<AccountId>A1</AccountId>");

    const list = await call("/bridge/bridges");
    expect(list.json.bridges.map((b) => b.id)).toEqual(["wsdl_abc"]);
    expect((await call("/bridge/bridges/wsdl_abc")).json.routes.length).toBeGreaterThan(0);
    // Persisted for a restart.
    expect(readdirSync(dataDir)).toContain("wsdl_abc.json");

    // Republishing replaces the routes in place; the URL is stable.
    const fewer = { ...bridge, routes: bridge.routes.slice(0, 1) };
    await call("/bridge/bridges/wsdl_abc", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fewer) });
    expect((await call("/bridge/bridges/wsdl_abc")).json.routes).toHaveLength(1);
    expect((await call("/bridge/b/wsdl_abc/accounts")).status).toBe(404);

    expect((await call("/bridge/bridges/wsdl_abc", { method: "DELETE" })).status).toBe(204);
    expect((await call("/bridge/b/wsdl_abc/accounts/A1/balance")).json).toMatchObject({ status: 404, detail: expect.stringMatching(/No service is hosted as wsdl_abc/) });
    expect(readdirSync(dataDir)).not.toContain("wsdl_abc.json");
  });

  it("refuses what it should and answers CORS preflight", async () => {
    const bad = await call("/bridge/bridges/x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{oops" });
    expect(bad.status).toBe(400);
    expect(bad.json.detail).toMatch(/not JSON/);
    const notBridge = await call("/bridge/bridges/x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openapi: "3.0.0" }) });
    expect(notBridge.status).toBe(400);
    expect(notBridge.json.detail).toMatch(/not a bridge/);
    expect((await call("/bridge/bridges/not%20an%20id", { method: "PUT", body: "{}" })).status).toBe(400);
    expect((await call("/bridge/bridges/nope", { method: "DELETE" })).status).toBe(404);
    expect((await call("/bridge/bridges/nope")).status).toBe(404);
    expect((await call("/bridge/bridges", { method: "POST", body: "{}" })).status).toBe(405);
    expect((await call("/bridge/what")).status).toBe(404);
    const huge = await fetch(`${hostUrl}/bridge/bridges/big`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: `{"pad":"${"x".repeat(5 * 1024 * 1024)}"}` }).then((r) => r.status).catch(() => 413);
    expect(huge).toBe(413);
    const preflight = await fetch(`${hostUrl}/bridge/b/any/thing`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("passes requests outside its prefix on as middleware", async () => {
    const host = createBridgeHost({ prefix: "/bridge" });
    let passed = 0;
    const app = createServer((req, res) => host.handler(req, res, () => { passed += 1; res.writeHead(200); res.end("app"); }));
    const url = await listen(app);
    expect(await fetch(`${url}/soap`).then((r) => r.text())).toBe("app");
    expect(await fetch(`${url}/bridgeless`).then((r) => r.text())).toBe("app");
    expect(passed).toBe(2);
    expect((await fetch(`${url}/bridge/bridges`).then((r) => r.json())).bridges).toEqual([]);
    await close(app);
  });

  it("is what the page calls: publishBridge returns an absolute base URL, unpublish is quiet", async () => {
    const bridge = bridgeFor("WarehouseService", soapUrl);
    const fetchImpl = (url, init) => fetch(`${hostUrl}${url}`, init); // same-origin, as in the app
    const result = await publishBridge("wsdl_xyz!", bridge, { fetchImpl, origin: hostUrl });
    expect(result).toMatchObject({ id: "wsdl_xyz-", baseUrl: `${hostUrl}/bridge/b/wsdl_xyz-` });
    expect(result.routes).toContain("GET /stock-levels");
    expect(bridgeIdFor("a b/c")).toBe("a-b-c");
    await expect(publishBridge("x", bridge, { fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) })).rejects.toThrow(/No bridge host at/);
    await expect(publishBridge("x", { nope: 1 }, { fetchImpl, origin: hostUrl })).rejects.toThrow(/refused the service: .*not a bridge/);
    await unpublishBridge("wsdl_xyz!", { fetchImpl });
    expect((await call("/bridge/bridges/wsdl_xyz-")).status).toBe(404);
    await expect(unpublishBridge("x", { fetchImpl: () => Promise.reject(new Error("gone")) })).resolves.toBeUndefined();
  });
});
