import { describe, it, expect } from "vitest";
import { buildContractGraph } from "../contractGraph";
import { SAMPLE_ESTATE } from "../contractSamples";
import { buildGraphSystemPrompt, createGraphToolRunner, describeGraphStep, GRAPH_TOOLS } from "../ai/graphAssistant";

const graph = buildContractGraph(SAMPLE_ESTATE.services.map((s, i) => ({ id: `svc_${i}`, name: s.name, spec: s.spec })));
const idOf = (name) => graph.services.find((s) => s.name === name).id;

describe("system prompt", () => {
  it("indexes every service by id with its facts, and the totals", () => {
    const { text, index } = buildGraphSystemPrompt(graph);
    graph.services.forEach((s) => {
      expect(text).toContain(`[[${s.id}]] ${s.name}`);
      expect(text).toContain(`${s.operations.length} operations`);
    });
    expect(text).toMatch(/consumer collection/);
    expect(text).toMatch(/Totals: 5 services/);
    expect(index.services).toBe(5);
    expect(index.tokens).toBeGreaterThan(50);
    // the rules forbid invention and require chips
    expect(text).toMatch(/Never invent/);
    expect(text).toMatch(/double brackets/);
  });
  it("declares every tool the runner handles", () => {
    const names = GRAPH_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(["get_entity", "get_service", "highlight_services", "impact_of", "list_concepts", "list_duplicates", "list_findings", "open_tab"]);
    names.forEach((n) => expect(describeGraphStep(n, { id: "x", name: "y", tab: "map", ids: [] })).not.toBe(n));
  });
});

describe("tool runner", () => {
  const calls = [];
  const run = createGraphToolRunner({ graph, actions: { highlightServices: (ids, reason) => calls.push(["highlight", ids, reason]), openTab: (t) => calls.push(["tab", t]) } });

  it("reads a service in full, with chip ids for its relationships", () => {
    const out = run("get_service", { id: `[[${idOf("Customers")}]]` });
    expect(out).toContain('"name": "Customers"');
    expect(out).toContain("GET https://customers.northwind.example/api/v1/customers/{id}");
    expect(out).toContain("Address");
    expect(out).toMatch(/\[\[svc_\d\]\] references this/);
    expect(run("get_service", { id: "svc_nope" })).toMatch(/No service with id/);
  });

  it("compares a shared entity and lists the others when the name is wrong", () => {
    const out = run("get_entity", { name: "address" });
    expect(out).toContain('"consistent": false');
    expect(out).toContain("onlyInFirst");
    expect(out).toContain("postalCode");
    expect(run("get_entity", { name: "Nothing" })).toMatch(/Shared entities: /);
  });

  it("lists duplicates, concepts and findings with evidence and chips", () => {
    expect(run("list_duplicates", {})).toMatch(/duplicate \(\d+%\) GET \/customer\/\{\}: \[\[svc_\d\]\]/);
    const concepts = run("list_concepts", {});
    expect(concepts).toMatch(/customerId|customerRef|customer_id/);
    expect(concepts).toMatch(/identifier/);
    const one = run("list_concepts", { name: "customerRef" });
    expect(one).toContain('"key": "customer#identifier"');
    expect(run("list_concepts", { name: "zzz" })).toMatch(/No shared concept/);
    const high = run("list_findings", { severity: "high" });
    expect(high).toMatch(/\(high\) consistency: Address has 2 different shapes/);
    expect(run("list_findings", { category: "nowhere" })).toBe("No findings match.");
  });

  it("explains impact per dependent", () => {
    const out = run("impact_of", { id: idOf("Customers") });
    expect(out).toMatch(/\d service(s)? depend on/);
    expect(out).toContain(`[[${idOf("Orders")}]]`);
    expect(run("impact_of", { id: idOf("Mobile BFF (collection)") })).toMatch(/Nothing in the graph depends/);
  });

  it("drives the page only with ids that exist and tabs that exist", () => {
    calls.length = 0;
    expect(run("highlight_services", { ids: [`[[${idOf("Orders")}]]`, "svc_nope"], reason: "callers" })).toContain("Highlighted Orders");
    expect(calls[0]).toEqual(["highlight", [idOf("Orders")], "callers"]);
    expect(run("highlight_services", { ids: ["svc_nope"] })).toMatch(/nothing was highlighted/);
    expect(run("open_tab", { tab: "Findings" })).toBe("Opened the findings tab.");
    expect(calls.at(-1)).toEqual(["tab", "findings"]);
    expect(run("open_tab", { tab: "settings" })).toMatch(/Unknown tab/);
    expect(run("nope", {})).toMatch(/Unknown tool/);
  });

  it("copes with an empty graph", () => {
    const empty = createGraphToolRunner({ graph: buildContractGraph([]) });
    expect(empty("list_duplicates", {})).toMatch(/No endpoint/);
    expect(empty("list_concepts", {})).toMatch(/No field/);
    expect(empty("get_entity", { name: "X" })).toMatch(/No entity/);
    expect(buildGraphSystemPrompt(buildContractGraph([])).text).toMatch(/Totals: 0 services/);
  });
});
