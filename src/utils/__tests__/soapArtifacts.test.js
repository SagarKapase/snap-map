import { describe, it, expect } from "vitest";
import { parseWsdl } from "../soap/wsdl";
import { proposeDesign } from "../soap/design";
import { buildOpenApi } from "../soap/openapi";
import { scaffoldAdapter, ADAPTER_TARGETS, pascal } from "../soap/adapters";
import { buildEnvelope, buildRestRequest, buildParityPlan, parityFiles, parityScript, curlFor, sampleValue, SOAP11_ENV, SOAP12_ENV } from "../soap/parity";
import { createZip, readZip, crc32 } from "../soap/zip";
import { parseXml, childOf, descendants } from "../soap/xml";
import { SAMPLE_PROGRAMME } from "../soap/samples";

const sample = (name) => {
  const s = SAMPLE_PROGRAMME.services.find((x) => x.name === name);
  return parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
};
const pipeline = (name, options) => {
  const svc = sample(name);
  const d = proposeDesign(svc, options);
  return { svc, d, spec: buildOpenApi(d, svc) };
};
const file = (files, part) => files.find((f) => f.path.includes(part));

describe("adapter scaffolds — positive", () => {
  it("scaffolds an ASP.NET Core adapter that works as generated: routes, bridge, models, no TODOs", () => {
    const { svc, d, spec } = pipeline("AccountService");
    const files = scaffoldAdapter(d, svc, "dotnet", spec);
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(["Program.cs", "Contracts/Models.cs", "Soap/SoapBridge.cs", "bridge.json", "Endpoints/AccountsEndpoints.cs", "AccountService.Adapter.csproj", "README.md"]));
    const all = files.map((f) => f.content).join("\n");
    expect(all).not.toContain("TODO");
    expect(all).not.toContain("NotImplementedException");
    const endpoints = file(files, "AccountsEndpoints").content;
    expect(endpoints).toContain('app.MapGet("/accounts/{accountId}/balance", async (string accountId, SoapBridge bridge, CancellationToken ct)');
    expect(endpoints).toContain('fields["accountId"] = accountId;');
    expect(endpoints).toContain('var result = await bridge.CallAsync("GetAccountBalance", fields, ct);');
    expect(endpoints).toContain("return result.ToHttpResult();");
    expect(endpoints).toContain("[FromQuery] string? from");
    expect(endpoints).toContain('if (from is not null) fields["from"] = from;');
    expect(endpoints).toContain('app.MapPut("/accounts/{accountId}/address", async (string accountId, [FromBody] JsonObject? body, SoapBridge bridge');
    expect(endpoints).toContain("if (body is not null) foreach (var (key, value) in body) fields[key] = value?.DeepClone();");
    expect(endpoints).toContain(".Produces<Balance>(200)");
    expect(endpoints).toContain('.Accepts<UpdateAccountAddressBody>("application/json")');
    expect(endpoints).toContain(".ProducesProblem(404)");
    const bridge = JSON.parse(file(files, "bridge.json").content);
    expect(bridge.routes.map((r) => r.operation)).toHaveLength(8);
    expect(bridge.schemas.Balance).toBeTruthy();
    const runtime = file(files, "SoapBridge.cs").content;
    expect(runtime).toContain("public async Task<BridgeResult> CallAsync(string operation, JsonObject fields, CancellationToken ct)");
    expect(runtime).toContain("SOAPAction");
    expect(runtime).toContain("application/problem+json");
    const models = file(files, "Models.cs").content;
    expect(models).toContain("public sealed record Balance");
    expect(models).toContain("public required string AccountId { get; init; }");
    expect(models).toContain("public enum AccountStatus");
    expect(models).toContain("public sealed record UpdateAccountAddressBody");
    expect(file(files, "Program.cs").content).toContain("app.MapAccounts();");
    expect(file(files, "Program.cs").content).toContain("SoapBridge.FromFile(");
    expect(file(files, ".csproj").content).toContain('<None Update="bridge.json" CopyToOutputDirectory="PreserveNewest" />');
    expect(file(files, ".csproj").content).toContain("<RollForward>Major</RollForward>");
    expect(file(files, "README.md").content).toContain("| `GET /accounts/{accountId}/balance` | GetAccountBalance |");
    expect(file(files, "README.md").content).toContain("dotnet run");
  });

  it("scaffolds a Spring Boot adapter with the same bridge, records and controllers", () => {
    const { svc, d, spec } = pipeline("AccountService");
    const files = scaffoldAdapter(d, svc, "spring", spec);
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(["pom.xml", "src/main/resources/application.yml", "src/main/resources/bridge.json", "src/main/java/com/example/accountservice/AdapterApplication.java", "src/main/java/com/example/accountservice/api/AccountsController.java", "src/main/java/com/example/accountservice/soap/SoapBridge.java", "src/main/java/com/example/accountservice/model/Balance.java"]));
    const all = files.map((f) => f.content).join("\n");
    expect(all).not.toContain("TODO");
    expect(all).not.toContain("UnsupportedOperationException");
    const controller = file(files, "AccountsController").content;
    expect(controller).toContain('@GetMapping("/accounts/{accountId}/balance")');
    expect(controller).toContain('public ResponseEntity<Object> getAccountBalance(@PathVariable("accountId") String accountId)');
    expect(controller).toContain('fields.put("accountId", accountId);');
    expect(controller).toContain('return bridge.call("GetAccountBalance", fields).toResponse();');
    expect(controller).toContain('@RequestParam(name = "maxResults", required = false) String maxResults');
    expect(controller).toContain("@RequestBody(required = false) ObjectNode body");
    expect(controller).toContain("if (body != null) fields.setAll(body);");
    expect(file(files, "model/Balance.java").content).toContain("public record Balance(");
    expect(file(files, "model/AccountStatus.java").content).toContain('@JsonProperty("Active") ACTIVE');
    expect(file(files, "SoapBridge.java").content).toContain("public Result call(String operation, ObjectNode fields)");
    expect(file(files, "AdapterApplication").content).toContain('getResourceAsStream("/bridge.json")');
    expect(file(files, "application.yml").content).toContain("url: ${SOAP_URL:}");
    expect(file(files, "README.md").content).toContain("not compiled in the environment");
  });

  it("covers rpc and WSDL 2.0 services in both targets", () => {
    ["WarehouseService", "NotificationService"].forEach((name) => {
      const { svc, d, spec } = pipeline(name);
      ADAPTER_TARGETS.forEach((target) => {
        const files = scaffoldAdapter(d, svc, target.id, spec);
        const all = files.map((f) => f.content).join("\n");
        d.operations.forEach((row) => expect(all).toContain(row.path));
        expect(all).not.toContain("undefined");
        expect(all).not.toContain("[object Object]");
        expect(all).not.toContain("TODO");
      });
    });
    const { svc, d, spec } = pipeline("NotificationService");
    const cs = file(scaffoldAdapter(d, svc, "dotnet", spec), "NotificationsEndpoints").content;
    expect(cs).toContain('await bridge.CallAsync("SendNotification", fields, ct);');
    expect(cs).toContain(".Produces(202)");
    expect(cs).toContain("public static IEndpointRouteBuilder MapNotifications");
  });

  it("leaves skipped operations out of the routes and the bridge", () => {
    const svc = sample("AccountService");
    const d = proposeDesign(svc, { statuses: { ValidateIban: "skipped", TransferFunds: "skipped" } });
    const files = scaffoldAdapter(d, svc, "dotnet", buildOpenApi(d, svc));
    expect(files.some((f) => f.path.includes("IbansEndpoints"))).toBe(false);
    expect(files.some((f) => f.path.includes("FundsEndpoints"))).toBe(false);
    expect(file(files, "Program.cs").content).not.toContain("MapIbans");
    expect(JSON.parse(file(files, "bridge.json").content).routes.map((r) => r.operation)).not.toContain("ValidateIban");
  });
});

describe("adapter scaffolds — negative", () => {
  it("sanitises names that are not identifiers in either language", () => {
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:odd" targetNamespace="urn:odd">
      <types><xs:schema targetNamespace="urn:odd" elementFormDefault="qualified">
        <xs:element name="123-do it!"><xs:complexType><xs:sequence><xs:element name="class" type="xs:string"/><xs:element name="namespace" type="xs:string"/><xs:element name="default" type="xs:int"/><xs:element name="new-value" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
        <xs:element name="123-do it!Response"><xs:complexType><xs:sequence><xs:element name="return" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
        <xs:complexType name="object"><xs:sequence><xs:element name="string" type="xs:string"/></xs:sequence></xs:complexType>
        <xs:element name="GetObject"><xs:complexType><xs:sequence><xs:element name="ObjectId" type="xs:string"/></xs:sequence></xs:complexType></xs:element>
        <xs:element name="GetObjectResponse"><xs:complexType><xs:sequence><xs:element name="Result" type="tns:object"/></xs:sequence></xs:complexType></xs:element>
      </xs:schema></types>
      <message name="In"><part name="p" element="tns:123-do it!"/></message><message name="Out"><part name="p" element="tns:123-do it!Response"/></message>
      <message name="In2"><part name="p" element="tns:GetObject"/></message><message name="Out2"><part name="p" element="tns:GetObjectResponse"/></message>
      <portType name="P"><operation name="123-do it!"><input message="tns:In"/><output message="tns:Out"/></operation><operation name="GetObject"><input message="tns:In2"/><output message="tns:Out2"/></operation></portType>
      <binding name="B" type="tns:P"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/></binding>
      <service name="Odd Service 2"><port name="p" binding="tns:B"><soap:address location="http://h/s"/></port></service>
    </definitions>`;
    const svc = parseWsdl(wsdl);
    const d = proposeDesign(svc, { propertyCase: "keep" });
    const spec = buildOpenApi(d, svc);
    const cs = scaffoldAdapter(d, svc, "dotnet", spec).map((f) => f.content).join("\n");
    expect(cs).toContain("public sealed record N123DoIt");
    expect(cs).toContain("public required string Class { get; init; }");
    expect(cs).toContain("public required string NewValue { get; init; }");
    expect(cs).toContain('[JsonPropertyName("new-value")]');
    expect(cs).toContain("public sealed record ObjectDto");
    expect(cs).toContain("public required string String { get; init; }");
    expect(cs).toContain("namespace OddService2.Adapter");
    const java = scaffoldAdapter(d, svc, "spring", spec).map((f) => f.content).join("\n");
    expect(java).toContain("public record N123DoIt(");
    expect(java).toContain('@JsonProperty("class") String class_');
    expect(java).toContain('@JsonProperty("default") Integer default_');
    expect(java).toContain("public record ObjectDto(");
    expect(java).toContain("package com.example.oddservice2");
    expect(pascal("")).toBe("Item");
    expect(pascal("9lives")).toBe("N9lives");
  });

  it("refuses an unknown target and an empty design", () => {
    const { svc, d, spec } = pipeline("AccountService");
    expect(() => scaffoldAdapter(d, svc, "cobol", spec)).toThrow(/Unknown adapter target/);
    expect(() => scaffoldAdapter(null, svc, "dotnet")).toThrow(/design is needed/);
    expect(() => scaffoldAdapter({ operations: [] }, svc, "dotnet")).toThrow(/no operations/);
  });
});

describe("parity — positive", () => {
  it("builds a SOAP 1.1 envelope, its REST twin and comparison rules", () => {
    const { svc, d } = pipeline("AccountService");
    const row = d.operations.find((o) => o.soapOperation === "GetAccountTransactions");
    const env = buildEnvelope(svc, d, row);
    expect(env.version).toBe("1.1");
    expect(env.headers).toEqual({ "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://bank.example.com/accounts/IAccountService/GetAccountTransactions"' });
    expect(env.url).toBe("https://esb.bank.example.com/services/AccountService.svc");
    const root = parseXml(env.xml);
    expect(root.ns).toBe(SOAP11_ENV);
    const body = childOf(root, "Body");
    const wrapper = body.children[0];
    expect(wrapper.local).toBe("GetAccountTransactions");
    expect(wrapper.ns).toBe("http://bank.example.com/accounts");
    expect(wrapper.children.map((c) => `${c.local}=${c.text}`)).toEqual(["AccountId=ACCOUNT-1001", "From=2024-01-15", "To=2024-01-15", "MaxResults=50"]);
    expect(env.values).toEqual({ accountId: "ACCOUNT-1001", from: "2024-01-15", to: "2024-01-15", maxResults: 50 });
    const rest = buildRestRequest(d, row, env.values, "https://api.bank.example.com/v1/");
    expect(rest).toMatchObject({ method: "GET", url: "https://api.bank.example.com/v1/accounts/ACCOUNT-1001/transactions?from=2024-01-15&to=2024-01-15&maxResults=50", body: null });
    const plan = buildParityPlan(svc, d, { restBaseUrl: "https://api.bank.example.com/v1" });
    const c = plan.cases.find((x) => x.id === "GetAccountTransactions");
    expect(c.compare).toMatchObject({ soapResultPath: "Envelope/Body/GetAccountTransactionsResponse/GetAccountTransactionsResult", restResultPath: "$", expectStatus: 200 });
    expect(plan.cases).toHaveLength(8);
    expect(plan.vizroute).toBe("soap-parity-plan");
  });

  it("nests attributes, simple content, nillable and choice in the envelope", () => {
    const { svc, d } = pipeline("AccountService");
    const row = d.operations.find((o) => o.soapOperation === "OpenAccount");
    const env = buildEnvelope(svc, d, row, { customerId: "C1", address: { line1: "1 High St", line2: null, city: "Leeds", postcode: "LS1", country: "GB" }, initialDeposit: { value: 25, currency: "EUR" } });
    const root = parseXml(env.xml);
    const deposit = descendants(root, "InitialDeposit")[0];
    expect(deposit.text).toBe("25");
    expect(deposit.attrs.currency).toBe("EUR");
    const line2 = descendants(root, "Line2")[0];
    expect(line2.attrs["xsi:nil"]).toBe("true");
    expect(line2.ns).toBe("http://bank.example.com/accounts/types");
    expect(descendants(root, "ZipCode")).toHaveLength(0);
    const rest = buildRestRequest(d, row, env.values, "");
    expect(rest.body).toEqual(env.values);
    expect(rest.headers["Content-Type"]).toBe("application/json");
  });

  it("builds rpc/literal and SOAP 1.2 envelopes", () => {
    const w = pipeline("WarehouseService");
    const reserve = w.d.operations.find((o) => o.soapOperation === "reserveStock");
    const env = buildEnvelope(w.svc, w.d, reserve);
    const wrapper = childOf(parseXml(env.xml), "Body").children[0];
    expect(wrapper.local).toBe("reserveStock");
    expect(wrapper.ns).toBe("http://logistics.bank.example.com/warehouse");
    expect(wrapper.children.map((c) => `${c.local}:${c.ns}`)).toEqual(["sku:", "quantity:", "warehouseCode:"]);
    expect(env.xml).toContain('<sku xmlns="">SKU-0001</sku>');

    const n = pipeline("NotificationService");
    const send = n.d.operations.find((o) => o.soapOperation === "SendNotification");
    const env12 = buildEnvelope(n.svc, n.d, send);
    expect(env12.version).toBe("1.2");
    expect(env12.headers).toEqual({ "Content-Type": 'application/soap+xml; charset=utf-8; action="urn:notifications:send"' });
    expect(parseXml(env12.xml).ns).toBe(SOAP12_ENV);
    expect(env12.values.channel).toBe("SMS");
    expect(env12.values.tags).toEqual(["sample-tag"]);
  });

  it("emits the download set, cURL and a script that parses", () => {
    const { svc, d } = pipeline("AccountService");
    const plan = buildParityPlan(svc, d, { restBaseUrl: "https://api.bank.example.com/v1" });
    const files = parityFiles(plan);
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(["parity.json", "parity.test.mjs", "README.md", "soap/GetAccountBalance.xml"]));
    expect(JSON.parse(file(files, "parity.json").content).cases).toHaveLength(8);
    const script = parityScript();
    expect(script).toContain("process.exit(failed ? 1 : 0)");
    expect(() => new Function(script.replace(/^#!.*\n/, "").replace(/\bawait\b/g, "").replace(/^import .*$/gm, ""))).not.toThrow();
    const curl = curlFor({ method: "POST", url: plan.cases[0].soap.url, headers: plan.cases[0].soap.headers, body: plan.cases[0].soap.body });
    expect(curl).toMatch(/^curl -X POST/);
    expect(curl).toContain("-H 'SOAPAction: \"http://bank.example.com/accounts/IAccountService/GetAccountBalance\"'");
    expect(curl).toContain("--data-binary '<?xml");
    expect(curlFor({ method: "GET", url: "https://x/y?z='q'", headers: {} })).toBe("curl -X GET \\\n  'https://x/y?z='\\''q'\\'''");
  });

  it("leaves skipped operations out and generates sample values sensibly", () => {
    const { svc } = pipeline("AccountService");
    const skipped = proposeDesign(svc, { statuses: { ValidateIban: "skipped" } });
    expect(buildParityPlan(svc, skipped).cases.map((c) => c.id)).not.toContain("ValidateIban");
    const components = { Node: { type: "object", properties: { id: { type: "string" }, child: { $ref: "#/components/schemas/Node" }, when: { type: "string", format: "date-time" }, kind: { type: "string", enum: ["a", "b"] }, count: { type: "integer", minimum: 3 } }, required: ["id", "child", "when", "kind", "count"] } };
    const value = sampleValue({ $ref: "#/components/schemas/Node" }, components);
    expect(value).toEqual({ id: "ID-1001", when: "2024-01-15T09:30:00Z", kind: "a", count: 3 });
    expect(sampleValue(null, components)).toBeUndefined();
    expect(sampleValue({ type: "array", items: { type: "boolean" } }, components)).toEqual([true]);
    expect(sampleValue({ type: "string", maxLength: 3 }, components, "x")).toHaveLength(3);
  });
});

describe("ZIP writer", () => {
  it("round-trips files, de-duplicates names and cleans paths", () => {
    const zip = createZip([
      { path: "README.md", content: "# hi\n" },
      { path: "/src/../src/a.txt", content: "a" },
      { path: "src/a.txt", content: "b" },
      { path: "bin/data.bin", content: new Uint8Array([0, 1, 2, 255]) },
      { path: "ünï/cödé.txt", content: "ü" },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const back = readZip(zip);
    expect(back.map((f) => f.path)).toEqual(["README.md", "src/a.txt", "src/a-2.txt", "bin/data.bin", "ünï/cödé.txt"]);
    expect(back[0].content).toBe("# hi\n");
    expect(back[2].content).toBe("b");
    expect(back[4].content).toBe("ü");
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("refuses an empty archive and garbage", () => {
    expect(() => createZip([])).toThrow(/Nothing to zip/);
    expect(() => createZip([{ content: "no path" }])).toThrow(/Nothing to zip/);
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/Not a ZIP/);
  });

  it("packs a full scaffold for every sample and reads it back", () => {
    SAMPLE_PROGRAMME.services.forEach((s) => {
      const { svc, d, spec } = pipeline(s.name);
      const files = [...scaffoldAdapter(d, svc, "dotnet", spec), ...scaffoldAdapter(d, svc, "spring", spec), ...parityFiles(buildParityPlan(svc, d))];
      const back = readZip(createZip(files));
      expect(back.length).toBe(files.length);
      expect(back.find((f) => f.path === "Program.cs").content).toBe(files.find((f) => f.path === "Program.cs").content);
    });
  });
});
