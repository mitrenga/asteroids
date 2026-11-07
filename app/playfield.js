const { DVG } = await import('./svision/js/platform/vector/atari/dvg.js?ver='+window.srcVersion);
// begin code

/**
 * The picture of one frame of Asteroids, composed from the vector data of
 * the ROM (data/shapes.json, font.json, tables.json — tools/rom2vectors.mjs,
 * rom2tables.mjs) the way the original's main loop composes its display
 * list (sources/docs/disasm_notes.md 1.2, 3.3, 9.3): the messages of
 * `CHKST` (PUSH START, PLAYER n, GAME OVER, the price of a game), then
 * every object as `MOTION` walks them — a `LABS` at the object's position
 * with the global scale of its size, the shape's code — then `PARAMS`: the
 * copyright line, the score of player 1, the reserve ships, the high
 * score, and the score and ships of player 2 when there are two players
 * or nobody (the attract). The two screens of the end of a game (AS-M6)
 * come between the messages and the objects, where `GETINT` and
 * `SCORES` put them: the initials being entered (`initials()`) and the
 * high score table (`table()`) — on those frames the game gives no
 * objects. No DOM — the same code runs in the worker, in the game and in
 * the tools (regress, matchvectors).
 *
 * Everything goes through the DVG interpreter of svision at the scale and
 * the place the machine's program would set, so the rounding of the rate
 * multipliers is the machine's at every size (a small rock is the large
 * rock's code at global scale E). The output is the interpreter's
 * segments `{x1, y1, x2, y2, intensity}` in DVG units (x 0..1023, y
 * 128..895 up); `DVG.appendTo` puts them into a display list of the
 * vector platform.
 *
 * The state is what {@link Game} will return from a tick (AS-M4;
 * `emptyState()` names the fields). Object positions are world units
 * (the integer part of `OBJXH:OBJXL`, x 0..1023, y 0..767); the picture
 * adds 128 to y (`PICTUR`: `ADC I,04` on the high byte).
 */
export class Playfield {

  /** the world's y in DVG units (notes 2.1, 3.3) */
  static get Y_OFFSET() { return 128; }

  /**
   * Where `PARAMS` puts the texts (dis UpdateScreenText $724f: MoveBeam
   * takes X/4, Y/4) and their global scale nibble: the scores at $10
   * (x2), the high score at $00, the ships at $E0 (x1/4).
   */
  static get LAYOUT() {
    return {
      score1: {x: 100, y: 876, scale: 1},
      lives1: {x: 160, y: 852, scale: 0xE},
      hiScore: {x: 480, y: 876, scale: 0},
      score2: {x: 768, y: 876, scale: 1},
      lives2: {x: 828, y: 852, scale: 0xE},
      initials: {x: 400, y: 228, scale: 2},          // GETINT: VGSIZE $20, VGSABS(400/4, 228/4)
      table: {x: 380, y: 668, step: 32, scale: 1}    // SCORES: VGSIZE $10, a row every 32
    };
  } // LAYOUT

  /**
   * The underline of a blank initial being entered (`INITAL`, dis
   * DrawInitial $6f1a): the words $F872 and $F801 — SVEC 8 right at
   * intensity 7, SVEC 4 right dark — a glyph's width at the scale.
   */
  static get UNDERLINE() {
    return [
      {op: 'SVEC', t: 3, dx: 512, dy: 0, z: 7},
      {op: 'SVEC', t: 3, dx: 256, dy: 0, z: 0}
    ];
  } // UNDERLINE

  /**
   * @param {Object} data - `{shapes, font, tables}` as the tools wrote them.
   */
  constructor(data) {
    this.shapes = data.shapes;
    this.font = data.font;
    this.tables = data.tables;
    this.dvg = new DVG();
  } // constructor

  /**
   * A state with nothing in it: no texts, no objects, score 0, 3 ships,
   * one player, the copyright line.
   * @returns {Object}
   */
  static emptyState() {
    return {
      texts: [],              // [{text, x, y, scale}] in DVG units, the lower left of the first glyph, the scale nibble (1 = x2); see message()
      objects: [],            // in the order of the display list (MOTION: index 34 down to 0): see object()
      score: 0,               // the displayed score (a multiple of 10, BCD x 10 on the machine)
      lives: 3,               // the reserve ships of player 1 (HITS)
      hiScore: 0,
      players: 1,             // NPLAYR: 0 the attract, 1, 2 — the score and the ships of player 2 are drawn unless 1
      score2: 0,
      lives2: 0,
      copyright: true,        // '© 1979 ATARI INC' at the bottom (VecCredits)
      screen: 'game',         // 'game'; 'initials' (GETINT) or 'table' (SCORES): the objects stay put, see initials() / table()
      initials: false,        // the initials screen: {letters: 'A  ' (three, a blank underlined), index}
      table: false            // the high score table: [{score, initials: 'ABC'}] from the first, the rows drawn
    };
  } // emptyState

  /**
   * A message of the ROM at its place (tables.messages: VEC:L0 and
   * MSG:VGMSGS, notes 9.3), at global scale $10 as `VGMSG` draws them.
   * @param {Object} tables - data/tables.json
   * @param {number} index - 0 HIGH SCORES, 1 PLAYER, 2..5 the initials' instructions, 6 PUSH START, 7 GAME OVER, 8..10 the price.
   * @param {string} [suffix] - Appended (the player's number after PLAYER).
   * @returns {Object} `{text, x, y, scale}`
   */
  static message(tables, index, suffix) {
    var m = tables.messages[index];
    return {text: m.text+(suffix || ''), x: m.x, y: m.y, scale: 1};
  } // message

  /**
   * The segments of one frame.
   * @param {Object} state - See emptyState().
   * @returns {Array}
   */
  frame(state) {
    var d = this.dvg;
    d.reset();
    if (state.objectsOnly) {
      // the menu's backdrop: the objects alone, no texts, scores or copyright
      (state.objects || []).forEach((o) => this.object(o));
      return d.segments;
    }
    (state.texts || []).forEach((t) => this.text(t.text, t.x, t.y, t.scale));
    if (state.initials) {
      this.initials(state.initials.letters);
    }
    if (state.table) {
      this.table(state.table);
    }
    (state.objects || []).forEach((o) => this.object(o));
    var L = Playfield.LAYOUT;
    if (state.copyright) {
      // a subroutine with its own LABS: its segments are absolute
      this.shapes.copyright.segments.forEach((s) => d.segments.push(s));
    }
    this.number(state.score, L.score1);
    this.lives(state.lives, L.lives1);
    this.number(state.hiScore, L.hiScore);
    if (state.players != 1) {
      this.number(state.score2, L.score2);
      this.lives(state.lives2, L.lives2);
    }
    return d.segments;
  } // frame

  /**
   * One object of the display list (`PICTUR`, notes 3.3): a `LABS` at its
   * position with the global scale of its size, then the shape's code.
   * `{kind: 'rock', size: 4 | 2 | 1, shape: 0..3, x, y}`,
   * `{kind: 'saucer', size: 2 | 1, x, y}`,
   * `{kind: 'ship', x, y, angle, flame}` (the 8-bit angle, 0 = right, 64 = up),
   * `{kind: 'shot', x, y}` (a dot),
   * `{kind: 'explosion', x, y, status}` (the OBJ byte $A0..$FF of an exploding rock or saucer),
   * `{kind: 'shipExplosion', x, y, pieces: [{index, dx, dy}]}` (the exploding ship, `SHPEXP`:
   * the pieces of `EXPSHP` at their offsets, in the order given).
   * @param {Object} o
   */
  object(o) {
    var d = this.dvg;
    var y = o.y+Playfield.Y_OFFSET;
    switch (o.kind) {
      case 'rock':
        d.labs(o.x, y, Playfield.scaleOfSize(o.size));
        d.draw(this.shapes.rocks.pictures[o.shape & 3].code);
        break;
      case 'saucer':
        d.labs(o.x, y, Playfield.scaleOfSize(o.size));
        d.draw(this.shapes.saucer.code);
        break;
      case 'ship': {
        var p = Playfield.shipPicture(o.angle);
        var picture = this.shapes.ships.pictures[p.picture];
        d.labs(o.x, y, 0xE);
        d.draw(Playfield.mirrored(picture.code, p.xInv, p.yInv));
        if (o.flame) {
          d.draw(Playfield.mirrored(picture.flame.code, p.xInv, p.yInv));
        }
        break;
      }
      case 'shot':
        // VGDOT: a zero-length VCTR at T = 7, intensity 15 (dis DoDrawBullet $7384)
        d.labs(o.x, y, 0xE);
        d.vector(0, 0, 7, 15);
        break;
      case 'explosion': {
        // EXPPIC[(OBJ & $0C) >> 2] at global scale (OBJ & $F0) + $10 (notes 8)
        var status = o.status & 0xFF;
        d.labs(o.x, y, (((status & 0xF0)+0x10) >> 4) & 0xF);
        d.draw(this.shapes.explosions.pictures[(status & 0x0C) >> 2].code);
        break;
      }
      case 'shipExplosion':
        // SHPEXP (dis DoShipExplsn $7465, notes 8): "NO SCALING FOR SHIP
        // EXPLOSION" — LABS at scale 0; for each piece an invisible move
        // to its offset (VGVCTR at VGBRIT = 0 picks the rate to fit, the
        // length is exact — as at T = 9), the piece, the piece back with
        // no intensity, the move back
        d.labs(o.x, y, 0);
        (o.pieces || []).forEach((p) => {
          var code = this.shapes.shipPieces.pieces[p.index].code;
          d.vector(p.dx, p.dy, 9, 0);
          d.draw(code);
          code.forEach((i) => {
            if (i.op == 'VCTR' || i.op == 'SVEC') {
              d.vector(-i.dx, -i.dy, i.t, 0);
            }
          });
          d.vector(-p.dx, -p.dy, 9, 0);
        });
        break;
    }
  } // object

  /**
   * The global scale nibble of an object's size (`PICTUR`): bit 0 (the
   * small rock, the ship, the small saucer, a shot) x1/4, bit 1 (the
   * medium rock, the large saucer) x1/2, else (the large rock) x1.
   * @param {number} size - The low bits of OBJ.
   * @returns {number}
   */
  static scaleOfSize(size) {
    return size & 1 ? 0xE : size & 2 ? 0xF : 0;
  } // scaleOfSize

  /**
   * The picture of the ship for an angle and how it is mirrored (dis
   * UpdateShipDraw $750b, notes 4.1): an angle of 128 and over flips Y
   * and folds, 64 and over flips X and folds, the picture is the folded
   * angle / 4.
   * @param {number} angle - 0..255, 0 = right, counterclockwise.
   * @returns {Object} `{picture, xInv, yInv}`
   */
  static shipPicture(angle) {
    var idx = angle & 0xFF;
    var yInv = false, xInv = false;
    if (idx >= 128) {
      yInv = true;
      idx = (256-idx) & 0xFF;
    }
    if (idx >= 64) {
      xInv = true;
      idx = 128-idx;
    }
    return {picture: idx >> 2, xInv: xInv, yInv: yInv};
  } // shipPicture

  /**
   * A shape's code with the sign bits flipped (`DrawShip`: `EOR` of bit 2
   * of the words that carry the signs).
   * @param {Array} code
   * @param {boolean} xInv
   * @param {boolean} yInv
   * @returns {Array}
   */
  static mirrored(code, xInv, yInv) {
    if (!xInv && !yInv) {
      return code;
    }
    return code.map((i) => {
      if (i.op != 'VCTR' && i.op != 'SVEC') {
        return i;
      }
      return {op: i.op, t: i.t, dx: xInv ? -i.dx : i.dx, dy: yInv ? -i.dy : i.dy, z: i.z};
    });
  } // mirrored

  /**
   * A text of the ROM font (`VGMSG`): a `LABS` at the lower left of the
   * first glyph with the global scale, then the glyphs' code, each
   * leaving the beam 12 (x the scale) to the right. A character the ROM
   * lacks is a blank; lower case draws as capitals.
   * @param {string} text
   * @param {number} x - DVG units.
   * @param {number} y
   * @param {number} scale - The global scale nibble (0 = x1, 1 = x2, 2 = x4).
   */
  text(text, x, y, scale) {
    this.dvg.labs(x, y, scale);
    this.glyphs(text);
  } // text

  /**
   * The glyphs of a text from where the beam is (`VGCHAR` each).
   * @param {string} text
   */
  glyphs(text) {
    var d = this.dvg;
    var raw = this.font.raw;
    String(text).toUpperCase().split('').forEach((ch) => {
      d.draw((raw[ch] || raw[' ']).code);
    });
  } // glyphs

  /**
   * The initials being entered (`GETINT`, notes 9.3, 9.4): a `LABS` at
   * (400, 228) with the global scale $20 (x4), then the three letters —
   * a blank is the underline (`INITAL`: every blank while the initials
   * are entered, not only the current one).
   * @param {string} letters - Three characters, ' ' a blank.
   */
  initials(letters) {
    var d = this.dvg;
    var L = Playfield.LAYOUT.initials;
    d.labs(L.x, L.y, L.scale);
    var raw = this.font.raw;
    String(letters).padEnd(3, ' ').substring(0, 3).toUpperCase().split('').forEach((ch) => {
      if (ch == ' ') {
        d.draw(Playfield.UNDERLINE);
      } else {
        d.draw((raw[ch] || raw[' ']).code);
      }
    });
  } // initials

  /**
   * The high score table (`SCORES`, notes 9.3, 9.4): a row per entry at
   * (380, 668 - 32 row) at the global scale $10 — the rank as two BCD
   * digits with the leading zero blank (`DIGITS`, 2 digits, carry set),
   * a dot (`VGDOT` $40: a zero vector at scale 4, intensity 4), a blank,
   * the score (`DIGITS` 4 digits, `VGHEX` 0), a blank, the three
   * initials (`INITAL`: a blank is a blank here). The HIGH SCORES title
   * comes among the texts.
   * @param {Array} rows - `[{score, initials}]`
   */
  table(rows) {
    var d = this.dvg;
    var L = Playfield.LAYOUT.table;
    rows.forEach((r, i) => {
      d.labs(L.x, L.y-L.step*i, L.scale);
      this.glyphs(Playfield.rankText(i+1));
      d.vector(0, 0, 4, 4);
      this.glyphs(' '+Playfield.scoreText(r.score)+' '+String(r.initials || '').padEnd(3, ' ').substring(0, 3));
    });
  } // table

  /**
   * BCD digits as `DrawNumberString` blanks them with the carry set: the
   * leading zeros as blanks, the last digit never.
   * @param {string} digits
   * @returns {string}
   */
  static blankZeros(digits) {
    return digits.replace(/^0+(?=\d)/, (zeros) => ' '.repeat(zeros.length));
  } // blankZeros

  /**
   * A score as the machine prints it (`DrawNumberString` with the leading
   * zeros blanked, then a trailing '0'): four BCD digits, the leading
   * zeros as blanks (the last digit always), and '0'.
   * @param {number} score - The displayed score (a multiple of 10).
   * @returns {string} Five characters.
   */
  static scoreText(score) {
    var digits = String(Math.floor(Math.max(0, score)/10)%10000).padStart(4, '0');
    return Playfield.blankZeros(digits)+'0';
  } // scoreText

  /**
   * A rank of the table (`SCORES`: one BCD byte, 2 digits, the leading
   * zero blank): ' 1'..'10'.
   * @param {number} rank - 1..10
   * @returns {string} Two characters.
   */
  static rankText(rank) {
    return Playfield.blankZeros(String(rank%100).padStart(2, '0'));
  } // rankText

  /**
   * A score at a place of the layout.
   */
  number(score, at) {
    this.text(Playfield.scoreText(score), at.x, at.y, at.scale);
  } // number

  /**
   * The reserve ships (`DrawExtraLives` $6f3e): a `LABS` at the place at
   * global scale E, then the icon's code once per ship — its trailing dark
   * vector leaves the beam 16 to the right for the next one.
   */
  lives(count, at) {
    if (!(count > 0)) {
      return;
    }
    var d = this.dvg;
    d.labs(at.x, at.y, at.scale);
    for (var i = 0; i < count; i++) {
      d.draw(this.shapes.livesIcon.code);
    }
  } // lives

  // ---------------------------------------------------------------- scenes

  /**
   * The start of the first wave as a still (AS-M3, until the game plays
   * it, AS-M4): four large rocks, the ship in the middle pointing up,
   * score 00, three ships, the copyright.
   * @param {number} [hiScore]
   * @returns {Object}
   */
  static demoState(hiScore) {
    var state = Playfield.emptyState();
    state.hiScore = hiScore || 0;
    state.objects = [
      {kind: 'ship', x: 524, y: 396, angle: 64, flame: false},   // NEWSHP: the centre of rev 4 (notes 3.1)
      {kind: 'rock', size: 4, shape: 3, x: 48, y: 608},
      {kind: 'rock', size: 4, shape: 2, x: 64, y: 320},
      {kind: 'rock', size: 4, shape: 1, x: 640, y: 48},
      {kind: 'rock', size: 4, shape: 0, x: 224, y: 96}
    ];
    return state;
  } // demoState

  /**
   * Every shape of the ROM on one screen (the attract's layout: both
   * scores): the four rocks in three sizes, the two saucers, a shot, the
   * ship at eight angles with the flame on every other one, the four
   * explosion pictures at four stages, PUSH START and the price line.
   * @param {Object} tables - data/tables.json (the messages).
   * @param {number} [hiScore]
   * @returns {Object}
   */
  static catalogueState(tables, hiScore) {
    var state = Playfield.emptyState();
    state.hiScore = hiScore || 0;
    state.players = 0;
    state.score = 12340;
    state.texts = [Playfield.message(tables, 6), Playfield.message(tables, 9)];
    var objects = [];
    [4, 2, 1].forEach((size, row) => {
      for (var shape = 0; shape < 4; shape++) {
        objects.push({kind: 'rock', size: size, shape: shape, x: 96+shape*192, y: [620, 530, 460][row]});
      }
    });
    objects.push({kind: 'saucer', size: 2, x: 880, y: 620});
    objects.push({kind: 'saucer', size: 1, x: 880, y: 530});
    objects.push({kind: 'shot', x: 880, y: 460});
    for (var i = 0; i < 8; i++) {
      objects.push({kind: 'ship', x: 64+i*128, y: 360, angle: i*32, flame: (i & 1) == 1});
    }
    [0xA4, 0xC8, 0xEC, 0xF0].forEach((status, k) => {
      objects.push({kind: 'explosion', x: 128+k*256, y: 250, status: status});
    });
    state.objects = objects;
    return state;
  } // catalogueState

} // Playfield
