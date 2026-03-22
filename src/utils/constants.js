import {
  Layers,
  Zap,
  Search,
  Share2,
  FileJson,
  Globe,
  FileCode2,
} from "lucide-react";

// ─── HTTP method colour map ──────────────────
export const METHOD_COLORS = {
  GET: {
    bg: "bg-emerald-600/20",
    text: "text-emerald-400",
    badge: "bg-emerald-600",
    glow: "shadow-emerald-500/50",
    line: "rgba(52,211,153,0.55)",
    dot: "#34d399",
  },
  POST: {
    bg: "bg-amber-600/20",
    text: "text-amber-400",
    badge: "bg-amber-600",
    glow: "shadow-amber-500/50",
    line: "rgba(251,191,36,0.55)",
    dot: "#fbbf24",
  },
  PUT: {
    bg: "bg-blue-600/20",
    text: "text-blue-400",
    badge: "bg-blue-600",
    glow: "shadow-blue-500/50",
    line: "rgba(96,165,250,0.55)",
    dot: "#60a5fa",
  },
  PATCH: {
    bg: "bg-purple-600/20",
    text: "text-purple-400",
    badge: "bg-purple-600",
    glow: "shadow-purple-500/50",
    line: "rgba(167,139,250,0.55)",
    dot: "#a78bfa",
  },
  DELETE: {
    bg: "bg-red-600/20",
    text: "text-red-400",
    badge: "bg-red-600",
    glow: "shadow-red-500/50",
    line: "rgba(248,113,113,0.55)",
    dot: "#f87171",
  },
};

export const methodColor = (m) => METHOD_COLORS[m] || METHOD_COLORS.GET;

export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
];

export const GRAPH_STYLES = ["tree", "flowchart", "radial", "mindmap", "graph"];

// ─── Glass morphism style objects (dark theme) ─
export const GLASS = {
  background: "rgba(12, 14, 18, 0.85)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(70,72,76,0.2)",
  boxShadow:
    "0 32px 64px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)",
};

export const GLASS_SUBTLE = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(70,72,76,0.2)",
};

// ─── Landing page feature cards ──────────────
export const FEATURES = [
  {
    icon: Layers,
    label: "4 Layouts",
    sub: "Tree · Flow · Radial · Mindmap",
  },
  { icon: Zap, label: "Playground", sub: "Live HTTP requests" },
  { icon: Search, label: "Smart Search", sub: "Filter by method or name" },
  { icon: Share2, label: "Canvas", sub: "Drag, pan & zoom" },
];

// ─── Landing page accepted formats ───────────
export const ACCEPTED_FORMATS = [
  { name: "Postman Collections", icon: FileJson },
  { name: "OpenAPI / Swagger", icon: Globe },
  { name: "Custom API JSON/YAML", icon: FileCode2 },
];

// ─── Sample data ─────────────────────────────
export const SAMPLES_META = [
  { key: "postman", label: "Postman Collection", desc: "Auth API" },
  { key: "openapi", label: "OpenAPI 3.0 Spec", desc: "Petstore" },
  { key: "custom", label: "Custom JSON", desc: "E-Commerce" },
];

export const SAMPLE_DATA = {
  postman: {
    info: { name: "Auth API Collection", version: "v2.4.0" },
    item: [
      {
        name: "User Management",
        item: [
          { name: "User Login", request: { method: "POST", url: "https://api.example.com/v1/auth/login", description: { content: "Authenticates a user and returns a bearer token." } } },
          { name: "Get Profile", request: { method: "GET", url: "https://api.example.com/v1/user/profile" } },
          { name: "Update Profile", request: { method: "PUT", url: "https://api.example.com/v1/user/profile" } },
          { name: "Delete Account", request: { method: "DELETE", url: "https://api.example.com/v1/user/:id" } },
        ],
      },
      {
        name: "Payment Gateway",
        item: [
          { name: "Create Payment", request: { method: "POST", url: "https://api.example.com/v1/payments", body: { raw: '{"amount":100,"currency":"USD"}' } } },
          { name: "Get Payment Status", request: { method: "GET", url: "https://api.example.com/v1/payments/:id" } },
          { name: "Refund Payment", request: { method: "POST", url: "https://api.example.com/v1/payments/:id/refund" } },
        ],
      },
      {
        name: "Products",
        item: [
          { name: "List Products", request: { method: "GET", url: "https://api.example.com/v1/products" } },
          { name: "Create Product", request: { method: "POST", url: "https://api.example.com/v1/products" } },
          { name: "Update Product", request: { method: "PATCH", url: "https://api.example.com/v1/products/:id" } },
          { name: "Delete Product", request: { method: "DELETE", url: "https://api.example.com/v1/products/:id" } },
        ],
      },
    ],
  },
  openapi: {
    openapi: "3.0.3",
    info: { title: "Petstore API", version: "1.0.0", description: "A sample pet store API" },
    servers: [{ url: "https://petstore.example.com/api/v1" }],
    paths: {
      "/pets": {
        get: { tags: ["Pets"], operationId: "listPets", summary: "List all pets", description: "Returns a paginated list of pets" },
        post: { tags: ["Pets"], operationId: "createPet", summary: "Create a pet", description: "Creates a new pet in the store", requestBody: { content: { "application/json": { example: { name: "Buddy", species: "dog", age: 3 } } } } },
      },
      "/pets/{petId}": {
        get: { tags: ["Pets"], operationId: "getPet", summary: "Get pet by ID", description: "Returns a single pet" },
        put: { tags: ["Pets"], operationId: "updatePet", summary: "Update a pet", description: "Updates an existing pet", requestBody: { content: { "application/json": { example: { name: "Buddy", age: 4 } } } } },
        delete: { tags: ["Pets"], operationId: "deletePet", summary: "Delete a pet", description: "Deletes a pet from the store" },
      },
      "/store/inventory": { get: { tags: ["Store"], operationId: "getInventory", summary: "Get inventory", description: "Returns pet inventories by status" } },
      "/store/orders": { post: { tags: ["Store"], operationId: "placeOrder", summary: "Place an order", description: "Place a new order for a pet", requestBody: { content: { "application/json": { example: { petId: 1, quantity: 1 } } } } } },
      "/store/orders/{orderId}": {
        get: { tags: ["Store"], operationId: "getOrder", summary: "Get order by ID", description: "Returns the order details" },
        delete: { tags: ["Store"], operationId: "deleteOrder", summary: "Delete order", description: "Cancel and delete an order" },
      },
      "/users/login": { post: { tags: ["Users"], operationId: "loginUser", summary: "User login", description: "Logs in and returns auth token" } },
      "/users/logout": { post: { tags: ["Users"], operationId: "logoutUser", summary: "User logout", description: "Logs out the current user" } },
      "/users/{userId}": {
        get: { tags: ["Users"], operationId: "getUser", summary: "Get user profile", description: "Returns the user profile" },
        put: { tags: ["Users"], operationId: "updateUser", summary: "Update user", description: "Update user profile information" },
      },
    },
  },
  custom: {
    name: "E-Commerce API",
    version: "v3.1",
    Authentication: [
      { name: "Register", method: "POST", url: "https://api.shop.io/v3/auth/register" },
      { name: "Login", method: "POST", url: "https://api.shop.io/v3/auth/login", body: { email: "user@example.com", password: "secret" } },
      { name: "Refresh Token", method: "POST", url: "https://api.shop.io/v3/auth/refresh" },
      { name: "Current User", method: "GET", url: "https://api.shop.io/v3/auth/me" },
    ],
    Products: [
      { name: "Search Products", method: "GET", url: "https://api.shop.io/v3/products?q=shoes" },
      { name: "Get Product", method: "GET", url: "https://api.shop.io/v3/products/:id" },
      { name: "Create Product", method: "POST", url: "https://api.shop.io/v3/products", body: { title: "Sneakers", price: 79.99 } },
      { name: "Update Product", method: "PATCH", url: "https://api.shop.io/v3/products/:id" },
      { name: "Delete Product", method: "DELETE", url: "https://api.shop.io/v3/products/:id" },
    ],
    Cart: [
      { name: "Get Cart", method: "GET", url: "https://api.shop.io/v3/cart" },
      { name: "Add to Cart", method: "POST", url: "https://api.shop.io/v3/cart/items", body: { productId: 42, quantity: 1 } },
      { name: "Remove Item", method: "DELETE", url: "https://api.shop.io/v3/cart/items/:id" },
      { name: "Checkout", method: "POST", url: "https://api.shop.io/v3/cart/checkout" },
    ],
  },
};
