import { Router } from "express";
import PDFDocument from "pdfkit";
import { auth, roles, fail, audit } from "./security.js";
import { rows, one } from "./db.js";
export const reports = Router();
reports.use(auth);
function period(req, monthly) {
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const value = String(
    req.query[monthly ? "month" : "date"] || now.slice(0, monthly ? 7 : 10),
  );
  if (
    !(
      monthly
        ? /^\d{4}-(0[1-9]|1[0-2])$/
        : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
    ).test(value)
  )
    fail(400, "Invalid reporting period");
  const start = value + (monthly ? "-01" : "");
  if (new Date(start).toISOString().slice(0, 10) !== start)
    fail(400, "Invalid date");
  const d = new Date(start + "T00:00:00Z");
  if (monthly) d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCDate(d.getUTCDate() + 1);
  return {
    label: value,
    start: start + "T00:00:00+05:30",
    end: d.toISOString().slice(0, 10) + "T00:00:00+05:30",
  };
}
function csv(res, name, data) {
  const esc = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  res
    .attachment(name + ".csv")
    .type("text/csv")
    .send("\ufeff" + data.map((r) => r.map(esc).join(",")).join("\r\n"));
}
function pdf(res, name, lines) {
  res.attachment(name + ".pdf").type("application/pdf");
  const doc = new PDFDocument({ margin: 45 });
  doc.pipe(res);
  doc.fontSize(24).fillColor("#23614d").text("NearBuy");
  doc.moveDown().fontSize(17).text(name);
  doc.moveDown().fontSize(10).fillColor("#333333");
  for (const line of lines) {
    doc.text(String(line), { lineGap: 4 });
    doc.moveDown(0.5);
  }
  doc.end();
}
reports.get("/seller/monthly-sales", roles("seller"), async (req, res) => {
  const p = period(req, true),
    sales = await rows(
      "SELECT title,price,sold_at FROM listings WHERE seller_id=$1 AND status='sold' AND sold_at >= $2 AND sold_at < $3 ORDER BY sold_at",
      [req.user.id, p.start, p.end],
    ),
    rating = await one(
      "SELECT round(avg(r.rating),2) AS rating FROM reviews r JOIN listings l ON l.id=r.listing_id WHERE l.seller_id=$1",
      [req.user.id],
    );
  await audit(req.user.id, "report.monthly_sales");
  pdf(res, "Monthly Sales " + p.label, [
    "Seller: " + req.user.name,
    "Reporting month (Asia/Colombo): " + p.label,
    "Items sold: " + sales.length,
    "Revenue (LKR): " +
      sales.reduce((n, s) => n + Number(s.price), 0).toFixed(2),
    "Average seller rating: " + (rating.rating || "No reviews"),
    ...sales.map((s) => s.title + " | LKR " + s.price),
  ]);
});
reports.get("/seller/daily-inquiries", roles("seller"), async (req, res) => {
  const p = period(req, false),
    data = await rows(
      `SELECT l.title,u.name,u.email,m.created_at,m.body,(SELECT min(reply.created_at) FROM messages reply WHERE reply.listing_id=m.listing_id AND reply.buyer_id=m.buyer_id AND reply.sender_id=l.seller_id AND reply.created_at>m.created_at) AS replied_at FROM messages m JOIN listings l ON l.id=m.listing_id JOIN users u ON u.id=m.buyer_id WHERE l.seller_id=$1 AND m.sender_id=m.buyer_id AND m.created_at >= $2 AND m.created_at < $3 ORDER BY m.created_at`,
      [req.user.id, p.start, p.end],
    );
  await audit(req.user.id, "report.daily_inquiries");
  csv(res, "Daily Inquiries " + p.label, [
    ["Listing", "Buyer", "Email", "Timestamp", "Message", "Response seconds"],
    ...data.map((d) => [
      d.title,
      d.name,
      d.email,
      d.created_at,
      d.body,
      d.replied_at
        ? Math.round((new Date(d.replied_at) - new Date(d.created_at)) / 1000)
        : "Pending",
    ]),
  ]);
});
reports.get("/admin/daily-activity", roles("admin"), async (req, res) => {
  const p = period(req, false),
    signups = await one(
      "SELECT count(*)::int AS total FROM users WHERE created_at >= $1 AND created_at < $2",
      [p.start, p.end],
    ),
    active = await one(
      "SELECT count(*)::int AS total FROM listings WHERE status='approved'",
    ),
    flags = await one(
      "SELECT count(*)::int AS total FROM audit_logs WHERE action='listing.flagged' AND created_at >= $1 AND created_at < $2",
      [p.start, p.end],
    ),
    events = await rows(
      "SELECT action,created_at FROM audit_logs WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at",
      [p.start, p.end],
    );
  await audit(req.user.id, "report.daily_activity");
  pdf(res, "Daily Activity " + p.label, [
    "Reporting date (Asia/Colombo): " + p.label,
    "New users: " + signups.total,
    "Active listings (current snapshot): " + active.total,
    "Flags received: " + flags.total,
    ...events.map(
      (e) => new Date(e.created_at).toISOString() + " | " + e.action,
    ),
  ]);
});
reports.get("/admin/monthly-audit", roles("admin"), async (req, res) => {
  const p = period(req, true),
    data = await rows(
      "SELECT a.created_at,u.email,a.action,a.target,a.metadata FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.created_at >= $1 AND a.created_at < $2 ORDER BY a.created_at",
      [p.start, p.end],
    );
  await audit(req.user.id, "report.monthly_audit");
  csv(res, "Monthly Audit " + p.label, [
    ["Timestamp", "Actor email", "Action", "Target", "Metadata"],
    ...data.map((d) => [
      d.created_at,
      d.email || "Anonymous",
      d.action,
      d.target,
      JSON.stringify(d.metadata),
    ]),
  ]);
});

reports.get("/seller/:kind/:format", roles("seller"), async (req, res) => {
  const { kind, format } = req.params;
  if (!["sales", "listings"].includes(kind) || !["pdf", "csv"].includes(format))
    fail(404, "Report not found");
  const data =
    kind === "sales"
      ? await rows(
          "SELECT product_name,quantity,total,payment_method,status,created_at FROM orders WHERE seller_id=$1 ORDER BY created_at DESC",
          [req.user.id],
        )
      : await rows(
          "SELECT title,price,status,size_weight,condition,created_at FROM listings WHERE seller_id=$1 ORDER BY created_at DESC",
          [req.user.id],
        );
  const header =
    kind === "sales"
      ? [
          "Product",
          "Quantity",
          "Total LKR",
          "Payment method",
          "Status",
          "Created",
        ]
      : [
          "Product",
          "Price LKR",
          "Status",
          "Size & Weight",
          "Condition",
          "Created",
        ];
  const values = data.map((d) =>
    kind === "sales"
      ? [
          d.product_name,
          d.quantity,
          d.total,
          d.payment_method,
          d.status,
          d.created_at,
        ]
      : [d.title, d.price, d.status, d.size_weight, d.condition, d.created_at],
  );
  await audit(req.user.id, "report." + kind, null, { format });
  res.set("Cache-Control", "no-store");
  if (format === "csv") csv(res, "NearBuy " + kind, [header, ...values]);
  else
    pdf(res, "NearBuy " + kind, [
      "Seller: " + req.user.name,
      kind === "sales"
        ? "Order totals; payment collection is not tracked."
        : "Current listing inventory",
      header.join(" | "),
      ...values.map((r) => r.join(" | ")),
    ]);
});
