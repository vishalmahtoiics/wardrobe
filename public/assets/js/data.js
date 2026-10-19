// Static lists used across the app.

export const CATEGORIES = {
  common: ['T-Shirt', 'Shirt', 'Jeans', 'Trousers', 'Shorts', 'Jacket', 'Hoodie', 'Sweater', 'Track Suit',
    'Nightwear', 'Innerwear', 'Shoes', 'Sneakers', 'Sandals', 'Watch', 'Bag', 'Sunglasses', 'Accessories', 'Other'],
  female: ['Kurti', 'Saree', 'Lehenga', 'Salwar Suit', 'Dress', 'Gown', 'Top', 'Skirt', 'Dupatta', 'Leggings',
    'Palazzo', 'Blouse', 'Jewellery', 'Heels', 'Clutch'],
  male: ['Kurta', 'Sherwani', 'Blazer', 'Suit', 'Polo', 'Cargo', 'Waistcoat', 'Formal Shoes', 'Tie', 'Belt'],
};

export function categoriesFor(gender) {
  if (gender === 'female') return [...CATEGORIES.female, ...CATEGORIES.common];
  if (gender === 'male') return [...CATEGORIES.male, ...CATEGORIES.common];
  return [...CATEGORIES.common.slice(0, -1), ...CATEGORIES.female, ...CATEGORIES.male, 'Other'];
}

// Categories that live on the hanger rod by default.
export const HANG_CATEGORIES = new Set(['Shirt', 'Jacket', 'Blazer', 'Suit', 'Sherwani', 'Kurta', 'Kurti', 'Saree',
  'Lehenga', 'Dress', 'Gown', 'Salwar Suit', 'Waistcoat', 'Blouse']);

export const CATEGORY_ICON = {
  'T-Shirt': '👕', Shirt: '👔', Jeans: '👖', Trousers: '👖', Shorts: '🩳', Jacket: '🧥', Hoodie: '🧥', Sweater: '🧶',
  'Track Suit': '🏃', Nightwear: '🌙', Innerwear: '🩲', Shoes: '👞', Sneakers: '👟', Sandals: '🩴', Watch: '⌚',
  Bag: '👜', Sunglasses: '🕶️', Accessories: '💍', Other: '🧺', Kurti: '👚', Saree: '🥻', Lehenga: '👗',
  'Salwar Suit': '👘', Dress: '👗', Gown: '👗', Top: '👚', Skirt: '👗', Dupatta: '🧣', Leggings: '🩱', Palazzo: '👖',
  Blouse: '👚', Jewellery: '💎', Heels: '👠', Clutch: '👛', Kurta: '👘', Sherwani: '🤵', Blazer: '🧥', Suit: '🤵',
  Polo: '👕', Cargo: '👖', Waistcoat: '🦺', 'Formal Shoes': '👞', Tie: '👔', Belt: '🪢',
};

export const OCCASIONS = [
  { tag: 'office', label: 'Office', icon: '💼' },
  { tag: 'party', label: 'Party', icon: '🎉' },
  { tag: 'wedding', label: 'Shaadi', icon: '💍' },
  { tag: 'festive', label: 'Festive', icon: '🪔' },
  { tag: 'casual', label: 'Casual', icon: '😎' },
  { tag: 'date', label: 'Date', icon: '❤️' },
  { tag: 'college', label: 'College', icon: '🎓' },
  { tag: 'travel', label: 'Travel', icon: '✈️' },
  { tag: 'gym', label: 'Gym', icon: '🏋️' },
  { tag: 'puja', label: 'Puja', icon: '🙏' },
  { tag: 'beach', label: 'Beach', icon: '🏖️' },
  { tag: 'winter', label: 'Winter', icon: '❄️' },
];

export const STATUSES = {
  in: { label: 'Almirah me', icon: '🚪' },
  laundry: { label: 'Dhulai me', icon: '🫧' },
  lent: { label: 'Kisi ko diya', icon: '🤝' },
  packed: { label: 'Bag me packed', icon: '🧳' },
  tailor: { label: 'Tailor ke paas', icon: '🧵' },
};

export const COLORS = {
  Black: '#1d1d1f', White: '#f7f7f5', Grey: '#9a9a9e', Navy: '#1f2f5c', Blue: '#2f6fd6', 'Sky Blue': '#8cc8f0',
  Green: '#2e8b57', Olive: '#7a7a3a', Yellow: '#f2c230', Orange: '#f07d2a', Red: '#d43a3a', Maroon: '#7a1f2b',
  Pink: '#f28fb0', Purple: '#7d4bb5', Beige: '#e5d3b3', Brown: '#7b4f2c', Gold: '#d4a73a', Silver: '#c4c8cc',
  Multi: 'linear-gradient(135deg,#f25,#fb3,#3c6,#39f)',
};

export const SEASONS = ['All season', 'Summer', 'Winter', 'Monsoon'];

export const THEMES = [
  { id: 'teak', name: 'Teak Wood', sw: ['#f7efe4', '#a0673b', '#c8894f'] },
  { id: 'walnut', name: 'Dark Walnut', sw: ['#1d1510', '#5b3a24', '#e0a96d'] },
  { id: 'rose', name: 'Rose Pink', sw: ['#fff1f4', '#c97a8d', '#e84a7f'] },
  { id: 'ocean', name: 'Ocean Blue', sw: ['#eef5fb', '#5d84a8', '#2f7fd6'] },
  { id: 'mint', name: 'Fresh Mint', sw: ['#eefaf4', '#6e9e86', '#1fa774'] },
  { id: 'royal', name: 'Royal Purple', sw: ['#f4f0fb', '#5b3f8c', '#d4a73a'] },
  { id: 'midnight', name: 'Midnight', sw: ['#0d0f14', '#2a2f3a', '#7c9cff'] },
  { id: 'sunset', name: 'Sunset', sw: ['#fff4ea', '#c4643a', '#ff7a45'] },
];

export const ROOMS = {
  general: { label: 'Sab Log', icon: '🌍' },
  girls: { label: 'Girls Corner', icon: '💃' },
  boys: { label: 'Boys Corner', icon: '🕺' },
  style: { label: 'Style Help', icon: '✨' },
};

export const LOCATION_EMOJIS = ['🏠', '🏢', '🏡', '🏫', '🏨', '🧳', '🚗', '💼', '🏬', '👵', '🛏️', '📦'];
