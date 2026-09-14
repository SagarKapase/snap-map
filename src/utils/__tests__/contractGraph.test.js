import { describe, it, expect } from "vitest";
import {
  buildContractGraph,
  normalizeService,
  pathShape,
  singular,
  tokenize,
  compareFields,
  impactOf,
  toMermaid,
} from "../contractGraph";

// ─── Fixtures: a small retail estate ─────────

const customers = {
  openapi: "3.0.0",
  info: { title: "Customers", version: "1.0" },
  servers: [{ url: "https://customers.internal/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Customer: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "string", example: "cus_8f2a91" },
          email: { type: "string", format: "email" },
          address: { $ref: "#/components/schemas/Address" },
        },
      },
      Address: {
        type: "object",
        properties: { street: { type: "string" }, city: { type: "string" }, postcode: { type: "string" } },
      },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/customers/{id}": {
      get: { operationId: "getCustomer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } } } },
    },
    "/customers": {
      get: { operationId: "listCustomers", responses: { 200: { content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Customer" } } } } } } },
    },
  },
};

const orders = {
  openapi: "3.0.0",
  info: { title: "Orders", version: "2.0" },
  servers: [{ url: "https://orders.internal" }],
  components: {
    schemas: {
      Order: {
        type: "object",
        required: ["id", "customerId"],
        properties: {
          id: { type: "string" },
          customerId: { type: "string", example: "cus_8f2a91" },
          total: { type: "number" },
          shippingAddress: { $ref: "#/components/schemas/Address" },
        },
      },
      // The same entity name as Customers' Address, with a different shape.
      Address: {
        type: "object",
        properties: { line1: { type: "string" }, line2: { type: "string" }, town: { type: "string" }, postalCode: { type: "integer" } },
      },
    },
  },
  paths: {
    "/v2/orders/{orderId}": {
      get: { operationId: "getOrder", parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } } } },
    },
    // A second way to read customers, duplicating Customers' endpoint.
    "/v2/customers/{custId}": {
      get: { operationId: "getCustomerProfile", parameters: [{ name: "custId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { content: { "application/json": { example: { id: "cus_1", email: "a@b.c", address: {} } } } } } },
    },
  },
};

const shipping = {
  openapi: "3.0.0",
  info: { title: "Shipping", version: "1.0" },
  servers: [{ url: "https://shipping.internal" }],
  components: {
    schemas: {
      Shipment: {
        type: "object",
        properties: { id: { type: "string" }, orderRef: { type: "string" }, customer_id: { type: "string" }, status: { type: "string", enum: ["PENDING", "SHIPPED"] } },
      },
    },
  },
  paths: {
    "/shipments/{id}": { get: { operationId: "getShipment", responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Shipment" } } } } } } },
  },
};

// A consumer: the mobile app's collection, calling Orders and Customers.
const mobile = {
  info: { name: "Mobile BFF", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  variable: [{ key: "baseUrl", value: "https://orders.internal" }],
  item: [
    { name: "Get order", request: { method: "GET", url: "{{baseUrl}}/v2/orders/:orderId" } },
    { name: "Get customer", request: { method: "GET", url: "https://customers.internal/api/v1/customers/:id" } },
    { name: "Unknown thing", request: { method: "GET", url: "{{other}}/things/:id" } },
  ],
};

const build = () =>
  buildContractGraph([
    { id: "customers", name: "Customers", spec: customers },
    { id: "orders", name: "Orders", spec: orders },
    { id: "shipping", name: "Shipping", spec: shipping },
    { id: "mobile", name: "Mobile BFF", spec: mobile },
  ]);

// ─── Positive ────────────────────────────────

describe("path shapes and names", () => {
  it("normalises version prefixes, parameters, plurals and template hosts", () => {
    expect(pathShape("/v2/orders/{orderId}")).toBe("/order/{}");
    expect(pathShape("{{baseUrl}}/v2/orders/:orderId")).toBe("/order/{}");
    expect(pathShape("https://orders.internal/v2/orders/12", ["https://orders.internal"])).toBe("/order/12");
    expect(pathShape("/api/v1/customers/{id}/addresses")).toBe("/customer/{}/address");
    expect(pathShape("/Customer-Profiles")).toBe("/customer-profile");
  });
  it("singularises conservatively", () => {
    expect(singular("orders")).toBe("order");
    expect(singular("addresses")).toBe("address");
    expect(singular("categories")).toBe("category");
    expect(singular("status")).toBe("status");
    expect(singular("bus")).toBe("bus");
    expect(singular("ids")).toBe("ids");
  });
  it("tokenises every casing the same way", () => {
    expect(tokenize("customerId")).toBe("customer id");
    expect(tokenize("customer_id")).toBe("customer id");
    expect(tokenize("CustomerID")).toBe("customer id");
    expect(tokenize("customer-id")).toBe("customer id");
  });
});

describe("normalizeService", () => {
  it("reads operations, entities and servers from OpenAPI", () => {
    const svc = normalizeService({ id: "c", spec: customers });
    expect(svc.name).toBe("Customers");
    expect(svc.servers).toEqual(["https://customers.internal/api/v1"]);
    expect(svc.operations.map((o) => o.shape).sort()).toEqual(["/customer", "/customer/{}"]);
    expect(svc.entities.map((e) => e.name).sort()).toEqual(["Address", "Customer"]);
    expect(svc.entities.find((e) => e.name === "Customer").fields.map((f) => f.name)).toEqual(["id", "email", "address"]);
    expect(svc.entities.every((e) => e.inferred === false)).toBe(true);
    expect(svc.operations[0].auth).toEqual(["http"]);
  });
  it("infers entities from response examples when nothing is declared, and marks them", () => {
    const svc = normalizeService({ id: "o", spec: orders });
    const profile = svc.operations.find((o) => o.name === "getCustomerProfile");
    expect(profile.responseFields.map((f) => f.name)).toEqual(["id", "email", "address"]);
    const collection = normalizeService({ id: "m", spec: mobile });
    expect(collection.isCollection).toBe(true);
    expect(collection.entities).toEqual([]);
  });
});

describe("buildContractGraph on the retail estate", () => {
  const graph = build();

  it("finds the entity two services expose with different shapes", () => {
    const address = graph.entities.find((e) => e.key === "address");
    expect(address).toBeTruthy();
    expect(address.services.sort()).toEqual(["customers", "orders"]);
    expect(address.consistent).toBe(false);
    expect(address.shapes).toBe(2);
    const cmp = address.comparisons[0];
    expect(cmp.onlyLeft).toEqual(["street", "city", "postcode"]);
    expect(cmp.onlyRight).toEqual(["line1", "line2", "town", "postalCode"]);
  });

  it("flags the duplicated customer endpoint across Customers and Orders", () => {
    const dup = graph.duplicateEndpoints.find((d) => d.shape === "/customer/{}" && d.method === "GET");
    expect(dup).toBeTruthy();
    expect(dup.kind).toBe("duplicate");
    expect(dup.operations.map((o) => o.serviceId).sort()).toEqual(["customers", "orders"]);
    expect(dup.score).toBeGreaterThanOrEqual(0.7);
    expect(dup.evidence[0]).toMatch(/Same method and path shape/);
  });

  it("draws call edges from the collection to the services it targets", () => {
    const calls = graph.edges.filter((e) => e.kind === "calls" && e.from === "mobile");
    expect(calls.map((e) => e.to).sort()).toEqual(["customers", "orders"]);
    const toCustomers = calls.find((e) => e.to === "customers");
    expect(toCustomers.confidence).toBe(0.95); // matched on the real host
    const toOrders = calls.find((e) => e.to === "orders");
    expect(toOrders.confidence).toBe(0.6); // host was {{baseUrl}}, matched by shape
    // "{{other}}/things/:id" matches nothing and produces no edge
    expect(graph.edges.some((e) => e.evidence.some((t) => t.includes("things")))).toBe(false);
  });

  it("draws reference edges from id-like fields to the owning service", () => {
    const refs = graph.edges.filter((e) => e.kind === "references");
    expect(refs.find((e) => e.from === "orders" && e.to === "customers")).toBeTruthy();
    expect(refs.find((e) => e.from === "shipping" && e.to === "orders")).toBeTruthy();
    expect(refs.find((e) => e.from === "shipping" && e.to === "customers")).toBeTruthy();
    // a collection owns nothing, so nothing references it
    expect(refs.some((e) => e.to === "mobile")).toBe(false);
  });

  it("joins every spelling of the customer identifier into one concept with evidence", () => {
    const concept = graph.concepts.find((c) => c.key === "customer#identifier");
    expect(concept).toBeTruthy();
    // customerId (Orders), customer_id (Shipping), id on Customer and {id} on
    // /customers/{id} (Customers), and {custId} on Orders' /customers/{custId}
    expect(concept.names.sort()).toEqual(["custId", "customerId", "customer_id", "id"]);
    expect(concept.services.sort()).toEqual(["customers", "mobile", "orders", "shipping"]);
    expect(concept.divergentNames).toBe(true);
    expect(concept.confidence).toBeGreaterThanOrEqual(0.7);
    expect(concept.rule).toMatch(/identifier/);
    const custId = concept.members.find((m) => m.name === "custId");
    expect(custId.rule).toBe("identifier of its resource");
  });

  it("does not join generic names across different entities, nor guess synonyms", () => {
    // Order.id and Shipment.id are different identifiers
    const orderId = graph.concepts.find((c) => c.key === "order#identifier");
    expect(orderId.members.some((m) => m.on === "Shipment" && m.name === "id")).toBe(false);
    expect(orderId.members.some((m) => m.name === "orderRef")).toBe(true);
    // "status" appears only in Shipping here; "total" only in Orders
    expect(graph.concepts.find((c) => c.key.endsWith("status"))).toBeUndefined();
    expect(graph.concepts.find((c) => c.key.endsWith("total"))).toBeUndefined();
  });

  it("produces ordered findings with services attached", () => {
    const titles = graph.findings.map((f) => f.title);
    expect(titles.some((t) => /Address has 2 different shapes/.test(t))).toBe(true);
    expect(titles.some((t) => /Duplicate endpoint: GET \/customer\/\{\}/.test(t))).toBe(true);
    expect(titles.some((t) => /One concept, 3 names/.test(t))).toBe(true);
    expect(titles.some((t) => /Orders declares no authentication/.test(t))).toBe(true);
    expect(titles.some((t) => /Customers declares no authentication/.test(t))).toBe(false);
    const severities = graph.findings.map((f) => f.severity);
    const firstInfo = severities.indexOf("info");
    const lastHigh = severities.lastIndexOf("high");
    expect(firstInfo === -1 || lastHigh < firstInfo).toBe(true);
    graph.findings.forEach((f) => expect(f.services.length).toBeGreaterThan(0));
  });

  it("computes impact along call and reference edges only", () => {
    expect(impactOf(graph, "customers").sort()).toEqual(["mobile", "orders", "shipping"]);
    expect(impactOf(graph, "orders").sort()).toEqual(["mobile", "shipping"]);
    expect(impactOf(graph, "mobile")).toEqual([]);
  });

  it("exports a Mermaid diagram with every service and edge", () => {
    const mermaid = toMermaid(graph);
    expect(mermaid.startsWith("flowchart LR")).toBe(true);
    graph.services.forEach((s) => expect(mermaid).toContain(`${s.id}["${s.name}"]`));
    expect(mermaid).toMatch(/mobile -->\|calls\| orders/);
  });

  it("reports honest stats", () => {
    expect(graph.stats.services).toBe(4);
    expect(graph.stats.operations).toBe(8);
    expect(graph.stats.inconsistentEntities).toBe(1);
    expect(graph.errors).toEqual([]);
  });
});

describe("compareFields", () => {
  it("reports type and required conflicts on shared fields", () => {
    const cmp = compareFields(
      [{ name: "id", type: "string", required: true }, { name: "qty", type: "integer", required: false }],
      [{ name: "id", type: "integer", required: false }, { name: "qty", type: "integer", required: false }],
    );
    expect(cmp.typeConflicts).toEqual([{ name: "id", left: "string", right: "integer" }]);
    expect(cmp.requiredConflicts).toEqual([{ name: "id", left: true, right: false }]);
    expect(cmp.consistent).toBe(false);
    expect(cmp.similarity).toBe(1);
  });
  it("treats unknown types as compatible with anything", () => {
    const cmp = compareFields([{ name: "x", type: "unknown" }], [{ name: "x", type: "string" }]);
    expect(cmp.consistent).toBe(true);
  });
});

// ─── Negative ────────────────────────────────

describe("hostile and empty input", () => {
  it("returns an empty graph for no services", () => {
    const g = buildContractGraph([]);
    expect(g.services).toEqual([]);
    expect(g.findings).toEqual([]);
    expect(g.stats.services).toBe(0);
    expect(buildContractGraph(undefined).services).toEqual([]);
    expect(buildContractGraph("nope").services).toEqual([]);
  });

  it("reports an unreadable service in errors and keeps the rest", () => {
    const g = buildContractGraph([
      { id: "ok", name: "OK", spec: customers },
      { id: "bad", name: "Bad", spec: null },
      { id: "worse", name: "Worse", spec: "just a string" },
    ]);
    expect(g.services.map((s) => s.id)).toEqual(["ok"]);
    expect(g.errors.map((e) => e.id).sort()).toEqual(["bad", "worse"]);
    expect(g.errors[0].message).toMatch(/specification/);
  });

  it("rejects duplicate service ids instead of merging them", () => {
    const g = buildContractGraph([
      { id: "same", spec: customers },
      { id: "same", spec: orders },
    ]);
    expect(g.services).toHaveLength(1);
    expect(g.errors[0].message).toMatch(/Duplicate service id/);
  });

  it("copes with a document that has nothing in it", () => {
    const g = buildContractGraph([{ id: "empty", spec: {} }, { id: "nopaths", spec: { openapi: "3.0.0", info: null, paths: null } }]);
    expect(g.errors).toEqual([]);
    expect(g.services).toHaveLength(2);
    expect(g.stats.operations).toBe(0);
    expect(g.edges).toEqual([]);
  });

  it("copes with junk inside an otherwise valid document", () => {
    const junk = {
      openapi: "3.0.0",
      components: { schemas: { A: null, B: "str", C: { properties: null }, D: { type: "object", properties: { self: { $ref: "#/components/schemas/D" } } } } },
      paths: { "/a": null, "/b": { get: null, post: { responses: "no", parameters: "no", tags: 5 } }, "/c/{}": { get: { responses: { 200: { content: { "application/json": { schema: { $ref: "#/nope" } } } } } } } },
    };
    const g = buildContractGraph([{ id: "junk", spec: junk }, { id: "c", spec: customers }]);
    expect(g.errors).toEqual([]);
    expect(g.services).toHaveLength(2);
  });

  it("finds nothing shared for a single service, and says so", () => {
    const g = buildContractGraph([{ id: "only", spec: orders }]);
    expect(g.entities).toEqual([]);
    expect(g.duplicateEndpoints).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.concepts).toEqual([]);
    // no "island" finding when there is nothing to be an island from
    expect(g.findings.some((f) => f.category === "structure")).toBe(false);
  });

  it("does not report duplicates within one service or across methods", () => {
    const twoWays = {
      openapi: "3.0.0",
      paths: { "/pets/{id}": { get: {}, delete: {} }, "/pet/{petId}": { get: {} } },
    };
    const g = buildContractGraph([{ id: "a", spec: twoWays }, { id: "b", spec: { openapi: "3.0.0", paths: { "/pets/{id}": { post: {} } } } }]);
    expect(g.duplicateEndpoints).toEqual([]);
  });

  it("does not draw a call edge when the path shape is ambiguous across services", () => {
    const one = { openapi: "3.0.0", servers: [{ url: "https://one.io" }], paths: { "/items/{id}": { get: {} } } };
    const two = { openapi: "3.0.0", servers: [{ url: "https://two.io" }], paths: { "/items/{id}": { get: {} } } };
    const consumer = { info: { name: "c" }, item: [{ name: "x", request: { method: "GET", url: "{{host}}/items/:id" } }] };
    const g = buildContractGraph([{ id: "one", spec: one }, { id: "two", spec: two }, { id: "c", spec: consumer }]);
    expect(g.edges.filter((e) => e.kind === "calls")).toEqual([]);
  });

  it("does not turn a bare {{baseUrl}} or root path into an endpoint match", () => {
    const svc = { openapi: "3.0.0", paths: { "/": { get: {} } } };
    const consumer = { info: { name: "c" }, item: [{ name: "root", request: { method: "GET", url: "{{baseUrl}}" } }] };
    const g = buildContractGraph([{ id: "s", spec: svc }, { id: "c", spec: consumer }]);
    expect(g.edges).toEqual([]);
    expect(g.duplicateEndpoints).toEqual([]);
  });

  it("survives unicode, prototype keys and very long names", () => {
    const weird = {
      openapi: "3.0.0",
      info: { title: "日本語 🚀" },
      components: { schemas: { __proto__: { type: "object", properties: { constructor: { type: "string" } } }, ["x".repeat(500)]: { type: "object", properties: { a: { type: "string" } } } } },
      paths: { "/ünïcode/{id}": { get: { tags: ["__proto__"], responses: { 200: { content: { "application/json": { example: { __proto__: 1, toString: "s" } } } } } } } },
    };
    const g = buildContractGraph([{ id: "w", spec: JSON.parse(JSON.stringify(weird)) }, { id: "c", spec: customers }]);
    expect(g.errors).toEqual([]);
    expect(g.services[0].name).toBe("日本語 🚀");
  });

  it("stays fast on a large estate", () => {
    const big = (n, prefix) => ({
      openapi: "3.0.0",
      servers: [{ url: `https://${prefix}.io` }],
      components: { schemas: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`${prefix}Entity${i}`, { type: "object", properties: { id: { type: "string" }, [`${prefix}${i}Id`]: { type: "string" }, name: { type: "string" } } }])) },
      paths: Object.fromEntries(Array.from({ length: n }, (_, i) => [`/${prefix}-things-${i}/{id}`, { get: { responses: { 200: { content: { "application/json": { schema: { $ref: `#/components/schemas/${prefix}Entity${i % 50}` } } } } } }, post: {} }])),
    });
    const inputs = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, spec: big(150, `svc${i}`) }));
    const started = Date.now();
    const g = buildContractGraph(inputs);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(g.stats.operations).toBe(8 * 300);
  });
});

describe("consumers are not producers", () => {
  it("does not report a collection's request as a duplicate of the endpoint it calls", () => {
    const g = build();
    expect(g.duplicateEndpoints.every((d) => d.operations.every((o) => o.serviceId !== "mobile"))).toBe(true);
    expect(g.duplicateEndpoints.filter((d) => d.shape === "/customer/{}")).toHaveLength(1);
  });
});
