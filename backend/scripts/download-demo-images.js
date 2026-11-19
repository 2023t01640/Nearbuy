import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { demoListings } from "../src/demo-data.js";
const directory = new URL("../assets/demo/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const item of demoListings) {
  const url = `https://images.unsplash.com/${item.photo}?auto=format&fit=crop&w=1400&q=85`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error(`${item.key}: image download failed (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  const output = await sharp(data, { limitInputPixels: 25000000 })
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  await writeFile(new URL(item.key + ".webp", directory), output);
  console.log(item.key + ": " + output.length + " bytes");
}
await writeFile(
  new URL("SOURCES.md", directory),
  "# Demo image sources\n\nRepresentative product photographs from Unsplash, cached locally for presentation reliability. These are fictional marketplace listings, not actual offers.\n\n" +
    demoListings
      .map((p) => `- ${p.key}: https://images.unsplash.com/${p.photo}`)
      .join("\n") +
    "\n",
);
