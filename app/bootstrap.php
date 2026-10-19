<?php
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('PUBLIC_DIR', ROOT . '/public');
define('UPLOAD_DIR', PUBLIC_DIR . '/uploads');
define('CONFIG_FILE', ROOT . '/config/config.php');

const ROLES = ['user', 'admin', 'superadmin'];
const GENDERS = ['male', 'female', 'other'];
const VISIBILITIES = ['private', 'public', 'selected'];
const STATUSES = ['in', 'laundry', 'lent', 'packed', 'tailor'];
const CHAT_ROOMS = ['general', 'girls', 'boys', 'style'];
const THEMES = ['teak', 'walnut', 'rose', 'ocean', 'mint', 'royal', 'midnight', 'sunset'];

const DEFAULT_SETTINGS = [
    'app_name'         => 'Wardrobe',
    'allow_register'   => '1',
    'chat_enabled'     => '1',
    'max_upload_mb'    => '8',
    'default_quota_mb' => '500',
    'max_images_item'  => '4',
    'welcome_note'     => 'Apne saare kapde ek jagah — ghar, flat, kahin bhi.',
];

final class HttpError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}

function is_installed(): bool
{
    return is_file(CONFIG_FILE);
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        $config = is_installed() ? (array) require CONFIG_FILE : [];
    }
    return $config;
}

function make_pdo(array $db): PDO
{
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    if (($db['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $db['path'], null, null, $options);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        return $pdo;
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $db['host'] ?? 'localhost',
        (int) ($db['port'] ?? 3306),
        $db['name'] ?? ''
    );
    $pdo = new PDO($dsn, $db['user'] ?? '', $db['pass'] ?? '', $options);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = make_pdo(config()['db'] ?? []);
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute(array_values($params));
    return $stmt;
}

function one(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function insert(string $table, array $row): int
{
    $cols = array_keys($row);
    $sql = sprintf(
        'INSERT INTO %s (%s) VALUES (%s)',
        $table,
        implode(', ', $cols),
        implode(', ', array_fill(0, count($cols), '?'))
    );
    q($sql, array_values($row));
    return (int) db()->lastInsertId();
}

function update(string $table, int $id, array $row): void
{
    if (!$row) {
        return;
    }
    $sets = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($row)));
    q("UPDATE $table SET $sets WHERE id = ?", [...array_values($row), $id]);
}

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function setting(string $key): string
{
    static $cache = null;
    if ($cache === null) {
        $cache = DEFAULT_SETTINGS;
        foreach (all('SELECT k, v FROM settings') as $r) {
            $cache[$r['k']] = (string) $r['v'];
        }
    }
    return $cache[$key] ?? '';
}

function save_setting(string $key, string $value): void
{
    if (val('SELECT COUNT(*) FROM settings WHERE k = ?', [$key])) {
        q('UPDATE settings SET v = ? WHERE k = ?', [$value, $key]);
    } else {
        q('INSERT INTO settings (k, v) VALUES (?, ?)', [$key, $value]);
    }
}

/** Splits a schema file into statements and runs them. */
function run_schema(PDO $pdo, string $driver): void
{
    $sql = file_get_contents(ROOT . "/database/schema.$driver.sql");
    $sql = preg_replace('/^--.*$/m', '', $sql);
    foreach (preg_split('/;\s*$/m', $sql) as $stmt) {
        if (trim($stmt) !== '') {
            $pdo->exec($stmt);
        }
    }
}
