// game.js — level lifecycle, state machine, scoring, combo, power-ups, modes.
// States: idle → dealing → playing → submitting → done

import { CFG } from "./config.js";
import { save } from "./save.js";
import { audio } from "./audio.js";
import { particles } from "./particles.js";
import { wait, shake, haptic, floater, bump, toast, centerOf } from "./juice.js";
import { getLevel, ADVENTURE_LEVELS, dailySeed } from "./levels.js";
import { buildDeck } from "./deck.js";
import * as Board from "./board.js";
import { getPicture, preloadPack } from "./pictures.js";
import * as UI from "./ui.js";

let S = null;            // Board state
let mode = null;         // 'adventure' | 'blitz' | 'daily'
let levelNum = 0;
let timers = [];
let baseEarned = 0, comboBonus = 0;
let blitzTimeLeft = 0;
let dailyDateStr = null;

const el = (id) => document.getElementById(id);
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
function clearTimers() { timers.forEach(clearTimeout); timers = []; clearInterval(blitzInt); blitzInt = null; clearInterval(comboInt); comboInt = null; }
let blitzInt = null, comboInt = null;

// ---------------- level setup ----------------

function newState(level, seed) {
  const { queue, picIds } = buildDeck(level, seed);
  const st = Board.createState(level, queue, picIds);
  st.phase = "dealing";
  // power-up allowances
  const allow = level.mode === "adventure"
    ? { hint: CFG.powHint, shuffle: CFG.powShuffle, peek: CFG.powPeek }
    : { hint: 2, shuffle: 1, peek: 1 };
  st.powerups = { ...allow };
  return st;
}

async function dealInitial() {
  const filled = Board.fillEmptySlots(S);
  S.phase = "playing";
  UI.renderGrid(S, { dealAnimate: filled });
  UI.updateHUD(S, modeInfo());
  UI.updateDeckStrip(S);
  audio.deal();
}

function modeInfo() {
  return { mode, levelNum, blitzTimeLeft, dailyDateStr };
}

export function startAdventure(n) {
  clearTimers();
  mode = "adventure"; levelNum = n;
  const level = getLevel(n);
  preloadPack(level.packId);
  S = newState(level, null);
  baseEarned = 0; comboBonus = 0;
  UI.showScreen("game");
  UI.setupBoard(S);
  dealInitial();
  startComboTicker();
  UI.setBlitzVisible(false);
}

export function startBlitz() {
  clearTimers();
  mode = "blitz"; levelNum = 0;
  const packs = ["animals", "sweets", "dinosaurs", "space"];
  const packId = packs[Math.floor(Math.random() * packs.length)];
  preloadPack(packId);
  const level = {
    id: 0, mode: "blitz", packId, tiles: 4, tileCols: 2, tileRows: 2,
    gridCols: 5, gridRows: 4, pictures: 40, lookalikes: 1, timeLimit: CFG.blitzSec, seed: null,
  };
  S = newState(level, null);
  baseEarned = 0; comboBonus = 0;
  blitzTimeLeft = CFG.blitzSec;
  UI.showScreen("game");
  UI.setupBoard(S);
  dealInitial();
  startComboTicker();
  UI.setBlitzVisible(true);
  UI.updateBlitz(blitzTimeLeft, CFG.blitzSec);
  let lastTick = CFG.blitzSec;
  blitzInt = setInterval(() => {
    blitzTimeLeft -= 0.25;
    if (Math.ceil(blitzTimeLeft) < lastTick) { lastTick = Math.ceil(blitzTimeLeft); if (lastTick <= 10 && lastTick > 0) audio.tick(); }
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
    gridCols: 5, gridRows: 4, pictures: 10, lookalikes: 1, timeLimit: null,
    seed: dailySeed(dailyDateStr),
  };
  S = newState(level, level.seed);
  baseEarned = 0; comboBonus = 0;
  UI.showScreen("game");
  UI.setupBoard(S);
  dealInitial();
  startComboTicker();
  UI.setBlitzVisible(false);
  toast("📅 Daily puzzle — good luck!");
}

// ---------------- tapping & submit ----------------

export function onCardTap(idx) {
  if (!S || S.phase !== "playing") return;
  const res = Board.tap(S, idx);
  const T = S.level.tiles;
  if (res.action === "selected") {
    audio.pop(S.selected.length, T);
    const c = centerOf(UI.cardEl(idx));
    particles.sparkle(c.x, c.y, "#ffd97a");
    UI.renderSelection(S);
    if (res.completedPicId) submitSequence(res.completedPicId);
  } else if (res.action === "deselected") {
    audio.deselect();
    UI.renderSelection(S);
  } else if (res.action === "swapped") {
    audio.groupSwap();
    UI.renderSelection(S);
  }
}

async function submitSequence(picId) {
  S.phase = "submitting";
  const idxs = [...S.selected];
  const T = S.level.tiles;
  const pic = getPicture(S.level.packId, picId);
  UI.markSubmitting(idxs);
  haptic(12);
  await wait(CFG.submitBeatMs);

  // fly cards to board center
  const gridC = centerOf(el("grid"));
  const flights = idxs.map((si, k) =>
    UI.flyCardTo(si, gridC.x, gridC.y, k * CFG.flyStaggerMs)
  );
  audio.arpeggio(T);
  // trails
  const trailInt = setInterval(() => {
    for (const si of idxs) {
      const c = centerOf(UI.cardEl(si));
      particles.trail(c.x, c.y, pic ? pic.bg : "#f5b942");
    }
  }, 60);
  await Promise.all(flights);
  clearInterval(trailInt);

  // merge celebration
  particles.flash(gridC.x, gridC.y, { maxR: 150 });
  particles.burst(gridC.x, gridC.y, {
    n: CFG.confettiPerSubmit,
    colors: pic ? [pic.bg, "#f5b942", "#fff7e8", "#ff70a6"] : undefined,
  });
  shake(el("grid"));
  haptic(25);
  audio.merge();
  UI.clearCards(idxs);

  // combo + score
  const now = performance.now();
  if (now < S.comboExpires) S.combo = Math.min(CFG.maxCombo, S.combo + 1);
  else S.combo = 1;
  S.comboExpires = now + CFG.comboWindowMs;
  S.bestCombo = Math.max(S.bestCombo, S.combo);
  const pts = CFG.baseScore * S.combo;
  baseEarned += CFG.baseScore;
  comboBonus += CFG.baseScore * (S.combo - 1);
  S.score += pts;
  floater(`+${pts}`, gridC.x, gridC.y - 40);
  if (S.combo >= 2) {
    floater(`COMBO ×${S.combo}`, gridC.x, gridC.y - 90, "combo");
    audio.comboUp(S.combo);
  }
  bump(el("hud-score"));

  // assembled picture reveal, then fly to deck tray
  await UI.showAssembled(S.level.packId, pic);
  audio.thunk();
  S.completed.add(picId);
  const isNew = save.addGallery(S.level.packId, picId);

  // refill: next whole picture(s) deal into the freed slots
  Board.clearSlots(S, idxs);
  const filled = Board.fillEmptySlots(S);
  // blitz endless deck: top up when running low
  if (mode === "blitz" && S.pictureQueue.length < 3) {
    const extra = buildDeck(S.level, Math.floor(Math.random() * 1e9));
    S.pictureQueue.push(...extra.queue);
    S.picIds.push(...extra.picIds);
  }
  UI.renderGrid(S, { dealAnimate: filled });
  UI.updateHUD(S, modeInfo());
  UI.updateDeckStrip(S);
  audio.whoosh();

  if (mode !== "blitz" && Board.isLevelComplete(S)) {
    S.phase = "done";
    await wait(500);
    levelComplete();
  } else {
    S.phase = "playing";
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
  const picId = Board.randomIncompletePicture(S);
  if (!picId) return;
  S.powerups.hint--; S.powerupsUsed++;
  audio.power();
  const idxs = Board.slotsOfPicture(S, picId);
  UI.flashHint(idxs);
  UI.updateHUD(S, modeInfo());
  toast("🔍 Look for the glowing tiles!");
}

export function useShuffle() {
  if (!S || S.phase !== "playing") return;
  if (S.powerups.shuffle <= 0) { audio.denied(); toast("No shuffles left!"); return; }
  S.powerups.shuffle--; S.powerupsUsed++;
  audio.power();
  // collect on-board cards, reshuffle, place back (deck untouched)
  const cards = S.slots.filter(Boolean);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  S.slots = S.slots.map((_, i) => (i < cards.length ? cards[i] : null));
  S.selected = [];
  const order = S.slots.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
  UI.renderGrid(S, { dealAnimate: order });
  UI.updateHUD(S, modeInfo());
  particles.burst(window.innerWidth / 2, window.innerHeight / 2, { n: 30, colors: ["#5ec8b4", "#8ecae6", "#fff7e8"] });
}

export function usePeek() {
  if (!S || S.phase !== "playing") return;
  if (S.powerups.peek <= 0) { audio.denied(); toast("No peeks left!"); return; }
  const picId = Board.randomIncompletePicture(S);
  if (!picId) return;
  S.powerups.peek--; S.powerupsUsed++;
  audio.power();
  UI.updateHUD(S, modeInfo());
  const pic = getPicture(S.level.packId, picId);
  UI.showPeek(S.level.packId, pic);
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

function starsEarned() {
  let s = 1;
  if (S.bestCombo >= 4) s = 2;
  if (S.bestCombo >= 4 && S.powerupsUsed === 0) s = 3;
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
    const picIds = [...S.picIds];
    UI.showLevelComplete({
      stars, base: baseEarned, comboBonus, cleanBonus, total,
      packId: S.level.packId, picIds,
      hasNext: levelNum < ADVENTURE_LEVELS,
    });
  } else if (mode === "daily") {
    const streak = save.recordDaily(dailyDateStr);
    UI.showDailyComplete({ total: S.score, streak, packId: S.level.packId, picIds: [...S.picIds] });
    UI.refreshTitle();
  }
  // blitz ends by timer, not here
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

// called by UI modal buttons
export function nextLevel() {
  UI.closeModal();
  if (mode === "adventure" && levelNum < ADVENTURE_LEVELS) startAdventure(levelNum + 1);
}
