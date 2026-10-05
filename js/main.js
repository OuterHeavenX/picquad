// main.js — boot. Loads packs, wires UI ↔ game, routes to title.

import { loadPacks } from "./pictures.js";
import { unlockAudio, audio } from "./audio.js";
import { save } from "./save.js";
import * as UI from "./ui.js";
import * as Game from "./game.js";

async function boot() {
  unlockAudio();
  // start music on first gesture if enabled
  window.addEventListener("pointerdown", () => audio.startMusic(), { once: true });

  try {
    await loadPacks();
  } catch (e) {
    document.getElementById("app").innerHTML =
      `<div style="padding:40px;text-align:center"><h2>Couldn't load PicQuad 😢</h2><p>Check your connection and reload.</p></div>`;
    return;
  }

  UI.init({
    tryPlace: (t, f, s) => Game.tryPlace(t, f, s),
    pictureComplete: (f) => Game.pictureComplete(f),
    topUp: () => Game.topUpTray(),
    getState: () => Game.getState(),
    pause: () => Game.pauseGame(),
    resume: () => Game.resumeGame(),
    restart: () => Game.restartLevel(),
    quit: () => Game.quitToLevels(),
    hint: () => Game.useHint(),
    shuffle: () => Game.useShuffle(),
    peek: () => Game.usePeek(),
    nextLevel: () => Game.nextLevel(),
    selectLevel: (n) => Game.startAdventure(n),
    daily: () => Game.startDaily(),
    blitz: () => Game.startBlitz(),
  });

  UI.refreshTitle();
  UI.showScreen("title");
  if (!save.d.seenHowTo) UI.showHowTo();
}

boot();
