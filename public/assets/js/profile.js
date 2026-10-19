// Profile & settings: theme, privacy, places, sound, password, server, logout.

import { get, post, del, prefs, token, isNativeApp, serverUrl, setServerUrl } from './api.js';
import { state, isAdmin, refreshLocations, recount } from './state.js';
import { THEMES, LOCATION_EMOJIS } from './data.js';
import { h, $, $$, avatar, toast, toastError, confirmBox, promptBox } from './ui.js';
import { addLocationFlow, changed } from './item.js';
import { compressImage, formatBytes } from './image.js';
import { sound, sfx } from './sound.js';
import { setFastFolding } from './fold.js';

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  prefs.set('theme', t);
  const c = getComputedStyle(document.documentElement).getPropertyValue('--wood-2').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', c || '#a0673b');
}

export async function renderProfile(view, { logout }) {
  const me = state.me;
  let stats = null;
  try { stats = await get('stats'); } catch { /* shown as unknown */ }
  const used = stats?.storage.used || 0;
  const quota = (stats?.storage.quota_mb || me.quota_mb) * 1024 * 1024;
  const pct = Math.min(100, (used / quota) * 100);

  view.innerHTML = `
    <div class="profile-head">
      <label style="cursor:pointer;position:relative">${avatar(me, 'lg')}
        <span style="position:absolute;right:-2px;bottom:-2px;background:var(--surface);border-radius:50%;padding:3px 5px;font-size:13px;box-shadow:var(--shadow)">📷</span>
        <input type="file" accept="image/*" hidden id="avatarPick"></label>
      <div class="grow">
        <h1 class="title serif" style="margin:0">${h(me.name)}</h1>
        <div class="muted small ellipsis">${h(me.email)}</div>
        ${me.role !== 'user' ? `<span class="badge" style="margin-top:4px">🛡️ ${me.role === 'superadmin' ? 'Super Admin' : 'Admin'}</span>` : ''}
      </div>
      <button class="icon-btn" id="editName" aria-label="Edit">✏️</button>
    </div>

    <div class="card">
      <div class="row"><b class="grow">💾 Storage</b><span class="small muted">${formatBytes(used)} / ${formatBytes(quota)}</span></div>
      <div class="bar" style="margin:10px 0 8px"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="row small muted"><span class="grow">👕 ${stats?.items ?? '–'} kapde · 🖼️ ${stats?.images ?? '–'} photos</span><span>${state.locations.length} jagah</span></div>
    </div>

    <h2 class="section">🎨 Theme</h2>
    <div class="theme-grid">${THEMES.map((t) => `
      <button class="theme-sw ${document.documentElement.dataset.theme === t.id ? 'on' : ''}" data-theme-id="${t.id}">
        <div class="mini">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>${t.name}</button>`).join('')}
    </div>

    <h2 class="section">👀 Meri almirah kaun dekh sakta hai?</h2>
    <div class="seg" id="vis">
      <button data-vis="private" class="${me.visibility === 'private' ? 'on' : ''}">🔒 Sirf main</button>
      <button data-vis="selected" class="${me.visibility === 'selected' ? 'on' : ''}">✅ Chune hue</button>
      <button data-vis="public" class="${me.visibility === 'public' ? 'on' : ''}">🌍 Sab</button>
    </div>
    <p class="small muted" style="margin:6px 2px 0">${me.visibility === 'selected' ? 'Sirf wahi kapde dikhenge jin par "Community me dikhao" on hai.' : me.visibility === 'public' ? 'Community me sab aapke kapde dekh sakte hain (location kabhi nahi dikhti).' : 'Koi aur aapke kapde nahi dekh sakta.'}</p>

    <h2 class="section">📍 Meri jagah (Almirahs)</h2>
    <div class="menu" id="locs">
      ${state.locations.map((l) => `<div class="loc-row"><span style="font-size:22px">${h(l.emoji)}</span><span class="grow"><b>${h(l.name)}</b><br><span class="small muted">${l.count} kapde</span></span>
        <button class="btn ghost sm" data-editloc="${l.id}">✏️</button><button class="btn ghost sm" data-delloc="${l.id}">🗑️</button></div>`).join('')}
      <button id="addLoc"><span class="ic">➕</span> Nayi jagah add karo</button>
    </div>

    <h2 class="section">⚙️ Settings</h2>
    <div class="field"><span>Main hoon</span><div class="seg" id="gender">
      ${[['female', '👩 Girl'], ['male', '👨 Boy'], ['other', '🌈 Other']].map(([g, l]) => `<button data-g="${g}" class="${me.gender === g ? 'on' : ''}">${l}</button>`).join('')}
    </div></div>
    <label class="toggle-row"><span class="grow">🔊 Sound effects<small>Almirah door, fold, chat sounds</small></span><span class="switch"><input type="checkbox" id="snd" ${sound.enabled ? 'checked' : ''}><i></i></span></label>
    <label class="toggle-row"><span class="grow">⚡ Fast animation<small>Folding thoda jaldi hoga</small></span><span class="switch"><input type="checkbox" id="fast" ${prefs.get('fast', false) ? 'checked' : ''}><i></i></span></label>

    <div class="menu" style="margin-top:14px">
      ${isAdmin() ? `<a href="${h((serverUrl() || '.') + '/admin/')}" target="_blank" rel="noopener"><span class="ic">🛡️</span> Super Admin portal</a>` : ''}
      <button id="pw"><span class="ic">🔑</span> Password badlo</button>
      ${isNativeApp() ? `<button id="server"><span class="ic">🌐</span> Server: <span class="muted small ellipsis">${h(serverUrl())}</span></button>` : ''}
      <button id="logout"><span class="ic">🚪</span> Logout</button>
      <button id="delacc" style="color:#d43a3a"><span class="ic">⚠️</span> Account delete karo</button>
    </div>
    <p class="center small muted" style="margin-top:20px">Wardrobe · made with ❤️</p>`;

  const saveProfile = async (data) => {
    try {
      state.me = (await post('profile', data)).user;
      return true;
    } catch (e) { toastError(e); return false; }
  };
  const rerender = () => renderProfile(view, { logout });

  $('#avatarPick', view).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', await compressImage(file, { max: 512 }));
    try {
      state.me.avatar = (await post('profile/avatar', fd)).avatar;
      toast('Photo badal di 😎'); rerender(); changed();
    } catch (err) { toastError(err); }
  });
  $('#editName', view).addEventListener('click', async () => {
    const v = await promptBox('Profile', [
      { name: 'name', label: 'Naam', value: me.name, required: true },
      { name: 'bio', label: 'Bio (community me dikhega)', value: me.bio || '', placeholder: 'Saree lover 🥻' },
    ]);
    if (v && await saveProfile(v)) { toast('Save ho gaya'); rerender(); changed(); }
  });
  $$('[data-theme-id]', view).forEach((b) => b.addEventListener('click', () => {
    applyTheme(b.dataset.themeId);
    sfx.pop();
    $$('[data-theme-id]', view).forEach((x) => x.classList.toggle('on', x === b));
    post('profile', { theme: b.dataset.themeId }).catch(() => {});
  }));
  $$('[data-vis]', view).forEach((b) => b.addEventListener('click', async () => {
    if (await saveProfile({ visibility: b.dataset.vis })) { sfx.tap(); rerender(); }
  }));
  $$('[data-g]', view).forEach((b) => b.addEventListener('click', async () => {
    if (await saveProfile({ gender: b.dataset.g })) { sfx.tap(); rerender(); }
  }));
  $('#snd', view).addEventListener('change', (e) => { sound.enabled = e.target.checked; prefs.set('sound', sound.enabled); sfx.pop(); changed(); });
  $('#fast', view).addEventListener('change', (e) => { prefs.set('fast', e.target.checked); setFastFolding(e.target.checked); });
  $('#addLoc', view).addEventListener('click', async () => { if (await addLocationFlow()) { rerender(); changed(); } });
  $$('[data-editloc]', view).forEach((b) => b.addEventListener('click', async () => {
    const l = state.locations.find((x) => x.id === Number(b.dataset.editloc));
    const v = await promptBox('Jagah edit karo', [
      { name: 'name', label: 'Naam', value: l.name, required: true },
      { name: 'emoji', label: `Emoji (${LOCATION_EMOJIS.join(' ')})`, value: l.emoji },
    ]);
    if (!v) return;
    try { await post(`locations/${l.id}`, v); await refreshLocations(); recount(); rerender(); changed(); } catch (e) { toastError(e); }
  }));
  $$('[data-delloc]', view).forEach((b) => b.addEventListener('click', async () => {
    const l = state.locations.find((x) => x.id === Number(b.dataset.delloc));
    if (!(await confirmBox(`"${h(l.name)}" hata dein? Iske ${l.count} kapde "Bina jagah" me chale jayenge (delete nahi honge).`, { ok: 'Hatao', danger: true }))) return;
    try {
      await del(`locations/${l.id}`);
      state.items.forEach((i) => { if (i.location_id === l.id) i.location_id = null; });
      await refreshLocations(); recount(); rerender(); changed();
    } catch (e) { toastError(e); }
  }));
  $('#pw', view).addEventListener('click', async () => {
    const v = await promptBox('Password badlo', [
      { name: 'current', label: 'Purana password', type: 'password', required: true },
      { name: 'password', label: 'Naya password (min 6)', type: 'password', required: true, minlength: 6 },
    ]);
    if (!v) return;
    try { await post('profile/password', v); toast('Password badal gaya 🔑'); } catch (e) { toastError(e); }
  });
  $('#server', view)?.addEventListener('click', async () => {
    const v = await promptBox('Server address', [{ name: 'url', label: 'Website URL jahan Wardrobe install hai', value: serverUrl(), placeholder: 'https://wardrobe.example.com' }]);
    if (!v?.url) return;
    setServerUrl(v.url);
    token.set(null);
    location.reload();
  });
  $('#logout', view).addEventListener('click', async () => {
    if (await confirmBox('Logout karna hai?', { ok: 'Logout', icon: '👋' })) logout();
  });
  $('#delacc', view).addEventListener('click', async () => {
    const v = await promptBox('⚠️ Account delete', [{ name: 'password', label: 'Confirm karne ke liye password likho', type: 'password', required: true }], { ok: 'Hamesha ke liye delete karo' });
    if (!v) return;
    try { await post('profile/delete', v); token.set(null); location.reload(); } catch (e) { toastError(e); }
  });
}

