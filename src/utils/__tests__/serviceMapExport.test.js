import { describe, it, expect } from "vitest";
import { buildEstatePayload, estateShareUrl, estateEmbedSnippet, readSharedEstate, isEstatePayload, safeFilename } from "../serviceMapExport";
import { SAMPLE_ESTATE } from "../contractSamples";

const services = SAMPLE_ESTATE.services.map((s) => ({ name: s.name, spec: s.spec }));

describe("estate links", () => {
  it("round-trips the estate and the arrangement through a link", () => {
    const payload = buildEstatePayload({ name: "Northwind", services, positionsByName: { Orders: { x: 120, y: 340 } } });
    const share = estateShareUrl(payload, { origin: "https://vizroute.test" });
    expect(share.ok).toBe(true);
    expect(share.url.startsWith("https://vizroute.test/graph?estate=")).toBe(true);
    const back = readSharedEstate(new URL(share.url).search);
    expect(back.name).toBe("Northwind");
    expect(back.services.map((s) => s.name)).toEqual(services.map((s) => s.name));
    expect(back.services[1].spec.info.title).toBe("Orders");
    expect(back.positions.Orders).toEqual({ x: 120, y: 340 });
  });
  it("refuses a link that would not open, and says why", () => {
    const huge = buildEstatePayload({ name: "big", services: Array.from({ length: 200 }, (_, i) => ({ name: `S${i}`, spec: services[1].spec })) });
    const share = estateShareUrl(huge, { origin: "https://vizroute.test" });
    expect(share.ok).toBe(false);
    expect(share.reason).toBe("too-large");
    expect(share.bytes).toBeGreaterThan(200000);
  });
  it("embeds point at the embed route", () => {
    const embed = estateEmbedSnippet(buildEstatePayload({ name: "n", services: services.slice(0, 2) }), { origin: "https://vizroute.test" });
    expect(embed.ok).toBe(true);
    expect(embed.url).toMatch(/^https:\/\/vizroute\.test\/embed-graph\?estate=/);
    expect(embed.snippet).toMatch(/^<iframe src="https:\/\/vizroute\.test\/embed-graph\?estate=/);
  });
  it("ignores links that carry something else", () => {
    expect(readSharedEstate("?estate=not-a-payload")).toBeNull();
    expect(readSharedEstate("?spec=abc")).toBeNull();
    expect(readSharedEstate("")).toBeNull();
    expect(isEstatePayload({ vizroute: "contract-graph-workspace", services: [] })).toBe(true);
    expect(isEstatePayload({ vizroute: "other", services: [] })).toBe(false);
  });
  it("drops services without a spec and makes safe filenames", () => {
    const payload = buildEstatePayload({ name: "x", services: [{ name: "a", spec: null }, { name: "b", spec: {} }] });
    expect(payload.services.map((s) => s.name)).toEqual(["b"]);
    expect(safeFilename("Northwind (sample)!")).toBe("Northwind_sample");
    expect(safeFilename("")).toBe("service-map");
  });
});
