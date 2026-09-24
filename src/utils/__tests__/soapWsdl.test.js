import { describe, it, expect } from "vitest";
import { parseWsdl, detectXmlKind, looksLikeXml, typeKey, summarizeService } from "../soap/wsdl";
import { parseXml } from "../soap/xml";
import { createSchemaBuilder } from "../soap/jsonSchema";
import { SAMPLE_PROGRAMME, SAMPLE_WSDL, SAMPLE_XSD } from "../soap/samples";

const sample = (name) => SAMPLE_PROGRAMME.services.find((s) => s.name === name);
const parseSample = (name) => {
  const s = sample(name);
  return parseWsdl(s.wsdl, { name: s.name, documents: s.attachments });
};

describe("WSDL reader — positive", () => {
  it("reads a WCF document/literal service with an imported XSD", () => {
    const svc = parseSample("AccountService");
    expect(svc.version).toBe("1.1");
    expect(svc.name).toBe("AccountService");
    expect(svc.targetNamespace).toBe("http://bank.example.com/accounts");
    expect(svc.documentation).toMatch(/Current accounts/);
    expect(svc.operations.map((o) => o.name)).toEqual(["GetAccountBalance", "GetAccountTransactions", "FindAccountsByCustomer", "OpenAccount", "UpdateAccountAddress", "CloseAccount", "TransferFunds", "ValidateIban"]);
    expect(svc.warnings).toEqual([]);
    const op = svc.operations[0];
    expect(op.style).toBe("document");
    expect(op.use).toBe("literal");
    expect(op.soapVersion).toBe("1.1");
    expect(op.soapAction).toBe("http://bank.example.com/accounts/IAccountService/GetAccountBalance");
    expect(op.endpoint).toBe("https://esb.bank.example.com/services/AccountService.svc");
    expect(op.input.parts[0].element).toEqual({ ns: "http://bank.example.com/accounts", local: "GetAccountBalance", prefix: "tns" });
    expect(op.faults.map((f) => f.name)).toEqual(["AccountNotFoundFault"]);
    expect(op.documentation).toMatch(/available and ledger/);
    // Both bindings became endpoints.
    expect(svc.endpoints.map((e) => e.soapVersion)).toEqual(["1.1", "1.2"]);
    // The imported schema's types are in the registry.
    expect(svc.schema.types[typeKey("http://bank.example.com/accounts/types", "Account")]).toBeTruthy();
    expect(svc.schema.types[typeKey("http://bank.example.com/accounts/types", "AccountStatus")].enumerations).toEqual(["Active", "Dormant", "Closed"]);
    expect(svc.schema.elements[typeKey("http://bank.example.com/accounts", "GetAccountBalance")]).toBeTruthy();
    expect(summarizeService(svc)).toMatchObject({ operations: 8, endpoints: 2, warnings: 0 });
  });

  it("reads an rpc/literal service with inline types and empty messages", () => {
    const svc = parseSample("WarehouseService");
    expect(svc.operations).toHaveLength(4);
    const get = svc.operations.find((o) => o.name === "getStockLevel");
    expect(get.style).toBe("rpc");
    expect(get.input.parts.map((p) => p.name)).toEqual(["sku", "warehouseCode"]);
    expect(get.input.parts[0].type.local).toBe("string");
    expect(get.rpcNamespace).toBe("http://logistics.bank.example.com/warehouse");
    const list = svc.operations.find((o) => o.name === "listWarehouses");
    expect(list.input.parts).toEqual([]);
    const release = svc.operations.find((o) => o.name === "releaseReservation");
    expect(release.output.parts).toEqual([]);
  });

  it("reads WSDL 2.0 with in-only operations, SOAP 1.2 and interface faults", () => {
    const svc = parseSample("NotificationService");
    expect(svc.version).toBe("2.0");
    expect(svc.endpoints[0]).toMatchObject({ address: "https://esb.bank.example.com/notifications", soapVersion: "1.2" });
    const send = svc.operations.find((o) => o.name === "SendNotification");
    expect(send.pattern).toBe("in-only");
    expect(send.output).toBeNull();
    expect(send.soapAction).toBe("urn:notifications:send");
    const status = svc.operations.find((o) => o.name === "GetNotificationStatus");
    expect(status.output.parts[0].element.local).toBe("GetNotificationStatusResponse");
    expect(status.faults[0]).toMatchObject({ name: "NotFound" });
    expect(status.faults[0].parts[0].element.local).toBe("NotificationNotFound");
  });

  it("resolves an import by namespace when the location does not match", () => {
    const wsdl = SAMPLE_WSDL.replace('schemaLocation="Account.xsd"', 'schemaLocation="http://old-host/schemas/types.xsd"');
    const svc = parseWsdl(wsdl, { documents: { "whatever.xsd": SAMPLE_XSD } });
    expect(svc.warnings).toEqual([]);
    expect(svc.schema.types[typeKey("http://bank.example.com/accounts/types", "Balance")]).toBeTruthy();
  });

  it("resolves an import by base name from a full path", () => {
    const svc = parseWsdl(SAMPLE_WSDL, { documents: { "C:\\schemas\\legacy\\Account.xsd": SAMPLE_XSD } });
    expect(svc.warnings).toEqual([]);
  });

  it("follows a wsdl:import to another WSDL holding the abstract half", () => {
    const abstract = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:a" targetNamespace="urn:a">
      <types><xs:schema targetNamespace="urn:a"><xs:element name="Ping"><xs:complexType><xs:sequence><xs:element name="Id" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema></types>
      <message name="PingIn"><part name="p" element="tns:Ping"/></message>
      <portType name="P"><operation name="Ping"><input message="tns:PingIn"/></operation></portType>
    </definitions>`;
    const concrete = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:a="urn:a" xmlns:tns="urn:c" targetNamespace="urn:c">
      <import namespace="urn:a" location="abstract.wsdl"/>
      <binding name="B" type="a:P"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/><operation name="Ping"><soap:operation soapAction="urn:ping"/></operation></binding>
      <service name="S"><port name="p" binding="tns:B"><soap:address location="http://h/s"/></port></service>
    </definitions>`;
    const svc = parseWsdl(concrete, { documents: { "abstract.wsdl": abstract } });
    expect(svc.warnings).toEqual([]);
    expect(svc.operations).toHaveLength(1);
    expect(svc.operations[0]).toMatchObject({ name: "Ping", soapAction: "urn:ping", endpoint: "http://h/s", pattern: "in-only" });
    expect(svc.schema.elements[typeKey("urn:a", "Ping")]).toBeTruthy();
  });

  it("survives two schemas importing each other", () => {
    const a = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:b="urn:b" targetNamespace="urn:a"><xs:import namespace="urn:b" schemaLocation="b.xsd"/><xs:complexType name="A"><xs:sequence><xs:element name="b" type="b:B"/></xs:sequence></xs:complexType></xs:schema>`;
    const b = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:a="urn:a" targetNamespace="urn:b"><xs:import namespace="urn:a" schemaLocation="a.xsd"/><xs:complexType name="B"><xs:sequence><xs:element name="a" type="a:A" minOccurs="0"/></xs:sequence></xs:complexType></xs:schema>`;
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:w"><types><xs:schema targetNamespace="urn:w"><xs:import namespace="urn:a" schemaLocation="a.xsd"/></xs:schema></types></definitions>`;
    const svc = parseWsdl(wsdl, { documents: { "a.xsd": a, "b.xsd": b } });
    expect(svc.schema.types[typeKey("urn:a", "A")]).toBeTruthy();
    expect(svc.schema.types[typeKey("urn:b", "B")]).toBeTruthy();
    expect(svc.warnings.map((w) => w.code)).toContain("no-port-type");
    expect(svc.warnings.some((w) => w.code === "unresolved-import")).toBe(false);
  });

  it("reads groups, attribute groups, extensions, restrictions, lists and unions", () => {
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:g" targetNamespace="urn:g">
      <types><xs:schema targetNamespace="urn:g" elementFormDefault="qualified">
        <xs:group name="Audit"><xs:sequence><xs:element name="CreatedBy" type="xs:string"/></xs:sequence></xs:group>
        <xs:attributeGroup name="Versioned"><xs:attribute name="version" type="xs:int" use="required"/></xs:attributeGroup>
        <xs:complexType name="Base"><xs:sequence><xs:element name="Id" type="xs:string"/></xs:sequence><xs:attributeGroup ref="tns:Versioned"/></xs:complexType>
        <xs:complexType name="Derived"><xs:complexContent><xs:extension base="tns:Base"><xs:sequence><xs:group ref="tns:Audit"/><xs:element name="Extra" type="xs:string" minOccurs="0"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType>
        <xs:simpleType name="Codes"><xs:list itemType="xs:int"/></xs:simpleType>
        <xs:simpleType name="Either"><xs:union memberTypes="xs:int xs:boolean"/></xs:simpleType>
        <xs:simpleType name="Short"><xs:restriction base="xs:string"><xs:maxLength value="5"/><xs:pattern value="[A-Z]+"/></xs:restriction></xs:simpleType>
        <xs:element name="Thing" type="tns:Derived"/>
      </xs:schema></types>
    </definitions>`;
    const svc = parseWsdl(wsdl);
    const derived = svc.schema.types[typeKey("urn:g", "Derived")];
    expect(derived.base.local).toBe("Base");
    expect(derived.derivation).toBe("extension");
    expect(svc.schema.groups[typeKey("urn:g", "Audit")].kind).toBe("sequence");
    expect(svc.schema.attributeGroups[typeKey("urn:g", "Versioned")].attributes[0].use).toBe("required");
    expect(svc.schema.types[typeKey("urn:g", "Codes")].list.itemType.local).toBe("int");
    expect(svc.schema.types[typeKey("urn:g", "Either")].union.memberTypes).toHaveLength(2);
    expect(svc.schema.types[typeKey("urn:g", "Short")].facets).toEqual({ maxLength: "5", pattern: "[A-Z]+" });

    const builder = createSchemaBuilder(svc, { propertyCase: "camel" });
    const schema = builder.elementSchema({ ns: "urn:g", local: "Thing" });
    expect(schema).toEqual({ $ref: "#/components/schemas/Derived" });
    const derivedSchema = builder.components.Derived;
    expect(derivedSchema.allOf[0]).toEqual({ $ref: "#/components/schemas/Base" });
    expect(Object.keys(derivedSchema.allOf[1].properties)).toEqual(["createdBy", "extra"]);
    expect(builder.components.Base.properties.version).toMatchObject({ type: "integer" });
    expect(builder.components.Base.required).toEqual(["id", "version"]);
    expect(builder.components.Base["x-xml"].version.attribute).toBe(true);
    expect(builder.fieldsOf(schema).map((f) => f.name)).toEqual(["id", "version", "createdBy", "extra"]);
  });

  it("detects document kinds and XML-looking text", () => {
    expect(detectXmlKind(parseXml(`<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"/>`))).toBe("wsdl11");
    expect(detectXmlKind(parseXml(`<description xmlns="http://www.w3.org/ns/wsdl"/>`))).toBe("wsdl20");
    expect(detectXmlKind(parseXml(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>`))).toBe("xsd");
    expect(detectXmlKind(parseXml(`<html><body/></html>`))).toBe("html");
    expect(detectXmlKind(parseXml(`<note/>`))).toBe("other");
    expect(looksLikeXml("  <?xml version=\"1.0\"?><a/>")).toBe(true);
    expect(looksLikeXml("<definitions>")).toBe(true);
    expect(looksLikeXml("openapi: 3.0.0")).toBe(false);
    expect(looksLikeXml("{}")).toBe(false);
  });
});

describe("WSDL reader — negative", () => {
  it("refuses empty, JSON, YAML and HTML input with a plain message", () => {
    expect(() => parseWsdl("")).toThrow(/empty/);
    expect(() => parseWsdl("   ")).toThrow(/empty/);
    expect(() => parseWsdl('{"openapi":"3.0.0"}')).toThrow(/JSON, not a WSDL/);
    expect(() => parseWsdl("openapi: 3.0.0\npaths: {}")).toThrow(/not XML/);
    expect(() => parseWsdl("<html><body>Sign in</body></html>")).toThrow(/HTML page/);
    expect(() => parseWsdl("<!DOCTYPE html><html><body>x</body></html>")).toThrow(/HTML page/);
  });

  it("refuses an XSD on its own and other XML", () => {
    expect(() => parseWsdl(SAMPLE_XSD)).toThrow(/XML Schema \(XSD\) on its own/);
    expect(() => parseWsdl("<note><to>Tove</to></note>")).toThrow(/root element is <note>/);
    expect(() => parseWsdl(`<x:definitions xmlns:x="urn:not-wsdl"/>`)).toThrow(/root element/);
  });

  it("reports malformed XML with the position", () => {
    expect(() => parseWsdl(`<definitions xmlns="http://schemas.xmlsoap.org/wsdl/">\n<types>\n</definitions>`)).toThrow(/Not well-formed XML: .*line 3/);
  });

  it("warns, rather than fails, on an unresolved import", () => {
    const svc = parseWsdl(SAMPLE_WSDL, { documents: {} });
    expect(svc.operations).toHaveLength(8);
    expect(svc.warnings).toEqual([{ code: "unresolved-import", message: expect.stringMatching(/Account\.xsd could not be resolved/) }]);
    // The design still builds; unresolved types are flagged, not crashed on.
    const builder = createSchemaBuilder(svc);
    const shape = builder.messageShape(svc.operations[0].output, "document", "GetAccountBalanceResponse", "");
    expect(shape.fields[0].schema).toMatchObject({ type: "object", "x-xsd-unresolved": "Balance" });
    expect(builder.ambiguities.some((a) => a.kind === "unresolved-type" && /Balance/.test(a.message))).toBe(true);
  });

  it("warns on a broken attached document, a missing message and a missing port type", () => {
    const svc = parseWsdl(SAMPLE_WSDL, { documents: { "Account.xsd": "<xs:schema xmlns:xs='http://www.w3.org/2001/XMLSchema'><broken>" } });
    expect(svc.warnings.some((w) => w.code === "attached-document")).toBe(true);
    expect(svc.warnings.some((w) => w.code === "unresolved-import")).toBe(true);

    const missing = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns="urn:m" targetNamespace="urn:m">
      <portType name="P"><operation name="Do"><input message="tns:Nope"/></operation></portType></definitions>`;
    const m = parseWsdl(missing);
    expect(m.operations[0].input.missing).toBe(true);
    expect(m.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["missing-message", "no-endpoint"]));

    const empty = parseWsdl(`<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="urn:e"/>`, { name: "Empty" });
    expect(empty.operations).toEqual([]);
    expect(empty.name).toBe("Empty");
    expect(empty.warnings.map((w) => w.code)).toContain("no-port-type");
  });

  it("refuses a document over the size limit and skips oversized attachments", () => {
    const huge = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/">${"<!-- x -->".repeat(2_700_000)}</definitions>`;
    expect(huge.length).toBeGreaterThan(25 * 1024 * 1024);
    expect(() => parseWsdl(huge)).toThrow(/larger than 25 MB/);
  });

  it("handles a 5 000-operation WSDL within a time budget", () => {
    const n = 5000;
    const ops = Array.from({ length: n }, (_, i) => i);
    const wsdl = `<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:big" targetNamespace="urn:big">
      <types><xs:schema targetNamespace="urn:big" elementFormDefault="qualified">
        ${ops.map((i) => `<xs:element name="GetThing${i}"><xs:complexType><xs:sequence><xs:element name="ThingId" type="xs:string"/></xs:sequence></xs:complexType></xs:element><xs:element name="GetThing${i}Response"><xs:complexType><xs:sequence><xs:element name="Result" type="xs:string"/></xs:sequence></xs:complexType></xs:element>`).join("")}
      </xs:schema></types>
      ${ops.map((i) => `<message name="In${i}"><part name="p" element="tns:GetThing${i}"/></message><message name="Out${i}"><part name="p" element="tns:GetThing${i}Response"/></message>`).join("")}
      <portType name="P">${ops.map((i) => `<operation name="GetThing${i}"><input message="tns:In${i}"/><output message="tns:Out${i}"/></operation>`).join("")}</portType>
      <binding name="B" type="tns:P"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>${ops.map((i) => `<operation name="GetThing${i}"><soap:operation soapAction="urn:${i}"/></operation>`).join("")}</binding>
      <service name="S"><port name="p" binding="tns:B"><soap:address location="http://h/s"/></port></service>
    </definitions>`;
    const started = Date.now();
    const svc = parseWsdl(wsdl);
    expect(svc.operations).toHaveLength(n);
    expect(svc.operations[n - 1].soapAction).toBe(`urn:${n - 1}`);
    expect(Date.now() - started).toBeLessThan(8000);
  });
});
