#!/usr/bin/env node
/**
 * svg2font.mjs — vector font of the ASTEROIDS title from the letter outlines.
 *
 * Reads `sources/fonts/sliced-gaming-font-outlines.svg` (filled outline paths
 * of the letters A–Z, several parts per letter, two rows with `data-top` /
 * `data-base` giving the cap top and the baseline) and writes
 * the glyph table of `app/slicedFont.js` (the region between the
 * `// begin generated glyphs` and `// end generated glyphs` markers; the rest
 * of the file is the hand-written font class): for every letter the outline
 * polylines in grid units, where the cap height is `HEIGHT` units and y 0 is the cap top
 * (the `AbstractVectorFont` convention), plus the glyph width, so the font
 * class can draw proportionally.
 *
 * Cubic Béziers become straight lines only: consecutive cubics form one arc,
 * which is cut evenly along its length into one segment per 45° of its
 * turning angle (summed from fine samples), so a quarter circle is two
 * segments and a gentler bend one, however many cubics it was drawn with;
 * an arc shorter than `SMALL_ARC` that bends 45° or more is always two
 * segments, a small beak (the inner ends of S, the bowl of R)
 * (a straight piece shorter than `JOIN_BELOW` between curves is a seam of
 * the drawing and stays inside the arc); collinear points are dropped and the result rounded
 * to 1/100 of a unit. Parts are kept separate so the slice gaps stay open.
 *
 *   node tools/svg2font.mjs            rewrites the glyph table in app/slicedFont.js
 *   node tools/svg2font.mjs --check    only reports the glyph widths
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'sources/fonts/sliced-gaming-font-outlines.svg');
const OUT = path.join(ROOT, 'app/slicedFont.js');
const BEGIN = '// begin generated glyphs', END = '// end generated glyphs';
const HEIGHT = 12;           // cap height in grid units
const LETTERS = 'ADEIORST';  // only the letters of ASTEROIDS — the title is the font's only use (operator 2026-11-08)
const SIDE_BEARING = 0;      // glyphs are trimmed to their ink; the font adds the gap
const SIMPLIFY_EPS = 0.06;   // grid units: nearer points and flatter bends are dropped
const SEGMENT_ANGLE = Math.PI/4; // one straight segment per 45° of arc — a quarter circle is two
const SAMPLES_PER_CUBIC = 32;    // sampling of a cubic for the turning angle and the arc length
let runScale = 1;              // SVG units → grid units of the row being converted
const SMALL_ARC = 3;             // grid units: a shorter arc that bends 45° or more is a beak of two segments, whatever its angle
// strokes given by the operator instead of the conversion (grid units of the
// finished glyph, x from the glyph's left edge, y from the cap top): the bowl
// of R (operator 2026-11-08) — the hole's right side is a ">" with its tip at
// mid-height, both arms at 45°, the bottom edge pulled out to the top edge's end
const OPERATOR_STROKES = {
  R: {1: [[6.02, 3.12], [11.22, 3.12], [11.91, 3.81], [11.22, 4.5], [7.43, 4.54]]}
};
const JOIN_BELOW = 0.25;         // grid units: a straight piece this short between two curves is part of the arc

/** Parse one SVG path `d` (absolute M/L/C/Z only) into closed polylines. */
function parsePath(d, joinBelow) {
  const tokens = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  const polys = [];
  let poly = null, cmd = null, run = [], i = 0;
  const num = () => parseFloat(tokens[i++]);
  const flush = () => { if (run.length) { flattenRun(poly, run); run = []; } };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLCZ]/.test(t)) {
      cmd = t; i++;
      if (cmd === 'Z') { flush(); if (poly && poly.length > 2) polys.push(poly); poly = null; }
      continue;
    }
    if (cmd === 'M') { flush(); poly = [[num(), num()]]; cmd = 'L'; }
    else if (cmd === 'L') {
      const x = num(), y = num();
      if (run.length) {
        // a tiny straight piece inside an arc (the drawing's seam) stays in the arc as a flat cubic
        const [x0, y0] = run[run.length - 1].slice(6);
        if (Math.hypot(x - x0, y - y0) < joinBelow) { run.push([x0, y0, x0, y0, x, y, x, y, true]); continue; }
      }
      flush(); poly.push([x, y]);
    }
    else if (cmd === 'C') {
      // consecutive cubics form one arc: the last point so far is its start
      const [x0, y0] = run.length ? run[run.length - 1].slice(6) : poly[poly.length - 1];
      if (!run.length && poly.length > 1) {
        // …and a tiny straight piece just before the arc belongs to it too
        const [px, py] = poly[poly.length - 2];
        if (Math.hypot(x0 - px, y0 - py) < joinBelow) { poly.pop(); run.push([px, py, px, py, x0, y0, x0, y0, true]); }
      }
      run.push([x0, y0, num(), num(), num(), num(), num(), num()]);
    } else throw new Error('unsupported command ' + cmd);
  }
  flush();
  if (poly && poly.length > 2) polys.push(poly);
  return polys;
}

/** A point of the cubic (x0,y0 x1,y1 x2,y2 x3,y3[, seam]) at parameter t, with its tangent (the derivative) as [x, y, tx, ty]. */
function cubicAt(c, t) {
  const u = 1 - t;
  // a seam (c[8]) has no tangent of its own: its heading comes from the chord of the arc around it
  return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
          u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7],
          c[8] ? 0 : 3 * u * u * (c[2] - c[0]) + 6 * u * t * (c[4] - c[2]) + 3 * t * t * (c[6] - c[4]),
          c[8] ? 0 : 3 * u * u * (c[3] - c[1]) + 6 * u * t * (c[5] - c[3]) + 3 * t * t * (c[7] - c[5])];
}

/**
 * Cuts a run of consecutive cubics (one arc) into straight segments, one per
 * 45° of its turning angle (at least one). The arc is sampled finely, the
 * turning angle summed (unsigned — an arc ending in the spike of a flourish
 * turns back and must still count) from the headings between samples a 1/64
 * of the arc apart (so a quarter circle split into several cubics, or one
 * with a degenerate control point or a zero-length piece, is still measured
 * as 90°; the headings are the curve's tangents at the samples, so the
 * vertices sit where the tangent has really turned by 45°, 90°, …), and the vertices are taken evenly along the arc length.
 */
function flattenRun(poly, run) {
  const samples = [];
  run.forEach((c, k) => {
    for (let j = k ? 1 : 0; j <= SAMPLES_PER_CUBIC; j++) samples.push(cubicAt(c, j / SAMPLES_PER_CUBIC));
  });
  const length = [0];
  for (let j = 1; j < samples.length; j++) {
    length.push(length[j - 1] + Math.hypot(samples[j][0] - samples[j - 1][0], samples[j][1] - samples[j - 1][1]));
  }
  // the turning angle from headings between anchors at least 1/64 of the arc apart:
  // a degenerate (zero-length) cubic or a kink of a few hundredths must not count
  const total = length[length.length - 1], step = total / 64;
  const anchors = [0], turned = [0];   // sample index and the turning reached there
  let turning = 0, prevHeading = null;
  const headingAt = (j, a) => {
    // the tangent of the curve at the sample; the chord from the previous anchor where it degenerates
    let [, , tx, ty] = samples[j];
    if (Math.hypot(tx, ty) < 1e-6) { tx = samples[j][0] - samples[a][0]; ty = samples[j][1] - samples[a][1]; }
    return Math.hypot(tx, ty) < 1e-9 ? null : Math.atan2(ty, tx);
  };
  for (let j = 0; j < samples.length; j++) {
    const a = anchors[anchors.length - 1];
    if (j > 0 && length[j] - length[a] < step && j < samples.length - 1) continue;
    const heading = headingAt(j, a);
    if (heading === null) continue;
    if (prevHeading !== null) {
      let delta = heading - prevHeading;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      turning += Math.abs(delta);
    }
    prevHeading = heading;
    if (j > 0) { anchors.push(j); turned.push(turning); }
  }
  let n = Math.max(1, Math.round(turning / SEGMENT_ANGLE));
  const beak = total * runScale < SMALL_ARC && turning >= SEGMENT_ANGLE;
  if (beak) {
    n = 2;   // the rounded inner ends of S and the bowl of R: a small beak, not a tiny curve
  }
  if (process.env.SVG2FONT_DEBUG) console.log(`  arc ${run.length} cubics, ${(turning * 180 / Math.PI).toFixed(1)}°, length ${(total * runScale).toFixed(2)} → ${n}${beak ? ' beak' : ''}`);
  // the vertices where the arc has turned by i/n of the whole — the same angle
  // on the inner and the outer arc of a letter puts them at the same height
  for (let i = 1, k = 0; i <= n; i++) {
    if (i === n) { poly.push(samples[samples.length - 1]); break; }
    const target = turning * i / n;
    while (k < turned.length - 1 && turned[k + 1] < target) k++;
    const span = turned[k + 1] - turned[k], f = span > 0 ? (target - turned[k]) / span : 0;
    const p = samples[anchors[k]], q = samples[anchors[k + 1]];
    poly.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
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
  runScale = scale;
  for (const m of row[3].matchAll(/<path id="([A-Z])" d="([^"]+)"\/>/g)) {
    const ch = m[1];
    if (!LETTERS.includes(ch)) continue;
    const g = glyphs[ch] ||= {strokes: []};
    for (const poly of parsePath(m[2], JOIN_BELOW / scale)) {
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
  g.strokes = g.strokes.map(s => s.map(([x, y]) => [r(x - x0 + SIDE_BEARING), r(y)]));
  for (const [index, pts] of Object.entries(OPERATOR_STROKES[ch] || {})) {
    g.strokes[index] = pts.map(([x, y]) => [x, y]);
  }
  g.strokes = g.strokes.map(pts => { pts = pts.slice(); pts.push(pts[0]); return pts.flat(); });
}
const descent = Math.round((maxBottom - HEIGHT) * 100) / 100;
const ascent = Math.round(-minTop * 100) / 100;
const widths = order.map(ch => `${ch} ${glyphs[ch].width}`).join(', ');
console.log(`${order.length} glyphs, height ${HEIGHT}, ascent ${ascent} above the cap, descent ${descent}; widths: ${widths}`);
if (process.argv.includes('--check')) process.exit(0);

const lines = [];
lines.push(`${BEGIN} (tools/svg2font.mjs) — grid: cap height ${HEIGHT} units, y 0 = cap top,`);
lines.push(`// baseline y ${HEIGHT}; every stroke is a closed outline of one slice of the letter`);
lines.push('// (x, y, …, back to the start), `width` is the ink width, the font adds the gap');
lines.push(`const SLICED_FONT_METRICS = {height: ${HEIGHT}, ascent: ${ascent}, descent: ${descent}, gap: 2};`);
lines.push('const SLICED_FONT_GLYPHS = {');
for (const ch of order) {
  const g = glyphs[ch];
  lines.push(`  '${ch}': {width: ${g.width}, strokes: [`);
  for (const s of g.strokes) lines.push(`    [${s.join(', ')}],`);
  lines.push('  ]},');
}
lines.push('};');
lines.push(END);
const file = fs.readFileSync(OUT, 'utf8');
const from = file.indexOf(BEGIN), to = file.indexOf(END);
if (from < 0 || to < from) throw new Error(`${OUT}: the markers "${BEGIN}" … "${END}" are missing`);
fs.writeFileSync(OUT, file.slice(0, from) + lines.join('\n') + file.slice(to + END.length));
console.log(`rewritten the glyph table of ${path.relative(ROOT, OUT)} (${lines.length} lines)`);
