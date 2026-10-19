// Small UI helpers: escaping, toasts, modals that respect the Android back button, dates.

import { sfx } from './sound.js';
import { media } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const cssUrl = (path) => (path ? `background-image:url('${media(path).replace(/'/g, '%27')}')` : '');

export function toast(msg, type = '') {
  const box = $('#toast');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.append(t);
  if (type === 'err') sfx.error();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 3800 : 2400);
}

export const toastError = (e) => toast(e?.message || String(e), 'err');

/* ---------- Modals ---------- */

const stack = [];
let popping = false;
let ignorePops = 0;
const popWaiters = [];

window.addEventListener('popstate', () => {
  if (ignorePops > 0) { ignorePops--; popWaiters.shift()?.(); return; }
  const top = stack[stack.length - 1];
  if (top) {
    popping = true;
    top.close().finally(() => { popping = false; });
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

/**
 * Opens a bottom sheet. Pressing the phone's back button closes it.
 * `beforeClose` may return a promise (used for the fold animation).
 */
export function openModal(html, { cls = '', beforeClose, onClose, title, wide } = {}) {
  const el = document.createElement('div');
  el.className = `modal ${cls}`;
  el.innerHTML = `<div class="scrim"></div><div class="sheet" ${wide ? 'style="width:min(900px,100%)"' : ''}>
    <div class="grab"></div>
    ${title !== undefined ? `<div class="sheet-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>` : ''}
    <div class="sheet-body">${html}</div></div>`;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  let closed = false;
  const modal = {
    el,
    body: $('.sheet-body', el),
    async close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(modal);
      if (i >= 0) stack.splice(i, 1);
      if (!popping) {
        // Drop the history entry this modal pushed, and wait so a following navigation is not undone.
        ignorePops++;
        const popped = new Promise((r) => popWaiters.push(r));
        history.back();
        await Promise.race([popped, wait(400)]);
      }
      try { if (beforeClose) await beforeClose(); } catch { /* animation errors never block closing */ }
      el.classList.add('closing');
      setTimeout(() => {
        el.remove();
        if (!stack.length) document.body.style.overflow = '';
        onClose && onClose();
      }, 260);
    },
  };
  stack.push(modal);
  history.pushState({ modal: stack.length }, '');
  $('.scrim', el).addEventListener('click', () => modal.close());
  el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-close]');
    if (!c) return;
    const href = c.tagName === 'A' ? c.getAttribute('href') : null;
    if (href) e.preventDefault();
    await modal.close();
    if (href) location.hash = href;
  });
  return modal;
}

/** Closes every modal without touching history (used when the route changes). */
export const closeAllModals = async () => {
  popping = true;
  try { while (stack.length) await stack[stack.length - 1].close(); } finally { popping = false; }
};

export function confirmBox(message, { ok = 'Haan', cancel = 'Rehne do', danger = false, icon = '🤔' } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal(`
      <div class="center" style="padding:8px 4px 4px">
        <div style="font-size:44px">${icon}</div>
        <p style="font-size:16px;margin:8px 0 18px">${message}</p>
        <div class="two"><button class="btn" data-a="0">${cancel}</button>
        <button class="btn primary" data-a="1" ${danger ? 'style="background:#d43a3a"' : ''}>${ok}</button></div>
      </div>`, { onClose: () => resolve(answer) });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) { answer = b.dataset.a === '1'; m.close(); }
    });
  });
}

/** Simple form dialog. fields: [{name, label, type, value, placeholder}] → resolves values or null. */
export function promptBox(title, fields, { ok = 'Save', extra = '' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const m = openModal(`
      <form>
        ${fields.map((f) => `<label class="field"><span>${h(f.label)}</span>
          <input class="input" name="${f.name}" type="${f.type || 'text'}" value="${h(f.value || '')}" placeholder="${h(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.minlength ? `minlength="${f.minlength}"` : ''}></label>`).join('')}
        ${extra}
        <button class="btn primary block" type="submit">${ok}</button>
      </form>`, { title: h(title), onClose: () => resolve(result) });
    const form = $('form', m.el);
    setTimeout(() => form.querySelector('input')?.focus(), 350);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      result = Object.fromEntries(new FormData(form));
      m.close();
    });
  });
}

/* ---------- Dates & people ---------- */

export const parseDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z') : null);

export function timeAgo(s) {
  const d = parseDate(s);
  if (!d) return '';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'abhi';
  if (sec < 3600) return `${Math.floor(sec / 60)} min pehle`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ghante pehle`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} din pehle`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const clock = (s) => parseDate(s)?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) || '';
export const dayLabel = (s) => {
  const d = parseDate(s);
  if (!d) return '';
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Aaj';
  if (d.toDateString() === y.toDateString()) return 'Kal';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function avatar(user, cls = '') {
  if (user?.avatar) return `<span class="avatar ${cls}"><img src="${h(media(user.avatar))}" alt=""></span>`;
  return `<span class="avatar ${cls}">${h(initials(user?.name))}</span>`;
}

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
