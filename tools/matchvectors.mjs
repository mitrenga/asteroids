#!/usr/bin/env node
/**
 * matchvectors — compares a frame of the remake with a dump of the
 * original's vector RAM (the acceptance test of AS-M3 and AS-M4,
 * METHODOLOGY: match). The dump is the 2 KiB of `$4000-$47FF` as MAME's
 * debugger saves it (`save vram.bin,4000,800` while the game is stopped in
 * a frame); it is run through the same DVG interpreter the game draws
 * with, over the ROM set of sources/rom/asteroid, from DVG address 0
 * (word 0 is the JMPL to the buffer the DVG shows, notes 2.3), and the
 * segments it produces are matched against ours.
 *
 * Ours come one of two ways: from a state file (`state.json`, the fields
 * of Playfield.emptyState(): the texts, the objects, the scores —
 * describing what the dump shows; without one the still of AS-M3,
 * Playfield.demoState), or from the game itself run headless for N ticks
 * with a scripted input (`--script inputs.json`: `{seed, ticks, steps:
 * [[ticks, {left, right, thrust, fire, hyperspace}], ...]}`), which is the
 * AS-M4 criterion — the display list after N ticks with a given input
 * against MAME's.
 *
 * A segment matches when both of its ends lie within `tolerance` units of
 * the other's (either direction) and the intensities agree; the report is
 * the number of segments on each side and the number left unmatched, the
 * exit code that number.
 *
 * usage: node tools/matchvectors.mjs <vram.bin> [state.json] [--script inputs.json] [--tolerance 1] [--svg out.svg] [-v]
 *        node tools/matchvectors.mjs --dump-only <vram.bin> --svg out.svg   only draw the dump
 */
import '../app/svision/tools/nodeEnv.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { DVG } = await import('../app/svision/js/platform/vector/atari/dvg.js');
const { VectorDisplayList } = await import('../app/svision/js/platform/vector/vectorDisplayList.js');
const { Playfield } = await import('../app/playfield.js');
const { GameWorker } = await import('../app/gameWorker.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : def; };
const valued = ['--tolerance', '--svg', '--script'];
const files = args.filter((a, i) => !a.startsWith('-') && !valued.includes(args[i-1]));
if (files.length == 0) {
  console.error('usage: node tools/matchvectors.mjs <vram.bin> [state.json] [--script inputs.json] [--tolerance 1] [--svg out.svg] [-v]');
  process.exit(2);
}
const tolerance = parseFloat(opt('--tolerance', '1'));
const verbose = args.includes('-v');

// -------------------------------------------------- the dump through the DVG
const spec = JSON.parse(fs.readFileSync(path.join(root, 'tools/rom2vectors.spec.json'), 'utf8'));
const memory = new Uint8Array(0x10000);
for (const rom of spec.roms) {
  memory.set(fs.readFileSync(path.join(root, 'tools', spec.romDir, rom.file)), parseInt(rom.address, 16));
}
const DVG_BASE = parseInt(spec.dvgBase, 16);
const dump = fs.readFileSync(files[0]);
memory.set(dump.subarray(0, 0x800), DVG_BASE);
const dvg = new DVG((a) => memory[DVG_BASE+(a & 0x1FFF)]);
dvg.run(0);
const reference = dvg.segments;
console.log(`dump: ${dump.length} bytes, ${dvg.steps} DVG instructions, ${reference.length} segments${dvg.halted ? '' : ', NO HALT'}`);

// ------------------------------------------------------------ our frame
let ours = [];
if (!args.includes('--dump-only')) {
  const json = (file) => JSON.parse(fs.readFileSync(path.join(root, 'data', file+'.json'), 'utf8'));
  const data = {shapes: json('shapes'), font: json('font'), tables: json('tables')};
  const scriptFile = opt('--script', false);
  if (scriptFile) {
    const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
    let last = null;
    const worker = new GameWorker((msg) => { if (msg.id == 'frame') last = msg; });
    worker.handleMessage({id: 'init', seed: script.seed || 0xC0DE, data: data, attract: !!script.attract, hiScore: script.hiScore || 0, headless: true});
    const actions = ['left', 'right', 'thrust', 'fire', 'hyperspace'];
    const steps = (script.steps || []).slice();
    let remaining = steps.length ? steps[0][0] : 0;
    for (let tick = 0; tick < script.ticks; tick++) {
      if (steps.length && remaining == 0) {
        steps.shift();
        remaining = steps.length ? steps[0][0] : 0;
      }
      const held = steps.length ? steps[0][1] : {};
      actions.forEach((a) => worker.handleMessage({id: 'controls', action: a, value: !!held[a]}));
      if (steps.length) {
        remaining--;
      }
      worker.handleMessage({id: 'tick'});
    }
    ours = GameWorker.unpack(last.segments);
    console.log(`game: ${script.ticks} ticks, seed ${script.seed || 0xC0DE}, ${ours.length} segments`);
  } else {
    const playfield = new Playfield(data);
    const state = files[1] ? Object.assign(Playfield.emptyState(), JSON.parse(fs.readFileSync(files[1], 'utf8'))) : Playfield.demoState(0);
    ours = playfield.frame(state);
  }

  const same = (a, b) => {
    const near = (x1, y1, x2, y2) => Math.abs(x1-x2) <= tolerance && Math.abs(y1-y2) <= tolerance;
    return a.intensity == b.intensity && ((near(a.x1, a.y1, b.x1, b.y1) && near(a.x2, a.y2, b.x2, b.y2)) || (near(a.x1, a.y1, b.x2, b.y2) && near(a.x2, a.y2, b.x1, b.y1)));
  };
  const used = new Array(ours.length).fill(false);
  let unmatched = 0;
  reference.forEach((r, i) => {
    const j = ours.findIndex((o, k) => !used[k] && same(r, o));
    if (j < 0) {
      unmatched++;
      if (verbose) console.log(`  dump only: #${i} (${r.x1},${r.y1})-(${r.x2},${r.y2}) i${r.intensity}`);
    } else {
      used[j] = true;
    }
  });
  ours.forEach((o, k) => {
    if (!used[k]) {
      unmatched++;
      if (verbose) console.log(`  ours only: #${k} (${o.x1},${o.y1})-(${o.x2},${o.y2}) i${o.intensity}`);
    }
  });
  console.log(`matchvectors: dump ${reference.length} segments, ours ${ours.length}, ${unmatched} unmatched (tolerance ${tolerance})`);
  process.exitCode = unmatched;
}

// ------------------------------------------------------------- a look
const svgFile = opt('--svg', false);
if (svgFile) {
  const list = new VectorDisplayList();
  DVG.appendTo(list, reference, 895, {color: '#40ff40', strokeWidth: 1.5});
  DVG.appendTo(list, ours, 895, {color: '#ff4040', strokeWidth: 1});
  fs.writeFileSync(svgFile, list.toSVG({width: 1024, height: 768, background: '#000000'}));
  console.log(`${svgFile}: the dump green, ours red`);
}
