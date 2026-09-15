import { describe, it, expect, beforeEach } from "vitest";
import { createWorkspace, addService, removeService, listWorkspaces, getWorkspace, loadServices, importWorkspace, exportWorkspace, MAX_SERVICES } from "../contractWorkspace";

// localStorage for the metadata; the payload store falls back to it too
// when IndexedDB is absent, which it is under Node.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};

const spec = (title) => ({ openapi: "3.0.0", info: { title }, paths: { "/a": { get: {} } } });

beforeEach(() => memory.clear());

describe("workspaces", () => {
  it("keeps every service when adds overlap", async () => {
    const ws = createWorkspace("u1", "Estate");
    // Ten adds started at once, as ten dropped files would be.
    await Promise.all(Array.from({ length: 10 }, (_, i) => addService("u1", ws.id, { name: `S${i}`, spec: spec(`S${i}`) })));
    expect(getWorkspace("u1", ws.id).services).toHaveLength(10);
    const loaded = await loadServices(getWorkspace("u1", ws.id));
    expect(loaded.every((s) => s.spec?.info?.title === s.name)).toBe(true);
  });

  it("keeps an add and a remove in order", async () => {
    const ws = createWorkspace("u1", "Estate");
    const a = await addService("u1", ws.id, { name: "A", spec: spec("A") });
    await Promise.all([removeService("u1", ws.id, a.id), addService("u1", ws.id, { name: "B", spec: spec("B") })]);
    expect(getWorkspace("u1", ws.id).services.map((s) => s.name)).toEqual(["B"]);
  });

  it("gives duplicate names a suffix and refuses junk", async () => {
    const ws = createWorkspace("u1", "Estate");
    await addService("u1", ws.id, { name: "Same", spec: spec("x") });
    await addService("u1", ws.id, { name: "same", spec: spec("y") });
    expect(getWorkspace("u1", ws.id).services.map((s) => s.name)).toEqual(["Same", "same (2)"]);
    await expect(addService("u1", ws.id, { name: "bad", spec: null })).rejects.toThrow(/not a specification/);
    await expect(addService("u1", "ws_nope", { name: "bad", spec: spec("z") })).rejects.toThrow(/no longer exists/);
  });

  it("caps a workspace", async () => {
    const ws = createWorkspace("u1", "Big");
    for (let i = 0; i < MAX_SERVICES; i++) await addService("u1", ws.id, { name: `S${i}`, spec: spec(`S${i}`) });
    await expect(addService("u1", ws.id, { name: "one more", spec: spec("m") })).rejects.toThrow(/up to 60/);
  });

  it("isolates users and survives corrupted storage", async () => {
    createWorkspace("u1", "Mine");
    expect(listWorkspaces("u2")).toEqual([]);
    expect(listWorkspaces(null)).toEqual([]);
    memory.set("vizroute_cg_workspaces:u1", "{corrupt");
    expect(listWorkspaces("u1")).toEqual([]);
    memory.set("vizroute_cg_workspaces:u1", JSON.stringify([null, 5, { noId: true }]));
    expect(listWorkspaces("u1")).toEqual([]);
  });

  it("round-trips through export and import, reporting what failed", async () => {
    const ws = createWorkspace("u1", "Estate");
    await addService("u1", ws.id, { name: "A", spec: spec("A") });
    const file = await exportWorkspace(getWorkspace("u1", ws.id));
    file.services.push({ name: "broken", spec: "nope" });
    const { workspace, failures } = await importWorkspace("u2", file);
    expect(workspace.name).toBe("Estate");
    expect(workspace.services.map((s) => s.name)).toEqual(["A"]);
    expect(failures).toHaveLength(1);
    await expect(importWorkspace("u2", { some: "thing" })).rejects.toThrow(/not a Contract Graph workspace/);
  });
});

describe("replacing a service", () => {
  it("keeps id, name and colour and swaps the document", async () => {
    const { replaceService } = await import("../contractWorkspace");
    const ws = createWorkspace("u1", "Estate");
    const a = await addService("u1", ws.id, { name: "Orders", spec: spec("Orders v1"), sourceUrl: "https://x.io/v1.json" });
    const before = getWorkspace("u1", ws.id).services[0];
    await replaceService("u1", ws.id, a.id, { spec: spec("Orders v2"), sourceUrl: "https://x.io/v2.json", format: "OpenAPI 3.0.0" });
    const after = getWorkspace("u1", ws.id).services[0];
    expect(after.id).toBe(before.id);
    expect(after.name).toBe("Orders");
    expect(after.color).toBe(before.color);
    expect(after.sourceUrl).toBe("https://x.io/v2.json");
    expect(after.replacedAt).toBeTruthy();
    const loaded = await loadServices(getWorkspace("u1", ws.id));
    expect(loaded[0].spec.info.title).toBe("Orders v2");
    expect(getWorkspace("u1", ws.id).services).toHaveLength(1);
  });
  it("refuses junk and unknown services", async () => {
    const { replaceService } = await import("../contractWorkspace");
    const ws = createWorkspace("u1", "Estate");
    const a = await addService("u1", ws.id, { name: "A", spec: spec("A") });
    await expect(replaceService("u1", ws.id, a.id, { spec: null })).rejects.toThrow(/not a specification/);
    await expect(replaceService("u1", ws.id, "svc_nope", { spec: spec("B") })).rejects.toThrow(/no longer exists/);
    const loaded = await loadServices(getWorkspace("u1", ws.id));
    expect(loaded[0].spec.info.title).toBe("A");
  });
});
