const GEM_FREQUENCIES = [261.63, 329.63, 392, 493.88, 587.33];
const MASTER_VOLUME = 4.85;
const USER_ACTIVATION_EVENTS = ["pointerdown", "touchstart", "keydown"];

const SOUND_PROFILES = {
  grab: {
    duration: 0.12,
    gain: 0.055,
    startRatio: 0.82,
    endRatio: 1.08,
    type: "sine",
  },
  throw: {
    duration: 0.28,
    gain: 0.12,
    startRatio: 0.72,
    endRatio: 1.9,
    type: "triangle",
  },
  stop: {
    duration: 0.22,
    gain: 0.1,
    startRatio: 0.9,
    endRatio: 0.48,
    type: "sine",
  },
  release: {
    duration: 0.24,
    gain: 0.09,
    startRatio: 0.58,
    endRatio: 1.22,
    type: "sine",
  },
};

export class GemSound {
  constructor() {
    this.context = null;
    this.isPrimed = false;
    this.resumePromise = null;
    USER_ACTIVATION_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, this.handleUserActivation, {
        capture: true,
        passive: true,
      });
    });
  }

  handleUserActivation = () => {
    USER_ACTIVATION_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, this.handleUserActivation, true);
    });
    void this.unlock();
  };

  createContext() {
    const AudioContextClass =
      window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    try {
      return new AudioContextClass();
    } catch {
      return null;
    }
  }

  primeContext() {
    if (!this.context || this.isPrimed) {
      return;
    }

    try {
      const source = this.context.createBufferSource();

      source.buffer = this.context.createBuffer(
        1,
        1,
        this.context.sampleRate,
      );
      source.connect(this.context.destination);
      source.start(0);
      source.addEventListener("ended", () => source.disconnect(), {
        once: true,
      });
      this.isPrimed = true;
    } catch {
      this.isPrimed = false;
    }
  }

  unlock() {
    this.context ??= this.createContext();

    if (!this.context) {
      return Promise.resolve(false);
    }

    this.primeContext();

    if (this.context.state === "running") {
      return Promise.resolve(true);
    }

    if (this.context.state === "closed") {
      return Promise.resolve(false);
    }

    this.resumePromise ??= this.context
      .resume()
      .then(() => this.context.state === "running")
      .catch(() => false)
      .finally(() => {
        this.resumePromise = null;
      });

    return this.resumePromise;
  }

  play(gemIndex, action, intensity = 1) {
    const profile = SOUND_PROFILES[action];

    if (!profile) {
      return;
    }

    if (!this.context || this.context.state !== "running") {
      void this.unlock().then((isReady) => {
        if (isReady) {
          this.playTone(gemIndex, profile, intensity);
        }
      });
      return;
    }

    this.playTone(gemIndex, profile, intensity);
  }

  playTone(gemIndex, profile, intensity) {
    const context = this.context;

    if (!context || context.state !== "running") {
      return;
    }

    const normalizedIntensity = Math.min(1.35, Math.max(0.65, intensity));
    const baseFrequency =
      GEM_FREQUENCIES[gemIndex % GEM_FREQUENCIES.length];
    const startTime = context.currentTime;
    const endTime = startTime + profile.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(
      baseFrequency * profile.startRatio,
      startTime,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      baseFrequency * profile.endRatio * normalizedIntensity,
      endTime,
    );

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      profile.gain * normalizedIntensity * MASTER_VOLUME,
      startTime + 0.015,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.02);
    oscillator.addEventListener(
      "ended",
      () => {
        oscillator.disconnect();
        gain.disconnect();
      },
      { once: true },
    );
  }
}
