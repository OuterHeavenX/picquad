// audio.js — 100% WebAudio-synthesized SFX + generative music. Zero asset files.

import { save } from "./save.js";

let ctx = null;
let musicNodes = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// unlock on first gesture (called from main.js)
export function unlockAudio() {
  const boot = () => { try { ac(); } catch {} window.removeEventListener("pointerdown", boot); };
  window.addEventListener("pointerdown", boot, { once: false });
}

function sfxOn() { return save.d.settings.sfx; }

function tone({ freq = 440, dur = 0.12, type = "sine", vol = 0.22, when = 0, slideTo = null, attack = 0.005 }) {
  if (!sfxOn()) return;
  const c = ac(), t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise({ dur = 0.25, when = 0, vol = 0.18, from = 400, to = 4000, type = "bandpass", q = 1 }) {
  if (!sfxOn()) return;
  const c = ac(), t = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t); src.stop(t + dur + 0.05);
}

export const audio = {
  click()      { tone({ freq: 660, dur: 0.07, type: "triangle", vol: 0.18 }); },
  // selection pop: pitch rises with count 1..T
  pop(n, T)    { const f = 480 + (n / Math.max(1, T)) * 480; tone({ freq: f, dur: 0.1, type: "sine", vol: 0.24, slideTo: f * 1.25 }); },
  deselect()   { tone({ freq: 420, dur: 0.09, type: "sine", vol: 0.16, slideTo: 300 }); },
  groupSwap()  { tone({ freq: 520, dur: 0.08, type: "triangle", vol: 0.14 }); },
  whoosh()     { noise({ dur: 0.22, vol: 0.1, from: 500, to: 3800 }); },
  deal()       { noise({ dur: 0.12, vol: 0.07, from: 900, to: 2600 }); },

  // submit arpeggio, length scales with T
  arpeggio(T) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568];
    const n = Math.min(T + 1, scale.length);
    for (let i = 0; i < n; i++) tone({ freq: scale[i], dur: 0.16, type: "triangle", vol: 0.2, when: i * 0.07 });
  },
  // merge: warm chord + sparkle pings
  merge() {
    [261.63, 329.63, 392, 523.25].forEach(f => tone({ freq: f, dur: 0.5, type: "triangle", vol: 0.12 }));
    for (let i = 0; i < 6; i++) tone({ freq: 1800 + Math.random() * 1400, dur: 0.18, type: "sine", vol: 0.06, when: 0.1 + i * 0.05 });
  },
  thunk()      { tone({ freq: 150, dur: 0.16, type: "sine", vol: 0.3, slideTo: 70 }); },
  comboUp(n)   { tone({ freq: 700 + n * 120, dur: 0.14, type: "square", vol: 0.07 }); for (let i = 0; i < 3; i++) tone({ freq: 2200 + i * 500, dur: 0.1, type: "sine", vol: 0.05, when: i * 0.04 }); },
  power()      { tone({ freq: 880, dur: 0.12, type: "sine", vol: 0.18, slideTo: 1320 }); tone({ freq: 1320, dur: 0.18, type: "sine", vol: 0.14, when: 0.1 }); },
  tick()       { tone({ freq: 1050, dur: 0.05, type: "square", vol: 0.08 }); },
  denied()     { tone({ freq: 220, dur: 0.12, type: "sawtooth", vol: 0.08 }); },

  fanfare() {
    // I–V–vi–IV, chunky and happy
    const chords = [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63]];
    chords.forEach((ch, i) => ch.forEach(f => tone({ freq: f, dur: 0.42, type: "triangle", vol: 0.14, when: i * 0.22 })));
    for (let i = 0; i < 10; i++) tone({ freq: 2000 + Math.random() * 2000, dur: 0.2, type: "sine", vol: 0.05, when: 0.7 + i * 0.06 });
  },

  // gentle generative pad loop
  startMusic() {
    if (musicNodes || !save.d.settings.music) return;
    try {
      const c = ac();
      const master = c.createGain(); master.gain.value = 0.05; master.connect(c.destination);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
      const lfoG = c.createGain(); lfoG.gain.value = 0.02;
      lfo.connect(lfoG).connect(master.gain); lfo.start();
      const oscs = [110, 164.81, 220].map((f, i) => {
        const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = f * (i === 2 ? 1.003 : 1);
        o.connect(master); o.start(); return o;
      });
      // pentatonic plucks every ~7s
      const penta = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      const pluck = () => {
        if (!musicNodes) return;
        const t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = penta[Math.floor(Math.random() * penta.length)];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g).connect(master); o.start(t); o.stop(t + 2.4);
        musicNodes.timer = setTimeout(pluck, 5200 + Math.random() * 3600);
      };
      pluck();
      musicNodes = { master, oscs, lfo, timer: null };
    } catch { /* no audio */ }
  },

  stopMusic() {
    if (!musicNodes) return;
    try {
      clearTimeout(musicNodes.timer);
      musicNodes.master.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 0.4);
      const nodes = musicNodes; musicNodes = null;
      setTimeout(() => { nodes.oscs.forEach(o => { try { o.stop(); } catch {} }); try { nodes.lfo.stop(); } catch {} }, 500);
    } catch { musicNodes = null; }
  },
};
