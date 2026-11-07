#!/usr/bin/env node
/**
 * mockvram — a vector RAM built the way the original's routines build
 * theirs, for exercising matchvectors while there is no dump from MAME
 * (MAME is not installed here). It is **not** the original: the words
 * are written by this script after the rev 4 routines it cites, so what
 * it checks is that the playfield's drawing of the extracted code
 * (data/shapes.json through DVG.draw) is the same picture as the ROM's
 * own subroutines run through the DVG from a display list — the ship
 * copied with its sign bits flipped, the rocks and the glyphs called by
 * the table words, the copyright and the lives icon by JSRL. The
 * acceptance of AS-M3 stays a real dump (`save vram.bin,4000,800`).
 *
 * The scene is Playfield.demoState(hiScore): the ship in the middle
 * pointing up, four large rocks, score 00, three ships, the high score,
 * the copyright.
 *
 * usage: node tools/mockvram.mjs out/vram.bin [hiScore]
 *        node tools/matchvectors.mjs out/vram.bin      (0 unmatched expected)
 */
import '../app/svision/tools/nodeEnv.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { Playfield } = await import('../app/playfield.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outFile = process.argv[2];
if (!outFile) {
  console.error('usage: node tools/mockvram.mjs out/vram.bin [hiScore]');
  process.exit(2);
}
const hiScore = parseInt(process.argv[3] || '0', 10);
const spec = JSON.parse(fs.readFileSync(path.join(root, 'tools/rom2vectors.spec.json'), 'utf8'));
const memory = new Uint8Array(0x10000);
for (const rom of spec.roms) {
  memory.set(fs.readFileSync(path.join(root, 'tools', spec.romDir, rom.file)), parseInt(rom.address, 16));
}
const romWord = (cpu) => memory[cpu] | (memory[cpu+1] << 8);

const ram = new Uint8Array(0x800);
let p = 0x402;                                   // VGLIST = $4402: the buffer word 0 jumps to
const w = (v) => { ram[p] = v & 0xFF; ram[p+1] = (v >> 8) & 0xFF; p += 2; };
ram[0] = 0x01; ram[1] = 0xE2;                    // $4000: JMPL $201 (= $4402), as RESET writes it (notes 2.3)
ram[2] = 0x00; ram[3] = 0xB0;                    // $4002: HALT (the other buffer)
const labs = (x, y, s) => { w(0xA000 | (y & 0xFFF)); w((s << 12) | (x & 0xFFF)); };   // MoveBeam / SetLABSData $7c1c
const wait = (t) => { w(t << 12); w(0); };                                          // SpotKill $7cde
const jsrl = (cpu) => w(0xC000 | (((cpu-0x4000) >> 1) & 0xFFF));                    // VecRomJSRL $7bfc
const glyph = (ch) => w(romWord(0x56D4+' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(ch)*2));   // DrawDigit $7bd1: the CharPtrTbl word

// PICTUR (DrawObject $72fe): LABS(x, y+128, S), WAIT $70-S (two WAIT 9 for a small scale), the table word
const rock = (o) => {
  const s = Playfield.scaleOfSize(o.size);
  labs(o.x, o.y+128, s);
  if (s) { wait(9); wait(9); } else { wait(7); }
  w(romWord(0x51DE+(o.shape & 3)*2));            // AstPtrnPtrTbl: the JSRL ROCKn word itself
};
// the ship (UpdateShipDraw $750b, DrawShip $6ad3): the picture's words copied, the sign bits (bit 2 of the sign bytes) flipped
const ship = (o) => {
  labs(o.x, o.y+128, 0xE);
  wait(9); wait(9);
  const pic = Playfield.shipPicture(o.angle);
  let a = romWord(0x526E+pic.picture*2);          // ShipDirPtrTbl
  const copy = () => {
    for (;;) {
      const w0 = romWord(a);
      if ((w0 >> 12) == 0xD) { a += 2; return; }   // RTSL: not copied
      if ((w0 >> 12) == 0xF) {                     // SVEC: the Y sign in the high byte, the X sign in the low byte
        w(w0 ^ (pic.yInv ? 0x0400 : 0) ^ (pic.xInv ? 0x0004 : 0));
        a += 2;
      } else {                                     // VCTR: the Y sign in the first word, the X sign in the second
        w(w0 ^ (pic.yInv ? 0x0400 : 0));
        w(romWord(a+2) ^ (pic.xInv ? 0x0400 : 0));
        a += 4;
      }
    }
  };
  copy();
  if (o.flame) {
    copy();
  }
};

const state = Playfield.demoState(hiScore);
state.objects.forEach((o) => {                   // MOTION: in the state's order (34 down to 0)
  if (o.kind == 'rock') rock(o);
  else if (o.kind == 'ship') ship(o);
  else throw new Error('mockvram: '+o.kind+' is not built here');
});
// PARAMS (UpdateScreenText $724f)
jsrl(0x50A4);                                    // VecCredits
labs(100, 876, 1); wait(7);
for (const c of Playfield.scoreText(state.score)) glyph(c);
if (state.lives > 0) {
  labs(160, 852, 0xE);
  for (let i = 0; i < state.lives; i++) jsrl(0x54DA);
}
labs(480, 876, 0); wait(5);
for (const c of Playfield.scoreText(state.hiScore)) glyph(c);
labs(508, 508, 0);                               // "MINIMUM CURRENT DRAW"
w(0xB0B0);                                       // VecHalt

fs.mkdirSync(path.dirname(path.resolve(outFile)), {recursive: true});
fs.writeFileSync(outFile, ram);
console.log(`${outFile}: ${p} bytes of the 2 KiB used, ${state.objects.length} objects, hiScore ${hiScore}`);
