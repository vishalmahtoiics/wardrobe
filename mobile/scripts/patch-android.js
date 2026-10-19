// Adds camera permission (for "Camera" photo button) and allows http servers for local testing.
const fs = require('fs');
const path = require('path');

const manifest = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
let xml = fs.readFileSync(manifest, 'utf8');
const perms = ['android.permission.CAMERA', 'android.permission.INTERNET'];
for (const p of perms) {
  if (!xml.includes(`"${p}"`)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
if (!xml.includes('usesCleartextTraffic')) {
  xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
}
fs.writeFileSync(manifest, xml);
console.log('AndroidManifest.xml patched');
