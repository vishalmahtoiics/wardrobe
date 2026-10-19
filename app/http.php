<?php
declare(strict_types=1);

function cors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
    header('Access-Control-Max-Age: 86400');
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function input(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $data = $_POST;
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($type, 'application/json')) {
        $json = json_decode((string) file_get_contents('php://input'), true);
        if (is_array($json)) {
            $data = array_merge($data, $json);
        }
    }
    return $data;
}

function str_in(string $key, int $max = 255, string $default = ''): string
{
    $v = input()[$key] ?? $default;
    if (!is_scalar($v)) {
        return $default;
    }
    $v = trim((string) $v);
    return mb_substr($v, 0, $max);
}

function has_in(string $key): bool
{
    return array_key_exists($key, input());
}

function bool_in(string $key): int
{
    $v = input()[$key] ?? 0;
    return in_array($v, [1, '1', true, 'true', 'on', 'yes'], true) ? 1 : 0;
}

function auth_token(): ?string
{
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($token === '') {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (stripos($auth, 'Bearer ') === 0) {
            $token = trim(substr($auth, 7));
        }
    }
    return $token !== '' ? $token : null;
}

function current_user(bool $required = true): ?array
{
    static $user = false;
    if ($user === false) {
        $user = null;
        $token = auth_token();
        if ($token) {
            $row = one(
                'SELECT u.*, t.id AS token_id, t.last_used_at AS token_used
                   FROM tokens t JOIN users u ON u.id = t.user_id
                  WHERE t.token_hash = ?',
                [hash('sha256', $token)]
            );
            if ($row) {
                $stale = !$row['token_used'] || strtotime($row['token_used'] . ' UTC') < time() - 120;
                if ($stale) {
                    q('UPDATE tokens SET last_used_at = ? WHERE id = ?', [now(), $row['token_id']]);
                    q('UPDATE users SET last_seen_at = ? WHERE id = ?', [now(), $row['id']]);
                }
                $user = $row;
            }
        }
    }
    if ($required && !$user) {
        throw new HttpError('Please login again', 401);
    }
    if ($user && $user['status'] !== 'active') {
        throw new HttpError('Your account is blocked. Contact admin.', 403);
    }
    return $user;
}

function require_admin(bool $super = false): array
{
    $u = current_user();
    $ok = $super ? $u['role'] === 'superadmin' : in_array($u['role'], ['admin', 'superadmin'], true);
    if (!$ok) {
        throw new HttpError($super ? 'Only the Super Admin can do this' : 'Admin access required', 403);
    }
    return $u;
}

function issue_token(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    insert('tokens', [
        'user_id'    => $userId,
        'token_hash' => hash('sha256', $token),
        'user_agent' => mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250),
        'created_at' => now(),
        'last_used_at' => now(),
    ]);
    return $token;
}

function user_out(array $u, bool $private = false): array
{
    $out = [
        'id'         => (int) $u['id'],
        'name'       => $u['name'],
        'gender'     => $u['gender'],
        'avatar'     => $u['avatar'],
        'bio'        => $u['bio'],
        'role'       => $u['role'],
        'visibility' => $u['visibility'],
        'created_at' => $u['created_at'],
    ];
    if ($private) {
        $out += [
            'email'        => $u['email'],
            'theme'        => $u['theme'],
            'status'       => $u['status'],
            'quota_mb'     => user_quota_mb($u),
            'last_seen_at' => $u['last_seen_at'],
        ];
    }
    return $out;
}

function user_quota_mb(array $u): int
{
    return (int) ($u['quota_mb'] ?? 0) ?: (int) setting('default_quota_mb');
}

function user_storage_bytes(int $userId): int
{
    return (int) val(
        'SELECT COALESCE(SUM(size_bytes + thumb_bytes), 0) FROM item_images WHERE user_id = ?',
        [$userId]
    );
}
