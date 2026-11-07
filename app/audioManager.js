const { AbstractAudioManager } = await import('./svision/js/audio/abstractAudioManager.js?ver='+window.srcVersion);
const { AudioSampleHandler } = await import('./svision/js/audio/audioSampleHandler.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { SoundBoard } = await import('./soundBoard.js?ver='+window.srcVersion);
// begin code

/**
 * The sound of the cabinet (notes 10), one bus per circuit of the board —
 * each has its own latch and plays on its own, so the buses are the
 * board's seven voices:
 *   thump       the 555's beat, two tones (`$3A00`)
 *   saucer      the warble of the saucer on screen, large or small, a loop (`$3C00`, `$3C02`)
 *   fire        the ship's shot (`$3C04`)
 *   saucerFire  the saucer's shot (`$3C01`)
 *   thrust      the filtered noise while the button is held, a loop (`$3C03`)
 *   explosion   the sampled noise fading over 63 frames, by the byte (`$3600`)
 *   life        the extra ship's beeps (`$3C05`)
 * All play samples the SoundBoard renders once at the context's rate
 * (deterministic, the same under Node) through an `AudioSampleHandler`;
 * a bus plays one sample at a time, as the circuit did: a new trigger
 * cuts the old (a shot restarts, a new explosion byte overwrites the
 * old). All follow the one user level, SOUNDS (`audioBusSoundsLevel`);
 * the game has no music.
 */
var EFFECT_BUSES = ['thump', 'saucer', 'fire', 'saucerFire', 'thrust', 'explosion', 'life'];

export class AudioManager extends AbstractAudioManager {

  /**
   * @param {GameApp} app
   */
  constructor(app) {
    super(app);
    this.id = 'AudioManager';
    this.volume = {};
    this.volume.sounds = Math.min(10, Math.max(0, Math.round(Number(Tool.readCookie('audioBusSoundsLevel', 7)))));
    this.latencyHint = 'interactive';
    this.board = new SoundBoard();
    /** the rendered samples by name, and the rate they were made at */
    this.samples = {};
    this.samplesRate = 0;
  } // constructor

  static get effectBuses() {
    return EFFECT_BUSES;
  } // effectBuses

  /**
   * Renders every sample at the context's rate, once per rate.
   */
  renderSamples() {
    var rate = this.getSampleRate();
    if (this.samplesRate === rate) {
      return;
    }
    this.samples = this.board.renderAll(rate);
    this.samplesRate = rate;
  } // renderSamples

  createAudioHandler(bus, options) {
    return new AudioSampleHandler(this.app);
  } // createAudioHandler

  /**
   * The level's factor: the same curve as the other games.
   * @param {number} volume - 0..10
   * @returns {number}
   */
  volumeFactor(volume) {
    var levels = [0, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.14, 0.18, 0.23, 0.29];
    return levels[volume]/levels[10];
  } // volumeFactor

  openBus(bus, options) {
    super.openBus(bus, options);
    this.refreshVolume(bus);
    this.muteBus(bus, ('muted' in options) ? options.muted : false);
    if (bus in this.buses) {
      this.renderSamples();
    }
  } // openBus

  refreshVolume(bus) {
    var handler = this.buses[bus];
    if (handler === undefined) {
      return;
    }
    handler.setBusVolume(this.volumeFactor(this.volume.sounds));
  } // refreshVolume

  /**
   * Muting `sounds` mutes every bus (there is nothing else).
   */
  muteBus(bus, muted) {
    if (bus === 'sounds') {
      EFFECT_BUSES.forEach((b) => super.muteBus(b, muted));
      return;
    }
    super.muteBus(bus, muted);
  } // muteBus

  /**
   * A sample by name; an explosion byte the board has no name for
   * (`explosionXX`) is rendered when first asked for.
   */
  audioData(bus, sound, options) {
    var data = super.audioData(bus, sound, options);
    if (data !== false) {
      return data;
    }
    this.renderSamples();
    if (!(sound in this.samples)) {
      var m = /^explosion([0-9A-F]{2})$/.exec(sound);
      if (m) {
        this.samples[sound] = this.board.renderExplosion(parseInt(m[1], 16), this.samplesRate);
      }
    }
    if (sound in this.samples) {
      if (bus in this.audioDataCache) {
        this.audioDataCache[bus][sound] = this.samples[sound];
      }
      return this.samples[sound];
    }
    return false;
  } // audioData

} // AudioManager
