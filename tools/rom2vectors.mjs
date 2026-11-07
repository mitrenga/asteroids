#!/usr/bin/env node
/**
 * rom2vectors — extracts the vector data of Asteroids from the ROM set into
 * JSON: the shapes (the four rocks, the saucer, the 17 pictures of the ship
 * with their flames, the icon of the reserve lives, the pieces of the
 * exploding ship, the four explosion pictures, the copyright line, the
 * self-test pattern) and the font (37 glyphs). Every shape is stored
 * twice: as its **code** — the DVG instructions decoded (`VCTR`/`SVEC`
 * with the rate T, the signed magnitudes and the intensity), which is
 * what the game draws through the DVG interpreter at the global scale and
 * the place the original's PICTUR would, so the rounding of the rate
 * multipliers is the machine's at every size — and as its **segments** at
 * global scale 0 relative to the beam at the call, for a look and for the
 * font. The interpreter is svision's platform/vector/atari/dvg.js, the
 * same code the game draws with.
 *
 * usage: node tools/rom2vectors.mjs [tools/rom2vectors.spec.json]
 *
 * The spec: the ROM files and where they load, and the addresses of every
 * table (sources/docs/disasm_notes.md 2.4 and the disassembly).
 */
import '../app/svision/tools/nodeEnv.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { DVG } = await import('../app/svision/js/platform/vector/atari/dvg.js');

const specFile = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), 'rom2vectors.spec.json');
const specDir = path.dirname(path.resolve(specFile));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const hex = (s) => parseInt(s, 16);

// ------------------------------------------------------------- the memory
const memory = new Uint8Array(0x10000);
for (const rom of spec.roms) {
  const data = fs.readFileSync(path.join(specDir, spec.romDir, rom.file));
  memory.set(data, hex(rom.address));
}
const DVG_BASE = hex(spec.dvgBase);                   // CPU address of DVG address 0
const dvg = () => new DVG((a) => memory[DVG_BASE+(a & 0x1FFF)]);
const word = (a) => memory[a] | (memory[a+1] << 8);
const cpu = (a) => '0x'+a.toString(16);
const jsrlTarget = (a) => {
  const w = word(a);
  if ((w >> 12) != 0xC) throw new Error(`no JSRL at ${cpu(a)}: ${w.toString(16)}`);
  return DVG_BASE+(w & 0xFFF)*2;
};

/**
 * Decodes the instructions from a CPU address up to and including the
 * first RTSL/HALT (or `count` instructions).
 * @returns {{code, next}} The code and the CPU address after it.
 */
function decodeFrom(cpuAddress, count) {
  const code = [];
  let a = cpuAddress;
  for (let n = 0; ; n++) {
    if (count !== undefined && n >= count) break;
    const w = word(a);
    const i = DVG.decode(w, word(a+2));
    a += i.words*2;
    const entry = {op: i.op};
    if (i.op == 'VCTR' || i.op == 'SVEC') {
      Object.assign(entry, {t: i.t, dx: i.dx, dy: i.dy, z: i.z});
    } else if (i.op == 'LABS') {
      Object.assign(entry, {x: i.x, y: i.y, scale: i.scale});
    } else if (i.op == 'JSRL' || i.op == 'JMPL') {
      entry.address = cpu(DVG_BASE+i.address*2);
    }
    code.push(entry);
    if (i.op == 'RTSL' || i.op == 'HALT') break;
    if (code.length > 200) throw new Error(`no RTSL after ${cpu(cpuAddress)}`);
  }
  return {code: code, next: a};
} // decodeFrom

/**
 * The segments of a code list drawn at global scale 0 with the beam at
 * the centre, moved back so that (0, 0) is where the beam started; and
 * where the beam ended, and the box of the trace.
 */
function traced(code) {
  const d = new DVG();
  d.labs(512, 512, 0);
  d.draw(code);
  const segments = DVG.translate(d.segments, -512, -512);
  const box = segments.reduce((b, s) => ({
    left: Math.min(b.left, s.x1, s.x2), right: Math.max(b.right, s.x1, s.x2),
    bottom: Math.min(b.bottom, s.y1, s.y2), top: Math.max(b.top, s.y1, s.y2)
  }), {left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity});
  return {segments: segments, end: {x: d.x-512, y: d.y-512}, box: segments.length ? box : null};
} // traced

/**
 * A shape at a CPU address: its code and its trace.
 */
function shape(cpuAddress, count) {
  const d = decodeFrom(cpuAddress, count);
  return Object.assign({address: cpu(cpuAddress)}, traced(d.code), {code: d.code, next: d.next});
} // shape

/**
 * A subroutine with its own LABS, run through the memory from the origin:
 * absolute segments.
 */
function absolute(cpuAddress) {
  const d = dvg();
  d.run(cpuAddress-DVG_BASE);
  return {address: cpu(cpuAddress), segments: d.segments, end: {x: d.x, y: d.y}, steps: d.steps};
} // absolute

const strip = (s) => { const o = Object.assign({}, s); delete o.next; return o; };
const out = {};

// --------------------------------------------------------------- shapes
{
  const s = spec.shapes;
  const shapes = {
    note: 'The shapes of the vector ROM (disasm_notes 2.4): `code` = the DVG instructions as stored (VCTR/SVEC: the rate T, the signed magnitudes dx, dy — an SVEC\'s are m << 8 —, the intensity z; a vector moves magnitude / 2^(9 - (S + T)) rounded half up at the global scale S of the LABS before it); `segments` = the trace at global scale 0 relative to the beam at the call, y up; `end` = where the beam is left; `box` = the extent of the trace. The game draws the code through DVG.draw() at the original\'s scale and place.'
  };

  const rocks = [];
  for (let i = 0; i < s.rocks.count; i++) {
    rocks.push(strip(shape(jsrlTarget(hex(s.rocks.table)+i*2))));
  }
  shapes.rocks = {note: s.rocks.note, table: '0x'+s.rocks.table.toLowerCase(), pictures: rocks};

  const saucer = shape(jsrlTarget(hex(s.saucer.jsrl)));
  shapes.saucer = Object.assign({note: s.saucer.note}, strip(saucer));

  const ships = [];
  for (let i = 0; i < s.ships.count; i++) {
    const a = word(hex(s.ships.wordTable)+i*2);
    const body = shape(a);
    const flame = shape(body.next);
    ships.push({address: body.address, degrees: i*5.625, code: body.code, segments: body.segments, end: body.end, box: body.box,
      flame: strip(flame)});
  }
  shapes.ships = {note: s.ships.note, table: '0x'+s.ships.wordTable.toLowerCase(), pictures: ships};

  shapes.livesIcon = Object.assign({note: s.livesIcon.note}, strip(shape(hex(s.livesIcon.address))));

  const pieces = decodeFrom(hex(s.shipPieces.address), s.shipPieces.count).code;
  shapes.shipPieces = {note: s.shipPieces.note, address: '0x'+s.shipPieces.address.toLowerCase(),
    pieces: pieces.map((p) => Object.assign({code: [p]}, traced([p])))};

  const explosions = [];
  for (let i = 0; i < s.explosions.count; i++) {
    explosions.push(strip(shape(jsrlTarget(hex(s.explosions.table)+i*2))));
  }
  shapes.explosions = {note: s.explosions.note, table: '0x'+s.explosions.table.toLowerCase(), pictures: explosions};

  shapes.copyright = Object.assign({note: s.copyright.note, text: '© 1979 ATARI INC'}, absolute(hex(s.copyright.address)));
  shapes.testPattern = Object.assign({note: s.testPattern.note}, absolute(hex(s.testPattern.address)));

  out[s.output] = shapes;
}

// ----------------------------------------------------------------- font
{
  const f = spec.font;
  const table = hex(f.table);
  const glyphs = {};
  const raw = {};
  f.codes.forEach((ch, i) => {
    const target = jsrlTarget(table+i*2);
    const g = shape(target);
    raw[ch] = {address: g.address, code: g.code, segments: g.segments, end: g.end};
    // AbstractVectorFont glyph: strokes on a grid y down, 0 = top of a capital
    glyphs[ch] = {strokes: g.segments.map((s) => [s.x1, f.cellHeight-s.y1, s.x2, f.cellHeight-s.y2])};
  });
  out[f.output] = {
    note: f.note+'. `glyphs` are in the AbstractVectorFont form (strokes on the grid, y down, baseline at cellHeight); `raw` is the code and the trace of every glyph for the playfield, which draws the text through the DVG at the game\'s scale.',
    metrics: {width: f.cellWidth, height: f.cellHeight, advance: f.advance, descent: 0},
    intensity: 7,
    table: '0x'+f.table.toLowerCase(),
    glyphs: glyphs,
    raw: raw
  };
}

// ----------------------------------------------------------------- write
for (const file of Object.keys(out)) {
  const target = path.join(specDir, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(out[file], null, 1)+'\n');
  const o = out[file];
  const summary = o.glyphs
    ? `${Object.keys(o.glyphs).length} glyphs`
    : `${o.rocks.pictures.length} rocks (${o.rocks.pictures.map((r) => r.code.length-1).join('/')} vectors), saucer ${o.saucer.code.length-1}, ${o.ships.pictures.length} ships, lives icon ${o.livesIcon.code.length-1}, ${o.shipPieces.pieces.length} ship pieces, ${o.explosions.pictures.length} explosions, copyright ${o.copyright.segments.length} segments, test pattern ${o.testPattern.segments.length}`;
  console.log(`${path.relative(process.cwd(), target)}: ${summary}`);
}
