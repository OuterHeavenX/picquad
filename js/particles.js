// particles.js — canvas confetti / sparkle / bokeh engine. pointer-events: none overlay.

import { CFG } from "./config.js";

const canvas = document.getElementById("fx");
const g = canvas.getContext("2d");
let parts = [];
let bokeh = [];
let rafId = 0;
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function seedBokeh() {
  bokeh = Array.from({ length: 22 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: 8 + Math.random() * 26,
    vx: (Math.random() - 0.5) * 0.14, vy: -0.08 - Math.random() * 0.2,
    a: 0.03 + Math.random() * 0.05,
    hue: [45, 330, 170, 210][Math.floor(Math.random() * 4)],
  }));
}
seedBokeh();

function add(p) {
  if (parts.length >= CFG.particleCap) parts.splice(0, parts.length - CFG.particleCap + 1);
  parts.push(p);
}

function loop() {
  g.clearRect(0, 0, W, H);
  // ambient bokeh
  for (const b of bokeh) {
    b.x += b.vx; b.y += b.vy;
    if (b.y < -40) { b.y = H + 40; b.x = Math.random() * W; }
    if (b.x < -40) b.x = W + 40; if (b.x > W + 40) b.x = -40;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7);
    g.fillStyle = `hsla(${b.hue}, 70%, 65%, ${b.a})`;
    g.fill();
  }
  // particles
  const now = performance.now();
  parts = parts.filter(p => now < p.die);
  for (const p of parts) {
    const t = 1 - (p.die - now) / p.life;
    if (p.draw) { p.draw(Math.min(1, Math.max(0, t))); continue; }
    p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.985; p.rot += p.vr;
    const a = p.fade ? (1 - t) * p.a : p.a;
    g.save();
    g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.max(0, a);
    if (p.shape === "circle") {
      g.beginPath(); g.arc(0, 0, p.size * (1 - t * 0.5), 0, 7); g.fillStyle = p.color; g.fill();
    } else if (p.shape === "spark") {
      g.strokeStyle = p.color; g.lineWidth = 2;
      const s = p.size * (1 - t);
      g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
    } else {
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    }
    g.restore();
  }
  rafId = requestAnimationFrame(loop);
}

export const particles = {
  start() { if (!rafId) loop(); },

  burst(x, y, { n = 24, colors = ["#f5b942", "#ff70a6", "#5ec8b4", "#8ecae6"], speed = 5, size = 7, grav = 0.12, life = 1100 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.85);
      add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        grav, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.3,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        shape: Math.random() < 0.25 ? "circle" : "rect",
        a: 0.95, fade: true, life: life * (0.7 + Math.random() * 0.6), die: performance.now() + life,
      });
    }
  },

  confettiRain(n = 160) {
    const colors = ["#f5b942", "#ff70a6", "#5ec8b4", "#8ecae6", "#b388eb", "#fff7e8"];
    for (let i = 0; i < n; i++) {
      add({
        x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 1.4, vy: 1.6 + Math.random() * 2.6,
        grav: 0.015, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.25,
        size: 6 + Math.random() * 7, color: colors[i % colors.length],
        shape: "rect", a: 0.95, fade: false, life: 4200, die: performance.now() + 4200,
      });
    }
  },

  flash(x, y, { color = "#ffffff", maxR = 130, life = 380 } = {}) {
    const t0 = performance.now();
    add({
      x, y, vx: 0, vy: 0, grav: 0, rot: 0, vr: 0, size: 10, color,
      shape: "flash", a: 0.85, fade: true, life, die: t0 + life,
      draw(t) {
        const r = maxR * t;
        g.save(); g.globalAlpha = (1 - t) * 0.85;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, color); grad.addColorStop(1, "transparent");
        g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
      },
    });
  },

  sparkle(x, y, color = "#ffd97a") {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4;
      add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grav: 0,
        rot: 0, vr: 0, size: 4 + Math.random() * 5, color,
        shape: "spark", a: 0.9, fade: true, life: 500, die: performance.now() + 500,
      });
    }
  },

  trail(x, y, color) {
    add({
      x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14,
      vx: 0, vy: -0.6, grav: 0, rot: 0, vr: 0, size: 3 + Math.random() * 4,
      color, shape: "circle", a: 0.7, fade: true, life: 420, die: performance.now() + 420,
    });
  },
};

// start ambient loop on load
particles.start();
