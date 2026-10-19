// Copies the website UI into www/ for the Android app and bakes in the server URL.
// Usage: WARDROBE_API_URL=https://wardrobe.example.com node scripts/prepare-www.js
const fs = require('fs');
const path = require('path');

const pub = path.resolve(__dirname, '../../public');
const www = path.resolve(__dirname, '../www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const entry of ['index.html', 'manifest.webmanifest', 'icons', 'assets']) {
  fs.cpSync(path.join(pub, entry), path.join(www, entry), { recursive: true });
}

const api = (process.env.WARDROBE_API_URL || '').trim().replace(/\/+$/, '');
fs.writeFileSync(
  path.join(www, 'assets/js/config.js'),
  `// Generated for the Android app.\nwindow.WARDROBE_CONFIG = { apiBase: ${JSON.stringify(api)} };\n`
);
console.log(`www/ ready (server: ${api || 'asked on first launch'})`);
