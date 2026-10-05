// save.js — localStorage persistence. Owns the schema + migration.

import { SAVE_KEY } from "./config.js";

const DEFAULTS = {
  v: 1,
  stars: {},            // levelId -> 0..3
  gallery: {},          // packId -> [pictureId, ...]
  best: { blitz: 0 },
  daily: { lastDate: null, streak: 0 },
  settings: { sfx: true, music: true, vibration: true },
  seenHowTo: false,
  maxUnlocked: 1,       // highest adventure level unlocked
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    // shallow-merge over defaults so new fields survive upgrades
    const merged = structuredClone(DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) {
      if (parsed[k] !== undefined) merged[k] = parsed[k];
    }
    merged.settings = { ...DEFAULTS.settings, ...(parsed.settings || {}) };
    merged.best = { ...DEFAULTS.best, ...(parsed.best || {}) };
    merged.daily = { ...DEFAULTS.daily, ...(parsed.daily || {}) };
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export const save = {
  get d() { return data; },
  write() { persist(); },

  addStars(levelId, stars) {
    data.stars[levelId] = Math.max(data.stars[levelId] || 0, stars);
    data.maxUnlocked = Math.max(data.maxUnlocked, Math.min(60, levelId + 1));
    persist();
  },

  addGallery(packId, pictureId) {
    data.gallery[packId] = data.gallery[packId] || [];
    if (!data.gallery[packId].includes(pictureId)) {
      data.gallery[packId].push(pictureId);
      persist();
      return true; // newly added
    }
    return false;
  },

  setBestBlitz(score) {
    if (score > data.best.blitz) { data.best.blitz = score; persist(); return true; }
    return false;
  },

  recordDaily(dateStr) {
    // dateStr: YYYY-MM-DD. Streak increments only on consecutive days.
    if (data.daily.lastDate === dateStr) return data.daily.streak;
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    data.daily.streak = (data.daily.lastDate === yesterday) ? data.daily.streak + 1 : 1;
    data.daily.lastDate = dateStr;
    persist();
    return data.daily.streak;
  },

  reset() {
    data = structuredClone(DEFAULTS);
    persist();
  },
};
