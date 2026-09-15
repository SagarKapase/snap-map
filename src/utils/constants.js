// ─── HTTP method colour map ──────────────────
// GET green · POST blue · PUT orange · PATCH purple · DELETE red
export const METHOD_COLORS = {
  GET: {
    bg: "bg-[#34D399]/12",
    text: "text-[#34D399]",
    badge: "bg-[#34D399]",
    glow: "shadow-[#34D399]/40",
    border: "border-[#34D399]/30",
    line: "rgba(52,211,153,0.55)",
    dot: "#34d399",
  },
  POST: {
    bg: "bg-[#60A5FA]/12",
    text: "text-[#60A5FA]",
    badge: "bg-[#60A5FA]",
    glow: "shadow-[#60A5FA]/40",
    border: "border-[#60A5FA]/30",
    line: "rgba(96,165,250,0.55)",
    dot: "#60a5fa",
  },
  PUT: {
    bg: "bg-[#FB923C]/12",
    text: "text-[#FB923C]",
    badge: "bg-[#FB923C]",
    glow: "shadow-[#FB923C]/40",
    border: "border-[#FB923C]/30",
    line: "rgba(251,146,60,0.55)",
    dot: "#fb923c",
  },
  PATCH: {
    bg: "bg-[#C084FC]/12",
    text: "text-[#C084FC]",
    badge: "bg-[#C084FC]",
    glow: "shadow-[#C084FC]/40",
    border: "border-[#C084FC]/30",
    line: "rgba(192,132,252,0.55)",
    dot: "#c084fc",
  },
  DELETE: {
    bg: "bg-[#F43F5E]/12",
    text: "text-[#F43F5E]",
    badge: "bg-[#F43F5E]",
    glow: "shadow-[#F43F5E]/40",
    border: "border-[#F43F5E]/30",
    line: "rgba(244,63,94,0.55)",
    dot: "#f43f5e",
  },
};

// Short labels for compact badges
export const METHOD_SHORT = { DELETE: "DEL", OPTIONS: "OPT", PATCH: "PATCH" };

// Legend / filter order
export const LEGEND_METHODS = ["GET", "POST", "PUT", "DELETE"];

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
