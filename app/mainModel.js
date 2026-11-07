const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { ModuleWorker } = await import('./svision/js/moduleWorker.js?ver='+window.srcVersion);
const { VectorEntity } = await import('./svision/js/platform/vector/vectorEntity.js?ver='+window.srcVersion);
const { VectorTextEntity } = await import('./svision/js/platform/vector/vectorTextEntity.js?ver='+window.srcVersion);
const { DVG } = await import('./svision/js/platform/vector/atari/dvg.js?ver='+window.srcVersion);
const { GameWorker } = await import('./gameWorker.js?ver='+window.srcVersion);
const { VectorNoticeEntity } = await import('./svision/js/platform/vector/vectorNoticeEntity.js?ver='+window.srcVersion);
const { VectorDevModeEntity } = await import('./svision/js/platform/vector/vectorDevModeEntity.js?ver='+window.srcVersion);
// begin code

/**
 * The game screen. The game runs in the worker (gameWorker.js, glued out
 * of its modules by svision's ModuleWorker — the DVG interpreter of
 * svision, the playfield, the worker) at the original's frame rate and
 * sends the segments of every frame in DVG units; this model draws them
 * white on the black screen through `DVG.appendTo` (DVG y up, 128..895 ->
 * desktop y down, 0..767), routes the controls to the worker and reacts to
 * the end of the game. The seed of the game's randomness goes to
 * the worker with `init` from the first day.
 *
 * The end of a game (AS-M6) is the machine's own sequence, played by the
 * game itself: GAME OVER, the initials when the score makes the table
 * and no player name is set, the table, then `gameOverDone` brings the
 * menu back. The score goes to the server as soon as its name is known
 * (`gameOver` with a name, or `initials`); an Escape during the initials
 * saves what was entered. On the initials screen rotate and hyperspace
 * work as on the machine; the keyboard's letters and digits set the
 * letter and Enter takes it (`letter` to the worker).
 *
 * Controls (ZADANI chap. 5): rotate left/right, thrust, fire, hyperspace
 * — keyboard and gamepad map to these actions; a touch is mapped by the
 * zone of the screen it is in (`touchAction`: the left half rotates, its
 * left quarter left and its right quarter right; the right half has
 * thrust above and fire / hyperspace below), follows the finger between
 * zones, and the actions sent are the union of all touches. Escape returns
 * to the menu; losing the window's focus pauses the game behind a notice.
 *
 * Sound (AS-M7): the game opens the buses of `audioManager.js` here (the
 * menu is silent, R-024); the attract is silent too (`INIT1` turns every
 * latch off, notes 10.1). The frames' `sounds` go through `playSounds`:
 * a bus is a circuit of the board, a new trigger cuts what it plays; the
 * thrust and the saucer are loops started and stopped by the edges of
 * their latch bits (`thrustOn`/`thrustOff`, `saucerLarge`/`saucerSmall`/
 * `saucerOff`); `soundsOff` (the end of the game) stops everything. A
 * pause cuts the samples and the loops, a continue restarts the loops
 * still asked for.
 */
export class MainModel extends AbstractModel {

  /** the modules the worker is glued from, in dependency order (also config/compile.json `standalone`) */
  static get WORKER_SOURCES() {
    return [
      'svision/js/platform/vector/atari/avg.js',
      'svision/js/platform/vector/atari/dvg.js',
      'playfield.js',
      'game.js',
      'gameWorker.js'
    ];
  } // WORKER_SOURCES

  /** the DVG's visible area as the game uses it (notes 2.1): y 128..895, up */
  static get DVG_Y_TOP() { return 895; }

  /**
   * @param {GameApp} app
   * @param {boolean} attract - The attract mode: no player, returns to the menu on its own.
   */
  constructor(app, attract) {
    super(app);
    this.id = 'MainModel';
    this.attract = attract;
    this.sceneEntity = null;
    this.fpsEntity = null;
    this.ready = false;
    this.active = false;            // between init and shutdown
    this.frame = null;              // the last frame message
    this.drawnTick = -1;
    this.gameOver = false;
    this.fps = {frames: 0, workerFrames: 0, since: false};
    this.touches = {};              // identifier -> action
    this.touchActions = {left: false, right: false, thrust: false, fire: false, hyperspace: false};
    this.screen = 'game';           // the screen of the last frame: 'game', 'initials', 'table'
    this.initials = false;          // the initials of the last frame, {letters, index}
    this.pendingScore = false;      // a score waiting for its initials, or false
    this.loops = {saucer: false, thrust: false};   // the loops the latches hold on: the sample's name, or false
  } // constructor

  init() {
    super.init();
    this.active = true;

    this.desktopEntity.bkColor = false;
    var w = this.desktopWidth, h = this.desktopHeight;

    // the picture: white. Not clipped to the desktop: the DVG clips to its
    // counters itself, and a line on the very edge of the screen keeps its
    // full width
    this.sceneEntity = new VectorEntity(this.desktopEntity, 0, 0, w, h, '#ffffff', false);
    this.sceneEntity.clipsList = false;
    this.desktopEntity.addEntity(this.sceneEntity);

    if (this.app.devModeName !== false) {
      this.fpsEntity = new VectorTextEntity(this.desktopEntity, w-200, h-24, 190, 12, VectorDevModeEntity.COLOR, false, '', {size: 12, align: 'right', intensity: 8});
      this.fpsEntity.layer = 'top';
      this.desktopEntity.addEntity(this.fpsEntity);
      this.desktopEntity.addEntity(new VectorDevModeEntity(this.desktopEntity));
    }

    this.app.inputEventsManager.sendEventsActiveKeys('Press');
    this.openAudio();
    this.startWorker(this.app.gameData());
  } // init

  shutdown() {
    super.shutdown();
    this.active = false;
    this.sendWorkerMessage({id: 'reset'});
    this.sendEvent(0, {id: 'stopAllAudioBuses'});
  } // shutdown

  // ------------------------------------------------------------------- sound

  /**
   * Whether this game makes a sound: not the attract mode, and there is a
   * manager (the stand-in application of the tools has none).
   * @returns {boolean}
   */
  hasAudio() {
    return !this.attract && !!this.app.audioManager;
  } // hasAudio

  /**
   * Opens the buses of the board, one per circuit.
   */
  openAudio() {
    if (!this.hasAudio()) {
      return;
    }
    this.app.audioManager.constructor.effectBuses.forEach((bus) => {
      this.sendEvent(0, {id: 'openAudioBus', bus: bus, options: {muted: this.app.muted.sounds}});
    });
    this.loops = {saucer: false, thrust: false};
  } // openAudio

  /**
   * Starts the loops the latches still hold on — after a pause.
   */
  restartLoops() {
    if (this.loops.saucer) {
      this.sendEvent(0, {id: 'playSound', bus: 'saucer', sound: this.loops.saucer, options: {repeat: true}});
    }
    if (this.loops.thrust) {
      this.sendEvent(0, {id: 'playSound', bus: 'thrust', sound: this.loops.thrust, options: {repeat: true}});
    }
  } // restartLoops

  /**
   * Stops every bus and forgets the loops.
   */
  silence() {
    this.sendEvent(0, {id: 'stopAllAudioBuses'});
    this.loops = {saucer: false, thrust: false};
  } // silence

  /**
   * The sounds a frame started (WORKER-PROTOCOL.md), onto the buses: a
   * one-shot restarts its circuit, the edges start and stop the loops,
   * `soundsOff` is `INIT1`.
   * @param {string[]} names
   */
  playSounds(names) {
    if (!this.hasAudio()) {
      return;
    }
    var play = (bus, sound, options) => this.sendEvent(0, {id: 'playSound', bus: bus, sound: sound, options: options || false});
    var stop = (bus) => this.sendEvent(0, {id: 'stopAudioBus', bus: bus});
    names.forEach((name) => {
      switch (name) {
        case 'soundsOff':
          this.silence();
          break;
        case 'thumpHigh':
        case 'thumpLow':
          play('thump', name);
          break;
        case 'fire':
          play('fire', 'fire');
          break;
        case 'saucerFire':
          play('saucerFire', 'saucerFire');
          break;
        case 'extraLife':
          play('life', 'extraLife');
          break;
        case 'thrustOn':
          this.loops.thrust = 'thrust';
          play('thrust', 'thrust', {repeat: true});
          break;
        case 'thrustOff':
          this.loops.thrust = false;
          stop('thrust');
          break;
        case 'saucerLarge':
        case 'saucerSmall':
          this.loops.saucer = name;
          play('saucer', name, {repeat: true});
          break;
        case 'saucerOff':
          this.loops.saucer = false;
          stop('saucer');
          break;
        default:
          if (name.substring(0, 9) == 'explosion') {
            play('explosion', name);               // the last byte written wins, as on the board
          }
      }
    });
  } // playSounds

  // ------------------------------------------------------------------ worker

  /**
   * Takes the app's worker (`createWorker`: built once, shared with the
   * menu's backdrop) and starts the game in it.
   * @param {Object} data - The ROM data (`{shapes, font, tables}` from data/*.json).
   */
  startWorker(data) {
    this.app.createWorker().then((worker) => {
      if (!this.active) {
        return;                       // the model was left before the worker came up
      }
      worker.onmessage = (event) => this.handleWorkerMessage(event);
      worker.onerror = (event) => this.app.showErrorMessage('game worker: '+event.message, 'restart');
      this.ready = true;
      this.sendWorkerMessage({id: 'init', seed: this.app.gameSeed(), data: data, attract: this.attract, hiScore: this.app.hiScore || 0,
        hiScores: this.app.hallOfFame && this.app.hallOfFame.length ? this.app.hallOfFame : undefined, playerName: this.app.playerName || ''});
    }).catch((error) => this.app.showErrorMessage(error.message, 'restart'));
  } // startWorker

  sendWorkerMessage(event) {
    if (this.app.worker && this.ready) {
      this.app.worker.postMessage(event);
    }
  } // sendWorkerMessage

  handleWorkerMessage(event) {
    var data = event.data;
    switch (data.id) {
      case 'frame':
        this.frame = data;
        this.fps.workerFrames++;
        this.app.score = data.score;
        this.screen = data.screen || 'game';
        this.initials = data.initials || false;
        if (data.sounds.length) {
          this.sendEvent(0, {id: 'gameSounds', sounds: data.sounds});
        }
        break;
      case 'gameOver':
        // the frame after the last explosion: the score is known, its name maybe
        this.gameOver = true;
        this.app.score = data.score;
        if (!this.attract) {
          if (data.name) {
            this.app.saveScore(data.name, data.score);
          } else if (data.name === false) {
            this.pendingScore = data.score;       // the initials are being asked for
          }
        }
        break;
      case 'initials':
        if (this.pendingScore !== false) {
          this.app.saveScore(data.name, this.pendingScore);
          this.pendingScore = false;
        }
        break;
      case 'gameOverDone':
        this.sendEvent(0, {id: 'exitGame'});
        break;
    }
  } // handleWorkerMessage

  /**
   * A score still waiting for its initials when the player leaves: what was
   * entered goes in (the machine keeps it too, on its timeout).
   */
  savePendingScore() {
    if (this.pendingScore === false) {
      return;
    }
    var name = this.initials ? String(this.initials.letters).trim() : '';
    this.app.saveScore(name, this.pendingScore);
    this.pendingScore = false;
  } // savePendingScore

  /**
   * Puts the last frame into the scene's display list, once per frame:
   * DVG units to the desktop, y = 895 - y (`DVG.appendTo`; a dot of the
   * DVG — a shot — is a short wide line there).
   */
  drawFrame() {
    if (!this.frame || this.frame.tick == this.drawnTick) {
      return;
    }
    this.drawnTick = this.frame.tick;
    var l = this.sceneEntity.list;
    l.clear();
    DVG.appendTo(l, GameWorker.unpack(this.frame.segments), MainModel.DVG_Y_TOP, {strokeWidth: 1.5});
  } // drawFrame

  // ---------------------------------------------------------------- controls

  /**
   * A key of the keyboard or gamepad mapped to a game action.
   * @param {string} key
   * @returns {string|false}
   */
  actionOfKey(key) {
    var k = key.length == 1 ? key.toUpperCase() : key;
    var kb = this.app.controls.keyboard;
    var actions = ['left', 'right', 'thrust', 'fire', 'hyperspace'];
    for (var i = 0; i < actions.length; i++) {
      if (kb[actions[i]] === k) {
        return actions[i];
      }
    }
    switch (key) {
      case 'Shift': return 'hyperspace';
      case 'GamepadLeft': return 'left';
      case 'GamepadRight': return 'right';
      case 'GamepadUp': return 'thrust';
      case 'GamepadDown': return 'hyperspace';
      case 'GamepadJump':
      case 'GamepadOK': return 'fire';
    }
    return false;
  } // actionOfKey

  /**
   * The action of the zone a touch is in (ZADANI chap. 5): the left half
   * of the screen rotates — its left quarter left, its right quarter
   * right —, the upper half of the right half is thrust, the lower half
   * fire on the left and hyperspace on the right.
   * @param {Object} event - With x, y in desktop units.
   * @returns {string}
   */
  touchAction(event) {
    var w = this.desktopWidth, h = this.desktopHeight;
    if (event.x < w/2) {
      return event.x < w/4 ? 'left' : 'right';
    }
    if (event.y < h/2) {
      return 'thrust';
    }
    return event.x < w*3/4 ? 'fire' : 'hyperspace';
  } // touchAction

  /**
   * Sends the actions as the touches hold them — only the ones that changed.
   */
  sendTouches() {
    var held = {left: false, right: false, thrust: false, fire: false, hyperspace: false};
    Object.keys(this.touches).forEach((id) => {
      held[this.touches[id]] = true;
    });
    Object.keys(held).forEach((action) => {
      if (held[action] != this.touchActions[action]) {
        this.touchActions[action] = held[action];
        this.sendWorkerMessage({id: 'controls', action: action, value: held[action]});
      }
    });
  } // sendTouches

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }
    switch (event.id) {
      case 'gameSounds':
        this.playSounds(event.sounds);
        return true;

      case 'blurWindow':
        this.pauseGame();
        return true;

      case 'continueGame':
        this.sendWorkerMessage({id: 'continue'});
        if (this.hasAudio()) {
          this.sendEvent(0, {id: 'continueAllAudioBuses'});
          this.restartLoops();
        }
        return true;

      case 'errorAudioBus':
        this.app.showErrorMessage(event.error, 'ignore');
        return true;

      case 'keyPress':
        if (event.key == 'Escape' || event.key == 'GamepadExit') {
          this.sendEvent(0, {id: 'exitGame'});
          return true;
        }
        if (event.key == 'Touch') {
          this.touches[event.identifier] = this.touchAction(event);
          // bound to an entity, so the input manager reports the touch's moves
          this.app.inputEventsManager.touchesMap[event.identifier] = this.sceneEntity;
          this.sendTouches();
          return true;
        }
        if (event.key == 'RetryTouch') {
          return true;
        }
        var k = event.key.length == 1 ? event.key.toUpperCase() : event.key;
        if (k == this.app.controls.keyboard.sounds && this.app.audioManager) {
          this.app.muted.sounds = !this.app.muted.sounds;
          this.sendEvent(0, {id: 'muteAudioBus', bus: 'sounds', muted: this.app.muted.sounds});
          return true;
        }
        if (this.screen == 'initials' && (k == 'Enter' || (k.length == 1 && /[A-Z0-9]/.test(k)))) {
          this.sendWorkerMessage({id: 'letter', key: k});
          return true;
        }
        var action = this.actionOfKey(event.key);
        if (action) {
          this.sendWorkerMessage({id: 'controls', action: action, value: true});
          return true;
        }
        break;

      case 'keyMove':
        if (event.key == 'Touch' && (event.identifier in this.touches)) {
          this.touches[event.identifier] = this.touchAction(event);
          this.sendTouches();
          return true;
        }
        break;

      case 'keyRelease':
        if (event.key == 'Touch') {
          delete this.touches[event.identifier];
          this.sendTouches();
          return true;
        }
        if (event.key == 'RetryTouch') {
          this.touches = {};
          this.sendTouches();
          return true;
        }
        var released = this.actionOfKey(event.key);
        if (released) {
          this.sendWorkerMessage({id: 'controls', action: released, value: false});
          return true;
        }
        break;

      case 'exitGame':
        this.savePendingScore();
        this.app.setModel('MenuModel');
        return true;
    }
    return false;
  } // handleEvent

  /**
   * Pauses the worker behind a notice; Enter continues.
   */
  pauseGame() {
    if (this.desktopEntity.modalEntity || this.gameOver || !this.ready) {
      return;
    }
    this.sendWorkerMessage({id: 'pause'});
    if (this.hasAudio()) {
      this.sendEvent(0, {id: 'pauseAllAudioBuses'});   // the samples stop, the loops with them; a continue restarts the loops
    }
    var w = this.desktopWidth, h = this.desktopHeight;
    this.desktopEntity.addModalEntity(new VectorNoticeEntity(this.desktopEntity, (w-480)/2, (h-200)/2, 480, 200, 'PAUSED', ['THE GAME WAITS'], {id: 'continueGame'}, '#ffffff'));
  } // pauseGame

  /**
   * Dev-mode indicator "xx/yy FPS": frames drawn a second and 'frame'
   * messages from the worker a second (the fixed 61.5 Hz game tick).
   */
  updateFps(timestamp) {
    if (!this.fpsEntity) {
      return;
    }
    this.fps.frames++;
    if (this.fps.since === false) {
      this.fps.since = timestamp;
      return;
    }
    var elapsed = timestamp-this.fps.since;
    if (elapsed >= 1000) {
      var draw = Math.round(this.fps.frames*1000/elapsed);
      var worker = Math.round(this.fps.workerFrames*10000/elapsed)/10;
      var ticks = Math.round(this.fps.ticks*10000/elapsed)/10;
      this.fpsEntity.setText(draw+'/'+worker+'/'+ticks+' FPS');
      this.fps.frames = 0;
      this.fps.workerFrames = 0;
      this.fps.since = timestamp;
    }
  } // updateFps

  loopModel(timestamp) {
    super.loopModel(timestamp);
    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    }
    this.drawFrame();
    this.updateFps(timestamp);
    this.drawModel();
  } // loopModel

} // MainModel
