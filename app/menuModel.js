const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { VectorEntity } = await import('./svision/js/platform/vector/vectorEntity.js?ver='+window.srcVersion);
const { VectorTextEntity } = await import('./svision/js/platform/vector/vectorTextEntity.js?ver='+window.srcVersion);
const { DVG } = await import('./svision/js/platform/vector/atari/dvg.js?ver='+window.srcVersion);
const { GameWorker } = await import('./gameWorker.js?ver='+window.srcVersion);
const { VectorMenuEntity } = await import('./svision/js/platform/vector/vectorMenuEntity.js?ver='+window.srcVersion);
const { VectorVolumeEntity } = await import('./svision/js/platform/vector/vectorVolumeEntity.js?ver='+window.srcVersion);
const { VectorNameEntity } = await import('./svision/js/platform/vector/vectorNameEntity.js?ver='+window.srcVersion);
const { VectorHallOfFameEntity } = await import('./svision/js/platform/vector/vectorHallOfFameEntity.js?ver='+window.srcVersion);
const { VectorNoticeEntity } = await import('./svision/js/platform/vector/vectorNoticeEntity.js?ver='+window.srcVersion);
const { VectorDevModeEntity } = await import('./svision/js/platform/vector/vectorDevModeEntity.js?ver='+window.srcVersion);
const { VectorFontCatalogueEntity } = await import('./svision/js/platform/vector/vectorFontCatalogueEntity.js?ver='+window.srcVersion);
const { VectorFont4x6 } = await import('./svision/js/platform/vector/vectorFont4x6.js?ver='+window.srcVersion);
// begin code

/**
 * Main menu (ZADANI chap. 3): the structure of Manic Miner and Battlezone
 * — START GAME, PLAYER NAME, HALL OF FAME, SOUNDS, SETTINGS, ABOUT GAME —
 * drawn as vectors: the title, the menu rows as VectorTextEntity polylines
 * between the brackets of VectorMenuEntity and the version (the copyright
 * is in ABOUT GAME). White on black, as the monitor of the cabinet; the
 * selection is the brighter row. Nothing from canvas2D/ (R-031 point 5).
 *
 * The menu never opens the audio buses (R-024): `init` closes them all, and
 * START GAME asks for the browser's gesture first (a notice; Escape means
 * not now) when the input manager has none fresh enough — once there is a
 * sound (AS-M7); until then it starts the game at once. There is no
 * ATTRACT MODE row (as in Battlezone), but the attract of the machine runs
 * behind the menu as its backdrop (2026-11-07): the game worker in the
 * attract with `backdrop` — the rocks fly and the saucer comes as on the
 * cabinet showing 1 COIN 1 PLAY, with no texts, no table and no sound —
 * and its frames are drawn under the title and the rows the way MainModel
 * draws the game (`DVG.appendTo`). The worker is the app's (`createWorker`),
 * the game takes it over with its own `init`.
 *
 * START GAME opens the game (MainModel); PLAYER NAME opens the name dialog
 * of the vector platform (an empty name is allowed: the game then asks for
 * the initials the way the machine does, AS-M6), HALL OF FAME the server's
 * list, SOUNDS the volume dialog (its sample a large rock's explosion,
 * AS-M7); SETTINGS (AS-M8) shows a notice naming the milestone that brings
 * it. The whole screen has a fingerprint under Node (tools/regress.mjs).
 */
export class MenuModel extends AbstractModel {

  /** the title: its top and the height of its capitals, shared with BootModel */
  static get TITLE_Y() { return 64; }
  /** the DVG's visible area as the game uses it (notes 2.1): y 128..895, up — as MainModel */
  static get DVG_Y_TOP() { return 895; }
  static get TITLE_SIZE() { return 72; }
  static get TITLE_COLOR() { return '#ffffff'; }
  /** the credit up the left edge: the text of Bobby Bearing, the capital height, the column's width and its distance from the edges */
  static get CREDIT() { return {text: 'REMAKE BY L. MITRENGA\nCC BY-NC-SA 4.0', size: 21, width: 54, x: 12, y: 64}; }

  /**
   * The title as it stands over the menu: the text in the menu font
   * (AS-M3 may put the ROM's glyphs here) — BootModel makes the same one
   * in the middle of the screen and glides it into this place, so the two
   * screens meet without a jump.
   * @param {AbstractEntity} parentEntity - The desktop.
   * @param {number} y - The top of the title.
   * @param {string} title
   * @returns {VectorEntity}
   */
  static newTitleEntity(parentEntity, y, title) {
    var model = parentEntity.model;
    return new VectorTextEntity(parentEntity, 0, y, model.desktopWidth, MenuModel.TITLE_SIZE, MenuModel.TITLE_COLOR, false, title, {font: model.app.fonts.vector, size: MenuModel.TITLE_SIZE, spacing: 1, align: 'center'});
  } // newTitleEntity

  /**
   * @param {GameApp} app
   * @param {number} selectionItem - The row selected at start.
   */
  constructor(app, selectionItem) {
    super(app);
    this.id = 'MenuModel';
    this.sceneEntity = null;        // the backdrop: the attract's frames
    this.frame = null;              // the last frame message of the backdrop
    this.drawnTick = -1;
    this.workerReady = false;       // the worker took the backdrop's init
    this.active = false;            // between init and shutdown

    this.menuItems = [
      {t1: 'START GAME', event: {id: 'startGame'}},
      {t1: 'PLAYER NAME', event: {id: 'setPlayerName'}},
      {t1: 'HALL OF FAME', event: {id: 'showHallOfFame'}},
      {t1: 'SOUNDS', event: {id: 'setSounds'}},
      {t1: 'SETTINGS', event: {id: 'setSettings'}},
      {t1: 'ABOUT GAME', event: {id: 'showAbout'}},
      {t1: 'FONT GLYPHS', event: {id: 'showFontGlyphs'}}   // TEMPORARY: font work (AtariVectorFont lower case), remove when done
    ];
    this.color = '#ffffff';           // the monitor is black and white, no overlay
    this.titleColor = MenuModel.TITLE_COLOR;
    this.menuOptions = {
      font: this.app.fonts.vector,
      size: 28,
      spacing: 0.5,
      leftMargin: 0,
      rightMargin: 0,
      topMargin: 0,
      itemHeight: 40,
      itemPitch: 52,
      t2Width: 240,
      textColor: this.color,
      intensity: 9,
      selectionIntensity: 15,
      bracketWidth: 16,
      selection: selectionItem || 0
    };
    // where a notice of the menu sits
    this.notice = {x: 192, y: 160, width: 640, height: 300};

    this.titleEntity = null;
    this.menuEntity = null;
    this.versionEntity = null;
    this.newVersionAvailable = false;
  } // constructor

  init() {
    super.init();
    this.active = true;

    this.desktopEntity.bkColor = false;
    var w = this.desktopWidth, h = this.desktopHeight;

    // the backdrop first, under everything: white, not clipped (as the game's scene)
    this.sceneEntity = new VectorEntity(this.desktopEntity, 0, 0, w, h, '#ffffff', false);
    this.sceneEntity.clipsList = false;
    this.desktopEntity.addEntity(this.sceneEntity);

    // the menu is silent (R-024); the stand-in application of the tools has no manager
    if (this.app.audioManager) {
      this.sendEvent(0, {id: 'closeAllAudioBuses'});
    }

    this.titleEntity = MenuModel.newTitleEntity(this.desktopEntity, MenuModel.TITLE_Y, this.app.title);
    this.desktopEntity.addEntity(this.titleEntity);

    this.menuEntity = new VectorMenuEntity(this.desktopEntity, 192, 308, 640, 8*52, false, this.menuOptions, this, this.getMenuData);   // 28 (a row's capital) lower since 2026-11-07, the credit along
    this.desktopEntity.addEntity(this.menuEntity);

    this.versionEntity = new VectorTextEntity(this.desktopEntity, w-320, h-116, 300, 18, this.color, false, 'V'+this.app.version, {font: this.app.fonts.vector, size: 18, align: 'right', intensity: 8});
    // the credit up the left edge (the text of Bobby Bearing): three quarters of the menu's size, the menu's stroke, dim; it starts
    // level with the bottom edge of the ABOUT GAME text and runs upwards
    var c = MenuModel.CREDIT, m = this.menuOptions;
    var aboutBottom = this.menuEntity.y+this.menuEntity.rowY(this.menuItems.findIndex(i => i.t1 == 'ABOUT GAME'))+(m.itemHeight-m.size)/2+m.size;
    this.desktopEntity.addEntity(new VectorTextEntity(this.desktopEntity, c.x, c.y, c.width, aboutBottom-c.y, this.color, false, c.text, {font: this.app.fonts.vector, size: c.size, strokeWidth: m.size/10, lineSpacing: 4, align: 'left', intensity: 7, rotation: 90}));
    this.desktopEntity.addEntity(this.versionEntity);
    this.checkServerVersion();
    if (this.app.devModeName !== false) {
      this.desktopEntity.addEntity(new VectorDevModeEntity(this.desktopEntity));
    }
    this.startBackdrop(this.app.gameData());
  } // init

  shutdown() {
    super.shutdown();
    this.active = false;
    if (this.workerReady) {
      this.app.worker.postMessage({id: 'reset'});
    }
  } // shutdown

  // ---------------------------------------------------------------- backdrop

  /**
   * Starts the attract in the app's worker as the backdrop (`backdrop`: the
   * objects alone). A worker that cannot be built leaves the menu without
   * it — the game reports the error when it needs it.
   * @param {Object} data - The ROM data (`{shapes, font, tables}` from data/*.json).
   */
  startBackdrop(data) {
    if (!data || !data.shapes || !data.font || !data.tables) {
      return;
    }
    this.app.createWorker().then((worker) => {
      if (!this.active) {
        return;                       // the menu was left before the worker came up
      }
      worker.onmessage = (event) => this.handleWorkerMessage(event);
      worker.onerror = (event) => console.error('game worker: '+event.message);
      this.workerReady = true;
      worker.postMessage({id: 'init', seed: this.app.gameSeed(), data: data, attract: true, backdrop: true, hiScore: 0});
    }).catch((error) => console.error(error.message));
  } // startBackdrop

  handleWorkerMessage(event) {
    if (event.data.id == 'frame') {
      this.frame = event.data;      // the sounds go unheard: the menu is silent (R-024)
    }
  } // handleWorkerMessage

  /**
   * The last frame of the backdrop into the scene, once per frame, as
   * MainModel.drawFrame draws the game.
   */
  drawFrame() {
    if (!this.frame || this.frame.tick == this.drawnTick) {
      return;
    }
    this.drawnTick = this.frame.tick;
    var l = this.sceneEntity.list;
    l.clear();
    DVG.appendTo(l, GameWorker.unpack(this.frame.segments), MenuModel.DVG_Y_TOP, {strokeWidth: 1.5});
  } // drawFrame

  /**
   * Asks the server for its version; a newer one turns the version line
   * into UPGRADE !, which reloads the application when chosen.
   */
  checkServerVersion() {
    // a dedicated receiver, so the request does not clash with the model's own fetch
    var receiver = {
      id: this.id+'Version',
      fetchDataId: '',
      setData: (data) => {
        if (data.data.version && data.data.version !== 'unknown' && data.data.version !== this.app.version) {
          this.newVersionAvailable = true;
          this.versionEntity.setText('UPGRADE !');
          this.versionEntity.setIntensity(15);
        }
      },
      errorData: () => {}
    };
    receiver.fetchDataId = this.app.fetchData('version.db', false, {}, receiver);
  } // checkServerVersion

  getMenuData(self, key, row) {
    switch (key) {

      case 'numberOfItems':
        return self.menuItems.length;

      case 't2':
        switch (row) {
          case 1:
            return self.app.playerName;
          case 3:
            return self.app.audioManager ? VectorVolumeEntity.levelText(self.app.audioManager.volume.sounds) : '';
        }
        break;

      default:
        if (key in self.menuItems[row]) {
          return self.menuItems[row][key];
        }
        break;

    }
    return '';
  } // getMenuData

  /**
   * Opens a notice over the menu.
   * @param {string} title
   * @param {string[]} lines
   * @param {Object|false} [continueEvent] - Sent to the model when the notice closes.
   * @param {Object} [options] - VectorNoticeEntity's options (`escapeCancels`, `hint`); `offsetY` moves the box.
   */
  openNotice(title, lines, continueEvent, options) {
    var n = this.notice;
    // the box grows with the text (title band 76, a line every 34, "PRESS ENTER" band 64); a taller
    // box sits lower, its top moves down by half the growth
    var height = Math.max(n.height, 76+lines.length*34+64);
    var y = n.y+((height-n.height) >> 1)+((options && options.offsetY) || 0);
    this.desktopEntity.addModalEntity(new VectorNoticeEntity(this.desktopEntity, n.x, y, n.width, height, title, lines, continueEvent || false, this.color, undefined, options));
  } // openNotice

  /**
   * The browser's gesture for audio before the game: the notice asks for
   * Enter, a click or a tap (which the input manager records as the
   * gesture) and then sends `continueEvent`; Escape closes it without.
   * @param {string} continueEvent - The event's id.
   * @returns {boolean} True when the notice was opened, false when no gesture is needed.
   */
  waitForAudioGesture(continueEvent) {
    if (!this.app.audioManager || !this.app.inputEventsManager.needEventForAudio()) {
      return false;
    }
    this.openNotice('SOUND', ['THE BROWSER STARTS THE AUDIO', 'ONLY AFTER A KEY OR A TAP'], {id: continueEvent}, {escapeCancels: true, hint: 'PRESS ENTER - ESC FOR SILENCE'});
    return true;
  } // waitForAudioGesture

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {
      case 'startGame':
        if (this.waitForAudioGesture('startGame2')) {
          return true;
        }
      case 'startGame2':
        this.app.startGame(false);
        return true;

      case 'setPlayerName':
        var nn = this.notice;
        this.desktopEntity.addModalEntity(new VectorNameEntity(this.desktopEntity, nn.x, nn.y, nn.width, nn.height,
          {title: 'PLAYER NAME', prompt: 'ENTER YOUR NAME - EMPTY FOR INITIALS', color: this.color, font: this.app.fonts.vector, maxLength: 12}));
        return true;

      case 'showHallOfFame':
        var nh = this.notice;
        this.desktopEntity.addModalEntity(new VectorHallOfFameEntity(this.desktopEntity, nh.x, 160, nh.width, 500,
          {title: 'HALL OF FAME', color: this.color, font: this.app.fonts.vector}));
        return true;

      case 'setSounds':
        if (!this.app.audioManager) {
          this.openNotice('SOUNDS', ['NO AUDIO IN THIS BUILD']);
          return true;
        }
        var n = this.notice;
        // two menu rows (and 10 units) lower than the notices; the sample is a large rock's explosion
        this.desktopEntity.addModalEntity(new VectorVolumeEntity(this.desktopEntity, n.x, n.y+114, n.width, n.height, 'sounds', 'audioBusSoundsLevel', 'explosion3F',
          {title: 'SOUNDS VOLUME', color: this.color, font: this.app.fonts.vector, sampleBus: 'explosion'}));
        return true;

      case 'setSettings':
        this.openNotice('SETTINGS', ['NOT IN THIS BUILD', 'COMES WITH AS-M8']);
        return true;

      case 'showAbout':
        // one menu row (and a unit) lower than the other notices
        this.openNotice('ABOUT GAME', ['ASTEROIDS', 'ORIGINAL BY ATARI 1979', 'REMAKE ON SVISION', 'VECTOR PLATFORM'].concat(this.app.copyright.split(', ')), false, {offsetY: 54});
        return true;

      case 'showFontGlyphs':
        // TEMPORARY (font work): printable ASCII and what is above it in the library's 4x6 font and in
        // the menu font (AtariVectorFont) side by side, glyph - glyph, down the columns; the box is sized by
        // the character count (97 characters = 9 columns of 12, 918 wide), the box nearly the whole screen
        this.desktopEntity.addModalEntity(new VectorFontCatalogueEntity(this.desktopEntity, 16, 24, this.desktopWidth-32, [new VectorFont4x6(), this.app.fonts.vector], this.color));
        return true;

      case 'keyRelease':
        // the version line is a button: a click or a tap on it upgrades
        if ((event.key == 'Mouse1' || event.key == 'Touch') && this.newVersionAvailable && this.versionEntity.pointOnEntity(event)) {
          this.app.upgradeApp();
          return true;
        }
        break;
    }

    return false;
  } // handleEvent

  loopModel(timestamp) {
    super.loopModel(timestamp);

    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    } else if (this.menuEntity) {
      this.menuEntity.loopEntity(timestamp);
    }

    this.drawFrame();
    this.drawModel();
  } // loopModel

} // MenuModel
