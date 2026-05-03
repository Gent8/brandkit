// Smoke test — pure logic only, no network. Run: npm run test:smoke
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { recolorSvg, verifySvg, normalizePalette, normalizeHex, nearest } from "../src/palette.js";

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

console.log(`\n${passed} test(s) passed.`);
