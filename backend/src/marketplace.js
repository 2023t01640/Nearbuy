import { placeOrder, selectionSchema } from "./purchases.js";
import { districts } from "./districts.js";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import path from "node:path";
import { query, one, rows, transaction } from "./db.js";
import { config } from "./config.js";
import {
  auth,
  optionalAuth,
  roles,
  validate,
  text,
  id,
  validateId,
  fail,
  audit,
  encrypt,
  decrypt,
  limit,
} from "./security.js";
export const marketplace = Router();
const listingSelect = `SELECT l.*,u.name AS seller,u.verification_status,c.name AS category,(SELECT round(avg(r.rating),1) FROM reviews r JOIN listings reviewed ON reviewed.id=r.listing_id WHERE reviewed.seller_id=u.id) AS seller_rating,(SELECT count(*)::int FROM reviews r JOIN listings reviewed ON reviewed.id=r.listing_id WHERE reviewed.seller_id=u.id) AS seller_review_count FROM listings l JOIN users u ON u.id=l.seller_id LEFT JOIN categories c ON c.id=l.category_id`;
export const listingView = (p) => {
  const { flag_reason, ...safe } = p;
  return {
    ...safe,
    price: p.price == null ? null : Number(p.price),
    category: p.category || "Unspecified",
    owner: p.seller_id,
    createdAt: p.created_at,
    soldAt: p.sold_at,
    verification_status: p.verification_status,
    images: p.images.length ? p.images : ["/placeholder.svg"],
  };
};
export async function getListing(id) {
  return one(listingSelect + " WHERE l.id=$1", [id]);
}
export function canSee(p, u) {
  return (
    p &&
    (["approved", "sold"].includes(p.status) ||
      u?.id === p.seller_id ||
      u?.role === "admin")
  );
}
const listingSchema = z
  .object({
    title: text(0, 100).default(""),
    description: text(0, 2000).default(""),
    price: z.number().positive().max(9999999999).nullable().default(null),
    category_id: z.number().int().positive().nullable().default(null),
    location: text(0, 60).default(""),
    district: z.enum(districts).optional(),
    stock_quantity: z.number().int().min(0).max(1000000).default(1),
    variants: z
      .record(
        text(1, 40),
        z
          .array(text(1, 60))
          .min(1)
          .max(20)
          .refine((a) => new Set(a).size === a.length),
      )
      .refine((o) => Object.keys(o).length <= 5)
      .default({}),
    condition: z.enum(["", "New", "Like new", "Good", "Fair"]).default(""),
    size_weight: text(0, 160).default(""),
    payment_methods: z
      .array(z.enum(["Cash on Delivery", "Online Payment"]))
      .max(2)
      .refine((a) => new Set(a).size === a.length)
      .default([]),
    specs: z
      .record(text(1, 40), text(1, 160))
      .refine((s) => Object.keys(s).length <= 20, "Maximum 20 specifications")
      .optional(),
    images: z
      .array(z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/))
      .max(8)
      .default([]),
  })
  .strict();
marketplace.get("/categories", async (req, res) =>
  res.json(await rows("SELECT * FROM categories ORDER BY name")),
);
marketplace.post(
  "/categories",
  auth,
  roles("admin"),
  validate(z.object({ name: text(2, 60) }).strict()),
  async (req, res) => {
    const c = await one("INSERT INTO categories(name) VALUES($1) RETURNING *", [
      req.body.name,
    ]);
    await audit(req.user.id, "category.created", String(c.id));
    res.status(201).json(c);
  },
);
marketplace.patch(
  "/categories/:id",
  auth,
  roles("admin"),
  validate(z.object({ name: text(2, 60) }).strict()),
  async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) fail(400, "Invalid category ID");
    const c = await one(
      "UPDATE categories SET name=$1 WHERE id=$2 RETURNING *",
      [req.body.name, req.params.id],
    );
    if (!c) fail(404, "Category not found");
    await audit(req.user.id, "category.updated", req.params.id);
    res.json(c);
  },
);
marketplace.delete(
  "/categories/:id",
  auth,
  roles("admin"),
  async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) fail(400, "Invalid category ID");
    if (
      await one("SELECT id FROM listings WHERE category_id=$1 LIMIT 1", [
        req.params.id,
      ])
    )
      fail(409, "Category is used by listings");
    const c = await one("DELETE FROM categories WHERE id=$1 RETURNING id", [
      req.params.id,
    ]);
    if (!c) fail(404, "Category not found");
    await audit(req.user.id, "category.deleted", req.params.id);
    res.status(204).end();
  },
);
marketplace.get("/listings", optionalAuth, async (req, res) => {
  const q = z
    .object({
      q: text(0, 100).optional(),
      category: z.coerce.number().int().positive().optional(),
      location: text(0, 60).optional(),
      district: z.enum(districts).optional(),
      mine: z.enum(["true"]).optional(),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .safeParse(req.query);
  if (!q.success) fail(400, "Invalid query");
  const b = q.data;
  if (b.mine && !req.user) fail(401, "Sign in required");
  const result = await rows(
    listingSelect +
      ` WHERE ($1::boolean=false AND l.status='approved' AND u.status='active' OR $1::boolean=true AND l.seller_id=$2) AND ($3::text IS NULL OR l.title ILIKE $3 OR l.description ILIKE $3) AND ($4::integer IS NULL OR l.category_id=$4) AND ($5::text IS NULL OR (l.district ILIKE $5 OR l.location ILIKE $5)) AND ($7::text IS NULL OR l.district=$7) ORDER BY l.created_at DESC LIMIT 100 OFFSET $6`,
    [
      !!b.mine,
      req.user?.id || null,
      b.q ? "%" + b.q + "%" : null,
      b.category || null,
      b.location ? "%" + b.location + "%" : null,
      b.offset,
      b.district || null,
    ],
  );
  res.json(result.map(listingView));
});
marketplace.get("/listings/:id", optionalAuth, validateId, async (req, res) => {
  const p = await getListing(req.params.id);
  if (!canSee(p, req.user)) fail(404, "Listing not found");
  const ordered =
    req.user?.role === "buyer" &&
    !!(await one("SELECT id FROM orders WHERE listing_id=$1 AND buyer_id=$2", [
      p.id,
      req.user.id,
    ]));
  res.json({ ...listingView(p), can_review: !!ordered });
});
async function checkListingInput(b, u) {
  if (
    b.category_id &&
    !(await one("SELECT id FROM categories WHERE id=$1", [b.category_id]))
  )
    fail(400, "Unknown category");
  for (const image of b.images) {
    if (
      !(await one("SELECT path FROM uploads WHERE path=$1 AND owner_id=$2", [
        image,
        u.id,
      ]))
    )
      fail(403, "Image does not belong to you");
  }
}
marketplace.post(
  "/listings",
  auth,
  roles("seller"),
  validate(listingSchema),
  async (req, res) => {
    await checkListingInput(req.body, req.user);
    const b = req.body,
      uid = randomUUID(),
      status = approvalStatus(b);
    await query(
      "INSERT INTO listings(id,seller_id,category_id,title,description,price,location,condition,images,status,specs,size_weight,payment_methods,district,stock_quantity,variants) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      [
        uid,
        req.user.id,
        b.category_id,
        b.title,
        b.description,
        b.price,
        b.location,
        b.condition,
        JSON.stringify(b.images),
        status,
        JSON.stringify(b.specs || {}),
        b.size_weight,
        JSON.stringify(b.payment_methods),
        b.district ||
          districts.find((d) =>
            b.location.toLowerCase().startsWith(d.toLowerCase()),
          ) ||
          (districts.includes(req.user.location) ? req.user.location : null),
        b.stock_quantity,
        JSON.stringify(b.variants),
      ],
    );
    await audit(req.user.id, "listing.created", uid);
    res.status(201).json(listingView(await getListing(uid)));
  },
);
marketplace.put(
  "/listings/:id",
  auth,
  roles("seller"),
  validateId,
  validate(listingSchema),
  async (req, res) => {
    const p = await getListing(req.params.id);
    if (!p) fail(404, "Listing not found");
    if (p.seller_id !== req.user.id) fail(403, "You do not own this listing");
    if (["removed", "sold"].includes(p.status))
      fail(409, "This listing cannot be edited");
    await checkListingInput(req.body, req.user);
    const b = req.body;
    await query(
      "UPDATE listings SET category_id=$1,title=$2,description=$3,price=$4,location=$5,condition=$6,images=$7,specs=COALESCE($9::jsonb,specs),size_weight=$10,payment_methods=$11,status=$12,district=$13,stock_quantity=$14,variants=$15,approval_note=NULL,updated_at=now() WHERE id=$8",
      [
        b.category_id,
        b.title,
        b.description,
        b.price,
        b.location,
        b.condition,
        JSON.stringify(b.images),
        p.id,
        b.specs ? JSON.stringify(b.specs) : null,
        b.size_weight,
        JSON.stringify(b.payment_methods),
        approvalStatus(b),
        b.district || p.district,
        b.stock_quantity,
        JSON.stringify(b.variants),
      ],
    );
    await audit(req.user.id, "listing.updated", p.id);
    res.json(listingView(await getListing(p.id)));
  },
);
marketplace.patch(
  "/listings/:id/sold",
  auth,
  roles("seller"),
  validateId,
  async (req, res) => {
    const p = await one(
      "UPDATE listings SET status='sold',sold_at=now(),updated_at=now() WHERE id=$1 AND seller_id=$2 AND status='approved' RETURNING id",
      [req.params.id, req.user.id],
    );
    if (!p) fail(409, "Only your active listings can be marked sold");
    await audit(req.user.id, "listing.sold", p.id);
    res.json(listingView(await getListing(p.id)));
  },
);
marketplace.delete(
  "/listings/:id",
  auth,
  roles("seller", "admin"),
  validateId,
  async (req, res) => {
    const p = await getListing(req.params.id);
    if (!p) fail(404, "Listing not found");
    if (req.user.role !== "admin" && p.seller_id !== req.user.id)
      fail(403, "Not your listing");
    await query(
      "UPDATE listings SET status='removed',updated_at=now() WHERE id=$1",
      [p.id],
    );
    await audit(req.user.id, "listing.removed", p.id);
    res.status(204).end();
  },
);
marketplace.post(
  "/listings/:id/flag",
  auth,
  limit(10),
  validateId,
  validate(z.object({ reason: text(5, 300) }).strict()),
  async (req, res) => {
    const p = await getListing(req.params.id);
    if (!canSee(p, req.user)) fail(404, "Listing not found");
    await query("UPDATE listings SET flagged=true,flag_reason=$1 WHERE id=$2", [
      req.body.reason,
      p.id,
    ]);
    await audit(req.user.id, "listing.flagged", p.id);
    res.json({ message: "Reported for moderation" });
  },
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
marketplace.post(
  "/uploads",
  auth,
  roles("seller"),
  limit(30),
  upload.single("image"),
  async (req, res) => {
    if (!req.file) fail(400, "Upload a JPEG, PNG or WebP image");
    const type = await fileTypeFromBuffer(req.file.buffer);
    if (
      !type ||
      !["image/jpeg", "image/png", "image/webp"].includes(type.mime) ||
      type.mime !== req.file.mimetype
    )
      fail(400, "Image content does not match its MIME type");
    const filename = randomUUID() + ".webp";
    try {
      await sharp(req.file.buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toFile(path.join(config.uploadDir, filename));
    } catch {
      fail(400, "Invalid image or image dimensions too large");
    }
    const url = "/uploads/" + filename;
    await query("INSERT INTO uploads(path,owner_id) VALUES($1,$2)", [
      url,
      req.user.id,
    ]);
    res.status(201).json({ url });
  },
);
marketplace.get(
  "/listings/:id/reviews",
  optionalAuth,
  validateId,
  async (req, res) => {
    if (!canSee(await getListing(req.params.id), req.user))
      fail(404, "Listing not found");
    res.json(
      await rows(
        "SELECT r.id,r.buyer_id,r.rating,r.body AS text,r.created_at,u.name,EXISTS(SELECT 1 FROM orders o WHERE o.listing_id=r.listing_id AND o.buyer_id=r.buyer_id) AS verified_purchase FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE listing_id=$1 ORDER BY created_at DESC",
        [req.params.id],
      ),
    );
  },
);
marketplace.post(
  "/listings/:id/reviews",
  auth,
  roles("buyer"),
  limit(20),
  validateId,
  validate(
    z
      .object({ rating: z.number().int().min(1).max(5), text: text(3, 700) })
      .strict(),
  ),
  async (req, res) => {
    const p = await getListing(req.params.id);
    if (!canSee(p, req.user)) fail(404, "Listing not found");
    if (
      !(await one(
        "SELECT id FROM orders WHERE listing_id=$1 AND buyer_id=$2 LIMIT 1",
        [p.id, req.user.id],
      ))
    )
      fail(403, "Place an order with Buy Now before leaving a review");
    const r = await one(
      "INSERT INTO reviews(id,listing_id,buyer_id,rating,body) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [randomUUID(), p.id, req.user.id, req.body.rating, req.body.text],
    );
    await audit(req.user.id, "review.created", r.id);
    res.status(201).json(r);
  },
);
marketplace.patch(
  "/reviews/:id",
  auth,
  roles("buyer"),
  validateId,
  validate(
    z
      .object({ rating: z.number().int().min(1).max(5), text: text(3, 700) })
      .strict(),
  ),
  async (req, res) => {
    const r = await one(
      "UPDATE reviews SET rating=$1,body=$2 WHERE id=$3 AND buyer_id=$4 AND EXISTS(SELECT 1 FROM orders o WHERE o.listing_id=reviews.listing_id AND o.buyer_id=$4) RETURNING *",
      [req.body.rating, req.body.text, req.params.id, req.user.id],
    );
    if (!r) fail(404, "Review not found");
    await audit(req.user.id, "review.updated", r.id);
    res.json(r);
  },
);
marketplace.delete(
  "/reviews/:id",
  auth,
  roles("buyer", "admin"),
  validateId,
  async (req, res) => {
    const r = await one(
      "DELETE FROM reviews WHERE id=$1 AND (buyer_id=$2 OR $3::boolean) RETURNING id",
      [req.params.id, req.user.id, req.user.role === "admin"],
    );
    if (!r) fail(404, "Review not found");
    await audit(req.user.id, "review.deleted", r.id);
    res.status(204).end();
  },
);

export function missingListingDetails(b) {
  return [
    !b.title || b.title.trim().length < 3
      ? "Product name (at least 3 characters)"
      : null,
    !b.size_weight?.trim() ? "Size & Weight" : null,
    !b.images?.length ? "At least one product photo" : null,
    !b.description || b.description.trim().length < 15
      ? "Description (at least 15 characters)"
      : null,
    !b.category_id ? "Product category" : null,
    !b.condition ? "Product condition" : null,
    !(Number(b.price) > 0) ? "Price" : null,
    !b.payment_methods?.length ? "Payment method" : null,
  ].filter(Boolean);
}
function approvalStatus(b) {
  return missingListingDetails(b).length ? "pending_admin" : "approved";
}
marketplace.post(
  "/listings/:id/orders",
  auth,
  roles("buyer"),
  limit(15),
  validateId,
  validate(
    z
      .object({
        address: text(10, 500),
        quantity: z.number().int().min(1).max(99).default(1),
        selected_variants: selectionSchema,
        card_simulation: z.boolean().optional(),
        payment_method: z.enum(["Cash on Delivery", "Online Payment"]),
      })
      .strict(),
  ),
  async (req, res) => {
    const order = await transaction(async (tx) => {
      const p = (
        await tx.query(
          "SELECT l.* FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status='approved' AND u.status='active' AND u.role='seller' FOR UPDATE OF l",
          [req.params.id],
        )
      ).rows[0];
      if (!p) fail(409, "This listing is unavailable");
      if (p.seller_id === req.user.id)
        fail(403, "You cannot order your own listing");
      if (
        !(Number(p.price) > 0) ||
        !p.payment_methods.includes(req.body.payment_method)
      )
        fail(400, "Choose a payment method enabled by this seller");
      return placeOrder(tx, {
        listing: p,
        buyerId: req.user.id,
        quantity: req.body.quantity,
        selection: req.body.selected_variants,
        address: req.body.address,
        method: req.body.payment_method,
        cardSimulation: req.body.card_simulation,
      });
    });
    await audit(req.user.id, "order.placed", order.id, {
      listingId: req.params.id,
    });
    res.status(201).json(order);
  },
);

marketplace.get("/orders", auth, roles("buyer", "seller"), async (req, res) => {
  const orders = await rows(
    "SELECT o.*,u.name AS buyer_name,s.name AS seller_name FROM orders o JOIN users u ON u.id=o.buyer_id JOIN users s ON s.id=o.seller_id WHERE o.buyer_id=$1 OR o.seller_id=$1 ORDER BY o.created_at DESC LIMIT 100",
    [req.user.id],
  );
  res.set("Cache-Control", "no-store").json(
    orders.map(({ address_encrypted, ...o }) => ({
      ...o,
      address: decrypt(address_encrypted),
    })),
  );
});
