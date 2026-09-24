import { describe, it, expect } from "vitest";
import { SOAP_WORKBENCH } from "../../features";
import { PRODUCTS, productFor } from "../../components/shell/products";

/**
 * The SOAP workbench is off for now. These cases hold the two things that
 * matters: nothing offers it while the flag is off, and the flag is the
 * only thing standing between it and being back.
 */
describe("feature flags", () => {
  it("keeps the SOAP workbench off unless the environment turns it on", () => {
    expect(SOAP_WORKBENCH).toBe(false);
  });

  it("offers no route to a feature that is off", () => {
    expect(PRODUCTS.map((p) => p.id)).toEqual(["home", "map", "graph", "tools"]);
    expect(PRODUCTS.some((p) => p.to === "/soap")).toBe(false);
    expect(productFor("/soap")).toBeNull();
    // The products that are on still resolve, including the alias.
    expect(productFor("/graph?ws=1".split("?")[0])?.id).toBe("graph");
    expect(productFor("/workspace")?.id).toBe("map");
    expect(productFor("/app")?.id).toBe("map");
    expect(productFor("/home")?.id).toBe("home");
    // A tool page is still inside Explore Tools, so the sidebar keeps it lit.
    expect(productFor("/tools")?.id).toBe("tools");
    expect(productFor("/tools/json-formatter")?.id).toBe("tools");
  });

  it("leaves the engine in place, so nothing has to be rebuilt to bring it back", async () => {
    const { wsdlToOpenApi } = await import("../soap/index.js");
    const { SAMPLE_WSDL, SAMPLE_XSD } = await import("../soap/samples.js");
    const { spec } = wsdlToOpenApi(SAMPLE_WSDL, { documents: { "Account.xsd": SAMPLE_XSD } });
    expect(Object.keys(spec.paths)).toHaveLength(8);
  });
});
