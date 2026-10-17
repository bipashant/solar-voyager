// Ambient space soundtrack, synthesised live with Web Audio: no audio files, nothing to download or license.
//
// A slow drone built on a root note and its fifth, octave and major third, each note doubled and detuned
// so it beats gently; a breath of filtered noise; and now and then a soft bell from a pentatonic scale,
// all through a generated reverb. It follows the journey: the key and brightness change with the kind of
// place you are in (a star, a planet, a moon, a galaxy), the sound opens up and a faint rush builds while
// you fly, and a soft swell marks arrival.
//
// Browsers (iPhone Safari and Chrome above all) keep an audio context silent until the visitor touches the
// page, so it starts on the first tap or key press and fades in. The master level is 75% of full volume.
const MASTER = 0.75;
const PREF = 'solarVoyager.sound';

// root note (Hz) and how bright the sound is, by kind of place
const MOODS = {
  star: { root: 46.25, cutoff: 2600, wet: 0.5 },
  planet: { root: 55, cutoff: 1500, wet: 0.45 },
  dwarf: { root: 51.91, cutoff: 1300, wet: 0.5 },
  moon: { root: 61.74, cutoff: 1100, wet: 0.5 },
  deep: { root: 43.65, cutoff: 900, wet: 0.7 },
};
const RATIOS = [1, 1.5, 2, 2.52, 3]; // root, fifth, octave, major third (a touch wide), twelfth
const BELLS = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // A minor pentatonic

function readPref() { try { return localStorage.getItem(PREF) !== '0'; } catch { return true; } }
function savePref(on) { try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* private mode */ } }

export class Ambience {
  // muted: start silent and leave the saved preference alone (the app embedded in a lesson page)
  constructor({ muted = false } = {}) {
    this.persist = !muted;
    this.enabled = !muted && readPref();
    this.ctx = null;
    this.mood = null;
    this.lastUpdate = 0;
    this.ready = false;
    const unlock = () => this.unlock();
    // touchend and click count as user gestures on iOS; pointerdown alone does not
    for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
    this.stopListening = () => { for (const ev of ['touchend', 'click', 'keydown']) window.removeEventListener(ev, unlock); };
    // a backgrounded app or tab should be silent, and pick up again when you come back
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else if (this.enabled) this.ctx.resume?.();
    });
    this.unlock(); // desktop browsers that allow it start straight away
  }

  // ---------------------------------------------------------------- start up
  unlock() {
    if (!this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      try { this.ctx = new AC({ latencyHint: 'playback' }); } catch { return; }
      this.build();
    }
    const go = () => {
      if (this.ctx.state !== 'running' || !this.enabled) return;
      this.fade(MASTER, 3.5);
      if (!this.ready) { this.ready = true; this.stopListening(); this.scheduleBell(4000); }
    };
    if (this.ctx.state === 'running') go(); else this.ctx.resume().then(go).catch(() => {});
  }

  fade(level, seconds) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(level, t + seconds);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.persist) savePref(on);
    if (on) { this.unlock(); return; }
    if (!this.ctx) return;
    this.fade(0, 0.6);
    setTimeout(() => { if (!this.enabled) this.ctx.suspend?.(); }, 900);
  }

  // ---------------------------------------------------------------- the sound
  build() {
    const ctx = this.ctx;
    const mk = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; };
    const lfo = (rate, depth, target, type = 'sine') => {
      const o = mk(type, rate), g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
      return o;
    };

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const soft = ctx.createDynamicsCompressor(); // keeps the peaks of overlapping bells tidy
    soft.threshold.value = -18; soft.ratio.value = 3; soft.attack.value = 0.05; soft.release.value = 0.4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.master.connect(soft);
    soft.connect(this.analyser);
    soft.connect(ctx.destination);

    // everything below feeds the bus, which splits into a dry path and a reverb
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.38; // the mix itself sits low; MASTER (75%) is the volume the visitor controls
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = 1500; this.tone.Q.value = 0.4;
    this.bus.connect(this.tone);
    this.tone.connect(this.master);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.45;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(5.5);
    this.tone.connect(verb);
    verb.connect(this.wet);
    this.wet.connect(this.master);
    lfo(0.017, 380, this.tone.frequency); // the tone opens and closes very slowly

    // drone: each note twice, a few cents apart, each pair breathing at its own slow rate
    this.swell = ctx.createGain();
    this.swell.connect(this.bus);
    this.voices = [];
    RATIOS.forEach((ratio, i) => {
      const level = [0.085, 0.06, 0.05, 0.022, 0.014][i];
      const amp = ctx.createGain();
      amp.gain.value = level;
      lfo(0.045 + i * 0.019, level * 0.55, amp.gain);
      amp.connect(this.swell);
      for (const cents of [-5, 5]) {
        const o = mk(i === 0 ? 'triangle' : 'sine', 55 * ratio);
        o.detune.value = cents;
        o.connect(amp);
        o.start();
        this.voices.push({ o, ratio });
      }
    });

    // breath: noise through a drifting band, plus a low rumble; the flight rush uses the same noise
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) { b0 = 0.985 * b0 + 0.015 * (Math.random() * 2 - 1); d[i] = b0 * 5; } // brown-ish noise
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 700; band.Q.value = 0.8;
    lfo(0.031, 260, band.frequency);
    this.breath = ctx.createGain();
    this.breath.gain.value = 0.05;
    lfo(0.07, 0.02, this.breath.gain);
    noise.connect(band).connect(this.breath).connect(this.bus);
    noise.start();
    this.rush = ctx.createGain(); // grows with flight speed
    this.rush.gain.value = 0;
    const rushBand = ctx.createBiquadFilter();
    rushBand.type = 'bandpass'; rushBand.frequency.value = 1400; rushBand.Q.value = 0.5;
    this.rushBand = rushBand;
    noise.connect(rushBand).connect(this.rush).connect(this.bus);
  }

  // A decaying burst of stereo noise: a cheap, smooth hall.
  impulse(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * k); // darker as it fades
        d[i] = lp * Math.pow(1 - k, 2.6);
      }
    }
    return buf;
  }

  scheduleBell(delay) {
    clearTimeout(this.bellTimer);
    this.bellTimer = setTimeout(() => {
      if (this.enabled && this.ctx.state === 'running' && !document.hidden) this.bell();
      this.scheduleBell(5500 + Math.random() * 8000);
    }, delay);
  }

  bell() {
    const ctx = this.ctx, t = ctx.currentTime;
    const f = BELLS[Math.floor(Math.random() * BELLS.length)] * (Math.random() < 0.3 ? 0.5 : 1);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 2.005; // a quiet overtone
    const og = ctx.createGain(); og.gain.value = 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.038, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
    o.connect(g); o2.connect(og).connect(g);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan).connect(this.bus); } else g.connect(this.bus);
    o.start(t); o2.start(t);
    o.stop(t + 7.2); o2.stop(t + 7.2);
  }

  // ---------------------------------------------------------------- following the journey
  setMood(key) {
    if (!this.ctx || key === this.mood) return;
    this.mood = key;
    const m = MOODS[key] || MOODS.planet, t = this.ctx.currentTime;
    for (const v of this.voices) v.o.frequency.setTargetAtTime(m.root * v.ratio, t, 3);
    this.baseCutoff = m.cutoff;
    this.wet.gain.setTargetAtTime(m.wet, t, 3);
  }

  // streak: 0 to 1, how fast the ship is going; focus: the world you're at
  update(streak, focus) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastUpdate < 120) return;
    this.lastUpdate = now;
    this.setMood(focus?.deep ? 'deep' : MOODS[focus?.kind] ? focus.kind : 'planet');
    const t = this.ctx.currentTime;
    this.rush.gain.setTargetAtTime(streak * 0.16, t, 0.5);
    this.rushBand.frequency.setTargetAtTime(900 + streak * 2600, t, 0.6);
    this.tone.Q.setTargetAtTime(0.4 + streak * 1.2, t, 0.6);
    this.tone.frequency.setTargetAtTime((this.baseCutoff || 1500) + streak * 3500, t, 0.8); // opens up in flight
  }

  engage() { this.swellBy(1.35, 1.2); }
  arrive() { this.swellBy(1.8, 1.6); if (this.ctx?.state === 'running') this.bell(); }

  swellBy(gain, rise) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.swell.gain.cancelScheduledValues(t);
    this.swell.gain.setTargetAtTime(gain, t, rise / 3);
    this.swell.gain.setTargetAtTime(1, t + rise, 2.2);
  }

  // RMS of what is leaving the speakers, 0 to 1 (for tests and a possible meter)
  level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  }
}
