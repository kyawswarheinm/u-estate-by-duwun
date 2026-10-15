// Generates web assets from the master logo files in /logo (1024 px PNGs).
// Run after the logo changes:  node scripts/brand-assets.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("public/brand", { recursive: true });

// Marks: trim the transparent padding so they align with text, then scale to 192 px tall (crisp at 2x).
for (const name of ["u-estate-mark-midnight", "u-estate-mark-white"]) {
  await sharp(`logo/${name}.png`).trim().resize({ height: 192 }).png({ compressionLevel: 9 }).toFile(`public/brand/${name}.png`);
}

// App icons (Next.js metadata file conventions: src/app/icon.png and src/app/apple-icon.png).
await sharp("logo/u-estate-app-icon.png").resize(512, 512).png({ compressionLevel: 9 }).toFile("src/app/icon.png");
await sharp("logo/u-estate-app-icon.png").resize(180, 180).png({ compressionLevel: 9 }).toFile("src/app/apple-icon.png");
await sharp("logo/u-estate-app-icon.png").resize(512, 512).png({ compressionLevel: 9 }).toFile("public/brand/u-estate-app-icon-512.png");

for (const f of ["public/brand/u-estate-mark-midnight.png", "public/brand/u-estate-mark-white.png", "src/app/icon.png", "src/app/apple-icon.png"]) {
  const m = await sharp(f).metadata();
  console.log(`${f}  ${m.width}x${m.height}`);
}
