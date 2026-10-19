<?php
declare(strict_types=1);

/**
 * Creates the database tables, the Super Admin and config/config.php.
 * $data: driver, host, port, name, user, pass (MySQL) | path (SQLite), admin_name, admin_email, admin_password, app_name
 */
function run_install(array $data): void
{
    $driver = ($data['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    if ($driver === 'sqlite') {
        $db = ['driver' => 'sqlite', 'path' => $data['path'] ?: ROOT . '/storage/wardrobe.sqlite'];
        if (!is_dir(dirname($db['path'])) || !is_writable(dirname($db['path']))) {
            throw new RuntimeException('Folder for the SQLite file is not writable: ' . dirname($db['path']));
        }
    } else {
        $db = [
            'driver' => 'mysql',
            'host'   => $data['host'] ?: 'localhost',
            'port'   => (int) ($data['port'] ?: 3306),
            'name'   => $data['name'] ?? '',
            'user'   => $data['user'] ?? '',
            'pass'   => $data['pass'] ?? '',
        ];
    }

    $email = strtolower(trim($data['admin_email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Enter a valid Super Admin email');
    }
    if (strlen($data['admin_password'] ?? '') < 8) {
        throw new RuntimeException('Super Admin password must be at least 8 characters');
    }
    if (!is_writable(ROOT . '/config')) {
        throw new RuntimeException('The config/ folder is not writable');
    }

    $pdo = make_pdo($db);
    run_schema($pdo, $driver);

    $now = gmdate('Y-m-d H:i:s');
    $exists = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $exists->execute([$email]);
    $id = $exists->fetchColumn();
    if ($id) {
        $pdo->prepare("UPDATE users SET role = 'superadmin', status = 'active', password_hash = ? WHERE id = ?")
            ->execute([password_hash($data['admin_password'], PASSWORD_DEFAULT), $id]);
    } else {
        $pdo->prepare(
            "INSERT INTO users (name, email, password_hash, gender, role, status, visibility, theme, created_at)
             VALUES (?, ?, ?, 'other', 'superadmin', 'active', 'private', 'teak', ?)"
        )->execute([trim($data['admin_name'] ?? '') ?: 'Super Admin', $email, password_hash($data['admin_password'], PASSWORD_DEFAULT), $now]);
        $id = $pdo->lastInsertId();
        $loc = $pdo->prepare('INSERT INTO locations (user_id, name, emoji, sort, created_at) VALUES (?, ?, ?, ?, ?)');
        $loc->execute([$id, 'Ghar', '🏠', 0, $now]);
        $loc->execute([$id, 'Flat', '🏢', 1, $now]);
    }
    if (!empty($data['app_name'])) {
        $pdo->prepare('DELETE FROM settings WHERE k = ?')->execute(['app_name']);
        $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)')->execute(['app_name', trim($data['app_name'])]);
    }

    $config = ['db' => $db, 'debug' => false, 'installed_at' => $now];
    file_put_contents(CONFIG_FILE, "<?php\nreturn " . var_export($config, true) . ";\n", LOCK_EX);
    @chmod(CONFIG_FILE, 0640);
}
