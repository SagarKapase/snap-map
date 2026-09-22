import { describe, it, expect } from "vitest";
import { parseWsdl, typeKey } from "../soap/wsdl";
import { createSchemaBuilder } from "../soap/jsonSchema";
import { proposeDesign, statusForFault, plural, MIGRATION_STATUSES, templateParams } from "../soap/design";
import { buildOpenApi, openApiToYaml, openApiToJson, proposedServerUrl } from "../soap/openapi";
import { parseOpenApi, detectFormat } from "../parsers";
import { normalizeService, buildContractGraph } from "../contractGraph";
import { parseSpecText } from "../readSpec";
import { SAMPLE_PROGRAMME, SAMPLE_WSDL, SAMPLE_XSD } from "../soap/samples";

const sample = (name) => {
  const s = SAMPLE_PROGRAMME.services.find((x) => x.name === name);
  return parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
};

/** A WSDL with document/literal wrapped operations built from `[name, inputFields, outputFields, faults]`. */
const wsdlWith = (operations, { tns = "urn:t" } = {}) => {
  const el = (name, fields) => `<xs:element name="${name}"><xs:complexType><xs:sequence>${fields.map((f) => (typeof f === "string" ? `<xs:element name="${f}" type="xs:string"/>` : `<xs:element name="${f.name}" type="${f.type || "xs:string"}"${f.optional ? ' minOccurs="0"' : ""}${f.many ? ' maxOccurs="unbounded"' : ""}/>`)).join("")}</xs:sequence></xs:complexType></xs:element>`;
  return `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="${tns}" targetNamespace="${tns}">
    <types><xs:schema targetNamespace="${tns}" elementFormDefault="qualified">
      <xs:complexType name="Item"><xs:sequence><xs:element name="Id" type="xs:string"/><xs:element name="Label" type="xs:string"/></xs:sequence></xs:complexType>
      ${operations.map(([name, input, output, faults = []]) => `${el(name, input)}${output ? el(`${name}Response`, output) : ""}${faults.map((f) => `<xs:element name="${f}"><xs:complexType><xs:sequence><xs:element name="Message" type="xs:string"/></xs:sequence></xs:complexType></xs:element>`).join("")}`).join("")}
    </xs:schema></types>
    ${operations.map(([name, , output, faults = []]) => `<message name="${name}In"><part name="p" element="tns:${name}"/></message>${output ? `<message name="${name}Out"><part name="p" element="tns:${name}Response"/></message>` : ""}${faults.map((f) => `<message name="${f}"><part name="d" element="tns:${f}"/></message>`).join("")}`).join("")}
    <portType name="P">${operations.map(([name, , output, faults = []]) => `<operation name="${name}"><input message="tns:${name}In"/>${output ? `<output message="tns:${name}Out"/>` : ""}${faults.map((f) => `<fault name="${f}" message="tns:${f}"/>`).join("")}</operation>`).join("")}</portType>
    <binding name="B" type="tns:P"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>${operations.map(([name]) => `<operation name="${name}"><soap:operation soapAction="urn:${name}"/><input><soap:body use="literal"/></input></operation>`).join("")}</binding>
    <service name="S"><port name="p" binding="tns:B"><soap:address location="https://svc.example.com/Service.svc"/></port></service>
  </definitions>`;
};

const design = (operations, options) => proposeDesign(parseWsdl(wsdlWith(operations)), options);
const rowOf = (d, name) => d.operations.find((o) => o.soapOperation === name);
const route = (d, name) => {
  const r = rowOf(d, name);
  return `${r.method} ${r.path}`;
};

describe("design heuristics — positive", () => {
  it("proposes the bank's account service the way an architect would", () => {
    const d = proposeDesign(sample("AccountService"));
    expect(d.operations.map((o) => `${o.method} ${o.path}`)).toEqual([
      "GET /accounts/{accountId}/balance",
      "GET /accounts/{accountId}/transactions",
      "GET /customers/{customerId}/accounts",
      "POST /accounts",
      "PUT /accounts/{accountId}/address",
      "DELETE /accounts/{accountId}",
      "POST /funds/transfer",
      "POST /ibans/validate",
    ]);
    expect(d.stats.review).toBe(0);
    expect(d.operations.every((o) => o.confidence >= 0.9)).toBe(true);
    const transactions = rowOf(d, "GetAccountTransactions");
    expect(transactions.queryParams.map((q) => `${q.name}${q.required ? "!" : ""}`)).toEqual(["from", "to", "maxResults"]);
    expect(transactions.pathParams[0]).toMatchObject({ name: "accountId", field: "accountId", xmlName: "AccountId" });
    expect(transactions.response).toMatchObject({ status: 200, unwrapped: "getAccountTransactionsResult" });
    expect(transactions.response.schema).toEqual({ $ref: "#/components/schemas/ArrayOfTransaction" });
    const open = rowOf(d, "OpenAccount");
    expect(open.kind).toBe("create");
    expect(open.response.status).toBe(201);
    expect(open.requestBody.fields.map((f) => f.name)).toEqual(["customerId", "address", "initialDeposit"]);
    const update = rowOf(d, "UpdateAccountAddress");
    expect(update.response.status).toBe(204);
    expect(update.requestBody.fields.map((f) => f.name)).toEqual(["address"]);
    const transfer = rowOf(d, "TransferFunds");
    expect(transfer.kind).toBe("action");
    expect(transfer.errors.map((e) => `${e.status}:${e.faults.join("+") || "-"}`)).toEqual(["400:-", "404:AccountNotFoundFault", "422:InsufficientFundsFault"]);
    expect(rowOf(d, "CloseAccount").rationale.join(" ")).toMatch(/"Close" maps to DELETE/);
    expect(d.resources.map((r) => r.tag)).toEqual(["Accounts", "Funds", "Ibans"]);
  });

  it("handles rpc/literal and WSDL 2.0 services", () => {
    const w = proposeDesign(sample("WarehouseService"));
    expect(route(w, "getStockLevel")).toBe("GET /stock-levels");
    expect(rowOf(w, "getStockLevel").queryParams.map((q) => q.name)).toEqual(["sku", "warehouseCode"]);
    expect(route(w, "listWarehouses")).toBe("GET /warehouses");
    expect(rowOf(w, "listWarehouses").response.schema).toEqual({ $ref: "#/components/schemas/WarehouseList" });
    expect(route(w, "reserveStock")).toBe("POST /stock/reserve");
    expect(route(w, "releaseReservation")).toBe("POST /reservations/{reservationId}/release");
    expect(rowOf(w, "releaseReservation").response.status).toBe(204);
    expect(rowOf(w, "getStockLevel").errors.find((e) => e.status === 404).faults).toEqual(["UnknownSkuException"]);

    const n = proposeDesign(sample("NotificationService"));
    expect(route(n, "SendNotification")).toBe("POST /notifications");
    expect(rowOf(n, "SendNotification").response.status).toBe(202);
    expect(route(n, "GetNotificationStatus")).toBe("GET /notifications/{notificationId}/status");
    expect(rowOf(n, "GetNotificationStatus").errors.find((e) => e.status === 404).faults).toEqual(["NotFound"]);
  });

  it("maps verbs, identifiers, sub-resources, filters and parents", () => {
    const d = design([
      ["GetOrder", ["OrderId"], ["Result"]],
      ["ListOrders", [{ name: "Status", optional: true }], ["Orders"]],
      ["GetOrdersForCustomer", ["CustomerId"], ["Orders"]],
      ["GetOrderLines", ["OrderNumber"], ["Lines"]],
      ["CreateOrder", ["CustomerId", "Sku"], ["Order"]],
      ["UpdateOrder", ["OrderId", "Sku"], []],
      ["AdjustOrderQuantity", ["OrderId", "Quantity"], []],
      ["CancelOrder", ["OrderId"], ["Ok"]],
      ["ApproveOrder", ["OrderId", "ApprovedBy"], ["Result"]],
      ["IsOrderShipped", ["OrderId"], ["Result"]],
      ["CountOrders", [], ["Result"]],
      ["Ping", [], ["Pong"]],
    ]);
    expect(route(d, "GetOrder")).toBe("GET /orders/{orderId}");
    expect(rowOf(d, "GetOrder").kind).toBe("item");
    expect(route(d, "ListOrders")).toBe("GET /orders");
    expect(rowOf(d, "ListOrders").kind).toBe("list");
    expect(rowOf(d, "ListOrders").queryParams[0]).toMatchObject({ name: "status", required: false });
    const byStatus = design([["FindOrdersByStatus", ["Status"], ["Orders"]]]);
    expect(route(byStatus, "FindOrdersByStatus")).toBe("GET /orders");
    expect(rowOf(byStatus, "FindOrdersByStatus").queryParams[0]).toMatchObject({ name: "status", required: true });
    expect(rowOf(byStatus, "FindOrdersByStatus").rationale.join(" ")).toMatch(/"by Status" is a filter/);
    expect(route(d, "GetOrdersForCustomer")).toBe("GET /customers/{customerId}/orders");
    expect(route(d, "GetOrderLines")).toBe("GET /orders/{orderNumber}/lines");
    expect(route(d, "CreateOrder")).toBe("POST /orders");
    expect(rowOf(d, "CreateOrder").response.status).toBe(201);
    expect(route(d, "UpdateOrder")).toBe("PUT /orders/{orderId}");
    expect(rowOf(d, "UpdateOrder").response.status).toBe(204);
    expect(route(d, "AdjustOrderQuantity")).toBe("PATCH /orders/{orderId}/quantity");
    expect(route(d, "CancelOrder")).toBe("DELETE /orders/{orderId}");
    expect(route(d, "ApproveOrder")).toBe("POST /orders/{orderId}/approve");
    expect(rowOf(d, "ApproveOrder").requestBody.fields.map((f) => f.name)).toEqual(["approvedBy"]);
    expect(route(d, "IsOrderShipped")).toBe("GET /orders/{orderId}/shipped");
    expect(route(d, "CountOrders")).toBe("GET /orders/count-orders"); // collides with ListOrders, so it is suffixed
    expect(rowOf(d, "CountOrders").review).toBe(true);
    expect(route(d, "Ping")).toBe("POST /s/ping"); // a verb alone hangs under the service ("S")
    expect(rowOf(d, "Ping").kind).toBe("action");
  });

  it("applies reviewer overrides and keeps the fields consistent", () => {
    const base = design([["GetAccountBalance", ["AccountId", "Currency"], ["Result"]], ["SearchAccounts", [{ name: "Criteria", type: "tns:Item" }], ["Accounts"]]]);
    expect(route(base, "GetAccountBalance")).toBe("GET /accounts/{accountId}/balance");
    expect(rowOf(base, "GetAccountBalance").queryParams.map((q) => q.name)).toEqual(["currency"]);
    expect(route(base, "SearchAccounts")).toBe("POST /accounts/search");
    expect(rowOf(base, "SearchAccounts").review).toBe(true);

    const reviewed = design(
      [["GetAccountBalance", ["AccountId", "Currency"], ["Result"]], ["SearchAccounts", [{ name: "Criteria", type: "tns:Item" }], ["Accounts"]]],
      { overrides: { GetAccountBalance: { path: "/accounts/{accountId}/balances/{currency}", summary: "Balance in a currency" }, SearchAccounts: { method: "POST", path: "/account-searches", notes: "Agreed with the mobile team." } }, statuses: { SearchAccounts: "approved", GetAccountBalance: "nonsense" } },
    );
    const balance = rowOf(reviewed, "GetAccountBalance");
    expect(balance.path).toBe("/accounts/{accountId}/balances/{currency}");
    expect(balance.pathParams.map((p) => p.field)).toEqual(["accountId", "currency"]);
    expect(balance.queryParams).toEqual([]);
    expect(balance.summary).toBe("Balance in a currency");
    expect(balance.overridden).toEqual({ path: "/accounts/{accountId}/balance", summary: "Get account balance" });
    expect(balance.review).toBe(false);
    expect(balance.confidence).toBe(1);
    expect(balance.status).toBe("proposed"); // an unknown status falls back
    const search = rowOf(reviewed, "SearchAccounts");
    expect(search.path).toBe("/account-searches");
    expect(search.review).toBe(false);
    expect(search.status).toBe("approved");
    expect(search.notes).toBe("Agreed with the mobile team.");

    // Moving a path parameter back out puts the field where the method wants it.
    const moved = design([["GetAccountBalance", ["AccountId", "Currency"], ["Result"]]], { overrides: { GetAccountBalance: { path: "/balances" } } });
    expect(rowOf(moved, "GetAccountBalance").queryParams.map((q) => q.name)).toEqual(["currency", "accountId"]);
    const asPost = design([["GetAccountBalance", ["AccountId", "Currency"], ["Result"]]], { overrides: { GetAccountBalance: { method: "POST" } } });
    expect(rowOf(asPost, "GetAccountBalance").requestBody.fields.map((f) => f.name)).toEqual(["currency"]);
    expect(rowOf(asPost, "GetAccountBalance").queryParams).toEqual([]);
  });

  it("respects naming conventions and the base path", () => {
    const keep = proposeDesign(sample("AccountService"), { propertyCase: "keep", basePath: "" });
    expect(rowOf(keep, "GetAccountTransactions").queryParams.map((q) => q.name)).toEqual(["From", "To", "MaxResults"]);
    expect(keep.components.Balance.properties.AccountId).toBeTruthy();
    const snake = proposeDesign(sample("AccountService"), { propertyCase: "snake" });
    expect(Object.keys(snake.components.Balance.properties)).toEqual(["account_id", "available", "ledger", "as_of"]);
    expect(snake.components.Balance["x-xml"].account_id.name).toBe("AccountId");
    const spec = buildOpenApi(keep, sample("AccountService"));
    // The adapter's local address first (it can actually answer), the proposed host second, both saying so.
    expect(spec.servers.map((s) => s.url)).toEqual(["http://localhost:8080", "https://esb.bank.example.com"]);
    expect(spec.servers[1].description).toMatch(/does not serve it/);
    expect(proposedServerUrl({ endpoints: [] }, "/v2")).toBe("https://api.example.com/v2");
  });

  it("groups verb-only operations (a calculator) under the service as actions", () => {
    const svc = parseWsdl(wsdlWith([["Add", ["intA", "intB"], ["AddResult"]], ["Subtract", ["intA", "intB"], ["SubtractResult"]], ["Reset", [], []]]).replace('name="S"', 'name="CalculatorSoap"'));
    const d = proposeDesign(svc);
    expect(d.operations.map((o) => `${o.method} ${o.path}`)).toEqual(["POST /calculator/add", "POST /calculator/subtract", "POST /calculator/reset"]);
    const add = rowOf(d, "Add");
    expect(add.kind).toBe("action");
    expect(add.requestBody.fields.map((f) => f.name)).toEqual(["intA", "intB"]);
    expect(add.response).toMatchObject({ status: 200, unwrapped: "addResult" });
    expect(add.review).toBe(true);
    expect(add.reviewReasons[0]).toMatch(/Single-word operation/);
    expect(add.confidence).toBeGreaterThanOrEqual(0.8);
    expect(d.resources.map((r) => r.tag)).toEqual(["Calculator"]);
    // Nothing proposes a nonsense collection like /adds any more.
    expect(d.operations.some((o) => /\/adds|\/subtracts/.test(o.path))).toBe(false);
  });

  it("maps fault names to statuses", () => {
    expect(statusForFault("AccountNotFoundFault").status).toBe(404);
    expect(statusForFault("ValidationFault").status).toBe(400);
    expect(statusForFault("NotAuthorizedException").status).toBe(401);
    expect(statusForFault("AccessDeniedFault").status).toBe(403);
    expect(statusForFault("DuplicateCustomerFault").status).toBe(409);
    expect(statusForFault("InsufficientFundsFault").status).toBe(422);
    expect(statusForFault("BackendTimeoutFault").status).toBe(503);
    expect(statusForFault("SomethingOddFault").status).toBe(500);
    expect(statusForFault("")).toEqual({ status: 500, reason: "Internal Server Error" });
  });

  it("pluralises resource names conservatively", () => {
    expect(plural("account")).toBe("accounts");
    expect(plural("address")).toBe("addresses");
    expect(plural("category")).toBe("categories");
    expect(plural("status")).toBe("statuses");
    expect(plural("balance")).toBe("balance");
    expect(plural("person")).toBe("people");
    expect(plural("")).toBe("");
    expect(templateParams("/a/{b}/c/{d}")).toEqual(["b", "d"]);
    expect(MIGRATION_STATUSES.map((s) => s.id)).toEqual(["proposed", "reviewed", "approved", "migrated", "skipped"]);
  });
});

describe("design heuristics — negative and edge cases", () => {
  it("flags what it could not settle instead of guessing silently", () => {
    const d = design([
      ["FrobnicateWidget", ["WidgetId"], ["Result"]], // unknown verb
      ["GetWidget", ["WidgetId", "OwnerId"], ["Result"]], // two identifiers
      ["DeleteWidgets", [], []], // delete without an id
      ["GetWidgetById", ["WidgetId"], ["Result"]], // collides with GetWidget
      ["SetWidgets", [], []], // PUT without an id
      ["ExplodeWidget", ["WidgetId"], ["Result"], ["KaboomFault"]], // unmapped fault
    ]);
    const frob = rowOf(d, "FrobnicateWidget");
    expect(frob.review).toBe(true);
    expect(frob.method).toBe("GET");
    expect(frob.path).toBe("/frobnicate-widgets"); // no verb recognised, so every word is the resource; the row is flagged
    expect(frob.confidence).toBeLessThanOrEqual(0.7);
    expect(frob.reviewReasons[0]).toMatch(/No HTTP verb matches "Frobnicate"/);
    const widget = rowOf(d, "GetWidget");
    expect(widget.path).toBe("/widgets/{widgetId}");
    expect(widget.reviewReasons.join(" ")).toMatch(/Several identifiers.*widgetId, ownerId/);
    expect(widget.queryParams.map((q) => q.name)).toEqual(["ownerId"]);
    expect(rowOf(d, "DeleteWidgets").reviewReasons.join(" ")).toMatch(/DELETE without an identifier/);
    expect(rowOf(d, "SetWidgets").reviewReasons.join(" ")).toMatch(/PUT without an identifier/);
    const byId = rowOf(d, "GetWidgetById");
    expect(byId.path).toBe("/widgets/{widgetId}/get-widget-by-id");
    expect(byId.reviewReasons.join(" ")).toMatch(/Collides with GetWidget/);
    expect(widget.reviewReasons.join(" ")).toMatch(/GetWidgetById proposed the same route/);
    const explode = rowOf(d, "ExplodeWidget");
    expect(explode.errors.find((e) => e.faults.includes("KaboomFault")).status).toBe(500);
    expect(explode.reviewReasons.join(" ")).toMatch(/KaboomFault.*mapped to 500/);
    expect(d.stats.review).toBe(6);
  });

  it("copes with an empty service, missing messages and duplicate operation names", () => {
    const empty = proposeDesign(parseWsdl(`<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="urn:e"/>`));
    expect(empty.operations).toEqual([]);
    expect(empty.stats).toMatchObject({ operations: 0, review: 0, resources: 0 });
    expect(proposeDesign(null).operations).toEqual([]);

    const twice = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns="urn:d" targetNamespace="urn:d">
      <portType name="A"><operation name="GetThing"><input message="tns:Missing"/></operation></portType>
      <portType name="B"><operation name="GetThing"><input message="tns:Missing"/></operation></portType></definitions>`;
    const d = proposeDesign(parseWsdl(twice));
    expect(d.operations.map((o) => o.id)).toEqual(["GetThing", "GetThing_2"]);
    expect(d.operations[1].reviewReasons.join(" ")).toMatch(/declared more than once/);
    expect(d.operations[0].method).toBe("GET");
    expect(d.operations[0].path).toBe("/things");
    expect(d.operations[0].response.status).toBe(202);
  });

  it("ignores junk overrides and statuses", () => {
    const d = design([["GetOrder", ["OrderId"], ["Result"]]], { overrides: { GetOrder: { method: "TELEPORT", path: "   ", summary: "" }, Nope: { method: "POST" } }, statuses: { GetOrder: 42 } });
    const row = rowOf(d, "GetOrder");
    expect(row.method).toBe("GET");
    expect(row.path).toBe("/orders/{orderId}");
    expect(row.overridden).toEqual({});
    expect(row.status).toBe("proposed");
  });

  it("flags a path parameter that matches no request field", () => {
    const d = design([["GetOrder", ["OrderId"], ["Result"]]], { overrides: { GetOrder: { path: "/tenants/{tenantId}/orders/{orderId}" } } });
    const row = rowOf(d, "GetOrder");
    expect(row.pathParams.map((p) => `${p.name}:${p.field || "?"}`)).toEqual(["tenantId:?", "orderId:orderId"]);
    expect(row.review).toBe(true);
    expect(row.reviewReasons[0]).toMatch(/\{tenantId\} does not match/);
  });
});

describe("XSD → JSON Schema", () => {
  it("lists every ambiguity with the decision taken", () => {
    const d = proposeDesign(sample("AccountService"));
    const kinds = d.ambiguities.map((a) => `${a.kind}@${a.path}`);
    expect(kinds).toEqual(expect.arrayContaining(["choice@Address", "any@Account/Metadata", "nillable@Address/Line2", "attribute@Money/@currency", "simple-content@Money", "attribute@Account/@version"]));
    d.ambiguities.forEach((a) => {
      expect(a.message).toBeTruthy();
      expect(a.decision).toBeTruthy();
    });
    const address = d.components.Address;
    expect(address["x-xsd-choice"]).toEqual([["postcode", "zipCode"]]);
    expect(address.required).toEqual(["line1", "city", "country"]);
    expect(address.properties.line2).toMatchObject({ type: "string", nullable: true });
    expect(address.properties.country.default).toBe("GB");
    expect(d.components.Money).toMatchObject({ type: "object", required: ["value", "currency"] });
    expect(d.components.Money.properties.value.type).toBe("number");
    expect(d.components.Account.properties.metadata.additionalProperties).toBe(true);
    expect(d.components.Account.properties.status).toEqual({ $ref: "#/components/schemas/AccountStatus" });
    expect(d.components.AccountStatus.enum).toEqual(["Active", "Dormant", "Closed"]);
    expect(d.components.Account.properties.iban).toMatchObject({ type: "string", pattern: "[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", minLength: 15, maxLength: 34 });
    expect(d.components.Account.properties.openedOn).toEqual({ type: "string", format: "date" });
    expect(d.components.Counterparty.properties.parent).toEqual({ $ref: "#/components/schemas/Counterparty" });
    expect(d.components.ArrayOfTransaction.properties.transaction).toEqual({ type: "array", items: { $ref: "#/components/schemas/Transaction" } });
  });

  it("maps built-ins, bounded arrays, nillable refs and unknown types", () => {
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:b" targetNamespace="urn:b">
      <types><xs:schema targetNamespace="urn:b"><xs:complexType name="T"><xs:sequence>
        <xs:element name="n" type="xs:nonNegativeInteger"/><xs:element name="l" type="xs:long"/><xs:element name="d" type="xs:double"/><xs:element name="b" type="xs:base64Binary"/>
        <xs:element name="tags" type="xs:string" minOccurs="2" maxOccurs="5"/><xs:element name="ref" type="tns:T" nillable="true" minOccurs="0"/>
        <xs:element name="ghost" type="tns:Nope"/><xs:element name="custom" type="xs:weird"/><xs:element name="untyped"/>
      </xs:sequence></xs:complexType></xs:schema></types></definitions>`;
    const builder = createSchemaBuilder(parseWsdl(wsdl));
    builder.includeAllTypes();
    const t = builder.components.T;
    expect(t.properties.n).toEqual({ type: "integer", minimum: 0 });
    expect(t.properties.l).toEqual({ type: "integer", format: "int64" });
    expect(t.properties.d).toEqual({ type: "number", format: "double" });
    expect(t.properties.b).toEqual({ type: "string", format: "byte" });
    expect(t.properties.tags).toEqual({ type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 });
    expect(t.properties.ref).toEqual({ allOf: [{ $ref: "#/components/schemas/T" }], nullable: true });
    expect(t.properties.ghost).toMatchObject({ "x-xsd-unresolved": "Nope" });
    expect(t.properties.custom).toEqual({ type: "string" });
    expect(t.properties.untyped).toEqual({});
    expect(builder.ambiguities.map((a) => a.kind)).toEqual(expect.arrayContaining(["nillable", "unresolved-type", "unknown-builtin", "any"]));
  });

  it("keeps two types with the same local name in different namespaces apart", () => {
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:w">
      <types>
        <xs:schema targetNamespace="urn:one"><xs:complexType name="Address"><xs:sequence><xs:element name="street" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>
        <xs:schema targetNamespace="http://example.com/two"><xs:complexType name="Address"><xs:sequence><xs:element name="line" type="xs:string"/></xs:sequence></xs:complexType></xs:schema>
      </types></definitions>`;
    const builder = createSchemaBuilder(parseWsdl(wsdl));
    builder.includeAllTypes();
    expect(Object.keys(builder.components).sort()).toEqual(["Address", "TwoAddress"]);
  });
});

describe("OpenAPI generation and Contract Graph integration", () => {
  it("produces a document the API Map and Contract Graph read back", () => {
    const svc = sample("AccountService");
    const d = proposeDesign(svc);
    const spec = buildOpenApi(d, svc);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("AccountService");
    expect(spec.info["x-soap-source"].wsdlVersion).toBe("1.1");
    expect(Object.keys(spec.paths)).toHaveLength(8);
    const balance = spec.paths["/accounts/{accountId}/balance"].get;
    expect(balance.operationId).toBe("getAccountBalance");
    expect(balance["x-soap-operation"]).toBe("GetAccountBalance");
    expect(balance.parameters[0]).toMatchObject({ name: "accountId", in: "path", required: true, "x-soap-field": "AccountId" });
    expect(balance.responses["200"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Balance" });
    expect(balance.responses["404"]["x-soap-faults"]).toEqual(["AccountNotFoundFault"]);
    expect(balance.responses["404"].content["application/problem+json"].schema.properties.status.type).toBe("integer");
    const update = spec.paths["/accounts/{accountId}/address"].put;
    expect(Object.keys(update.requestBody.content["application/json"].schema.properties)).toEqual(["address"]);
    expect(spec.paths["/accounts"].post.responses["201"]).toBeTruthy();
    expect(spec.components.schemas.Problem).toBeUndefined(); // inlined, so the graph does not see a shared "Problem" entity

    // Every $ref resolves.
    const refs = JSON.stringify(spec).match(/#\/components\/schemas\/[A-Za-z0-9_]+/g);
    refs.forEach((ref) => expect(spec.components.schemas[ref.split("/").pop()]).toBeTruthy());
    // No `x-xsd-*` siblings beside a $ref.
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.$ref) expect(Object.keys(node).filter((k) => k !== "$ref")).toEqual([]);
      Object.values(node).forEach(walk);
    };
    walk(spec);

    // The single-spec parsers read it.
    expect(detectFormat(spec)).toBe("openapi");
    const nodes = parseOpenApi(spec, () => {});
    expect(nodes.filter((n) => n.type === "request")).toHaveLength(8);
    expect(nodes.find((n) => n.type === "request" && n.method === "GET").path).toBe("http://localhost:8080/accounts/{accountId}/balance");

    // YAML and JSON round-trip through the app's reader.
    expect(parseSpecText(openApiToYaml(spec)).paths).toEqual(spec.paths);
    expect(parseSpecText(openApiToJson(spec)).info.title).toBe("AccountService");

    // Contract Graph: the migrated WSDL sits on the same map as REST services.
    const normalized = normalizeService({ id: "acct", name: "AccountService", spec });
    expect(normalized.operations).toHaveLength(8);
    expect(normalized.entities.find((e) => e.name === "Account").fields.map((f) => f.name)).toEqual(expect.arrayContaining(["accountId", "customerId", "status"]));
    const customers = { openapi: "3.0.0", info: { title: "Customers" }, servers: [{ url: "https://customers.internal" }], components: { schemas: { Customer: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } } } }, paths: { "/customers/{id}": { get: { responses: { 200: { content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } } } } } } };
    const graph = buildContractGraph([{ id: "a", name: "AccountService", spec }, { id: "c", name: "Customers", spec: customers }]);
    expect(graph.services).toHaveLength(2);
    expect(graph.edges.some((e) => e.kind === "references" && e.from === "a" && e.to === "c")).toBe(true);
  });

  it("marks skipped operations deprecated, keeps operationIds unique and survives odd names", () => {
    const svc = parseWsdl(wsdlWith([["Get Thing", ["Id"], ["R"]], ["get-thing", ["Id"], ["R"]], ["123Go", ["X"], ["R"]]]));
    const d = proposeDesign(svc, { statuses: { "Get Thing": "skipped" } });
    const spec = buildOpenApi(d, svc);
    const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
    expect(new Set(ops.map((o) => o.operationId)).size).toBe(3);
    expect(ops.find((o) => o["x-soap-operation"] === "Get Thing").deprecated).toBe(true);
    expect(ops.find((o) => o["x-soap-operation"] === "123Go").operationId).toMatch(/^op123Go/);
  });

  it("warns on an unresolved schema through to the design", () => {
    const svc = parseWsdl(SAMPLE_WSDL, { documents: {} });
    const d = proposeDesign(svc);
    expect(d.warnings[0].code).toBe("unresolved-import");
    expect(d.ambiguities.some((a) => a.kind === "unresolved-type")).toBe(true);
    // With the schema attached, the same operations resolve.
    const fixed = proposeDesign(parseWsdl(SAMPLE_WSDL, { documents: { "Account.xsd": SAMPLE_XSD } }));
    expect(fixed.warnings).toEqual([]);
    expect(fixed.components.Balance).toBeTruthy();
    expect(svc.schema.types[typeKey("http://bank.example.com/accounts/types", "Balance")]).toBeUndefined();
  });
});
