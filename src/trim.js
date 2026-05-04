// Pure trim logic — no fs, no network. Reused by the MCP wrapper.
//
// Why this exists: vectorizers (Recraft, vectorizer.ai) emit SVGs with the
// mark sitting inside a much larger square canvas — easily 40–60% empty.
// Every downstream raster (favicon, og-image, print) inherits that padding,
// so the mark renders tiny relative to its container. trimSvg computes the
// real geometry bbox, rewrites the root viewBox, and switches
// preserveAspectRatio to "xMidYMid meet" so consumers get a tight,
// aspect-correct mark regardless of output size.

const SVG_OPEN_RE = /<svg\b[^>]*>/i;
const VIEWBOX_RE = /\bviewBox\s*=\s*"([^"]+)"/i;
const WIDTH_RE = /\swidth\s*=\s*"[^"]*"/i;
const HEIGHT_RE = /\sheight\s*=\s*"[^"]*"/i;
const PRESERVE_RE = /\bpreserveAspectRatio\s*=\s*"[^"]*"/i;

const SHAPE_RE = /<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?)\/?>(?:\s*<\/\1\s*>)?/gi;
const HIDDEN_BLOCK_RE = /<(defs|clipPath|mask|symbol)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const PATH_TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

function attr(elem, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = elem.match(re);
  return m ? m[1] : null;
}
function num(elem, name, def = 0) {
  const v = attr(elem, name);
  return v != null ? parseFloat(v) : def;
}

function pathBbox(d) {
  if (!d) return null;
  const tokens = d.match(PATH_TOKEN_RE);
  if (!tokens) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let cmd = null;
  let i = 0;
  const point = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (i >= tokens.length) break;
    }
    if (!cmd) { i++; continue; }
    const C = cmd.toUpperCase();
    const rel = cmd !== C;
    let x, y;
    if (C === "M" || C === "L" || C === "T") {
      x = +tokens[i++]; y = +tokens[i++];
      if (rel) { x += cx; y += cy; }
      if (C === "M") { sx = x; sy = y; cmd = rel ? "l" : "L"; }
      cx = x; cy = y;
      point(x, y);
    } else if (C === "H") {
      x = +tokens[i++]; if (rel) x += cx;
      cx = x; point(x, cy);
    } else if (C === "V") {
      y = +tokens[i++]; if (rel) y += cy;
      cy = y; point(cx, y);
    } else if (C === "C") {
      let x1 = +tokens[i++], y1 = +tokens[i++];
      let x2 = +tokens[i++], y2 = +tokens[i++];
      x = +tokens[i++]; y = +tokens[i++];
      if (rel) { x1+=cx; y1+=cy; x2+=cx; y2+=cy; x+=cx; y+=cy; }
      point(x1, y1); point(x2, y2); point(x, y);
      cx = x; cy = y;
    } else if (C === "S" || C === "Q") {
      let x1 = +tokens[i++], y1 = +tokens[i++];
      x = +tokens[i++]; y = +tokens[i++];
      if (rel) { x1+=cx; y1+=cy; x+=cx; y+=cy; }
      point(x1, y1); point(x, y);
      cx = x; cy = y;
    } else if (C === "A") {
      const rx = +tokens[i++], ry = +tokens[i++];
      i++; i++; i++; // x-axis-rotation, large-arc, sweep
      x = +tokens[i++]; y = +tokens[i++];
      if (rel) { x += cx; y += cy; }
      // conservative arc bbox: union of endpoint disks of radius (rx,ry)
      point(cx - rx, cy - ry); point(cx + rx, cy + ry);
      point(x - rx, y - ry); point(x + rx, y + ry);
      cx = x; cy = y;
    } else if (C === "Z") {
      cx = sx; cy = sy;
    } else {
      i++;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

function pointsBbox(pointsStr) {
  if (!pointsStr) return null;
  const nums = pointsStr.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i], y = +nums[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function elementBbox(tag, elem) {
  if (tag === "path") return pathBbox(attr(elem, "d"));
  if (tag === "rect") {
    const x = num(elem, "x"), y = num(elem, "y");
    const w = num(elem, "width"), h = num(elem, "height");
    if (w <= 0 || h <= 0) return null;
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }
  if (tag === "circle") {
    const cx = num(elem, "cx"), cy = num(elem, "cy"), r = num(elem, "r");
    if (r <= 0) return null;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (tag === "ellipse") {
    const cx = num(elem, "cx"), cy = num(elem, "cy");
    const rx = num(elem, "rx"), ry = num(elem, "ry");
    if (rx <= 0 || ry <= 0) return null;
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }
  if (tag === "line") {
    const x1 = num(elem, "x1"), y1 = num(elem, "y1");
    const x2 = num(elem, "x2"), y2 = num(elem, "y2");
    return {
      minX: Math.min(x1, x2), minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2), maxY: Math.max(y1, y2),
    };
  }
  if (tag === "polygon" || tag === "polyline") {
    return pointsBbox(attr(elem, "points"));
  }
  return null;
}

function parseTransform(tStr) {
  if (!tStr) return null;
  const tr = tStr.match(/translate\s*\(\s*(-?[\d.eE+-]+)\s*[,\s]\s*(-?[\d.eE+-]+)\s*\)/);
  if (tr) return { kind: "translate", tx: +tr[1], ty: +tr[2] };
  const trX = tStr.match(/translate\s*\(\s*(-?[\d.eE+-]+)\s*\)/);
  if (trX) return { kind: "translate", tx: +trX[1], ty: 0 };
  const mm = tStr.match(/matrix\s*\(\s*([^)]+)\)/);
  if (mm) {
    const v = mm[1].split(/[,\s]+/).filter(Boolean).map(Number);
    if (v.length === 6 && v.every((n) => Number.isFinite(n))) {
      return { kind: "matrix", a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] };
    }
  }
  const sc = tStr.match(/scale\s*\(\s*(-?[\d.eE+-]+)(?:\s*[,\s]\s*(-?[\d.eE+-]+))?\s*\)/);
  if (sc) {
    const sxv = +sc[1], syv = sc[2] != null ? +sc[2] : sxv;
    return { kind: "matrix", a: sxv, b: 0, c: 0, d: syv, e: 0, f: 0 };
  }
  return null;
}

function applyTransform(bbox, t) {
  if (!t || !bbox) return bbox;
  if (t.kind === "translate") {
    return {
      minX: bbox.minX + t.tx, minY: bbox.minY + t.ty,
      maxX: bbox.maxX + t.tx, maxY: bbox.maxY + t.ty,
    };
  }
  if (t.kind === "matrix") {
    const corners = [
      [bbox.minX, bbox.minY], [bbox.maxX, bbox.minY],
      [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY],
    ];
    let mx = Infinity, my = Infinity, MX = -Infinity, MY = -Infinity;
    for (const [x, y] of corners) {
      const X = t.a * x + t.c * y + t.e;
      const Y = t.b * x + t.d * y + t.f;
      if (X < mx) mx = X; if (X > MX) MX = X;
      if (Y < my) my = Y; if (Y > MY) MY = Y;
    }
    return { minX: mx, minY: my, maxX: MX, maxY: MY };
  }
  return bbox;
}

function isRendered(elem) {
  if (/\bdisplay\s*:\s*none\b/i.test(elem)) return false;
  if (/\bvisibility\s*=\s*"hidden"/i.test(elem)) return false;
  if (/\bvisibility\s*:\s*hidden\b/i.test(elem)) return false;
  const fill = attr(elem, "fill");
  const stroke = attr(elem, "stroke");
  // fill="none" with no stroke draws nothing
  if (fill === "none" && (!stroke || stroke === "none")) return false;
  return true;
}

function strokeExpand(bbox, elem) {
  const stroke = attr(elem, "stroke");
  if (!stroke || stroke === "none") return bbox;
  const sw = parseFloat(attr(elem, "stroke-width") || "1");
  if (!Number.isFinite(sw) || sw <= 0) return bbox;
  const half = sw / 2;
  return {
    minX: bbox.minX - half, minY: bbox.minY - half,
    maxX: bbox.maxX + half, maxY: bbox.maxY + half,
  };
}

function parseViewBox(svg) {
  const m = svg.match(SVG_OPEN_RE);
  if (!m) return null;
  const vb = m[0].match(VIEWBOX_RE);
  if (!vb) return null;
  const v = vb[1].split(/[,\s]+/).filter(Boolean).map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) return null;
  return { x: v[0], y: v[1], w: v[2], h: v[3] };
}

function isCanvasFill(bbox, vb) {
  if (!vb) return false;
  const w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
  const area = w * h, vbArea = vb.w * vb.h;
  if (vbArea <= 0) return false;
  if (area / vbArea < 0.99) return false;
  const eps = Math.max(vb.w, vb.h) * 0.01;
  return Math.abs(bbox.minX - vb.x) < eps
    && Math.abs(bbox.minY - vb.y) < eps
    && Math.abs(bbox.maxX - (vb.x + vb.w)) < eps
    && Math.abs(bbox.maxY - (vb.y + vb.h)) < eps;
}

function unionBbox(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Compute the rendered geometry bbox of an SVG.
 *
 * Iterates path/rect/circle/ellipse/line/polygon/polyline. Skips elements
 * inside <defs>/<clipPath>/<mask>/<symbol>, plus elements that are hidden
 * or fill="none" with no stroke. Honors per-element transform (translate,
 * scale, matrix). Stroke widens the bbox by half stroke-width.
 *
 * Group-nested transforms (transforms on <g>) are NOT composed — only the
 * direct element transform is applied. The vectorizer outputs brandkit
 * targets don't use group transforms, so this is sufficient for the
 * common case.
 *
 * @param {string} svg
 * @param {object} [opts]
 * @param {boolean} [opts.stripBackground] exclude shapes that fill the entire viewBox
 * @returns {{minX,minY,maxX,maxY,backgrounds:string[]}|null}
 */
export function computeBbox(svg, opts = {}) {
  const cleaned = svg.replace(HIDDEN_BLOCK_RE, "");
  const vb = parseViewBox(svg);
  let union = null;
  const backgrounds = [];
  let m;
  SHAPE_RE.lastIndex = 0;
  while ((m = SHAPE_RE.exec(cleaned)) !== null) {
    const elem = m[0];
    const tag = m[1].toLowerCase();
    if (!isRendered(elem)) continue;
    let bbox = elementBbox(tag, elem);
    if (!bbox) continue;
    bbox = strokeExpand(bbox, elem);
    const t = parseTransform(attr(elem, "transform"));
    if (t) bbox = applyTransform(bbox, t);
    if (opts.stripBackground && isCanvasFill(bbox, vb)) {
      backgrounds.push(elem);
      continue;
    }
    union = unionBbox(union, bbox);
  }
  if (!union) return null;
  return { ...union, backgrounds };
}

function fmt(n) {
  // Round to 2 decimals, drop trailing zeroes
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Trim an SVG: rewrite the root viewBox to the rendered geometry bbox
 * (plus padding), set preserveAspectRatio="xMidYMid meet", and drop fixed
 * width/height so consumers can size via container.
 *
 * @param {string} svg
 * @param {object} [opts]
 * @param {number} [opts.padPct=4]      padding around the trimmed bbox, % of max(w,h)
 * @param {boolean} [opts.stripBackground=false]  remove canvas-filling shapes from the output
 * @param {boolean} [opts.keepDimensions=false]   keep width/height attrs on root <svg>
 * @returns {string}
 */
export function trimSvg(svg, opts = {}) {
  const padPct = opts.padPct != null ? opts.padPct : 4;
  const stripBackground = !!opts.stripBackground;
  const keepDimensions = !!opts.keepDimensions;

  const bbox = computeBbox(svg, { stripBackground });
  if (!bbox) return svg;

  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (w <= 0 || h <= 0) return svg;
  const pad = Math.max(w, h) * (padPct / 100);
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const newW = w + 2 * pad;
  const newH = h + 2 * pad;
  const newViewBox = `${fmt(minX)} ${fmt(minY)} ${fmt(newW)} ${fmt(newH)}`;

  let out = svg;

  // Remove any canvas-fill shapes detected during stripBackground
  if (stripBackground && bbox.backgrounds && bbox.backgrounds.length) {
    for (const bg of bbox.backgrounds) {
      // escape regex special chars in the matched element string
      const re = new RegExp(bg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "");
      out = out.replace(re, "");
    }
  }

  // Rewrite the <svg> open tag
  const m = out.match(SVG_OPEN_RE);
  if (!m) return out;
  let openTag = m[0];

  if (VIEWBOX_RE.test(openTag)) {
    openTag = openTag.replace(VIEWBOX_RE, `viewBox="${newViewBox}"`);
  } else {
    openTag = openTag.replace(/<svg\b/i, `<svg viewBox="${newViewBox}"`);
  }

  if (PRESERVE_RE.test(openTag)) {
    openTag = openTag.replace(PRESERVE_RE, `preserveAspectRatio="xMidYMid meet"`);
  } else {
    openTag = openTag.replace(/\s*>$/, ` preserveAspectRatio="xMidYMid meet">`);
  }

  if (!keepDimensions) {
    openTag = openTag.replace(WIDTH_RE, "").replace(HEIGHT_RE, "");
  }

  // Tidy double spaces introduced by attribute removal
  openTag = openTag.replace(/\s{2,}/g, " ").replace(/\s+>/, ">");

  return out.replace(SVG_OPEN_RE, openTag);
}
