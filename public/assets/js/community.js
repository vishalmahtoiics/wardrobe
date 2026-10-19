// Community: rooms chat (polling), public clothes feed, public wardrobes and profiles.

import { get, post, del, prefs } from './api.js';
import { state, isAdmin } from './state.js';
import { ROOMS, OCCASIONS, CATEGORY_ICON } from './data.js';
import { h, $, $$, avatar, clock, dayLabel, toastError, confirmBox, openModal, cssUrl, debounce } from './ui.js';
import { openPublicItem } from './item.js';
import { sfx } from './sound.js';

let tab = prefs.get('commTab', 'chat');
let room = prefs.get('room', 'general');
let pollTimer = null;
let lastId = 0;
let attachedItem = null;
let feedFilter = { gender: '', tag: '' };

export function stopCommunity() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

export function renderCommunity(view) {
  stopCommunity();
  if (window.__shareItem) {
    tab = 'chat';
    attachedItem = state.items.find((i) => i.id === window.__shareItem) || null;
    window.__shareItem = null;
  }
  view.innerHTML = `
    <h1 class="title serif">Community 💬</h1>
    <p class="muted" style="margin:0 0 12px">Sab users se baat karo, style ideas lo, public almirah dekho.</p>
    <div class="seg" style="margin-bottom:14px">
      <button data-tab="chat" class="${tab === 'chat' ? 'on' : ''}">💬 Chat</button>
      <button data-tab="explore" class="${tab === 'explore' ? 'on' : ''}">🌟 Explore</button>
      <button data-tab="wardrobes" class="${tab === 'wardrobes' ? 'on' : ''}">🚪 Almirahs</button>
    </div>
    <div id="comm"></div>`;
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    prefs.set('commTab', tab);
    sfx.tap();
    renderCommunity(view);
  }));
  const box = $('#comm', view);
  if (tab === 'chat') renderChat(box);
  if (tab === 'explore') renderExplore(box);
  if (tab === 'wardrobes') renderWardrobes(box);
}

/* ---------- Chat ---------- */

function messageHtml(m, prevDay) {
  const mine = m.user.id === state.me.id;
  const day = dayLabel(m.created_at);
  const sep = day !== prevDay ? `<div class="day-sep">${day}</div>` : '';
  const badge = m.user.role !== 'user' ? ' 🛡️' : '';
  const item = m.item ? `<button class="share-card" data-pub="${m.item.id}">
      <span class="th" style="${cssUrl(m.item.thumb)}">${m.item.thumb ? '' : CATEGORY_ICON[m.item.category] || '👕'}</span>
      <span><b>${h(m.item.title)}</b><br><span class="small" style="opacity:.75">${h(m.item.category)} · dekho 👀</span></span></button>` : '';
  return `${sep}<div class="msg ${mine ? 'me' : ''}" data-mid="${m.id}" data-day="${day}">
    ${mine ? '' : `<a href="#/u/${m.user.id}" style="text-decoration:none">${avatar(m.user, 'sm')}</a>`}
    <div class="bubble" ${(mine || isAdmin()) && !m.deleted ? `data-own="${m.id}"` : ''}>
      ${mine ? '' : `<div class="who">${h(m.user.name)}${badge}</div>`}
      ${m.deleted ? '<span class="del">🚫 message delete ho gaya</span>' : `${item}${m.body ? h(m.body).replace(/\n/g, '<br>') : ''}`}
      <div class="when">${clock(m.created_at)}</div>
    </div></div>`;
}

function renderChat(box) {
  lastId = 0;
  box.innerHTML = `
    <div class="rooms">${Object.entries(ROOMS).map(([k, r]) => `<button class="chip ${room === k ? 'on' : ''}" data-room="${k}">${r.icon} ${r.label}</button>`).join('')}</div>
    <div class="chat">
      <div class="row small muted" style="padding:8px 14px;border-bottom:1px solid var(--line)"><span class="grow">${ROOMS[room].icon} <b>${ROOMS[room].label}</b></span><span id="online"></span></div>
      <div class="chat-list" id="chatList"><div class="spinner"></div></div>
      <div id="attached"></div>
      <form class="composer" id="composer">
        <button type="button" class="icon-btn" id="attach" title="Apna kapda share karo">👗</button>
        <textarea rows="1" maxlength="1000" placeholder="Kuch likho…" id="msgInput"></textarea>
        <button class="icon-btn send" type="submit" aria-label="Send">➤</button>
      </form>
    </div>`;
  $$('[data-room]', box).forEach((b) => b.addEventListener('click', () => {
    room = b.dataset.room; prefs.set('room', room); sfx.tap(); stopCommunity(); renderChat(box);
  }));
  const list = $('#chatList', box);
  const input = $('#msgInput', box);
  const showAttached = () => {
    $('#attached', box).innerHTML = attachedItem
      ? `<div class="attached">👗 <b class="grow ellipsis">${h(attachedItem.title)}</b><button class="btn ghost sm" id="unattach">✕</button></div>` : '';
    $('#unattach', box)?.addEventListener('click', () => { attachedItem = null; showAttached(); });
  };
  showAttached();
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('#composer', box).requestSubmit(); }
  });
  $('#attach', box).addEventListener('click', () => pickItem((it) => { attachedItem = it; showAttached(); input.focus(); }));
  $('#composer', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body && !attachedItem) return;
    const payload = { room, body, item_id: attachedItem?.id || 0 };
    input.value = ''; input.style.height = 'auto';
    attachedItem = null; showAttached();
    try {
      const { message } = await post('chat', payload);
      append([message], list, true);
      sfx.pop();
    } catch (err) { input.value = body; toastError(err); }
  });
  list.addEventListener('click', async (e) => {
    const pub = e.target.closest('[data-pub]');
    if (pub) return openPublicItem(pub.dataset.pub, pub);
    const own = e.target.closest('[data-own]');
    if (own && !e.target.closest('a')) {
      if (!(await confirmBox('Ye message delete karein?', { ok: 'Delete', danger: true, icon: '🗑️' }))) return;
      try {
        await del(`chat/${own.dataset.own}`);
        own.innerHTML = '<span class="del">🚫 message delete ho gaya</span>';
        own.removeAttribute('data-own');
      } catch (err) { toastError(err); }
    }
  });
  poll(list, true);
}

function append(messages, list, forceScroll = false) {
  const fresh = messages.filter((m) => m.id > lastId);
  if (!fresh.length) return;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  $('.spinner', list)?.remove();
  $('.empty', list)?.remove();
  let prevDay = $$('.msg', list).pop()?.dataset.day || '';
  let html = '';
  for (const m of fresh) {
    html += messageHtml(m, prevDay);
    prevDay = dayLabel(m.created_at);
  }
  list.insertAdjacentHTML('beforeend', html);
  lastId = Math.max(lastId, ...fresh.map((m) => m.id));
  prefs.set('lastChatId', Math.max(prefs.get('lastChatId', 0), lastId));
  if (nearBottom || forceScroll) list.scrollTop = list.scrollHeight;
}

async function poll(list, first = false) {
  if (!list.isConnected) return;
  try {
    const data = await get('chat', { room, after: first ? 0 : lastId });
    const online = $('#online');
    if (online) online.textContent = `🟢 ${data.online} online`;
    if (first && !data.messages.length) {
      list.innerHTML = `<div class="empty"><b>👋</b>Abhi koi baat nahi hui. Pehla message aap karo!</div>`;
    }
    if (!data.enabled && first) list.insertAdjacentHTML('afterbegin', '<div class="day-sep">⏸️ Admin ne chat abhi band ki hai</div>');
    const hadMessages = lastId > 0;
    append(data.messages, list, first);
    if (hadMessages && data.messages.some((m) => m.user.id !== state.me.id)) sfx.pop();
  } catch (err) {
    if (first) list.innerHTML = `<div class="empty"><b>😕</b>${h(err.message)}</div>`;
  }
  if (list.isConnected) pollTimer = setTimeout(() => poll(list), document.hidden ? 15000 : 3000);
}

function pickItem(onPick) {
  const items = state.items.slice(0, 300);
  const m = openModal(items.length ? `<div class="grid">${items.map((i) => `
      <button class="icard" data-pick="${i.id}"><div class="ph" style="${cssUrl(i.images[0]?.thumb)}">${i.images[0] ? '' : CATEGORY_ICON[i.category] || '👕'}</div>
      <div class="meta"><div class="t ellipsis">${h(i.title)}</div></div></button>`).join('')}</div>`
    : '<div class="empty"><b>🧺</b>Pehle almirah me kuch kapde add karo</div>', { title: 'Kaunsa kapda share karna hai?' });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    onPick(state.items.find((i) => i.id === Number(b.dataset.pick)));
    m.close();
  });
}

/* ---------- Explore & wardrobes ---------- */

export const publicCard = (i) => `
  <button class="icard" data-pubitem="${i.id}">
    <div class="ph" style="${cssUrl(i.images[0]?.thumb)}">${i.images[0] ? '' : CATEGORY_ICON[i.category] || '👕'}</div>
    <div class="meta"><div class="t ellipsis">${h(i.title)}</div>
    <div class="row small muted" style="gap:6px;margin-top:4px">${avatar(i.owner, 'sm')}<span class="ellipsis">${h(i.owner.name)}</span></div></div>
  </button>`;

export function bindPublicCards(root) {
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pubitem]');
    if (c) openPublicItem(c.dataset.pubitem, c);
  });
}

async function renderExplore(box) {
  box.innerHTML = `
    <div class="chips scroll" style="margin-bottom:8px">
      ${[['', '🌈 Sab'], ['female', '💃 Girls'], ['male', '🕺 Boys']].map(([g, l]) => `<button class="chip ${feedFilter.gender === g ? 'on' : ''}" data-g="${g}">${l}</button>`).join('')}
      ${OCCASIONS.map((o) => `<button class="chip ${feedFilter.tag === o.tag ? 'on' : ''}" data-t="${o.tag}">${o.icon} ${o.label}</button>`).join('')}
    </div>
    <div id="feed"><div class="spinner"></div></div>`;
  box.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { feedFilter.gender = b.dataset.g; renderExplore(box); }));
  box.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { feedFilter.tag = feedFilter.tag === b.dataset.t ? '' : b.dataset.t; renderExplore(box); }));
  try {
    const { items } = await get('community/feed', feedFilter);
    const feed = $('#feed', box);
    if (!feed) return;
    feed.innerHTML = items.length ? `<div class="grid">${items.map(publicCard).join('')}</div>`
      : '<div class="empty"><b>🌱</b>Abhi koi public kapda nahi hai. Profile me jaake apni almirah public karo!</div>';
    bindPublicCards(feed);
  } catch (e) { toastError(e); }
}

async function renderWardrobes(box) {
  box.innerHTML = `
    <div class="searchbar" style="margin-bottom:12px">🔍<input placeholder="Naam se dhundo…" id="wq"></div>
    <div id="wl" class="list"><div class="spinner"></div></div>`;
  const load = async (q = '') => {
    try {
      const { wardrobes } = await get('community/wardrobes', { q });
      const wl = $('#wl', box);
      if (!wl) return;
      wl.innerHTML = wardrobes.length ? wardrobes.map((w) => `
        <a class="wardrobe-card" href="#/u/${w.id}" style="text-decoration:none;color:inherit">
          ${avatar(w)}
          <span class="grow"><b>${h(w.name)}</b><br><span class="small muted">${w.public_count} kapde · ${w.gender === 'female' ? '💃' : w.gender === 'male' ? '🕺' : '🌈'}</span></span>
          <span class="thumbs">${w.thumbs.map((t) => `<i style="${cssUrl(t)}"></i>`).join('')}</span>
        </a>`).join('') : '<div class="empty"><b>🚪</b>Abhi koi public almirah nahi hai</div>';
    } catch (e) { toastError(e); }
  };
  $('#wq', box).addEventListener('input', debounce((e) => load(e.target.value), 300));
  load();
}

export async function renderUser(view, id) {
  view.innerHTML = '<div class="spinner"></div>';
  try {
    const { user, items } = await get(`community/users/${id}`);
    view.innerHTML = `
      <a href="#/community" class="btn ghost sm" style="margin:4px 0 0 -10px">← Community</a>
      <div class="profile-head">${avatar(user, 'lg')}<div><h1 class="title serif" style="margin:0">${h(user.name)}</h1>
        <div class="muted">${items.length} public kapde${user.bio ? ` · ${h(user.bio)}` : ''}</div></div></div>
      ${items.length ? `<div class="grid">${items.map(publicCard).join('')}</div>` : '<div class="empty"><b>🔒</b>Kuch public nahi hai</div>'}`;
    bindPublicCards(view);
  } catch (e) {
    view.innerHTML = `<div class="empty"><b>🔒</b>${h(e.message)}<br><br><a class="btn" href="#/community">Wapas</a></div>`;
  }
}

/** Light background check for new chat messages (shows a dot on the tab). */
export async function checkUnread() {
  try {
    const { messages } = await get('chat', { room: 'general', after: prefs.get('lastChatId', 0) });
    return messages.some((m) => m.user.id !== state.me?.id);
  } catch { return false; }
}

