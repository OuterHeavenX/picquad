// game.js — jigsaw orchestrator: frames, tray, drip-feed dealing, scoring, modes.
// Player drags (or tap-taps) tiles from the tray into frame slots.
// New pictures are introduced mid-game; tiles drip-feed so you're always
// planning around what's missing.

import { CFG } from "./config.js";
import { save } from "./save.js";
import { audio } from "./audio.js";
import { particles } from "./particles.js";
import { wait, shake, haptic, floater, bump, toast, centerOf } from "./juice.js";
import { getLevel, ADVENTURE_LEVELS, dailySeed } from "./levels.js";
import { buildDeck, extraPictures } from "./deck.js";
import * as Board from "./board.js";
import { getPicture, preloadPack } from "./pictures.js";
import * as UI from "./ui.js";

let S = null;
let mode = null;         // 'adventure' | 'blitz' | 'daily'
let levelNum = 0;
let timers = [];
let baseEarned = 0, comboBonus = 0, pictureBonus = 0;
let blitzTimeLeft = 0;
let dailyDateStr = null;
let blitzInt = null, comboInt = null;

const el = (id) => document.getElementById(id);
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
function clearTimers() {
  timers.forEach(clearTimeout); timers = [];
  clearInterval(blitzInt); blitzInt = null;
  clearInterval(comboInt); comboInt = null;
}

export function getState() { return S; }

// ---------------- setup ----------------

function newState(level, seed) {
  const { queue, picIds } = buildDeck(level, seed);
  const st = Board.createState(level, queue, picIds);
  st.phase = "playing";
  const allow = level.mode === "adventure"
    ? { hint: CFG.powHint, shuffle: CFG.powShuffle, peek: CFG.powPeek }
    : { hint: 2, shuffle: 1, peek: 1 };
  st.powerups = { ...allow };
  return st;
}

// fill empty frame slots with the next pictures from the queue
function introduceNextPictures() {
  const active = new Set(S.frames.map(f => f.picId));
  const introduced = [];
  for (const q of S.pictureQueue) {
    if (S.frames.length >= S.level.frames) break;
    if (!active.has(q.picId)) {
      Board.introducePicture(S, q.picId);
      introduced.push(q.picId);
    }
  }
  if (introduced.length) UI.renderFrames(S, { animateIn: introduced });
  return introduced;
}

// drip-feed: deal tiles for active pictures until the tray hits the target.
// never dumps a whole picture at once — that's the tactical layer.
export function topUpTray() {
  if (!S || S.phase === "done") return;
  const target = CFG.trayTopUpTarget;
  const picks = new Map();
  const activeIds = S.frames.map(f => f.picId);
  let guard = 40;
  const picked = () => [...picks.values()].reduce((a, b) => a + b, 0);
  while (Board.trayCount(S) + picked() < target && guard-- > 0) {
    const cands = activeIds.filter(id => {
      const e = Board.queueEntry(S, id);
      return e && e.remaining.length > (picks.get(id) || 0);
    });
    if (!cands.length) break;
    const id = cands[Math.floor(Math.random() * cands.length)];
    picks.set(id, (picks.get(id) || 0) + 1);
  }
  if (!picks.size) return;
  const placed = Board.dealToTray(S, [...picks.entries()].map(([picId, count]) => ({ picId, count })));
  if (placed.length) {
    UI.renderTray(S, { dealAnimate: placed.map(p => p.trayIdx) });
    audio.deal();
  }
}

function beginLevel() {
  UI.showScreen("game");
  UI.setupBoard(S);
  introduceNextPictures();
  // opening deal: every active picture arrives missing `initialDealBack` tiles
  const picks = S.frames.map(f => ({ picId: f.picId, count: S.level.tiles - CFG.initialDealBack }));
  const placed = Board.dealToTray(S, picks);
  UI.renderFrames(S, { animateIn: true });
  UI.renderTray(S, { dealAnimate: placed.map(p => p.trayIdx) });
  UI.updateHUD(S);
  UI.updateDeckStrip(S);
  audio.deal();
  startComboTicker();
}

export function startAdventure(n) {
  clearTimers();
  mode = "adventure"; levelNum = n;
  const level = getLevel(n);
  preloadPack(level.packId);
  S = newState(level, null);
  baseEarned = 0; comboBonus = 0; pictureBonus = 0;
  UI.setBlitzVisible(false);
  beginLevel();
}

export function startBlitz() {
  clearTimers();
  mode = "blitz"; levelNum = 0;
  const packs = ["animals", "sweets", "dinosaurs", "space"];
  const packId = packs[Math.floor(Math.random() * packs.length)];
  preloadPack(packId);
  const level = {
    id: 0, mode: "blitz", packId, tiles: 4, tileCols: 2, tileRows: 2,
    frames: 2, traySize: 10, pictures: 8, lookalikes: 1, timeLimit: CFG.blitzSec, seed: null,
  };
  S = newState(level, null);
  baseEarned = 0; comboBonus = 0; pictureBonus = 0;
  blitzTimeLeft = CFG.blitzSec;
  UI.setBlitzVisible(true);
  beginLevel();
  UI.updateBlitz(blitzTimeLeft, CFG.blitzSec);
  let lastTick = CFG.blitzSec;
  blitzInt = setInterval(() => {
    blitzTimeLeft -= 0.25;
    if (Math.ceil(blitzTimeLeft) < lastTick) {
      lastTick = Math.ceil(blitzTimeLeft);
      if (lastTick <= 10 && lastTick > 0) audio.tick();
    }
    UI.updateBlitz(Math.max(0, blitzTimeLeft), CFG.blitzSec);
    if (blitzTimeLeft <= 0) endBlitz();
  }, 250);
  timers.push(blitzInt);
}

export function startDaily() {
  clearTimers();
  mode = "daily"; levelNum = 0;
  const d = new Date();
  dailyDateStr = d.toISOString().slice(0, 10);
  const packs = ["animals", "sweets", "dinosaurs", "space"];
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const packId = packs[dayOfYear % packs.length];
  preloadPack(packId);
  const level = {
    id: 0, mode: "daily", packId, tiles: 4, tileCols: 2, tileRows: 2,
    frames: 2, traySize: 10, pictures: 6, lookalikes: 1, timeLimit: null,
    seed: dailySeed(dailyDateStr),
  };
  S = newState(level, level.seed);
  baseEarned = 0; comboBonus = 0; pictureBonus = 0;
  UI.setBlitzVisible(false);
  beginLevel();
  toast("📅 Daily puzzle — good luck!");
}

// ---------------- placing ----------------

// Pure logic + scoring. UI handles the visuals and calls pictureComplete().
export function tryPlace(trayIdx, frameIdx, slotIdx) {
  if (!S || S.phase !== "playing") return { ok: false, reason: "busy" };
  const res = Board.attemptPlace(S, trayIdx, frameIdx, slotIdx);
  if (!res.ok) {
    if (res.reason === "mismatch") {
      S.combo = 0;               // misplace breaks the combo — stakes!
      audio.wobble();
    } else if (res.reason !== "busy") {
      audio.denied();
    }
    UI.updateHUD(S);
    return res;
  }
  const now = performance.now();
  S.combo = now < S.comboExpires ? Math.min(CFG.maxCombo, S.combo + 1) : 1;
  S.comboExpires = now + CFG.comboWindowMs;
  S.bestCombo = Math.max(S.bestCombo, S.combo);
  const pts = CFG.placeScore * S.combo;
  S.score += pts;
  baseEarned += CFG.placeScore;
  comboBonus += CFG.placeScore * (S.combo - 1);
  audio.snap();
  UI.updateHUD(S);
  bump(el("hud-score"));
  return { ...res, pts, combo: S.combo };
}

// called by UI after the snap animation, when a frame is full
export async function pictureComplete(frameIdx) {
  const frame = S.frames[frameIdx];
  if (!frame || S.phase !== "playing") return;
  const picId = frame.picId;
  const pic = getPicture(S.level.packId, picId);
  S.phase = "celebrating";

  const cpts = CFG.pictureScore * Math.max(1, S.combo);
  S.score += cpts;
  pictureBonus += cpts;
  audio.merge();
  audio.arpeggio(S.level.tiles);
  const fc = UI.frameCenter(frameIdx);
  particles.flash(fc.x, fc.y, { maxR: 160 });
  particles.burst(fc.x, fc.y, {
    n: CFG.confettiPerSubmit,
    colors: pic ? [pic.bg, "#f5b942", "#fff7e8", "#ff70a6"] : undefined,
  });
  shake(el("frames"));
  haptic(25);
  floater(`+${cpts}`, fc.x, fc.y - 30);
  if (S.combo >= 2) floater(`COMBO ×${S.combo}`, fc.x, fc.y - 80, "combo");
  bump(el("hud-score"));

  await UI.celebrateFrame(S, frameIdx, pic);
  audio.thunk();
  save.addGallery(S.level.packId, picId);
  Board.removePicture(S, picId);

  introduceNextPictures();
  UI.renderFrames(S);
  UI.renderTray(S);
  UI.updateHUD(S);
  UI.updateDeckStrip(S);
  if (mode === "blitz") topUpBlitzQueue();
  topUpTray();

  if (mode !== "blitz" && Board.isLevelComplete(S)) {
    S.phase = "done";
    await wait(400);
    levelComplete();
  } else {
    S.phase = "playing";
  }
}

function topUpBlitzQueue() {
  const activeIds = new Set([...S.frames.map(f => f.picId), ...S.pictureQueue.map(q => q.picId)]);
  if (S.pictureQueue.length < 4) {
    const extra = extraPictures(S.level, 4, activeIds);
    S.pictureQueue.push(...extra);
    S.picIds.push(...extra.map(e => e.picId));
  }
}

// ---------------- combo ticker ----------------

function startComboTicker() {
  clearInterval(comboInt);
  comboInt = setInterval(() => {
    if (!S) return;
    const remain = Math.max(0, S.comboExpires - performance.now());
    UI.updateCombo(S.combo, remain, CFG.comboWindowMs);
    if (S.combo > 0 && remain <= 0) { S.combo = 0; UI.updateCombo(0, 0, CFG.comboWindowMs); }
  }, 100);
  timers.push(comboInt);
}

// ---------------- power-ups ----------------

export function useHint() {
  if (!S || S.phase !== "playing") return;
  if (S.powerups.hint <= 0) { audio.denied(); toast("No hints left!"); return; }
  const trayIdx = Board.randomTrayTile(S);
  if (trayIdx == null) return;
  const target = Board.correctSlotFor(S, trayIdx);
  if (!target) return;
  S.powerups.hint--; S.powerupsUsed++;
  audio.power();
  UI.flashSlot(target.frameIdx, target.slotIdx);
  UI.updateHUD(S);
  toast("🔍 A tile goes in the glowing slot!");
}

export function useShuffle() {
  if (!S || S.phase !== "playing") return;
  if (S.powerups.shuffle <= 0) { audio.denied(); toast("No shuffles left!"); return; }
  S.powerups.shuffle--; S.powerupsUsed++;
  S.selectedTrayIdx = null;
  audio.power();
  const cards = S.tray.filter(Boolean);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  S.tray = [...cards, ...new Array(S.level.traySize - cards.length).fill(null)];
  UI.renderTray(S, { dealAnimate: cards.map((_, i) => i) });
  UI.updateHUD(S);
  particles.burst(window.innerWidth / 2, window.innerHeight / 2, { n: 30, colors: ["#5ec8b4", "#8ecae6", "#fff7e8"] });
}

export function usePeek() {
  if (!S || S.phase !== "playing") return;
  if (S.powerups.peek <= 0) { audio.denied(); toast("No peeks left!"); return; }
  if (!S.frames.length) return;
  const frame = S.frames[Math.floor(Math.random() * S.frames.length)];
  S.powerups.peek--; S.powerupsUsed++;
  audio.power();
  UI.updateHUD(S);
  UI.showPeek(S.level.packId, getPicture(S.level.packId, frame.picId));
}

// ---------------- pause / quit / restart ----------------

export function pauseGame() {
  if (!S || S.phase !== "playing") return;
  S.phase = "idle";
  audio.click();
  UI.showPause(mode);
}
export function resumeGame() {
  if (!S) return;
  S.phase = "playing";
  UI.closeModal();
  audio.click();
}
export function restartLevel() {
  UI.closeModal();
  if (mode === "adventure") startAdventure(levelNum);
  else if (mode === "blitz") startBlitz();
  else startDaily();
}
export function quitToLevels() {
  clearTimers(); S = null; UI.closeModal();
  if (mode === "adventure") { UI.renderLevelGrid(); UI.showScreen("levels"); }
  else { UI.refreshTitle(); UI.showScreen("title"); }
  audio.click();
}

// ---------------- endings ----------------

function accuracy() {
  return S.correctPlacements / Math.max(1, S.attempts);
}

function starsEarned() {
  let s = 1;
  if (S.bestCombo >= 4) s = 2;
  if (S.bestCombo >= 4 && accuracy() >= 0.85) s = 3;
  return s;
}

async function levelComplete() {
  clearInterval(comboInt);
  let total = S.score, cleanBonus = 0;
  if (mode === "adventure" && S.powerupsUsed === 0) {
    cleanBonus = Math.round(total * 0.5);
    total += cleanBonus;
  }
  audio.fanfare();
  particles.confettiRain(180);
  haptic([30, 50, 30]);

  if (mode === "adventure") {
    const stars = starsEarned();
    save.addStars(levelNum, stars);
    UI.showLevelComplete({
      stars, base: baseEarned, comboBonus, pictureBonus, cleanBonus, total,
      accuracy: Math.round(accuracy() * 100),
      packId: S.level.packId, picIds: [...S.picIds],
      hasNext: levelNum < ADVENTURE_LEVELS,
    });
  } else if (mode === "daily") {
    const streak = save.recordDaily(dailyDateStr);
    UI.showDailyComplete({ total: S.score, streak, packId: S.level.packId, picIds: [...S.picIds] });
    UI.refreshTitle();
  }
}

function endBlitz() {
  if (mode !== "blitz" || !S) return;
  clearTimers();
  S.phase = "done";
  const isBest = save.setBestBlitz(S.score);
  audio.fanfare();
  particles.confettiRain(200);
  UI.showBlitzComplete({ score: S.score, best: save.d.best.blitz, isBest });
}

export function nextLevel() {
  UI.closeModal();
  if (mode === "adventure" && levelNum < ADVENTURE_LEVELS) startAdventure(levelNum + 1);
}
