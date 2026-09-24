#!/usr/bin/env node
// The bridge host on its own: `node server/bridge-host.mjs [--port 8090] [--data ./bridges] [--public https://api.example.com]`
// Run it where it can reach the SOAP services (inside the network), then point the
// workbench at it with VITE_BRIDGE_HOST=https://that-host — every uploaded WSDL is
// published there and its REST routes answer at https://that-host/bridge/b/<id>/...
import { startBridgeHost } from "./bridgeHost.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const port = Number(flag("--port", process.env.PORT || "8090"));
const dataDir = flag("--data", process.env.BRIDGE_DATA || "");
const publicBase = flag("--public", process.env.BRIDGE_PUBLIC_URL || "");

startBridgeHost({ port, dataDir, publicBase, log: (line) => console.log(line) })
  .then(({ bridgeHost, port: bound }) => {
    console.log(`Bridge host on http://localhost:${bound}${bridgeHost.prefix} (${bridgeHost.bridges.size} service${bridgeHost.bridges.size === 1 ? "" : "s"} loaded${dataDir ? ` from ${dataDir}` : ", memory only"})`);
    console.log(`  PUT ${bridgeHost.prefix}/bridges/<id> publishes a bridge; its REST API answers at ${bridgeHost.prefix}/b/<id>/...`);
  })
  .catch((e) => {
    console.error(e.code === "EADDRINUSE" ? `Port ${port} is already in use; start with --port <number>.` : `Could not start: ${e.message}`);
    process.exit(1);
  });
