import { describe, it, expect } from "vitest";
import { explainFetchFailure } from "../playground";

const refused = () => Promise.reject(new TypeError("Failed to fetch"));
const opaque = () => Promise.resolve({ type: "opaque" });

describe("explaining a failed fetch", () => {
  it("tells a local server that is not running from a remote host that is down", async () => {
    const local = await explainFetchFailure("http://localhost:8080/calculator/add", refused);
    expect(local.reachable).toBe(false);
    expect(local.text).toMatch(/Nothing is listening at http:\/\/localhost:8080/);
    expect(local.text).toMatch(/node adapter\.mjs/);
    const loopback = await explainFetchFailure("http://127.0.0.1:9090/x", refused);
    expect(loopback.text).toMatch(/Nothing is listening/);
    const remote = await explainFetchFailure("https://api.example.com/v1/accounts", refused);
    expect(remote.reachable).toBe(false);
    expect(remote.text).toMatch(/Nothing answered at https:\/\/api\.example\.com/);
    expect(remote.text).not.toMatch(/adapter/);
  });

  it("blames CORS only when the host actually answers", async () => {
    const probes = [];
    const cors = await explainFetchFailure("https://www.dneonline.com/calculator.asmx?x=1", (origin) => { probes.push(origin); return opaque(); });
    expect(cors.reachable).toBe(true);
    expect(cors.text).toMatch(/answered but does not allow cross-origin requests/);
    expect(probes).toEqual(["https://www.dneonline.com/"]);
  });

  it("copes with a URL that is not a URL", async () => {
    const bad = await explainFetchFailure("not a url", refused);
    expect(bad.reachable).toBeNull();
    expect(bad.text).toMatch(/could not be requested/);
  });
});
