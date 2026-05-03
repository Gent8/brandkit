import { readFileSync } from "node:fs";
import { normalizePalette } from "./palette.js";

export function loadBrand(brandPath) {
  let raw;
  try {
    raw = readFileSync(brandPath, "utf8");
  } catch (e) {
    throw new Error(`brand file not found: ${brandPath}`);
  }
  let brand;
  try {
    brand = JSON.parse(raw);
  } catch (e) {
    throw new Error(`brand file is not valid JSON: ${brandPath} — ${e.message}`);
  }
  if (!brand.name) throw new Error(`brand.json missing "name"`);
  brand.palette = normalizePalette(brand.palette);
  brand.negativePrompt = brand.negativePrompt || [];
  return brand;
}
