// Pure palette logic — no fs, no network. Reused by the MCP wrapper.

const HEX_TOKEN_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_TOKEN_RE = /\brgba?\s*\(\s*([0-9.]+%?)\s*,?\s*([0-9.]+%?)\s*,?\s*([0-9.]+%?)\s*(?:[,\/]\s*[0-9.]+%?\s*)?\)/gi;
const HSL_FN_RE = /\bhsla?\s*\(/i;
const NAMED_ATTR_RE = /\b(?:fill|stroke|stop-color|color|flood-color|lighting-color)\s*=\s*"([a-zA-Z]+)"/g;
const NAMED_STYLE_RE = /(?:fill|stroke|stop-color|color|flood-color|lighting-color)\s*:\s*([a-zA-Z]+)\b/g;

const ALLOWED_NAMED = new Set([
  "none", "transparent", "currentcolor", "inherit", "initial", "unset",
]);

export function normalizeHex(h) {
  if (typeof h !== "string" || !/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`invalid hex: ${JSON.stringify(h)}`);
  }
  let v = h.toUpperCase();
  if (v.length === 4) v = "#" + v.slice(1).split("").map(c => c + c).join("");
  return v;
}

export function normalizePalette(p) {
  if (!Array.isArray(p) || p.length === 0) {
    throw new Error("palette must be a non-empty array of hex strings");
  }
  return p.map(normalizeHex);
}

function parseChannel(s) {
  s = String(s).trim();
  let v;
  if (s.endsWith("%")) v = Math.round((parseFloat(s) / 100) * 255);
  else v = Math.round(parseFloat(s));
  return Math.max(0, Math.min(255, v));
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(n => parseChannel(n).toString(16).padStart(2, "0").toUpperCase()).join("");
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function nearest(hex, palette) {
  const target = hexToRgb(hex);
  return palette.reduce(
    (best, p) => (dist(target, hexToRgb(p)) < dist(target, hexToRgb(best)) ? p : best),
    palette[0],
  );
}

function findUnsupportedColors(svg) {
  const offenders = [];
  if (HSL_FN_RE.test(svg)) offenders.push("hsl()/hsla() functions");
  const named = new Set();
  for (const m of svg.matchAll(NAMED_ATTR_RE)) {
    const v = m[1].toLowerCase();
    if (!ALLOWED_NAMED.has(v)) named.add(v);
  }
  for (const m of svg.matchAll(NAMED_STYLE_RE)) {
    const v = m[1].toLowerCase();
    if (!ALLOWED_NAMED.has(v)) named.add(v);
  }
  if (named.size) offenders.push(`named colors: ${[...named].join(", ")}`);
  return offenders;
}

export function recolorSvg(svg, paletteInput) {
  const palette = normalizePalette(paletteInput);
  const unsupported = findUnsupportedColors(svg);
  if (unsupported.length) {
    throw new Error(
      `SVG contains unsupported color forms (only #hex and rgb()/rgba() are recolored): ${unsupported.join("; ")}`,
    );
  }
  // hex tokens
  let out = svg.replace(HEX_TOKEN_RE, (m) => {
    const full = normalizeHex(m);
    return palette.includes(full) ? full : nearest(full, palette);
  });
  // rgb()/rgba() tokens — convert each to nearest hex
  out = out.replace(RGB_TOKEN_RE, (_full, r, g, b) => {
    const hex = rgbToHex(r, g, b);
    return palette.includes(hex) ? hex : nearest(hex, palette);
  });
  return out;
}

export function verifySvg(svg, paletteInput) {
  const palette = normalizePalette(paletteInput);
  const offenders = [];
  for (const reason of findUnsupportedColors(svg)) {
    offenders.push({ kind: "non-hex", value: reason });
  }
  const seen = new Set();
  for (const m of svg.matchAll(HEX_TOKEN_RE)) {
    const full = normalizeHex(m[0]);
    if (!palette.includes(full) && !seen.has(full)) {
      seen.add(full);
      offenders.push({
        kind: "off-palette",
        value: full,
        suggestion: nearest(full, palette),
      });
    }
  }
  for (const m of svg.matchAll(RGB_TOKEN_RE)) {
    const hex = rgbToHex(m[1], m[2], m[3]);
    if (!palette.includes(hex) && !seen.has(hex)) {
      seen.add(hex);
      offenders.push({
        kind: "off-palette",
        value: m[0],
        normalized: hex,
        suggestion: nearest(hex, palette),
      });
    }
  }
  return { ok: offenders.length === 0, offenders };
}
