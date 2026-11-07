#!/usr/bin/env node
/**
 * rom2tables — extracts the game tables of Asteroids from the ROM set into
 * data/tables.json: the sine table, the rock points, the saucer's Y speeds,
 * the arctangent of the small saucer's aim, the text positions, the
 * directions of the ship's pieces and the English messages. The spec
 * (rom2tables.spec.json) says where each table is and how it is typed;
 * this only reads bytes (and unpacks the messages). The game logic
 * (app/game.js, AS-M4) and the playfield use nothing but this file for the
 * numbers of the original — no table is retyped by hand.
 *
 * usage: node tools/rom2tables.mjs [tools/rom2tables.spec.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const specFile = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), 'rom2tables.spec.json');
const specDir = path.dirname(path.resolve(specFile));
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const hex = (s) => parseInt(s, 16);

const memory = new Uint8Array(0x10000);
for (const rom of spec.roms) {
  memory.set(fs.readFileSync(path.join(specDir, spec.romDir, rom.file)), hex(rom.address));
}

const readers = {
  uint8: (a) => memory[a],
  int8: (a) => (memory[a] << 24) >> 24,
  uint16: (a) => memory[a] | (memory[a+1] << 8),
  int16: (a) => ((memory[a] | (memory[a+1] << 8)) << 16) >> 16
};
const sizes = {uint8: 1, int8: 1, uint16: 2, int16: 2};

const out = {note: spec.note, tables: {}};
for (const name of Object.keys(spec.tables)) {
  const t = spec.tables[name];
  const values = [];
  let a = hex(t.address);
  for (let i = 0; i < t.count; i++, a += sizes[t.type]) {
    values.push(readers[t.type](a));
  }
  out.tables[name] = {address: '0x'+t.address.toLowerCase(), note: t.note, values: values};
}

// the messages unpacked (VEC:L0, the ASCIN macro: 3 characters in 2 bytes,
// AAAAABBB BBCCCCCD, bit 0 of the second byte ends the string)
const alphabet = ' 012ABCDEFGHIJKLMNOPQRSTUVWXYZ';   // code 1 = blank, 2..4 = 0..2, 5..30 = A..Z
const messages = [];
const base = hex(spec.tables.messageOffsets.address);
for (const offset of out.tables.messageOffsets.values) {
  let a = base+offset;
  let text = '';
  for (;;) {
    const w = (memory[a] << 8) | memory[a+1];
    a += 2;
    const codes = [(w >> 11) & 0x1F, (w >> 6) & 0x1F, (w >> 1) & 0x1F];
    let ended = false;
    for (const c of codes) {
      if (c == 0) {
        ended = true;
        break;
      }
      text += alphabet[c-1];
    }
    if (ended || (w & 1)) break;
  }
  messages.push(text);
}
// the positions as pairs, in DVG units (the table holds X/4, Y/4)
const p = out.tables.textPositions.values;
out.messages = messages.map((text, i) => ({index: i, text: text, x: p[i*2]*4, y: p[i*2+1]*4}));
out.messagesNote = 'The 11 English messages (VEC:L0) with their positions from MSG:VGMSGS (notes 9.3), drawn at global scale $10 by VGMSG; message 1 is followed by the player number.';
delete out.tables.messagesPacked;

const outFile = path.join(specDir, spec.output);
fs.writeFileSync(outFile, JSON.stringify(out, null, 1)+'\n');
console.log(`${path.relative(process.cwd(), outFile)}: ${Object.keys(out.tables).length} tables, ${messages.length} messages: ${messages.map((m) => JSON.stringify(m)).join(', ')}`);
