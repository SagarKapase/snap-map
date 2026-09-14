/**
 * A small sample estate for trying Contract Graph without any files to hand.
 *
 * Four REST services and one consumer collection, written to show the
 * findings the map looks for: an entity with two shapes, a duplicated
 * endpoint, an identifier spelled three ways, and a consumer whose host is a
 * variable. It is labelled as a sample wherever it appears.
 */

const customers = {
  openapi: "3.0.3",
  info: { title: "Customers", version: "1.4.0", description: "Customer profiles and addresses." },
  servers: [{ url: "https://customers.northwind.example/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Customer: {
        type: "object",
        required: ["id", "email"],
        properties: {
          id: { type: "string", example: "cus_8f2a91" },
          email: { type: "string", format: "email" },
          fullName: { type: "string" },
          address: { $ref: "#/components/schemas/Address" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Address: {
        type: "object",
        properties: { street: { type: "string" }, city: { type: "string" }, postcode: { type: "string" }, country: { type: "string" } },
      },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/customers": {
      get: { summary: "List customers", parameters: [{ name: "page", in: "query", schema: { type: "integer" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Customer" } } } } } } },
      post: { summary: "Create customer", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/customers/{id}": {
      get: { summary: "Get customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } } } },
    },
    "/customers/{id}/orders": {
      get: { summary: "Orders of a customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { example: [{ id: "ord_1", total: 42.5, status: "PAID" }] } } } } },
    },
  },
};

const orders = {
  openapi: "3.0.3",
  info: { title: "Orders", version: "2.1.0" },
  servers: [{ url: "https://orders.northwind.example" }],
  components: {
    schemas: {
      Order: {
        type: "object",
        required: ["id", "customerId", "lines"],
        properties: {
          id: { type: "string", example: "ord_4c1" },
          customerId: { type: "string", example: "cus_8f2a91" },
          status: { type: "string", enum: ["NEW", "PAID", "SHIPPED", "CANCELLED"] },
          total: { type: "number" },
          currency: { type: "string" },
          shippingAddress: { $ref: "#/components/schemas/Address" },
          lines: { type: "array", items: { $ref: "#/components/schemas/OrderLine" } },
        },
      },
      OrderLine: { type: "object", properties: { sku: { type: "string" }, quantity: { type: "integer" }, unitPrice: { type: "number" } } },
      Address: {
        type: "object",
        properties: { line1: { type: "string" }, line2: { type: "string" }, town: { type: "string" }, postalCode: { type: "integer" }, countryCode: { type: "string" } },
      },
    },
  },
  paths: {
    "/v2/orders": {
      get: { summary: "List orders", parameters: [{ name: "customerId", in: "query", schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Order" } } } } } } },
      post: { summary: "Create order", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/v2/orders/{orderId}": {
      get: { summary: "Get order", parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } } } },
    },
    "/v2/customers/{custId}": {
      get: { summary: "Customer profile (copy)", description: "Added for the checkout team; duplicates Customers.", parameters: [{ name: "custId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { example: { id: "cus_8f2a91", email: "ada@example.com", fullName: "Ada", address: {} } } } } } },
    },
  },
};

const payments = {
  openapi: "3.0.3",
  info: { title: "Payments", version: "1.0.0" },
  servers: [{ url: "https://payments.northwind.example" }],
  components: {
    securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
    schemas: {
      Payment: {
        type: "object",
        properties: {
          id: { type: "string" },
          orderId: { type: "string", example: "ord_4c1" },
          customerRef: { type: "string", example: "cus_8f2a91" },
          amount: { type: "integer", description: "Minor units" },
          status: { type: "string", enum: ["PENDING", "AUTHORISED", "CAPTURED", "FAILED"] },
        },
      },
    },
  },
  security: [{ apiKey: [] }],
  paths: {
    "/payments": { post: { summary: "Take payment", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } }, responses: { 201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } } } } },
    "/payments/{id}": { get: { summary: "Get payment", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } } } } },
  },
};

const shipping = {
  openapi: "3.0.3",
  info: { title: "Shipping", version: "3.0.0" },
  servers: [{ url: "https://shipping.northwind.example" }],
  components: {
    schemas: {
      Shipment: {
        type: "object",
        properties: {
          id: { type: "string" },
          orderRef: { type: "string", example: "ord_4c1" },
          customer_id: { type: "string" },
          status: { type: "string", enum: ["PENDING", "PICKED", "IN_TRANSIT", "DELIVERED"] },
          address: { $ref: "#/components/schemas/Address" },
        },
      },
      Address: { type: "object", properties: { street: { type: "string" }, city: { type: "string" }, postcode: { type: "string" }, country: { type: "string" } } },
    },
  },
  paths: {
    "/shipments": { post: { summary: "Create shipment", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Shipment" } } } }, responses: { 201: { description: "Created" } } } },
    "/shipments/{id}": { get: { summary: "Get shipment", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Shipment" } } } } } } },
  },
};

const mobileBff = {
  info: { name: "Mobile BFF", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  variable: [{ key: "ordersUrl", value: "https://orders.northwind.example" }],
  item: [
    { name: "Get order", request: { method: "GET", url: "{{ordersUrl}}/v2/orders/:orderId" } },
    { name: "Create order", request: { method: "POST", url: "{{ordersUrl}}/v2/orders", body: { mode: "raw", raw: "{\"customerId\":\"{{customerId}}\",\"lines\":[]}" } } },
    { name: "Get customer", request: { method: "GET", url: "https://customers.northwind.example/api/v1/customers/:id" } },
    { name: "Take payment", request: { method: "POST", url: "https://payments.northwind.example/payments" } },
  ],
};

export const SAMPLE_ESTATE = {
  name: "Northwind (sample)",
  services: [
    { name: "Customers", spec: customers },
    { name: "Orders", spec: orders },
    { name: "Payments", spec: payments },
    { name: "Shipping", spec: shipping },
    { name: "Mobile BFF (collection)", spec: mobileBff },
  ],
};
