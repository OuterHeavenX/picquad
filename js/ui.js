// ui.js — DOM rendering for the jigsaw board. Frames + tile tray, drag-and-drop
// (pointer events) with tap-tap fallback. Game logic lives in game.js; user
// intent flows back through handlers registered in init().

import { CFG } from "./config.js";
import { save } from "./save.js";
import { audio } from "./audio.js";
import { particles } from "./particles.js";
import { wait, toast, centerOf, floater } from "./juice.js";
import { packIds, getManifest, getPicture, pictureURL, applyTileCSS } from "./pictures.js";
import { ADVENTURE_LEVELS } from "./levels.js";

const el = (id) => document.getElementById(id);
let H = {}; // handlers
let selectedTrayIdx = null;
let drag = null;
let slotRects = [];

// ================= init / screens =================

export function init(handlers) {
  H = handlers;

  el("btn-play").onclick = () => { audio.click(); renderLevelGrid(); showScreen("levels"); };
  el("btn-daily").onclick = () => { audio.click(); H.daily(); };
  el("btn-blitz").onclick = () => { audio.click(); H.blitz(); };
  el("btn-gallery").onclick = () => { audio.click(); renderGallery(); showScreen("gallery"); };
  el("btn-howto").onclick = () => { audio.click(); showHowTo(); };
  el("btn-settings").onclick = () => { audio.click(); syncSettings(); showScreen("settings"); };

  el("btn-levels-back").onclick = () => { audio.click(); refreshTitle(); showScreen("title"); };
  el("btn-gallery-back").onclick = () => { audio.click(); refreshTitle(); showScreen("title"); };
  el("btn-settings-back").onclick = () => { audio.click(); refreshTitle(); showScreen("title"); };

  el("btn-pause").onclick = () => H.pause();
  el("pow-hint").onclick = () => H.hint();
  el("pow-shuffle").onclick = () => H.shuffle();
  el("pow-peek").onclick = () => H.peek();

  for (const key of ["sfx", "music", "vibration"]) {
    el("set-" + key).onchange = (e) => {
      save.d.settings[key] = e.target.checked;
      save.write();
      audio.click();
      if (key === "music") { e.target.checked ? audio.startMusic() : audio.stopMusic(); }
    };
  }
  let armReset = false;
  el("btn-reset-save").onclick = (e) => {
    if (!armReset) {
      armReset = true;
      e.target.textContent = "Tap again to confirm";
      setTimeout(() => { armReset = false; e.target.textContent = "Reset all progress"; }, 3000);
      return;
    }
    save.reset();
    armReset = false;
    e.target.textContent = "Reset all progress";
    syncSettings(); refreshTitle();
    toast("Progress wiped clean.");
  };
}

export function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  el("screen-" + name).classList.add("active");
}

export function refreshTitle() {
  const best = save.d.best.blitz;
  const streak = save.d.daily.streak;
  el("best-line").textContent =
    (best > 0 ? `⚡ Blitz best: ${best}` : "") +
    (best > 0 && streak > 0 ? " · " : "") +
    (streak > 0 ? `📅 ${streak}-day streak 🔥` : "");
  const badge = el("daily-streak-badge");
  if (streak > 0) { badge.textContent = `🔥${streak}`; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");
}

export function renderLevelGrid() {
  const grid = el("level-grid");
  grid.innerHTML = "";
  for (let n = 1; n <= ADVENTURE_LEVELS; n++) {
    const locked = n > save.d.maxUnlocked;
    const stars = save.d.stars[n] || 0;
    const b = document.createElement("button");
    b.className = "level-node" + (locked ? " locked" : "") + (stars ? " done" : "");
    b.innerHTML = locked ? `${n}` :
      `${n}<span class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span><span class="tile-tag">${n >= 26 ? "3×2" : "2×2"}</span>`;
    if (!locked) b.onclick = () => { audio.click(); H.selectLevel(n); };
    grid.appendChild(b);
  }
}

// ================= board: frames + tray =================

export function setupBoard(state) {
  selectedTrayIdx = null;
  drag = null;
  el("frames").innerHTML = "";
  el("tray").innerHTML = "";
}

function tileAspect(state) {
  return `${state.level.tileRows} / ${state.level.tileCols}`;
}

export function renderFrames(state, { animateIn = false } = {}) {
  const wrap = el("frames");
  wrap.innerHTML = "";
  state.frames.forEach((frame, fi) => {
    const f = document.createElement("div");
    f.className = "frame";
    const shouldAnimate = animateIn === true ||
      (Array.isArray(animateIn) && animateIn.includes(frame.picId));
    if (shouldAnimate) f.classList.add("frame-in");
    f.style.setProperty("--frame-cols", state.level.tileCols);
    f.style.setProperty("--tile-ar", tileAspect(state));
    frame.slots.forEach((card, si) => {
      const s = document.createElement("div");
      s.className = "fslot" + (card ? " filled" : "");
      s.dataset.frame = fi;
      s.dataset.slot = si;
      s.dataset.pic = frame.picId;
      s.dataset.tile = si;
      if (card) {
        const face = document.createElement("div");
        face.className = "card-face front";
        const full = getPicture(state.level.packId, card.picId);
        applyTileCSS(face, state.level.packId, full, card.tile, state.level.tileCols, state.level.tileRows);
        s.appendChild(face);
      } else {
        // tap-tap target: pointerup (a drag released here is captured by the
        // tile, so this only fires for direct taps)
        s.addEventListener("pointerup", onSlotPointerUp);
      }
      f.appendChild(s);
    });
    wrap.appendChild(f);
  });
}

export function slotElement(frameIdx, slotIdx) {
  const frameEl = el("frames").children[frameIdx];
  if (!frameEl) return null;
  return frameEl.querySelectorAll(".fslot")[slotIdx] || null;
}

export function frameCenter(frameIdx) {
  const frameEl = el("frames").children[frameIdx];
  return frameEl ? centerOf(frameEl) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export function renderTray(state, { dealAnimate = [] } = {}) {
  const tray = el("tray");
  tray.innerHTML = "";
  tray.style.setProperty("--tile-ar", tileAspect(state));
  const animSet = new Set(dealAnimate);
  let k = 0;
  state.tray.forEach((card, i) => {
    const slot = document.createElement("div");
    slot.className = "tray-slot";
    if (card) {
      const t = document.createElement("div");
      t.className = "tray-tile";
      t.dataset.tray = i;
      t.dataset.pic = card.picId;
      t.dataset.tile = card.tile;
      const full = getPicture(state.level.packId, card.picId);
      applyTileCSS(t, state.level.packId, full, card.tile, state.level.tileCols, state.level.tileRows);
      if (animSet.has(i)) {
        t.classList.add("dealt");
        t.style.animationDelay = (k++ * CFG.dealStaggerMs) + "ms";
      }
      makeDraggable(t, i);
      slot.appendChild(t);
    }
    tray.appendChild(slot);
  });
  selectedTrayIdx = null;
}

function trayTileEl(trayIdx) {
  return el("tray").querySelector(`.tray-tile[data-tray="${trayIdx}"]`);
}

// ================= selection (tap-tap) =================

function clearTileSelection() {
  selectedTrayIdx = null;
  document.querySelectorAll(".tray-tile.selected").forEach(t => t.classList.remove("selected"));
}

function toggleTileSelection(trayIdx, tileEl) {
  if (selectedTrayIdx === trayIdx) {
    clearTileSelection();
    audio.deselect();
  } else {
    clearTileSelection();
    selectedTrayIdx = trayIdx;
    tileEl.classList.add("selected");
    audio.pop(1, 2);
  }
}

function onSlotPointerUp(e) {
  if (selectedTrayIdx == null) return;
  const s = e.currentTarget;
  if (s.classList.contains("filled")) return;
  const trayIdx = selectedTrayIdx;
  const res = H.tryPlace(trayIdx, +s.dataset.frame, +s.dataset.slot);
  clearTileSelection();
  if (!res.ok) {
    const tileEl = trayTileEl(trayIdx);
    if (tileEl) {
      tileEl.classList.add("wobble");
      setTimeout(() => tileEl.classList.remove("wobble"), 340);
    }
    return;
  }
  afterPlaced({ frameIdx: +s.dataset.frame, slotIdx: +s.dataset.slot }, res);
}

// ================= drag & drop =================

function makeDraggable(tileEl, trayIdx) {
  tileEl.addEventListener("pointerdown", (e) => onTilePointerDown(e, trayIdx, tileEl));
}

function onTilePointerDown(e, trayIdx, tileEl) {
  const S = H.getState();
  if (!S || S.phase !== "playing") return;
  e.preventDefault();
  try { tileEl.setPointerCapture(e.pointerId); } catch {}
  drag = { trayIdx, tileEl, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false, pointerId: e.pointerId };
  tileEl.addEventListener("pointermove", onTilePointerMove);
  tileEl.addEventListener("pointerup", onTilePointerUp, { once: true });
  tileEl.addEventListener("pointercancel", onTilePointerCancel, { once: true });
}

function cacheSlotRects() {
  slotRects = [];
  document.querySelectorAll("#frames .fslot:not(.filled)").forEach(s => {
    slotRects.push({
      frameIdx: +s.dataset.frame, slotIdx: +s.dataset.slot,
      el: s, rect: s.getBoundingClientRect(),
    });
  });
}

function slotAt(x, y) {
  return slotRects.find(s => x >= s.rect.left && x <= s.rect.right && y >= s.rect.top && y <= s.rect.bottom) || null;
}

function highlightSlotAt(x, y) {
  const hit = slotAt(x, y);
  document.querySelectorAll(".fslot.drop-ok").forEach(s => s.classList.remove("drop-ok"));
  if (hit) hit.el.classList.add("drop-ok");
  return hit;
}

function onTilePointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
  if (!drag.active && Math.hypot(dx, dy) > 10) {
    drag.active = true;
    drag.tileEl.classList.add("dragging");
    clearTileSelection();
    cacheSlotRects();
    audio.click();
  }
  if (drag.active) {
    drag.dx = dx; drag.dy = dy;
    drag.tileEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
    highlightSlotAt(e.clientX, e.clientY);
  }
}

function onTilePointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  d.tileEl.classList.remove("dragging");
  document.querySelectorAll(".fslot.drop-ok").forEach(s => s.classList.remove("drop-ok"));
  if (d.active) {
    const hit = slotAt(e.clientX, e.clientY);
    if (hit) dropTile(d, hit);
    else {
      // no target: glide back home
      d.tileEl.style.transition = "transform .28s cubic-bezier(.34,1.56,.64,1)";
      d.tileEl.style.transform = "";
      setTimeout(() => { d.tileEl.style.transition = ""; }, 300);
    }
  } else {
    toggleTileSelection(d.trayIdx, d.tileEl); // plain tap
  }
}

function onTilePointerCancel() {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.tileEl.classList.remove("dragging");
  d.tileEl.style.transition = "transform .25s ease";
  d.tileEl.style.transform = "";
  setTimeout(() => { d.tileEl.style.transition = ""; }, 260);
  document.querySelectorAll(".fslot.drop-ok").forEach(s => s.classList.remove("drop-ok"));
}

async function dropTile(d, hit) {
  const res = H.tryPlace(d.trayIdx, hit.frameIdx, hit.slotIdx);
  const tileEl = d.tileEl;
  if (!res.ok) {
    tileEl.style.transition = "transform .3s cubic-bezier(.34,1.8,.64,1)";
    tileEl.style.transform = "";
    tileEl.classList.add("wobble");
    setTimeout(() => { tileEl.classList.remove("wobble"); tileEl.style.transition = ""; }, 340);
    return;
  }
  // success: fly the tile into its slot, then re-render
  const slotEl = slotElement(hit.frameIdx, hit.slotIdx);
  if (slotEl) {
    const r = slotEl.getBoundingClientRect();
    const scale = r.width / (tileEl.offsetWidth || r.width);
    const targetDx = d.dx + (r.left + r.width / 2) - (d.startX + tileEl.offsetWidth / 2);
    const targetDy = d.dy + (r.top + r.height / 2) - (d.startY + tileEl.offsetHeight / 2);
    tileEl.style.transition = `transform ${CFG.snapMs}ms cubic-bezier(.3,.7,.3,1)`;
    tileEl.style.transform = `translate(${targetDx}px, ${targetDy}px) scale(${scale})`;
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setTimeout(() => particles.sparkle(c.x, c.y, "#ffd97a"), CFG.snapMs * 0.7);
    await wait(CFG.snapMs);
  }
  afterPlaced(hit, res);
}

function afterPlaced(hit, res) {
  const S = H.getState();
  renderFrames(S);
  renderTray(S);
  updateHUD(S);
  updateDeckStrip(S);
  if (res.pts) {
    const slotEl = slotElement(hit.frameIdx, hit.slotIdx);
    if (slotEl) {
      const c = centerOf(slotEl);
      floater(`+${res.pts}`, c.x, c.y - 16);
      if (res.combo >= 2) setTimeout(() => floater(`COMBO ×${res.combo}`, c.x, c.y - 52, "combo"), 120);
    }
  }
  if (res.completedPicId) H.pictureComplete(hit.frameIdx);
  else H.topUp();
}

// ================= celebration =================

export async function celebrateFrame(S, frameIdx, pic) {
  const frameEl = el("frames").children[frameIdx];
  if (frameEl) frameEl.classList.add("celebrating");
  await wait(CFG.celebrateMs);
  await showAssembled(S.level.packId, pic);
}

// full-picture celebration: show, hold, fly to deck tray
export async function showAssembled(packId, pic) {
  const fc = centerOf(el("frames"));
  const size = Math.min(window.innerWidth * 0.74, 300);
  const d = document.createElement("div");
  d.className = "assembled";
  d.style.cssText = `width:${size}px;height:${size}px;left:${fc.x - size / 2}px;top:${fc.y - size / 2}px;background-image:url("${pictureURL(packId, pic)}")`;
  const cap = document.createElement("div");
  cap.className = "assembled-caption";
  cap.textContent = pic.title;
  cap.style.left = fc.x + "px";
  cap.style.top = fc.y + size / 2 + 26 + "px";
  document.body.appendChild(d);
  document.body.appendChild(cap);
  await wait(CFG.assembledHoldMs);
  cap.style.transition = "opacity .3s"; cap.style.opacity = "0";
  setTimeout(() => cap.remove(), 320);
  const tray = centerOf(el("deck-strip"));
  const dx = tray.x - fc.x, dy = tray.y - fc.y;
  d.classList.add("out");
  await d.animate(
    [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: 0.6 }],
    { duration: 420, easing: "cubic-bezier(.4,.6,.4,1)", fill: "forwards" }
  ).finished.catch(() => {});
  d.remove();
}

export function flashSlot(frameIdx, slotIdx) {
  const s = slotElement(frameIdx, slotIdx);
  if (!s) return;
  s.classList.add("hint");
  setTimeout(() => s.classList.remove("hint"), CFG.hintDurationMs);
}

// ================= HUD =================

export function updateHUD(state) {
  el("hud-score").textContent = state.score;
  const done = state.completed.size, total = state.picIds.length;
  el("hud-progress").innerHTML = `<b>${done}</b>/${total}`;
  for (const k of ["hint", "shuffle", "peek"]) {
    const n = state.powerups[k];
    el(`pow-${k}-n`).textContent = n;
    el(`pow-${k}`).classList.toggle("depleted", n <= 0);
  }
  updateCombo(state.combo, state.comboExpires - performance.now(), CFG.comboWindowMs);
}

export function updateCombo(combo, remainMs, windowMs) {
  const pct = Math.max(0, Math.min(100, (remainMs / windowMs) * 100));
  el("combo-fill").style.width = pct + "%";
  el("combo-text").textContent = combo >= 2 ? `×${combo} COMBO` : "";
  el("combo-text").parentElement.classList.toggle("hot", combo >= 5);
}

export function updateDeckStrip(state) {
  const left = state.pictureQueue.length; // pictures not yet completed
  const minis = Math.min(5, left);
  el("deck-cards").innerHTML = Array.from({ length: minis }, () => `<div class="deck-mini"></div>`).join("");
  el("deck-count").innerHTML = `<b>${left}</b> picture${left === 1 ? "" : "s"} left`;
}

export function setBlitzVisible(v) { el("blitz-timer").classList.toggle("hidden", !v); }
export function updateBlitz(left, total) {
  el("blitz-fill").style.width = Math.max(0, (left / total) * 100) + "%";
  el("blitz-timer").classList.toggle("urgent", left <= 10);
}

// ================= gallery =================

let galleryTab = null;

export function renderGallery() {
  const tabs = el("pack-tabs");
  tabs.innerHTML = "";
  if (!galleryTab || !packIds().includes(galleryTab)) galleryTab = packIds()[0];
  for (const pid of packIds()) {
    const man = getManifest(pid);
    const got = (save.d.gallery[pid] || []).length;
    const b = document.createElement("button");
    b.className = "pack-tab" + (pid === galleryTab ? " active" : "");
    b.textContent = `${man.title} ${got}/${man.pictures.length}`;
    b.onclick = () => { audio.click(); galleryTab = pid; renderGallery(); };
    tabs.appendChild(b);
  }
  const grid = el("gallery-grid");
  grid.innerHTML = "";
  const man = getManifest(galleryTab);
  const owned = new Set(save.d.gallery[galleryTab] || []);
  for (const p of man.pictures) {
    const t = document.createElement("div");
    const has = owned.has(p.id);
    t.className = "g-thumb" + (has ? "" : " locked");
    if (has) {
      t.style.backgroundImage = `url("${pictureURL(galleryTab, p)}")`;
      t.innerHTML = `<div class="g-title">${p.title}</div>`;
      t.onclick = () => showPictureModal(galleryTab, p);
    }
    grid.appendChild(t);
  }
}

function showPictureModal(packId, pic) {
  openModal(`
    <img class="peek-img" src="${pictureURL(packId, pic)}" alt="${pic.title}">
    <h2 style="margin-top:10px">${pic.title}</h2>
    <p>${getManifest(packId).title}</p>
    <button class="btn btn-primary" data-close>Close</button>
  `);
}

// ================= modals =================

export function openModal(html, { veilClose = true } = {}) {
  const root = el("modal-root");
  root.innerHTML = `<div class="modal-veil"><div class="modal">${html}</div></div>`;
  const veil = root.firstElementChild;
  if (veilClose) veil.addEventListener("pointerdown", (e) => { if (e.target === veil) closeModal(); });
  root.querySelectorAll("[data-close]").forEach(b => b.onclick = () => { audio.click(); closeModal(); });
  return veil;
}

export function closeModal() { el("modal-root").innerHTML = ""; }

export function showPause(mode) {
  const v = openModal(`
    <h2>⏸ Paused</h2>
    <p>Take a breather. The tiles will wait.</p>
    <button class="btn btn-primary" id="m-resume">Resume</button>
    <button class="btn" id="m-restart">↻ Restart</button>
    <button class="btn" id="m-howto">❓ How to play</button>
    <button class="btn btn-danger" id="m-quit">${mode === "adventure" ? "Level select" : "Quit to title"}</button>
  `, { veilClose: false });
  v.querySelector("#m-resume").onclick = () => H.resume();
  v.querySelector("#m-restart").onclick = () => H.restart();
  v.querySelector("#m-howto").onclick = () => { showHowTo(); };
  v.querySelector("#m-quit").onclick = () => H.quit();
}

export function showLevelComplete({ stars, base, comboBonus, pictureBonus, cleanBonus, total, accuracy, packId, picIds, hasNext }) {
  const man = getManifest(packId);
  const mosaic = picIds.map((id, i) => {
    const p = man.pictures.find(x => x.id === id);
    return `<img src="${pictureURL(packId, p)}" style="animation-delay:${i * 45}ms" alt="">`;
  }).join("");
  const v = openModal(`
    <h2>Level Complete! 🎉</h2>
    <div class="star-row">${[1, 2, 3].map(i => `<span class="${i <= stars ? "lit" : "dim"}">★</span>`).join("")}</div>
    <div class="score-lines">
      <div class="sl"><span>Tiles placed</span><b>+${base}</b></div>
      <div class="sl"><span>Combo bonus</span><b>+${comboBonus}</b></div>
      <div class="sl"><span>Pictures</span><b>+${pictureBonus}</b></div>
      ${cleanBonus ? `<div class="sl"><span>Clean hands ✨</span><b>+${cleanBonus}</b></div>` : ""}
      <div class="sl"><span>Accuracy</span><b>${accuracy}%</b></div>
      <div class="sl total"><span>Total</span><b>${total}</b></div>
    </div>
    <div class="mosaic">${mosaic}</div>
    ${hasNext ? `<button class="btn btn-primary" id="m-next">Next level →</button>` : `<p>🏆 You finished every level!</p>`}
    <button class="btn" id="m-replay">↻ Replay</button>
    <button class="btn" id="m-map">Level select</button>
  `, { veilClose: false });
  if (hasNext) v.querySelector("#m-next").onclick = () => { audio.click(); H.nextLevel(); };
  v.querySelector("#m-replay").onclick = () => H.restart();
  v.querySelector("#m-map").onclick = () => H.quit();
}

export function showDailyComplete({ total, streak, packId, picIds }) {
  const man = getManifest(packId);
  const mosaic = picIds.slice(0, 8).map((id, i) => {
    const p = man.pictures.find(x => x.id === id);
    return `<img src="${pictureURL(packId, p)}" style="animation-delay:${i * 45}ms" alt="">`;
  }).join("");
  const v = openModal(`
    <h2>Daily Complete! 📅</h2>
    <p>🔥 <b>${streak}-day streak!</b> Come back tomorrow.</p>
    <div class="score-lines"><div class="sl total"><span>Score</span><b>${total}</b></div></div>
    <div class="mosaic">${mosaic}</div>
    <button class="btn btn-primary" id="m-title">Title</button>
  `, { veilClose: false });
  v.querySelector("#m-title").onclick = () => { audio.click(); closeModal(); refreshTitle(); showScreen("title"); };
}

export function showBlitzComplete({ score, best, isBest }) {
  const v = openModal(`
    <h2>⏱ Time!</h2>
    ${isBest ? `<p>🏆 <b>NEW BEST!</b></p>` : ""}
    <div class="score-lines">
      <div class="sl total"><span>Score</span><b>${score}</b></div>
      <div class="sl"><span>Best</span><b>${best}</b></div>
    </div>
    <button class="btn btn-primary" id="m-retry">⚡ Go again</button>
    <button class="btn" id="m-title">Title</button>
  `, { veilClose: false });
  v.querySelector("#m-retry").onclick = () => H.restart();
  v.querySelector("#m-title").onclick = () => { audio.click(); closeModal(); refreshTitle(); showScreen("title"); };
}

export function showPeek(packId, pic) {
  openModal(`
    <img class="peek-img" src="${pictureURL(packId, pic)}" alt="">
    <h2 style="margin-top:10px">${pic.title}</h2>
    <p>Memorize those tiles…</p>
  `, { veilClose: false });
  setTimeout(closeModal, 2500);
}

export function showHowTo() {
  openModal(`
    <h2>How to play</h2>
    <div class="howto-steps">
      <div class="howto-step"><span class="n">1</span><p><b>Drag tiles</b> from the tray into the picture frames — or tap a tile, then tap a slot.</p></div>
      <div class="howto-step"><span class="n">2</span><p>Each tile must match the picture <b>and the exact spot</b>. Wrong spot bounces back!</p></div>
      <div class="howto-step"><span class="n">3</span><p>New pictures arrive mid-game and <b>tiles drip in over time</b> — plan around what's missing.</p></div>
      <div class="howto-step"><span class="n">×</span><p>Chain quick placements for a <b>combo multiplier</b> up to ×8. Misplaces break it!</p></div>
    </div>
    <button class="btn btn-primary" data-close>Got it!</button>
  `);
  save.d.seenHowTo = true;
  save.write();
}

function syncSettings() {
  for (const key of ["sfx", "music", "vibration"]) el("set-" + key).checked = !!save.d.settings[key];
}
