<?php
declare(strict_types=1);

/** SQL condition that makes an item visible to other users. */
const PUBLIC_ITEM_SQL = "u.status = 'active' AND (u.visibility = 'public' OR (u.visibility = 'selected' AND i.is_public = 1))";

function message_out(array $m): array
{
    $out = [
        'id'         => (int) $m['id'],
        'room'       => $m['room'],
        'body'       => $m['deleted'] ? '' : $m['body'],
        'deleted'    => (bool) $m['deleted'],
        'created_at' => $m['created_at'],
        'user'       => [
            'id' => (int) $m['user_id'], 'name' => $m['user_name'], 'gender' => $m['user_gender'],
            'avatar' => $m['user_avatar'], 'role' => $m['user_role'],
        ],
        'item'       => null,
    ];
    if ($m['item_id'] && !$m['deleted']) {
        $out['item'] = [
            'id'       => (int) $m['item_id'],
            'title'    => $m['item_title'],
            'category' => $m['item_category'],
            'thumb'    => $m['item_thumb'],
            'image'    => $m['item_image'],
        ];
    }
    return $out;
}

const MESSAGE_SELECT = "SELECT m.*, u.name AS user_name, u.gender AS user_gender, u.avatar AS user_avatar, u.role AS user_role,
       i.title AS item_title, i.category AS item_category,
       (SELECT thumb FROM item_images im WHERE im.item_id = i.id ORDER BY sort, id LIMIT 1) AS item_thumb,
       (SELECT path FROM item_images im WHERE im.item_id = i.id ORDER BY sort, id LIMIT 1) AS item_image
  FROM chat_messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN items i ON i.id = m.item_id";

function chat_list(): array
{
    current_user();
    $room = in_array($_GET['room'] ?? '', CHAT_ROOMS, true) ? $_GET['room'] : 'general';
    $after = (int) ($_GET['after'] ?? 0);
    $before = (int) ($_GET['before'] ?? 0);
    if ($after > 0) {
        $rows = all(MESSAGE_SELECT . ' WHERE m.room = ? AND m.id > ? ORDER BY m.id LIMIT 100', [$room, $after]);
    } else {
        $sql = MESSAGE_SELECT . ' WHERE m.room = ?' . ($before > 0 ? ' AND m.id < ?' : '') . ' ORDER BY m.id DESC LIMIT 50';
        $rows = array_reverse(all($sql, $before > 0 ? [$room, $before] : [$room]));
    }
    $since = gmdate('Y-m-d H:i:s', time() - 300);
    return [
        'room'     => $room,
        'messages' => array_map('message_out', $rows),
        'online'   => (int) val('SELECT COUNT(*) FROM users WHERE last_seen_at >= ?', [$since]),
        'enabled'  => setting('chat_enabled') === '1',
    ];
}

function chat_send(): array
{
    $u = current_user();
    if (setting('chat_enabled') !== '1') {
        throw new HttpError('Community chat is paused by admin');
    }
    $room = str_in('room', 20, 'general');
    if (!in_array($room, CHAT_ROOMS, true)) {
        throw new HttpError('Unknown room');
    }
    $body = str_in('body', 1000);
    $itemId = (int) (input()['item_id'] ?? 0);
    if ($itemId) {
        own_item($itemId);
    }
    if ($body === '' && !$itemId) {
        throw new HttpError('Message is empty');
    }
    $last = val('SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$u['id']]);
    if ($last && strtotime($last . ' UTC') >= time() - 1) {
        throw new HttpError('Slow down a little 🙂', 429);
    }
    $id = insert('chat_messages', [
        'user_id' => $u['id'], 'room' => $room, 'body' => $body,
        'item_id' => $itemId ?: null, 'deleted' => 0, 'created_at' => now(),
    ]);
    return ['message' => message_out(one(MESSAGE_SELECT . ' WHERE m.id = ?', [$id]))];
}

function chat_delete(string $id): array
{
    $u = current_user();
    $m = one('SELECT * FROM chat_messages WHERE id = ?', [(int) $id]);
    if (!$m) {
        throw new HttpError('Message not found', 404);
    }
    if ((int) $m['user_id'] !== (int) $u['id'] && !in_array($u['role'], ['admin', 'superadmin'], true)) {
        throw new HttpError('You can only delete your own messages', 403);
    }
    q('UPDATE chat_messages SET deleted = 1 WHERE id = ?', [$m['id']]);
    return ['ok' => true];
}

function community_wardrobes(): array
{
    current_user();
    $params = [];
    $where = "u.status = 'active' AND u.visibility <> 'private'";
    $search = trim((string) ($_GET['q'] ?? ''));
    if ($search !== '') {
        $where .= ' AND LOWER(u.name) LIKE ?';
        $params[] = '%' . mb_strtolower($search) . '%';
    }
    if (in_array($_GET['gender'] ?? '', GENDERS, true)) {
        $where .= ' AND u.gender = ?';
        $params[] = $_GET['gender'];
    }
    $rows = all(
        "SELECT u.*, (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id AND (u.visibility = 'public' OR i.is_public = 1)) AS public_count
           FROM users u WHERE $where ORDER BY u.last_seen_at DESC LIMIT 100",
        $params
    );
    $out = [];
    foreach ($rows as $r) {
        if (!(int) $r['public_count']) {
            continue;
        }
        $thumbs = all(
            "SELECT (SELECT thumb FROM item_images im WHERE im.item_id = i.id ORDER BY sort, id LIMIT 1) AS thumb
               FROM items i WHERE i.user_id = ? AND (? = 'public' OR i.is_public = 1)
              ORDER BY i.updated_at DESC LIMIT 4",
            [$r['id'], $r['visibility']]
        );
        $out[] = user_out($r) + [
            'public_count' => (int) $r['public_count'],
            'thumbs'       => array_values(array_filter(array_column($thumbs, 'thumb'))),
        ];
    }
    return ['wardrobes' => $out];
}

function public_items(string $extraWhere, array $params, int $limit): array
{
    $rows = all(
        'SELECT i.*, u.name AS owner_name, u.avatar AS owner_avatar FROM items i JOIN users u ON u.id = i.user_id
          WHERE ' . PUBLIC_ITEM_SQL . " $extraWhere ORDER BY i.created_at DESC LIMIT $limit",
        $params
    );
    $images = images_for(array_map(fn ($r) => (int) $r['id'], $rows));
    return array_map(fn ($r) => item_out($r, $images[(int) $r['id']] ?? [], false), $rows);
}

function community_profile(string $id): array
{
    current_user();
    $u = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [(int) $id]);
    if (!$u || $u['visibility'] === 'private') {
        throw new HttpError('This wardrobe is private', 404);
    }
    return ['user' => user_out($u), 'items' => public_items('AND u.id = ?', [$u['id']], 500)];
}

function community_feed(): array
{
    current_user();
    $params = [];
    $extra = '';
    if (!empty($_GET['tag'])) {
        $extra .= ' AND i.tags LIKE ?';
        $params[] = '%,' . mb_strtolower(trim((string) $_GET['tag'])) . ',%';
    }
    if (in_array($_GET['gender'] ?? '', GENDERS, true)) {
        $extra .= ' AND u.gender = ?';
        $params[] = $_GET['gender'];
    }
    return ['items' => public_items($extra, $params, 80)];
}

function community_item(string $id): array
{
    $me = current_user();
    $rows = public_items('AND i.id = ?', [(int) $id], 1);
    if (!$rows) {
        // Items shared in chat stay viewable even when the wardrobe is private.
        $shared = val('SELECT COUNT(*) FROM chat_messages WHERE item_id = ? AND deleted = 0', [(int) $id]);
        $own = val('SELECT COUNT(*) FROM items WHERE id = ? AND user_id = ?', [(int) $id, $me['id']]);
        if ($shared || $own) {
            $rows = all(
                'SELECT i.*, u.name AS owner_name, u.avatar AS owner_avatar FROM items i JOIN users u ON u.id = i.user_id WHERE i.id = ?',
                [(int) $id]
            );
            $images = images_for([(int) $id]);
            $rows = array_map(fn ($r) => item_out($r, $images[(int) $r['id']] ?? [], false), $rows);
        }
    }
    if (!$rows) {
        throw new HttpError('This item is private', 404);
    }
    return ['item' => $rows[0]];
}
