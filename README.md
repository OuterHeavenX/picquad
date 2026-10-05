# PicQuad

Tap the tiles. Complete the picture. A juicy little card-sort puzzle for the browser.

**Live:** https://outerheavenx.github.io/picquad/

## How it plays

A grid of face-up cards, each showing one tile of a cute picture. Tap every tile
of the same picture — they fly together, merge with a burst of confetti, and the
completed picture gets collected. Fresh tiles deal in from the deck. Clear the
whole deck to finish the level.

- **Adventure** — 60 levels. Levels 1–25 use 4-tile pictures (2×2), levels 26–60
  use 6-tile pictures (3×2). Chain quick completes for a combo multiplier up to ×8.
- **Blitz** — 90 seconds, endless deck, chase your best score.
- **Daily** — one seeded puzzle per day, streak tracking.
- **Gallery** — every completed picture lands in a sticker-book collection.

Power-ups: 🔍 Hint · 🔀 Shuffle · 👁 Peek.

## Project layout

```
index.html
css/   base.css | cards.css | board.css | hud.css | screens.css
js/
  main.js      boot + wiring
  config.js    every magic number (tune here)
  levels.js    adventure curve generator + overrides (tune the ramp here)
  save.js      localStorage schema
  audio.js     100% WebAudio-synthesized SFX + generative music (zero asset files)
  particles.js canvas confetti / sparkle / bokeh engine
  juice.js     shake, floating score text, haptics, toasts
  pictures.js  pack registry + tile-grid (C×R) rendering math — owns ALL tile geometry
  deck.js      deck building, seedable shuffle, anti-cluster deal
  board.js     pure selection state machine (no DOM)
  game.js      level lifecycle, scoring, combo, power-ups, modes
  ui.js        screens, HUD, grid DOM, animations, modals
assets/img/packs/
  packs.json   registry — adding a theme = one line here
  animals/ sweets/ dinosaurs/ space/   art + manifest.json each
```

Module rules: `board.js` never touches the DOM (pure state). `game.js` owns the
state machine (`dealing → playing → submitting → done`). Tile geometry lives
**only** in `pictures.js`; the level curve lives **only** in `levels.js`.

## Adding a theme pack

1. Create `assets/img/packs/<newpack>/` with square art (1024×1024 `.jpg`).
   Each picture should be a centered, forward-facing subject on a distinct
   background color — it gets sliced into tiles via CSS, so every tile should
   be recognizable.
2. Add `manifest.json`: `{ packId, title, pictures: [{ id, title, file, bg, tags }] }`.
3. Add `"newpack"` to the `packs` array in `packs.json`.

No JS changes needed.

## Run locally

```bash
cd picquad
python3 -m http.server 8000
# open http://localhost:8000
```

(ES modules require http:// — `file://` won't work.)

## Deploy

Static site, served from the repo root via GitHub Pages (Pages → main → `/ (root)`).
