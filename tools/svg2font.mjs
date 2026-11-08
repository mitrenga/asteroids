#!/usr/bin/env node
/**
 * svg2font.mjs — vector font of the ASTEROIDS title from the letter outlines.
 *
 * Reads `sources/fonts/sliced-gaming-font-outlines.svg` (filled outline paths
 * of the letters A–Z, several parts per letter, two rows with `data-top` /
 * `data-base` giving the cap top and the baseline) and writes
 * `app/slicedFontGlyphs.js`: for every letter the outline polylines in grid
 * units, where the cap height is `HEIGHT` units and y 0 is the cap top
 * (the `AbstractVectorFont` convention), plus the glyph width, so the font
 * class can draw proportionally.
 *
 * Cubic Béziers become straight lines only: a curve is cut into equal
 * parameter steps, one segment per 45° of its turning angle (the angle
 * between its start and end tangents), so a quarter circle is two segments
 * and a gentler bend one; collinear points are dropped and the result rounded
 * to 1/100 of a unit. Parts are kept separate so the slice gaps stay open.
 *
 *   node tools/svg2font.mjs            writes app/slicedFontGlyphs.js
 *   node tools/svg2font.mjs --check    only reports the glyph widths
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'sources/fonts/sliced-gaming-font-outlines.svg');
const OUT = path.join(ROOT, 'app/slicedFontGlyphs.js');
const HEIGHT = 12;           // cap height in grid units
const SIDE_BEARING = 0;      // glyphs are trimmed to their ink; the font adds the gap
const SIMPLIFY_EPS = 0.06;   // grid units: nearer points and flatter bends are dropped
const SEGMENT_ANGLE = Math.PI/4; // one straight segment per 45° of curve — a quarter circle is two

/** Parse one SVG path `d` (absolute M/L/C/Z only) into closed polylines. */
function parsePath(d) {
  const tokens = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  const polys = [];
  let poly = null, cmd = null, i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLCZ]/.test(t)) { cmd = t; i++; if (cmd === 'Z') { if (poly && poly.length > 2) polys.push(poly); poly = null; } continue; }
    if (cmd === 'M') { poly = [[num(), num()]]; cmd = 'L'; }
    else if (cmd === 'L') poly.push([num(), num()]);
    else if (cmd === 'C') {
      const [x0, y0] = poly[poly.length - 1];
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      flattenCubic(poly, x0, y0, x1, y1, x2, y2, x3, y3);
    } else throw new Error('unsupported command ' + cmd);
  }
  if (poly && poly.length > 2) polys.push(poly);
  return polys;
}

/** Cuts a cubic into straight segments, one per 45° of its turning angle (at least one). */
function flattenCubic(poly, x0, y0, x1, y1, x2, y2, x3, y3) {
  // tangents at the ends (falling back to the chord when a control point coincides)
  const tx0 = (x1 - x0) || (x2 - x0) || (x3 - x0), ty0 = (y1 - y0) || (y2 - y0) || (y3 - y0);
  const tx1 = (x3 - x2) || (x3 - x1) || (x3 - x0), ty1 = (y3 - y2) || (y3 - y1) || (y3 - y0);
  const dot = tx0 * tx1 + ty0 * ty1, cross = tx0 * ty1 - ty0 * tx1;
  const angle = Math.abs(Math.atan2(cross, dot));
  const n = Math.max(1, Math.round(angle / SEGMENT_ANGLE));
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    poly.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
               u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
  }
}

/** Drop repeated and collinear points of a closed polyline. */
function simplify(poly, eps) {
  const out = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < eps) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < eps) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let k = 0; k < out.length; k++) {
      const a = out[(k + out.length - 1) % out.length], b = out[k], c = out[(k + 1) % out.length];
      const abx = b[0] - a[0], aby = b[1] - a[1], acx = c[0] - a[0], acy = c[1] - a[1];
      const dist = Math.abs(abx * acy - aby * acx) / (Math.hypot(acx, acy) || 1);
      if (dist < eps) { out.splice(k, 1); changed = true; break; }
    }
  }
  return out;
}

const svg = fs.readFileSync(SRC, 'utf8');
const glyphs = {};
let minTop = 0, maxBottom = HEIGHT;
for (const row of svg.matchAll(/<g id="row\d" data-top="([\d.]+)" data-base="([\d.]+)">([\s\S]*?)<\/g>/g)) {
  const top = parseFloat(row[1]), base = parseFloat(row[2]);
  const scale = HEIGHT / (base - top);
  for (const m of row[3].matchAll(/<path id="([A-Z])" d="([^"]+)"\/>/g)) {
    const ch = m[1];
    const g = glyphs[ch] ||= {strokes: []};
    for (const poly of parsePath(m[2])) {
      const scaled = poly.map(([x, y]) => [x * scale, (y - top) * scale]);
      const s = simplify(scaled, SIMPLIFY_EPS);
      if (s.length > 2) g.strokes.push(s);
    }
  }
}
const order = Object.keys(glyphs).sort();
for (const ch of order) {
  const g = glyphs[ch];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of g.strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  minTop = Math.min(minTop, y0); maxBottom = Math.max(maxBottom, y1);
  const r = v => Math.round(v * 100) / 100;
  g.width = r(x1 - x0 + 2 * SIDE_BEARING);
  // closed outline: polyline back to its first point
  g.strokes = g.strokes.map(s => { const pts = s.map(([x, y]) => [r(x - x0 + SIDE_BEARING), r(y)]); pts.push(pts[0]); return pts.flat(); });
}
const descent = Math.round((maxBottom - HEIGHT) * 100) / 100;
const ascent = Math.round(-minTop * 100) / 100;
const widths = order.map(ch => `${ch} ${glyphs[ch].width}`).join(', ');
console.log(`${order.length} glyphs, height ${HEIGHT}, ascent ${ascent} above the cap, descent ${descent}; widths: ${widths}`);
if (process.argv.includes('--check')) process.exit(0);

const lines = [];
lines.push('// begin code');
lines.push('/**');
lines.push(' * Glyphs of the ASTEROIDS title font — generated by tools/svg2font.mjs from');
lines.push(' * sources/fonts/sliced-gaming-font-outlines.svg (Yellow and Black Modern Sports');
lines.push(' * Sliced Gaming Font by Patrick Santos, vecteezy.com, as the model). Do not edit.');
lines.push(' *');
lines.push(` * Grid: cap height ${HEIGHT} units, y 0 = cap top, baseline y ${HEIGHT}; flourishes reach`);
lines.push(` * ${ascent} above the cap and ${descent} below the baseline. Every stroke is a closed`);
lines.push(' * outline of one slice of the letter (x, y, x, y, …, back to the start);');
lines.push(' * `width` is the ink width, the font adds the letter gap.');
lines.push(' */');
lines.push(`export const SLICED_FONT_METRICS = {height: ${HEIGHT}, ascent: ${ascent}, descent: ${descent}, gap: 2};`);
lines.push('export const SLICED_FONT_GLYPHS = {');
for (const ch of order) {
  const g = glyphs[ch];
  lines.push(`  '${ch}': {width: ${g.width}, strokes: [`);
  for (const s of g.strokes) lines.push(`    [${s.join(', ')}],`);
  lines.push('  ]},');
}
lines.push('};');
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`written ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} B)`);
