// All sounds are synthesised with the Web Audio API, so there are no audio files to ship.

let ctx = null;
let noise = null;
let enabled = true;

export const sound = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; },
};

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = ctx.sampleRate * 1.5;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Unlock audio on the first touch (mobile browsers require a gesture).
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => ac(), { once: true, passive: true }));

function env(gain, t, attack, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBurst({ dur = 0.25, type = 'bandpass', f0 = 1200, f1 = 400, q = 1, peak = 0.35, attack = 0.02, delay = 0 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + attack + 0.05);
}

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', peak = 0.2, delay = 0, attack = 0.005 }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + attack + 0.05);
}

export const sfx = {
  tap() { tone({ freq: 900, to: 600, dur: 0.05, peak: 0.06, type: 'triangle' }); },
  // Cloth being folded: a soft fabric swish.
  fold() { noiseBurst({ dur: 0.22, f0: 2600, f1: 700, q: 0.8, peak: 0.28, attack: 0.03 }); },
  unfold() { noiseBurst({ dur: 0.28, f0: 600, f1: 2400, q: 0.7, peak: 0.22, attack: 0.05 }); },
  whoosh() { noiseBurst({ dur: 0.4, type: 'bandpass', f0: 400, f1: 1800, q: 0.6, peak: 0.18, attack: 0.12 }); },
  // Cloth landing on the shelf.
  thud() {
    tone({ freq: 140, to: 55, dur: 0.18, peak: 0.35 });
    noiseBurst({ dur: 0.08, type: 'lowpass', f0: 900, f1: 200, peak: 0.2, attack: 0.005 });
  },
  // Wooden almirah door creaking open.
  creak() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const dur = 0.75;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(115, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(90, t + dur);
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(22, t);
    lfo.frequency.linearRampToValueAtTime(34, t + dur);
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.5;
    const amp = c.createGain();
    amp.gain.value = 0.5;
    lfo.connect(lfoGain).connect(amp.gain);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.linearRampToValueAtTime(1500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
    g.gain.setValueAtTime(0.12, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(amp).connect(bp).connect(g).connect(c.destination);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  doorClose() {
    tone({ freq: 110, to: 50, dur: 0.22, peak: 0.4 });
    noiseBurst({ dur: 0.06, type: 'highpass', f0: 3000, f1: 2000, peak: 0.15, attack: 0.002, delay: 0.02 });
    tone({ freq: 2400, to: 1800, dur: 0.03, peak: 0.05, type: 'square', delay: 0.05 });
  },
  pop() { tone({ freq: 660, to: 990, dur: 0.09, peak: 0.12 }); },
  success() {
    tone({ freq: 784, dur: 0.12, peak: 0.12, type: 'triangle' });
    tone({ freq: 1175, dur: 0.18, peak: 0.12, type: 'triangle', delay: 0.1 });
  },
  error() { tone({ freq: 220, to: 160, dur: 0.18, peak: 0.12, type: 'square' }); },
  hanger() {
    tone({ freq: 2100, to: 1900, dur: 0.25, peak: 0.05, type: 'triangle' });
    tone({ freq: 3150, dur: 0.2, peak: 0.03, delay: 0.02 });
  },
};
