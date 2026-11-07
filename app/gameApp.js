const { Version } = await import('./version.js?ver='+window.srcVersion);
const { AbstractApp } = await import('./svision/js/abstractApp.js?ver='+window.srcVersion);
const { AtariVectorFont } = await import('./svision/js/platform/vector/atari/atariVectorFont.js?ver='+window.srcVersion);
const { BootModel } = await import('./bootModel.js?ver='+window.srcVersion);
const { MenuModel } = await import('./menuModel.js?ver='+window.srcVersion);
const { MainModel } = await import('./mainModel.js?ver='+window.srcVersion);
const { VectorNoticeEntity } = await import('./svision/js/platform/vector/vectorNoticeEntity.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { AudioManager } = await import('./audioManager.js?ver='+window.srcVersion);
const { ModuleWorker } = await import('./svision/js/moduleWorker.js?ver='+window.srcVersion);
// begin code

/**
 * Asteroids application shell (AS-M2 skeleton, the shape of Battlezone's).
 * The structure follows the Manic Miner kernel: LoadingModel (BootModel)
 * -> MenuModel -> MainModel (the game). There is no GameOverModel: the end
 * of a game — the initials, the high score table — is the machine's own
 * program, played by the game in the worker (AS-M6); MainModel saves the
 * score (`saveScore`) and comes back to the menu. Built on the vector
 * platform from the start (R-031): no canvas, no raster fonts, nothing of
 * canvas2D/.
 *
 * The game worker is built once (`createWorker`) and kept on `this.worker`,
 * shared by the menu's backdrop and the game; the
 * seed of its randomness is `gameSeed()` (the clock, or `?devSeed=N` in dev
 * mode). The sound is `audioManager.js` over `soundBoard.js` (AS-M7),
 * opened by the game (the menu never opens audio, R-024). Not here yet:
 * the settings (AS-M8). The font of the menu and
 * the dialogs is the ROM's (svision's `AtariVectorFont`). The hall of fame (`hallOfFame`, the ten best of the server, one
 * per name) comes with appData.db and after every saved game.
 */
export class GameApp extends AbstractApp {

  constructor(platform, importPath, wsURL, devModeName, appIconSprite) {
    super(platform, 'bodyApp', importPath, wsURL);

    this.version = Version;
    this.title = 'ASTEROIDS';
    this.copyright = '© 2026 L. MITRENGA, CC BY-NC-SA 4.0';
    this.devModeName = devModeName;
    this.appIconSprite = appIconSprite;

    this.audioManager = new AudioManager(this);
    this.muted = {sounds: false};      // no music bus: the original has none

    // the vector font of the menu and the dialogs: the glyphs of Atari's vector ROMs plus the
    // remakes' punctuation and lower case, one table shared with Battlezone (R-063)
    this.fonts = {
      vector: new AtariVectorFont()
    };

    // the panel of the cabinet (ZADANI chap. 5): rotate left/right, thrust,
    // fire, hyperspace. The touch layout is decided in AS-M4, its icons in AS-M8
    this.controlsOptions = {
      keyboard: {
        device: 'keyboard',
        keys: [
          {action: 'left', label: 'ROTATE LEFT'},
          {action: 'right', label: 'ROTATE RIGHT'},
          {action: 'thrust', label: 'THRUST'},
          {action: 'fire', label: 'FIRE'},
          {action: 'hyperspace', label: 'HYPERSPACE'},
          {action: 'sounds', label: 'MUTE SOUNDS'}
        ]
      },
      mouse: {
        device: 'mouse',
        keys: [
          {action: 'fire', label: 'FIRE'}
        ]
      },
      gamepads: {
        device: 'gamepads',
        keys: [
          {action: 'left', label: 'ROTATE LEFT', eventKey: 'GamepadLeft'},
          {action: 'right', label: 'ROTATE RIGHT', eventKey: 'GamepadRight'},
          {action: 'thrust', label: 'THRUST', eventKey: 'GamepadUp'},
          {action: 'fire', label: 'FIRE', eventKey: 'GamepadJump'},
          {action: 'hyperspace', label: 'HYPERSPACE', eventKey: 'GamepadDown'},
          {action: 'up', label: 'MENU UP', eventKey: 'GamepadUp'},
          {action: 'down', label: 'MENU DOWN', eventKey: 'GamepadDown'},
          {action: 'ok', label: 'OK', eventKey: 'GamepadOK'},
          {action: 'exit', label: 'EXIT', eventKey: 'GamepadExit'}
        ]
      },
      touchscreen: {
        device: 'touchscreen',
        types: {
          keys: ['zones'],
          // the halves of the screen rotate, buttons thrust / fire /
          // hyperspace — the layout is AS-M4 (ZADANI chap. 5)
          zones: {}
        },
        icons: {}
      }
    };

    this.controls = {
      keyboard: this.getControls('keyboard'),
      mouse: this.getControls('mouse'),
      touchscreen: this.getControls('touchscreen'),
      gamepads: this.getControls('gamepads')
    };

    this.attract = false;
    this.lives = 3;
    this.score = 0;
    this.hiScore = false;
    this.hallOfFame = [];              // [{name, score}] from best down, the server's ten
    this.playerName = Tool.readCookie('playerName', '');
    this.globalData = false;
    this.id = 'GameApp';
    this.fetchDataId = '';
    this.setModel('LoadingModel');
    this.loadAppData();
  } // constructor

  getControls(device) {
    var result = {};

    switch (device) {
      case 'keyboard':
        result = {left: 'ArrowLeft', right: 'ArrowRight', thrust: 'ArrowUp', fire: ' ', hyperspace: 'ArrowDown', sounds: 'N'};
        break;
      case 'mouse':
        result = {enable: false, fire: 'Mouse1'};
        break;
      case 'touchscreen':
        result = {supported: false, type: 'zones'};
        break;
      case 'gamepads':
        result = {supported: false, devices: {}};
        break;
    }

    switch (device) {
      case 'keyboard':
      case 'mouse':
      case 'touchscreen':
        var cfgString = Tool.readCookie(device, false);
        if (cfgString !== false) {
          try {
            var cfg = JSON.parse(cfgString);
            Object.keys(cfg).forEach((item) => {
              result[item] = cfg[item];
              if (device == 'touchscreen' && !(result[item] in this.controlsOptions.touchscreen.types)) {
                result[item] = this.controlsOptions.touchscreen.types.keys[0];
              }
            });
          } catch (error) {
            console.error(error.message);
          }
        }
        break;
      case 'gamepads':
        var devicesString = Tool.readCookie('gamepads', false);
        if (devicesString !== false) {
          try {
            var devices = JSON.parse(devicesString);
          } catch (error) {
            console.error(error.message);
          } finally {
            if (Array.isArray(devices)) {
              devices.forEach((id) => {
                var deviceString = Tool.readCookie(id, false);
                if (deviceString !== false) {
                  try {
                    var device = JSON.parse(deviceString);
                  } catch (error) {
                    console.error(error.message);
                  } finally {
                    result.devices[id] = device;
                  }
                }
              });
            }
          }
        }
        break;
    }
    return result;
  } // getControls

  setModel(model) {
    if (model == 'MenuModel' && this.globalData === false) {
      // the fetch may still be pending or has failed: as a last resort try the
      // data cached in localStorage before bothering the user
      if (!this.loadGlobalDataFromStorage()) {
        this.showErrorMessage('Game data could not be loaded.', 'retry');
        return;
      }
    }
    var needResizeApp = false;
    var selectionItem = 0;
    if (this.model) {
      this.model.shutdown();
      needResizeApp = true;
    }
    switch (model) {
      case 'LoadingModel':
        this.model = new BootModel(this);
        break;
      case 'MenuModel':
        this.model = new MenuModel(this, selectionItem);
        break;
      case 'MainModel':
        this.model = new MainModel(this, this.attract);
        break;
    } // switch
    this.model.init();
    if (needResizeApp) {
      this.resizeApp();
    }
  } // setModel

  startGame(attract) {
    this.attract = attract;
    this.score = 0;
    this.lives = 3;
    this.setModel('MainModel');
  } // startGame

  applyGlobalData(global) {
    this.globalData = global;
  } // applyGlobalData

  /**
   * A finished game into the hall of fame (saveGame.db): the name and the
   * score; the answer refreshes the high score and the ten best. Nothing
   * is sent without a name or a score, or offline.
   * @param {string} name - The player's name or the initials entered.
   * @param {number} score
   */
  saveScore(name, score) {
    name = String(name || '').trim();
    if (!name || !(score > 0)) {
      return;
    }
    var receiver = {
      id: this.id+'Save',
      fetchDataId: '',
      setData: (data) => {
        if (data.data.hiScore) {
          this.hiScore = data.data.hiScore;
        }
        if (Array.isArray(data.data.hallOfFame) && data.data.hallOfFame.length) {
          this.hallOfFame = data.data.hallOfFame;
        }
      },
      errorData: (error) => console.error(error.message ? error.message : error)
    };
    receiver.fetchDataId = this.fetchData('saveGame.db', false, {name: name, score: score}, receiver);
  } // saveScore

  /**
   * The seed of the game's randomness (METHODOLOGY): the clock, or in dev
   * mode a pinned one (`?devSeed=49374`, `Tool.devParam`, R-058) so a run
   * can be repeated.
   * @returns {number} uint32
   */
  gameSeed() {
    var pinned = Number(Tool.devParam('devSeed', 0));
    if (Number.isFinite(pinned) && pinned > 0) {
      return pinned >>> 0;
    }
    return Date.now() >>> 0;
  } // gameSeed

  /**
   * The ROM-derived data (data/shapes.json, font.json, tables.json —
   * tools/rom2vectors.mjs, rom2tables.mjs) delivered by appData.db and cached in localStorage by setGlobalData().
   * @returns {Object} `{shapes, font, tables}`, null where missing.
   */
  /**
   * The game worker, glued from its modules once and kept on `this.worker`:
   * the menu (the attract as its backdrop) and the game share it, each
   * sends its own `init`.
   * @returns {Promise<Worker>}
   */
  createWorker() {
    if (this.worker) {
      return Promise.resolve(this.worker);
    }
    return ModuleWorker.create(this, MainModel.WORKER_SOURCES).then((worker) => {
      this.worker = worker;
      return worker;
    });
  } // createWorker

  gameData() {
    var result = {shapes: null, font: null, tables: null};
    Object.keys(result).forEach((key) => {
      var stored = localStorage.getItem(window.appPrefix+'.'+key);
      if (stored !== null) {
        try {
          result[key] = JSON.parse(stored);
        } catch (error) {
          console.error(error.message);
        }
      }
    });
    return result;
  } // gameData

  setGlobalData(data) {
    this.applyGlobalData(data.data.global);

    var files = {};
    Object.keys(data.data).forEach((key) => {
      if (key == 'hiScore') {
        this.hiScore = data.data[key];
      } else if (key == 'hallOfFame') {
        this.hallOfFame = Array.isArray(data.data[key]) ? data.data[key] : [];
      } else if (key != 'global') {
        files[key] = data.data[key];
      }
    });
    // global goes last; a full localStorage is cleared and tried once more
    // (R-062)
    this.saveAppDataToStorage(files, data.data.global);
  } // setGlobalData

  // Load the application data: from the server when online (which also refreshes
  // localStorage), or rehydrate the global data from localStorage when offline.
  loadAppData() {
    if (navigator.onLine) {
      this.fetchDataId = this.fetchData('appData.db', false, {}, this, 2000);
    } else {
      this.loadGlobalDataFromStorage();
    }
  } // loadAppData

  loadGlobalDataFromStorage() {
    var stored = localStorage.getItem(window.appPrefix+'.global');
    if (stored !== null) {
      try {
        this.applyGlobalData(JSON.parse(stored));
        return true;
      } catch (error) {
        console.error(error.message);
      }
    }
    return false;
  } // loadGlobalDataFromStorage

  setData(data) {
    this.setGlobalData(data);
  } // setData

  errorData(error) {
    if (!this.loadGlobalDataFromStorage()) {
      console.error(error.message ? error.message : error);
      return;
    }
    // resume a boot that already gave up waiting for this response
    if (this.model && this.model.id == 'BootModel'
        && !this.model.events.some((queued) => queued.id == 'setMenuModel')
        && !this.model.desktopEntity.modalEntity) {
      this.setModel('MenuModel');
    }
  } // errorData

  /**
   * A notice with the error over the current screen. `retry` asks the boot
   * to load the data again when the notice closes; `restart` reloads the page.
   * @param {string} message
   * @param {string} action - 'retry' | 'restart' | 'ignore'
   */
  showErrorMessage(message, action) {
    var topModalEntity = this.model.desktopEntity.topModalEntity();
    var continueEvent = false;
    if (action == 'retry') {
      continueEvent = {id: 'retryLoadAppData'};
    } else if (action == 'restart') {
      continueEvent = {id: 'reloadApp'};
    }
    var w = this.model.desktopWidth, h = this.model.desktopHeight;
    topModalEntity.addModalEntity(new VectorNoticeEntity(topModalEntity,
      -topModalEntity.absoluteX()+(w-640)/2, -topModalEntity.absoluteY()+(h-260)/2, 640, 260,
      'ERROR', [String(message).toUpperCase()], continueEvent, '#ffffff'));
  } // showErrorMessage

} // GameApp
