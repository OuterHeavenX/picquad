// board.js — PURE state logic. No DOM. game.js owns the state object, ui.js renders it.
//
// state = {
//   level, slots: [card|null],       // card = { packId, picId, tile }
//   selected: [slotIdx],             // ordered, always group-coherent
//   pictureQueue: [{ picId, tiles }],// whole pictures waiting to deal in
//   picIds: [picId],                 // pictures in this level
//   completed: Set(picId),
//   phase: 'idle'|'dealing'|'playing'|'submitting'|'done',
// }

export function createState(level, pictureQueue, picIds) {
  const total = level.gridCols * level.gridRows;
  return {
    level,
    slots: new Array(total).fill(null),
    selected: [],
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
    moves: 0,
  };
}

// Deal whole pictures into empty slots. The board always holds complete,
// completable pictures — a submit is always possible. Returns indices filled.
// (Empty-slot count is always a multiple of T by construction.)
export function fillEmptySlots(state) {
  const T = state.level.tiles;
  const filled = [];
  while (state.pictureQueue.length > 0) {
    const empty = [];
    state.slots.forEach((s, i) => { if (!s) empty.push(i); });
    if (empty.length < T) break;
    // scatter: shuffle which empty slots receive this picture's tiles
    for (let i = empty.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [empty[i], empty[j]] = [empty[j], empty[i]];
    }
    const { tiles } = state.pictureQueue.shift();
    for (let k = 0; k < T; k++) {
      state.slots[empty[k]] = tiles[k];
      filled.push(empty[k]);
    }
  }
  // keep deal order stable for the cascade animation
  filled.sort((a, b) => a - b);
  return filled;
}

export function selectedPicId(state) {
  if (!state.selected.length) return null;
  return state.slots[state.selected[0]].picId;
}

// tap logic. Returns { action, completedPicId? } where action ∈
// 'selected' | 'deselected' | 'swapped' | 'ignored'
export function tap(state, idx) {
  if (state.phase !== "playing") return { action: "ignored" };
  const card = state.slots[idx];
  if (!card) return { action: "ignored" };

  const selPos = state.selected.indexOf(idx);
  if (selPos !== -1) {
    state.selected.splice(selPos, 1);
    return { action: "deselected" };
  }

  const T = state.level.tiles;
  const cur = selectedPicId(state);
  if (cur && cur !== card.picId) {
    // group-coherent: swap groups, start fresh with the tapped card
    state.selected = [idx];
    return { action: "swapped" };
  }
  if (state.selected.length >= T) return { action: "ignored" }; // shouldn't happen (auto-submit at T)
  state.selected.push(idx);
  state.moves++;

  if (state.selected.length === T) {
    return { action: "selected", completedPicId: card.picId };
  }
  return { action: "selected" };
}

export function clearSlots(state, indices) {
  for (const i of indices) state.slots[i] = null;
  state.selected = [];
}

export function isLevelComplete(state) {
  return state.pictureQueue.length === 0 && state.slots.every(s => !s);
}

// all slot indices holding tiles of picId (for hint)
export function slotsOfPicture(state, picId) {
  const out = [];
  state.slots.forEach((c, i) => { if (c && c.picId === picId) out.push(i); });
  return out;
}

// an incomplete picture that still has tiles on the board (for hint/peek)
export function randomIncompletePicture(state, rng = Math.random) {
  const cands = state.picIds.filter(id => !state.completed.has(id) && slotsOfPicture(state, id).length > 0);
  if (!cands.length) return null;
  return cands[Math.floor(rng() * cands.length)];
}
