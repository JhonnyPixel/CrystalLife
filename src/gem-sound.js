const GEM_FREQUENCIES = [261.63, 329.63, 392, 493.88, 587.33];

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
  }

  unlock() {
    const AudioContextClass =
      window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    this.context ??= new AudioContextClass();

    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  play(gemIndex, action, intensity = 1) {
    const profile = SOUND_PROFILES[action];

    if (!this.context || !profile) {
      return;
    }

    const normalizedIntensity = Math.min(1.35, Math.max(0.65, intensity));
    const baseFrequency =
      GEM_FREQUENCIES[gemIndex % GEM_FREQUENCIES.length];
    const startTime = this.context.currentTime;
    const endTime = startTime + profile.duration;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

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
      profile.gain * normalizedIntensity,
      startTime + 0.015,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
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
