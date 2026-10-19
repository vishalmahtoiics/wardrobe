// Thin client for the PHP API. Works on the website (same origin) and inside the Android app (remote server).

const cfg = window.WARDROBE_CONFIG || {};
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } },
};

export const isNativeApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export function serverUrl() {
  return (LS.get('wardrobe.server') || cfg.apiBase || '').replace(/\/+$/, '');
}
export function setServerUrl(url) {
  url = (url || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  LS.set('wardrobe.server', url || null);
  return url;
}
export const needsServer = () => isNativeApp() && !serverUrl();

const base = () => serverUrl() || '.';
export const media = (path) => (!path ? '' : /^(https?:|data:|blob:)/.test(path) ? path : `${base()}/${path}`);

export const token = {
  get: () => LS.get('wardrobe.token'),
  set: (t) => LS.set('wardrobe.token', t),
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(method, route, body, { query } = {}) {
  let url = `${base()}/api.php?r=${route}`;
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    }
  }
  const headers = {};
  const t = token.get();
  if (t) headers['X-Auth-Token'] = t;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch {
    throw new ApiError(navigator.onLine === false ? 'Internet nahi hai 📵' : 'Server se connect nahi ho paya', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    if (res.status === 401 && route !== 'auth/login') onUnauthorized();
    throw new ApiError((data && data.error) || `Server error (${res.status})`, res.status);
  }
  return data;
}

export const get = (route, query) => api('GET', route, undefined, { query });
export const post = (route, body) => api('POST', route, body ?? {});
export const del = (route, query) => api('DELETE', route, undefined, { query });

export const prefs = {
  get(k, d) { const v = LS.get('wardrobe.' + k); return v == null ? d : JSON.parse(v); },
  set(k, v) { LS.set('wardrobe.' + k, JSON.stringify(v)); },
};
