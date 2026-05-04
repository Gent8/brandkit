// Smoke test — pure logic only, no network. Run: npm run test:smoke
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { recolorSvg, verifySvg, normalizePalette, normalizeHex, nearest } from "../src/palette.js";
import { trimSvg, computeBbox } from "../src/trim.js";

const PALETTE = normalizePalette([
  "#FAFAF9", "#5B21B6", "#10B981", "#F43F5E", "#1C1917",
]);

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("normalizeHex");
test("expands 3-digit hex", () => {
  assert.equal(normalizeHex("#fab"), "#FFAABB");
});
test("uppercases 6-digit hex", () => {
  assert.equal(normalizeHex("#5b21b6"), "#5B21B6");
});
test("rejects bad input", () => {
  assert.throws(() => normalizeHex("not-a-hex"));
});

console.log("nearest");
test("snaps near-violet to palette violet", () => {
  assert.equal(nearest("#5C20B5", PALETTE), "#5B21B6");
});
test("snaps near-emerald to palette emerald", () => {
  assert.equal(nearest("#11B883", PALETTE), "#10B981");
});

console.log("verifySvg");
test("good.svg passes", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const r = verifySvg(svg, PALETTE);
  assert.equal(r.ok, true, JSON.stringify(r.offenders));
});
test("bad.svg fails with off-palette offenders", () => {
  const svg = readFileSync(new URL("./bad.svg", import.meta.url), "utf8");
  const r = verifySvg(svg, PALETTE);
  assert.equal(r.ok, false);
  assert.ok(r.offenders.some((o) => o.kind === "off-palette"));
});
test("named-color.svg fails", () => {
  const svg = readFileSync(new URL("./named-color.svg", import.meta.url), "utf8");
  const r = verifySvg(svg, PALETTE);
  assert.equal(r.ok, false);
});

console.log("recolorSvg");
test("snaps bad.svg colors into palette", () => {
  const svg = readFileSync(new URL("./bad.svg", import.meta.url), "utf8");
  const recolored = recolorSvg(svg, PALETTE);
  const r = verifySvg(recolored, PALETTE);
  assert.equal(r.ok, true, JSON.stringify(r.offenders));
});
test("recolor is idempotent", () => {
  const svg = readFileSync(new URL("./bad.svg", import.meta.url), "utf8");
  const once = recolorSvg(svg, PALETTE);
  const twice = recolorSvg(once, PALETTE);
  assert.equal(once, twice);
});
test("recolor rejects named-color svg", () => {
  const svg = readFileSync(new URL("./named-color.svg", import.meta.url), "utf8");
  assert.throws(() => recolorSvg(svg, PALETTE), /unsupported color forms/);
});

console.log("trimSvg");
test("computeBbox honors stripBackground on canvas-fill rect", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const noStrip = computeBbox(svg);
  const strip = computeBbox(svg, { stripBackground: true });
  // No strip: full canvas (the bg rect dominates).
  assert.equal(noStrip.minX, 0); assert.equal(noStrip.maxX, 100);
  // Strip: tighter to the actual mark.
  assert.ok(strip.minX > 0 && strip.maxX < 100, `strip bbox should be inside canvas, got ${JSON.stringify(strip)}`);
});
test("trim shrinks a padded viewBox to the mark bbox", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const out = trimSvg(svg, { stripBackground: true });
  const vb = out.match(/viewBox="([^"]+)"/i)[1].split(/\s+/).map(Number);
  // Original was 0 0 100 100. Trimmed should be smaller width AND offset > 0.
  assert.ok(vb[2] < 100, `trimmed width should be <100, got ${vb[2]}`);
  assert.ok(vb[0] > 0, `trimmed minX should be >0, got ${vb[0]}`);
});
test("trim sets preserveAspectRatio=xMidYMid meet", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const out = trimSvg(svg);
  assert.match(out, /preserveAspectRatio="xMidYMid meet"/);
});
test("trim drops fixed width/height by default", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const out = trimSvg(svg);
  const open = out.match(/<svg[^>]*>/i)[0];
  assert.doesNotMatch(open, /\swidth=/i);
  assert.doesNotMatch(open, /\sheight=/i);
});
test("trim with keepDimensions preserves width/height", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const out = trimSvg(svg, { keepDimensions: true });
  const open = out.match(/<svg[^>]*>/i)[0];
  assert.match(open, /\swidth=/i);
  assert.match(open, /\sheight=/i);
});
test("trim is idempotent (second run produces ~identical viewBox)", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const once = trimSvg(svg, { stripBackground: true });
  const twice = trimSvg(once, { stripBackground: true });
  // Bbox should match within 0.5 viewBox units (no further drift on second pass)
  const v1 = once.match(/viewBox="([^"]+)"/i)[1].split(/\s+/).map(Number);
  const v2 = twice.match(/viewBox="([^"]+)"/i)[1].split(/\s+/).map(Number);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(v1[i] - v2[i]) < 0.5, `viewBox[${i}] drifted: ${v1[i]} vs ${v2[i]}`);
  }
});
test("trim leaves color tokens untouched (composes with verify)", () => {
  const svg = readFileSync(new URL("./good.svg", import.meta.url), "utf8");
  const trimmed = trimSvg(svg, { stripBackground: true });
  const r = verifySvg(trimmed, PALETTE);
  assert.equal(r.ok, true, JSON.stringify(r.offenders));
});
test("trim returns input unchanged when no geometry is found", () => {
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
  assert.equal(trimSvg(empty), empty);
});

console.log(`\n${passed} test(s) passed.`);
