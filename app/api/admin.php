<?php
declare(strict_types=1);

const ADMIN_USER_SELECT = 'SELECT u.*,
       (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id) AS item_count,
       (SELECT COUNT(*) FROM item_images im WHERE im.user_id = u.id) AS image_count,
       (SELECT COALESCE(SUM(im.size_bytes + im.thumb_bytes), 0) FROM item_images im WHERE im.user_id = u.id) AS storage_bytes,
       (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id = u.id) AS message_count
  FROM users u';

function admin_user_out(array $u): array
{
    return user_out($u, true) + [
        'item_count'    => (int) $u['item_count'],
        'image_count'   => (int) $u['image_count'],
        'storage_bytes' => (int) $u['storage_bytes'],
        'message_count' => (int) $u['message_count'],
        'quota_custom'  => $u['quota_mb'] !== null ? (int) $u['quota_mb'] : null,
    ];
}

function admin_stats(): array
{
    require_admin();
    $day = gmdate('Y-m-d H:i:s', time() - 86400);
    $week = gmdate('Y-m-d H:i:s', time() - 7 * 86400);

    $signups = [];
    for ($d = 13; $d >= 0; $d--) {
        $signups[gmdate('Y-m-d', time() - $d * 86400)] = 0;
    }
    foreach (all('SELECT created_at FROM users WHERE created_at >= ?', [gmdate('Y-m-d', time() - 13 * 86400)]) as $r) {
        $k = substr($r['created_at'], 0, 10);
        if (isset($signups[$k])) {
            $signups[$k]++;
        }
    }
    $genders = [];
    foreach (all('SELECT gender, COUNT(*) AS c FROM users GROUP BY gender') as $r) {
        $genders[$r['gender']] = (int) $r['c'];
    }
    $categories = [];
    foreach (all('SELECT category, COUNT(*) AS c FROM items GROUP BY category ORDER BY c DESC LIMIT 8') as $r) {
        $categories[$r['category']] = (int) $r['c'];
    }
    $top = all(ADMIN_USER_SELECT . ' ORDER BY storage_bytes DESC LIMIT 8');

    return [
        'users'          => (int) val('SELECT COUNT(*) FROM users'),
        'active_today'   => (int) val('SELECT COUNT(*) FROM users WHERE last_seen_at >= ?', [$day]),
        'new_this_week'  => (int) val('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$week]),
        'blocked'        => (int) val("SELECT COUNT(*) FROM users WHERE status = 'blocked'"),
        'items'          => (int) val('SELECT COUNT(*) FROM items'),
        'public_items'   => (int) val('SELECT COUNT(*) FROM items i JOIN users u ON u.id = i.user_id WHERE ' . PUBLIC_ITEM_SQL),
        'images'         => (int) val('SELECT COUNT(*) FROM item_images'),
        'storage_bytes'  => (int) val('SELECT COALESCE(SUM(size_bytes + thumb_bytes), 0) FROM item_images'),
        'avg_image'      => (int) val('SELECT COALESCE(AVG(size_bytes), 0) FROM item_images'),
        'messages'       => (int) val('SELECT COUNT(*) FROM chat_messages'),
        'messages_today' => (int) val('SELECT COUNT(*) FROM chat_messages WHERE created_at >= ?', [$day]),
        'disk_free'      => @disk_free_space(UPLOAD_DIR) ?: null,
        'signups'        => $signups,
        'genders'        => $genders,
        'categories'     => $categories,
        'top_storage'    => array_map('admin_user_out', $top),
    ];
}

function admin_users(): array
{
    require_admin();
    $params = [];
    $where = [];
    $search = mb_strtolower(trim((string) ($_GET['q'] ?? '')));
    if ($search !== '') {
        $where[] = '(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)';
        array_push($params, "%$search%", "%$search%");
    }
    foreach (['role' => ROLES, 'status' => ['active', 'blocked'], 'gender' => GENDERS] as $f => $allowed) {
        if (in_array($_GET[$f] ?? '', $allowed, true)) {
            $where[] = "u.$f = ?";
            $params[] = $_GET[$f];
        }
    }
    $sort = [
        'storage' => 'storage_bytes DESC', 'items' => 'item_count DESC', 'new' => 'u.id DESC',
        'seen' => 'u.last_seen_at DESC', 'name' => 'u.name ASC',
    ][$_GET['sort'] ?? 'new'] ?? 'u.id DESC';
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $per = 30;
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $total = (int) val('SELECT COUNT(*) FROM users u' . $whereSql, $params);
    $rows = all(ADMIN_USER_SELECT . $whereSql . " ORDER BY $sort LIMIT $per OFFSET " . (($page - 1) * $per), $params);
    return ['users' => array_map('admin_user_out', $rows), 'total' => $total, 'page' => $page, 'per_page' => $per];
}

function admin_target(string $id): array
{
    $u = one(ADMIN_USER_SELECT . ' WHERE u.id = ?', [(int) $id]);
    if (!$u) {
        throw new HttpError('User not found', 404);
    }
    return $u;
}

function admin_user_show(string $id): array
{
    require_admin();
    $u = admin_target($id);
    $locations = all(
        'SELECT l.*, (SELECT COUNT(*) FROM items i WHERE i.location_id = l.id) AS item_count FROM locations l WHERE l.user_id = ? ORDER BY sort, id',
        [$u['id']]
    );
    $items = all('SELECT * FROM items WHERE user_id = ? ORDER BY id DESC LIMIT 60', [$u['id']]);
    $images = images_for(array_map(fn ($r) => (int) $r['id'], $items));
    return [
        'user'      => admin_user_out($u),
        'locations' => array_map('location_out', $locations),
        'items'     => array_map(fn ($r) => item_out($r, $images[(int) $r['id']] ?? []), $items),
        'sessions'  => (int) val('SELECT COUNT(*) FROM tokens WHERE user_id = ?', [$u['id']]),
    ];
}

/** Admins may manage normal users; only a Super Admin may manage admins. */
function assert_can_manage(array $me, array $target): void
{
    if ((int) $me['id'] === (int) $target['id']) {
        throw new HttpError('You cannot change your own account from here');
    }
    if ($target['role'] !== 'user' && $me['role'] !== 'superadmin') {
        throw new HttpError('Only the Super Admin can manage admins', 403);
    }
}

function admin_user_update(string $id): array
{
    $me = require_admin();
    $u = admin_target($id);
    assert_can_manage($me, $u);
    $row = [];
    if (has_in('status') && in_array(str_in('status'), ['active', 'blocked'], true)) {
        $row['status'] = str_in('status');
        if ($row['status'] === 'blocked') {
            q('DELETE FROM tokens WHERE user_id = ?', [$u['id']]);
        }
    }
    if (has_in('role') && in_array(str_in('role'), ROLES, true)) {
        if ($me['role'] !== 'superadmin') {
            throw new HttpError('Only the Super Admin can change roles', 403);
        }
        $row['role'] = str_in('role');
    }
    if (has_in('quota_mb')) {
        $quota = input()['quota_mb'];
        $row['quota_mb'] = ($quota === null || $quota === '' || (int) $quota <= 0) ? null : min(1048576, (int) $quota);
    }
    if (has_in('name') && mb_strlen(str_in('name', 80)) >= 2) {
        $row['name'] = str_in('name', 80);
    }
    if (has_in('password')) {
        if ($me['role'] !== 'superadmin') {
            throw new HttpError('Only the Super Admin can reset passwords', 403);
        }
        $pw = (string) input()['password'];
        if (strlen($pw) < 6) {
            throw new HttpError('Password must be at least 6 characters');
        }
        $row['password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
        q('DELETE FROM tokens WHERE user_id = ?', [$u['id']]);
    }
    update('users', (int) $u['id'], $row);
    return ['user' => admin_user_out(admin_target($id))];
}

function admin_user_delete(string $id): array
{
    $me = require_admin();
    $u = admin_target($id);
    assert_can_manage($me, $u);
    delete_user_completely((int) $u['id']);
    return ['ok' => true];
}

function admin_images(): array
{
    require_admin();
    $params = [];
    $where = '';
    if (!empty($_GET['user'])) {
        $where = ' WHERE im.user_id = ?';
        $params[] = (int) $_GET['user'];
    }
    $sort = ($_GET['sort'] ?? 'size') === 'new' ? 'im.id DESC' : '(im.size_bytes + im.thumb_bytes) DESC';
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $per = 40;
    $total = (int) val('SELECT COUNT(*) FROM item_images im' . $where, $params);
    $rows = all(
        "SELECT im.*, u.name AS user_name, u.email AS user_email, i.title AS item_title
           FROM item_images im JOIN users u ON u.id = im.user_id LEFT JOIN items i ON i.id = im.item_id
           $where ORDER BY $sort LIMIT $per OFFSET " . (($page - 1) * $per),
        $params
    );
    return [
        'images' => array_map(fn ($r) => image_out($r) + [
            'original_bytes' => (int) $r['size_bytes'],
            'thumb_bytes'    => (int) $r['thumb_bytes'],
            'item_id'        => (int) $r['item_id'],
            'item_title'     => $r['item_title'],
            'user'           => ['id' => (int) $r['user_id'], 'name' => $r['user_name'], 'email' => $r['user_email']],
            'created_at'     => $r['created_at'],
        ], $rows),
        'total' => $total, 'page' => $page, 'per_page' => $per,
    ];
}

function admin_image_delete(string $id): array
{
    require_admin();
    $img = one('SELECT id, path, thumb FROM item_images WHERE id = ?', [(int) $id]);
    if (!$img) {
        throw new HttpError('Image not found', 404);
    }
    delete_image_rows([$img]);
    return ['ok' => true];
}

function admin_chat(): array
{
    require_admin();
    $params = [];
    $where = ' WHERE 1 = 1';
    if (in_array($_GET['room'] ?? '', CHAT_ROOMS, true)) {
        $where .= ' AND m.room = ?';
        $params[] = $_GET['room'];
    }
    if (!empty($_GET['q'])) {
        $where .= ' AND LOWER(m.body) LIKE ?';
        $params[] = '%' . mb_strtolower((string) $_GET['q']) . '%';
    }
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $rows = all(MESSAGE_SELECT . $where . ' ORDER BY m.id DESC LIMIT 50 OFFSET ' . (($page - 1) * 50), $params);
    return ['messages' => array_map(function ($m) {
        $out = message_out($m);
        $out['body'] = $m['body'];
        return $out;
    }, $rows), 'page' => $page];
}

function admin_chat_delete(string $id): array
{
    require_admin();
    $hard = ($_GET['hard'] ?? '') === '1';
    $hard
        ? q('DELETE FROM chat_messages WHERE id = ?', [(int) $id])
        : q('UPDATE chat_messages SET deleted = 1 WHERE id = ?', [(int) $id]);
    return ['ok' => true];
}

function admin_settings(): array
{
    require_admin();
    $out = [];
    foreach (array_keys(DEFAULT_SETTINGS) as $k) {
        $out[$k] = setting($k);
    }
    return ['settings' => $out];
}

function admin_settings_save(): array
{
    require_admin(true);
    foreach (array_keys(DEFAULT_SETTINGS) as $k) {
        if (!has_in($k)) {
            continue;
        }
        $v = str_in($k, 500);
        if (in_array($k, ['allow_register', 'chat_enabled'], true)) {
            $v = bool_in($k) ? '1' : '0';
        }
        if (in_array($k, ['max_upload_mb', 'default_quota_mb', 'max_images_item'], true)) {
            $v = (string) max(1, (int) $v);
        }
        save_setting($k, $v);
    }
    return ['ok' => true];
}

/** Compares files on disk with the database and optionally removes orphans. */
function admin_storage_scan(): array
{
    require_admin(true);
    $known = [];
    foreach (all('SELECT path, thumb FROM item_images') as $r) {
        $known[$r['path']] = true;
        $known[$r['thumb']] = true;
    }
    foreach (all('SELECT avatar FROM users WHERE avatar IS NOT NULL') as $r) {
        $known[$r['avatar']] = true;
    }
    $diskBytes = 0;
    $orphans = [];
    if (is_dir(UPLOAD_DIR)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(UPLOAD_DIR, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if (!$f->isFile() || str_starts_with($f->getFilename(), '.') || $f->getFilename() === 'index.html') {
                continue;
            }
            $rel = 'uploads/' . ltrim(str_replace('\\', '/', substr($f->getPathname(), strlen(UPLOAD_DIR))), '/');
            $diskBytes += $f->getSize();
            if (!isset($known[$rel])) {
                $orphans[] = ['path' => $rel, 'size' => $f->getSize()];
            }
        }
    }
    $removed = 0;
    if (($_GET['clean'] ?? '') === '1') {
        foreach ($orphans as $o) {
            delete_files($o['path']);
            $removed++;
        }
    }
    return [
        'disk_bytes'   => $diskBytes,
        'orphans'      => $removed ? [] : array_slice($orphans, 0, 200),
        'orphan_count' => $removed ? 0 : count($orphans),
        'orphan_bytes' => $removed ? 0 : array_sum(array_column($orphans, 'size')),
        'removed'      => $removed,
    ];
}
