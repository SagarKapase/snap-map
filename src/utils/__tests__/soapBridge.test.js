import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import process from "node:process";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseWsdl } from "../soap/wsdl";
import { proposeDesign } from "../soap/design";
import { buildBridge, nodeBridgeFiles } from "../soap/bridge";
import { parseXml, childOf, descendants } from "../soap/xml";
import { SAMPLE_PROGRAMME } from "../soap/samples";

/**
 * End to end: the generated adapter.mjs is written to disk, imported, and
 * served on an ephemeral port in front of a mock SOAP service that records
 * every envelope it receives and answers with canned XML. Nothing here
 * depends on the network.
 */

const sample = (name) => {
  const s = SAMPLE_PROGRAMME.services.find((x) => x.name === name);
  return parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
};

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => server.close(resolve));

// ─── Mock SOAP service ───────────────────────

const received = [];
let reply = () => "";
const soap = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    received.push({ headers: req.headers, body, url: req.url });
    const out = reply(body, req.headers);
    if (out === null) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Not SOAP at all</body></html>");
      return;
    }
    const fault = typeof out === "object" && out.fault;
    res.writeHead(fault ? 500 : 200, { "Content-Type": "text/xml; charset=utf-8" });
    res.end(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body>${fault ? out.fault : out}</soap:Body></soap:Envelope>`);
  });
});

let soapUrl = "";
let adapterModule;
const adapters = [];

const startAdapter = async (serviceName) => {
  const svc = sample(serviceName);
  const bridge = buildBridge(proposeDesign(svc), svc);
  const { server } = adapterModule.createAdapter(bridge, { soapUrl });
  const url = await listen(server);
  adapters.push(server);
  return { url, bridge };
};

const call = async (base, method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type") || "", json: text ? JSON.parse(text) : null };
};

beforeAll(async () => {
  soapUrl = await listen(soap);
  const dir = mkdtempSync(join(tmpdir(), "vizroute-bridge-"));
  const svc = sample("AccountService");
  nodeBridgeFiles(buildBridge(proposeDesign(svc), svc)).forEach((f) => writeFileSync(join(dir, f.path), f.content));
  adapterModule = await import(/* @vite-ignore */ pathToFileURL(join(dir, "adapter.mjs")).href);
});

afterAll(async () => {
  for (const s of adapters) await close(s);
  await close(soap);
});

describe("bridge data", () => {
  it("carries every route with what the runtime needs", () => {
    const svc = sample("AccountService");
    const bridge = buildBridge(proposeDesign(svc, { statuses: { ValidateIban: "skipped" } }), svc);
    expect(bridge.vizroute).toBe("soap-bridge");
    expect(bridge.soap).toEqual({ url: "https://esb.bank.example.com/services/AccountService.svc", version: "1.1" });
    expect(bridge.routes.map((r) => r.operation)).not.toContain("ValidateIban");
    const tx = bridge.routes.find((r) => r.operation === "GetAccountTransactions");
    expect(tx).toMatchObject({ method: "GET", path: "/accounts/{accountId}/transactions", soapAction: "http://bank.example.com/accounts/IAccountService/GetAccountTransactions", hasBody: false });
    expect(tx.pathParams).toEqual([{ name: "accountId", field: "accountId" }]);
    expect(tx.queryParams.map((q) => q.name)).toEqual(["from", "to", "maxResults"]);
    expect(tx.request).toMatchObject({ element: "GetAccountTransactions", namespace: "http://bank.example.com/accounts", schema: "GetAccountTransactions", rpc: false });
    expect(tx.response).toMatchObject({ element: "GetAccountTransactionsResponse", schema: "GetAccountTransactionsResponse", unwrap: "getAccountTransactionsResult", status: 200 });
    expect(tx.faults).toEqual([{ name: "AccountNotFoundFault", status: 404, reason: "Not Found" }]);
    expect(bridge.schemas.Balance).toBeTruthy();
    const files = nodeBridgeFiles(bridge);
    expect(files.map((f) => f.path)).toEqual(["adapter.mjs", "bridge.json", "README.md"]);
    expect(JSON.parse(files[1].content).routes).toHaveLength(7);
  });
});

describe("the generated Node adapter, end to end", () => {
  it("turns GET path and query parameters into a document/literal envelope and the reply into JSON", async () => {
    const { url } = await startAdapter("AccountService");
    received.length = 0;
    reply = () => `<GetAccountTransactionsResponse xmlns="http://bank.example.com/accounts"><GetAccountTransactionsResult>
        <Transaction xmlns="http://bank.example.com/accounts/types"><TransactionId>T-1</TransactionId><BookedOn>2024-01-15T09:30:00Z</BookedOn><Amount currency="GBP">12.50</Amount><Description>Coffee</Description></Transaction>
        <Transaction xmlns="http://bank.example.com/accounts/types"><TransactionId>T-2</TransactionId><BookedOn>2024-01-16T09:30:00Z</BookedOn><Amount currency="GBP">-3</Amount><Counterparty><Name>Shop</Name><Iban xsi:nil="true"/></Counterparty></Transaction>
      </GetAccountTransactionsResult></GetAccountTransactionsResponse>`;
    const r = await call(url, "GET", "/accounts/ACC%2F1/transactions?from=2024-01-01&maxResults=2");
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^application\/json/);
    expect(r.json).toEqual({
      transaction: [
        { transactionId: "T-1", bookedOn: "2024-01-15T09:30:00Z", amount: { value: 12.5, currency: "GBP" }, description: "Coffee" },
        { transactionId: "T-2", bookedOn: "2024-01-16T09:30:00Z", amount: { value: -3, currency: "GBP" }, counterparty: { name: "Shop", iban: null } },
      ],
    });
    // What went to the SOAP side.
    expect(received).toHaveLength(1);
    expect(received[0].headers["content-type"]).toBe("text/xml; charset=utf-8");
    expect(received[0].headers.soapaction).toBe('"http://bank.example.com/accounts/IAccountService/GetAccountTransactions"');
    const env = parseXml(received[0].body);
    const wrapper = childOf(env, "Body").children[0];
    expect(wrapper.local).toBe("GetAccountTransactions");
    expect(wrapper.ns).toBe("http://bank.example.com/accounts");
    expect(wrapper.children.map((c) => `${c.local}=${c.text}`)).toEqual(["AccountId=ACC/1", "From=2024-01-01", "MaxResults=2"]);
  });

  it("sends a JSON body as the request element in schema order, with attributes, nested types and nulls", async () => {
    const { url } = await startAdapter("AccountService");
    received.length = 0;
    reply = () => `<OpenAccountResponse xmlns="http://bank.example.com/accounts"><OpenAccountResult><AccountId xmlns="http://bank.example.com/accounts/types">ACC-9</AccountId><Status xmlns="http://bank.example.com/accounts/types">Active</Status></OpenAccountResult></OpenAccountResponse>`;
    const r = await call(url, "POST", "/accounts", { initialDeposit: { currency: "EUR", value: 25 }, address: { city: "Leeds", line1: "1 High St", line2: null, postcode: "LS1" }, customerId: "C1" });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ accountId: "ACC-9", status: "Active" });
    const wrapper = childOf(parseXml(received[0].body), "Body").children[0];
    // Schema order, not the order the client sent.
    expect(wrapper.children.map((c) => c.local)).toEqual(["CustomerId", "Address", "InitialDeposit"]);
    const address = childOf(wrapper, "Address");
    expect(address.children.map((c) => c.local)).toEqual(["Line1", "Line2", "City", "Postcode"]);
    expect(childOf(address, "Line2").attrs["xsi:nil"]).toBe("true");
    expect(childOf(address, "City").ns).toBe("http://bank.example.com/accounts/types");
    const deposit = childOf(wrapper, "InitialDeposit");
    expect(deposit.text).toBe("25");
    expect(deposit.attrs.currency).toBe("EUR");
  });

  it("maps a declared fault to its status and an unknown Client fault to 400", async () => {
    const { url } = await startAdapter("AccountService");
    reply = () => ({ fault: `<soap:Fault><faultcode>soap:Server</faultcode><faultstring>No such account</faultstring><detail><AccountNotFoundFault xmlns="http://bank.example.com/accounts/types"><Code>ACC404</Code><Message>No such account</Message></AccountNotFoundFault></detail></soap:Fault>` });
    const notFound = await call(url, "GET", "/accounts/nope/balance");
    expect(notFound.status).toBe(404);
    expect(notFound.type).toMatch(/^application\/problem\+json/);
    expect(notFound.json).toMatchObject({ type: "urn:soap-fault:AccountNotFoundFault", title: "Not Found", status: 404, detail: "No such account", soapDetail: { Code: "ACC404", Message: "No such account" } });

    reply = () => ({ fault: `<soap:Fault><faultcode>soap:Client</faultcode><faultstring>Server was unable to read request.</faultstring></soap:Fault>` });
    const bad = await call(url, "GET", "/accounts/x/balance");
    expect(bad.status).toBe(400);
    expect(bad.json.title).toBe("Bad Request");

    reply = () => ({ fault: `<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Boom</faultstring></soap:Fault>` });
    const boom = await call(url, "GET", "/accounts/x/balance");
    expect(boom.status).toBe(500);
    expect(boom.json).toMatchObject({ type: "urn:soap-fault:soap:Server", detail: "Boom" });
  });

  it("answers 204 for an empty response, 202 for one-way, and validates the request", async () => {
    const { url } = await startAdapter("AccountService");
    reply = () => `<CloseAccountResponse xmlns="http://bank.example.com/accounts"/>`;
    const closed = await call(url, "DELETE", "/accounts/ACC-1?reason=moved");
    expect(closed.status).toBe(204);
    expect(closed.json).toBeNull();
    expect(childOf(childOf(parseXml(received.at(-1).body), "Body").children[0], "Reason").text).toBe("moved");

    expect((await call(url, "POST", "/accounts", "{oops")).status).toBe(400);
    const missing = await call(url, "POST", "/accounts", { address: { line1: "x", city: "y", postcode: "z" } });
    expect(missing.status).toBe(400);
    expect(missing.json.detail).toMatch(/"customerId" is required/);
    expect((await call(url, "PATCH", "/accounts")).status).toBe(405);
    expect((await call(url, "GET", "/nothing/here")).status).toBe(404);
    expect((await call(url, "GET", "/__routes")).json.routes).toContain("GET /accounts/{accountId}/balance");
    const preflight = await fetch(`${url}/accounts`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const n = await startAdapter("NotificationService");
    reply = () => "";
    const sent = await call(n.url, "POST", "/notifications", { customerId: "C1", channel: "SMS", message: "hi" });
    expect(sent.status).toBe(202);
    expect(received.at(-1).headers["content-type"]).toBe('application/soap+xml; charset=utf-8; action="urn:notifications:send"');
    expect(received.at(-1).headers.soapaction).toBeUndefined();
  });

  it("speaks rpc/literal: parts unqualified under the operation element, result unwrapped and typed", async () => {
    const { url } = await startAdapter("WarehouseService");
    reply = () => `<getStockLevelResponse xmlns="http://logistics.bank.example.com/warehouse"><return><sku>SKU-1</sku><warehouseCode>LDN</warehouseCode><onHand>40</onHand><reserved>3</reserved><lastCounted xsi:nil="true"/></return></getStockLevelResponse>`;
    const r = await call(url, "GET", "/stock-levels?sku=SKU-1&warehouseCode=LDN");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ sku: "SKU-1", warehouseCode: "LDN", onHand: 40, reserved: 3, lastCounted: null });
    const wrapper = childOf(parseXml(received.at(-1).body), "Body").children[0];
    expect(wrapper.local).toBe("getStockLevel");
    expect(wrapper.ns).toBe("http://logistics.bank.example.com/warehouse");
    expect(wrapper.children.map((c) => `${c.local}:${c.ns}`)).toEqual(["sku:", "warehouseCode:"]);
    expect(received.at(-1).headers.soapaction).toBe('"urn:warehouse:getStockLevel"');
  });

  it("reports a service that does not answer SOAP, or does not answer at all, as 502", async () => {
    const { url } = await startAdapter("AccountService");
    reply = () => null; // HTML instead of an envelope
    const html = await call(url, "GET", "/accounts/x/balance");
    expect(html.status).toBe(502);
    expect(html.json.title).toBe("Not a SOAP response");

    const svc = sample("AccountService");
    const { server } = adapterModule.createAdapter(buildBridge(proposeDesign(svc), svc), { soapUrl: "http://127.0.0.1:1/nothing" });
    const dead = await listen(server);
    adapters.push(server);
    const down = await call(dead, "GET", "/accounts/x/balance");
    expect(down.status).toBe(502);
    expect(down.json.title).toBe("SOAP service unreachable");
  });

  it("keeps unknown elements from an xs:any and ignores namespaces it was not told about", async () => {
    const { url } = await startAdapter("AccountService");
    reply = () => `<FindAccountsByCustomerResponse xmlns="http://bank.example.com/accounts"><FindAccountsByCustomerResult><Account xmlns="http://bank.example.com/accounts/types" version="3"><AccountId>A1</AccountId><Status>Dormant</Status><Metadata><Branch>LDN</Branch><Branch>MCR</Branch></Metadata></Account></FindAccountsByCustomerResult></FindAccountsByCustomerResponse>`;
    const r = await call(url, "GET", "/customers/C1/accounts?includeClosed=true");
    expect(r.json).toEqual({ account: [{ accountId: "A1", status: "Dormant", metadata: { Branch: ["LDN", "MCR"] }, version: 3 }] });
    expect(descendants(parseXml(received.at(-1).body), "IncludeClosed")[0].text).toBe("true");
  });
});

describe("the adapter as a program", () => {
  const run = (args, cwd) => new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("exit", (code) => resolve({ code, out }));
    setTimeout(() => { child.kill(); resolve({ code: "killed", out }); }, 4000);
  });

  it("says plainly when bridge.json is missing or the port is taken", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vizroute-bridge-cli-"));
    writeFileSync(join(dir, "adapter.mjs"), nodeBridgeFiles(buildBridge(proposeDesign(sample("AccountService")), sample("AccountService")))[0].content);
    const missing = await run(["adapter.mjs"], dir);
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/bridge\.json not found at .*Keep adapter\.mjs and bridge\.json in the same folder/);

    writeFileSync(join(dir, "bridge.json"), "{\"nope\":true}");
    const wrong = await run(["adapter.mjs"], dir);
    expect(wrong.code).toBe(1);
    expect(wrong.out).toMatch(/not a bridge file/);

    const svc = sample("AccountService");
    nodeBridgeFiles(buildBridge(proposeDesign(svc), svc)).forEach((f) => writeFileSync(join(dir, f.path), f.content));
    // Bound the same way the adapter binds (all interfaces), so the port really is taken.
    const busy = createServer(() => {});
    const port = await new Promise((resolve) => busy.listen(0, () => resolve(busy.address().port)));
    const taken = await run(["adapter.mjs", "--port", port], dir);
    await close(busy);
    expect(taken.code).toBe(1);
    expect(taken.out).toMatch(new RegExp(`Port ${port} is already in use`));
  });
});
