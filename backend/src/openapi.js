const string = { type: "string" },
  uuid = { type: "string", format: "uuid" },
  object = (properties) => ({
    type: "object",
    properties,
    additionalProperties: false,
    required: Object.keys(properties),
  });
const schemas = {
  Register: object({
    name: string,
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 12, maxLength: 128 },
    role: { type: "string", enum: ["buyer", "seller"] },
  }),
  Login: object({
    email: { type: "string", format: "email" },
    password: string,
  }),
  Listing: object({
    title: { type: "string", minLength: 3, maxLength: 100 },
    description: { type: "string", minLength: 15, maxLength: 2000 },
    price: { type: "number", minimum: 0, exclusiveMinimum: true },
    category_id: { type: "integer", minimum: 1 },
    location: string,
    condition: { type: "string", enum: ["New", "Like new", "Good", "Fair"] },
    images: {
      type: "array",
      maxItems: 6,
      items: { type: "string", pattern: "^/uploads/[a-f0-9-]+\\.webp$" },
    },
  }),
  Review: object({
    rating: { type: "integer", minimum: 1, maximum: 5 },
    text: string,
  }),
  Verification: object({
    identity_type: { type: "string", enum: ["nic", "business"] },
    identity_number: string,
    phone: { type: "string", pattern: "^\\+94[1-9]\\d{8}$" },
  }),
  User: object({
    id: uuid,
    name: string,
    email: string,
    role: { type: "string", enum: ["buyer", "seller", "admin"] },
    status: string,
    verification_status: string,
    phone_verified: { type: "boolean" },
    verification_note: { type: "string", nullable: true },
  }),
  Session: object({
    accessToken: string,
    user: { $ref: "#/components/schemas/User" },
  }),
  Error: object({ error: string }),
};
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "NearBuy API",
    version: "2.0.0",
    description:
      "Persistent PostgreSQL marketplace. Bearer tokens expire after 10 minutes. Refresh cookies are HttpOnly, SameSite=Strict and rotate on every refresh. Cookie endpoints require an allowlisted Origin and X-NearBuy-CSRF: 1. No public admin registration. Active sellers publish immediately with a public verification status. All reporting periods use Asia/Colombo.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "nb_refresh" },
    },
    schemas,
  },
  paths: {},
};
function route(
  method,
  path,
  summary,
  {
    body,
    publicRoute = false,
    query = [],
    file,
    response,
    description = "",
  } = {},
) {
  const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema:
      m[1] === "id" && path.includes("categories") ? { type: "integer" } : uuid,
  }));
  params.push(
    ...query.map(([name, type = "string", desc = ""]) => ({
      name,
      in: "query",
      description: desc,
      schema: { type },
    })),
  );
  const op = {
    summary,
    description,
    tags: [path.split("/")[1]],
    security: publicRoute ? [] : [{ bearerAuth: [] }],
    parameters: params,
    responses: {
      [method === "post" &&
      [
        "/auth/register",
        "/categories",
        "/listings",
        "/uploads",
        "/listings/{id}/reviews",
        "/listings/{id}/messages",
      ].includes(path)
        ? 201
        : 200]: {
        description: "Success",
        content: {
          [file || "application/json"]: {
            schema: file
              ? { type: "string", format: "binary" }
              : response
                ? { $ref: "#/components/schemas/" + response }
                : {
                    type: "object",
                    description:
                      "Resource or resource list, as described by the operation.",
                  },
          },
        },
      },
      400: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      401: { description: "Missing, expired, or revoked authentication" },
      403: {
        description: "Forbidden by role, ownership or interaction eligibility",
      },
      404: { description: "Resource not found" },
      409: { description: "Duplicate or conflicting state" },
      429: { description: "Rate limit reached" },
    },
  };
  if (body)
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema:
            typeof body === "string"
              ? { $ref: "#/components/schemas/" + body }
              : body,
        },
      },
    };
  if (method === "delete") {
    delete op.responses[200];
    op.responses[204] = { description: "Deleted" };
  }
  (openapi.paths[path] ??= {})[method] = op;
  return op;
}
route("get", "/health", "API health", { publicRoute: true });
route("post", "/auth/register", "Register buyer or seller", {
  body: "Register",
  publicRoute: true,
});
route("post", "/auth/login", "Sign in", {
  body: "Login",
  publicRoute: true,
  response: "Session",
});
route("get", "/auth/me", "Current account", { response: "User" });
for (const p of ["refresh", "logout"]) {
  const op = route(
    "post",
    "/auth/" + p,
    p === "refresh"
      ? "Rotate refresh token and issue access token"
      : "Revoke session family",
  );
  op.security = [{ refreshCookie: [] }];
  op.parameters.push(
    { in: "header", name: "Origin", required: true, schema: string },
    {
      in: "header",
      name: "X-NearBuy-CSRF",
      required: true,
      schema: { type: "string", enum: ["1"] },
    },
  );
}
route("get", "/categories", "List categories", { publicRoute: true });
route("post", "/categories", "Admin: create category", {
  body: object({ name: string }),
});
route("patch", "/categories/{id}", "Admin: rename category", {
  body: object({ name: string }),
});
route("delete", "/categories/{id}", "Admin: delete unused category");
route("get", "/listings", "Browse active listings or own inventory", {
  publicRoute: true,
  query: [
    ["q"],
    ["category", "integer"],
    ["location"],
    [
      "mine",
      "string",
      "Set true with authentication to see your drafts/sold/removed listings",
    ],
    ["offset", "integer", "Page offset; each response has up to 100 items"],
  ],
});
route("post", "/listings", "Seller: create an immediately visible listing", {
  body: "Listing",
});
route(
  "get",
  "/listings/{id}",
  "View listing; drafts only visible to owner/admin",
  { publicRoute: true },
);
route("put", "/listings/{id}", "Seller: replace own editable listing", {
  body: "Listing",
});
route("delete", "/listings/{id}", "Seller owner or admin: soft-delete listing");
route("patch", "/listings/{id}/sold", "Seller: mark own active listing sold");
route("post", "/listings/{id}/flag", "Report a listing", {
  body: object({ reason: string }),
});
const upload = route(
  "post",
  "/uploads",
  "Seller: upload image; maximum 5 MiB, verified magic bytes and MIME; re-encoded to WebP",
);
upload.requestBody = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: object({ image: { type: "string", format: "binary" } }),
    },
  },
};
route("get", "/listings/{id}/reviews", "List peer reviews", {
  publicRoute: true,
});
route(
  "post",
  "/listings/{id}/reviews",
  "Buyer: one review after sending a message",
  { body: "Review" },
);
route("patch", "/reviews/{id}", "Buyer: edit own review", { body: "Review" });
route("delete", "/reviews/{id}", "Buyer owner or admin: delete review");
route("get", "/conversations", "Own conversations; no admin chat access");
route(
  "get",
  "/listings/{id}/messages",
  "Read private thread; REST polling fallback",
  {
    query: [["buyer_id", "string", "Required for listing owner (seller)"]],
    description:
      "Last 200 messages in chronological order. Buyers are always scoped to their own thread. Socket.io handshake at /socket.io uses auth.token. Server emits message events only to participant user rooms. Write through POST for shared validation/rate limits. Reconnect with refreshed JWT when access expires.",
  },
);
const msg = object({ text: string, buyer_id: uuid });
msg.required = ["text"];
route(
  "post",
  "/listings/{id}/messages",
  "Send buyer/seller message and emit Socket.io event",
  { body: msg },
);
route("get", "/verification", "Seller verification state", {
  response: "User",
});
route(
  "post",
  "/verification",
  "Seller: submit identity and request phone code",
  { body: "Verification" },
);
route(
  "post",
  "/verification/confirm-phone",
  "Confirm code; enqueue pending verification",
  { body: object({ code: { type: "string", pattern: "^[0-9]{6}$" } }) },
);
for (const [p, desc] of [
  ["users", "Account list"],
  ["verifications", "Pending verification queue (sensitive; access audited)"],
  ["flags", "Reported listings"],
  ["audit", "Latest 500 audit events"],
  ["stats", "Platform totals"],
])
  route("get", "/admin/" + p, "Admin: " + desc);
const userChange = object({
  role: { type: "string", enum: ["buyer", "seller", "admin"] },
  status: { type: "string", enum: ["active", "suspended"] },
});
delete userChange.required;
route(
  "patch",
  "/admin/users/{id}",
  "Admin: change account role/status and revoke sessions",
  { body: userChange },
);
route(
  "patch",
  "/admin/verifications/{id}",
  "Admin: approve or reject verified-phone submission",
  {
    body: object({
      decision: { type: "string", enum: ["verified", "rejected"] },
      note: string,
    }),
  },
);
route("patch", "/admin/flags/{id}", "Admin: decide report", {
  body: object({ decision: { type: "string", enum: ["approve", "remove"] } }),
});
for (const [p, title, monthly, pdf] of [
  ["seller/monthly-sales", "Seller monthly sales", true, true],
  ["seller/daily-inquiries", "Seller daily inquiries", false, false],
  ["admin/daily-activity", "Admin daily activity", false, true],
  ["admin/monthly-audit", "Admin monthly audit logs", true, false],
])
  route("get", "/reports/" + p, title, {
    file: pdf ? "application/pdf" : "text/csv",
    query: [
      [
        monthly ? "month" : "date",
        "string",
        monthly
          ? "YYYY-MM, defaults to current month"
          : "YYYY-MM-DD, defaults to today",
      ],
    ],
  });

const dateTime = { type: "string", format: "date-time" };
Object.assign(schemas, {
  Category: object({ id: { type: "integer" }, name: string }),
  ListingResult: {
    type: "object",
    properties: {
      id: uuid,
      seller_id: uuid,
      owner: uuid,
      title: string,
      description: string,
      price: { type: "number" },
      category_id: { type: "integer" },
      category: string,
      location: string,
      condition: { type: "string", enum: ["New", "Like new", "Good", "Fair"] },
      status: {
        type: "string",
        enum: ["draft", "approved", "pending_admin", "sold", "removed"],
      },
      images: { type: "array", items: string },
      seller: string,
      verification_status: {
        type: "string",
        enum: ["unverified", "pending", "verified", "rejected"],
      },
      flagged: { type: "boolean" },
      created_at: dateTime,
      updated_at: dateTime,
      createdAt: dateTime,
      soldAt: { ...dateTime, nullable: true },
    },
  },
  ReviewResult: {
    type: "object",
    properties: {
      id: uuid,
      listing_id: uuid,
      buyer_id: uuid,
      rating: { type: "integer" },
      text: string,
      body: string,
      name: string,
      created_at: dateTime,
    },
  },
  ChatMessage: {
    type: "object",
    properties: {
      id: uuid,
      listing_id: uuid,
      buyer_id: uuid,
      sender_id: uuid,
      sender: string,
      text: string,
      time: dateTime,
    },
  },
  Conversation: object({
    listing_id: uuid,
    buyer_id: uuid,
    title: string,
    buyer_name: string,
    last_message_at: dateTime,
  }),
  VerificationRequest: object({
    id: uuid,
    name: string,
    email: string,
    identity_type: string,
    identity_number: string,
    phone: string,
    phone_verified: { type: "boolean" },
    verification_status: string,
  }),
  Flag: object({
    id: uuid,
    title: string,
    status: string,
    flag_reason: string,
    seller: string,
  }),
  AuditEvent: object({
    id: uuid,
    action: string,
    target: { ...string, nullable: true },
    metadata: { type: "object", additionalProperties: true },
    time: dateTime,
    actor: string,
  }),
  Stats: object({
    users: { type: "integer" },
    listings: { type: "integer" },
    flags: { type: "integer" },
    events: { type: "integer" },
  }),
  Message: object({ message: string }),
});
function returns(method, path, schema, array = false) {
  const op = openapi.paths[path][method];
  for (const [code, result] of Object.entries(op.responses)) {
    if (Number(code) >= 200 && Number(code) < 300 && code !== "204")
      result.content = {
        "application/json": {
          schema: array
            ? {
                type: "array",
                items: { $ref: "#/components/schemas/" + schema },
              }
            : { $ref: "#/components/schemas/" + schema },
        },
      };
  }
}
for (const [method, path, schema, array] of [
  ["get", "/categories", "Category", true],
  ["post", "/categories", "Category"],
  ["patch", "/categories/{id}", "Category"],
  ["get", "/listings", "ListingResult", true],
  ["post", "/listings", "ListingResult"],
  ["get", "/listings/{id}", "ListingResult"],
  ["put", "/listings/{id}", "ListingResult"],
  ["patch", "/listings/{id}/sold", "ListingResult"],
  ["get", "/listings/{id}/reviews", "ReviewResult", true],
  ["post", "/listings/{id}/reviews", "ReviewResult"],
  ["patch", "/reviews/{id}", "ReviewResult"],
  ["get", "/conversations", "Conversation", true],
  ["get", "/listings/{id}/messages", "ChatMessage", true],
  ["post", "/listings/{id}/messages", "ChatMessage"],
  ["get", "/admin/users", "User", true],
  ["patch", "/admin/users/{id}", "User"],
  ["get", "/admin/verifications", "VerificationRequest", true],
  ["get", "/admin/flags", "Flag", true],
  ["get", "/admin/audit", "AuditEvent", true],
  ["get", "/admin/stats", "Stats"],
  ["post", "/auth/refresh", "Session"],
])
  returns(method, path, schema, array);
for (const [method, path] of [
  ["post", "/auth/register"],
  ["post", "/auth/logout"],
  ["post", "/verification"],
  ["post", "/verification/confirm-phone"],
  ["post", "/listings/{id}/flag"],
  ["patch", "/admin/verifications/{id}"],
  ["patch", "/admin/flags/{id}"],
])
  returns(method, path, "Message");
openapi.paths["/uploads"].post.responses[201].content[
  "application/json"
].schema = object({ url: string });
openapi.paths["/health"].get.responses[200].content["application/json"].schema =
  object({ status: string });

route(
  "get",
  "/auth/demo-accounts",
  "Local presentation credential-fill options (404 when demo mode is disabled)",
  {
    publicRoute: true,
    description:
      "Fictional demo accounts only. Uses normal POST /auth/login afterwards. Disabled in production. No-store response.",
  },
);
openapi.paths["/auth/demo-accounts"].get.responses[200].content[
  "application/json"
].schema = {
  type: "array",
  items: object({
    label: string,
    name: string,
    role: string,
    email: string,
    password: string,
  }),
};
schemas.Listing.properties.specs = {
  type: "object",
  maxProperties: 20,
  additionalProperties: { type: "string", minLength: 1, maxLength: 160 },
};
schemas.ListingResult.properties.specs = schemas.Listing.properties.specs;
schemas.User.properties.location = { type: "string", nullable: true };

delete openapi.paths["/verification"].post.responses[201];
openapi.paths["/verification"].post.responses[200].content[
  "application/json"
].schema = {
  type: "object",
  properties: {
    message: string,
    devOtp: {
      type: "string",
      pattern: "^[0-9]{6}$",
      description: "Development only. Omitted in production.",
    },
    expiresInSeconds: { type: "integer" },
  },
};

// Registration and identity document contracts.
const phoneSchema = { type: "string", pattern: "^\\+94[1-9]\\d{8}$" };
const registrationBase = {
  name: string,
  email: { ...string, format: "email" },
  password: { ...string, minLength: 12, maxLength: 128 },
  phone: phoneSchema,
};
schemas.BuyerRegistration = object({
  ...registrationBase,
  role: { ...string, enum: ["buyer"] },
  challengeId: { ...string, minLength: 64, maxLength: 64 },
});
schemas.SellerRegistration = object({
  ...registrationBase,
  role: { ...string, enum: ["seller"] },
  nic_number: string,
  nic_photo: { type: "string", format: "binary" },
  product_category: string,
  address: string,
  district: string,
  seller_terms: { ...string, enum: ["agree"] },
});
schemas.Register = {
  oneOf: [
    { $ref: "#/components/schemas/BuyerRegistration" },
    { $ref: "#/components/schemas/SellerRegistration" },
  ],
};
openapi.paths["/auth/register"].post.requestBody.content = {
  "multipart/form-data": { schema: { $ref: "#/components/schemas/Register" } },
  "application/json": {
    schema: { $ref: "#/components/schemas/BuyerRegistration" },
  },
};
openapi.paths["/auth/register"].post.description =
  "Buyer: first request and confirm an OTP bound to this email/mobile number. Seller: supply all fields and NIC photo; district must be one of the 25 Sri Lankan districts, category must exist or be Other. Images: JPEG/PNG/WebP, maximum 5 MB.";
route("post", "/auth/registration-otp", "Send buyer registration phone OTP", {
  publicRoute: true,
  body: object({ email: { ...string, format: "email" }, phone: phoneSchema }),
  description:
    "Returns opaque challengeId and devOtp only outside production. Code expires in 10 minutes; delivery uses the configured SMS webhook. Development outbox: registration-phone-outbox.json.",
});
route("post", "/auth/confirm-registration-otp", "Verify buyer mobile number", {
  publicRoute: true,
  body: object({
    challengeId: string,
    code: { ...string, pattern: "^\\d{6}$" },
  }),
  description:
    "At most five attempts; registration consumes the verified challenge once.",
});
route("post", "/auth/mock-oauth", "Local demo OAuth buyer login", {
  publicRoute: true,
  body: object({
    provider: { ...string, enum: ["google", "facebook", "apple"] },
  }),
  response: "Session",
  description:
    "Available only with demo mode enabled outside production. No external OAuth authentication or user-supplied identity is accepted.",
});
schemas.Verification = object({
  identity_type: { ...string, enum: ["nic"] },
  identity_number: string,
  phone: phoneSchema,
  br_number: string,
  br_photo: { type: "string", format: "binary" },
  legal_agreement: { ...string, enum: ["agree"] },
});
schemas.Verification.properties.nic_photo = {
  type: "string",
  format: "binary",
  description: "Required if no NIC photo is already saved.",
};
openapi.paths["/verification"].post.requestBody.content = {
  "multipart/form-data": {
    schema: { $ref: "#/components/schemas/Verification" },
  },
};
Object.assign(schemas.VerificationRequest.properties, {
  br_number: string,
  has_nic_photo: { type: "boolean" },
  has_br_photo: { type: "boolean" },
  address: string,
  district: string,
  product_category: string,
  seller_terms_at: { ...dateTime, nullable: true },
  legal_agreement_at: { ...dateTime, nullable: true },
});
const docRoute = route(
  "get",
  "/admin/verifications/{id}/documents/{kind}",
  "Admin: inspect private NIC or BR photo",
  {
    description:
      "Returns {image: data:image/webp;base64,...}. Requires admin; access audited, Cache-Control no-store. Photos are encrypted in PostgreSQL, never public uploads.",
  },
);
docRoute.parameters.find((p) => p.name === "kind").schema = {
  type: "string",
  enum: ["nic", "br"],
};

const paymentMethods = {
  type: "array",
  maxItems: 2,
  uniqueItems: true,
  items: { type: "string", enum: ["Cash on Delivery", "Online Payment"] },
};
Object.assign(schemas.Listing.properties, {
  size_weight: { type: "string", maxLength: 160 },
  payment_methods: paymentMethods,
});
schemas.Listing.properties.images.maxItems = 8;
schemas.Listing.required = [];
schemas.Listing.properties.price.nullable = true;
schemas.Listing.properties.category_id.nullable = true;
schemas.Listing.properties.condition.enum.unshift("");
Object.assign(schemas.ListingResult.properties, {
  size_weight: string,
  payment_methods: paymentMethods,
  can_review: { type: "boolean" },
  seller_rating: { type: "string", nullable: true },
  seller_review_count: { type: "integer" },
  approval_note: { ...string, nullable: true },
});
for (const [method, path] of [
  ["post", "/listings"],
  ["put", "/listings/{id}"],
])
  openapi.paths[path][method].description =
    "Sellers: eight complete details (name >=3 characters, size/weight, 1–8 owned uploaded photos, description >=15 characters, category, condition, positive price, at least one supported payment method) yield approved. Missing/short details yield pending_admin; invalid or unsafe values are rejected. Edits recalculate approval. Other is a regular category.";
route("post", "/listings/{id}/orders", "Buyer: place an order", {
  body: object({
    address: { type: "string", minLength: 10, maxLength: 500 },
    payment_method: {
      type: "string",
      enum: ["Cash on Delivery", "Online Payment"],
    },
  }),
  description:
    "Only approved listings from active sellers, using their enabled payment methods. Price and seller are taken from the database. Address is encrypted. One order per buyer/product; duplicate returns 409. This records an unpaid order, never processes a payment. Successful order enables reviews.",
});
openapi.paths["/listings/{id}/orders"].post.responses[201] =
  openapi.paths["/listings/{id}/orders"].post.responses[200];
delete openapi.paths["/listings/{id}/orders"].post.responses[200];
route(
  "get",
  "/admin/listing-approvals",
  "Admin: pending listings with missing_details",
);
route(
  "patch",
  "/admin/listing-approvals/{id}",
  "Admin: approve or reject incomplete listing",
  {
    body: object({
      decision: { type: "string", enum: ["approved", "removed"] },
      note: { type: "string", minLength: 3, maxLength: 300 },
    }),
    description:
      "Only pending_admin listings with an active seller. Decisions are audited.",
  },
);
openapi.paths["/listings/{id}/reviews"].post.description =
  "Buyer must have placed an order for this listing. Messaging alone is not sufficient. One review per buyer/listing.";
openapi.paths["/reviews/{id}"].patch.description =
  "Only the review owner with an order for the same listing may update it.";

route("get", "/orders", "Buyer/seller: own orders only", {
  description:
    "Returns up to 100 recent orders involving the signed-in user, including their delivery addresses. Never public; Cache-Control no-store.",
});

route("get", "/profile", "Read own private profile");
route("patch", "/profile", "Buyer: update name, phone and delivery address", {
  body: object({ name: string, phone: phoneSchema, address: string }),
  description:
    "Changing phone resets phone_verified. Address and phone are encrypted.",
});
route(
  "post",
  "/profile/password",
  "Buyer: change password and revoke all sessions",
  {
    body: object({
      current_password: string,
      password: { ...string, minLength: 12, maxLength: 128 },
    }),
  },
);
route("get", "/cart", "Buyer: own persistent cart");
route("put", "/cart/{id}", "Buyer: add item or set quantity", {
  body: object({ quantity: { type: "integer", minimum: 1, maximum: 99 } }),
});
route("delete", "/cart/{id}", "Buyer: remove own cart item");
route("post", "/cart/checkout", "Buyer: atomically place cart orders", {
  body: object({
    address: string,
    payments: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: ["Cash on Delivery", "Online Payment"],
      },
    },
  }),
  description:
    "Payments maps listing UUIDs to seller-supported methods. Uses server prices and quantities; any unavailable/previously ordered item rolls back the entire checkout. Orders remain unpaid.",
});
route("patch", "/orders/{id}/status", "Seller: advance own order status", {
  body: object({
    status: { type: "string", enum: ["Pending", "Confirmed", "Delivered"] },
  }),
  description: "Pending to Confirmed to Delivered only. Changes audited.",
});
for (const kind of ["sales", "listings"])
  for (const format of ["pdf", "csv"])
    route(
      "get",
      `/reports/seller/${kind}/${format}`,
      `Seller: export ${kind} as ${format}`,
      { file: format === "pdf" ? "application/pdf" : "text/csv" },
    );

Object.assign(schemas.Listing.properties, {
  district: { type: "string" },
  stock_quantity: { type: "integer", minimum: 0, maximum: 1000000 },
  variants: {
    type: "object",
    maxProperties: 5,
    additionalProperties: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", maxLength: 60 },
    },
  },
});
Object.assign(schemas.ListingResult.properties, {
  district: string,
  stock_quantity: { type: "integer" },
  variants: schemas.Listing.properties.variants,
});
const selection = {
  type: "object",
  maxProperties: 5,
  additionalProperties: { type: "string" },
};
Object.assign(
  openapi.paths["/listings/{id}/orders"].post.requestBody.content[
    "application/json"
  ].schema.properties,
  {
    quantity: { type: "integer", minimum: 1, maximum: 99, default: 1 },
    selected_variants: selection,
    card_simulation: {
      type: "boolean",
      description:
        "Local simulation only; no card fields are accepted by the API.",
    },
  },
);
openapi.paths["/cart/{id}"].put.requestBody.content[
  "application/json"
].schema.properties.selected_variants = selection;
openapi.paths["/cart/checkout"].post.requestBody.content[
  "application/json"
].schema.properties.card_simulation = { type: "boolean" };
openapi.paths["/orders/{id}/status"].patch.requestBody.content[
  "application/json"
].schema.properties.status.enum = [
  "Pending",
  "Confirmed",
  "Packing",
  "Delivered",
];
openapi.paths["/orders/{id}/status"].patch.description =
  "Seller only: Pending -> Confirmed -> Packing -> Delivered. No skipping or backwards transitions.";
openapi.paths["/listings/{id}/orders"].post.description +=
  " Quantity must fit shared item stock and every variant selection must match seller options. Checkout atomically decrements stock and records 7% platform_fee and net_payout. Online Payment requires card_simulation=true outside production and records payment_status=simulated; production rejects simulated payments. PAN/CVV are never accepted or persisted.";
