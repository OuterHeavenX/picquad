// config.js — every magic number lives here. Tune without hunting.

export const CFG = {
  // scoring / combo
  placeScore: 10,          // per correct tile placement
  pictureScore: 100,       // per completed picture
  comboWindowMs: 8000,     // correct placements chain the combo
  maxCombo: 8,

  // board / tray
  framesPerBoard: 2,       // active picture frames
  traySize: 10,            // tile tray slots
  trayTopUpTarget: 8,      // drip-feed until tray holds this many
  initialDealBack: 1,      // tiles held back per picture on introduction (tactical gap)

  // timings
  snapMs: 260,              // tile snap-into-slot animation
  celebrateMs: 900,         // frame celebration before new picture arrives
  dealStaggerMs: 70,
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
