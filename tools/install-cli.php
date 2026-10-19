<?php
/**
 * Command-line installer.
 *   php tools/install-cli.php --driver=sqlite --admin-email=me@example.com --admin-password=secret123
 *   php tools/install-cli.php --driver=mysql --host=localhost --name=wardrobe --user=root --pass=... --admin-email=... --admin-password=...
 */
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';
require ROOT . '/app/install.php';

$o = getopt('', ['driver:', 'host:', 'port:', 'name:', 'user:', 'pass:', 'path:', 'admin-name:', 'admin-email:', 'admin-password:', 'app-name:', 'force']);
if (is_installed() && !isset($o['force'])) {
    fwrite(STDERR, "Already installed (config/config.php exists). Use --force to reinstall.\n");
    exit(1);
}
try {
    run_install([
        'driver' => $o['driver'] ?? 'sqlite', 'host' => $o['host'] ?? '', 'port' => $o['port'] ?? '',
        'name' => $o['name'] ?? '', 'user' => $o['user'] ?? '', 'pass' => $o['pass'] ?? '', 'path' => $o['path'] ?? '',
        'admin_name' => $o['admin-name'] ?? 'Super Admin', 'admin_email' => $o['admin-email'] ?? '',
        'admin_password' => $o['admin-password'] ?? '', 'app_name' => $o['app-name'] ?? '',
    ]);
    echo "Installed. Login with " . ($o['admin-email'] ?? '') . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Install failed: ' . $e->getMessage() . "\n");
    exit(1);
}
