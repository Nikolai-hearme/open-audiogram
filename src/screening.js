/**
 * Suggested browser-output calibration anchors in dBFS for a nominal 0 dB HL
 * tone. These conservative defaults are approximations, not device calibration.
 */
export const DEFAULT_CALIBRATION = Object.freeze({
  125: -82,
  250: -80,
  500: -78,
  1000: -76,
  2000: -77,
  4000: -79,
  8000: -83,
});

/** @type {readonly number[]} */
export const SCREENING_FREQUENCIES = Object.freeze([
  1000, 2000, 4000, 8000, 500, 250,
]);

const DEFAULT_SESSION_OPTIONS = Object.freeze({
  ears: Object.freeze(["right", "left"]),
  frequencies: SCREENING_FREQUENCIES,
  startLevel: 30,
  minLevel: -10,
  maxLevel: 90,
  maxPresentations: 80,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function amplitudeForDbfs(dbfs) {
  return 10 ** (dbfs / 20);
}

function raisedCosine(length, rising) {
  return Float32Array.from({ length }, (_, index) => {
    const phase = index / (length - 1);
    const value = 0.5 - 0.5 * Math.cos(Math.PI * phase);
    return rising ? value : 1 - value;
  });
}

/**
 * Web Audio pure-tone player with stereo ear routing and click-free ramps.
 *
 * Browser audio output is not calibrated medical equipment. Pass a
 * device-specific `calibration` table after measuring the complete
 * computer/headphone signal chain.
 */
export class TonePlayer {
  /**
   * @param {{calibration?:Record<number,number>, durationMs?:number, rampMs?:number, maxDbfs?:number, audioContext?:AudioContext}} [options]
   */
  constructor(options = {}) {
    this.calibration = { ...DEFAULT_CALIBRATION, ...options.calibration };
    this.durationMs = Number(options.durationMs ?? 700);
    this.rampMs = Number(options.rampMs ?? 25);
    this.maxDbfs = Number(options.maxDbfs ?? -6);
    this.context = options.audioContext ?? null;
  }

  /** @returns {AudioContext} Lazily created AudioContext. */
  getContext() {
    if (this.context) return this.context;
    const AudioContextClass =
      globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("TonePlayer requires the Web Audio API.");
    }
    this.context = new AudioContextClass();
    return this.context;
  }

  /**
   * Convert an approximate dB HL request to output amplitude.
   *
   * @param {number} freq Frequency in hertz.
   * @param {number} level Requested approximate dB HL.
   * @returns {number} Linear amplitude in the range 0–1.
   */
  amplitude(freq, level) {
    const anchor =
      this.calibration[freq] ??
      this.calibration[String(freq)] ??
      DEFAULT_CALIBRATION[1000];
    return amplitudeForDbfs(Math.min(this.maxDbfs, Number(anchor) + Number(level)));
  }

  /**
   * Present one pure tone.
   *
   * @param {{ear:"right"|"left", freq:number, level:number, durationMs?:number}} presentation
   * @returns {Promise<void>} Resolves after the tone and ramp finish.
   */
  async present({ ear, freq, level, durationMs = this.durationMs }) {
    if (ear !== "right" && ear !== "left") {
      throw new TypeError('ear must be "right" or "left".');
    }
    const frequency = Number(freq);
    const hearingLevel = Number(level);
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new TypeError("freq must be a positive number.");
    }
    if (!Number.isFinite(hearingLevel)) {
      throw new TypeError("level must be a finite number.");
    }

    const context = this.getContext();
    if (context.state === "suspended") await context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner =
      typeof context.createStereoPanner === "function"
        ? context.createStereoPanner()
        : null;
    const now = context.currentTime;
    const seconds = Math.max(0.1, durationMs / 1000);
    const ramp = Math.min(seconds / 2, Math.max(0.005, this.rampMs / 1000));
    const peak = this.amplitude(frequency, hearingLevel);
    const attack = raisedCosine(32, true);
    const release = raisedCosine(32, false);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueCurveAtTime(
      Float32Array.from(attack, (value) => value * peak),
      now,
      ramp,
    );
    gain.gain.setValueAtTime(peak, now + ramp);
    gain.gain.setValueCurveAtTime(
      Float32Array.from(release, (value) => value * peak),
      now + seconds - ramp,
      ramp,
    );
    gain.gain.setValueAtTime(0, now + seconds);

    oscillator.connect(gain);
    if (panner) {
      panner.pan.setValueAtTime(ear === "right" ? 1 : -1, now);
      gain.connect(panner);
      panner.connect(context.destination);
    } else {
      gain.connect(context.destination);
    }

    oscillator.start(now);
    oscillator.stop(now + seconds + 0.01);
    await new Promise((resolve) => {
      oscillator.addEventListener("ended", resolve, { once: true });
    });
    oscillator.disconnect();
    gain.disconnect();
    panner?.disconnect();
  }

  /** Close the lazily created audio context. */
  async close() {
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
    this.context = null;
  }
}

/**
 * Modified Hughson–Westlake threshold search.
 *
 * The injected callback owns presentation timing and response collection,
 * which keeps the algorithm testable and allows any UI to host it.
 */
export class ScreeningSession {
  /**
   * @param {{onPresent:(presentation:{ear:"right"|"left",freq:number,level:number})=>Promise<boolean>|boolean, ears?:Array<"right"|"left">, frequencies?:number[], startLevel?:number, minLevel?:number, maxLevel?:number, maxPresentations?:number}} options
   */
  constructor(options = {}) {
    if (typeof options.onPresent !== "function") {
      throw new TypeError("ScreeningSession requires an onPresent callback.");
    }
    this.onPresent = options.onPresent;
    this.ears = [...(options.ears ?? DEFAULT_SESSION_OPTIONS.ears)];
    this.frequencies = [
      ...(options.frequencies ?? DEFAULT_SESSION_OPTIONS.frequencies),
    ];
    this.startLevel = Number(
      options.startLevel ?? DEFAULT_SESSION_OPTIONS.startLevel,
    );
    this.minLevel = Number(options.minLevel ?? DEFAULT_SESSION_OPTIONS.minLevel);
    this.maxLevel = Number(options.maxLevel ?? DEFAULT_SESSION_OPTIONS.maxLevel);
    this.maxPresentations = Number(
      options.maxPresentations ?? DEFAULT_SESSION_OPTIONS.maxPresentations,
    );
    this.cancelled = false;

    if (
      this.ears.some((ear) => ear !== "right" && ear !== "left") ||
      !this.frequencies.every((freq) => Number.isFinite(Number(freq)))
    ) {
      throw new TypeError("Invalid ears or frequencies.");
    }
  }

  /** Stop the session before the next presentation. */
  cancel() {
    this.cancelled = true;
  }

  async response(ear, freq, level) {
    if (this.cancelled) throw new Error("Screening session cancelled.");
    return Boolean(await this.onPresent({ ear, freq, level }));
  }

  async thresholdFor(ear, freq) {
    let level = clamp(this.startLevel, this.minLevel, this.maxLevel);
    let direction = "initial";
    let presentations = 0;
    const ascending = new Map();

    while (presentations < this.maxPresentations) {
      const heard = await this.response(ear, freq, level);
      presentations += 1;

      if (direction === "ascending") {
        const trial = ascending.get(level) ?? { attempts: 0, responses: 0 };
        trial.attempts += 1;
        if (heard) trial.responses += 1;
        ascending.set(level, trial);
        if (trial.responses >= 2 && trial.attempts <= 3) {
          return { freq, level };
        }
      }

      if (heard) {
        if (level <= this.minLevel) return { freq, level: this.minLevel };
        level = Math.max(this.minLevel, level - 10);
        direction = "descending";
      } else {
        if (level >= this.maxLevel) {
          return { freq, level: this.maxLevel, noResponse: true };
        }
        level = Math.min(this.maxLevel, level + 5);
        direction = "ascending";
      }
    }

    return { freq, level, noResponse: true };
  }

  /**
   * Run the full screening in the configured frequency order.
   *
   * @returns {Promise<{right:{air:Array},left:{air:Array}}>} Data accepted by
   *   `audiogramSVG()`.
   */
  async run() {
    this.cancelled = false;
    const result = { right: { air: [] }, left: { air: [] } };
    for (const ear of this.ears) {
      for (const frequency of this.frequencies) {
        const point = await this.thresholdFor(ear, Number(frequency));
        result[ear].air.push(point);
      }
    }
    return result;
  }
}
