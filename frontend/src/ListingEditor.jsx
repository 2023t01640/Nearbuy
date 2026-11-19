import { FeePreview } from "./ProductOptions";
import { districts } from "./Registration";
import React, { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import { api } from "./api";
export default function ListingEditor({ item, categories, onClose, onSave }) {
  const [images, setImages] = useState(
      (item.images || [])
        .filter((x) => x.startsWith("/uploads/"))
        .map((url) => ({ url })),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(item.price || ""),
    [variants, setVariants] = useState(
      Object.entries(item.variants || {}).map(([name, values]) => ({
        name,
        options: values.join(", "),
      })),
    );
  const previews = useRef([]);
  useEffect(
    () => () => previews.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = new FormData(e.currentTarget);
    try {
      if (new Set(variants.map((v) => v.name.trim())).size !== variants.length)
        throw new Error("Variant names must be unique");
      const urls = [];
      for (const image of images) {
        if (!image.file) {
          urls.push(image.url);
          continue;
        }
        const data = new FormData();
        data.append("image", image.file);
        urls.push((await api("/uploads", { method: "POST", body: data })).url);
      }
      const result = await api(item.id ? `/listings/${item.id}` : "/listings", {
        method: item.id ? "PUT" : "POST",
        body: {
          title: d.get("title"),
          size_weight: d.get("size_weight"),
          description: d.get("description"),
          price: d.get("price") ? Number(d.get("price")) : null,
          category_id: d.get("category_id")
            ? Number(d.get("category_id"))
            : null,
          condition: d.get("condition"),
          location: d.get("location"),
          district: d.get("district"),
          stock_quantity: Number(d.get("stock_quantity")),
          variants: Object.fromEntries(
            variants.map((v) => [
              v.name.trim(),
              v.options
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            ]),
          ),
          payment_methods: d.getAll("payment_methods"),
          images: urls,
        },
      });
      onSave(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="section-title">
          <h2 id="editor-title">
            {item.id ? "Edit listing" : "Create a local find"}
          </h2>
          <button
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X />
          </button>
        </div>
        <p className="notice">
          Fill all eight product details and add at least one photo to publish
          automatically. Incomplete listings are sent to admin approval.
        </p>
        <form onSubmit={submit}>
          <label>
            Product Name
            <input name="title" maxLength={100} defaultValue={item.title} />
            <small>At least 3 characters for automatic approval.</small>
          </label>
          <label>
            Item Count
            <input
              type="number"
              name="stock_quantity"
              min="0"
              max="1000000"
              required
              defaultValue={item.stock_quantity ?? 1}
            />
          </label>
          <label>
            District
            <select name="district" required defaultValue={item.district || ""}>
              <option value="" disabled>
                Select district
              </option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <fieldset className="agreement">
            <legend>Variants (optional)</legend>
            <p>
              Add Colors, Storage, or custom option groups. Separate tags with
              commas. Stock is shared across all variants.
            </p>
            {variants.map((variant, i) => (
              <div key={i} className="form-row">
                <label>
                  Option name
                  <input
                    required
                    maxLength={40}
                    placeholder="Colors / Storage"
                    value={variant.name}
                    onChange={(e) =>
                      setVariants((rows) =>
                        rows.map((v, n) =>
                          n === i ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Option tags
                  <input
                    required
                    maxLength={1200}
                    placeholder="128GB, 256GB"
                    value={variant.options}
                    onChange={(e) =>
                      setVariants((rows) =>
                        rows.map((v, n) =>
                          n === i ? { ...v, options: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() =>
                    setVariants((rows) => rows.filter((_, n) => n !== i))
                  }
                >
                  Remove option
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={variants.length >= 5}
              onClick={() =>
                setVariants((rows) => [...rows, { name: "", options: "" }])
              }
            >
              Add variant group
            </button>
          </fieldset>
          <FeePreview price={price} />
          <label>
            Size &amp; Weight
            <input
              name="size_weight"
              maxLength={160}
              defaultValue={item.size_weight}
              placeholder="e.g. 40 × 30 × 15 cm; 2.5 kg"
            />
          </label>
          <label>
            Product Photos ({images.length}/8)
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files);
                e.target.value = "";
                if (files.length + images.length > 8)
                  return setError(
                    "Maximum 8 photos. Remove a photo before adding more.",
                  );
                if (
                  files.some(
                    (f) =>
                      f.size > 5 * 1024 * 1024 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        f.type,
                      ),
                  )
                )
                  return setError(
                    "Use JPEG, PNG or WebP photos up to 5 MB each.",
                  );
                setError("");
                setImages((old) => [
                  ...old,
                  ...files.map((file) => {
                    const url = URL.createObjectURL(file);
                    previews.current.push(url);
                    return { file, url };
                  }),
                ]);
              }}
            />
            <small>Select multiple photos. The first image is the cover.</small>
          </label>
          <div className="listing-photo-grid">
            {images.map((image, i) => (
              <div key={image.url}>
                <img src={image.url} alt={`Product preview ${i + 1}`} />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove photo ${i + 1}`}
                  disabled={busy}
                  onClick={() =>
                    setImages((old) => old.filter((_, n) => n !== i))
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <label>
            Description
            <textarea
              name="description"
              maxLength={2000}
              defaultValue={item.description}
            />
            <small>At least 15 characters for automatic approval.</small>
          </label>
          <div className="form-row">
            <label>
              Product Category
              <select name="category_id" defaultValue={item.category_id || ""}>
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product Condition
              <select name="condition" defaultValue={item.condition || ""}>
                <option value="">Select a condition</option>
                {["New", "Like new", "Good", "Fair"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Price (LKR)
              <input
                type="number"
                name="price"
                min="0.01"
                max="9999999999"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Location
              <input
                name="location"
                maxLength={60}
                defaultValue={item.location}
              />
            </label>
          </div>
          <fieldset className="agreement">
            <legend>Payment Methods</legend>
            {["Cash on Delivery", "Online Payment"].map((method) => (
              <label key={method} className="legal-agreement">
                <input
                  type="checkbox"
                  name="payment_methods"
                  value={method}
                  defaultChecked={item.payment_methods?.includes(method)}
                />
                {method}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary full" disabled={busy}>
            {busy ? "Saving..." : "Save listing"}
          </button>
        </form>
      </section>
    </div>
  );
}
