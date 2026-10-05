// board.js — PURE state logic. No DOM. game.js owns the state object, ui.js renders it.
//
// state = {
//   level,
//   frames: [{ picId, slots: [card|null] }],  // active jigsaw frames; card = {packId,picId,tile}
//   tray: [card|null],                        // tile tray (fixed size)
//   pictureQueue: [{ picId, remaining: [tileIdx] }], // tiles not yet dealt
//   picIds: [picId],                          // all pictures in this level
//   completed: Set(picId),
//   phase: 'idle'|'playing'|'celebrating'|'done',
//   score, combo, comboExpires, bestCombo,
//   powerups, powerupsUsed, attempts, correctPlacements,
//   selectedTrayIdx,
// }

export function createState(level, pictureQueue, picIds) {
  return {
    level,
    frames: [],
    tray: new Array(level.traySize).fill(null),
    pictureQueue: [...pictureQueue],
    picIds,
    completed: new Set(),
    phase: "idle",
    score: 0,
    combo: 0,
    comboExpires: 0,
    bestCombo: 0,
    powerups: { hint: 0, shuffle: 0, peek: 0 },
    powerupsUsed: 0,
    attempts: 0,
    correctPlacements: 0,
    selectedTrayIdx: null,
  };
}

// add a picture frame to the board (does not touch the queue)
export function introducePicture(state, picId) {
  state.frames.push({ picId, slots: new Array(state.level.tiles).fill(null) });
}

export function queueEntry(state, picId) {
  return state.pictureQueue.find(q => q.picId === picId);
}

export function frameIndexOf(state, picId) {
  return state.frames.findIndex(f => f.picId === picId);
}

// deal picks ([{picId, count}]) into empty tray slots; returns [{trayIdx, card}]
export function dealToTray(state, picks) {
  const placed = [];
  for (const { picId, count } of picks) {
    const entry = queueEntry(state, picId);
    if (!entry) continue;
    for (let k = 0; k < count && entry.remaining.length > 0; k++) {
      const trayIdx = state.tray.findIndex(s => !s);
      if (trayIdx === -1) break;
      const card = { packId: state.level.packId, picId, tile: entry.remaining.pop() };
      state.tray[trayIdx] = card;
      placed.push({ trayIdx, card });
    }
  }
  return placed;
}

export function trayCount(state) {
  return state.tray.reduce((n, c) => n + (c ? 1 : 0), 0);
}

// attempt to move tray[trayIdx] -> frames[frameIdx].slots[slotIdx]
// correct iff same picture AND the tile belongs in that exact slot (jigsaw rule)
export function attemptPlace(state, trayIdx, frameIdx, slotIdx) {
  const card = state.tray[trayIdx];
  const frame = state.frames[frameIdx];
  if (!card || !frame) return { ok: false, reason: "bad-target" };
  if (frame.slots[slotIdx]) return { ok: false, reason: "occupied" };
  state.attempts++;
  if (card.picId === frame.picId && card.tile === slotIdx) {
    frame.slots[slotIdx] = card;
    state.tray[trayIdx] = null;
    state.selectedTrayIdx = null;
    state.correctPlacements++;
    const done = frame.slots.every(Boolean);
    return { ok: true, completedPicId: done ? frame.picId : null, frameIdx };
  }
  return { ok: false, reason: "mismatch" };
}

export function removePicture(state, picId) {
  state.frames = state.frames.filter(f => f.picId !== picId);
  state.pictureQueue = state.pictureQueue.filter(q => q.picId !== picId);
  state.completed.add(picId);
}

export function isLevelComplete(state) {
  return state.pictureQueue.length === 0 && state.frames.length === 0;
}

// correct slot for a tray tile (hint). null if its picture has no frame (shouldn't happen).
export function correctSlotFor(state, trayIdx) {
  const card = state.tray[trayIdx];
  if (!card) return null;
  const frameIdx = frameIndexOf(state, card.picId);
  if (frameIdx === -1) return null;
  return { frameIdx, slotIdx: card.tile };
}

// a random tray tile that isn't placed yet (hint / tests)
export function randomTrayTile(state, rng = Math.random) {
  const idxs = [];
  state.tray.forEach((c, i) => { if (c) idxs.push(i); });
  if (!idxs.length) return null;
  return idxs[Math.floor(rng() * idxs.length)];
}
