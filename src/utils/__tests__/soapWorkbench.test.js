import { describe, it, expect, beforeEach } from "vitest";
import {
  addWsdl, listProgramme, getProgrammeService, attachDocument, removeAttachment, removeProgrammeService, renameProgrammeService,
  setOverride, setStatus, setStatuses, setOptions, setTraffic, parseTrafficText, loadDocuments, coverageOf, exportProgramme, importProgramme, updateSummary, MAX_SERVICES,
} from "../soap/workbench";
import { SAMPLE_PROGRAMME, SAMPLE_WSDL, SAMPLE_XSD } from "../soap/samples";

// localStorage for the record; the payload store falls back to it under Node.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};
beforeEach(() => memory.clear());

const account = SAMPLE_PROGRAMME.services[0];
const summary = { operations: Object.keys(account.traffic), warnings: 0, version: "1.1" };

describe("programme storage — positive", () => {
  it("adds a WSDL with attachments and reads the documents back", async () => {
    const svc = await addWsdl("u1", { name: "AccountService", wsdl: account.wsdl, attachments: account.attachments, summary, traffic: account.traffic });
    expect(svc).toMatchObject({ name: "AccountService", attachmentNames: ["Account.xsd"], wsdlVersion: "1.1", warnings: 0 });
    expect(svc.operations).toHaveLength(8);
    expect(svc.traffic.GetAccountBalance).toBe(412000);
    expect(listProgramme("u1").map((s) => s.id)).toEqual([svc.id]);
    const docs = await loadDocuments(svc.id);
    expect(docs.wsdl).toBe(account.wsdl);
    expect(docs.attachments["Account.xsd"]).toBe(SAMPLE_XSD);
    expect(getProgrammeService("u1", svc.id).options).toEqual({ propertyCase: "camel", basePath: "/v1" });
  });

  it("attaches and removes schemas, renames, and keeps parallel adds", async () => {
    const svc = await addWsdl("u1", { name: "Accounts", wsdl: SAMPLE_WSDL, summary });
    await attachDocument("u1", svc.id, "Account.xsd", SAMPLE_XSD);
    expect(getProgrammeService("u1", svc.id).attachmentNames).toEqual(["Account.xsd"]);
    await attachDocument("u1", svc.id, "Account.xsd", `${SAMPLE_XSD}<!-- v2 -->`);
    expect((await loadDocuments(svc.id)).attachments["Account.xsd"]).toContain("v2");
    await removeAttachment("u1", svc.id, "Account.xsd");
    expect(getProgrammeService("u1", svc.id).attachmentNames).toEqual([]);
    expect(renameProgrammeService("u1", svc.id, "  Current accounts  ").name).toBe("Current accounts");
    expect(renameProgrammeService("u1", svc.id, "").name).toBe("Current accounts");
    await Promise.all(Array.from({ length: 6 }, (_, i) => addWsdl("u1", { name: `S${i}`, wsdl: SAMPLE_WSDL, summary })));
    expect(listProgramme("u1")).toHaveLength(7);
    expect(updateSummary("u1", svc.id, { operations: ["A", "B"], warnings: 2 }).operations).toEqual(["A", "B"]);
  });

  it("keeps reviewer decisions, statuses, options and traffic", async () => {
    const svc = await addWsdl("u1", { name: "Accounts", wsdl: SAMPLE_WSDL, summary });
    setOverride("u1", svc.id, "GetAccountBalance", { method: "get", path: " /accounts/{accountId}/balances ", summary: "Balance", notes: "ok", junk: 1 });
    expect(getProgrammeService("u1", svc.id).overrides.GetAccountBalance).toEqual({ method: "GET", path: "/accounts/{accountId}/balances", summary: "Balance", notes: "ok" });
    setOverride("u1", svc.id, "GetAccountBalance", {});
    expect(getProgrammeService("u1", svc.id).overrides.GetAccountBalance).toBeUndefined();
    setStatus("u1", svc.id, "GetAccountBalance", "approved");
    setStatuses("u1", svc.id, { OpenAccount: "migrated", CloseAccount: "bogus" });
    expect(getProgrammeService("u1", svc.id).statuses).toEqual({ GetAccountBalance: "approved", OpenAccount: "migrated" });
    setOptions("u1", svc.id, { propertyCase: "snake", basePath: "/api/v2", other: true });
    expect(getProgrammeService("u1", svc.id).options).toEqual({ propertyCase: "snake", basePath: "/api/v2" });
    setOptions("u1", svc.id, { propertyCase: "shouting" });
    expect(getProgrammeService("u1", svc.id).options.propertyCase).toBe("snake");
    setTraffic("u1", svc.id, { GetAccountBalance: "1200", OpenAccount: -5, Nope: "x" });
    expect(getProgrammeService("u1", svc.id).traffic).toEqual({ GetAccountBalance: 1200 });
  });

  it("parses pasted traffic in several shapes", () => {
    const known = ["GetAccountBalance", "OpenAccount", "CloseAccount"];
    const parsed = parseTrafficText(`operation,calls\nGetAccountBalance,412000\n"OpenAccount";1,200\ncloseaccount\t300\nUnknownOp 5\nbad line\nOpenAccount,x`, known);
    expect(parsed.traffic).toEqual({ GetAccountBalance: 412000, OpenAccount: 1200, CloseAccount: 300 });
    expect(parsed.unknown).toEqual(["UnknownOp"]);
    expect(parsed.bad).toEqual([expect.stringMatching(/Line 6/), expect.stringMatching(/Line 7: "x"/)]);
    expect(parseTrafficText("", known)).toEqual({ traffic: {}, unknown: [], bad: [] });
    expect(parseTrafficText("A 10\nA 5").traffic).toEqual({ A: 15 });
  });

  it("computes coverage by operation and by traffic, with the Pareto slice", () => {
    const services = [
      { id: "a", name: "A", operations: ["Get", "Open", "Close", "Transfer"], statuses: { Get: "migrated", Open: "skipped", Close: "reviewed" }, traffic: { Get: 800, Open: 50, Close: 50, Transfer: 100 } },
      { id: "b", name: "B", operations: ["Ping", "Pong"], statuses: {}, traffic: {} },
    ];
    const c = coverageOf(services);
    expect(c).toMatchObject({ services: 2, operations: 6, done: 2, traffic: 1000, trafficDone: 850, hasTraffic: true });
    expect(c.share).toBeCloseTo(2 / 6);
    expect(c.trafficShare).toBeCloseTo(0.85);
    expect(c.byStatus).toEqual({ proposed: 3, reviewed: 1, approved: 0, migrated: 1, skipped: 1 });
    expect(c.perService[0]).toMatchObject({ name: "A", operations: 4, done: 2, share: 0.5, trafficShare: 0.85 });
    expect(c.perService[1]).toMatchObject({ name: "B", operations: 2, done: 0, share: 0, traffic: 0, trafficShare: 0 });
    expect(c.pareto).toBe(1); // "Get" alone carries 80 %
    expect(c.queue.slice(0, 3).map((q) => `${q.operation}:${q.calls}:${q.done}`)).toEqual(["Transfer:100:false", "Close:50:false", "Ping:0:false"]);
    expect(c.queue[0].trafficShare).toBeCloseTo(0.1);
    expect(c.queue.at(-1).cumulativeShare).toBeCloseTo(1);
    expect(coverageOf([])).toMatchObject({ services: 0, operations: 0, share: 0, trafficShare: 0, pareto: 0, hasTraffic: false, queue: [] });
  });

  it("exports the programme and imports it into another account", async () => {
    const svc = await addWsdl("u1", { name: "Accounts", wsdl: account.wsdl, attachments: account.attachments, summary, traffic: account.traffic });
    setOverride("u1", svc.id, "GetAccountBalance", { path: "/balances/{accountId}" });
    setStatus("u1", svc.id, "OpenAccount", "approved");
    setOptions("u1", svc.id, { propertyCase: "keep" });
    const file = await exportProgramme("u1");
    expect(file.vizroute).toBe("soap-migration-programme");
    expect(file.services[0]).toMatchObject({ name: "Accounts", overrides: { GetAccountBalance: { path: "/balances/{accountId}" } }, statuses: { OpenAccount: "approved" }, options: { propertyCase: "keep", basePath: "/v1" } });
    expect(file.services[0].attachments["Account.xsd"]).toBe(SAMPLE_XSD);
    const { added, failures } = await importProgramme("u2", file);
    expect(failures).toEqual([]);
    expect(added[0]).toMatchObject({ name: "Accounts", overrides: { GetAccountBalance: { path: "/balances/{accountId}" } }, statuses: { OpenAccount: "approved" }, traffic: account.traffic });
    expect(listProgramme("u1")).toHaveLength(1);
    expect((await loadDocuments(added[0].id)).wsdl).toBe(account.wsdl);
  });
});

describe("programme storage — negative", () => {
  it("refuses empty documents, unknown services and bad statuses", async () => {
    await expect(addWsdl("u1", { name: "x", wsdl: "" })).rejects.toThrow(/empty/);
    await expect(addWsdl("u1", { name: "x", wsdl: 42 })).rejects.toThrow(/empty/);
    await expect(attachDocument("u1", "wsdl_nope", "a.xsd", SAMPLE_XSD)).rejects.toThrow(/no longer exists/);
    const svc = await addWsdl("u1", { name: "x", wsdl: SAMPLE_WSDL });
    await expect(attachDocument("u1", svc.id, "a.xsd", "   ")).rejects.toThrow(/empty/);
    expect(() => setStatus("u1", svc.id, "Op", "done")).toThrow(/not a migration status/);
    expect(setStatus("u1", "wsdl_nope", "Op", "approved")).toBeNull();
    expect(setOverride("u1", svc.id, "", { path: "/x" })).toBeNull();
    expect(setTraffic("u1", "wsdl_nope", {})).toBeNull();
    expect(await removeProgrammeService("u1", "wsdl_nope")).toBe(false);
    expect(await removeProgrammeService("u1", svc.id)).toBe(true);
    expect(listProgramme("u1")).toEqual([]);
    expect((await loadDocuments(svc.id)).wsdl).toBe("");
  });

  it("gives duplicate names a suffix and isolates users", async () => {
    await addWsdl("u1", { name: "Same", wsdl: SAMPLE_WSDL });
    await addWsdl("u1", { name: "same", wsdl: SAMPLE_WSDL });
    expect(listProgramme("u1").map((s) => s.name).sort()).toEqual(["Same", "same (2)"]);
    expect(listProgramme("u2")).toEqual([]);
    expect(listProgramme(null)).toEqual([]);
  });

  it("survives corrupted storage", async () => {
    memory.set("vizroute_soap_programme:u1", "{corrupt");
    expect(listProgramme("u1")).toEqual([]);
    memory.set("vizroute_soap_programme:u1", JSON.stringify([null, 3, { id: 7 }, { id: "ok", name: "Ok", operations: [] }]));
    expect(listProgramme("u1").map((s) => s.id)).toEqual(["ok"]);
    const svc = await addWsdl("u1", { name: "New", wsdl: SAMPLE_WSDL });
    expect(listProgramme("u1").map((s) => s.id)).toEqual(expect.arrayContaining(["ok", svc.id]));
  });

  it("caps the programme and the attachments", async () => {
    for (let i = 0; i < 5; i++) await addWsdl("cap", { name: `S${i}`, wsdl: "<definitions/>" });
    const list = JSON.parse(memory.get("vizroute_soap_programme:cap"));
    // Fill the record directly rather than storing 300 documents.
    memory.set("vizroute_soap_programme:cap", JSON.stringify([...list, ...Array.from({ length: MAX_SERVICES - 5 }, (_, i) => ({ id: `wsdl_fake${i}`, name: `F${i}`, operations: [] }))]));
    await expect(addWsdl("cap", { name: "one more", wsdl: "<definitions/>" })).rejects.toThrow(/up to 300/);
  });

  it("refuses a file that is not a programme export and reports partial failures", async () => {
    await expect(importProgramme("u1", { vizroute: "contract-graph-workspace", services: [] })).rejects.toThrow(/not a SOAP Migration Workbench programme/);
    await expect(importProgramme("u1", null)).rejects.toThrow(/not a SOAP/);
    const { added, failures } = await importProgramme("u1", { vizroute: "soap-migration-programme", services: [{ name: "Good", wsdl: SAMPLE_WSDL }, { name: "Bad", wsdl: "" }, null] });
    expect(added.map((s) => s.name)).toEqual(["Good"]);
    expect(failures).toEqual([expect.stringMatching(/^Bad: .*empty/), expect.stringMatching(/^unnamed: /)]);
  });
});
