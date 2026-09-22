import { Home, Waypoints, Network, ArrowRightLeft } from "lucide-react";
import { SOAP_WORKBENCH } from "../../features";

/**
 * The areas of the product. Every app page shows the same list next to the
 * brand, so wherever someone lands they can reach everything else. New
 * products are added here and nowhere else.
 */
const ALL_PRODUCTS = [
  { id: "home", label: "Home", to: "/home", icon: Home, hint: "Recent APIs, workspaces and tools" },
  { id: "map", label: "API Map", to: "/workspace", icon: Waypoints, hint: "One specification: map, playground, audit, tools" },
  { id: "graph", label: "Contract Graph", to: "/graph", icon: Network, hint: "Many services: shared entities, duplicates, dependencies", requiresAccount: true },
  { id: "soap", label: "SOAP Workbench", to: "/soap", icon: ArrowRightLeft, hint: "WSDL to a REST design, OpenAPI, adapters and parity tests", enabled: SOAP_WORKBENCH },
];

/** The areas a person can reach; a feature that is off is not one of them. */
export const PRODUCTS = ALL_PRODUCTS.filter((p) => p.enabled !== false);

export const productFor = (pathname) =>
  PRODUCTS.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`)) ||
  (pathname === "/app" ? PRODUCTS[1] : null);
