import { describe, it, expect } from "vitest";
import { parseXml, XmlError, childrenOf, childOf, descendants, resolveQName, documentationOf, escapeXml } from "../soap/xml";

describe("XML parser — positive", () => {
  it("reads elements, attributes, text, namespaces and prefixes", () => {
    const root = parseXml(`<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns="http://default/" targetNamespace="urn:t">
  <!-- a comment -->
  <wsdl:message name="A"><wsdl:part name="p" element="tns:X"/></wsdl:message>
  <plain>text &amp; more &lt;b&gt; &#65;&#x42;</plain>
  <data><![CDATA[<raw> & stuff]]></data>
</wsdl:definitions>`);
    expect(root.local).toBe("definitions");
    expect(root.prefix).toBe("wsdl");
    expect(root.ns).toBe("http://schemas.xmlsoap.org/wsdl/");
    expect(root.attrs.targetNamespace).toBe("urn:t");
    const message = childOf(root, "message");
    expect(message.attrs.name).toBe("A");
    expect(childrenOf(message, "part")).toHaveLength(1);
    const plain = childOf(root, "plain");
    expect(plain.ns).toBe("http://default/");
    expect(plain.text).toBe("text & more <b> AB");
    expect(childOf(root, "data").text).toBe("<raw> & stuff");
    expect(descendants(root, "part")).toHaveLength(1);
    expect(root.line).toBe(2);
  });

  it("resolves QName attributes against the in-scope map", () => {
    const root = parseXml(`<a xmlns:tns="urn:a" xmlns="urn:default"><b xmlns:tns="urn:inner" type="tns:T" bare="U"/></a>`);
    const b = childOf(root, "b");
    expect(resolveQName(b, b.attrs.type)).toEqual({ ns: "urn:inner", local: "T", prefix: "tns" });
    expect(resolveQName(b, b.attrs.bare)).toEqual({ ns: "urn:default", local: "U", prefix: "" });
    expect(resolveQName(root, "tns:T").ns).toBe("urn:a");
  });

  it("reads documentation in WSDL and XSD styles", () => {
    const wsdl = parseXml(`<op><documentation>  Balance of   one account. </documentation></op>`);
    expect(documentationOf(wsdl)).toBe("Balance of one account.");
    const xsd = parseXml(`<t xmlns:xs="urn:x"><xs:annotation><xs:documentation>Money   with
  currency</xs:documentation></xs:annotation></t>`);
    expect(documentationOf(xsd)).toBe("Money with currency");
    expect(documentationOf(parseXml("<t/>"))).toBe("");
  });

  it("accepts a DOCTYPE without an internal subset, and skips processing instructions", () => {
    const root = parseXml(`<?xml version="1.0"?><!DOCTYPE definitions SYSTEM "wsdl.dtd"><?pi something?><definitions/>`);
    expect(root.local).toBe("definitions");
  });

  it("escapes text for output", () => {
    expect(escapeXml(`a<b>&"c"`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });

  it("parses a large document quickly", () => {
    const parts = Array.from({ length: 20000 }, (_, i) => `<item id="${i}"><name>Item ${i}</name></item>`).join("");
    const started = Date.now();
    const root = parseXml(`<list>${parts}</list>`);
    expect(root.children).toHaveLength(20000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("XML parser — negative", () => {
  const fails = (text, pattern) => {
    let error;
    try {
      parseXml(text);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(XmlError);
    expect(error.message).toMatch(pattern);
    return error;
  };

  it("refuses empty and non-XML input", () => {
    fails("", /empty/);
    fails("   \n ", /empty/);
    fails("just words", /before the root/);
    fails("{\"json\": true}", /before the root/);
  });

  it("names the line and column of an unclosed or mismatched tag", () => {
    const e = fails("<a>\n  <b>\n</a>", /<\/a> does not match <b>/);
    expect(e.line).toBe(3);
    expect(e.column).toBe(1);
    fails("<a><b></b>", /Unclosed element <a>/);
    fails("<a></b>", /does not match/);
    fails("</a>", /no opening tag/);
  });

  it("refuses two roots, text after the root and bad attributes", () => {
    fails("<a/><b/>", /More than one root/);
    fails("<a/>tail", /Text after the root/);
    fails("<a x=1/>", /quoted/);
    fails("<a x=\"1\" x=\"2\"/>", /appears twice/);
    fails("<a x=\"<\"/>", /contains "<"/);
    fails("<a x=\"1/>", /Unterminated attribute/);
  });

  it("refuses DOCTYPE with an internal subset (entity expansion)", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><lolz>&lol2;</lolz>`;
    fails(bomb, /internal subset/);
  });

  it("refuses undeclared prefixes and unknown entities", () => {
    fails("<x:a/>", /Undeclared namespace prefix "x"/);
    fails("<a>&nope;</a>", /Unknown entity/);
    fails("<a>&#xZZ;</a>", /Bad character reference|Unknown entity/);
  });

  it("refuses unterminated comments and CDATA", () => {
    fails("<a><!-- open", /Unterminated comment/);
    fails("<a><![CDATA[open", /Unterminated CDATA/);
    fails("<a><?pi open", /Unterminated processing/);
  });
});
