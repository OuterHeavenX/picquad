// levels.js — adventure curve generator (60 levels) + per-level overrides.
// Tune the ramp here. Extending to 3×3 tiles (61+) = one more band entry.

const BANDS = [
  {
    from: 1, to: 25,
    tiles: 4, tileCols: 2, tileRows: 2,
    pictures: (l) => Math.min(12, 6 + Math.floor((l - 1) / 4)), // 6 → 12
    lookalikes: (l) => (l >= 18 ? 2 : l >= 10 ? 1 : 0),
  },
  {
    from: 26, to: 60,
    tiles: 6, tileCols: 3, tileRows: 2,
    pictures: (l) => Math.min(12, 8 + Math.floor((l - 26) / 9)), // 8 → 12
    lookalikes: (l) => (l >= 45 ? 2 : 1),
  },
  // future: { from: 61, to: 100, tiles: 9, tileCols: 3, tileRows: 3, ... }
];

const PACK_ROTATION = ["animals", "sweets", "dinosaurs", "space"];

// hand-tuned exceptions live here, not scattered in code
const OVERRIDES = {
  1: { pictures: 6, lookalikes: 0 },
  25: { pictures: 12, lookalikes: 2 },
  26: { pictures: 8, lookalikes: 0 }, // gentle on-ramp to 6-tile
  60: { pictures: 12, lookalikes: 3 },
};

export const ADVENTURE_LEVELS = 60;

export function getLevel(n) {
  const band = BANDS.find(b => n >= b.from && n <= b.to) || BANDS[0];
  const ov = OVERRIDES[n] || {};
  const packId = PACK_ROTATION[(n - 1) % PACK_ROTATION.length];
  return {
    id: n,
    mode: "adventure",
    packId,
    tiles: band.tiles,
    tileCols: band.tileCols,
    tileRows: band.tileRows,
    frames: 2,          // active jigsaw frames on the board
    traySize: 10,       // tile tray slots
    pictures: ov.pictures ?? band.pictures(n),
    lookalikes: ov.lookalikes ?? band.lookalikes(n),
    timeLimit: null,
    seed: null,
  };
}

// lookalike sets: pick `count` pairs of pictures whose tags overlap, for difficulty.
// Returns array of [picA, picB] id pairs. v1: naive — same first tag.
export function pickLookalikes(manifest, count, rng) {
  const pics = [...manifest.pictures];
  const pairs = [];
  const used = new Set();
  for (let k = 0; k < count; k++) {
    // group by first tag
    const byTag = {};
    for (const p of pics) {
      if (used.has(p.id)) continue;
      const t = p.tags[0];
      (byTag[t] = byTag[t] || []).push(p);
    }
    const candidates = Object.values(byTag).filter(arr => arr.length >= 2);
    if (!candidates.length) break;
    const arr = candidates[Math.floor(rng() * candidates.length)];
    const a = arr.splice(Math.floor(rng() * arr.length), 1)[0];
    const b = arr.splice(Math.floor(rng() * arr.length), 1)[0];
    used.add(a.id); used.add(b.id);
    pairs.push([a.id, b.id]);
  }
  return pairs;
}

// daily seed from date string YYYY-MM-DD
export function dailySeed(dateStr) {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
