// ui.js — DOM rendering. Owns screens, HUD, grid DOM, animations, modals.
// Pure view layer: game.js drives it via these functions; user input flows back
// through handlers registered in init().

import { CFG } from "./config.js";
import { save } from "./save.js";
import { audio } from "./audio.js";
import { wait, toast, centerOf } from "./juice.js";
import { packIds, getManifest, pictureURL, applyTileCSS } from "./pictures.js";
import { ADVENTURE_LEVELS } from "./levels.js";

const el = (id) => document.getElementById(id);
let H = {}; // handlers

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

// ---------------- level select ----------------

export function renderLevelGrid() {
  const grid = el("level-grid");
  grid.innerHTML = "";
  for (let n = 1; n <= ADVENTURE_LEVELS; n++) {
    const locked = n > save.d.maxUnlocked;
    const stars = save.d.stars[n] || 0;
    const band2 = n >= 26;
    const b = document.createElement("button");
    b.className = "level-node" + (locked ? " locked" : "") + (stars ? " done" : "");
    b.innerHTML = locked ? `${n}` :
      `${n}<span class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span><span class="tile-tag">${band2 ? "3×2" : "2×2"}</span>`;
    if (!locked) b.onclick = () => { audio.click(); H.selectLevel(n); };
    grid.appendChild(b);
  }
}

// ---------------- board ----------------

export function setupBoard(state) {
  const grid = el("grid");
  grid.style.setProperty("--grid-cols", state.level.gridCols);
  // tile aspect = R/C (tile is 1/C wide, 1/R tall of the square picture)
  grid.style.setProperty("--tile-ar", `${state.level.tileRows} / ${state.level.tileCols}`);
  grid.innerHTML = "";
}

export function cardEl(idx) { return el("grid").children[idx]; }

function buildCard(state, idx) {
  const card = state.slots[idx];
  const wrap = document.createElement("div");
  if (!card) { wrap.className = "slot-empty"; return wrap; }
  wrap.className = "card";
  wrap.innerHTML = `<div class="card-inner"><div class="card-face front"></div><div class="card-face back"></div></div>`;
  const front = wrap.querySelector(".front");
  // resolve via manifest for the real file name
  const man = getManifest(state.level.packId);
  const full = man.pictures.find(p => p.id === card.picId);
  applyTileCSS(front, state.level.packId, full, card.tile, state.level.tileCols, state.level.tileRows);
  wrap.onclick = () => H.cardTap(idx);
  return wrap;
}

export function renderGrid(state, { dealAnimate = [] } = {}) {
  const grid = el("grid");
  grid.innerHTML = "";
  const animSet = new Set(dealAnimate);
  let k = 0;
  state.slots.forEach((_, idx) => {
    const node = buildCard(state, idx);
    if (node.classList.contains("card") && animSet.has(idx)) {
      node.classList.add("dealt");
      node.querySelector(".card-inner").style.animationDelay = (k++ * CFG.dealStaggerMs) + "ms";
    }
    grid.appendChild(node);
  });
  renderSelection(state);
}

export function renderSelection(state) {
  const grid = el("grid");
  state.slots.forEach((_, idx) => {
    const node = grid.children[idx];
    if (!node || !node.classList.contains("card")) return;
    const pos = state.selected.indexOf(idx);
    node.classList.toggle("selected", pos !== -1);
    if (pos !== -1) node.setAttribute("data-n", pos + 1);
    else node.removeAttribute("data-n");
  });
}

export function markSubmitting(idxs) {
  for (const i of idxs) {
    const node = cardEl(i);
    if (node && node.classList.contains("card")) {
      node.classList.remove("selected");
      node.classList.add("submitting");
    }
  }
}

// animate a card flying to (x,y); resolves when done
export function flyCardTo(slotIdx, x, y, delayMs = 0) {
  const node = cardEl(slotIdx);
  if (!node) return Promise.resolve();
  const r = node.getBoundingClientRect();
  const dx = x - (r.left + r.width / 2);
  const dy = y - (r.top + r.height / 2);
  node.style.zIndex = 50;
  const anim = node.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(.8)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0.9 },
    ],
    { duration: CFG.flyDurationMs, delay: delayMs, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }
  );
  return anim.finished.catch(() => {});
}

export function clearCards(idxs) {
  for (const i of idxs) {
    const node = cardEl(i);
    if (!node) continue;
    const ph = document.createElement("div");
    ph.className = "slot-empty";
    node.replaceWith(ph);
  }
}

// full-picture celebration: show, hold, fly to deck tray
export async function showAssembled(packId, pic) {
  const gridC = centerOf(el("grid"));
  const size = Math.min(window.innerWidth * 0.74, 300);
  const d = document.createElement("div");
  d.className = "assembled";
  d.style.cssText = `width:${size}px;height:${size}px;left:${gridC.x - size / 2}px;top:${gridC.y - size / 2}px;background-image:url("${pictureURL(packId, pic)}")`;
  const cap = document.createElement("div");
  cap.className = "assembled-caption";
  cap.textContent = pic.title;
  cap.style.left = gridC.x + "px";
  cap.style.top = gridC.y + size / 2 + 26 + "px";
  document.body.appendChild(d);
  document.body.appendChild(cap);
  await wait(CFG.assembledHoldMs);
  cap.style.transition = "opacity .3s"; cap.style.opacity = "0";
  setTimeout(() => cap.remove(), 320);
  // fly to deck strip
  const tray = centerOf(el("deck-strip"));
  const dx = tray.x - gridC.x, dy = tray.y - gridC.y;
  d.classList.add("out");
  await d.animate(
    [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: 0.6 }],
    { duration: 420, easing: "cubic-bezier(.4,.6,.4,1)", fill: "forwards" }
  ).finished.catch(() => {});
  d.remove();
}

export function flashHint(idxs) {
  for (const i of idxs) {
    const node = cardEl(i);
    if (node && node.classList.contains("card")) node.classList.add("hint");
  }
  setTimeout(() => {
    for (const i of idxs) {
      const node = cardEl(i);
      if (node) node.classList.remove("hint");
    }
  }, CFG.hintDurationMs);
}

// ---------------- HUD ----------------

export function updateHUD(state, mi) {
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
  const onBoard = new Set();
  state.slots.forEach(c => { if (c) onBoard.add(c.picId); });
  const left = state.pictureQueue.length + onBoard.size;
  const minis = Math.min(5, left);
  el("deck-cards").innerHTML = Array.from({ length: minis }, () => `<div class="deck-mini"></div>`).join("");
  el("deck-count").innerHTML = `<b>${left}</b> picture${left === 1 ? "" : "s"} left`;
}

export function setBlitzVisible(v) { el("blitz-timer").classList.toggle("hidden", !v); }
export function updateBlitz(left, total) {
  el("blitz-fill").style.width = Math.max(0, (left / total) * 100) + "%";
  el("blitz-timer").classList.toggle("urgent", left <= 10);
}

// ---------------- gallery ----------------

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

// ---------------- modals ----------------

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

export function showLevelComplete({ stars, base, comboBonus, cleanBonus, total, packId, picIds, hasNext }) {
  const man = getManifest(packId);
  const mosaic = picIds.map((id, i) => {
    const p = man.pictures.find(x => x.id === id);
    return `<img src="${pictureURL(packId, p)}" style="animation-delay:${i * 45}ms" alt="">`;
  }).join("");
  const v = openModal(`
    <h2>Level Complete! 🎉</h2>
    <div class="star-row">${[1, 2, 3].map(i => `<span class="${i <= stars ? "lit" : "dim"}">★</span>`).join("")}</div>
    <div class="score-lines">
      <div class="sl"><span>Pictures</span><b>+${base}</b></div>
      <div class="sl"><span>Combo bonus</span><b>+${comboBonus}</b></div>
      ${cleanBonus ? `<div class="sl"><span>Clean hands ✨</span><b>+${cleanBonus}</b></div>` : ""}
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
      <div class="howto-step"><span class="n">1</span><p><b>Tap tiles</b> to select them. Each picture is split into tiles — find them all.</p></div>
      <div class="howto-step"><span class="n">2</span><p>Select <b>every tile of one picture</b> and they fly together and merge. ✨</p></div>
      <div class="howto-step"><span class="n">3</span><p>Fresh tiles deal in. <b>Clear the whole deck</b> to finish the level!</p></div>
      <div class="howto-step"><span class="n">×</span><p>Chain quick completes for a <b>combo multiplier</b> up to ×8.</p></div>
    </div>
    <button class="btn btn-primary" data-close>Got it!</button>
  `);
  save.d.seenHowTo = true;
  save.write();
}

function syncSettings() {
  for (const key of ["sfx", "music", "vibration"]) el("set-" + key).checked = !!save.d.settings[key];
}
