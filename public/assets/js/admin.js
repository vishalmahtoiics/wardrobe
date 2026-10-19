// Super Admin portal: dashboard, users, images by size, storage, chat moderation, settings.

import { get, post, del, token, media, prefs, setUnauthorizedHandler } from './api.js';
import { h, $, $$, toast, toastError, confirmBox, promptBox, openModal, closeAllModals, avatar, timeAgo, cssUrl, debounce } from './ui.js';
import { formatBytes } from './image.js';
import { ROOMS } from './data.js';

const root = $('#admin');
let me = null;

const NAV = [
  ['dashboard', '📊', 'Dashboard'],
  ['users', '👥', 'Users'],
  ['images', '🖼️', 'Images'],
  ['storage', '💾', 'Storage'],
  ['chat', '💬', 'Chat'],
  ['settings', '⚙️', 'Settings'],
];

async function boot() {
  setUnauthorizedHandler(() => { token.set(null); showLogin(); });
  if (!token.get()) return showLogin();
  try {
    me = (await get('auth/me')).user;
  } catch { return showLogin(); }
  if (!['admin', 'superadmin'].includes(me.role)) return showLogin('Is account ke paas admin access nahi hai.');
  shell();
}

function showLogin(msg = '') {
  root.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="auth-hero"><img class="logo" src="../icons/logo.svg" alt=""><h1 class="serif">Super Admin</h1><p class="muted">Wardrobe control room</p></div>
    <form class="card" id="lf">
      ${msg ? `<p class="toast err" style="animation:none">${h(msg)}</p>` : ''}
      <label class="field"><span>Email</span><input class="input" name="email" type="email" required autocomplete="username"></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn primary block">Login</button>
    </form>
    <p class="center small"><a href="../">← Wardrobe app</a></p></div></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await post('auth/login', Object.fromEntries(new FormData(e.target)));
      if (!['admin', 'superadmin'].includes(res.user.role)) {
        token.set(null);
        return showLogin('Is account ke paas admin access nahi hai.');
      }
      token.set(res.token);
      me = res.user;
      shell();
    } catch (err) { toastError(err); }
  });
}

function shell() {
  root.innerHTML = `<div class="adm">
    <aside class="adm-side">
      <a class="brand serif" href="#dashboard"><img class="logo" src="../icons/logo.svg" alt="">Admin</a>
      ${NAV.map(([k, i, l]) => `<a href="#${k}" data-nav="${k}">${i} ${l}</a>`).join('')}
      <div class="foot">
        <div class="row small">${avatar(me, 'sm')}<span class="grow ellipsis">${h(me.name)}<br><span class="muted">${me.role === 'superadmin' ? 'Super Admin' : 'Admin'}</span></span></div>
        <button class="btn sm" id="themeBtn">🌓 Theme</button>
        <a class="btn sm" href="../" style="justify-content:center">← App</a>
        <button class="btn sm danger" id="out">Logout</button>
      </div>
    </aside>
    <nav class="adm-top">${NAV.map(([k, i, l]) => `<a href="#${k}" data-nav="${k}">${i} ${l}</a>`).join('')}<a href="../">← App</a></nav>
    <main class="adm-main" id="main"></main>
  </div>`;
  $('#out').addEventListener('click', async () => { try { await post('auth/logout'); } catch { /* ignore */ } token.set(null); showLogin(); });
  $('#themeBtn').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'walnut' ? 'teak' : 'walnut';
    document.documentElement.dataset.theme = t;
    prefs.set('adminTheme', t);
  });
  route();
}

window.addEventListener('hashchange', () => me && route());

async function route() {
  await closeAllModals();
  const page = location.hash.slice(1).split('?')[0] || 'dashboard';
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === page));
  const main = $('#main');
  main.innerHTML = '<div class="spinner"></div>';
  ({ dashboard, users, images, storage, chat, settings }[page] || dashboard)(main);
}

/* ---------- Dashboard ---------- */

async function dashboard(main) {
  let s;
  try { s = await get('admin/stats'); } catch (e) { return toastError(e); }
  const maxSignup = Math.max(1, ...Object.values(s.signups));
  const maxStore = Math.max(1, ...s.top_storage.map((u) => u.storage_bytes));
  const totalG = Math.max(1, Object.values(s.genders).reduce((a, b) => a + b, 0));
  const maxCat = Math.max(1, ...Object.values(s.categories));
  main.innerHTML = `
    <h1 class="serif">Dashboard</h1><p class="muted" style="margin:0">Namaste ${h(me.name.split(' ')[0])} — poori app ka haal yahan hai.</p>
    <div class="kpis">
      <div class="kpi"><small>👥 Users</small><b>${s.users}</b><span>+${s.new_this_week} is hafte · ${s.blocked} blocked</span></div>
      <div class="kpi"><small>🟢 Active (24h)</small><b>${s.active_today}</b><span>${((s.active_today / Math.max(1, s.users)) * 100).toFixed(0)}% users</span></div>
      <div class="kpi"><small>👕 Kapde</small><b>${s.items}</b><span>${s.public_items} public</span></div>
      <div class="kpi"><small>🖼️ Images</small><b>${s.images}</b><span>avg ${formatBytes(s.avg_image)}</span></div>
      <div class="kpi"><small>💾 Storage used</small><b>${formatBytes(s.storage_bytes)}</b><span>${s.disk_free ? `${formatBytes(s.disk_free)} disk free` : ''}</span></div>
      <div class="kpi"><small>💬 Messages</small><b>${s.messages}</b><span>${s.messages_today} aaj</span></div>
    </div>
    <div class="panels">
      <div class="panel"><h3>📈 New signups — last 14 days</h3>
        <div class="spark">${Object.entries(s.signups).map(([d, n]) => `<div title="${d}: ${n}" style="height:${(n / maxSignup) * 100}%"></div>`).join('')}</div>
        <div class="spark-labels">${Object.keys(s.signups).map((d, i) => `<span>${i % 2 ? '' : d.slice(8)}</span>`).join('')}</div>
      </div>
      <div class="panel"><h3>💾 Sabse zyada storage</h3>
        ${s.top_storage.filter((u) => u.storage_bytes > 0).map((u) => `<div class="hbar"><a href="#users" data-user="${u.id}" class="ellipsis">${h(u.name)}</a>
          <div class="bar"><i style="width:${(u.storage_bytes / maxStore) * 100}%"></i></div><b>${formatBytes(u.storage_bytes)}</b></div>`).join('') || '<p class="muted">Abhi koi image nahi</p>'}
      </div>
      <div class="panel"><h3>🚻 Girls / Boys</h3>
        ${[['female', '👩 Girls'], ['male', '👨 Boys'], ['other', '🌈 Other']].map(([g, l]) => `<div class="hbar"><span>${l}</span>
          <div class="bar"><i style="width:${((s.genders[g] || 0) / totalG) * 100}%"></i></div><b>${s.genders[g] || 0}</b></div>`).join('')}
      </div>
      <div class="panel"><h3>👗 Top categories</h3>
        ${Object.entries(s.categories).map(([c, n]) => `<div class="hbar"><span class="ellipsis">${h(c)}</span><div class="bar"><i style="width:${(n / maxCat) * 100}%"></i></div><b>${n}</b></div>`).join('') || '<p class="muted">Abhi kuch nahi</p>'}
      </div>
    </div>`;
  main.addEventListener('click', (e) => {
    const u = e.target.closest('[data-user]');
    if (u) { e.preventDefault(); userDetail(u.dataset.user); }
  });
}

/* ---------- Users ---------- */

const uf = { q: '', sort: 'new', role: '', status: '', gender: '', page: 1 };

async function users(main) {
  main.innerHTML = `
    <h1 class="serif">Users</h1>
    <div class="toolbar">
      <input class="input" id="uq" placeholder="🔍 Naam ya email" value="${h(uf.q)}">
      <select class="input" id="usort">${[['new', 'Naye pehle'], ['storage', 'Zyada storage'], ['items', 'Zyada kapde'], ['seen', 'Last active'], ['name', 'Naam A-Z']].map(([v, l]) => `<option value="${v}" ${uf.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" id="ugender"><option value="">Sab gender</option>${[['female', 'Girls'], ['male', 'Boys'], ['other', 'Other']].map(([v, l]) => `<option value="${v}" ${uf.gender === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" id="ustatus"><option value="">Sab status</option><option value="active" ${uf.status === 'active' ? 'selected' : ''}>Active</option><option value="blocked" ${uf.status === 'blocked' ? 'selected' : ''}>Blocked</option></select>
      <select class="input" id="urole"><option value="">Sab roles</option>${['user', 'admin', 'superadmin'].map((r) => `<option ${uf.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    </div>
    <div id="ulist"><div class="spinner"></div></div>`;
  const load = async () => {
    try {
      const d = await get('admin/users', uf);
      const pages = Math.max(1, Math.ceil(d.total / d.per_page));
      $('#ulist').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>User</th><th>Gender</th><th>Kapde</th><th>Images</th><th>Storage</th><th>Quota</th><th>Joined</th><th>Last seen</th><th>Status</th></tr></thead><tbody>
        ${d.users.map((u) => `<tr class="click" data-user="${u.id}">
          <td><div class="row">${avatar(u, 'sm')}<div><b>${h(u.name)}</b> ${u.role !== 'user' ? `<span class="pill ${u.role}">${u.role}</span>` : ''}<br><span class="small muted">${h(u.email)}</span></div></div></td>
          <td>${u.gender === 'female' ? '👩' : u.gender === 'male' ? '👨' : '🌈'}</td>
          <td>${u.item_count}</td><td>${u.image_count}</td>
          <td><b>${formatBytes(u.storage_bytes)}</b><div class="bar" style="height:5px;margin-top:4px;width:90px"><i style="width:${Math.min(100, (u.storage_bytes / (u.quota_mb * 1048576)) * 100)}%"></i></div></td>
          <td>${u.quota_mb} MB${u.quota_custom ? ' ✱' : ''}</td>
          <td class="small">${timeAgo(u.created_at)}</td><td class="small">${u.last_seen_at ? timeAgo(u.last_seen_at) : '—'}</td>
          <td><span class="pill ${u.status}">${u.status}</span></td></tr>`).join('') || '<tr><td colspan="9" class="center muted">Koi user nahi mila</td></tr>'}
        </tbody></table></div>
        <div class="pager"><button class="btn sm" id="prev" ${uf.page <= 1 ? 'disabled' : ''}>←</button><span class="small muted">Page ${uf.page} / ${pages} · ${d.total} users</span><button class="btn sm" id="next" ${uf.page >= pages ? 'disabled' : ''}>→</button></div>`;
      $('#prev').onclick = () => { uf.page--; load(); };
      $('#next').onclick = () => { uf.page++; load(); };
    } catch (e) { toastError(e); }
  };
  $('#uq').addEventListener('input', debounce((e) => { uf.q = e.target.value; uf.page = 1; load(); }, 300));
  for (const [id, key] of [['usort', 'sort'], ['ugender', 'gender'], ['ustatus', 'status'], ['urole', 'role']]) {
    $(`#${id}`).addEventListener('change', (e) => { uf[key] = e.target.value; uf.page = 1; load(); });
  }
  $('#ulist').addEventListener('click', (e) => {
    const r = e.target.closest('[data-user]');
    if (r) userDetail(r.dataset.user, load);
  });
  load();
}

async function userDetail(id, reload = () => {}) {
  let d;
  try { d = await get(`admin/users/${id}`); } catch (e) { return toastError(e); }
  const u = d.user;
  const isSelf = u.id === me.id;
  const isSuper = me.role === 'superadmin';
  const canManage = !isSelf && (u.role === 'user' || isSuper);
  const m = openModal(`
    <div class="profile-head">${avatar(u, 'lg')}<div class="grow"><h2 style="margin:0">${h(u.name)}</h2>
      <div class="muted small">${h(u.email)}</div>
      <div class="row wrap" style="margin-top:6px;gap:6px"><span class="pill ${u.role}">${u.role}</span><span class="pill ${u.status}">${u.status}</span><span class="pill">${u.gender}</span><span class="pill">🔐 ${d.sessions} sessions</span></div></div></div>
    <div class="kpis" style="margin:0 0 14px">
      <div class="kpi"><small>Kapde</small><b>${u.item_count}</b></div>
      <div class="kpi"><small>Images</small><b>${u.image_count}</b></div>
      <div class="kpi"><small>Storage</small><b>${formatBytes(u.storage_bytes)}</b><span>of ${u.quota_mb} MB</span></div>
      <div class="kpi"><small>Messages</small><b>${u.message_count}</b></div>
    </div>
    <p class="small muted">Joined ${timeAgo(u.created_at)} · Last seen ${u.last_seen_at ? timeAgo(u.last_seen_at) : 'never'} · Almirah: ${u.visibility}</p>
    <div class="row wrap" style="margin-bottom:14px">${d.locations.map((l) => `<span class="badge">${h(l.emoji)} ${h(l.name)} · ${l.count}</span>`).join('')}</div>
    ${canManage ? `<div class="actions" style="margin-bottom:16px">
      <button class="btn" data-a="status">${u.status === 'active' ? '🚫 Block' : '✅ Unblock'}</button>
      <button class="btn" data-a="quota">💾 Quota set karo</button>
      ${isSuper ? `<button class="btn" data-a="role">🛡️ Role badlo</button><button class="btn" data-a="password">🔑 Password reset</button>` : ''}
      <button class="btn" data-a="images">🖼️ Images dekho</button>
      <button class="btn danger" data-a="delete">🗑️ User delete</button>
    </div>` : `<p class="small muted">${isSelf ? 'Ye aapka apna account hai.' : 'Sirf Super Admin is admin ko manage kar sakta hai.'}</p>`}
    <h3 style="margin:0 0 10px">Recent kapde</h3>
    <div class="img-grid">${d.items.map((i) => `<div class="img-card"><div class="ph" style="${cssUrl(i.images[0]?.thumb)}">${i.images[0] ? `<span class="sz">${formatBytes(i.images.reduce((a, x) => a + x.size, 0))}</span>` : ''}</div>
      <div class="m"><b class="ellipsis" style="display:block">${h(i.title)}</b><span class="muted">${h(i.category)} · ${i.images.length} photo</span></div></div>`).join('') || '<p class="muted">Koi kapda nahi</p>'}</div>`,
  { title: 'User details', wide: true });
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    try {
      if (a === 'status') {
        const blocking = u.status === 'active';
        if (!(await confirmBox(`${h(u.name)} ko ${blocking ? 'block' : 'unblock'} karein?${blocking ? ' Wo turant logout ho jayenge.' : ''}`, { ok: blocking ? 'Block' : 'Unblock', danger: blocking }))) return;
        await post(`admin/users/${u.id}`, { status: blocking ? 'blocked' : 'active' });
      }
      if (a === 'quota') {
        const v = await promptBox('Storage quota (MB)', [{ name: 'quota_mb', label: 'Khaali chhodo = default quota', type: 'number', value: u.quota_custom ?? '' }]);
        if (!v) return;
        await post(`admin/users/${u.id}`, v);
      }
      if (a === 'role') {
        const v = await promptBox('Role', [{ name: 'role', label: 'user / admin / superadmin', value: u.role, required: true }]);
        if (!v) return;
        await post(`admin/users/${u.id}`, { role: v.role.trim().toLowerCase() });
      }
      if (a === 'password') {
        const v = await promptBox('Naya password', [{ name: 'password', label: 'Min 6 characters', type: 'text', required: true, minlength: 6 }]);
        if (!v) return;
        await post(`admin/users/${u.id}`, v);
      }
      if (a === 'images') { await m.close(); imgFilter.user = u.id; imgFilter.page = 1; location.hash = '#images'; return; }
      if (a === 'delete') {
        if (!(await confirmBox(`${h(u.name)} aur unke saare kapde, photos, messages hamesha ke liye delete karein?`, { ok: 'Delete', danger: true, icon: '⚠️' }))) return;
        await del(`admin/users/${u.id}`);
        toast('User delete ho gaya');
        await m.close();
        reload();
        return;
      }
      toast('Update ho gaya ✅');
      await m.close();
      reload();
      userDetail(u.id, reload);
    } catch (err) { toastError(err); }
  });
}

/* ---------- Images ---------- */

const imgFilter = { sort: 'size', user: '', page: 1 };

async function images(main) {
  main.innerHTML = `<h1 class="serif">Images</h1><p class="muted" style="margin:0">Kaun si image kitni badi hai — sabse badi pehle.</p>
    <div class="toolbar">
      <div class="seg" style="width:260px"><button data-s="size" class="${imgFilter.sort === 'size' ? 'on' : ''}">📏 Size se</button><button data-s="new" class="${imgFilter.sort === 'new' ? 'on' : ''}">🕒 Nayi pehle</button></div>
      ${imgFilter.user ? `<span class="chip on">User #${h(imgFilter.user)} <button class="btn ghost sm" id="clearU">✕</button></span>` : ''}
    </div><div id="ilist"><div class="spinner"></div></div>`;
  $$('[data-s]', main).forEach((b) => b.addEventListener('click', () => { imgFilter.sort = b.dataset.s; imgFilter.page = 1; images(main); }));
  $('#clearU', main)?.addEventListener('click', () => { imgFilter.user = ''; imgFilter.page = 1; images(main); });
  try {
    const d = await get('admin/images', imgFilter);
    const pages = Math.max(1, Math.ceil(d.total / d.per_page));
    $('#ilist').innerHTML = `<p class="small muted">${d.total} images</p><div class="img-grid">${d.images.map((i) => `
      <div class="img-card"><a class="ph" href="${h(media(i.url))}" target="_blank" rel="noopener" style="display:block;${cssUrl(i.thumb)}"><span class="sz ${i.size > 1048576 ? 'big' : ''}">${formatBytes(i.size)}</span></a>
        <div class="m"><b class="ellipsis" style="display:block">${h(i.item_title || '—')}</b>
        <span class="muted">${i.width}×${i.height} · orig ${formatBytes(i.original_bytes)} · thumb ${formatBytes(i.thumb_bytes)}</span><br>
        <span class="ellipsis" style="display:block">👤 ${h(i.user.name)}</span>
        <button class="btn sm danger" data-del="${i.id}" style="margin-top:6px;width:100%">🗑️ Delete</button></div></div>`).join('') || '<p class="muted">Koi image nahi</p>'}</div>
      <div class="pager"><button class="btn sm" id="prev" ${imgFilter.page <= 1 ? 'disabled' : ''}>←</button><span class="small muted">Page ${imgFilter.page} / ${pages}</span><button class="btn sm" id="next" ${imgFilter.page >= pages ? 'disabled' : ''}>→</button></div>`;
    $('#prev').onclick = () => { imgFilter.page--; images(main); };
    $('#next').onclick = () => { imgFilter.page++; images(main); };
    $('#ilist').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (!(await confirmBox('Ye image delete karein? User ke kapde se photo hat jayegi.', { ok: 'Delete', danger: true }))) return;
      try { await del(`admin/images/${b.dataset.del}`); b.closest('.img-card').remove(); toast('Image delete ho gayi'); } catch (err) { toastError(err); }
    });
  } catch (e) { toastError(e); }
}

/* ---------- Storage ---------- */

async function storage(main) {
  if (me.role !== 'superadmin') { main.innerHTML = '<div class="empty"><b>🔒</b>Sirf Super Admin storage scan kar sakta hai.</div>'; return; }
  try {
    const [s, scan] = await Promise.all([get('admin/stats'), get('admin/storage')]);
    main.innerHTML = `<h1 class="serif">Storage</h1>
      <div class="kpis">
        <div class="kpi"><small>Database me images</small><b>${formatBytes(s.storage_bytes)}</b><span>${s.images} images</span></div>
        <div class="kpi"><small>Disk par uploads folder</small><b>${formatBytes(scan.disk_bytes)}</b><span>avatars bhi shamil</span></div>
        <div class="kpi"><small>Orphan files</small><b>${scan.orphan_count}</b><span>${formatBytes(scan.orphan_bytes)} bekaar jagah</span></div>
        <div class="kpi"><small>Server disk free</small><b>${s.disk_free ? formatBytes(s.disk_free) : '—'}</b></div>
      </div>
      <div class="panel"><h3>🧹 Cleanup</h3>
        <p class="muted small">Orphan files wo hain jo disk par hain par kisi kapde/user se jude nahi (jaise adhure uploads).</p>
        ${scan.orphan_count ? `<button class="btn primary" id="clean">🧹 ${scan.orphan_count} orphan files delete karo (${formatBytes(scan.orphan_bytes)})</button>
          <ul class="small muted">${scan.orphans.slice(0, 20).map((o) => `<li>${h(o.path)} — ${formatBytes(o.size)}</li>`).join('')}</ul>` : '<p>✅ Sab saaf hai!</p>'}
      </div>`;
    $('#clean', main)?.addEventListener('click', async () => {
      if (!(await confirmBox('Orphan files delete karein?', { ok: 'Delete', danger: true }))) return;
      try { const r = await get('admin/storage', { clean: 1 }); toast(`${r.removed} files delete ho gayi`); storage(main); } catch (e) { toastError(e); }
    });
  } catch (e) { toastError(e); }
}

/* ---------- Chat moderation ---------- */

async function chat(main) {
  const f = { room: '', q: '', page: 1 };
  main.innerHTML = `<h1 class="serif">Chat moderation</h1>
    <div class="toolbar"><input class="input" id="cq" placeholder="🔍 Message search">
      <select class="input" id="croom"><option value="">Sab rooms</option>${Object.entries(ROOMS).map(([k, r]) => `<option value="${k}">${r.icon} ${r.label}</option>`).join('')}</select></div>
    <div id="clist"></div>`;
  const load = async () => {
    try {
      const { messages } = await get('admin/chat', f);
      $('#clist').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Room</th><th>Message</th><th>When</th><th></th></tr></thead><tbody>
        ${messages.map((m) => `<tr><td><div class="row">${avatar(m.user, 'sm')}<b>${h(m.user.name)}</b></div></td><td>${ROOMS[m.room]?.icon || ''} ${h(m.room)}</td>
          <td style="max-width:420px">${m.deleted ? '<span class="pill blocked">deleted</span> ' : ''}${h(m.body)}${m.item ? ` <span class="pill">👗 ${h(m.item.title)}</span>` : ''}</td>
          <td class="small">${timeAgo(m.created_at)}</td>
          <td><div class="row">${m.deleted ? '' : `<button class="btn sm" data-hide="${m.id}">🙈 Hide</button>`}<button class="btn sm danger" data-del="${m.id}">🗑️</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="center muted">Koi message nahi</td></tr>'}
        </tbody></table></div>
        <div class="pager"><button class="btn sm" id="prev" ${f.page <= 1 ? 'disabled' : ''}>←</button><span class="small muted">Page ${f.page}</span><button class="btn sm" id="next" ${messages.length < 50 ? 'disabled' : ''}>→</button></div>`;
      $('#prev').onclick = () => { f.page--; load(); };
      $('#next').onclick = () => { f.page++; load(); };
    } catch (e) { toastError(e); }
  };
  $('#cq').addEventListener('input', debounce((e) => { f.q = e.target.value; f.page = 1; load(); }, 300));
  $('#croom').addEventListener('change', (e) => { f.room = e.target.value; f.page = 1; load(); });
  $('#clist').addEventListener('click', async (e) => {
    const hide = e.target.closest('[data-hide]');
    const d = e.target.closest('[data-del]');
    try {
      if (hide) { await del(`admin/chat/${hide.dataset.hide}`); load(); }
      if (d && await confirmBox('Message hamesha ke liye delete karein?', { ok: 'Delete', danger: true })) { await del(`admin/chat/${d.dataset.del}`, { hard: 1 }); load(); }
    } catch (err) { toastError(err); }
  });
  load();
}

/* ---------- Settings ---------- */

async function settings(main) {
  let s;
  try { s = (await get('admin/settings')).settings; } catch (e) { return toastError(e); }
  const ro = me.role !== 'superadmin';
  main.innerHTML = `<h1 class="serif">Settings</h1>${ro ? '<p class="muted">Sirf Super Admin settings badal sakta hai.</p>' : ''}
    <form class="panel" id="sf" style="max-width:620px;margin-top:16px">
      <label class="field"><span>App name</span><input class="input" name="app_name" value="${h(s.app_name)}" ${ro ? 'disabled' : ''}></label>
      <label class="field"><span>Welcome note (login screen)</span><input class="input" name="welcome_note" value="${h(s.welcome_note)}" ${ro ? 'disabled' : ''}></label>
      <div class="two">
        <label class="field"><span>Default storage quota per user (MB)</span><input class="input" type="number" min="1" name="default_quota_mb" value="${h(s.default_quota_mb)}" ${ro ? 'disabled' : ''}></label>
        <label class="field"><span>Max image upload (MB)</span><input class="input" type="number" min="1" name="max_upload_mb" value="${h(s.max_upload_mb)}" ${ro ? 'disabled' : ''}></label>
      </div>
      <label class="field"><span>Max photos per kapda</span><input class="input" type="number" min="1" max="12" name="max_images_item" value="${h(s.max_images_item)}" ${ro ? 'disabled' : ''}></label>
      <label class="toggle-row"><span class="grow">📝 Naye users register kar sakte hain</span><span class="switch"><input type="checkbox" name="allow_register" ${s.allow_register === '1' ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i></span></label>
      <label class="toggle-row"><span class="grow">💬 Community chat on</span><span class="switch"><input type="checkbox" name="chat_enabled" ${s.chat_enabled === '1' ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i></span></label>
      ${ro ? '' : '<button class="btn primary">💾 Save settings</button>'}
    </form>`;
  $('#sf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.allow_register = fd.has('allow_register') ? 1 : 0;
    data.chat_enabled = fd.has('chat_enabled') ? 1 : 0;
    try { await post('admin/settings', data); toast('Settings save ho gayi ✅'); } catch (err) { toastError(err); }
  });
}

boot();
