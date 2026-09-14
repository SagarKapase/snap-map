import { Home, Waypoints, Network } from "lucide-react";

/**
 * The areas of the product. Every app page shows the same list next to the
 * brand, so wherever someone lands they can reach everything else. New
 * products are added here and nowhere else.
 */
export const PRODUCTS = [
  { id: "home", label: "Home", to: "/home", icon: Home, hint: "Recent APIs, workspaces and tools" },
  { id: "map", label: "API Map", to: "/workspace", icon: Waypoints, hint: "One specification: map, playground, audit, tools" },
  { id: "graph", label: "Contract Graph", to: "/graph", icon: Network, hint: "Many services: shared entities, duplicates, dependencies" },
];

export const productFor = (pathname) =>
  PRODUCTS.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`)) ||
  (pathname === "/app" ? PRODUCTS[1] : null);
