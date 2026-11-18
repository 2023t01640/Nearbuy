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
      "Persistent PostgreSQL marketplace. Bearer tokens expire after 10 minutes. Refresh cookies are HttpOnly, SameSite=Strict and rotate on every refresh. Cookie endpoints require an allowlisted Origin and X-NearBuy-CSRF: 1. No public admin registration. Only verified sellers publish listings. All reporting periods use Asia/Colombo.",
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
route(
  "post",
  "/listings",
  "Seller: create listing; unverified accounts create drafts",
  { body: "Listing" },
);
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
      status: { type: "string", enum: ["draft", "active", "sold", "removed"] },
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
