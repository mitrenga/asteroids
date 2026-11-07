const { LFSRNoise, Clock, Lowpass, LadderDAC, CC555, TriangleWave, SquareWave, FixedSquare, SampleHold, Ramp, RCDischarge, Filter1, Filter2 } = await import('./svision/js/audio/chip/discrete.js?ver='+window.srcVersion);
const { PCMSample } = await import('./svision/js/audio/pcmSample.js?ver='+window.srcVersion);
// begin code

/**
 * The sound board of Asteroids (notes 10.2), as samples: no sound chip at
 * all — seven discrete circuits on the PCB (DP-143), each one enabled or
 * set by a latch the program writes (notes 10.1), transcribed from the
 * MAME netlist `asteroid_a.cpp` block by block over the building blocks
 * of `svision/js/audio/chip/discrete.js`:
 *
 *   thump       a 4-bit R-1 DAC (R44–R47, R49, C27) → a 555 charged by a
 *               PNP current source (R 22 k, C 0.22 µ, discharge 18 k) →
 *               RC 3.3 k / 0.1 µ → ×30; two tones (DAC 0 / 4 → 81 / 87 Hz),
 *               on for four frames a beat
 *   saucer      a slow triangle (5.75 Hz large / 8.25 Hz small, 0–920)
 *               warbling a fast triangle (500 / 750 Hz up to +920), RC 10 µs
 *   ship fire   a square wave falling 820 → 110 Hz in 0.28 s (RAMP), its
 *               amplitude 46·e^(−t/81 ms) + 7, duty 4500/f + 67 %, RC 10 µs
 *   saucer fire the same 830 → 630 Hz, 42.5·e^(−t/0.3 s) + 7, RC 20 µs
 *   thrust      the 16-bit LFSR at 12 kHz (XNOR of bits 6 and 14) ×4560 →
 *               RC 2.2 k / 1 µ → enable → Sallen-Key band-pass 89.5 Hz
 *               Q 7.6 → active low-pass 160 Hz
 *   explosion   the noise sampled by a 12 kHz/N clock (N from bits 6–7 of
 *               the byte: 12, 6, 3, 5) × the volume of bits 2–5 → RC
 *               3042 Ω / 1 µ; the program counts the byte down a frame
 *   life        a 3 kHz square from the clock divider, gated 4 frames
 *               on / 4 off for 88 frames by the NMI (SND3 = $B0)
 *
 * Every sound is rendered once, deterministically (the LFSR starts from
 * zero as after `$3E00`, no `Math.random`), into a `PCMSample` the audio
 * manager plays through an `AudioSampleHandler`; the thrust and the saucers
 * are loops the game starts and stops on the latch's edges. No DOM:
 * `tools/regress.mjs` fingerprints the samples under Node and
 * `tools/rendersounds.mjs` writes them out as WAV for the A/B against MAME.
 *
 * Levels are the netlist's: the nodes come out in its units (thump ±57,
 * saucer ±38, shots ±26, explosion up to ±500, thrust ±2280 before its
 * filters, life ±50) and the output is the sum over 1910.2 (MAME's
 * `DISCRETE_OUTPUT` divisor: the relative gains of the table in
 * `asteroid_a.cpp:76-87`) times the route gain 1.4. What is a guess is
 * marked ★ and is for the A/B by ear: `MIX_GAIN` against full scale; the
 * phase of the life tone's gating; each voice with its own noise register
 * (the board has one, running all the time); the thrust and saucer loops
 * cross-faded at the seam, without the onset of their filters; the thump's
 * DAC 0 tone sits 10 µV over the threshold in MAME's model (a hair the
 * other way and the 555 would stall — the real transistor does not care).
 */
export class SoundBoard {

  /** one game frame: 4 NMI at 3 kHz/12 (notes 1), 61.52 Hz */
  static get FRAME_HZ() { return 12096000/(12*4096*4); }
  /** the noise clock (`asteroid_a.cpp:190`) */
  static get NOISE_CLOCK() { return 12000; }
  /** MAME's output divisor: the relative gains summed (life is not counted there either) */
  static get FULL_SCALE() { return 131.6+76.1+49.5+53.0+1000.0+600.0; }
  /** the route gain of the discrete block in `asteroid_sound` */
  static get ROUTE_GAIN() { return 1.4; }
  /** ★ the whole against full scale: the large rock's explosion peaks near 0.7 */
  static get MIX_GAIN() { return 2.4; }
  /** the loop's cross-fade at the seam, seconds */
  static get LOOP_FADE() { return 0.05; }

  /** the pitch divider of the explosion by bits 6–7 of the byte (`asteroid_explode_w`) */
  static get EXPLOSION_DIVIDERS() { return [12, 6, 3, 5]; }

  /**
   * Every sample the board renders, by the name the audio manager plays:
   * the two thump tones (LTHUMP bit 2 clear / set, notes 10.1), the two
   * shots, the two saucers and the thrust as loops, the four explosion
   * bytes the program writes (`DSTRCT/70$`: `$3F` a large rock or the
   * large saucer, `$FF` a medium rock or the small saucer, `$BF` a small
   * rock; `MOVE/93$`: `$3E` the ship), the extra ship's tone.
   */
  static get SAMPLES() {
    return {
      thumpLow:    {kind: 'thump', data: 0},
      thumpHigh:   {kind: 'thump', data: 4},
      fire:        {kind: 'fire', saucer: false},
      saucerFire:  {kind: 'fire', saucer: true},
      saucerLarge: {kind: 'saucer', large: true, loop: true},
      saucerSmall: {kind: 'saucer', large: false, loop: true},
      thrust:      {kind: 'thrust', loop: true},
      explosion3F: {kind: 'explosion', byte: 0x3F},
      explosionFF: {kind: 'explosion', byte: 0xFF},
      explosionBF: {kind: 'explosion', byte: 0xBF},
      explosion3E: {kind: 'explosion', byte: 0x3E},
      extraLife:   {kind: 'life'}
    };
  } // SAMPLES

  constructor() {
    this.id = 'SoundBoard';
  } // constructor

  /**
   * A node's voltage to the sample's scale: MAME's output divisor, the
   * route gain, the mix gain, clipped.
   * @param {number} v - Netlist units.
   * @returns {number} −1..1
   */
  static out(v) {
    var s = v/SoundBoard.FULL_SCALE*SoundBoard.ROUTE_GAIN*SoundBoard.MIX_GAIN;
    return s > 1 ? 1 : (s < -1 ? -1 : s);
  } // out

  /**
   * Samples in `n` game frames.
   * @param {number} n - Frames.
   * @param {number} sampleRate
   * @returns {number}
   */
  static frames(n, sampleRate) {
    return Math.round(n/SoundBoard.FRAME_HZ*sampleRate);
  } // frames

  /**
   * One sample by name.
   * @param {string} name - A key of `SAMPLES`.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  render(name, sampleRate) {
    var spec = SoundBoard.SAMPLES[name];
    if (!spec) {
      throw new Error('SoundBoard: no sample '+name);
    }
    switch (spec.kind) {
      case 'thump':
        return this.renderThump(spec.data, sampleRate);
      case 'fire':
        return this.renderFire(spec.saucer, sampleRate);
      case 'saucer':
        return this.renderSaucer(spec.large, sampleRate);
      case 'thrust':
        return this.renderThrust(sampleRate);
      case 'explosion':
        return this.renderExplosion(spec.byte, sampleRate);
      case 'life':
        return this.renderLife(sampleRate);
    }
    return null;
  } // render

  /**
   * All of them.
   * @param {number} sampleRate
   * @returns {Object} By name.
   */
  renderAll(sampleRate) {
    var out = {};
    Object.keys(SoundBoard.SAMPLES).forEach((name) => {
      out[name] = this.render(name, sampleRate);
    });
    return out;
  } // renderAll

  /**
   * The noise source: the LFSR of `asteroid_lfsr` (16 bits, XNOR of bits
   * 6 and 14 shifted in, from zero) clocked at 12 kHz, its output ±0.5
   * (`DISCRETE_LFSR_NOISE` amplitude 1, no bias). The output is the bit
   * shifted in last, MAME's feedback bit one clock later — the same
   * sequence.
   * @param {number} sampleRate
   * @returns {Object} `{step()}` advancing one sample and returning the noise.
   */
  static noise(sampleRate) {
    var lfsr = new LFSRNoise(16, [6, 14], true, 0);
    var clock = new Clock(SoundBoard.NOISE_CLOCK, 1/sampleRate);
    var value = -0.5;
    return {
      lfsr: lfsr,
      step: function() {
        var edges = clock.step();
        for (var e = 0; e < edges; e++) {
          value = lfsr.step() ? 0.5 : -0.5;
        }
        return value;
      }
    };
  } // noise

  /**
   * A loop closed by a cross-fade: the tail past `n` is blended into the
   * head, so the seam carries no click.
   * @param {Float32Array} buffer - `n + fade` samples rendered.
   * @param {number} n - The loop's length.
   * @param {number} fade - Samples of the cross-fade.
   * @returns {Float32Array} `n` samples.
   */
  static loop(buffer, n, fade) {
    var out = new Float32Array(n);
    out.set(buffer.subarray(0, n));
    for (var i = 0; i < fade; i++) {
      var w = (i+1)/(fade+1);                      // 0 → 1: the head fades in over the tail
      out[i] = buffer[n+i]*(1-w)+buffer[i]*w;
    }
    return out;
  } // loop

  /**
   * The thump (`asteroid_a.cpp:116-119`): the DAC's nibble to the 555's
   * control voltage, the 555 enabled for the four frames `THUMP1` holds
   * the bit on, the RC and the gain; a short tail for the RC.
   * @param {number} data - The DAC's nibble, 0 or 4 as the program alternates them.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderThump(data, sampleRate) {
    var dt = 1/sampleRate;
    var dac = new LadderDAC([220000, 100000, 47000, 22000], 3.5, 4.3, 6800, 47000, 0.01e-6, dt);
    var vco = new CC555({r: 22000, c: 0.22e-6, rDischarge: 18000, vPos: 5, vbe: 0.8, toCap: true, ac: true}, dt);
    var rc = new Lowpass(3300*0.1e-6, dt);
    var on = SoundBoard.frames(4, sampleRate);
    var total = on+Math.round(0.01*sampleRate);
    var out = new Float32Array(total);
    for (var i = 0; i < 200; i++) {
      dac.step(data);                              // the nibble was written with the previous beat: settled
    }
    for (i = 0; i < total; i++) {
      var v = vco.step(i < on, dac.step(data));
      out[i] = SoundBoard.out(rc.step(v)*30);
    }
    return new PCMSample(out, sampleRate);
  } // renderThump

  /**
   * A shot (`asteroid_a.cpp:147-152`, `:159-164`): the latch on for the
   * 16 frames of `SOUND1` — the frequency ramps down, the amplitude
   * decays from the trigger, the duty follows the frequency; off, the
   * square wave is 0 and only the tiny RC rings.
   * @param {boolean} saucer - The saucer's (830 → 630 Hz) or the ship's (820 → 110 Hz).
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderFire(saucer, sampleRate) {
    var dt = 1/sampleRate;
    var f0 = saucer ? 830 : 820, f1 = saucer ? 630 : 110;
    var ramp = new Ramp((f0-f1)/0.28, f0, f1, 0, dt);
    var decay = new RCDischarge((saucer ? 10000 : 2700)*3, 1e-5, dt);
    var amp0 = (saucer ? 49.5 : 53.0)-7.0;
    var square = new SquareWave(dt);
    var rc = new Lowpass((saucer ? 2 : 1)*1e-5, dt);
    var on = SoundBoard.frames(16, sampleRate);
    var total = on+Math.round(0.005*sampleRate);
    var out = new Float32Array(total);
    for (var i = 0; i < total; i++) {
      var en = i < on ? 1 : 0;
      var f = ramp.step(en, en);
      var a = decay.step(en, amp0)+7.0;
      var duty = 4500/f+67;
      out[i] = SoundBoard.out(rc.step(square.step(en, f, a, duty, 0)));
    }
    return new PCMSample(out, sampleRate);
  } // renderFire

  /**
   * A saucer (`asteroid_a.cpp:133-140`) as a loop of four warbles: the
   * slow triangle's rate is trimmed so the warble closes on the loop
   * exactly, the fast triangle's seam is cross-faded.
   * @param {boolean} large - `SAUCRSEL` set: 5.75 Hz over 500 Hz; else 8.25 Hz over 750 Hz.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderSaucer(large, sampleRate) {
    var dt = 1/sampleRate;
    var sel = large ? 1 : 0;
    var warble = sel*(-2.5)+8.25;
    var periods = 4;
    var n = Math.round(periods/warble*sampleRate);
    warble = periods*sampleRate/n;
    var fade = Math.round(SoundBoard.LOOP_FADE*sampleRate);
    var slow = new TriangleWave(dt);
    var fast = new TriangleWave(dt);
    var rc = new Lowpass(1e-5, dt);
    var buffer = new Float32Array(n+fade);
    for (var i = 0; i < n+fade; i++) {
      var f = sel*(-250)+slow.step(1, warble, 920.0, 920.0/2)+750;
      buffer[i] = SoundBoard.out(rc.step(fast.step(1, f, 76.1, 0)));
    }
    return new PCMSample(SoundBoard.loop(buffer, n, fade), sampleRate);
  } // renderSaucer

  /**
   * The thrust (`asteroid_a.cpp:173-181`) as a two-second loop of the
   * filtered noise, the filters run in for half a second first so the
   * loop is the steady state; the seam cross-faded.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderThrust(sampleRate) {
    var dt = 1/sampleRate;
    var noise = SoundBoard.noise(sampleRate);
    var rc = new Lowpass(2200*1e-6, dt);
    var band = new Filter2(89.5, 1/7.6, 'bandpass', dt);
    var low = new Filter1(160, 'lowpass', dt);
    var n = Math.round(2*sampleRate);
    var fade = Math.round(SoundBoard.LOOP_FADE*sampleRate);
    var lead = Math.round(0.5*sampleRate);
    var buffer = new Float32Array(n+fade);
    for (var i = -lead; i < n+fade; i++) {
      var v = low.step(band.step(rc.step(noise.step()*600.0*7.6)));
      if (i >= 0) {
        buffer[i] = SoundBoard.out(v);
      }
    }
    return new PCMSample(SoundBoard.loop(buffer, n, fade), sampleRate);
  } // renderThrust

  /**
   * An explosion (`asteroid_a.cpp:196-201`, `asteroid_explode_w`) from
   * the byte `DSTRCT` loads: `SOUNDS/50$` writes it decremented every
   * frame while its low six bits last, so the first frame already
   * carries `byte − 1`; the volume of bits 2–5 steps down every four
   * frames from 15 to 0, the pitch of bits 6–7 stays. 63 frames and the
   * RC's tail.
   * @param {number} byte - `$3F`, `$FF`, `$BF` or `$3E`.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderExplosion(byte, sampleRate) {
    var dt = 1/sampleRate;
    var divider = SoundBoard.EXPLOSION_DIVIDERS[(byte >> 6) & 3];
    var noise = SoundBoard.noise(sampleRate);
    var pitch = new FixedSquare(SoundBoard.NOISE_CLOCK/divider, 100/divider, dt);
    var hold = new SampleHold();
    var rc = new Lowpass(3042*1e-6, dt);
    var perFrame = 1/SoundBoard.FRAME_HZ*sampleRate;
    var frames = 63;
    var total = Math.round(frames*perFrame)+Math.round(0.02*sampleRate);
    var out = new Float32Array(total);
    var e = byte;
    var frame = -1;
    var volume = 0;
    for (var i = 0; i < total; i++) {
      var f = Math.floor(i/perFrame);
      if (f != frame) {
        frame = f;
        if (f < frames) {
          if (e & 0x3F) {
            e = (e-1) & 0xFF;                      // SOUNDS/50$
          }
          volume = (e >> 2) & 0x0F;
        } else {
          volume = 0;
        }
      }
      var sampled = hold.step(noise.step(), pitch.step(1, 1.0, 0.5));
      out[i] = SoundBoard.out(rc.step(sampled*volume*1000.0/15.0));
    }
    return new PCMSample(out, sampleRate);
  } // renderExplosion

  /**
   * The extra ship's tone (`asteroid_a.cpp:207`, notes 1.1): `SND3 = $B0`
   * counts down four a frame on the odd frames — 88 frames —, the latch
   * follows bit 2 of `FRAME`: four frames on, four off, eleven beeps.
   * ★ Starts with a beep; the machine starts wherever `FRAME` is.
   * @param {number} sampleRate
   * @returns {PCMSample}
   */
  renderLife(sampleRate) {
    var dt = 1/sampleRate;
    var tone = new FixedSquare(3000, 50, dt);
    var perFrame = 1/SoundBoard.FRAME_HZ*sampleRate;
    var total = Math.round(88*perFrame);
    var out = new Float32Array(total);
    for (var i = 0; i < total; i++) {
      var frame = Math.floor(i/perFrame);
      var en = (frame & 4) == 0 ? 1 : 0;
      out[i] = SoundBoard.out(tone.step(en, 100.0, 0));
    }
    return new PCMSample(out, sampleRate);
  } // renderLife

} // SoundBoard
