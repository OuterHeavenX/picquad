// pictures.js — pack registry + manifests. Owns ALL tile geometry (C×R).
// Adding a theme = new folder + manifest.json + one line in packs.json. No JS changes.

let registry = null;   // { packs: [...] }
let manifests = {};    // packId -> manifest

export async function loadPacks() {
  const r = await fetch("assets/img/packs/packs.json");
  registry = await r.json();
  for (const id of registry.packs) {
    const m = await fetch(`assets/img/packs/${id}/manifest.json`);
    manifests[id] = await m.json();
  }
}

export function packIds() { return registry ? [...registry.packs] : []; }
export function getManifest(packId) { return manifests[packId]; }
export function getPicture(packId, picId) {
  return (manifests[packId]?.pictures || []).find(p => p.id === picId);
}
export function pictureURL(packId, pic) {
  return `assets/img/packs/${packId}/${pic.file}`;
}

// tile geometry: tile index i in a C×R grid
export function tileGeom(i, C, R) {
  const col = i % C, row = Math.floor(i / C);
  return { col, row };
}

// CSS for rendering tile i of a picture as a card face.
// Uses ONE image file per picture — background-position slices it. Nothing else
// in the codebase hardcodes 2×2 / 3×2 / 3×3.
export function tileCSS(packId, pic, i, C, R) {
  const { col, row } = tileGeom(i, C, R);
  const px = C === 1 ? "50%" : (col / (C - 1)) * 100 + "%";
  const py = R === 1 ? "50%" : (row / (R - 1)) * 100 + "%";
  return {
    backgroundImage: `url("${pictureURL(packId, pic)}")`,
    backgroundSize: `${C * 100}% ${R * 100}%`,
    backgroundPosition: `${px} ${py}`,
  };
}

export function applyTileCSS(el, packId, pic, i, C, R) {
  const css = tileCSS(packId, pic, i, C, R);
  el.style.backgroundImage = css.backgroundImage;
  el.style.backgroundSize = css.backgroundSize;
  el.style.backgroundPosition = css.backgroundPosition;
}

// preload a pack's images so tiles never pop in late
export function preloadPack(packId) {
  const man = getManifest(packId);
  if (!man) return;
  for (const p of man.pictures) {
    const img = new Image();
    img.src = pictureURL(packId, p);
  }
}
