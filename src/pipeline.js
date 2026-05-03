// Pure-data, in-memory pipeline. No fs, no console output.
// Used by the CLI (which then writes files) and by the MCP wrapper
// (which returns the result inline — no shared filesystem needed).

import { recolorSvg, verifySvg, normalizePalette } from "./palette.js";
import * as fal from "./providers/fal.js";
import * as replicate from "./providers/replicate.js";
import * as recraft from "./providers/recraft.js";
import * as vectorizer from "./providers/vectorizer.js";

const PROVIDERS = { fal, replicate };
const VECTORIZERS = { recraft, vectorizer };

export const DEFAULT_NEGATIVE = [
  "leaves", "plants", "sparkles", "location pins", "dollar signs",
  "snowflakes", "spreadsheet grid", "text", "watermark", "faces",
  "characters", "hands", "money symbols",
];

export function pickProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown provider: ${name} (try: ${Object.keys(PROVIDERS).join(", ")})`);
  return p;
}
export function pickVectorizer(name) {
  const v = VECTORIZERS[name];
  if (!v) throw new Error(`unknown vectorize provider: ${name} (try: ${Object.keys(VECTORIZERS).join(", ")})`);
  return v;
}

export function buildNegative(extra = []) {
  return [...new Set([...DEFAULT_NEGATIVE, ...(extra || [])])];
}

/**
 * Run the full gen pipeline in memory.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string[]} opts.palette          locked brand palette as hex strings
 * @param {string[]} [opts.extraNegative]  brand-specific additions; merged with DEFAULT_NEGATIVE
 * @param {number} [opts.count=4]
 * @param {string} [opts.provider="fal"]
 * @param {string} [opts.vectorize="recraft"]
 * @param {boolean} [opts.includeRasters=false]   if true, attach base64 PNGs to the result
 * @returns {Promise<{
 *   provider: string, vectorize: string, count: number, palette: string[], negative: string[],
 *   survivors: { name: string, svg: string, raster_base64?: string }[],
 *   dropped: { name: string, reason: string, error?: string, offenders?: any[] }[],
 * }>}
 */
export async function runPipeline(opts) {
  const palette = normalizePalette(opts.palette);
  const provider = pickProvider(opts.provider || "fal");
  const vec = pickVectorizer(opts.vectorize || "recraft");
  const count = Math.max(1, Number(opts.count) || 4);
  const negative = buildNegative(opts.extraNegative);

  const req = { prompt: opts.prompt, palette, negative, count };

  const rasters = await provider.generate(req);

  const survivors = [];
  const dropped = [];
  for (const r of rasters) {
    const baseName = r.name.replace(/\.[^.]+$/, ".svg");
    let svg;
    try {
      svg = await vec.vectorize(r.buffer);
    } catch (e) {
      dropped.push({ name: baseName, reason: "vectorize_failed", error: e.message });
      continue;
    }
    let recolored;
    try {
      recolored = recolorSvg(svg, palette);
    } catch (e) {
      dropped.push({ name: baseName, reason: "recolor_failed", error: e.message });
      continue;
    }
    const { ok, offenders } = verifySvg(recolored, palette);
    if (!ok) {
      dropped.push({ name: baseName, reason: "off_palette", offenders });
      continue;
    }
    const survivor = { name: baseName, svg: recolored };
    if (opts.includeRasters) {
      survivor.raster_base64 = r.buffer.toString("base64");
    }
    survivors.push(survivor);
  }

  return {
    provider: opts.provider || "fal",
    vectorize: opts.vectorize || "recraft",
    count,
    palette,
    negative,
    survivors,
    dropped,
  };
}

export function describePipeline(opts) {
  const palette = normalizePalette(opts.palette);
  const provider = pickProvider(opts.provider || "fal");
  const vec = pickVectorizer(opts.vectorize || "recraft");
  const count = Math.max(1, Number(opts.count) || 4);
  const negative = buildNegative(opts.extraNegative);
  const req = { prompt: opts.prompt, palette, negative, count };
  return {
    provider: opts.provider || "fal",
    vectorize: opts.vectorize || "recraft",
    palette, negative, count,
    generate: provider.describeRequest(req),
    vectorize_per_candidate: vec.describeRequest(),
  };
}
