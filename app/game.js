// begin code

/**
 * The game of Asteroids — the 6502 program's main loop rewritten routine by
 * routine from the Atari sources (`ASTROD`, sources/asm/historicalsource-
 * asteroids/A35131.1A, cited as `MAC:LABEL`; the values verified in the rev
 * 4 listing, `dis $addr`; the rules in sources/docs/disasm_notes.md, cited
 * as "notes N"). One `tick()` is one game frame of the original (4 NMI,
 * 16.25 ms, notes 1.2): `INC FRAME`, then `CHKST` (the start-of-player
 * message, the state of the game), `MOVE` (the ship: rotation, thrust,
 * friction, the return after a death), `MOTION` (every object moved and
 * drawn in the order of the display list, the explosion counters), the
 * parameters (score, ships), `RAND` once, and `NEWAST` (a new wave) when
 * the rock delay and the count of rocks are both zero. The frame shows
 * the state after this tick's `MOTION`, as the vector RAM does.
 *
 * AS-M4: `RAND`, `INIT`, `NEWAST` + `NEWVEL`, `NEWSHP`, `NEARBY`,
 * `MOVE` + `MOVE1` + `MOVE2`, `MOTION` + `RSAUCR`, `CHKST` + `CHKST1` +
 * `CHKST2` (the start of a game, PLAYER 1, the thump tempo, the return of
 * the ship and the end of the game as far as a flag), `SIN`/`COS`.
 * AS-M5: `FIRE` + `FIRE1` + `FIRE3` (the ship's shots — and the
 * saucer's, the same routine), `HYPER`, `ENEMY` + `EFIRE` (the saucer:
 * when, which, where, its zigzag and its shots, the small one aiming
 * through `ATAN` + `DIVIDE` with rev 4's wrap-around), `COLIDE` (the
 * octagon test) + `DSTRCT` + `SPLIT` + `CPYPOS` + `SEARCH` + `POINTS`
 * (BCD, the extra ship), `SHPEXP` (the pieces of the exploding ship as
 * data for Playfield), and `SOUNDS` + `SOUND1` as far as the program's
 * own logic goes: what it would write to the sound latches each frame
 * (`outputs`) and the events of the frame (`events`: a shot, an
 * explosion, a thump, the extra ship) — the sound board itself is
 * AS-M7.
 * AS-M6: the end of a game as the machine plays it (notes 9.4, 14):
 * `CHKST1/90$` (NPLAYR = -1, the sounds off), `UPDATE` (the frame after:
 * the score against the ten entries of `HSCORE`, the entries below it
 * moved down with their `INITL`, the new one 'A', blank, blank;
 * FRAME+1 = $F0 for the timeout), `GETINT` (the initials screen: the
 * four messages, the three initials at scale $20 with the blanks
 * underlined, hyperspace held three frames takes a letter, rotate every
 * eighth frame changes it — blank, A..Z, blank —, the timeout of
 * FRAME+1; the objects neither move nor draw meanwhile), `SCORES` (the
 * table, only with NPLAYR = 0 and FRAME+1 bit 2 clear: HIGH SCORES, a
 * row per entry until a zero — the rank, a dot, the score, the
 * initials). The table is the server's hall of fame handed over in
 * `options.hiScores` as the machine's `HSCORE`/`INITL` (BCD, letter
 * codes; the first three letters of a name), a known `playerName`
 * fills the initials in without asking. The remake has no attract: the
 * sequence ends (`done`, the message `gameOverDone`) when the table's
 * interval is over, or when it would have started with an empty table.
 * The messages for the model (`gameOver`, `initials`, `gameOverDone`)
 * collect in `notify`.
 *
 * All arithmetic is 8- and 16-bit integer as the 6502 does it: the RAM of
 * page 2 (`OBJ`, `XINC`, `YINC`, `OBJXH`, `OBJYH`, `OBJXL`, `OBJYL`, 35
 * objects: rocks 0..26, the ship 27, the saucer 28, its shots 29..30, the
 * ship's 31..34, notes 1.4) is Uint8Arrays, the zero page scalars are kept
 * as bytes (`& 0xFF`). Positions are 13.3 fixed point (notes 3.1),
 * velocities 5.3 signed. The randomness is the machine's own 16-bit shift
 * register `POLYH:POLYL` (`MAC:RAND`, notes 12) seeded from the
 * substitutable byte source `options.random` — the only randomness the
 * game has; no `Math.random()` (METHODOLOGY).
 *
 * The tick returns the frame as {@link Playfield} draws it (the fields of
 * `Playfield.emptyState()`): the texts, the objects in the order `MOTION`
 * walks them (34 down to 0), the score, the ships, the high score.
 */
export class Game {

  /** NOBJ: the ship's slot; rocks are 0..NOBJ-1 (`ASTDEC`) */
  static get NOBJ() { return 27; }
  /** the saucer's slot */
  static get SAUCER() { return 28; }
  /** the number of object slots (NOBJ+8) */
  static get SLOTS() { return 35; }

  /**
   * @param {Object} tables - data/tables.json (rom2tables): `tables.sin` and the messages.
   * @param {Object} options - `random` (a function returning a byte 0..255), `attract` (boolean: NPLAYR = 0, no ship, nothing scores), `backdrop` (boolean: the attract as the menu's backdrop — the objects only, no PUSH START, no copyright, no high score table; implies `attract`), `hiScore` (the high score when there is no table), `hiScores` (the table: `[{score, name}]` from best down, the server's hall of fame), `playerName` (a known name fills the initials in), `lives` (ships per game, DIP SW3: 3 or 4, notes 1.5), `frame` (the initial FRAME counter, 0).
   */
  constructor(tables, options) {
    this.tables = tables;
    this.sinTable = tables.tables.sin.values;
    this.random = options.random;
    this.backdrop = !!options.backdrop;
    this.attract = !!options.attract || this.backdrop;
    this.playerName = String(options.playerName || '').trim();
    this.nhits = options.lives || 3;                 // NHITS: from DIP SW3 (`INIT`), the remake's factory 3

    // the high score table (notes 1.4, 9.4): ten entries of 2 BCD bytes
    // (LSB, MSB, x 10) and 10 x 3 letter codes; empty at power-on, here
    // the server's list. UPDFLG: the index into INITL of the entry a
    // player is filling in, -1 none; UPDINT: which of its three letters
    this.hscore = new Uint8Array(20);                // HSCORE $1D-30
    this.initl = new Uint8Array(30);                 // INITL $34-51
    this.updflg = [0xFF, 0xFF];                      // UPDFLG $32-33 (player 1, player 2)
    this.updint = 0;                                 // UPDINT $31
    this.lplayr = 0;                                 // LPLAYR $1A: the players of the last game
    this.loadTable(options.hiScores, options.hiScore);
    this.entry = -1;                                 // the INITL index of the entry of this game, -1 none (the remake's bookkeeping)
    this.ending = false;                             // the game is over, the sequence runs (the remake)
    this.tableShown = false;                         // the table has been up since the end
    this.done = false;                               // the sequence is over: the worker stops
    this.typed = null;                               // a letter typed on the keyboard for the initials (the remake's shortcut)
    this.notify = [];                                // messages for the model: gameOver, initials, gameOverDone

    // zero page (notes 1.4), rev 4 addresses in the comments
    this.frame = (options.frame || 0) & 0xFFFF;      // FRAME $5C-5D
    this.polyl = 0;                                  // POLYL $5F
    this.polyh = 0;                                  // POLYH $60
    this.angle = 0;                                  // ANGLE $61
    this.angle2 = 0;                                 // ANGLE+1 $62: the direction of the saucer's shot
    this.lastsw = 0;                                 // LASTSW $63: the fire button's shift register (FIRE)
    this.xincl = 0;                                  // XINCL $64: the ship's velocity, low byte
    this.yincl = 0;                                  // YINCL $65
    this.nplayr = 0;                                 // NPLAYR $1C: 0 attract, 1 a game, -1 the frame after the end
    this.hits = 0;                                   // HITS $57: the ships left, the current one included
    this.rentry = 0;                                 // RENTRY $59: 0 normal, 1 back from hyperspace, $80 destroy on return
    this.gdelay = 0;                                 // GDELAY $5A: PLAYER n frames
    this.score = 0;                                  // SCORE $52-53: 16-bit BCD, x 10 (POINTS)
    this.snd1 = 0; this.snd2 = 0; this.snd3 = 0;     // SND1-3 $66-68: the ship's shot, the saucer's shot, the tone (SOUND1, NMI)
    this.lexpsnd = 0;                                // LEXPSND $69: the explosion byte written to $3600 (SOUNDS/50$)
    this.lsnd1 = 0; this.lsnd2 = 0;                  // LSND1-2 $6A-6B: the last value of the shot sounds
    this.shpsnd = false;                             // SHPSND ($3C03): the thrust sound as MOVE1 writes it
    this.lthump = 4; this.thump1 = 0; this.thump2 = 4;   // LTHUMP, THUMP1, THUMP2 $6C-6E: the thump's last byte, frames on, frames off
    this.shipx = new Uint8Array(12);                 // SHIPX $7D-88: 6 x (lo, hi) of the exploding ship's pieces (SHPEXP)
    this.shipy = new Uint8Array(12);                 // SHIPY $89-94
    // what SOUNDS would write to the latches this frame (notes 10.1), for the sound board (AS-M7)
    this.outputs = {scrsel: 0, scrsnd: 0, scrfir: 0, shpfir: 0, shpsnd: 0, thump: 0, expsnd: 0};
    this.latched = {scrsel: 0, scrsnd: 0, shpsnd: 0};   // the LS259 as it stood after the last frame: the edges make events
    this.events = [];                                // the sound events of this frame (names)

    // page 2 (notes 1.4)
    this.obj = new Uint8Array(Game.SLOTS);           // OBJ $0200
    this.xinc = new Uint8Array(Game.SLOTS);          // XINC $0223
    this.yinc = new Uint8Array(Game.SLOTS);          // YINC $0246
    this.objxh = new Uint8Array(Game.SLOTS);         // OBJXH $0269
    this.objyh = new Uint8Array(Game.SLOTS);         // OBJYH $028C
    this.objxl = new Uint8Array(Game.SLOTS);         // OBJXL $02AF
    this.objyl = new Uint8Array(Game.SLOTS);         // OBJYL $02D2
    this.srocks = 0;                                 // SROCKS $02F5: rocks at the start of a wave
    this.nrocks = 0;                                 // NROCKS: rocks alive (explosions included)
    this.edelay = 0;                                 // EDELAY: the saucer's timer (ENEMY)
    this.sedlay = 0;                                 // SEDLAY: its start value
    this.rtimer = 0;                                 // RTIMER: "a rock was hit lately" (SPLIT, ENEMY)
    this.sdelay = 0;                                 // SDELAY: frames before the ship returns
    this.rdelay = 0;                                 // RDELAY $02FB: frames before a new wave
    this.thump3 = 0;                                 // THUMP3: the thump's pause (AS-M7)
    this.difcty = 0;                                 // DIFCTY $02FD: the rock count that holds the saucers back

    this.input = {left: false, right: false, thrust: false, fire: false, hyperspace: false};
    this.state = null;

    // the shift register from the byte source: a zero state is what a
    // reset leaves, RAND makes 1 of it (notes 12)
    this.polyl = this.random() & 0xFF;
    this.polyh = this.random() & 0xFF;

    this.start();
  } // constructor

  // ------------------------------------------------------------------ start

  /**
   * The start of a game as `CHKST/20$` and `START` do it (notes 9.2):
   * `INIT`, `NEWSHP`, the delays, PLAYER 1 for 128 frames, then
   * `START1: JSR NEWAST` — which, RDELAY being $7F, only clears the rock
   * slots; the first wave comes when RDELAY has run down, together with
   * the end of the message. The attract (NPLAYR = 0, the power-on path
   * `START`): `INIT`, `NEWAST` at once, no ship.
   */
  start() {
    if (this.attract) {
      this.nplayr = 0;
      this.init();
      this.newast();
      return;
    }
    // CHKST/20$
    this.nplayr = 1;
    this.newshp();
    this.sdelay = 1;
    this.sedlay = 0x92;                              // "ENOUGH FOR 3 LARGE SAUCERS"
    this.edelay = 0x92;
    this.rdelay = 0x7F;
    this.difcty = 5;
    this.gdelay = 0x80;
    this.lthump = 4;
    this.thump2 = 4;
    this.thump3 = 0x30;
    // START: JSR INIT (SROCKS, NHITS, the score, the ship/saucer/shot slots, NROCKS)
    this.init();
    this.hits = this.nhits;                          // CHKST/20$ `LDA NHITS / STA HITS` (INIT does not touch HITS)
    // START1: JSR NEWAST
    this.newast();
  } // start

  /**
   * `MAC:INIT` (dis $6ed8): SROCKS = 2 (the start loop adds 2), NHITS from
   * the DIP, the score and the slots of the ship, the saucer and the shots
   * cleared, NROCKS = 0.
   */
  init() {
    this.srocks = 2;
    for (var x = 4; x >= 0; x--) {
      this.obj[Game.NOBJ+x] = 0;
      this.obj[Game.NOBJ+4+x] = 0;
    }
    this.score = 0;
    this.nrocks = 0;
  } // init

  // ------------------------------------------------------------------- tick

  /**
   * One game frame (`MAC:START2`, notes 1.2).
   * @param {Object} input - `{left, right, thrust, fire, hyperspace}` as held during this frame (the switches the frame reads).
   * @returns {Object} The frame's state for Playfield.
   */
  tick(input) {
    this.input = input || this.input;
    if (this.input.typed) {
      this.typed = this.input.typed;                 // one keyboard letter (or Enter) for the initials
    }
    var state = {
      texts: [],
      objects: [],
      score: 0,
      lives: 0,
      hiScore: this.hiScoreValue(),
      players: this.nplayr == 0 ? 0 : 1,
      score2: 0,
      lives2: 0,
      copyright: !this.backdrop,
      objectsOnly: this.backdrop,                     // the menu's backdrop: Playfield draws the objects alone
      screen: 'game',
      initials: false,
      table: false
    };
    this.state = state;
    this.events = [];
    this.notify = [];

    this.frame = (this.frame+1) & 0xFFFF;            // INC FRAME
    this.chkst();                                    // JSR CHKST (a new game starts through the constructor)
    this.update();                                   // JSR UPDATE: the frame after the end
    var busy = this.getint();                        // JSR GETINT / BPL 20$: the initials screen
    if (!busy) {
      busy = this.scores();                          // JSR SCORES / BCS 20$: the high score table
    }
    if (!busy) {
      if (this.gdelay == 0) {
        this.fire();                                 // JSR FIRE
        this.hyper();                                // JSR HYPER
        this.move();                                 // JSR MOVE
        this.enemy();                                // JSR ENEMY
      }
      this.motion();                                 // 15$: JSR MOTION
      this.colide();                                 // JSR COLIDE
    }
    this.params();                                   // 20$: JSR PARAMS
    this.sounds();                                   // JSR SOUNDS
    this.rand();                                     // JSR RAND: keep the numbers coming
    if (this.rdelay != 0) {
      this.rdelay = (this.rdelay-1) & 0xFF;
    }
    if ((this.rdelay | this.nrocks) == 0) {
      this.newast();                                 // START1
    }
    return state;
  } // tick

  // ------------------------------------------------------------------ CHKST

  /**
   * `MAC:CHKST` (dis ChkGameRunning $687e): in the attract the price of a
   * game (none: free play), the copyright (Playfield draws it always) and
   * PUSH START blinking with the credit (free play keeps two); in a game
   * the PLAYER n message while GDELAY runs, else `CHKST1`.
   */
  chkst() {
    if (this.nplayr == 0) {
      // 10$: nothing while the initials are entered; then free play →
      // $$CRDT = 2, "PUSH START" when FRAME & $20 = 0
      if (!((this.updflg[0] & this.updflg[1]) & 0x80)) {
        return;
      }
      if ((this.frame & 0x20) == 0 && !this.backdrop) {
        this.state.texts.push(this.message(6));
      }
      return;
    }
    if (this.gdelay != 0) {
      this.gdelay = (this.gdelay-1) & 0xFF;          // 60$
      this.chkst2();
      return;
    }
    this.chkst1();
  } // chkst

  /**
   * `MAC:CHKST1`: the thump speeds up every 64 frames down to 8 (notes
   * 10.1); GAME OVER once the player has no ship left and no shot flies;
   * a ship gone with SDELAY = $80 (its explosion over, notes 4.5) starts
   * the return delay of 16 frames, or ends the game when no ship is left.
   */
  chkst1() {
    if ((this.frame & 0x3F) == 0 && this.thump3 != 8) {
      this.thump3 = (this.thump3-1) & 0xFF;
    }
    if (this.hits == 0 && (this.obj[31] | this.obj[32] | this.obj[33] | this.obj[34]) == 0) {
      this.state.texts.push(this.message(7));        // GAME OVER
    }
    if (this.obj[Game.NOBJ] == 0 && this.sdelay == 0x80) {
      this.sdelay = 0x10;
      if (this.hits == 0) {
        // 90$: LPLAYR = NPLAYR, NPLAYR = -1 (UPDATE next frame), `INIT1`
        // turns the sounds off, the lamps go off
        this.lplayr = this.nplayr;
        this.nplayr = 0xFF;
        this.events.push('soundsOff');
        this.latched = {scrsel: 0, scrsnd: 0, shpsnd: 0};   // INIT1 clears the latches
        return;
      }
      this.rsaucr();
    }
  } // chkst1

  /**
   * `MAC:CHKST2`: "PLAYER " and the player's number (VGHEX of PLAYR+1).
   */
  chkst2() {
    this.state.texts.push(this.message(1, '1'));
  } // chkst2

  /**
   * A message of the ROM at its place (notes 9.3), as Playfield.message.
   */
  message(index, suffix) {
    var m = this.tables.messages[index];
    return {text: m.text+(suffix || ''), x: m.x, y: m.y, scale: 1};
  } // message

  // ------------------------------------------------------------------- MOVE

  /**
   * `MAC:MOVE` (dis ChkExitHprspc $703f, notes 4.1, 4.2, 4.5): nothing in
   * the attract or while the ship explodes; while SDELAY runs, count it
   * down and at zero bring the ship back (destroyed after a bad
   * hyperspace, at once after a good one, after `NEARBY` clears the
   * middle otherwise — and not while the saucer is on screen); else
   * rotate by the switches and, on even frames, `MOVE1`.
   */
  move() {
    var N = Game.NOBJ;
    if (this.nplayr == 0) {
      return;                                        // 90$: attract
    }
    if (this.obj[N] & 0x80) {
      return;                                        // exploding
    }
    if (this.sdelay != 0) {
      this.sdelay = (this.sdelay-1) & 0xFF;
      if (this.sdelay != 0) {
        return;
      }
      if (this.rentry & 0x80) {
        // 93$: blow up on return from a bad hyperspace (notes 4.4)
        this.obj[N] = 0xA0;
        this.lexpsnd = 0x3E;
        this.events.push('explosion3E');
        this.hits = (this.hits-1) & 0xFF;
        this.sdelay = 0x81;
        this.rentry = 0;                             // 97$
        return;
      }
      if (this.rentry != 0) {
        this.obj[N] = 1;                             // 92$: back from hyperspace, no check
        this.rentry = 0;
        return;
      }
      if (this.nearby()) {
        return;                                      // something close: SDELAY was bumped, try next frame
      }
      if (this.obj[Game.SAUCER] != 0) {
        this.sdelay = 2;                             // wait for the saucer to leave
        return;
      }
      this.obj[N] = 1;                               // 92$
      this.rentry = 0;                               // 97$
      return;
    }
    // 5$: rotation, left first
    if (this.input.left) {
      this.angle = (this.angle+3) & 0xFF;
    } else if (this.input.right) {
      this.angle = (this.angle-3) & 0xFF;
    }
    // 20$: LSR FRAME / BCS → thrust and friction on even frames only
    if (this.frame & 1) {
      return;
    }
    this.move1();
  } // move

  /**
   * `MAC:MOVE1`: thrust adds 2 cos / 2 sin of the angle to the 16-bit
   * velocity `XINC:XINCL`, clamped by `MOVE2` to -63..+63 in the high
   * byte; without thrust the friction: for each axis with a non-zero
   * velocity, add `~(2 XINC)` sign-extended, with the carry set when the
   * velocity was negative ("1 + X/128 FOR FRICTION").
   */
  move1() {
    var N = Game.NOBJ;
    if (this.input.thrust) {
      this.shpsnd = true;                            // STA A,SHPSND
      var vx = this.addThrust(this.cos(this.angle), this.xinc[N], this.xincl);
      this.xinc[N] = vx.hi;
      this.xincl = vx.lo;
      var vy = this.addThrust(this.sin(this.angle), this.yinc[N], this.yincl);
      this.yinc[N] = vy.hi;
      this.yincl = vy.lo;
      return;
    }
    // 80$
    this.shpsnd = false;
    var fx = this.friction(this.xinc[N], this.xincl);
    this.xinc[N] = fx.hi;
    this.xincl = fx.lo;
    var fy = this.friction(this.yinc[N], this.yincl);
    this.yinc[N] = fy.hi;
    this.yincl = fy.lo;
  } // move1

  /**
   * One axis of the thrust (`MOVE1/20$-50$`): Y = sign of the trig value,
   * `ASL` it (bit 7 to the carry, dropped by the `CLC`), add to the low
   * byte, Y + carry to the high byte, then `MOVE2`.
   * @param {number} trig - cos or sin, -127..127.
   * @param {number} hi - XINC (a byte).
   * @param {number} lo - XINCL (a byte).
   * @returns {Object} `{hi, lo}`
   */
  addThrust(trig, hi, lo) {
    var y = trig < 0 ? 0xFF : 0;
    var a = (trig << 1) & 0xFF;                      // ASL
    var sum = a+lo;                                  // CLC / ADC XINCL
    var x = sum & 0xFF;
    var carry = sum >> 8;
    var h = (y+hi+carry) & 0xFF;                     // TYA / ADC XINC
    return Game.move2(h, x);
  } // addThrust

  /**
   * `MAC:MOVE2`: the range check of a velocity — a negative high byte
   * below -63 becomes $C001, a positive one of $40 and over $3FFF.
   * @param {number} a - The high byte.
   * @param {number} x - The low byte.
   * @returns {Object} `{hi, lo}`
   */
  static move2(a, x) {
    if (a & 0x80) {
      return a >= 0xC1 ? {hi: a, lo: x} : {hi: 0xC0, lo: 0x01};   // CMP I,-3F / BCS
    }
    return a < 0x40 ? {hi: a, lo: x} : {hi: 0x3F, lo: 0xFF};      // CMP I,40 / BCC
  } // move2

  /**
   * One axis of the friction (`MOVE1/80$-89$`), byte for byte: skipped
   * at zero; A = ~(XINC << 1), X = $FF and carry clear when that is
   * negative (the velocity was positive), else X = 0 and carry set; then
   * the 16-bit add.
   * @param {number} hi - XINC.
   * @param {number} lo - XINCL.
   * @returns {Object} `{hi, lo}`
   */
  friction(hi, lo) {
    if ((hi | lo) == 0) {
      return {hi: hi, lo: lo};
    }
    var a = ((hi << 1) & 0xFF) ^ 0xFF;               // ASL / EOR I,0FF
    var x = 0xFF, carry = 0;                         // LDX I,0FF / CLC
    if (!(a & 0x80)) {
      x = 0;                                         // INX
      carry = 1;                                     // SEC
    }
    var sum = a+lo+carry;                            // ADC XINCL
    var l = sum & 0xFF;
    carry = sum >> 8;
    var h = (x+hi+carry) & 0xFF;                     // TXA / ADC XINC
    return {hi: h, lo: l};
  } // friction

  /**
   * `MAC:NEARBY` (dis IsReturnSafe $7139): true when a live object 0..28
   * (rocks and the saucer, exploding ones too) is within 4 high-byte
   * units (128 world units) of the ship's slot on both axes — then
   * SDELAY is bumped so the next frame tries again.
   * @returns {boolean}
   */
  nearby() {
    var N = Game.NOBJ;
    for (var x = Game.SAUCER; x >= 0; x--) {
      if (this.obj[x] == 0) {
        continue;
      }
      var dx = (this.objxh[x]-this.objxh[N]) & 0xFF;
      if (dx >= 4 && dx < 0xFC) {
        continue;                                    // too far away
      }
      var dy = (this.objyh[x]-this.objyh[N]) & 0xFF;
      if (dy >= 4 && dy < 0xFC) {
        continue;
      }
      this.sdelay = (this.sdelay+1) & 0xFF;          // 50$
      return true;
    }
    return false;
  } // nearby

  /**
   * `MAC:NEWSHP` (dis CenterShip $71e8): the ship in the middle with no
   * velocity — rev 4 puts the low bytes at $60: (524, 396) (notes 3.1).
   */
  newshp() {
    var N = Game.NOBJ;
    this.objxl[N] = 0x60;
    this.objyl[N] = 0x60;
    this.xinc[N] = 0;
    this.yinc[N] = 0;
    this.objxh[N] = 0x10;
    this.objyh[N] = 0x0C;
  } // newshp

  // ----------------------------------------------------------------- MOTION

  /**
   * `MAC:MOTION` (dis UpdateObjects $6f57, notes 3.2, 8): every active
   * object from 34 down to 0. An exploding one (OBJ ≥ $80) advances its
   * counter by 1 + (256 - OBJ) / 16 (the ship: by 1 every other frame)
   * and, when it wraps to positive, frees its slot (a rock: NROCKS--,
   * the last one arms RDELAY; the saucer: EDELAY = SEDLAY; the ship:
   * NEWSHP); otherwise it is drawn at scale (OBJ & $F0) + $10. A moving
   * one adds its velocity to the 16-bit position with the wrap of notes
   * 3.1 (the saucer leaving by the side is reset instead) and is drawn
   * (`PICTUR`).
   */
  motion() {
    var N = Game.NOBJ;
    for (var x = Game.SLOTS-1; x >= 0; x--) {
      var o = this.obj[x];
      if (o == 0) {
        continue;
      }
      if (o & 0x80) {
        // 12$: an explosion
        var a = ((o ^ 0xFF)+1) & 0xFF;               // JSR COMP: time remaining
        a >>= 4;
        var sum;
        if (x == N) {
          sum = o+(this.frame & 1);                  // LDA FRAME / AND 1 / LSR: A = 0, carry = bit 0
        } else {
          sum = o+a+1;                               // SEC / ADC X,OBJ
        }
        var n = sum & 0xFF;
        if (!(n & 0x80)) {
          // done
          if (x == N) {
            this.newshp();                           // 18$
          } else if (x > N) {
            this.edelay = this.sedlay;               // 40$: the saucer
          } else {
            this.nrocks = (this.nrocks-1) & 0xFF;
            if (this.nrocks == 0) {
              this.rdelay = 0x7F;                    // delay before the next wave
            }
          }
          this.obj[x] = 0;                           // 17$
          continue;
        }
        // 11$: still exploding
        this.obj[x] = n;
        if (x == N) {
          // the ship: "NO SCALING FOR SHIP EXPLOSION", the pieces by SHPEXP
          this.state.objects.push({kind: 'shipExplosion', x: this.worldX(x), y: this.worldY(x), pieces: this.shpexp()});
          continue;
        }
        this.state.objects.push({kind: 'explosion', x: this.worldX(x), y: this.worldY(x), status: n});
        continue;
      }
      // 14$: move X
      var y = this.xinc[x] & 0x80 ? 0xFF : 0;
      var sx = this.xinc[x]+this.objxl[x];
      this.objxl[x] = sx;
      var ax = (y+this.objxh[x]+(sx >> 8)) & 0xFF;
      if (ax >= 0x20) {
        ax &= 0x1F;
        if (x == Game.SAUCER) {
          this.rsaucr();                             // the saucer leaves by the side
          continue;
        }
      }
      this.objxh[x] = ax;
      // 19$: move Y
      y = this.yinc[x] & 0x80 ? 0xFF : 0;
      var sy = this.yinc[x]+this.objyl[x];
      this.objyl[x] = sy;
      var ay = (y+this.objyh[x]+(sy >> 8)) & 0xFF;
      if (ay >= 0x18) {
        ay = ay == 0x18 ? 0 : 0x17;                  // 24$ / 25$
      }
      this.objyh[x] = ay;
      this.pictur(x);
    }
  } // motion

  /**
   * `MAC:RSAUCR`: the saucer gone, its speed zeroed (NEWAST inherits it),
   * EDELAY = SEDLAY.
   */
  rsaucr() {
    var S = Game.SAUCER;
    this.edelay = this.sedlay;
    this.obj[S] = 0;
    this.xinc[S] = 0;
    this.yinc[S] = 0;
  } // rsaucr

  /**
   * `MAC:PICTUR` (dis DrawObject $72fe, notes 3.3) as a descriptor for
   * Playfield, which sets the scale of the size and draws the shape's
   * code: a rock (size OBJ & 7, shape bits 3-4), the ship (`SHPPIC`: the
   * angle, the flame when THRUST is held and FRAME & 4 — notes 4.1), the
   * saucer, or a shot — a dot whose life in OBJ is counted down every
   * fourth frame (dis $738d).
   * @param {number} x - The slot.
   */
  pictur(x) {
    var o = this.obj[x];
    var wx = this.worldX(x), wy = this.worldY(x);
    if (x < Game.NOBJ) {
      this.state.objects.push({kind: 'rock', size: o & 7, shape: (o >> 3) & 3, x: wx, y: wy});
    } else if (x == Game.NOBJ) {
      this.state.objects.push({kind: 'ship', x: wx, y: wy, angle: this.angle, flame: !!this.input.thrust && (this.frame & 4) != 0});
    } else if (x == Game.SAUCER) {
      this.state.objects.push({kind: 'saucer', size: o & 3, x: wx, y: wy});
    } else {
      this.state.objects.push({kind: 'shot', x: wx, y: wy});
      if ((this.frame & 3) == 0) {
        this.obj[x] = o-1;                           // 70$: DEC X,OBJ
      }
    }
  } // pictur

  /** the integer world X of a slot (`OBJXH:OBJXL` / 8) */
  worldX(x) {
    return ((this.objxh[x] << 8) | this.objxl[x]) >> 3;
  } // worldX

  /** the integer world Y of a slot */
  worldY(x) {
    return ((this.objyh[x] << 8) | this.objyl[x]) >> 3;
  } // worldY

  // ----------------------------------------------------------------- PARAMS

  /**
   * `MAC:PARAMS` (dis UpdateScreenText $724f): the score, the ships, the
   * high score — Playfield lays them out; here only the values.
   */
  params() {
    this.state.score = this.scoreValue();
    this.state.lives = this.nplayr == 0 ? 0 : this.hits;
  } // params

  /**
   * The score as displayed: the 16-bit BCD x 10 (notes 9.1).
   * @returns {number}
   */
  scoreValue() {
    return Game.bcdValue(this.score);
  } // scoreValue

  /** the high score as displayed: HSCORE[0] (`PARAMS`) */
  hiScoreValue() {
    return Game.bcdValue((this.hscore[1] << 8) | this.hscore[0]);
  } // hiScoreValue

  /**
   * A 16-bit BCD score word as the number displayed (x 10).
   * @param {number} s
   * @returns {number}
   */
  static bcdValue(s) {
    s &= 0xFFFF;
    var v = 0;
    for (var d = 12; d >= 0; d -= 4) {
      v = v*10+((s >> d) & 0xF);
    }
    return v*10;
  } // bcdValue

  /**
   * A displayed score as the 16-bit BCD word (x 10): four digits, 99 990
   * at most.
   * @param {number} score
   * @returns {number}
   */
  static bcdWord(score) {
    var v = Math.min(9999, Math.max(0, Math.floor((score || 0)/10)));
    var w = 0;
    for (var d = 0; d < 16; d += 4) {
      w |= (v%10) << d;
      v = Math.floor(v/10);
    }
    return w;
  } // bcdWord

  // ------------------------------------------------------- UPDATE, GETINT, SCORES

  /** the letter codes of INITL (notes 1.4): 0 a blank, 1..10 '0'..'9', 11..36 'A'..'Z' */
  static get LETTERS() { return ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; }

  /**
   * The letter code of a character; anything the machine lacks is a blank.
   * @param {string} ch
   * @returns {number}
   */
  static codeOf(ch) {
    var i = Game.LETTERS.indexOf(String(ch || ' ').toUpperCase().charAt(0));
    return i < 0 ? 0 : i;
  } // codeOf

  /**
   * Three letter codes of INITL as text (a blank for 0).
   * @param {Uint8Array|Array} initl
   * @param {number} at - The index of the first.
   * @returns {string}
   */
  static textOf(initl, at) {
    var s = '';
    for (var k = 0; k < 3; k++) {
      s += Game.LETTERS.charAt(initl[at+k]) || ' ';
    }
    return s;
  } // textOf

  /**
   * The table of the machine from the server's hall of fame (`HSCORE`,
   * `INITL`): the entries from best down, the score as BCD, the first
   * three letters of the name as the initials; without entries the high
   * score alone with blank initials; the rest zero (the power-on table,
   * notes 9.4). The entries are sorted here — the machine's table is
   * sorted by construction.
   * @param {Array} entries - `[{score, name}]`
   * @param {number} hiScore
   */
  loadTable(entries, hiScore) {
    var list = (entries || []).map((e) => ({score: Math.max(0, Math.floor(e.score || 0)), name: String(e.name || '')}));
    if (!list.length && hiScore > 0) {
      list.push({score: Math.floor(hiScore), name: ''});
    }
    list.sort((a, b) => b.score-a.score);
    this.hscore.fill(0);
    this.initl.fill(0);
    list.slice(0, 10).forEach((e, i) => {
      var w = Game.bcdWord(e.score);
      this.hscore[i*2] = w & 0xFF;
      this.hscore[i*2+1] = w >> 8;
      for (var k = 0; k < 3; k++) {
        this.initl[i*3+k] = Game.codeOf(e.name.charAt(k));
      }
    });
  } // loadTable

  /**
   * `MAC:UPDATE` (dis CheckHighScore $765c, notes 9.4): the frame after
   * the end of a game (NPLAYR = -1): FRAME+1 = $FF (the table comes up
   * when it wraps), both UPDFLG cleared; for player 2 then player 1 the
   * first entry of HSCORE below the score (a 16-bit compare, so a zero
   * never goes in) is where it goes: the entries from there down move
   * one place with their initials (the tenth drops off), the new
   * initials are 'A', blank, blank, UPDFLG[player] = their index, FRAME+1
   * = $F0 (the timeout of the initials, about a minute); then NPLAYR = 0,
   * UPDINT = 0. Player 2 never plays in the remake (its score is 0). The
   * remake tells the model (`gameOver`: the score, the name when known,
   * whether it qualified) and a known player name fills the initials in
   * at once (`initialsDone`).
   */
  update() {
    if (!(this.nplayr & 0x80)) {
      return;                                        // 90$
    }
    this.frame = (this.frame & 0xFF) | 0xFF00;       // STA FRAME+1 (A = -1)
    this.updflg[0] = 0xFF;
    this.updflg[1] = 0xFF;
    this.entry = -1;
    this.ending = true;
    this.tableShown = false;
    for (var x = 2; x >= 0; x -= 2) {
      // 18$: X = 2 player 2, X = 0 player 1
      var score = x == 0 ? (this.score & 0xFFFF) : 0;
      for (var y = 0; y < 20; y += 2) {
        var entry = (this.hscore[y+1] << 8) | this.hscore[y];
        if (entry < score) {
          this.insertScore(x >> 1, y, score);        // 30$: BCC → new high score
          break;
        }
      }
    }
    // 28$: both players in the table — never here (UPDFLG+1 stays -1)
    this.nplayr = 0;                                 // 29$: done with the update
    this.updint = 0;

    var qualified = !(this.updflg[0] & 0x80);
    var score = this.scoreValue();
    this.notify.push({id: 'gameOver', score: score, name: this.playerName ? this.playerName : (qualified ? false : ''), qualified: qualified});
    if (qualified && this.playerName) {
      // the remake: the name is known, no need to ask — as if the third
      // letter had just been taken (GETINT: UPDFLG = -1, FRAME+1 = 1)
      for (var k = 0; k < 3; k++) {
        this.initl[this.entry+k] = Game.codeOf(this.playerName.charAt(k));
      }
      this.updflg[0] = 0xFF;
      this.frame = (this.frame & 0xFF) | 0x0100;
      this.initialsDone(false);
    }
  } // update

  /**
   * `UPDATE/30$-45$`: the entry at HSCORE index `y` (0, 2, .. 18) for a
   * player: the initials index 3y/2 into UPDFLG, the copy down from the
   * ninth entry (X = 27, Y = 18) to that index, 'A', blank, blank, the
   * timeout, the score in.
   * @param {number} player - 0 or 1.
   * @param {number} y - The HSCORE index.
   * @param {number} score - The 16-bit BCD score.
   */
  insertScore(player, y, score) {
    var t = (y >> 1)+y;                              // TYA / LSR / ADC TEMP2+1
    this.updflg[player] = t;
    this.entry = t;
    var x = 27, yy = 18;
    while (x != t) {
      // 40$: copy initials and scores down
      this.initl[x] = this.initl[x-3];
      this.initl[x+1] = this.initl[x-2];
      this.initl[x+2] = this.initl[x-1];
      this.hscore[yy] = this.hscore[yy-2];
      this.hscore[yy+1] = this.hscore[yy-1];
      yy -= 2;
      x -= 3;
      if (x == 0) {
        break;                                       // BNE 40$
      }
    }
    // 45$
    this.initl[x] = 11;                              // start letters at A
    this.initl[x+1] = 0;
    this.initl[x+2] = 0;
    this.frame = (this.frame & 0xFF) | 0xF000;       // FRAME+1 = $F0: about a minute
    this.hscore[y+1] = score >> 8;
    this.hscore[y] = score & 0xFF;
  } // insertScore

  /**
   * `MAC:GETINT` (dis ChkHighScrMsg $6d90, notes 9.4): nothing unless a
   * player is filling in (UPDFLG & UPDFLG+1 non-negative) — then the
   * frame is the initials screen and the objects stay put (the caller's
   * `BPL 20$`): the messages 2..5 (PLAYER n only after a 2-player game),
   * the three initials at scale $20 from (400, 228), a blank underlined
   * (`INITAL`); the hyperspace switch through LASTSW (`ROL`): the
   * pattern %00111 — on for three frames after two off — takes the
   * letter: the next one starts as 'A' with FRAME+1 = $F4 (rev 4), the
   * third ends it (UPDFLG = -1, UPDINT = 0, FRAME+1 = 1: the table
   * next); FRAME+1 run down to 0 is the timeout; every eighth frame
   * rotate left steps the letter up, right down, through blank, A..Z
   * and round. The remake adds a typed letter (sets it) and Enter
   * (takes it).
   * @returns {boolean} True when the screen was drawn (the objects wait).
   */
  getint() {
    if ((this.updflg[0] & this.updflg[1]) & 0x80) {
      return false;                                  // RTS with N set
    }
    var st = this.state;
    st.screen = 'initials';
    // 10$: LPLAYR = 1 in the remake — no "PLAYER n" (25$)
    for (var m = 2; m <= 5; m++) {
      st.texts.push(this.message(m));
    }
    var playr = 0;
    var y = this.updflg[playr];                      // TEMP2: the index of the first initial
    var cur = (y+this.updint) & 0xFF;                // TEMP2+1: the one being worked on
    st.initials = {letters: Game.textOf(this.initl, y), index: this.updint};

    // the remake: a letter from the keyboard sets the initial, Enter takes it
    var confirm = false;
    if (this.typed !== null) {
      if (this.typed == 'Enter') {
        confirm = true;
      } else {
        var code = Game.codeOf(this.typed);
        if (code) {
          this.initl[cur] = code;
        }
      }
      this.typed = null;
    }
    // 50$: switch debounce
    this.lastsw = ((this.lastsw << 1) | (this.input.hyperspace ? 1 : 0)) & 0xFF;
    if ((this.lastsw & 0x1F) == 0x07 || confirm) {
      this.updint = (this.updint+1) & 0xFF;          // advance to the next letter
      if (this.updint >= 3) {
        this.updflg[playr] = 0xFF;                   // clear updating flag
        this.updint = 0;                             // start next player
        this.frame = (this.frame & 0xFF) | 0x0100;   // bring up the high score table next
        this.initialsDone(true);
        return true;
      }
      // 55$
      cur = (cur+1) & 0xFF;
      this.frame = (this.frame & 0xFF) | 0xF400;     // reset timeout (rev 4: $F4)
      this.initl[cur] = 11;                          // set initial to A
    }
    // 60$
    if ((this.frame >> 8) == 0) {
      this.updflg[0] = 0xFF;                         // timeout: stop initials
      this.updflg[1] = 0xFF;
      this.initialsDone(true);
      return true;                                   // 90$
    }
    // 65$: every 8th frame
    if ((this.frame & 7) != 0) {
      return true;
    }
    var d;
    if (this.input.left) {
      d = 1;                                         // add 1 to letter number
    } else if (this.input.right) {
      d = 0xFF;
    } else {
      return true;
    }
    var a = (d+this.initl[cur]) & 0xFF;              // 75$: change initial
    if (a & 0x80) {
      a = 36;                                        // 78$: before a blank must be Z
    } else if (a >= 11) {
      if (a >= 37) {
        a = 0;                                       // 80$: past Z comes a blank
      }
    } else if (a == 1) {
      a = 11;                                        // 77$: after blank comes A
    } else {
      a = 0;                                         // before A comes a blank
    }
    this.initl[cur] = a;                             // 85$
    return true;
  } // getint

  /**
   * The initials of this game's entry are final (entered, timed out, or
   * the player's name): the model gets them (`initials`) when they were
   * asked for.
   * @param {boolean} entered - Asked for on the screen (else the name was known).
   */
  initialsDone(entered) {
    if (entered && this.entry >= 0) {
      this.notify.push({id: 'initials', name: Game.textOf(this.initl, this.entry).trim()});
    }
    this.entry = -1;
  } // initialsDone

  /**
   * `MAC:SCORES` (dis ChkHighScrList $73c4, notes 9.4): the table, only
   * with no game on (NPLAYR = 0), while FRAME+1 bit 2 is clear (1024
   * frames on, 1024 off — the attract's alternation) and the first entry
   * is not zero: HIGH SCORES, then a row per entry until a zero — at
   * (380, 668 - 32 row) at scale $10 the rank (BCD, two digits, the
   * leading zero blank), a dot (`VGDOT` $40: scale 4, intensity 4), a
   * blank, the score (four digits and the trailing zero), a blank, the
   * three initials. The caller's `BCS 20$`: the objects wait. The
   * remake ends the sequence when the table's interval is over, or, with
   * an empty table, when it would have begun.
   * @returns {boolean} True while the table is up.
   */
  scores() {
    if (this.nplayr != 0 || this.backdrop) {
      return false;                                  // 90$: CLC (the backdrop never shows the table)
    }
    if ((this.frame >> 8) & 4) {
      if (this.tableShown) {
        this.finish();                               // the remake: the table has had its time
      }
      return false;                                  // not time to display table
    }
    if ((this.hscore[0] | this.hscore[1]) == 0) {
      if (this.ending) {
        this.finish();                               // the remake: no table to show
      }
      return false;                                  // if no high scores
    }
    var st = this.state;
    st.screen = 'table';
    st.texts.push(this.message(0));                  // HIGH SCORES
    var table = [];
    for (var x = 0, k = 0; x < 20; x += 2, k += 3) {
      if ((this.hscore[x] | this.hscore[x+1]) == 0) {
        break;                                       // a zero ends list
      }
      table.push({score: Game.bcdValue((this.hscore[x+1] << 8) | this.hscore[x]), initials: Game.textOf(this.initl, k)});
    }
    st.table = table;
    this.tableShown = true;
    return true;                                     // 80$: SEC
  } // scores

  /** the remake: the end of the sequence after a game — the worker stops */
  finish() {
    if (!this.done) {
      this.done = true;
      this.ending = false;
      this.notify.push({id: 'gameOverDone'});
    }
  } // finish

  // ----------------------------------------------------------------- NEWAST

  /**
   * `MAC:NEWAST` (dis InitWaveVars $7168, notes 5.1): while RDELAY runs
   * only the rock slots are cleared; not at all while the saucer is on
   * screen. Else DIFCTY++ (`CMP 11 / DEC` — it tops out at 10), SROCKS +=
   * 2 up to 11, and that many new large rocks of random shape, `NEWVEL`
   * from the saucer's (zero) velocity, at a random place on the bottom
   * edge (RAND bit 0 = 0) or the left edge; EDELAY = $7F, THUMP3 = $30;
   * the remaining rock slots cleared.
   */
  newast() {
    var x = Game.NOBJ-1;
    var S = Game.SAUCER;
    if (this.rdelay == 0) {
      if (this.obj[S] != 0) {
        return;                                      // 90$: not while the saucer is there
      }
      this.xinc[S] = 0;
      this.yinc[S] = 0;
      this.difcty = (this.difcty+1) & 0xFF;
      if (this.difcty >= 11) {
        this.difcty = (this.difcty-1) & 0xFF;
      }
      var n = this.srocks+2;
      if (n >= 11) {
        n = 11;                                      // "LEAVE ONE OPEN PICTURE"
      }
      this.nrocks = n;
      this.srocks = n;
      for (var count = n; count > 0; count--, x--) {
        this.obj[x] = (this.rand() & 0x18) | 0x04;   // a random shape, large
        this.newvel(x, S);
        var r = this.rand();
        var a = (r >> 1) & 0x1F;
        if (r & 1) {
          // 35$: start on the left edge (Y axis)
          if (a >= 0x18) {
            a &= 0x17;
          }
          this.objyh[x] = a;
          this.objxh[x] = 0;
          this.objxl[x] = 0;
        } else {
          // 50$: start on the bottom edge (X axis)
          this.objxh[x] = a;
          this.objyh[x] = 0;
          this.objyl[x] = 0;
        }
      }
      this.edelay = 0x7F;                            // the saucer should wait
      this.thump3 = 0x30;                            // the thump from its slowest
    }
    // 65$: clear the rest of the rock slots
    for (; x >= 0; x--) {
      this.obj[x] = 0;
    }
  } // newast

  /**
   * `MAC:NEWVEL` (dis SetAstVel $7203, notes 5.2): for each axis a random
   * -4..+3 (RAND & $8F sign-extended) added to the old velocity, kept by
   * `NEWVE1` in 6..31 / -31..-6; four extra RANDs between the axes.
   * @param {number} x - The slot getting the velocity.
   * @param {number} y - The slot with the old velocity (the parent, or the saucer's zero).
   */
  newvel(x, y) {
    var a = this.rand() & 0x8F;
    if (a & 0x80) {
      a |= 0xF0;
    }
    this.xinc[x] = Game.newve1((a+this.xinc[y]) & 0xFF);
    this.rand();
    this.rand();
    this.rand();
    a = this.rand() & 0x8F;
    if (a & 0x80) {
      a |= 0xF0;
    }
    this.yinc[x] = Game.newve1((a+this.yinc[y]) & 0xFF);
  } // newvel

  /**
   * `MAC:NEWVE1`: a velocity byte clamped away from zero and from the
   * extremes: negative to -31..-6, positive to 6..31.
   * @param {number} a
   * @returns {number}
   */
  static newve1(a) {
    if (a & 0x80) {
      if (a < 0xE1) {
        a = 0xE1;                                    // -1F
      }
      return a < 0xFB ? a : 0xFA;                    // CMP I,-5 / BCC → else -6
    }
    if (a < 6) {
      a = 6;
    }
    return a < 0x20 ? a : 0x1F;
  } // newve1

  // ------------------------------------------------------------------- FIRE

  /**
   * `MAC:FIRE` (dis UpdateShip $6cd7, notes 4.3): the fire switch shifted
   * into `LASTSW` every frame; a shot when it is on now and was off the
   * frame before, the ship is on screen (SDELAY = 0) and a slot 31..34
   * is free (`FIRE1`, from the top). Not in the attract.
   */
  fire() {
    if (this.nplayr == 0) {
      return;                                        // FIRE2
    }
    this.lastsw = ((this.lastsw >> 1) | (this.input.fire ? 0x80 : 0)) & 0xFF;   // ASL FIRESW / ROR LASTSW
    if (!(this.lastsw & 0x80) || (this.lastsw & 0x40)) {
      return;                                        // BPL: not on; BVS: not off before
    }
    if (this.sdelay != 0) {
      return;                                        // not visible yet
    }
    this.fire1(0, 7, 3);                             // X = 0 (the ship), Y = 7, TEMP3+1 = 3
  } // fire

  /**
   * `MAC:FIRE1`: the first free shot slot `NOBJ + y` down to `NOBJ + stop
   * + 1` gets a shot of the object `NOBJ + x` (`FIRE3`); none free,
   * nothing.
   * @param {number} x - 0 the ship, 1 the saucer.
   * @param {number} y - The first slot offset (7 the ship's, 3 the saucer's).
   * @param {number} stop - The offset the search stops before (3 / 1).
   */
  fire1(x, y, stop) {
    for (;; y--) {
      if (this.obj[Game.NOBJ+y] == 0) {
        this.fire3(x, y);
        return;
      }
      if (y-1 == stop) {
        return;                                      // DEY / CPY TEMP3+1 / BNE FIRE1
      }
    }
  } // fire1

  /**
   * `MAC:FIRE3` (dis BulletSlotFound $6cfd): the shot lives $12 (18 ticks
   * of 4 frames); its velocity is the shooter's plus cos/2, sin/2 of the
   * angle (the ship's ANGLE, or ANGLE+1 the saucer aimed), each axis
   * kept within -111..111 ($91..$6F); it starts 3/4 of (cos, sin) — in
   * eighths, about 12 units — from the shooter's centre ("PUT TORP AT
   * NOSE OF SHIP"), the 16-bit add with the sign extension; SND1 (the
   * ship) or SND2 (the saucer) = $80 starts the sound.
   * @param {number} x - 0 the ship, 1 the saucer (the index - NOBJ).
   * @param {number} y - The shot's slot offset.
   */
  fire3(x, y) {
    var src = Game.NOBJ+x, dst = Game.NOBJ+y;
    this.obj[dst] = 0x12;
    var angle = x == 0 ? this.angle : this.angle2;
    var hx = Game.half(this.cos(angle) & 0xFF);      // CMP I,80 / ROR: half, the sign kept
    this.xinc[dst] = Game.shotSpeed((hx+this.xinc[src]) & 0xFF);
    var hy = Game.half(this.sin(angle) & 0xFF);
    this.yinc[dst] = Game.shotSpeed((hy+this.yinc[src]) & 0xFF);
    // 40$-50$: the nose — the half plus its half (3/2 of the half), the sign extended into the high byte
    var sx = hx & 0x80 ? 0xFF : 0;
    var ax = (Game.half(hx)+hx) & 0xFF;
    var sumx = ax+this.objxl[src];
    this.objxl[dst] = sumx & 0xFF;
    this.objxh[dst] = (sx+this.objxh[src]+(sumx >> 8)) & 0xFF;
    var sy = hy & 0x80 ? 0xFF : 0;
    var ay = (Game.half(hy)+hy) & 0xFF;
    var sumy = ay+this.objyl[src];
    this.objyl[dst] = sumy & 0xFF;
    this.objyh[dst] = (sy+this.objyh[src]+(sumy >> 8)) & 0xFF;
    if (x == 0) {
      this.snd1 = 0x80;                              // STA X,SND1
      this.events.push('fire');
    } else {
      this.snd2 = 0x80;
      this.events.push('saucerFire');
    }
  } // fire3

  /**
   * `CMP I,80 / ROR`: a signed byte halved, the sign kept.
   * @param {number} a - A byte.
   * @returns {number}
   */
  static half(a) {
    return ((a & 0x80) | (a >> 1)) & 0xFF;
  } // half

  /**
   * `FIRE3/23$-30$`: a shot's velocity byte clamped to -111..111.
   * @param {number} a - A byte.
   * @returns {number}
   */
  static shotSpeed(a) {
    if (a & 0x80) {
      return a >= 0x91 ? a : 0x91;                   // CMP I,-6F / BCS
    }
    return a < 0x70 ? a : 0x6F;                      // CMP I,70 / BCC
  } // shotSpeed

  // ------------------------------------------------------------------ HYPER

  /**
   * `MAC:HYPER` (dis EnterHyperspc $6e74, notes 4.4): the hyperspace
   * switch (a level) with the ship on screen, not exploding: the ship
   * vanishes with no velocity for $30 frames; a new X of RAND & $1F
   * kept in 3..$1C; five more RANDs, r = RAND & $1F: below 24 it is the
   * new Y; else v = (r & 7) * 2 + 4 is the new Y and, when v >= NROCKS
   * ("LET HIM LIVE" when v < NROCKS), the return destroys the ship
   * (RENTRY = $80); the Y kept in 3..$14. RENTRY = 1 marks a good jump.
   */
  hyper() {
    var N = Game.NOBJ;
    if (this.nplayr == 0 || (this.obj[N] & 0x80) || this.sdelay != 0 || !this.input.hyperspace) {
      return;                                        // 90$
    }
    this.obj[N] = 0;
    this.xinc[N] = 0;
    this.yinc[N] = 0;
    this.sdelay = 0x30;
    var a = this.rand() & 0x1F;
    if (a >= 0x1D) {
      a = 0x1C;                                      // stay away from the edge
    }
    if (a < 3) {
      a = 3;
    }
    this.objxh[N] = a;
    for (var i = 5; i > 0; i--) {
      a = this.rand();                               // 5$: 5 calls to RAND
    }
    a &= 0x1F;
    var x = 1;
    if (a >= 0x18) {
      a = (((a & 7) << 1)+4) & 0xFF;                 // AND 07 / ASL / ADC 04 (carry clear): 4..18
      if (a >= this.nrocks) {
        x = 0x80;                                    // CMP NROCKS / BCC 10$ — else the flag for destruction
      }
    }
    if (a >= 0x15) {
      a = 0x14;                                      // stay away from the top
    }
    if (a < 3) {
      a = 3;                                         // stay away from the bottom
    }
    this.objyh[N] = a;
    this.rentry = x;
  } // hyper

  // ------------------------------------------------------------------ ENEMY

  /**
   * `MAC:ENEMY` (dis UpdateScr $6b93, notes 6.1): every fourth frame. A
   * live saucer goes to `EFIRE`. None: in a game only while the ship is
   * on screen; RTIMER counts down, EDELAY counts down and at zero is set
   * to 1 (rev 4, dis $6bbc; rev 1 has 18) — then no saucer when a rock
   * was hit lately (RTIMER) and there are none or too many (DIFCTY)
   * rocks; else SEDLAY -= 6 down to $20, the saucer at X = 0 moving
   * +$10, or (POLYH bit 6 clear) at X = 1023 moving -$10, Y from RAND
   * (three bits into the low byte, the rest the high byte kept under
   * $18); large (2) while SEDLAY >= $80, small (1) above 30 000 points
   * or when RAND >= SEDLAY / 2.
   */
  enemy() {
    if (this.frame & 3) {
      return;
    }
    var S = Game.SAUCER, N = Game.NOBJ;
    var o = this.obj[S];
    if (o & 0x80) {
      return;                                        // exploding
    }
    if (o != 0) {
      this.efire();
      return;
    }
    // 15$
    if (this.nplayr != 0 && (this.obj[N] == 0 || (this.obj[N] & 0x80))) {
      return;                                        // not visible / exploding
    }
    if (this.rtimer != 0) {
      this.rtimer = (this.rtimer-1) & 0xFF;          // 6$
    }
    this.edelay = (this.edelay-1) & 0xFF;            // 2$
    if (this.edelay != 0) {
      return;
    }
    this.edelay = 1;                                 // rev 4: "just above 0"
    if (this.rtimer != 0) {
      if (this.nrocks == 0 || this.nrocks >= this.difcty) {
        return;                                      // no rocks / too many rocks
      }
    }
    var d = (this.sedlay-6) & 0xFF;                  // 5$
    if (d >= 0x20) {
      this.sedlay = d;
    }
    this.objxl[S] = 0;                               // 8$
    this.objxh[S] = 0;
    var r = this.rand();
    var yl = this.objyl[S];
    for (var i = 0; i < 3; i++) {
      yl = ((yl >> 1) | ((r & 1) << 7)) & 0xFF;      // LSR / ROR OBJYL
      r >>= 1;
    }
    this.objyl[S] = yl;
    if (r >= 0x18) {
      r &= 0x17;                                     // must be 0 to 767
    }
    this.objyh[S] = r;
    var xv = 0x10;
    if (!(this.polyh & 0x40)) {
      this.objxh[S] = 0x1F;                          // start on the right side
      this.objxl[S] = 0xFF;
      xv = 0xF0;
    }
    this.xinc[S] = xv;
    var size = 2;
    if (!(this.sedlay & 0x80)) {
      if (((this.score >> 8) & 0xFF) >= 0x30) {
        size = 1;                                    // 38$: a big score keeps the small saucer
      } else {
        var t = this.rand();
        if ((this.sedlay >> 1) < t) {
          size = 1;                                  // CMP TEMP1 / BCS 40$ keeps it large
        }
      }
    }
    this.obj[S] = size;                              // 40$
  } // enemy

  /**
   * `MAC:EFIRE` (dis ScrYVelocity $6c34, ScrUpdateAction $6c54, notes
   * 6.2): every 128 frames a Y velocity of -16, 0, 0, 16 by RAND & 3; in
   * a game no shot while the ship is off screen; EDELAY counts down and
   * at zero is set to 10: the large saucer shoots at a random angle, the
   * small one aims (`aim`), then `FIRE1` with the slots 29..30.
   */
  efire() {
    var S = Game.SAUCER;
    if (((this.frame << 1) & 0xFF) == 0) {           // ASL FRAME: zero when FRAME & $7F = 0
      this.yinc[S] = this.tables.tables.saucerYSpeed.values[this.rand() & 3] & 0xFF;
    }
    if (this.nplayr != 0 && this.sdelay != 0) {
      return;                                        // don't fire if you are dead
    }
    this.edelay = (this.edelay-1) & 0xFF;            // 30$
    if (this.edelay != 0) {
      return;
    }
    this.edelay = 10;                                // 50$: delay before the next shot
    if (this.obj[S] >> 1) {
      this.angle2 = this.rand();                     // fire in a random direction
    } else {
      this.aim();                                    // 80$
    }
    this.fire1(1, 3, 1);                             // 96$: X = 1, Y = 3, TEMP3+1 = 1
  } // efire

  /**
   * `MAC:EFIRE/80$-95$` as rev 4 has it (dis GetScrShpDistance $6c65,
   * NextScrShpDist $77ec): for each axis the 16-bit distance ship -
   * saucer, times 4, the high byte, less half the saucer's velocity on
   * that axis (the shot inherits it); in X a distance of $40..$BF (over
   * 512 units either way) is complemented — the shot goes the short way
   * round the edge (rev 4 only; Y has no such step). `ATAN` of the pair
   * gives ANGLE+1, and a random spread of RAND & $8F (+ $70 when
   * negative: -16..15) is added, or RAND & $87 (+ $78: -8..7) from
   * 35 000 points — with the carry of that comparison ("DONT BE TOO
   * GOOD - JUST CLOSE").
   */
  aim() {
    var N = Game.NOBJ, S = Game.SAUCER;
    var dx = Game.shotDistance(this.xinc[S], this.objxl[N], this.objxh[N], this.objxl[S], this.objxh[S]);
    if (dx >= 0x40 && dx < 0xC0) {
      dx ^= 0xFF;                                    // shoot the other way, across the edge
    }
    var dy = Game.shotDistance(this.yinc[S], this.objyl[N], this.objyh[N], this.objyl[S], this.objyh[S]);
    var angle = Game.atan(dx, dy);
    var r = this.rand();
    var good = ((this.score >> 8) & 0xFF) >= 0x35;   // CPY I,35: the carry stays set for the ADC
    r &= good ? 0x87 : 0x8F;
    if (r & 0x80) {
      r |= good ? 0x78 : 0x70;                       // sign extension
    }
    this.angle2 = (r+angle+(good ? 1 : 0)) & 0xFF;   // ADC ANGLE+1
  } // aim

  /**
   * One axis of the aim: ((ship - saucer) << 2) >> 8 as a byte, minus
   * half the saucer's velocity (`SEC / SBC`).
   * @param {number} inc - The saucer's velocity byte on the axis.
   * @param {number} shipLo
   * @param {number} shipHi
   * @param {number} scrLo
   * @param {number} scrHi
   * @returns {number} A byte.
   */
  static shotDistance(inc, shipLo, shipHi, scrLo, scrHi) {
    var half = Game.half(inc);
    var lo = (shipLo-scrLo) & 0xFF;
    var borrow = shipLo < scrLo ? 1 : 0;
    var a = (shipHi-scrHi-borrow) & 0xFF;
    a = ((a << 2) | (lo >> 6)) & 0xFF;               // ASL TEMP2 / ROL twice
    return (a-half) & 0xFF;
  } // shotDistance

  /**
   * `MAC:ATAN` (dis CalcScrShotDir $76f0): the angle 0..255 of (x, y),
   * $40 = 90 degrees, folded by the signs: a negative y negates the
   * result of -y, a negative x gives -(atan(y, -x) ^ $80).
   * @param {number} x - A signed byte.
   * @param {number} y - A signed byte.
   * @returns {number} A byte.
   */
  static atan(x, y) {
    if (y & 0x80) {
      return Game.comp(Game.atan1(x, Game.comp(y)));
    }
    return Game.atan1(x, y);
  } // atan

  /** `MAC:ATAN1`: the sign of x */
  static atan1(x, y) {
    if (x & 0x80) {
      return Game.comp(Game.atan2(Game.comp(x), y) ^ 0x80);
    }
    return Game.atan2(x, y);
  } // atan1

  /**
   * `MAC:ATAN2`: both non-negative (unsigned bytes: a negated -128 stays
   * $80): equal → $20; y < x → the table of y / x; else $40 - the table
   * of x / y.
   */
  static atan2(x, y) {
    if (y == x) {
      return 0x20;                                   // 10$: 45 degrees
    }
    if (y < x) {
      return Game.atan3(y, x);
    }
    return Game.comp((Game.atan3(x, y)-0x40) & 0xFF);
  } // atan2

  /** `MAC:ATAN3`: `DIVIDE`, then `ATANA` (dis ShotAngleTbl $772f) */
  static atan3(dividend, divisor) {
    return Game.ATANA[Game.divide(dividend, divisor)];
  } // atan3

  /** `MAC:ATANA` (dis $772f): the arctangent of a 4-bit ratio */
  static get ATANA() { return [0, 2, 5, 7, 10, 12, 15, 17, 19, 21, 23, 25, 26, 28, 29, 31]; }

  /**
   * `MAC:DIVIDE` (dis FindScrAngleIndex $776c): four bits of the
   * quotient of the unsigned bytes, by shifting and subtracting; the
   * dividend is below the divisor when called.
   * @param {number} a - The dividend.
   * @param {number} d - The divisor.
   * @returns {number} 0..15
   */
  static divide(a, d) {
    var q = 0;
    for (var i = 0; i < 4; i++) {
      a = (a << 1) & 0xFF;                           // ROL (the carry in is 0)
      var bit = a >= d ? 1 : 0;                      // CMP TEMP2+1
      if (bit) {
        a = (a-d) & 0xFF;                            // SBC
      }
      q = (q << 1) | bit;
    }
    return q & 0xF;
  } // divide

  /** `MAC:COMP`: the two's complement of a byte */
  static comp(a) {
    return (-a) & 0xFF;
  } // comp

  // ----------------------------------------------------------------- COLIDE

  /**
   * `MAC:COLIDE` (dis HitDetection $69f0, notes 7): each attacker
   * X = 7..0 (the ship's shots, the saucer's shots, the saucer, the
   * ship) that is active and not exploding against the targets Y: the
   * ship's shots against the saucer and the rocks, the saucer and its
   * shots against the ship and the rocks, the ship against the rocks.
   * The distance on each axis in quarters of a unit (the 16-bit
   * difference halved): over 512 units apart misses. The radius is the
   * target's size (42 / 72 / 132 for OBJ bit 0 / bit 1 / else) plus 28
   * for the ship as the attacker, plus 19 for the saucer (the carry of
   * `CPX I,01` goes into the `ADC`) and 18 more for the large one. A
   * hit when dx <= R, dy <= R and dx + dy < 3R/2 ("CHOP OFF CORNERS");
   * then `DSTRCT` and the next attacker.
   */
  colide() {
    var N = Game.NOBJ;
    for (var x = 7; x >= 0; x--) {
      var o = this.obj[N+x];
      if (o == 0 || (o & 0x80)) {
        continue;                                    // 13$
      }
      var y = N+1;                                   // 15$
      if (x < 4) {
        y--;                                         // bypass saucer to saucer collision
        if (x == 0) {
          y--;                                       // the ship doesn't collide with the ship
        }
      }
      for (; y >= 0; y--) {
        var t = this.obj[y];                         // 20$
        if (t == 0 || (t & 0x80)) {
          continue;
        }
        var dx = this.quarterDistance(this.objxl, this.objxh, y, N+x);
        if (dx < 0) {
          continue;                                  // too far away
        }
        var dy = this.quarterDistance(this.objyl, this.objyh, y, N+x);
        if (dy < 0) {
          continue;
        }
        var r = t & 1 ? 42 : t & 2 ? 72 : 132;       // 35$
        if (x == 0) {
          r += 28;                                   // the ship
        } else if (x == 1) {
          r += 19;                                   // the saucer: ADC I,18. with the carry set
          if (this.obj[Game.SAUCER] != 1) {
            r += 18;                                 // the large one
          }
        }
        if (r < dx || r < dy) {
          continue;                                  // 38$: no hit
        }
        var sum = dx+dy;
        if (sum >= 0x100 || sum >= r+(r >> 1)) {
          continue;                                  // numbers too large / chop off corners
        }
        this.dstrct(x, y);
        break;                                       // 39$: the next attacker
      }
    }
  } // colide

  /**
   * One axis of `COLIDE/20$-25$`: the 16-bit difference target -
   * attacker halved; the high byte must come out 0 or 1 (the low byte is
   * the distance) or $FE / $FF (its complement is), else too far.
   * @returns {number} The distance in quarter units, or -1.
   */
  quarterDistance(lo, hi, y, x) {
    var l = (lo[y]-lo[x]) & 0xFF;
    var borrow = lo[y] < lo[x] ? 1 : 0;
    var h = (hi[y]-hi[x]-borrow) & 0xFF;
    var t = ((l >> 1) | ((h & 1) << 7)) & 0xFF;      // LSR / ROR TEMP1
    var a = h & 0xFE;                                // ASL of the shifted high byte
    if (a == 0) {
      return t;                                      // within 64.
    }
    if (a != 0xFE) {
      return -1;                                     // BPL 40$ / EOR I,0FE / BNE 40$
    }
    return t ^ 0xFF;                                 // distance - 1 from the torpedo
  } // quarterDistance

  /**
   * `MAC:DSTRCT` (dis DoObjHit $6b0f, notes 4.5, 6.3, 7): the saucer
   * hitting the ship becomes the ship hitting the saucer. The ship as
   * the attacker: SDELAY = $81, HITS--, it explodes; the saucer as the
   * attacker explodes; a shot is spent. The target: a rock is `SPLIT`,
   * the ship loses a life (SDELAY = $81), the saucer resets EDELAY and
   * scores (200 the large, 1000 the small: $99 plus the carry the `LSR`
   * left) in a game; then `70$`: the explosion byte for the sound from
   * the target's size bits — after the split, so a large rock gives $3F,
   * a medium $FF, a small $BF — and the target explodes in place.
   * @param {number} x - The attacker's index - NOBJ (0..7).
   * @param {number} y - The target's index (0..28).
   */
  dstrct(x, y) {
    var N = Game.NOBJ, S = Game.SAUCER;
    if (x == 1 && y == N) {
      x = 0;                                         // ship hit saucer
      y = S;
    }
    if (x == 1) {
      this.explode(N+x);                             // 62$
      if (y < N) {
        this.split(x, y);                            // 65$: saucer hit rock
      } else {
        this.saucerHit();                            // 80$
      }
    } else if (x == 0) {
      this.sdelay = 0x81;                            // 60$: delay restarting the ship
      this.hits = (this.hits-1) & 0xFF;
      this.explode(N);
      if (y < N) {
        this.split(0, y);
      } else {
        this.saucerHit();                            // ship & saucer collide
      }
    } else {
      this.obj[N+x] = 0;                             // 63$: clear torpedo
      if (y == N) {
        this.hits = (this.hits-1) & 0xFF;            // 75$: hit ship with torpedo
        this.sdelay = 0x81;
      } else if (y > N) {
        this.saucerHit();                            // hit saucer with torpedo
      } else {
        this.split(x, y);
      }
    }
    // 70$
    var a = (this.obj[y] & 3) ^ 2;                   // 2 small, 3 medium, 0 large
    var c1 = a & 1;
    a >>= 1;                                         // LSR
    var c2 = a & 1;
    a = (a >> 1) | (c1 << 7);                        // ROR
    a = (a >> 1) | (c2 << 7);                        // ROR
    this.lexpsnd = a | 0x3F;
    this.events.push('explosion'+Game.hex(this.lexpsnd));
    this.explode(y);
  } // dstrct

  /** `DSTRCT/62$`, `70$`: an object set exploding in place — OBJ = $A0, no velocity */
  explode(i) {
    this.obj[i] = 0xA0;
    this.xinc[i] = 0;
    this.yinc[i] = 0;
  } // explode

  /**
   * `DSTRCT/80$` (dis SaucerHit $6b73): EDELAY = SEDLAY; in a game the
   * points — `LDA OBJ+NOBJ+1 / LSR` leaves the carry set for the small
   * saucer, so `POINTS` adds $99 + 1 = 1000; the large gets $20 = 200.
   */
  saucerHit() {
    this.edelay = this.sedlay;
    if (this.nplayr == 0) {
      return;                                        // if in attract
    }
    var small = this.obj[Game.SAUCER] & 1;
    this.points(small ? 0x99 : 0x20, small);
  } // saucerHit

  /**
   * `MAC:SPLIT` (dis BreakAsteroid $75ec, notes 5.3): RTIMER = $50; the
   * size bits shift right (4 → 2 → 1 → 0, the shape kept); in a game the
   * ship or its shot scores by the new size index (100 / 50 / 20 for
   * the small / medium / large, `99$`) — the saucer and its shots do
   * not; a rock that is still there gets two children in the free rock
   * slots (`SEARCH` from 26 down, `SEARC1` on from the first), each a
   * copy (`CPYPOS`) with a velocity from the parent's (`NEWVEL`), the
   * first pushed in X and the second in Y by twice the low five bits of
   * that velocity ("PREVENT OVERLAPING ROCKS"); NROCKS counts them.
   * @param {number} x - The attacker's index - NOBJ.
   * @param {number} y - The rock's index.
   */
  split(x, y) {
    this.rtimer = 0x50;
    var picture = this.obj[y] & 0x78;
    var size = (this.obj[y] & 7) >> 1;
    this.obj[y] = size == 0 ? 0 : (size | picture);
    if (this.nplayr != 0 && (x == 0 || x >= 4)) {
      this.points(this.tables.tables.rockPoints.values[size] & 0xFF, 0);   // 15$: CLC / JSR POINTS
    }
    if (this.obj[y] == 0) {
      return;                                        // disappeared
    }
    var s = this.search(Game.NOBJ-1);
    if (s < 0) {
      return;                                        // no more entries
    }
    this.nrocks = (this.nrocks+1) & 0xFF;
    this.cpypos(s, y);
    this.newvel(s, y);
    this.objxl[s] ^= ((this.xinc[s] & 0x1F) << 1) & 0xFF;
    s = this.search(s);                              // SEARC1: on from the slot just filled
    if (s < 0) {
      return;                                        // no more room
    }
    this.nrocks = (this.nrocks+1) & 0xFF;
    this.cpypos(s, y);
    this.newvel(s, y);
    this.objyl[s] ^= ((this.yinc[s] & 0x1F) << 1) & 0xFF;
  } // split

  /**
   * `MAC:SEARCH` / `SEARC1` (dis GetFreeAstSlot $745a): the first free
   * rock slot from `from` down, or -1.
   */
  search(from) {
    for (var i = from; i >= 0; i--) {
      if (this.obj[i] == 0) {
        return i;
      }
    }
    return -1;
  } // search

  /**
   * `MAC:CPYPOS` (dis UpdateAsteroid $6a9d): the new rock gets the old
   * one's size with a random shape (RAND & $18), its position and its
   * velocity.
   * @param {number} x - The new rock's slot.
   * @param {number} y - The old rock's slot.
   */
  cpypos(x, y) {
    this.obj[x] = (this.rand() & 0x18) | (this.obj[y] & 7);
    this.objxl[x] = this.objxl[y];
    this.objxh[x] = this.objxh[y];
    this.objyl[x] = this.objyl[y];
    this.objyh[x] = this.objyh[y];
    this.xinc[x] = this.xinc[y];
    this.yinc[x] = this.yinc[y];
  } // cpypos

  /**
   * `MAC:POINTS` (dis UpdateScore $7397, notes 9.1): a BCD byte (x 10)
   * added to the 16-bit BCD score with the carry the caller left; a
   * carry into the high byte that leaves its low digit 0 — every
   * 10 000 — gives an extra ship and the tone (SND3 = $B0).
   * @param {number} a - The points byte (BCD).
   * @param {number} carry - 0 or 1.
   */
  points(a, carry) {
    var lo = Game.bcdAdd(this.score & 0xFF, a, carry);
    var hi = (this.score >> 8) & 0xFF;
    if (lo.carry) {
      hi = Game.bcdAdd(hi, 0, 1).value;
      if ((hi & 0x0F) == 0) {
        this.snd3 = 0xB0;                            // set off tone
        this.hits = (this.hits+1) & 0xFF;            // one more life
        this.events.push('extraLife');
      }
    }
    this.score = ((hi << 8) | lo.value) & 0xFFFF;
  } // points

  /**
   * `SED / ADC` of two BCD bytes with a carry in.
   * @returns {Object} `{value, carry}`
   */
  static bcdAdd(a, b, carry) {
    var l = (a & 0xF)+(b & 0xF)+carry;
    if (l > 9) {
      l += 6;
    }
    var h = (a >> 4)+(b >> 4)+(l > 0xF ? 1 : 0);
    var out = 0;
    if (h > 9) {
      h += 6;
      out = 1;
    }
    return {value: ((h & 0xF) << 4) | (l & 0xF), carry: out};
  } // bcdAdd

  /** a byte as two upper-case hex digits */
  static hex(a) {
    return ('0'+(a & 0xFF).toString(16).toUpperCase()).slice(-2);
  } // hex

  // ----------------------------------------------------------------- SHPEXP

  /**
   * `MAC:SHPEXP` (dis DoShipExplsn $7465, notes 8): the pieces of the
   * exploding ship as Playfield draws them. On the first frame (OBJ <
   * $A2) the six positions are set to `EXPDIR / 16` (the high bytes; the
   * low bytes keep whatever the last explosion left, as the RAM does);
   * every frame the pieces still shown — `((~OBJ) & $70) >> 3` is the
   * index of the last, 10 = all six, one fewer every 32 frames — move by
   * `EXPDIR` in 1/256 units (16-bit, the sign extended) and are drawn at
   * the high byte's offset from the ship's position: an invisible move
   * there (`VGVCTR` at VGBRIT = 0 — exact, the scale chosen to fit), the
   * piece, the piece back invisibly, the move back.
   * @returns {Array} `[{index, dx, dy}]` in the order drawn (the last piece first).
   */
  shpexp() {
    var N = Game.NOBJ;
    var o = this.obj[N];
    var dir = this.tables.tables.pieceDirections.values;
    if (o < 0xA2) {
      for (var x = 10; x >= 0; x -= 2) {
        this.shipx[x+1] = Game.sixteenth(dir[x]);    // 10$
        this.shipy[x+1] = Game.sixteenth(dir[x+1]);
      }
    }
    var pieces = [];
    for (var i = ((o ^ 0xFF) & 0x70) >> 3; i >= 0; i -= 2) {
      var px = this.advancePiece(this.shipx, i, dir[i]);
      var py = this.advancePiece(this.shipy, i, dir[i+1]);
      pieces.push({index: i >> 1, dx: px, dy: py});
    }
    return pieces;
  } // shpexp

  /**
   * `SHPEXP/10$`: `LSR` x 4, `ADC I,0F8`, `EOR I,0F8` — a signed byte
   * divided by 16 (towards minus infinity).
   */
  static sixteenth(d) {
    var a = (d & 0xFF) >> 4;
    return (((a+0xF8) & 0xFF) ^ 0xF8) & 0xFF;
  } // sixteenth

  /**
   * `SHPEXP/25$-28$`: the 16-bit position of one axis of a piece plus
   * the signed direction byte; returns the high byte with the sign of
   * the direction (`STA XCOMP / STY XCOMP+1`) as a signed number.
   */
  advancePiece(pos, x, d) {
    var dd = d & 0xFF;
    var y = dd & 0x80 ? 0xFF : 0;
    var sum = dd+pos[x];
    pos[x] = sum & 0xFF;
    var hi = (y+pos[x+1]+(sum >> 8)) & 0xFF;
    pos[x+1] = hi;
    return y ? hi-256 : hi;
  } // advancePiece

  // ----------------------------------------------------------------- SOUNDS

  /**
   * `MAC:SOUNDS` (dis ChkUpdateSFX $7555, notes 10.1) as far as the
   * program's logic: nothing in the attract; the saucer select and the
   * saucer sound from its slot; the two shot sounds through `SOUND1`;
   * the thrust forced off unless the ship is OBJ = 1; the thump — on
   * for THUMP1 = 4 frames, off for THUMP2 = THUMP3 frames, the tone
   * alternating (LTHUMP ^= $14), and only with rocks and a live ship on
   * screen; the explosion byte counting down while its low six bits
   * last. The values land in `outputs`, the thump's onsets in `events`.
   */
  sounds() {
    if (this.nplayr == 0) {
      return;
    }
    var N = Game.NOBJ, S = Game.SAUCER, out = this.outputs;
    var o = this.obj[S];
    if (o != 0 && !(o & 0x80)) {
      out.scrsel = o == 2 ? 0x80 : 0;                // ROR x 3: bit 7 set for the large saucer
      out.scrsnd = 0x80;
    } else {
      out.scrsnd = 0;
    }
    out.scrfir = this.sound1(2);                     // 20$
    out.shpfir = this.sound1(1);
    out.shpsnd = this.obj[N] == 1 && this.shpsnd ? 0x80 : 0;
    var on = false;
    if (this.nrocks != 0 && !(this.obj[N] & 0x80) && (this.obj[N] | this.rentry) != 0) {
      if (this.thump1 == 0) {
        // 30$
        this.thump2 = (this.thump2-1) & 0xFF;
        if (this.thump2 != 0) {
          on = null;                                 // leave the sound off
        } else {
          this.thump1 = 4;
          this.lthump ^= 0x14;                       // turn on the sound and change its tone
          out.thump = this.lthump;
          this.events.push(this.lthump & 4 ? 'thumpHigh' : 'thumpLow');
          on = null;
        }
      } else {
        this.thump1 = (this.thump1-1) & 0xFF;
        if (this.thump1 != 0) {
          on = null;                                 // leave the sound on
        }
      }
    }
    if (on === false) {
      // 27$: the thump off, at least THUMP3 frames before it is on again
      this.lthump &= 0x0F;
      out.thump = this.lthump;
      this.thump2 = this.thump3;
    }
    // 50$
    var e = this.lexpsnd;
    if (e & 0x3F) {
      e = (e-1) & 0xFF;
    }
    this.lexpsnd = e;
    out.expsnd = e;
    // the LS259's edges as events for the sound board (AS-M7): the thrust
    // noise and the saucer's warble run while their bits stand
    var l = this.latched;
    if (out.shpsnd != l.shpsnd) {
      this.events.push(out.shpsnd ? 'thrustOn' : 'thrustOff');
    }
    if (out.scrsnd != l.scrsnd || (out.scrsnd && out.scrsel != l.scrsel)) {
      this.events.push(out.scrsnd ? (out.scrsel ? 'saucerLarge' : 'saucerSmall') : 'saucerOff');
    }
    l.shpsnd = out.shpsnd;
    l.scrsnd = out.scrsnd;
    l.scrsel = out.scrsel;
  } // sounds

  /**
   * `MAC:SOUND1`: the state machine of a one-shot shot sound: SND = $80
   * starts it (SND = $10 frames, the output $80), it counts down to 0,
   * a new $80 meanwhile turns it off for a frame so it restarts.
   * @param {number} which - 1 the ship's (SND1/LSND1), 2 the saucer's.
   * @returns {number} $80 on, 0 off.
   */
  sound1(which) {
    var snd = which == 1 ? this.snd1 : this.snd2;
    var last = which == 1 ? this.lsnd1 : this.lsnd2;
    var value;
    if (!(last & 0x80)) {
      if (!(snd & 0x80)) {
        value = 0;                                   // not supposed to start
      } else {
        snd = 0x10;                                  // length of sound
        value = 0x80;
      }
    } else if (snd == 0 || (snd & 0x80)) {
      value = 0;                                     // 70$: off, or a new one must start
    } else {
      snd = (snd-1) & 0xFF;
      value = snd != 0 ? 0x80 : 0;
    }
    if (which == 1) {
      this.snd1 = snd;
      this.lsnd1 = value;
    } else {
      this.snd2 = snd;
      this.lsnd2 = value;
    }
    return value;
  } // sound1

  // ------------------------------------------------------------------- RAND

  /**
   * `MAC:RAND` (dis GetRandNum $77b5, notes 12): the 16-bit shift register
   * `POLYH:POLYL` shifted left, the new bit 0 set when the new bit 15 is
   * 1, flipped when bit 1 is 1, and the zero state avoided; returns
   * POLYL.
   * @returns {number} A byte.
   */
  rand() {
    var carry = this.polyl >> 7;
    this.polyl = (this.polyl << 1) & 0xFF;           // ASL POLYL
    this.polyh = ((this.polyh << 1) | carry) & 0xFF; // ROL POLYH
    if (this.polyh & 0x80) {
      this.polyl = (this.polyl+1) & 0xFF;            // INC POLYL
    }
    var a = this.polyl;
    if (a & 2) {
      a ^= 1;                                        // BIT 9$ (.BYTE 2) / EOR I,01
      this.polyl = a;
    }
    if ((a | this.polyh) == 0) {
      this.polyl = (this.polyl+1) & 0xFF;            // beware the 0 case
    }
    return this.polyl;
  } // rand

  // ---------------------------------------------------------------- SIN/COS

  /**
   * `MAC:SIN` over `VEC:SINCOS` (notes 2.4): the first quadrant folded —
   * an angle of 128 and over negates (`COMP`), 65..127 mirrors
   * (`EOR I,7F` + 1).
   * @param {number} angle - 0..255.
   * @returns {number} -127..127.
   */
  sin(angle) {
    var a = angle & 0xFF;
    if (a & 0x80) {
      return -this.sin1(a & 0x7F);
    }
    return this.sin1(a);
  } // sin

  sin1(a) {
    if (a >= 0x41) {
      a = ((a ^ 0x7F)+1) & 0xFF;
    }
    return this.sinTable[a];
  } // sin1

  /** `MAC:COS`: sin(angle + 64) */
  cos(angle) {
    return this.sin((angle+0x40) & 0xFF);
  } // cos

} // Game
