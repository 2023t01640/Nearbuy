import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import path from "node:path";
import { query, one, rows } from "./db.js";
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
  limit,
} from "./security.js";
export const marketplace = Router();
const listingSelect = `SELECT l.*,u.name AS seller,u.verification_status,c.name AS category FROM listings l JOIN users u ON u.id=l.seller_id JOIN categories c ON c.id=l.category_id`;
export const listingView = (p) => {
  const { flag_reason, ...safe } = p;
  return {
    ...safe,
    price: Number(p.price),
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
    (["active", "sold"].includes(p.status) ||
      u?.id === p.seller_id ||
      u?.role === "admin")
  );
}
const listingSchema = z
  .object({
    title: text(3, 100),
    description: text(15, 2000),
    price: z.number().positive().max(9999999999),
    category_id: z.number().int().positive(),
    location: text(2, 60),
    condition: z.enum(["New", "Like new", "Good", "Fair"]),
    images: z
      .array(z.string().regex(/^\/uploads\/[a-f0-9-]+\.webp$/))
      .max(6)
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
      mine: z.enum(["true"]).optional(),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .safeParse(req.query);
  if (!q.success) fail(400, "Invalid query");
  const b = q.data;
  if (b.mine && !req.user) fail(401, "Sign in required");
  const result = await rows(
    listingSelect +
      ` WHERE ($1::boolean=false AND l.status='active' AND u.status='active' OR $1::boolean=true AND l.seller_id=$2) AND ($3::text IS NULL OR l.title ILIKE $3 OR l.description ILIKE $3) AND ($4::integer IS NULL OR l.category_id=$4) AND ($5::text IS NULL OR l.location ILIKE $5) ORDER BY l.created_at DESC LIMIT 100 OFFSET $6`,
    [
      !!b.mine,
      req.user?.id || null,
      b.q ? "%" + b.q + "%" : null,
      b.category || null,
      b.location ? "%" + b.location + "%" : null,
      b.offset,
    ],
  );
  res.json(result.map(listingView));
});
marketplace.get("/listings/:id", optionalAuth, validateId, async (req, res) => {
  const p = await getListing(req.params.id);
  if (!canSee(p, req.user)) fail(404, "Listing not found");
  res.json(listingView(p));
});
async function checkListingInput(b, u) {
  if (!(await one("SELECT id FROM categories WHERE id=$1", [b.category_id])))
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
      status = req.user.verification_status === "verified" ? "active" : "draft";
    await query(
      "INSERT INTO listings(id,seller_id,category_id,title,description,price,location,condition,images,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
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
      "UPDATE listings SET category_id=$1,title=$2,description=$3,price=$4,location=$5,condition=$6,images=$7,updated_at=now() WHERE id=$8",
      [
        b.category_id,
        b.title,
        b.description,
        b.price,
        b.location,
        b.condition,
        JSON.stringify(b.images),
        p.id,
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
      "UPDATE listings SET status='sold',sold_at=now(),updated_at=now() WHERE id=$1 AND seller_id=$2 AND status='active' RETURNING id",
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
        "SELECT r.id,r.buyer_id,r.rating,r.body AS text,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE listing_id=$1 ORDER BY created_at DESC",
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
        "SELECT id FROM messages WHERE listing_id=$1 AND buyer_id=$2 AND sender_id=$2 LIMIT 1",
        [p.id, req.user.id],
      ))
    )
      fail(403, "Message this seller before leaving a review");
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
      "UPDATE reviews SET rating=$1,body=$2 WHERE id=$3 AND buyer_id=$4 RETURNING *",
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
