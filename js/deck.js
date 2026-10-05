// deck.js — buildDeck(level): queue of pictures, each holding its tiles not yet
// dealt. Tiles drip-feed into the tray over the level — never all at once —
// which is the tactical layer: plan around what's missing.
//
// queue entry: { picId, remaining: [tileIdx...] } (shuffled)

import { getManifest } from "./pictures.js";
import { pickLookalikes } from "./levels.js";

// mulberry32 — tiny seedable RNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// pick N pictures: guarantee lookalike pairs are included, fill the rest randomly
function choosePictures(manifest, count, lookalikeCount, rng) {
  const pairs = pickLookalikes(manifest, lookalikeCount, rng);
  const chosen = [];
  const used = new Set();
  for (const [a, b] of pairs) { chosen.push(a); chosen.push(b); used.add(a); used.add(b); }
  const rest = manifest.pictures.map(p => p.id).filter(id => !used.has(id));
  shuffle(rest, rng);
  while (chosen.length < count && rest.length) chosen.push(rest.pop());
  return chosen.slice(0, count);
}

export function buildDeck(level, rngSeed = null) {
  const rng = rngSeed == null ? Math.random : mulberry32(rngSeed);
  const manifest = getManifest(level.packId);
  const picIds = choosePictures(manifest, level.pictures, level.lookalikes, rng);

  const queue = picIds.map(picId => {
    const remaining = [];
    for (let t = 0; t < level.tiles; t++) remaining.push(t);
    shuffle(remaining, rng);
    return { picId, remaining };
  });
  shuffle(queue, rng);
  return { queue, picIds };
}

// extra pictures for endless blitz: picIds not currently active or queued
export function extraPictures(level, count, activePicIds) {
  const manifest = getManifest(level.packId);
  const pool = manifest.pictures.map(p => p.id).filter(id => !activePicIds.has(id));
  shuffle(pool);
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const picId = pool.pop();
    const remaining = [];
    for (let t = 0; t < level.tiles; t++) remaining.push(t);
    shuffle(remaining);
    out.push({ picId, remaining });
  }
  return out;
}
