// Cloth folding animation.
// The photo is cut into a 3x3 grid of tiles (narrow side columns, wide centre) that rotate in 3D:
// sleeves fold in, the bottom third folds up, then the middle folds onto the top — like folding a shirt —
// and the folded square flies into its place in the almirah.

import { sfx } from './sound.js';

const COLS = [0, 0.25, 0.75, 1];
let stage = null;
let fast = false;

export const setFastFolding = (v) => { fast = !!v; };

function getStage() {
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'fold-stage';
    document.body.append(stage);
  }
  return stage;
}

function el(cls, parent) {
  const d = document.createElement('div');
  d.className = cls;
  if (parent) parent.append(d);
  return d;
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const FOLDED = {
  left: 'rotateY(180deg) translateZ(-1px)',
  right: 'rotateY(-180deg) translateZ(-1px)',
  bot: 'rotateX(180deg) translateZ(-2px)',
  mid: 'rotateX(180deg) translateZ(-4px)',
};
const FLAT = { left: 'rotateY(0deg)', right: 'rotateY(0deg)', bot: 'rotateX(0deg)', mid: 'rotateX(0deg)' };

function buildSheet(img, w, h, fabric) {
  let bw = w, bh = h, ox = 0, oy = 0;
  if (img) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    bw = img.naturalWidth * s; bh = img.naturalHeight * s;
    ox = (w - bw) / 2; oy = (h - bh) / 2;
  }
  const rh = h / 3;
  const sheet = el('fold-sheet');
  Object.assign(sheet.style, { width: `${w}px`, height: `${h}px` });
  if (fabric) sheet.style.setProperty('--fabric', fabric);

  const rowTop = el('fold-row', sheet);
  const midWrap = el('fold-row fold-wrap', sheet);
  const rowMid = el('fold-row', midWrap);
  const botWrap = el('fold-row fold-wrap', midWrap);
  for (const r of [rowTop, rowMid, botWrap]) Object.assign(r.style, { width: `${w}px`, height: `${rh}px` });
  Object.assign(rowTop.style, { top: '0px' });
  Object.assign(midWrap.style, { top: `${rh}px`, height: `${rh * 2}px` });
  Object.assign(rowMid.style, { top: '0px' });
  Object.assign(botWrap.style, { top: `${rh}px` });

  const sides = { left: [], right: [] };
  [rowTop, rowMid, botWrap].forEach((row, r) => {
    for (let c = 0; c < 3; c++) {
      const x = COLS[c] * w;
      const tw = (COLS[c + 1] - COLS[c]) * w;
      const y = r * rh;
      const tile = el('fold-tile', row);
      Object.assign(tile.style, { left: `${x}px`, width: `${tw}px`, height: `${rh}px` });
      tile.style.transformOrigin = c === 0 ? '100% 50%' : c === 2 ? '0% 50%' : '50% 50%';
      const front = el('fold-face front', tile);
      const back = el('fold-face back', tile);
      if (img) {
        const bg = `url("${img.src.replace(/"/g, '%22')}")`;
        for (const f of [front, back]) {
          f.style.backgroundImage = f === back ? `linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.38)), ${bg}` : bg;
          f.style.backgroundSize = f === back ? `100% 100%, ${bw}px ${bh}px` : `${bw}px ${bh}px`;
          f.style.backgroundPosition = f === back ? `0 0, ${ox - x}px ${oy - y}px` : `${ox - x}px ${oy - y}px`;
        }
      }
      if (c === 0) sides.left.push(tile);
      if (c === 2) sides.right.push(tile);
    }
  });
  // The folded bundle is the centre tile of the top row.
  sheet.style.transformOrigin = `${w / 2}px ${rh / 2}px`;
  return { sheet, sides, midWrap, botWrap, w, h, rh };
}

function flyTransform(parts, from, to) {
  const fw = parts.w / 2, fh = parts.rh;
  const scale = Math.min(to.width / fw, to.height / fh);
  const cx = from.left + parts.w / 2, cy = from.top + fh / 2;
  const dx = to.left + to.width / 2 - cx;
  const dy = to.top + to.height / 2 - cy;
  return { dx, dy, scale };
}

const anim = (node, frames, duration, opts = {}) =>
  node.animate(frames, { duration: fast ? duration * 0.45 : duration, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards', ...opts }).finished;

function place(sheet, rect) {
  Object.assign(sheet.style, { left: `${rect.left}px`, top: `${rect.top}px` });
  const st = getStage();
  st.style.perspectiveOrigin = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
  st.append(sheet);
}

const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/** Folds the photo shown at `from` and flies it into `to`. */
export async function foldTo(url, from, to, { fabric } = {}) {
  from = rectOf(from); to = rectOf(to);
  const img = await loadImage(url);
  const parts = buildSheet(img, from.width, from.height, fabric);
  place(parts.sheet, from);
  const { sheet, sides, midWrap, botWrap } = parts;

  // "Simat jana": the cloth gathers itself.
  sfx.unfold();
  await anim(sheet, [{ transform: 'scale(1)' }, { transform: 'scale(.9,.95) rotate(-1.5deg)' }, { transform: 'scale(.97)' }], 260, { fill: 'none' });

  sfx.fold();
  await Promise.all([
    ...sides.left.map((t) => anim(t, [{ transform: FLAT.left }, { transform: FOLDED.left }], 380)),
    ...sides.right.map((t) => anim(t, [{ transform: FLAT.right }, { transform: FOLDED.right }], 380, { delay: fast ? 40 : 110 })),
  ]);
  sfx.fold();
  await anim(botWrap, [{ transform: FLAT.bot }, { transform: FOLDED.bot }], 330);
  sfx.fold();
  await anim(midWrap, [{ transform: FLAT.mid }, { transform: FOLDED.mid }], 330);

  const { dx, dy, scale } = flyTransform(parts, from, to);
  sfx.whoosh();
  await anim(sheet, [
    { transform: 'translate(0,0) scale(1) rotate(0)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(${(1 + scale) / 2}) rotate(-8deg)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0)` },
  ], 560, { easing: 'cubic-bezier(.45,0,.2,1)' });
  sfx.thud();
  await anim(sheet, [{ opacity: 1 }, { opacity: 0 }], 140);
  sheet.remove();
}

/**
 * Lifts a folded cloth from `from` (small) and unfolds it into `to` (big).
 * Resolves with a `done()` callback that removes the animated sheet once the real view is on screen.
 */
export async function unfoldFrom(url, from, to, { fabric } = {}) {
  from = rectOf(from); to = rectOf(to);
  const img = await loadImage(url);
  const parts = buildSheet(img, to.width, to.height, fabric);
  const { sheet, sides, midWrap, botWrap } = parts;
  sides.left.forEach((t) => { t.style.transform = FOLDED.left; });
  sides.right.forEach((t) => { t.style.transform = FOLDED.right; });
  botWrap.style.transform = FOLDED.bot;
  midWrap.style.transform = FOLDED.mid;
  const { dx, dy, scale } = flyTransform(parts, to, from);
  sheet.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  place(sheet, to);

  sfx.whoosh();
  await anim(sheet, [
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 50}px) scale(${(1 + scale) / 2}) rotate(6deg)`, offset: 0.5 },
    { transform: 'translate(0,0) scale(1) rotate(0)' },
  ], 480);
  sfx.unfold();
  await anim(midWrap, [{ transform: FOLDED.mid }, { transform: FLAT.mid }], 280);
  await anim(botWrap, [{ transform: FOLDED.bot }, { transform: FLAT.bot }], 260);
  sfx.unfold();
  await Promise.all([
    ...sides.left.map((t) => anim(t, [{ transform: FOLDED.left }, { transform: FLAT.left }], 320)),
    ...sides.right.map((t) => anim(t, [{ transform: FOLDED.right }, { transform: FLAT.right }], 320)),
  ]);
  return () => sheet.remove();
}
