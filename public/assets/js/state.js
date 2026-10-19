// Shared app state: the logged-in user, their places (almirahs) and clothes.

import { get, prefs } from './api.js';
import { COLORS, STATUSES } from './data.js';

export const state = {
  me: null,
  meta: {},
  storage: null,
  locations: [],
  items: [],
  currentLoc: prefs.get('loc', null),
  doorsOpen: false,
  homeMode: prefs.get('homeMode', 'almirah'),
};

export async function loadWardrobe() {
  const [l, i] = await Promise.all([get('locations'), get('items')]);
  state.locations = l.locations;
  state.items = i.items;
}

export async function refreshLocations() {
  state.locations = (await get('locations')).locations;
}

export const itemById = (id) => state.items.find((i) => i.id === Number(id));
export const locationById = (id) => state.locations.find((l) => l.id === Number(id));

export function upsertItem(item) {
  const i = state.items.findIndex((x) => x.id === item.id);
  if (i >= 0) state.items[i] = item;
  else state.items.unshift(item);
  recount();
}

export function removeItem(id) {
  state.items = state.items.filter((i) => i.id !== Number(id));
  recount();
}

export function recount() {
  for (const l of state.locations) l.count = state.items.filter((i) => i.location_id === l.id).length;
}

export const isAdmin = () => ['admin', 'superadmin'].includes(state.me?.role);

export function fabricOf(item) {
  const c = COLORS[item?.color];
  return c && c.startsWith('#') ? c : null;
}

export const locLabel = (item) => {
  const l = locationById(item.location_id);
  return l ? `${l.emoji} ${l.name}` : '📦 Bina jagah';
};

export const statusOf = (item) => STATUSES[item.status] || STATUSES.in;

const SYNONYMS = {
  shaadi: ['wedding'], wedding: ['shaadi'], daftar: ['office'], office: ['daftar', 'formal'], formal: ['office'],
  tyohar: ['festive'], festival: ['festive'], diwali: ['festive'], sardi: ['winter'], garmi: ['summer'],
  ladkiyon: ['female'], kapde: [], dhulai: ['laundry'], gym: ['sports'], party: ['partywear'],
};

/** Every word must match somewhere in the item (title, tags, place, category, colour...). */
export function matches(item, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    item.title, item.category, item.description, item.color, item.brand, item.season,
    item.tags.join(' '), locLabel(item), statusOf(item).label, item.status,
  ].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w) || (SYNONYMS[w] || []).some((s) => hay.includes(s)));
}
