import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { loadBrand } from "./brand.js";

function rasterize(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return r.render().asPng();
}

const RASTER_SIZES = [
  ["icon-16.png", 16],
  ["icon-32.png", 32],
  ["icon-48.png", 48],
  ["icon-128.png", 128],
  ["apple-touch-icon.png", 180],
  ["android-chrome-192.png", 192],
  ["android-chrome-512.png", 512],
  ["maskable-512.png", 512],
  ["cws-icon-128.png", 128],
];

function makeBgSvg(markSvg, w, h, bg, markSize) {
  const vbMatch = markSvg.match(/viewBox\s*=\s*"([^"]+)"/i);
  const viewBox = vbMatch ? vbMatch[1] : "0 0 100 100";
  const inner = markSvg
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/^[\s\S]*?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
  const x = (w - markSize) / 2;
  const y = (h - markSize) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <svg x="${x}" y="${y}" width="${markSize}" height="${markSize}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>
</svg>`;
}

export async function exportAssets(input, opts) {
  const brand = loadBrand(opts.brand);
  const svg = readFileSync(input, "utf8");
  const out = opts.out;
  mkdirSync(out, { recursive: true });

  for (const [name, w] of RASTER_SIZES) {
    writeFileSync(join(out, name), rasterize(svg, w));
    console.log(`  ${name}  (${w}×${w})`);
  }

  copyFileSync(input, join(out, "favicon.svg"));
  console.log(`  favicon.svg`);

  const icoBufs = [16, 32, 48].map((w) => rasterize(svg, w));
  writeFileSync(join(out, "favicon.ico"), await pngToIco(icoBufs));
  console.log(`  favicon.ico  (multi-res 16+32+48)`);

  const bg = opts.bg || brand.palette[0];

  writeFileSync(
    join(out, "og-image.png"),
    rasterize(makeBgSvg(svg, 1200, 630, bg, 360), 1200),
  );
  console.log(`  og-image.png  (1200×630, bg ${bg})`);

  writeFileSync(
    join(out, "cws-tile-440x280.png"),
    rasterize(makeBgSvg(svg, 440, 280, bg, 200), 440),
  );
  console.log(`  cws-tile-440x280.png`);

  writeFileSync(
    join(out, "cws-marquee-920x680.png"),
    rasterize(makeBgSvg(svg, 920, 680, bg, 460), 920),
  );
  console.log(`  cws-marquee-920x680.png`);

  console.log(`✓ exported to ${out}`);
}
