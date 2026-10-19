<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';
require ROOT . '/app/install.php';

$error = '';
$done = false;
if (!is_installed() && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    try {
        run_install($_POST);
        $done = true;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
$v = fn (string $k, string $d = '') => htmlspecialchars((string) ($_POST[$k] ?? $d), ENT_QUOTES);
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install Wardrobe</title>
<style>
  :root { --wood: #8a5a35; --bg: #f6efe6; --text: #2d1f14; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px 16px; }
  .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 18px; padding: 28px; box-shadow: 0 10px 40px #5a3a2030; }
  h1 { margin: 0 0 4px; font-size: 26px; } p.sub { margin: 0 0 20px; color: #7a6555; }
  label { display: block; font-weight: 600; margin: 14px 0 4px; font-size: 13px; }
  input, select { width: 100%; padding: 11px 12px; border: 1px solid #dccbbb; border-radius: 10px; font: inherit; }
  fieldset { border: 1px dashed #dccbbb; border-radius: 12px; margin: 18px 0 0; padding: 4px 14px 14px; }
  legend { font-weight: 700; padding: 0 6px; }
  button, .btn { display: inline-block; margin-top: 22px; width: 100%; padding: 13px; border: 0; border-radius: 12px; background: var(--wood); color: #fff; font: 600 16px system-ui; cursor: pointer; text-align: center; text-decoration: none; }
  .err { background: #fde8e8; color: #9b1c1c; padding: 10px 12px; border-radius: 10px; margin-bottom: 10px; }
  .ok { background: #e6f6ea; color: #17602d; padding: 12px; border-radius: 10px; }
  .row { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
  [data-show] { display: none; }
</style>
</head>
<body>
<div class="card">
  <h1>🚪 Wardrobe setup</h1>
<?php if (is_installed() && !$done): ?>
  <p class="ok">Wardrobe is already installed. For safety this page is locked. To reinstall, delete <code>config/config.php</code>.</p>
  <a class="btn" href="./">Open Wardrobe</a>
<?php elseif ($done): ?>
  <p class="ok">✅ Installed! Login with your Super Admin email.</p>
  <a class="btn" href="./">Open Wardrobe</a>
  <a class="btn" style="background:#2d1f14" href="admin/">Open Super Admin portal</a>
<?php else: ?>
  <p class="sub">Fill this once. It creates the database tables and your Super Admin account.</p>
  <?php if ($error): ?><div class="err"><?= htmlspecialchars($error) ?></div><?php endif; ?>
  <form method="post">
    <label>App name</label>
    <input name="app_name" value="<?= $v('app_name', 'Wardrobe') ?>">
    <fieldset>
      <legend>Database</legend>
      <label>Type</label>
      <select name="driver" id="driver">
        <option value="mysql" <?= ($_POST['driver'] ?? '') !== 'sqlite' ? 'selected' : '' ?>>MySQL / MariaDB (recommended on Hostinger)</option>
        <option value="sqlite" <?= ($_POST['driver'] ?? '') === 'sqlite' ? 'selected' : '' ?>>SQLite (single file, no setup)</option>
      </select>
      <div data-show="mysql">
        <div class="row">
          <div><label>Host</label><input name="host" value="<?= $v('host', 'localhost') ?>"></div>
          <div><label>Port</label><input name="port" value="<?= $v('port', '3306') ?>"></div>
        </div>
        <label>Database name</label><input name="name" value="<?= $v('name') ?>">
        <label>Database user</label><input name="user" value="<?= $v('user') ?>" autocomplete="off">
        <label>Database password</label><input name="pass" type="password" autocomplete="new-password">
      </div>
      <div data-show="sqlite">
        <label>SQLite file (leave empty for storage/wardrobe.sqlite)</label>
        <input name="path" value="<?= $v('path') ?>">
      </div>
    </fieldset>
    <fieldset>
      <legend>Super Admin</legend>
      <label>Name</label><input name="admin_name" value="<?= $v('admin_name', 'Super Admin') ?>" required>
      <label>Email</label><input name="admin_email" type="email" value="<?= $v('admin_email') ?>" required>
      <label>Password (min 8)</label><input name="admin_password" type="password" minlength="8" required autocomplete="new-password">
    </fieldset>
    <button type="submit">Install</button>
  </form>
  <script>
    const d = document.getElementById('driver');
    const sync = () => document.querySelectorAll('[data-show]').forEach(el => el.style.display = el.dataset.show === d.value ? 'block' : 'none');
    d.addEventListener('change', sync); sync();
  </script>
<?php endif; ?>
</div>
</body>
</html>
