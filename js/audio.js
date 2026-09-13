// audio.js — synthesized game-show sounds with the Web Audio API (no audio files)
const STORAGE_KEY = 'gag-sound';

function readPref() {
  try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
}
function writePref(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

export class SoundBoard {
  constructor() {
    this.enabled = readPref();
    this.ctx = null;
  }

  setEnabled(on) {
    this.enabled = on;
    writePref(on);
    if (on) this.#ensure();
    else if (this.ctx) this.ctx.suspend();
  }

  #ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  #noiseSource(t, dur, { type = 'bandpass', freq = 1500, q = 0.8 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
    return { src, filter: f, gain: g };
  }

  #brass(freq, t, dur, { gain = 0.14, vibrato = 0, wah = false, glide = 0 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(wah ? 1500 : 2600, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(wah ? 520 : 1600, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.master);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.linearRampToValueAtTime(freq * glide, t + dur);
      o.detune.value = det;
      if (vibrato) {
        const lfo = ctx.createOscillator(); const lg = ctx.createGain();
        lfo.frequency.value = 5.5; lg.gain.value = vibrato;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t + 0.15); lfo.stop(t + dur);
      }
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  click() {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.08);
  }

  drumroll(duration = 1.3) {
    if (!this.#ensure()) return;
    const t0 = this.ctx.currentTime;
    const { gain } = this.#noiseSource(t0, duration + 0.4, { freq: 1900, q: 0.7 });
    const hits = Math.floor(duration / 0.032);
    for (let i = 0; i < hits; i++) {
      const t = t0 + i * 0.032;
      const level = 0.05 + 0.3 * (i / hits) ** 1.6;
      gain.gain.setValueAtTime(level * (0.75 + Math.random() * 0.25), t);
      gain.gain.exponentialRampToValueAtTime(0.004, t + 0.028);
    }
    // cymbal crash at the end
    const crash = this.#noiseSource(t0 + duration, 1.6, { type: 'highpass', freq: 5200, q: 0.3 });
    crash.gain.gain.setValueAtTime(0.32, t0 + duration);
    crash.gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration + 1.5);
  }

  swoosh() {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime;
    const { filter, gain } = this.#noiseSource(t, 1.3, { freq: 300, q: 1.2 });
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.8);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
  }

  fanfare() {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime + 0.02;
    const n = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };
    this.#brass(n.G4, t, 0.16);
    this.#brass(n.C5, t + 0.17, 0.16);
    this.#brass(n.E5, t + 0.34, 0.16);
    this.#brass(n.G5, t + 0.51, 0.3);
    this.#brass(n.E5, t + 0.83, 0.14);
    for (const f of [n.C5, n.E5, n.G5, n.C6]) this.#brass(f, t + 0.99, 1.5, { gain: 0.08, vibrato: 3 });
    // sparkle
    for (let i = 0; i < 14; i++) {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      const tt = t + 1.0 + i * 0.07;
      o.type = 'sine'; o.frequency.value = 2000 + Math.random() * 2600;
      g.gain.setValueAtTime(0.04, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
      o.connect(g).connect(this.master); o.start(tt); o.stop(tt + 0.3);
    }
  }

  zonk() {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime + 0.02;
    // deep "boing" hit, then the sad trombone
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.5);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.65);
    const s = t + 0.45;
    this.#brass(293.66, s, 0.42, { gain: 0.16, wah: true });
    this.#brass(277.18, s + 0.45, 0.42, { gain: 0.16, wah: true });
    this.#brass(261.63, s + 0.9, 0.42, { gain: 0.16, wah: true });
    this.#brass(246.94, s + 1.35, 1.5, { gain: 0.16, wah: true, vibrato: 7, glide: 0.94 });
  }

  close() {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime;
    const { filter, gain } = this.#noiseSource(t, 0.9, { freq: 2200, q: 0.9 });
    filter.frequency.exponentialRampToValueAtTime(260, t + 0.7);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  }
}
