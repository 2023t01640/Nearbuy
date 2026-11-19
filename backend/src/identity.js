import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { encrypt, fail } from "./security.js";

export { districts } from "./districts.js";
export const identityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 20, fieldSize: 4096 },
  fileFilter(req, file, cb) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(Object.assign(new Error("Use JPEG, PNG or WebP identity photos"), { status: 400 }));
    }
    cb(null, true);
  },
}).fields([
  { name: "nic_photo", maxCount: 1 },
  { name: "br_photo", maxCount: 1 },
]);
export async function identityPhoto(file) {
  if (!file)
    fail(400, "Upload a JPEG, PNG or WebP identity photo (maximum 5 MB)");
  const type = await fileTypeFromBuffer(file.buffer);
  if (
    !type ||
    !["image/jpeg", "image/png", "image/webp"].includes(type.mime) ||
    type.mime !== file.mimetype
  )
    fail(400, "Invalid identity image");
  try {
    const buffer = await sharp(file.buffer, { limitInputPixels: 25000000 })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    return encrypt(buffer.toString("base64"));
  } catch {
    fail(400, "Could not read identity image");
  }
}
