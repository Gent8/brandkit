import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadBrand } from "./brand.js";
import { runPipeline, describePipeline, buildNegative } from "./pipeline.js";

export async function generateCandidates(opts) {
  const brand = loadBrand(opts.brand);
  const count = Math.max(1, Number(opts.count) || 4);
  const negative = buildNegative(brand.negativePrompt);

  if (opts.dryRun) {
    const desc = describePipeline({
      prompt: opts.prompt,
      palette: brand.palette,
      extraNegative: brand.negativePrompt,
      provider: opts.provider,
      vectorize: opts.vectorize,
      count,
    });
    console.log("--- DRY RUN — no requests will be sent ---");
    console.log(`provider:       ${desc.provider}`);
    console.log(`vectorize:      ${desc.vectorize}`);
    console.log(`brand:          ${brand.name} (${brand.palette.join(", ")})`);
    console.log(`prompt:         ${opts.prompt}`);
    console.log(`count:          ${desc.count}`);
    console.log(`negative:       ${desc.negative.join(", ")}`);
    console.log("\n--- generate request ---");
    console.log(desc.generate);
    console.log("\n--- vectorize (per candidate) ---");
    console.log(desc.vectorize_per_candidate);
    return;
  }

  const rawDir = join(opts.out, "_raw");
  const svgDir = join(opts.out, "_svg");
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(svgDir, { recursive: true });

  console.log(`Generating ${count} candidate(s) via ${opts.provider}…`);
  console.log(`Vectorizing via ${opts.vectorize}…`);

  const result = await runPipeline({
    prompt: opts.prompt,
    palette: brand.palette,
    extraNegative: brand.negativePrompt,
    provider: opts.provider,
    vectorize: opts.vectorize,
    count,
    includeRasters: true,
  });

  for (const s of result.survivors) {
    if (s.raster_base64) {
      const rasterName = s.name.replace(/\.svg$/, ".png");
      writeFileSync(join(rawDir, rasterName), Buffer.from(s.raster_base64, "base64"));
    }
    writeFileSync(join(svgDir, s.name), s.svg);
    console.log(`  ✓ ${s.name}`);
  }
  for (const d of result.dropped) {
    if (d.reason === "off_palette") {
      console.warn(`  ✗ ${d.name}: ${d.offenders.length} offender(s) survived recolor`);
    } else {
      console.warn(`  ✗ ${d.name}: ${d.reason} — ${d.error || ""}`);
    }
  }

  writeFileSync(join(opts.out, "candidates.html"),
    makeGallery(result.survivors.map((s) => s.name), brand));

  const total = result.survivors.length + result.dropped.length;
  console.log(`✓ ${result.survivors.length}/${total} candidates passed`);
  console.log(`  ${join(opts.out, "candidates.html")} — open to pick a winner`);
  console.log(`  next: brandkit export ${join(svgDir, "candidate-N.svg")} --brand ${opts.brand} --out ${opts.out}`);
}

function makeGallery(svgs, brand) {
  const items = svgs.map((name) =>
    `<figure><img src="_svg/${name}" alt="${name}"><figcaption>${name}</figcaption></figure>`,
  ).join("\n");
  const swatches = brand.palette.map((h) =>
    `<span class="sw" style="background:${h}" title="${h}">${h}</span>`,
  ).join("");
  return `<!doctype html>
<meta charset="utf-8"><title>${brand.name} — brandkit candidates</title>
<style>
  body{font:14px system-ui;margin:24px;background:#1a1a1a;color:#eee}
  h1{margin:0 0 8px}
  .palette{margin:0 0 24px;display:flex;gap:6px;flex-wrap:wrap}
  .sw{display:inline-block;padding:6px 10px;border-radius:4px;font:12px monospace;color:#000;mix-blend-mode:normal;text-shadow:0 0 2px #fff8}
  figure{display:inline-block;margin:8px;background:#fff;padding:16px;border-radius:8px}
  figure img{width:240px;height:240px;object-fit:contain;display:block}
  figcaption{color:#222;text-align:center;margin-top:8px;font:12px monospace}
</style>
<h1>${brand.name} — candidates</h1>
<div class="palette">${swatches}</div>
<div>${items || "<em>no survivors — adjust prompt and re-run</em>"}</div>`;
}
