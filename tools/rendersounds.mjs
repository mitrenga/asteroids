#!/usr/bin/env node
/**
 * rendersounds — every sound of the board (app/soundBoard.js: the discrete
 * circuits of `asteroid_a.cpp` — the thump's two tones, the two shots,
 * the two saucers and the thrust as loops, the four explosion bytes, the
 * extra ship's tone) as 16-bit WAV files, for the A/B against MAME by ear
 * (AS-M7): the same code renders them in the browser, so what is heard
 * here is what the game plays, before the user's volume. A loop is written
 * once; play it repeated to hear the seam.
 *
 * usage: node tools/rendersounds.mjs [--rate 44100] [--out tools/sounds] [name ...]
 *
 * Prints a table of the files: name, seconds, peak; the names are the
 * keys of SoundBoard.SAMPLES. `--byte XX` renders an explosion of any
 * byte besides.
 */
import '../app/svision/tools/nodeEnv.mjs';   // must come first: the import headers read window.srcVersion
import fs from 'node:fs';
import path from 'node:path';

const { SoundBoard } = await import('../app/soundBoard.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && at+1 < args.length ? args[at+1] : fallback;
};
const rate = parseInt(option('--rate', '44100'), 10);
const out = path.resolve(root, option('--out', 'tools/sounds'));
const byte = option('--byte', false);
const names = args.filter((a, i) => !a.startsWith('--') && (i == 0 || !['--rate', '--out', '--byte'].includes(args[i-1])));

const board = new SoundBoard();
const wanted = names.length ? names : Object.keys(SoundBoard.SAMPLES);
fs.mkdirSync(out, {recursive: true});
const write = (name, sample) => {
  let peak = 0;
  for (let i = 0; i < sample.samples.length; i++) {
    peak = Math.max(peak, Math.abs(sample.samples[i]));
  }
  const file = path.join(out, name+'.wav');
  fs.writeFileSync(file, sample.toWAV(16));
  const loop = SoundBoard.SAMPLES[name] && SoundBoard.SAMPLES[name].loop ? ' loop' : '';
  console.log(`${name.padEnd(14)} ${sample.duration.toFixed(3).padStart(6)} s  peak ${peak.toFixed(3)}${loop}  ${path.relative(process.cwd(), file)}`);
};
for (const name of wanted) {
  if (!(name in SoundBoard.SAMPLES)) {
    console.log(`unknown sound: ${name} (${Object.keys(SoundBoard.SAMPLES).join(', ')})`);
    process.exit(2);
  }
  write(name, board.render(name, rate));
}
if (byte !== false) {
  const b = parseInt(byte, 16) & 0xFF;
  write('explosion'+b.toString(16).toUpperCase().padStart(2, '0'), board.renderExplosion(b, rate));
}
