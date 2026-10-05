// deck.js — buildDeck(level): queue of WHOLE pictures (each with T shuffled tiles),
// seedable shuffle. Dealing whole pictures guarantees every picture on the board
// is always completable — no waiting on hidden tiles, no deadlocks.

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

function shuffle(arr, rng) {
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
  for (const [a, b] of pairs) { chosen.push(a, b); used.add(a); used.add(b); }
  const rest = manifest.pictures.map(p => p.id).filter(id => !used.has(id));
  shuffle(rest, rng);
  while (chosen.length < count && rest.length) chosen.push(rest.pop());
  return chosen.slice(0, count);
}

// A queued picture = { picId, tiles: [{ packId, picId, tile } × T] } (tiles shuffled)
export function buildDeck(level, rngSeed = null) {
  const rng = rngSeed == null ? Math.random : mulberry32(rngSeed);
  const manifest = getManifest(level.packId);
  const picIds = choosePictures(manifest, level.pictures, level.lookalikes, rng);

  const queue = picIds.map(picId => {
    const tiles = [];
    for (let t = 0; t < level.tiles; t++) tiles.push({ packId: level.packId, picId, tile: t });
    shuffle(tiles, rng);
    return { picId, tiles };
  });
  shuffle(queue, rng);
  return { queue, picIds };
}
