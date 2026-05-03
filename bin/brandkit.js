#!/usr/bin/env node
import { cac } from "cac";
import { readFileSync, writeFileSync } from "node:fs";
import { loadBrand } from "../src/brand.js";
import { recolorSvg, verifySvg } from "../src/palette.js";

const cli = cac("brandkit");

cli
  .command("recolor <input>", "Snap every hex in <input> to the nearest brand-palette color")
  .option("--brand <path>", "Path to brand.json", { default: "brand.json" })
  .option("-o, --output <path>", "Output path (default: overwrite input)")
  .action((input, opts) => {
    const brand = loadBrand(opts.brand);
    const svg = readFileSync(input, "utf8");
    const out = recolorSvg(svg, brand.palette);
    const dest = opts.output || input;
    writeFileSync(dest, out);
    console.log(`recolored → ${dest}`);
  });

cli
  .command("verify <input>", "Verify every color in <input> is in the brand palette (CI gate)")
  .option("--brand <path>", "Path to brand.json", { default: "brand.json" })
  .action((input, opts) => {
    const brand = loadBrand(opts.brand);
    const svg = readFileSync(input, "utf8");
    const { ok, offenders } = verifySvg(svg, brand.palette);
    if (ok) {
      console.log(`✓ ${input} — all colors in palette (${brand.palette.length})`);
      process.exit(0);
    }
    console.error(`✗ ${input} — ${offenders.length} offender(s):`);
    for (const o of offenders) {
      if (o.kind === "off-palette") console.error(`  ${o.value} → suggest ${o.suggestion}`);
      else console.error(`  ${o.value}`);
    }
    process.exit(1);
  });

cli
  .command("export <input>", "Render the full asset set (icons, favicon, OG, Chrome Web Store) from <input>")
  .option("--brand <path>", "Path to brand.json", { default: "brand.json" })
  .option("--out <dir>", "Output dir", { default: "./assets" })
  .option("--bg <hex>", "OG/CWS background (default: palette[0])")
  .action(async (input, opts) => {
    const { exportAssets } = await import("../src/export.js");
    await exportAssets(input, opts);
  });

cli
  .command("gen", "Generate logo candidates: provider → vectorize → recolor → verify → gallery")
  .option("--brand <path>", "Path to brand.json", { default: "brand.json" })
  .option("--prompt <text>", "Image prompt (required)")
  .option("--out <dir>", "Output dir", { default: "./assets" })
  .option("--provider <name>", "fal | replicate", { default: "fal" })
  .option("--vectorize <name>", "recraft | vectorizer", { default: "recraft" })
  .option("--count <n>", "Candidate count", { default: 4 })
  .option("--dry-run", "Print API requests without sending")
  .action(async (opts) => {
    if (!opts.prompt) {
      console.error("brandkit gen: --prompt is required");
      process.exit(1);
    }
    const { generateCandidates } = await import("../src/gen.js");
    await generateCandidates(opts);
  });

cli.help();
cli.version("0.2.0");

// cac doesn't propagate async action errors through cli.parse(),
// so we install a global rejection handler too.
process.on("unhandledRejection", (e) => {
  console.error(`brandkit: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("uncaughtException", (e) => {
  console.error(`brandkit: ${e && e.message ? e.message : e}`);
  process.exit(1);
});

try {
  cli.parse();
} catch (e) {
  console.error(`brandkit: ${e.message}`);
  process.exit(1);
}
