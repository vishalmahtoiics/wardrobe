// Item detail (unfolds out of the almirah, folds back in) and the add / edit form.

import { get, post, del, media } from './api.js';
import { state, itemById, upsertItem, removeItem, fabricOf, locLabel, statusOf, locationById, refreshLocations, recount } from './state.js';
import { categoriesFor, HANG_CATEGORIES, CATEGORY_ICON, OCCASIONS, STATUSES, COLORS, SEASONS, LOCATION_EMOJIS } from './data.js';
import { h, $, $$, openModal, confirmBox, promptBox, toast, toastError, timeAgo, avatar, wait } from './ui.js';
import { foldTo, unfoldFrom } from './fold.js';
import { compressImage } from './image.js';
import { sfx } from './sound.js';

export const changed = () => window.dispatchEvent(new CustomEvent('wardrobe:changed'));
const animationsOn = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SHAPES = { dress: ['Dress', 'Gown', 'Lehenga', 'Skirt'], long: ['Saree', 'Dupatta', 'Salwar Suit', 'Kurti', 'Kurta', 'Sherwani'] };
export const garmentShape = (cat) => (SHAPES.dress.includes(cat) ? 'dress' : SHAPES.long.includes(cat) ? 'long' : '');

/** The element showing an item inside the current view (almirah slot, hanger or card). */
export const itemEl = (id) => document.querySelector(`#view [data-item="${id}"]`);
const visualOf = (el) => el?.querySelector('.cloth, .garment, .ph') || el;

function visibleRect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const inView = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  return inView ? r : null;
}

function fallbackTarget() {
  const tab = document.querySelector('.tabbar a[href="#/"] .ic');
  return tab ? tab.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight - 60, width: 40, height: 40 };
}

/* ---------- Detail ---------- */

function photosHtml(images, icon, hint = true) {
  if (!images.length) return `<div class="noimg">${icon}</div>`;
  return `<div class="slides">${images.map((im) => `<img src="${h(media(im.url))}" alt="" loading="lazy">`).join('')}</div>
    ${images.length > 1 ? `<div class="dots">${images.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    ${hint ? '<span class="fold-hint">👆 Tap = fold karke rakho</span>' : ''}`;
}

function bindSlides(root) {
  const slides = $('.slides', root);
  if (!slides) return;
  slides.addEventListener('scroll', () => {
    const i = Math.round(slides.scrollLeft / slides.clientWidth);
    $$('.dots i', root).forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
}

function detailHtml(it) {
  const st = statusOf(it);
  const color = COLORS[it.color];
  return `
    <div class="detail-photo">${photosHtml(it.images, CATEGORY_ICON[it.category] || '👕')}</div>
    <div class="detail-info">
      <div class="row"><h2 class="grow">${h(it.title)}</h2>
        <button class="icon-btn" data-act="fav" aria-label="Favourite">${it.favorite ? '❤️' : '🤍'}</button></div>
      <div class="row wrap">
        <span class="badge">📍 ${h(locLabel(it))}</span>
        <span class="badge">${CATEGORY_ICON[it.category] || '👕'} ${h(it.category)}</span>
        <span class="badge">${st.icon} ${st.label}</span>
        ${it.is_public ? '<span class="badge">🌍 Public</span>' : ''}
      </div>
      ${it.tags.length ? `<div class="chips" style="margin-top:12px">${it.tags.map((t) => `<a class="chip" href="#/search?tag=${encodeURIComponent(t)}" data-close>#${h(t)}</a>`).join('')}</div>` : ''}
      ${it.description ? `<p style="white-space:pre-wrap;margin:14px 0 0">${h(it.description)}</p>` : ''}
      <div class="kv">
        <div><small>Rang</small><b>${color ? `<span class="color-dot" style="background:${color}"></span>` : ''}${h(it.color || '—')}</b></div>
        <div><small>Season</small><b>${h(it.season || '—')}</b></div>
        <div><small>Brand</small><b>${h(it.brand || '—')}</b></div>
        <div><small>Kitni baar pehna</small><b>${it.wear_count}× ${it.last_worn_at ? `<span class="muted small">· ${timeAgo(it.last_worn_at)}</span>` : ''}</b></div>
      </div>
      <div class="field"><span>Abhi kahan hai?</span>
        <div class="chips">${Object.entries(STATUSES).map(([k, s]) => `<button class="chip ${it.status === k ? 'on' : ''}" data-status="${k}">${s.icon} ${s.label}</button>`).join('')}</div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="wear">✅ Aaj pehna</button>
        <button class="btn" data-act="edit">✏️ Edit</button>
        <button class="btn" data-act="share">💬 Chat me share</button>
        <button class="btn danger" data-act="delete">🗑️ Delete</button>
        <button class="btn wide" data-act="fold">📦 Fold karke almirah me rakho</button>
      </div>
    </div>`;
}

export async function openItem(id, originEl = itemEl(id)) {
  const it = itemById(id);
  if (!it) return;
  sfx.tap();
  const thumb = it.images[0] ? media(it.images[0].thumb) : null;
  const full = it.images[0] ? media(it.images[0].url) : null;
  const originRect = visibleRect(visualOf(originEl));
  const animate = animationsOn() && thumb && originRect;
  let photo;

  const modal = openModal(detailHtml(it), {
    cls: 'item-modal',
    beforeClose: async () => {
      const slot = itemEl(id);
      if (!animationsOn() || !full || !photo?.isConnected) { slot?.classList.remove('ghost'); return; }
      const from = photo.getBoundingClientRect();
      photo.classList.add('hide-real');
      modal.el.querySelector('.sheet').style.opacity = '0';
      modal.el.querySelector('.scrim').style.opacity = '0';
      const target = visibleRect(visualOf(slot)) || fallbackTarget();
      await foldTo(full, from, target, { fabric: fabricOf(itemById(id) || it) });
      if (slot) {
        slot.classList.remove('ghost');
        slot.classList.add('landed');
        setTimeout(() => slot.classList.remove('landed'), 600);
      }
    },
  });
  photo = $('.detail-photo', modal.el);
  bindSlides(modal.el);
  bindDetail(modal, id);

  if (animate) {
    photo.classList.add('hide-real');
    originEl.classList.add('ghost');
    try {
      const done = await unfoldFrom(thumb, originRect, photo.getBoundingClientRect(), { fabric: fabricOf(it) });
      photo.classList.remove('hide-real');
      requestAnimationFrame(() => done());
    } catch {
      photo.classList.remove('hide-real');
    }
  } else {
    originEl?.classList.add('ghost');
  }
}

function bindDetail(modal, id) {
  const refresh = () => {
    const it = itemById(id);
    if (!it) return;
    const scroll = modal.el.querySelector('.sheet').scrollTop;
    modal.body.innerHTML = detailHtml(it);
    bindSlides(modal.el);
    modal.el.querySelector('.sheet').scrollTop = scroll;
  };
  modal.el.addEventListener('click', async (e) => {
    if (e.target.closest('.detail-photo') && !e.target.closest('.dots')) return modal.close();
    const st = e.target.closest('[data-status]');
    if (st) {
      try {
        upsertItem((await post(`items/${id}`, { status: st.dataset.status })).item);
        sfx.pop(); refresh(); changed();
      } catch (err) { toastError(err); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const it = itemById(id);
    try {
      if (act === 'fold') modal.close();
      if (act === 'fav') {
        upsertItem((await post(`items/${id}`, { favorite: !it.favorite })).item);
        sfx.pop(); refresh(); changed();
      }
      if (act === 'wear') {
        upsertItem((await post(`items/${id}/wear`)).item);
        sfx.success(); toast('Badhiya! Aaj ka look note kar liya ✨'); refresh(); changed();
      }
      if (act === 'edit') openForm(it);
      if (act === 'share') {
        window.__shareItem = id;
        await modal.close();
        location.hash = '#/community';
      }
      if (act === 'delete') {
        if (!(await confirmBox(`"${h(it.title)}" ko hamesha ke liye delete karein?`, { ok: 'Delete', danger: true, icon: '🗑️' }))) return;
        await del(`items/${id}`);
        removeItem(id);
        toast('Delete ho gaya');
        await modal.close();
        changed();
      }
    } catch (err) { toastError(err); }
  });
}

/** Read-only view of someone else's public item. */
export async function openPublicItem(id, originEl) {
  let it;
  try { it = (await get(`community/items/${id}`)).item; } catch (e) { return toastError(e); }
  const originRect = visibleRect(visualOf(originEl));
  const modal = openModal(`
    <div class="detail-photo">${photosHtml(it.images, CATEGORY_ICON[it.category] || '👕', false)}</div>
    <div class="detail-info">
      <h2>${h(it.title)}</h2>
      <a class="row" href="#/u/${it.owner.id}" data-close style="text-decoration:none;color:inherit;margin:6px 0">${avatar(it.owner, 'sm')} <b>${h(it.owner.name)}</b> <span class="muted small">ki almirah se</span></a>
      <div class="row wrap"><span class="badge">${CATEGORY_ICON[it.category] || '👕'} ${h(it.category)}</span>${it.color ? `<span class="badge">🎨 ${h(it.color)}</span>` : ''}${it.brand ? `<span class="badge">🏷️ ${h(it.brand)}</span>` : ''}</div>
      ${it.tags.length ? `<div class="chips" style="margin-top:12px">${it.tags.map((t) => `<span class="chip">#${h(t)}</span>`).join('')}</div>` : ''}
      ${it.description ? `<p style="white-space:pre-wrap">${h(it.description)}</p>` : ''}
    </div>`, { title: '' });
  bindSlides(modal.el);
  const photo = $('.detail-photo', modal.el);
  if (animationsOn() && originRect && it.images[0]) {
    photo.classList.add('hide-real');
    const done = await unfoldFrom(media(it.images[0].thumb), originRect, photo.getBoundingClientRect());
    photo.classList.remove('hide-real');
    requestAnimationFrame(() => done());
  }
}

/* ---------- Add / edit form ---------- */

export async function addLocationFlow() {
  let emoji = LOCATION_EMOJIS[2];
  const extra = `<div class="field"><span>Icon</span><div class="emoji-pick">${LOCATION_EMOJIS.map((e) => `<button type="button" data-emoji="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>`;
  const p = promptBox('Nayi jagah / almirah', [{ name: 'name', label: 'Naam (jaise Hostel, Nani ka ghar, Office)', required: true }], { ok: 'Add karo', extra });
  setTimeout(() => {
    $$('.emoji-pick button').forEach((b) => b.addEventListener('click', () => {
      emoji = b.dataset.emoji;
      $$('.emoji-pick button').forEach((x) => x.classList.toggle('on', x === b));
    }));
  }, 50);
  const v = await p;
  if (!v?.name) return null;
  try {
    const { location } = await post('locations', { name: v.name, emoji });
    await refreshLocations();
    recount();
    sfx.success();
    return location;
  } catch (e) { toastError(e); return null; }
}

export function openForm(existing = null) {
  const it = existing || {};
  const me = state.me;
  const max = state.meta.max_images || 4;
  const f = {
    title: it.title || '',
    category: it.category || '',
    placement: it.placement || 'fold',
    placementTouched: !!existing,
    location_id: it.location_id ?? (state.currentLoc && locationById(state.currentLoc) ? state.currentLoc : state.locations[0]?.id ?? null),
    tags: [...(it.tags || [])],
    color: it.color || '',
    season: it.season || '',
    brand: it.brand || '',
    description: it.description || '',
    status: it.status || 'in',
    favorite: !!it.favorite,
    is_public: existing ? !!it.is_public : me.visibility === 'public',
    photos: (it.images || []).map((im) => ({ id: im.id, url: media(im.thumb) })),
    removed: [],
  };
  const myTags = [...new Set(state.items.flatMap((i) => i.tags))].filter((t) => !OCCASIONS.some((o) => o.tag === t));

  const modal = openModal('<form class="item-form" novalidate></form>', { title: existing ? '✏️ Kapda edit karo' : '👕 Naya kapda add karo' });
  const form = $('form', modal.el);

  const render = () => {
    const cats = categoriesFor(me.gender);
    if (f.category && !cats.includes(f.category)) cats.unshift(f.category);
    form.innerHTML = `
      <div class="field"><span>Photos (max ${max}) — pehli photo cover banegi</span>
        <div class="photo-row">
          ${f.photos.map((p, i) => `<div class="photo-slot filled" style="background-image:url('${p.url}')">
            <button type="button" class="rm" data-rm="${i}" aria-label="Remove">✕</button>${i === 0 ? '<span class="cover">Cover</span>' : ''}</div>`).join('')}
          ${f.photos.length < max ? `
            <div class="photo-slot"><label><span><b>🖼️</b>Gallery</span><input type="file" accept="image/*" multiple hidden data-pick></label></div>
            <div class="photo-slot"><label><span><b>📷</b>Camera</span><input type="file" accept="image/*" capture="environment" hidden data-pick></label></div>` : ''}
        </div>
      </div>
      <label class="field"><span>Title *</span><input class="input" name="title" value="${h(f.title)}" placeholder="jaise: Blue silk saree, Black party shirt" maxlength="120" required></label>
      <div class="two">
        <label class="field"><span>Category</span><select class="input" name="category">
          <option value="">Choose…</option>
          ${cats.map((c) => `<option ${c === f.category ? 'selected' : ''}>${h(c)}</option>`).join('')}
        </select></label>
        <div class="field"><span>Kaise rakha hai?</span><div class="seg">
          <button type="button" data-place="hang" class="${f.placement === 'hang' ? 'on' : ''}">🧥 Hanger</button>
          <button type="button" data-place="fold" class="${f.placement === 'fold' ? 'on' : ''}">📦 Tah</button>
        </div></div>
      </div>
      <div class="field"><span>Kahan rakha hai? (Location)</span><div class="chips">
        ${state.locations.map((l) => `<button type="button" class="chip ${f.location_id === l.id ? 'on' : ''}" data-loc="${l.id}">${h(l.emoji)} ${h(l.name)}</button>`).join('')}
        <button type="button" class="chip" data-newloc>➕ Nayi jagah</button>
      </div></div>
      <div class="field"><span>Kab pehnenge? (Occasion / tags)</span><div class="chips">
        ${OCCASIONS.map((o) => `<button type="button" class="chip ${f.tags.includes(o.tag) ? 'on' : ''}" data-tag="${o.tag}">${o.icon} ${o.label}</button>`).join('')}
        ${f.tags.filter((t) => !OCCASIONS.some((o) => o.tag === t)).map((t) => `<button type="button" class="chip on" data-tag="${h(t)}">#${h(t)} <span class="x">✕</span></button>`).join('')}
      </div>
      <input class="input" style="margin-top:8px" data-newtag placeholder="Apna tag likho aur Enter dabao (jaise: diwali, cousin wedding)" list="mytags">
      <datalist id="mytags">${myTags.map((t) => `<option value="${h(t)}">`).join('')}</datalist></div>
      <div class="field"><span>Rang</span><div class="color-pick">
        ${Object.entries(COLORS).map(([n, c]) => `<button type="button" title="${n}" aria-label="${n}" data-color="${n}" class="${f.color === n ? 'on' : ''}" style="background:${c}"></button>`).join('')}
      </div></div>
      <div class="two">
        <label class="field"><span>Season</span><select class="input" name="season"><option value="">—</option>${SEASONS.map((s) => `<option ${s === f.season ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field"><span>Brand</span><input class="input" name="brand" value="${h(f.brand)}" maxlength="60" placeholder="optional"></label>
      </div>
      <label class="field"><span>Description</span><textarea class="input" name="description" maxlength="2000" placeholder="Kis ke saath match hota hai, kisne gift kiya, size…">${h(f.description)}</textarea></label>
      <label class="field"><span>Abhi kahan hai?</span><select class="input" name="status">${Object.entries(STATUSES).map(([k, s]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}</select></label>
      <label class="toggle-row"><span class="grow">❤️ Favourite</span><span class="switch"><input type="checkbox" name="favorite" ${f.favorite ? 'checked' : ''}><i></i></span></label>
      <label class="toggle-row"><span class="grow">🌍 Community me dikhao<small>${me.visibility === 'selected' ? 'Aapki setting "Selected items" hai — ye on karoge to dikhega' : me.visibility === 'public' ? 'Aapki poori almirah public hai' : 'Aapki almirah private hai — Profile me badal sakte ho'}</small></span><span class="switch"><input type="checkbox" name="is_public" ${f.is_public ? 'checked' : ''}><i></i></span></label>
      <button class="btn primary block" type="submit" style="margin-top:6px">${existing ? '💾 Save karo' : '📦 Almirah me rakho'}</button>`;
  };
  const sync = () => {
    const d = new FormData(form);
    for (const k of ['title', 'category', 'season', 'brand', 'description', 'status']) if (d.has(k)) f[k] = d.get(k);
    f.favorite = !!form.favorite?.checked;
    f.is_public = !!form.is_public?.checked;
  };
  render();

  form.addEventListener('change', async (e) => {
    if (e.target.name === 'category' && !f.placementTouched) {
      f.placement = HANG_CATEGORIES.has(e.target.value) ? 'hang' : 'fold';
      sync(); render();
    }
    if (e.target.matches('[data-pick]')) {
      sync();
      const files = [...e.target.files].slice(0, max - f.photos.length);
      for (const file of files) {
        const small = await compressImage(file);
        f.photos.push({ file: small, url: URL.createObjectURL(small) });
      }
      sfx.pop(); render();
    }
  });
  form.addEventListener('click', async (e) => {
    const t = e.target;
    const b = t.closest('button');
    if (!b) return;
    if (b.dataset.rm !== undefined) {
      sync();
      const [p] = f.photos.splice(Number(b.dataset.rm), 1);
      if (p.id) f.removed.push(p.id);
      render();
    } else if (b.dataset.place) {
      sync(); f.placement = b.dataset.place; f.placementTouched = true; sfx.tap(); render();
    } else if (b.dataset.loc) {
      sync(); f.location_id = Number(b.dataset.loc); sfx.tap(); render();
    } else if (b.hasAttribute('data-newloc')) {
      sync();
      const l = await addLocationFlow();
      if (l) f.location_id = l.id;
      render(); changed();
    } else if (b.dataset.tag) {
      sync();
      const tag = b.dataset.tag;
      f.tags = f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag];
      sfx.tap(); render();
    } else if (b.dataset.color) {
      sync(); f.color = f.color === b.dataset.color ? '' : b.dataset.color; sfx.tap(); render();
    }
  });
  form.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-newtag]') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      addTypedTag(e.target);
    }
  });
  form.addEventListener('focusout', (e) => { if (e.target.matches('[data-newtag]')) addTypedTag(e.target); });
  function addTypedTag(input) {
    const v = input.value.trim().toLowerCase().replace(/^#/, '');
    if (!v) return;
    sync();
    for (const t of v.split(',').map((x) => x.trim()).filter(Boolean)) if (!f.tags.includes(t)) f.tags.push(t);
    render();
    $('[data-newtag]', form)?.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pending = $('[data-newtag]', form);
    if (pending?.value.trim()) addTypedTag(pending);
    sync();
    if (!f.title.trim()) { toast('Title likhna zaroori hai', 'err'); $('[name=title]', form).focus(); return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const fd = new FormData();
    for (const k of ['title', 'category', 'placement', 'color', 'season', 'brand', 'description', 'status']) fd.append(k, f[k] || '');
    fd.append('tags', f.tags.join(','));
    fd.append('location_id', f.location_id || '');
    fd.append('favorite', f.favorite ? '1' : '0');
    fd.append('is_public', f.is_public ? '1' : '0');
    f.photos.filter((p) => p.file).forEach((p) => fd.append('images[]', p.file, p.file.name || 'photo.jpg'));
    if (f.removed.length) fd.append('remove_images', f.removed.join(','));
    try {
      const { item } = await post(existing ? `items/${existing.id}` : 'items', fd);
      upsertItem(item);
      const coverEl = $('.photo-slot.filled', form);
      const fromRect = coverEl?.getBoundingClientRect();
      const coverUrl = f.photos[0]?.url;
      if (existing) {
        toast('Save ho gaya ✅');
        await modal.close();
        changed();
        return;
      }
      await modal.close();
      await placeNewItem(item, coverUrl, fromRect);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = existing ? '💾 Save karo' : '📦 Almirah me rakho';
      toastError(err);
    }
  });
}

/** After adding: go to that almirah, open the doors and fold the new cloth into its place. */
async function placeNewItem(item, coverUrl, fromRect) {
  state.currentLoc = item.location_id ?? 0;
  window.dispatchEvent(new CustomEvent('wardrobe:show-item', { detail: item }));
  await wait(60);
  const slot = itemEl(item.id);
  if (!coverUrl || !fromRect || !animationsOn()) { sfx.success(); toast(`"${item.title}" almirah me rakh diya 👌`); return; }
  slot?.classList.add('ghost');
  await wait(state.doorsOpen ? 150 : 1000);
  const target = visibleRect(visualOf(slot)) || fallbackTarget();
  const start = { left: innerWidth / 2 - 120, top: Math.max(80, innerHeight / 2 - 190), width: 240, height: 320 };
  await foldTo(coverUrl, start, target, { fabric: fabricOf(item) });
  slot?.classList.remove('ghost');
  slot?.classList.add('landed');
  sfx.success();
  toast(`"${item.title}" almirah me rakh diya 👌`);
}
