#!/usr/bin/env node
/**
 * regress — the fingerprints of the screens (METHODOLOGY: regress, not
 * match — there is no original to sit on, only yesterday's build).
 *
 * Each screen is built under Node on the stand-in application of the
 * vector platform (svision/tools/headlessApp.mjs), drawn once through the
 * headless layout, and its markup — the SVG elements the browser layout
 * would put into the <svg>, one per line — is compared with the reference
 * in tools/regress/<screen>.svg. The report is the number of elements and
 * the number of lines that differ; the exit code is the total of the
 * differences.
 *
 * Screens: `menu` (MenuModel in the ROM font); `scene` runs the game
 * headless (GameWorker, seed $C0DE) for one tick and draws the frame
 * through MainModel — the first frame of a game: PLAYER 1, the score,
 * the ships, the copyright, no rocks yet; `fly` runs it for 400 ticks
 * with a scripted input — the wave and the ship appear at tick 128/129,
 * the ship turns left, thrusts, turns right thrusting, coasts through
 * the rocks (it meets none); `catalogue` draws every shape of
 * the ROM in every size through Playfield directly (rocks, saucers, the
 * ship at eight angles, shots, explosions, texts, both scores). AS-M5:
 * `shoot` fires five shots to the right from the middle — the first hits
 * a large rock at tick 197 (20 points), the next its medium child at 204
 * (50), the frame shows the explosion, the children and the shots in
 * flight; `death` thrusts to the right into a rock (tick 238), the frame
 * is the ship's explosion 32 frames on (five pieces, 2 ships left);
 * `hyperspace` jumps at tick 141 and shows the ship where it came back
 * (tick 188, (204, 460)); `saucer` waits for the first (large) saucer
 * (tick 632), turns to 135 degrees and shoots it down (tick 718, 200
 * points), the frame is its explosion with the rocks. AS-M6: `initials`
 * starts (`setup`) with the last ship's explosion about to end and 1 230
 * points against a table of one entry (12 340) — the frame after the
 * end (tick 6) brings the initials screen; rotate left held 16 ticks
 * steps the letter to C, hyperspace held 3 ticks takes it, a typed Z
 * sets the second, the frame is "CZ_" over the four messages; `table`
 * ends the same way with a player name and a table of three, the frame
 * is the high score table of four rows with PUSH START above it.
 *
 * Two more fingerprints are text, not markup (AS-M7): `sounds` is the log
 * of the sounds the frames of the `saucer` and `death` scripts start (tick
 * and names: the thump's beats, the shots, the explosions, the saucer's
 * warble and the thrust as edges), `samples` is every sample the sound board renders
 * (app/soundBoard.js: the discrete circuits of `asteroid_a.cpp`) at
 * 44 100 Hz — name, length, peak and a hash of the 16-bit PCM.
 *
 * usage: node tools/regress.mjs [screen ...]        compare with the references
 *        node tools/regress.mjs --update [screen]   rewrite the reference(s)
 *        node tools/regress.mjs --print screen      print the markup
 *        node tools/regress.mjs --svg screen        print a stand-alone SVG document (rsvg-convert makes a PNG)
 *        node tools/regress.mjs --state screen      print the frame state of a game screen (JSON)
 *        node tools/regress.mjs --print sounds      print the sound log (or samples)
 */
import '../app/svision/tools/nodeEnv.mjs';   // must come first: the import headers read window.srcVersion
import fs from 'node:fs';
import path from 'node:path';

const { headlessVectorApp } = await import('../app/svision/tools/headlessApp.mjs');
const { AtariVectorFont } = await import('../app/svision/js/platform/vector/atari/atariVectorFont.js');
const { SlicedFont } = await import('../app/slicedFont.js');
const { Playfield } = await import('../app/playfield.js');
const { appPlatform } = await import('../app/appPlatform.js');
const { MenuModel } = await import('../app/menuModel.js');
const { MainModel } = await import('../app/mainModel.js');
const { GameWorker } = await import('../app/gameWorker.js');
const { SoundBoard } = await import('../app/soundBoard.js');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
let screens = args.filter((a) => !a.startsWith('--') && a != '-v');
if (screens.length == 0) {
  screens = ['menu', 'scene', 'fly', 'catalogue', 'shoot', 'death', 'hyperspace', 'saucer', 'initials', 'table', 'sounds', 'samples'];
}
const TEXT_SCREENS = ['sounds', 'samples'];

const json = (file) => {
  const p = path.join(root, 'data', file+'.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const data = {global: json('global'), shapes: json('shapes'), font: json('font'), tables: json('tables')};

/**
 * The input scripts of the game screens: `[ticks, {left, right, thrust,
 * fire, hyperspace, letter}]` steps, the actions held for that many
 * ticks (`letter` typed at the step's first tick); `setup(game)` puts
 * the game into a state before the first tick, `playerName` and
 * `hiScores` are what the game is told; or a `state` of the playfield
 * drawn without the worker.
 */
const lastShip = (game) => { game.gdelay = 0; game.hits = 0; game.score = 0x0123; game.obj[27] = 0xFE; game.sdelay = 0x81; game.xinc[27] = 0; game.yinc[27] = 0; };
const SCRIPTS = {
  scene: {ticks: 1, steps: []},
  fly: {ticks: 400, steps: [[140, {}], [30, {left: true}], [60, {thrust: true}], [40, {right: true, thrust: true}], [130, {}]]},
  catalogue: {state: () => Playfield.catalogueState(data.tables, 12340)},
  shoot: {ticks: 210, steps: [[130, {}], [1, {fire: true}], [7, {}], [1, {fire: true}], [7, {}], [1, {fire: true}], [7, {}], [1, {fire: true}], [7, {}], [1, {fire: true}], [47, {}]]},
  death: {ticks: 270, steps: [[130, {}], [140, {thrust: true}]]},
  hyperspace: {ticks: 190, steps: [[140, {}], [1, {hyperspace: true}], [49, {}]]},
  saucer: {ticks: 726, steps: [[600, {}], [32, {left: true}], [27, {}], [1, {fire: true}], [66, {}]]},
  initials: {ticks: 60, steps: [[8, {}], [16, {left: true}], [8, {}], [3, {hyperspace: true}], [6, {}], [1, {letter: 'Z'}], [18, {}]], setup: lastShip},
  table: {ticks: 20, steps: [], playerName: 'PLAYER', setup: lastShip,
    hiScores: [{name: 'ACE', score: 45670}, {name: 'BOB', score: 12340}, {name: 'LM', score: 9990}]}
};

/**
 * The application as GameApp sets it up, minus the browser; the font of the
 * menu is AtariVectorFont and the title the game's SlicedFont as in the game.
 */
function makeApp() {
  return headlessVectorApp(appPlatform(), 1024, 768, {
    version: '0000.00.00',            // fixed: the fingerprint must not move with the version
    title: 'ASTEROIDS',
    copyright: '© 2026 L. MITRENGA, CC BY-NC-SA 4.0',
    playerName: 'PLAYER',
    hiScore: 12340,
    devModeName: false,
    globalData: data.global,
    fonts: {vector: new AtariVectorFont(), title: new SlicedFont()},
    gameData: () => ({shapes: data.shapes, font: data.font, tables: data.tables}),
    gameSeed: () => 0xC0DE
  });
} // makeApp

/**
 * Runs the game headless through a script and returns the last frame message.
 * @param {Object} script
 * @returns {Object}
 */
function runGame(script, log) {
  let last = null;
  const worker = new GameWorker((msg) => {
    if (msg.id == 'frame') {
      last = msg;
      if (log && msg.sounds.length) {
        log.push({tick: msg.tick, sounds: msg.sounds});
      }
    }
  });
  worker.handleMessage({id: 'init', seed: 0xC0DE, data: {shapes: data.shapes, font: data.font, tables: data.tables}, attract: false, hiScore: 12340, headless: true,
    playerName: script.playerName || '', hiScores: script.hiScores, setup: script.setup});
  const actions = ['left', 'right', 'thrust', 'fire', 'hyperspace'];
  let tick = 0;
  const steps = script.steps.slice();
  let remaining = steps.length ? steps[0][0] : 0;
  while (tick < script.ticks) {
    if (steps.length && remaining == 0) {
      steps.shift();
      remaining = steps.length ? steps[0][0] : 0;
    }
    const held = steps.length ? steps[0][1] : {};
    actions.forEach((a) => worker.handleMessage({id: 'controls', action: a, value: !!held[a]}));
    if (steps.length) {
      if (held.letter && remaining == steps[0][0]) {
        worker.handleMessage({id: 'letter', key: held.letter});
      }
      remaining--;
    }
    worker.handleMessage({id: 'tick'});
    tick++;
  }
  return last;
} // runGame

/**
 * One frame of a screen as markup lines.
 */
function render(screen) {
  const app = makeApp();
  let model, frame = null;
  if (screen == 'menu') {
    model = new MenuModel(app, 0);
    app.model = model;
    model.startBackdrop = () => {};     // no worker under Node: the menu without its backdrop
  } else {
    const script = SCRIPTS[screen];
    if (script.state) {
      const state = script.state();
      frame = {id: 'frame', tick: 1, score: state.score, lives: state.lives, gameOver: false, sounds: [], segments: GameWorker.pack(new Playfield({shapes: data.shapes, font: data.font, tables: data.tables}).frame(state)), state: {tick: 1, scene: state}};
    } else {
      frame = runGame(script);
    }
    model = new MainModel(app, false);
    app.model = model;
    model.startWorker = () => {};       // no worker under Node: the frame is handed over below
  }
  model.init();
  if (frame) {
    model.frame = frame;
  }
  model.resizeModel();                // fits the 1024x768 desktop into the pretended element and draws
  model.loopModel(16);                // one frame, as the browser would draw it
  return {app: app, markup: app.layout.markup(), frame: frame};
} // render

/**
 * The log of the sounds of the `saucer` and the `death` scripts as lines
 * (a line naming the script, then the tick and the names of the frame's
 * events): the thump's beats, the saucer and its shots, a shot and an
 * explosion; the thrust's edges and the ship's explosion.
 * @returns {string[]}
 */
function soundsLines() {
  const lines = [];
  ['saucer', 'death'].forEach((name) => {
    const log = [];
    runGame(SCRIPTS[name], log);
    lines.push('# '+name);
    log.forEach((entry) => lines.push(`${entry.tick} ${entry.sounds.join(' ')}`));
  });
  return lines;
} // soundsLines

/**
 * Every sample of the sound board at 44 100 Hz: name, samples, peak and an
 * FNV-1a hash of the 16-bit PCM.
 * @returns {string[]}
 */
function samplesLines() {
  const board = new SoundBoard();
  const all = board.renderAll(44100);
  return Object.keys(all).map((name) => {
    const s = all[name];
    const pcm = s.toSigned16();
    let hash = 0x811C9DC5;
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      hash = Math.imul(hash ^ pcm[i], 0x01000193) >>> 0;
    }
    for (let i = 0; i < s.samples.length; i++) {
      const a = Math.abs(s.samples[i]);
      if (a > peak) {
        peak = a;
      }
    }
    return `${name} ${s.samples.length} ${peak.toFixed(4)} ${hash.toString(16).padStart(8, '0')}`;
  });
} // samplesLines

let total = 0;
for (const screen of screens) {
  if (screen != 'menu' && !SCRIPTS[screen] && !TEXT_SCREENS.includes(screen)) {
    console.log(`unknown screen: ${screen}`);
    process.exit(2);
  }
  const text = TEXT_SCREENS.includes(screen);
  const referenceFile = path.join(root, 'tools/regress', screen+(text ? '.txt' : '.svg'));
  let r, lines;
  if (text) {
    lines = screen == 'sounds' ? soundsLines() : samplesLines();
    r = {markup: lines.join('\n'), frame: null, app: null};
  } else {
    r = render(screen);
    lines = r.markup.split('\n');
  }

  if (flags.includes('--svg')) {
    process.stdout.write(text ? r.markup+'\n' : r.app.layout.toSVG());
    continue;
  }
  if (flags.includes('--print')) {
    process.stdout.write(r.markup+'\n');
    continue;
  }
  if (flags.includes('--state')) {
    process.stdout.write(JSON.stringify(r.frame ? r.frame.state : null, null, 1)+'\n');
    continue;
  }
  if (flags.includes('--update')) {
    fs.mkdirSync(path.dirname(referenceFile), {recursive: true});
    fs.writeFileSync(referenceFile, r.markup+'\n');
    console.log(`${screen}: ${lines.length} ${text ? 'lines' : 'elements'}, reference written to ${path.relative(root, referenceFile)}`);
    continue;
  }
  if (!fs.existsSync(referenceFile)) {
    console.log(`${screen}: ${lines.length} ${text ? 'lines' : 'elements'}, no reference (${path.relative(root, referenceFile)}) — run with --update`);
    total++;
    continue;
  }
  const reference = fs.readFileSync(referenceFile, 'utf8').replace(/\n$/, '').split('\n');
  let differences = Math.abs(lines.length-reference.length);
  const n = Math.min(lines.length, reference.length);
  for (let i = 0; i < n; i++) {
    if (lines[i] !== reference[i]) {
      differences++;
      if (args.includes('-v')) {
        console.log(`  DIFF line ${i+1}:\n    expected ${reference[i]}\n    got      ${lines[i]}`);
      }
    }
  }
  console.log(`${screen}: ${lines.length} ${text ? 'lines' : 'elements'}, ${differences} differences`);
  total += differences;
}
process.exit(total);
