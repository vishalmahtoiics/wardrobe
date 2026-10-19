# 🚪 Wardrobe — Meri Almirah

Apne saare kapde ek jagah — ghar, flat, hostel, kahin bhi. Website + Android app + Super Admin portal.

## Features

**App (website + Android APK)**
- 🚪 **Real almirah UI** — har jagah (Ghar, Flat, Hostel…) ki apni almirah, lakdi ke doors jo *creak* sound ke saath khulte hain, andar light jalti hai, hanger rod + shelves.
- 👕 **Fold animation** — kapde pe tap karo to wo shelf se uthke **khul (unfold)** jata hai; photo pe dobara tap karo to wo **simat ke, sleeves andar, neeche se upar fold** hoke almirah me apni jagah pe jaake baith jata hai — cloth swish + thud sound ke saath. Naya kapda add karne pe bhi wo fold hoke almirah me jata hai.
- ➕ Kapda add karo: photos (gallery/camera, auto-compress), title, category (Girls / Boys / common), hanger ya tah, **location**, **occasion tags** (Office, Party, Shaadi, Festive, Casual…), apne custom tags, rang, season, brand, description, status (Almirah me / Dhulai me / Kisi ko diya / Packed / Tailor).
- 🔍 **Search** — "party", "red saree", "office Flat" — har word title/tags/category/rang/jagah me match hota hai; results **jagah ke hisaab se group** hote hain taaki turant pata chale kya kahan hai. Occasion chips, location/category/status/favourite filters.
- ✅ "Aaj pehna" counter, ❤️ favourites.
- 🎨 **8 themes** — Teak Wood, Dark Walnut, Rose Pink, Ocean Blue, Fresh Mint, Royal Purple, Midnight, Sunset.
- 💬 **Community** — rooms (Sab Log, Girls Corner, Boys Corner, Style Help), apna kapda chat me share karo, Explore feed, public almirahs.
- 🔒 Privacy: almirah **Private / Selected items / Public** (location kabhi doosron ko nahi dikhti).
- 🔊 Sab sounds Web Audio se bante hain (koi audio file nahi), on/off toggle. Fast-animation option.

**Super Admin portal** (`/admin/`)
- Dashboard: users, active today, kapde, images, total storage, signups graph, girls/boys, top categories, top storage users.
- Users: search/filter/sort by storage, har user ka storage, images, quota; block/unblock, quota set, role (user/admin/superadmin), password reset, delete.
- Images: **har image ka size** (original + thumbnail), sabse badi pehle, user-wise filter, delete.
- Storage: disk vs database, orphan files cleanup.
- Chat moderation, app settings (registration on/off, chat on/off, upload limit, default quota, photos per item).

## Tech

- Backend: plain **PHP 8.1+** + **MySQL/MariaDB** (or SQLite) — Hostinger shared hosting pe chalta hai.
- Frontend: vanilla JS (ES modules), no build step.
- Android: **Capacitor** wraps the same UI; GitHub Actions builds the APK.

```
public/          ← web root (index.html, admin/, api.php, install.php, assets/, uploads/)
app/             ← PHP API (never web-accessible)
config/          ← config.php created by the installer
database/        ← schema for MySQL and SQLite
mobile/          ← Capacitor Android project files
tools/           ← CLI installer
```

## 1) Website install (Hostinger)

1. hPanel → **Databases → MySQL** — database + user banao.
2. Poora repo `public_html` me upload karo (ya subdomain folder, jaise `wardrobe.yourdomain.com`).
   Root `.htaccess` sab requests `public/` me bhejta hai. Better: domain ka document root seedha `public/` pe set karo.
3. `config/`, `storage/` aur `public/uploads/` writable rakho.
4. `https://your-domain/install.php` kholo → DB details + Super Admin email/password → **Install**.
5. App: `https://your-domain/` · Super Admin: `https://your-domain/admin/`

CLI se bhi install ho sakta hai:

```bash
php tools/install-cli.php --driver=mysql --host=localhost --name=DB --user=USER --pass=PASS \
  --admin-email=you@example.com --admin-password=strongpass
# ya bina database ke:
php tools/install-cli.php --driver=sqlite --admin-email=you@example.com --admin-password=strongpass
```

Local run: `php -S 127.0.0.1:8000 -t public`

## 2) Android APK

Har push pe **GitHub Actions → "Build Android APK"** APK banata hai:
- **Releases** page pe `Wardrobe.apk` milega (latest build), ya Actions run ke *Artifacts* me.
- Phone pe download karo → install (browser/file manager ko "Install unknown apps" allow karna padega).

**Server address:** repo **Settings → Secrets and variables → Actions → Variables** me `WARDROBE_API_URL` = `https://your-domain` set karo aur workflow dobara chalao (Actions → Build Android APK → *Run workflow*), to app seedha aapke server se judega. Agar set nahi kiya, app pehli baar khulne pe server address poochti hai (Profile → Server se baad me badal sakte ho).

Local build (Android SDK + Java 21 chahiye):

```bash
cd mobile && npm install
WARDROBE_API_URL=https://your-domain npm run prepare-www
npx cap add android && npm run android:patch && npx cap sync android
cd android && ./gradlew assembleDebug
```

> Note: CI debug-signed APK banata hai. Har build ka signature alag ho sakta hai, isliye update karte waqt purani app uninstall karni pad sakti hai. Play Store ke liye release keystore se sign karein.

## Security notes

- Passwords `password_hash` se, login token random 256-bit (DB me sirf SHA-256 hash).
- Uploads: type check (finfo + getimagesize), size limit, per-user storage quota, random filenames, `uploads/` me PHP execution band.
- `app/`, `config/`, `storage/`, `database/` web se blocked.
