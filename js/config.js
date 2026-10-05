// config.js — every magic number lives here. Tune without hunting.

export const CFG = {
  // scoring / combo
  baseScore: 100,
  comboWindowMs: 10000,
  maxCombo: 8,

  // timings
  submitBeatMs: 160,        // pause after Tth tap before cards fly
  dealStaggerMs: 70,        // cascade delay between dealt cards
  flyStaggerMs: 55,         // stagger between cards flying to center
  flyDurationMs: 420,
  assembledHoldMs: 750,     // how long the completed picture shows
  hintDurationMs: 3000,

  // power-ups per adventure level
  powHint: 3,
  powShuffle: 2,
  powPeek: 1,

  // blitz
  blitzSec: 90,

  // particles
  particleCap: 300,
  confettiPerSubmit: 110,

  // shake
  shakePx: 5,
};

export const SAVE_KEY = "picquad_save_v1";
