const { Playfield } = await import('./playfield.js?ver='+window.srcVersion);
const { Game } = await import('./game.js?ver='+window.srcVersion);
// begin code

/**
 * The game program of the worker. It is glued at run time
 * out of this module and the ones it will import (svision `ModuleWorker`,
 * the list in `MainModel.WORKER_SOURCES`), ticks at the original's frame
 * rate — one game frame = 4 NMI at 3 kHz/12, 4·12·4096/12 096 000 s =
 * 16.25 ms, 61.52 Hz (notes 1) — and composes the frame into the segments
 * the model draws. The same class runs under Node for the tools:
 * `new GameWorker(post)` with `handleMessage()` and `tick()`, no timers
 * (app/WORKER-PROTOCOL.md).
 *
 * The clock is an accumulator over `performance.now()`: as many ticks as
 * the wall clock owes, at most 8 after a sleep, then the last frame is
 * posted. The randomness is seeded from the first day: the `init` message
 * carries the seed (the tools pass a fixed one, the game the clock or
 * `?devSeed=N`), `random` is the byte source built from it (mulberry32,
 * METHODOLOGY) and the only source of randomness the game gets
 * (`options.random` of {@link Game}, which seeds the machine's own 16-bit
 * shift register `POLYH:POLYL` from it, notes 12). No `Math.random()`.
 *
 * Every tick runs one frame of {@link Game} (game.js: the original's main
 * loop, AS-M4/M5) with the actions as held, and {@link Playfield} composes
 * the frame from the state it returns and the ROM data of `init`
 * (`{shapes, font, tables}`); the frame's `sounds` are the game's events
 * of that frame (a shot, an explosion, a thump, the extra ship — the
 * sound board itself is AS-M7). Without the data (a tool without
 * data/*.json) the frame is the playfield of the original: the frame the
 * self-test draws around the visible area (`VEC:TEST1`, notes 2.1: LABS
 * 0,128, then 1023 right, 767 up, back).
 *
 * The end of a game (AS-M6) is played out by the game itself — GAME
 * OVER, the initials, the table — and reported as messages after the
 * frame: `gameOver` (the score, the name when known), `initials` (the
 * letters entered) and `gameOverDone` (the sequence is over, the worker
 * stops); the frame carries `screen` and `initials` for the model, and a
 * `letter` message types a letter into the initials (the remake's
 * shortcut beside rotate and hyperspace).
 */
export class GameWorker {

  /** one game frame: 4 NMI at 3 kHz/12 (notes 1), 16.25 ms */
  static get TICK_MS() { return 4*12*4096/12096000*1000; }

  /**
   * @param {Function} post - Sends a message to the model (`postMessage`).
   */
  constructor(post) {
    this.post = post;
    this.data = null;
    this.playfield = null;          // Playfield over the ROM data, null without it
    this.game = null;               // the Game, null without the data
    this.state = null;              // the state the playfield draws: the game's last frame
    this.attract = false;
    this.hiScore = 0;
    this.seed = 0;
    this.random = null;             // the byte source of the game's randomness
    this.tickCount = 0;
    this.actions = {left: false, right: false, thrust: false, fire: false, hyperspace: false};
    this.typed = null;              // a letter for the initials, handed to the next tick
    this.running = false;
    this.paused = false;
    this.timer = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.frame = null;
    this.headless = false;
  } // constructor

  /**
   * mulberry32 as a byte source: `seededSource(seed)()` is 0..255.
   * @param {number} seed
   * @returns {Function}
   */
  static seededSource(seed) {
    var a = seed >>> 0;
    return function() {
      a = (a+0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t+Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 8) & 0xFF;
    };
  } // seededSource

  /**
   * A message from the model (or a tool).
   * @param {Object} msg
   */
  handleMessage(msg) {
    switch (msg.id) {
      case 'init':
        // the ROM data, the seed, the mode; the game starts at once
        this.data = msg.data;
        this.playfield = msg.data && msg.data.shapes && msg.data.font && msg.data.tables ? new Playfield(msg.data) : null;
        this.seed = msg.seed >>> 0;
        this.headless = !!msg.headless;
        this.attract = !!msg.attract;
        this.hiScore = msg.hiScore || 0;
        this.random = GameWorker.seededSource(this.seed);
        this.game = this.playfield ? new Game(msg.data.tables, {
          random: this.random,
          attract: this.attract,
          backdrop: !!msg.backdrop,
          hiScore: this.hiScore,
          hiScores: msg.hiScores,
          playerName: msg.playerName || ''
        }) : null;
        if (this.game && typeof msg.setup === 'function') {
          msg.setup(this.game);                     // the tools: a state to start from
        }
        this.state = Playfield.emptyState();
        this.tickCount = 0;
        this.frame = null;
        this.typed = null;
        this.paused = false;
        if (!this.headless) {
          this.start();
        }
        break;
      case 'controls':
        if (msg.action in this.actions) {
          this.actions[msg.action] = !!msg.value;
        }
        break;
      case 'letter':
        // a keyboard letter (A-Z, 0-9) or 'Enter' for the initials screen
        this.typed = msg.key;
        break;
      case 'pause':
        this.paused = true;
        break;
      case 'continue':
        this.paused = false;
        break;
      case 'reset':
        this.stop();
        this.random = null;
        break;
      case 'tick':
        // headless: exactly one frame, posted
        if (this.random) {
          this.tick();
          this.postFrame();
        }
        break;
    }
  } // handleMessage

  /**
   * One game frame: the game's tick with the actions as held, the frame
   * composed by the playfield.
   */
  tick() {
    this.tickCount++;
    var segments;
    if (this.game) {
      var input = this.actions;
      if (this.typed !== null) {
        input = Object.assign({typed: this.typed}, this.actions);
        this.typed = null;
      }
      this.state = this.game.tick(input);
      segments = this.playfield.frame(this.state);
    } else {
      this.random();                                  // `MAC:RAND` once a frame (notes 12) — the stream advances as it will
      segments = GameWorker.playfieldFrame();
    }
    this.frame = {
      id: 'frame',
      tick: this.tickCount,
      score: this.game ? this.state.score : 0,
      lives: this.game ? this.state.lives : 0,
      gameOver: this.game ? this.game.done : false,
      screen: this.game ? this.state.screen : 'game',
      initials: this.game ? this.state.initials : false,
      sounds: this.game ? this.game.events.slice() : [],
      notify: this.game ? this.game.notify.slice() : [],
      segments: GameWorker.pack(segments),
      state: this.headless ? {tick: this.tickCount, scene: this.state} : undefined
    };
  } // tick

  /**
   * The self-test frame around the visible area (`VEC:TEST1`, notes 2.1):
   * from (0,128) 1023 right, 767 up, 1023 left, 767 down, in DVG units
   * (y up), at the intensity the ROM gives it (12).
   * @returns {Array} `[{x1, y1, x2, y2, intensity}]`
   */
  static playfieldFrame() {
    var i = 12;
    return [
      {x1: 0, y1: 128, x2: 1023, y2: 128, intensity: i},
      {x1: 1023, y1: 128, x2: 1023, y2: 895, intensity: i},
      {x1: 1023, y1: 895, x2: 0, y2: 895, intensity: i},
      {x1: 0, y1: 895, x2: 0, y2: 128, intensity: i}
    ];
  } // playfieldFrame

  /**
   * The segments as one Float32Array: x1, y1, x2, y2, intensity each.
   * @param {Array} segments
   * @returns {Float32Array}
   */
  static pack(segments) {
    var a = new Float32Array(segments.length*5);
    for (var i = 0, j = 0; i < segments.length; i++, j += 5) {
      var s = segments[i];
      a[j] = s.x1;
      a[j+1] = s.y1;
      a[j+2] = s.x2;
      a[j+3] = s.y2;
      a[j+4] = s.intensity;
    }
    return a;
  } // pack

  /**
   * The segments back from the array.
   * @param {Float32Array} a
   * @returns {Array}
   */
  static unpack(a) {
    var out = [];
    for (var j = 0; j < a.length; j += 5) {
      out.push({x1: a[j], y1: a[j+1], x2: a[j+2], y2: a[j+3], intensity: a[j+4]});
    }
    return out;
  } // unpack

  postFrame() {
    if (!this.frame) {
      return;
    }
    var f = this.frame;
    this.frame = null;
    this.post(f);
    (f.notify || []).forEach((m) => this.post(m));
    if (f.gameOver && !this.headless && this.running) {
      this.stop();
    }
  } // postFrame

  // -------------------------------------------------------------------- clock

  start() {
    this.running = true;
    this.lastTime = 0;
    this.accumulator = 0;
    this.tick();
    this.postFrame();
    this.loop();
  } // start

  stop() {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  } // stop

  /**
   * The fixed-step loop: as many frames as the wall clock owes, then sleep
   * until the next one is due. A pause stops the frames, not the clock.
   */
  loop() {
    if (!this.running) {
      return;
    }
    var now = performance.now();
    if (this.lastTime) {
      this.accumulator += now-this.lastTime;
    }
    this.lastTime = now;
    if (this.paused) {
      this.accumulator = 0;
    } else {
      var frames = 0;
      while (this.accumulator >= GameWorker.TICK_MS && frames < 8 && this.running) {
        this.tick();
        this.accumulator -= GameWorker.TICK_MS;
        frames++;
      }
      if (frames === 8) {
        this.accumulator = 0;   // the tab was asleep: do not catch up
      }
      this.postFrame();
    }
    var self = this;
    this.timer = setTimeout(function() { self.loop(); }, Math.max(1, GameWorker.TICK_MS-this.accumulator));
  } // loop

} // GameWorker

// In the worker the program wires itself up; under Node (the tools) and on
// the main thread (should anyone import this) it stays a class.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof self.document === 'undefined') {
  var gameWorker = new GameWorker(function(msg) { self.postMessage(msg); });
  self.onmessage = function(event) { gameWorker.handleMessage(event.data); };
}
