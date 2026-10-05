// juice.js — tweens, screen shake, floating score text, haptics.

import { CFG } from "./config.js";
import { save } from "./save.js";

export const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth; // restart animation
  el.classList.add("shake");
}

export function haptic(ms = 15) {
  if (!save.d.settings.vibration) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch {}
}

export function floater(text, x, y, cls = "") {
  const el = document.createElement("div");
  el.className = "floater " + cls;
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.body.appendChild(el);
  el.animate([
    { transform: "translate(-50%,-50%) scale(.5)", opacity: 0 },
    { transform: "translate(-50%,-70%) scale(1.15)", opacity: 1, offset: 0.25 },
    { transform: "translate(-50%,-160%) scale(1)", opacity: 0 },
  ], { duration: 1100, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => el.remove();
}

export function toast(msg, ms = 1800) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, ms);
}

// bump animation helper for score
export function bump(el) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

// center of an element in client coords
export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
