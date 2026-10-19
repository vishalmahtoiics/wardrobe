// Wardrobe app shell: login, routing, home (almirah) and search.

import { get, post, token, prefs, needsServer, isNativeApp, serverUrl, setServerUrl, setUnauthorizedHandler } from './api.js';
import { state, loadWardrobe, locationById, fabricOf, locLabel, statusOf, matches, recount } from './state.js';
import { CATEGORY_ICON, OCCASIONS, STATUSES } from './data.js';
import { h, $, $$, toast, toastError, avatar, cssUrl, debounce, closeAllModals, wait } from './ui.js';
import { openItem, openForm, addLocationFlow, garmentShape } from './item.js';
import { renderCommunity, stopCommunity, renderUser, checkUnread } from './community.js';
import { renderProfile, applyTheme } from './profile.js';
import { sound, sfx } from './sound.js';
import { setFastFolding } from './fold.js';

const app = $('#app');
sound.enabled = prefs.get('sound', true);
setFastFolding(prefs.get('fast', false));

/* ---------- Boot ---------- */

async function boot() {
  setUnauthorizedHandler(() => { token.set(null); state.me = null; showAuth(); });
  if (needsServer()) return showServerSetup();
  try {
    state.meta = await get('meta');
  } catch (e) {
    hideSplash();
    if (isNativeApp()) return showServerSetup(e.message);
    app.innerHTML = `<div class="auth"><div class="card center auth-card"><div style="font-size:50px">🔌</div>
      <h2>Server se connect nahi hua</h2><p class="muted">${h(e.message)}</p>
      ${e.status === 503 ? '<a class="btn primary" href="install.php">Setup karo (install.php)</a>' : '<button class="btn primary" onclick="location.reload()">Dobara try karo</button>'}</div></div>`;
    return;
  }
  document.title = `${state.meta.app_name} — Meri Almirah`;
  if (!token.get()) return showAuth();
  try {
    const me = await get('auth/me');
    state.me = me.user;
    state.storage = me.storage;
    applyTheme(state.me.theme || prefs.get('theme', 'teak'));
    await loadWardrobe();
    showShell();
  } catch (e) {
    if (e.status !== 401) {
      hideSplash();
      app.innerHTML = `<div class="auth"><div class="card center auth-card"><div style="font-size:50px">📵</div><h2>Oops</h2><p class="muted">${h(e.message)}</p><button class="btn primary" onclick="location.reload()">Dobara try karo</button></div></div>`;
    }
  }
}

function hideSplash() {
  const s = $('#splash');
  if (s) { s.classList.add('gone'); setTimeout(() => s.remove(), 500); }
}

/* ---------- Server setup (Android app) ---------- */

function showServerSetup(err = '') {
  hideSplash();
  app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-hero"><img class="logo" src="icons/logo.svg" alt=""><h1 class="serif">Wardrobe</h1><p class="muted">Pehle apna server address daalo</p></div>
    <form class="card" id="srv">
      ${err ? `<p class="toast err" style="animation:none">${h(err)}</p>` : ''}
      <label class="field"><span>Website address (jahan Wardrobe install hai)</span>
      <input class="input" name="url" value="${h(serverUrl())}" placeholder="https://wardrobe.example.com" required inputmode="url" autocapitalize="off"></label>
      <button class="btn primary block">Connect karo →</button>
    </form></div></div>`;
  $('#srv').addEventListener('submit', (e) => {
    e.preventDefault();
    setServerUrl(new FormData(e.target).get('url'));
    location.reload();
  });
}

/* ---------- Auth ---------- */

function showAuth(mode = 'login') {
  hideSplash();
  stopCommunity();
  let gender = 'female';
  const canRegister = state.meta.allow_register !== false;
  app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-hero"><img class="logo" src="icons/logo.svg" alt="">
      <h1 class="serif">${h(state.meta.app_name || 'Wardrobe')}</h1>
      <p class="muted" style="margin:0">${h(state.meta.welcome_note || '')}</p></div>
    <div class="card">
      ${canRegister ? `<div class="seg" style="margin-bottom:16px">
        <button data-mode="login" class="${mode === 'login' ? 'on' : ''}">Login</button>
        <button data-mode="register" class="${mode === 'register' ? 'on' : ''}">Naya account</button></div>` : ''}
      <form id="authForm">
        ${mode === 'register' ? `
          <label class="field"><span>Aapka naam</span><input class="input" name="name" required autocomplete="name" placeholder="Priya / Rahul"></label>
          <div class="field"><span>Main hoon</span><div class="gender-pick">
            <button type="button" data-g="female" class="on"><b>👩</b>Girl</button>
            <button type="button" data-g="male"><b>👨</b>Boy</button>
            <button type="button" data-g="other"><b>🌈</b>Other</button></div></div>` : ''}
        <label class="field"><span>Email</span><input class="input" name="email" type="email" required autocomplete="email" placeholder="aap@example.com"></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
        <button class="btn primary block" type="submit">${mode === 'login' ? '🚪 Almirah kholo' : '✨ Account banao'}</button>
      </form>
    </div>
    ${isNativeApp() ? `<p class="center small muted">Server: ${h(serverUrl())} · <a href="#" id="chgSrv">badlo</a></p>` : ''}
  </div></div>`;
  $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { sfx.tap(); showAuth(b.dataset.mode); }));
  $$('[data-g]').forEach((b) => b.addEventListener('click', () => {
    gender = b.dataset.g;
    $$('[data-g]').forEach((x) => x.classList.toggle('on', x === b));
    applyTheme(gender === 'female' ? 'rose' : 'teak');
    sfx.tap();
  }));
  $('#chgSrv')?.addEventListener('click', (e) => { e.preventDefault(); showServerSetup(); });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (mode === 'register') data.gender = gender;
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    try {
      const res = await post(mode === 'login' ? 'auth/login' : 'auth/register', data);
      token.set(res.token);
      state.me = res.user;
      applyTheme(res.user.theme);
      await loadWardrobe();
      sfx.success();
      location.hash = '#/';
      showShell();
      toast(mode === 'login' ? `Welcome back, ${res.user.name.split(' ')[0]}! 👋` : 'Account ban gaya! Ab apne kapde add karo 👕');
    } catch (err) {
      btn.disabled = false;
      toastError(err);
    }
  });
}

async function logout() {
  try { await post('auth/logout'); } catch { /* token is dropped anyway */ }
  token.set(null);
  state.me = null;
  state.doorsOpen = false;
  location.hash = '#/';
  showAuth();
}

/* ---------- Shell & routing ---------- */

function showShell() {
  hideSplash();
  app.innerHTML = `
    <header class="topbar">
      <a class="brand serif" href="#/"><img class="logo" src="icons/logo.svg" alt="">${h(state.meta.app_name || 'Wardrobe')}</a>
      <span class="grow"></span>
      <button class="icon-btn" id="sndBtn" aria-label="Sound">${sound.enabled ? '🔊' : '🔇'}</button>
      <a href="#/me" id="meBtn" style="text-decoration:none">${avatar(state.me)}</a>
    </header>
    <main id="view"></main>
    <nav class="tabbar">
      <a href="#/" data-r=""><span class="ic">🚪</span>Almirah</a>
      <a href="#/search" data-r="search"><span class="ic">🔍</span>Dhundo</a>
      <button class="add" id="addBtn" aria-label="Add cloth">＋</button>
      <a href="#/community" data-r="community"><span class="ic">💬</span>Community</a>
      <a href="#/me" data-r="me"><span class="ic">👤</span>Profile</a>
    </nav>`;
  $('#addBtn').addEventListener('click', () => { sfx.pop(); openForm(); });
  $('#sndBtn').addEventListener('click', (e) => {
    sound.enabled = !sound.enabled;
    prefs.set('sound', sound.enabled);
    e.currentTarget.textContent = sound.enabled ? '🔊' : '🔇';
    sfx.pop();
  });
  route();
  pollUnread();
}

let unreadTimer = null;
async function pollUnread() {
  clearTimeout(unreadTimer);
  if (!state.me) return;
  if (!location.hash.startsWith('#/community')) {
    const has = await checkUnread();
    const link = $('.tabbar a[data-r="community"]');
    if (link && !$('.dot', link) && has) link.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
  }
  unreadTimer = setTimeout(pollUnread, 30000);
}

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

async function route() {
  if (!state.me || !$('#view')) return;
  await closeAllModals();
  stopCommunity();
  const view = $('#view');
  const { parts, query } = parseHash();
  const r = parts[0] || '';
  $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.r === (r === 'u' ? 'community' : r)));
  if (r === 'community') $('.tabbar a[data-r="community"] .dot')?.remove();
  view.classList.remove('view-enter');
  void view.offsetWidth;
  view.classList.add('view-enter');
  window.scrollTo(0, 0);
  if (r === 'search') return renderSearch(view, query);
  if (r === 'community') return renderCommunity(view);
  if (r === 'me') return renderProfile(view, { logout });
  if (r === 'u' && parts[1]) return renderUser(view, parts[1]);
  renderHome(view);
}

window.addEventListener('hashchange', route);
window.addEventListener('wardrobe:changed', () => {
  const { parts } = parseHash();
  const r = parts[0] || '';
  const me = $('#meBtn');
  if (me) me.innerHTML = avatar(state.me);
  if (r === '') renderHome($('#view'), true);
  if (r === 'search') renderResults();
});
window.addEventListener('wardrobe:show-item', async () => {
  if (location.hash && location.hash !== '#/') {
    location.hash = '#/';
    await wait(30);
  }
  renderHome($('#view'), true, true);
});

/* ---------- Home: the almirah ---------- */

const HANGER_SVG = '<svg viewBox="0 0 54 26"><path d="M27 2a4 4 0 1 1 4 4c-2 0-4 1.5-4 4" fill="none" stroke="#cfd3d6" stroke-width="2.2" stroke-linecap="round"/><path d="M27 10 3 23h48z" fill="none" stroke="#e7e2d6" stroke-width="2.6" stroke-linejoin="round"/></svg>';

function currentLocId() {
  const has0 = state.items.some((i) => !i.location_id);
  if (state.currentLoc === 0 && has0) return 0;
  if (locationById(state.currentLoc)) return state.currentLoc;
  return state.locations[0]?.id ?? 0;
}

function almirahHtml(locId, open) {
  const loc = locationById(locId);
  const items = state.items.filter((i) => (i.location_id || 0) === locId);
  const hang = items.filter((i) => i.placement === 'hang');
  const fold = items.filter((i) => i.placement !== 'hang');
  const name = loc ? `${loc.emoji} ${loc.name}` : '📦 Bina jagah';
  const stIcon = (i) => (i.status !== 'in' ? `<span class="st" title="${statusOf(i).label}">${statusOf(i).icon}</span>` : '');
  return `
    <div class="almirah ${open ? 'open' : ''}" id="almirah">
      <div class="crown"><span class="plate">${h(name)} · ${items.length}</span></div>
      <div class="cabinet">
        <div class="inside"><div class="inside-scroll">
          ${hang.length ? `<div class="rod-zone"><div class="rod"></div><div class="hangers">
            ${hang.map((i) => `<button class="hanger ${i.status !== 'in' ? 'dim' : ''}" data-item="${i.id}" title="${h(i.title)}">${HANGER_SVG}
              <div class="garment ${garmentShape(i.category)}" style="${cssUrl(i.images[0]?.thumb)};${fabricOf(i) ? `background-color:${fabricOf(i)}` : ''}"></div>
              <span class="hn">${stIcon(i) ? statusOf(i).icon + ' ' : ''}${h(i.title)}</span></button>`).join('')}
          </div></div>` : ''}
          ${fold.length ? `<div class="shelves">
            ${fold.map((i) => `<button class="fitem ${i.status !== 'in' ? 'dim' : ''}" data-item="${i.id}" style="--fab:${fabricOf(i) || 'var(--wood-1)'}" title="${h(i.title)}">
              <span class="cloth" style="${cssUrl(i.images[0]?.thumb)}">${i.images[0] ? '' : `<span class="ic">${CATEGORY_ICON[i.category] || '👕'}</span>`}</span>
              ${stIcon(i)}<span class="fl">${h(i.title)}</span></button>`).join('')}
          </div>` : ''}
          ${!items.length ? `<div class="empty-almirah"><b>🧺</b>Ye almirah khaali hai!<br><span class="small">Neeche ＋ dabao aur pehla kapda rakho</span></div>` : ''}
        </div></div>
        <div class="door left" data-door><div class="face"><div class="panel"></div><div class="panel"></div><span class="handle"></span><span class="keyhole"></span></div><div class="back"></div></div>
        <div class="door right" data-door><div class="face"><div class="mirror"></div><div class="panel"></div><span class="handle"></span></div><div class="back"></div></div>
        <div class="door-hint">👆 Almirah kholne ke liye tap karo</div>
      </div>
      <div class="base"></div>
    </div>`;
}

function cardHtml(i) {
  const st = statusOf(i);
  return `<button class="icard" data-item="${i.id}">
    <div class="ph" style="${cssUrl(i.images[0]?.thumb)}">${i.images[0] ? '' : CATEGORY_ICON[i.category] || '👕'}
      ${i.favorite ? '<span class="fav">❤️</span>' : ''}${i.status !== 'in' ? `<span class="stp">${st.icon} ${st.label}</span>` : ''}
      <span class="loc">📍 ${h(locLabel(i))}</span></div>
    <div class="meta"><div class="t ellipsis">${h(i.title)}</div>
      <div class="tagline"><span>${h(i.category)}</span>${i.tags.slice(0, 3).map((t) => `<span>#${h(t)}</span>`).join('')}</div></div>
  </button>`;
}

function setDoors(open, { silent = false } = {}) {
  const a = $('#almirah');
  if (!a) return Promise.resolve();
  if (open === a.classList.contains('open')) return Promise.resolve();
  if (!silent) sfx.creak();
  a.classList.toggle('open', open);
  state.doorsOpen = open;
  if (!open && !silent) setTimeout(() => sfx.doorClose(), 820);
  return wait(open ? 650 : 950);
}

function renderHome(view, keepScroll = false, forceOpen = false) {
  if (!view) return;
  recount();
  const first = state.me.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Namaste' : 'Good evening';
  const locId = currentLocId();
  const laundry = state.items.filter((i) => i.status === 'laundry').length;
  const unplaced = state.items.some((i) => !i.location_id);
  const mode = state.homeMode;
  const scroll = window.scrollY;
  const open = forceOpen || state.doorsOpen;

  view.innerHTML = `
    <div class="home-cols">
      <div>
        <div class="hello"><div><h1 class="title serif">${greet}, ${h(first)} 👋</h1><div class="muted">Aaj kahan jaana hai? Kya pehnoge?</div></div></div>
        <a class="searchbar" href="#/search" style="text-decoration:none;color:var(--muted)">🔍 <span style="padding:10px 0">Dhundo: party, office, saree, Flat…</span></a>
        <div class="chips scroll" style="margin-top:12px">${OCCASIONS.map((o) => `<a class="chip" href="#/search?tag=${o.tag}" style="text-decoration:none;color:inherit">${o.icon} ${o.label}</a>`).join('')}</div>
        <div class="stats-strip" style="margin-top:14px">
          <div class="stat"><b>${state.items.length}</b><span>Kul kapde</span></div>
          <div class="stat"><b>${state.locations.length}</b><span>Jagah</span></div>
          <a class="stat" href="#/search?status=laundry" style="text-decoration:none;color:inherit"><b>${laundry}</b><span>🫧 Dhulai me</span></a>
        </div>
      </div>
      <div class="almirah-col">
        <div class="loc-tabs">
          ${state.locations.map((l) => `<button class="loc-tab ${l.id === locId ? 'on' : ''}" data-loc="${l.id}">${h(l.emoji)} ${h(l.name)} <span class="n">${l.count}</span></button>`).join('')}
          ${unplaced ? `<button class="loc-tab ${locId === 0 ? 'on' : ''}" data-loc="0">📦 Bina jagah <span class="n">${state.items.filter((i) => !i.location_id).length}</span></button>` : ''}
          <button class="loc-tab" data-newloc>➕</button>
        </div>
        <div class="row" style="justify-content:flex-end;margin:0 0 6px">
          <div class="seg" style="width:200px"><button data-mode="almirah" class="${mode === 'almirah' ? 'on' : ''}">🚪 Almirah</button><button data-mode="grid" class="${mode === 'grid' ? 'on' : ''}">▦ Grid</button></div>
        </div>
        ${mode === 'almirah' ? `<div class="almirah-stage">${almirahHtml(locId, open)}</div>
          <div class="almirah-tools">
            <button class="btn sm" id="doorBtn">${open ? '🔒 Band karo' : '🔓 Kholo'}</button>
            <button class="btn sm primary" id="addHere">＋ Yahan kapda rakho</button>
          </div>`
        : `<div class="grid">${state.items.filter((i) => (i.location_id || 0) === locId).map(cardHtml).join('') || '<div class="empty"><b>🧺</b>Yahan abhi kuch nahi hai</div>'}</div>`}
      </div>
    </div>`;
  if (keepScroll) window.scrollTo(0, scroll);

  $$('[data-loc]', view).forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.dataset.loc);
    if (id === locId) return;
    sfx.tap();
    state.currentLoc = id;
    prefs.set('loc', id);
    const wasOpen = state.doorsOpen;
    if (wasOpen && state.homeMode === 'almirah') await setDoors(false);
    state.doorsOpen = false;
    renderHome(view, true);
    if (wasOpen && state.homeMode === 'almirah') { await wait(120); setDoors(true); }
  }));
  $('[data-newloc]', view)?.addEventListener('click', async () => {
    const l = await addLocationFlow();
    if (l) { state.currentLoc = l.id; prefs.set('loc', l.id); state.doorsOpen = false; renderHome(view, true); }
  });
  $$('[data-mode]', view).forEach((b) => b.addEventListener('click', () => {
    state.homeMode = b.dataset.mode;
    prefs.set('homeMode', state.homeMode);
    sfx.tap();
    renderHome(view, true);
  }));
  $('#doorBtn', view)?.addEventListener('click', async () => {
    await setDoors(!state.doorsOpen);
    $('#doorBtn', view).textContent = state.doorsOpen ? '🔒 Band karo' : '🔓 Kholo';
  });
  $('#addHere', view)?.addEventListener('click', () => { state.currentLoc = locId; openForm(); });
  $$('[data-door]', view).forEach((d) => d.addEventListener('click', async () => {
    await setDoors(true);
    const b = $('#doorBtn', view);
    if (b) b.textContent = '🔒 Band karo';
  }));
  view.querySelector('.almirah-col').addEventListener('click', (e) => {
    const el = e.target.closest('[data-item]');
    if (!el) return;
    if (el.classList.contains('hanger')) sfx.hanger();
    openItem(Number(el.dataset.item), el);
  });
  if (forceOpen && !$('#almirah')?.classList.contains('open')) setDoors(true);
  else if (forceOpen) state.doorsOpen = true;
}

/* ---------- Search ---------- */

const search = { q: '', tag: '', loc: '', cat: '', status: '', fav: false };

function renderSearch(view, query) {
  if (query.has('tag')) Object.assign(search, { tag: query.get('tag'), q: '' });
  if (query.has('status')) Object.assign(search, { status: query.get('status') });
  const cats = [...new Set(state.items.map((i) => i.category))].sort();
  const otherTags = [...new Set(state.items.flatMap((i) => i.tags))].filter((t) => !OCCASIONS.some((o) => o.tag === t)).slice(0, 30);
  view.innerHTML = `
    <h1 class="title serif">Kya dhundh rahe ho? 🔍</h1>
    <p class="muted" style="margin:0 0 12px">Ek jagah dekho kya kahan rakha hai — ghar, flat, sab.</p>
    <div class="searchbar"><span>🔍</span><input id="q" type="search" placeholder="party, red saree, office shirt, Flat…" value="${h(search.q)}" autocomplete="off"></div>
    <div class="chips scroll" style="margin-top:12px">
      ${OCCASIONS.map((o) => `<button class="chip ${search.tag === o.tag ? 'on' : ''}" data-tag="${o.tag}">${o.icon} ${o.label}</button>`).join('')}
      ${otherTags.map((t) => `<button class="chip ${search.tag === t ? 'on' : ''}" data-tag="${h(t)}">#${h(t)}</button>`).join('')}
    </div>
    <div class="row wrap" style="margin:12px 0 6px">
      <select class="input" id="fLoc" style="flex:1;min-width:130px;padding:9px 12px"><option value="">📍 Sab jagah</option>
        ${state.locations.map((l) => `<option value="${l.id}" ${String(l.id) === String(search.loc) ? 'selected' : ''}>${h(l.emoji)} ${h(l.name)}</option>`).join('')}</select>
      <select class="input" id="fCat" style="flex:1;min-width:130px;padding:9px 12px"><option value="">👕 Sab category</option>
        ${cats.map((c) => `<option ${c === search.cat ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>
      <select class="input" id="fSt" style="flex:1;min-width:130px;padding:9px 12px"><option value="">🚦 Koi bhi status</option>
        ${Object.entries(STATUSES).map(([k, s]) => `<option value="${k}" ${k === search.status ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}</select>
      <button class="chip ${search.fav ? 'on' : ''}" id="fFav">❤️ Favourite</button>
    </div>
    <div id="results"></div>`;
  const q = $('#q', view);
  if (!query.has('tag') && !query.has('status') && matchMedia('(pointer:fine)').matches) q.focus();
  q.addEventListener('input', debounce(() => { search.q = q.value; renderResults(); }, 120));
  $$('[data-tag]', view).forEach((b) => b.addEventListener('click', () => {
    search.tag = search.tag === b.dataset.tag ? '' : b.dataset.tag;
    $$('[data-tag]', view).forEach((x) => x.classList.toggle('on', x.dataset.tag === search.tag));
    sfx.tap(); renderResults();
  }));
  $('#fLoc', view).addEventListener('change', (e) => { search.loc = e.target.value; renderResults(); });
  $('#fCat', view).addEventListener('change', (e) => { search.cat = e.target.value; renderResults(); });
  $('#fSt', view).addEventListener('change', (e) => { search.status = e.target.value; renderResults(); });
  $('#fFav', view).addEventListener('click', (e) => { search.fav = !search.fav; e.currentTarget.classList.toggle('on', search.fav); sfx.tap(); renderResults(); });
  $('#results', view).addEventListener('click', (e) => {
    const el = e.target.closest('[data-item]');
    if (el) openItem(Number(el.dataset.item), el);
  });
  renderResults();
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  const list = state.items.filter((i) => matches(i, search.q)
    && (!search.tag || i.tags.includes(search.tag))
    && (!search.loc || String(i.location_id || '') === String(search.loc))
    && (!search.cat || i.category === search.cat)
    && (!search.status || i.status === search.status)
    && (!search.fav || i.favorite));
  if (!state.items.length) {
    box.innerHTML = '<div class="empty"><b>🧺</b>Abhi koi kapda add nahi kiya.<br><br><button class="btn primary" id="addFirst">＋ Pehla kapda add karo</button></div>';
    $('#addFirst', box).addEventListener('click', () => openForm());
    return;
  }
  if (!list.length) {
    box.innerHTML = '<div class="empty"><b>🤷</b>Kuch nahi mila. Doosra word try karo.</div>';
    return;
  }
  // Group by place so it is obvious where each cloth is kept.
  const groups = new Map();
  for (const i of list) {
    const k = i.location_id || 0;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const order = [...state.locations.map((l) => l.id), 0].filter((k) => groups.has(k));
  box.innerHTML = `<p class="small muted" style="margin:8px 2px">${list.length} kapde mile</p>` + order.map((k) => {
    const l = locationById(k);
    return `<h2 class="section">${l ? `${h(l.emoji)} ${h(l.name)}` : '📦 Bina jagah'} <span class="badge">${groups.get(k).length}</span></h2>
      <div class="grid">${groups.get(k).map(cardHtml).join('')}</div>`;
  }).join('');
}

boot();
