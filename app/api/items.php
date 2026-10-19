<?php
declare(strict_types=1);

/* ---------- Locations ---------- */

function location_out(array $l): array
{
    return [
        'id'    => (int) $l['id'],
        'name'  => $l['name'],
        'emoji' => $l['emoji'],
        'sort'  => (int) $l['sort'],
        'count' => (int) ($l['item_count'] ?? 0),
    ];
}

function locations_list(): array
{
    $u = current_user();
    $rows = all(
        'SELECT l.*, (SELECT COUNT(*) FROM items i WHERE i.location_id = l.id) AS item_count
           FROM locations l WHERE l.user_id = ? ORDER BY l.sort, l.id',
        [$u['id']]
    );
    return ['locations' => array_map('location_out', $rows)];
}

function own_location(int $id): array
{
    $l = one('SELECT * FROM locations WHERE id = ? AND user_id = ?', [$id, current_user()['id']]);
    if (!$l) {
        throw new HttpError('Location not found', 404);
    }
    return $l;
}

function locations_create(): array
{
    $u = current_user();
    $name = str_in('name', 60);
    if ($name === '') {
        throw new HttpError('Give this place a name, e.g. Ghar, Flat, Hostel');
    }
    if ((int) val('SELECT COUNT(*) FROM locations WHERE user_id = ?', [$u['id']]) >= 30) {
        throw new HttpError('You can have at most 30 places');
    }
    $id = insert('locations', [
        'user_id'    => $u['id'],
        'name'       => $name,
        'emoji'      => str_in('emoji', 16, '🏠') ?: '🏠',
        'sort'       => (int) val('SELECT COALESCE(MAX(sort), 0) + 1 FROM locations WHERE user_id = ?', [$u['id']]),
        'created_at' => now(),
    ]);
    return ['location' => location_out(own_location($id))];
}

function locations_update(string $id): array
{
    $l = own_location((int) $id);
    $row = [];
    if (has_in('name') && str_in('name', 60) !== '') {
        $row['name'] = str_in('name', 60);
    }
    if (has_in('emoji') && str_in('emoji', 16) !== '') {
        $row['emoji'] = str_in('emoji', 16);
    }
    if (has_in('sort')) {
        $row['sort'] = (int) input()['sort'];
    }
    update('locations', (int) $l['id'], $row);
    return ['location' => location_out(own_location((int) $l['id']))];
}

function locations_delete(string $id): array
{
    $l = own_location((int) $id);
    q('UPDATE items SET location_id = NULL WHERE location_id = ?', [$l['id']]);
    q('DELETE FROM locations WHERE id = ?', [$l['id']]);
    return ['ok' => true];
}

/* ---------- Items ---------- */

function normalize_tags(mixed $tags): string
{
    if (is_string($tags)) {
        $tags = preg_split('/[,#]+/', $tags);
    }
    if (!is_array($tags)) {
        return '';
    }
    $clean = [];
    foreach ($tags as $t) {
        $t = mb_strtolower(trim((string) $t));
        $t = preg_replace('/[^\p{L}\p{N}\s\-]/u', '', $t);
        $t = mb_substr(trim(preg_replace('/\s+/', ' ', $t)), 0, 30);
        if ($t !== '' && !in_array($t, $clean, true)) {
            $clean[] = $t;
        }
    }
    return $clean ? ',' . implode(',', array_slice($clean, 0, 20)) . ',' : '';
}

function tags_array(string $tags): array
{
    return array_values(array_filter(explode(',', $tags), fn ($t) => $t !== ''));
}

function image_out(array $img): array
{
    return [
        'id'     => (int) $img['id'],
        'url'    => $img['path'],
        'thumb'  => $img['thumb'],
        'size'   => (int) $img['size_bytes'] + (int) $img['thumb_bytes'],
        'width'  => (int) $img['width'],
        'height' => (int) $img['height'],
    ];
}

function images_for(array $itemIds): array
{
    if (!$itemIds) {
        return [];
    }
    $marks = implode(',', array_fill(0, count($itemIds), '?'));
    $by = [];
    foreach (all("SELECT * FROM item_images WHERE item_id IN ($marks) ORDER BY sort, id", $itemIds) as $img) {
        $by[(int) $img['item_id']][] = image_out($img);
    }
    return $by;
}

function item_out(array $i, array $images, bool $owner = true): array
{
    $out = [
        'id'          => (int) $i['id'],
        'title'       => $i['title'],
        'category'    => $i['category'],
        'placement'   => $i['placement'],
        'tags'        => tags_array((string) $i['tags']),
        'description' => (string) $i['description'],
        'color'       => (string) $i['color'],
        'season'      => (string) $i['season'],
        'brand'       => (string) $i['brand'],
        'images'      => $images,
        'created_at'  => $i['created_at'],
    ];
    if ($owner) {
        $out += [
            'location_id'  => $i['location_id'] !== null ? (int) $i['location_id'] : null,
            'status'       => $i['status'],
            'is_public'    => (bool) $i['is_public'],
            'favorite'     => (bool) $i['favorite'],
            'wear_count'   => (int) $i['wear_count'],
            'last_worn_at' => $i['last_worn_at'],
            'updated_at'   => $i['updated_at'],
        ];
    } else {
        $out['owner'] = ['id' => (int) $i['user_id'], 'name' => $i['owner_name'] ?? '', 'avatar' => $i['owner_avatar'] ?? null];
    }
    return $out;
}

function items_list(): array
{
    $u = current_user();
    $where = ['i.user_id = ?'];
    $params = [$u['id']];

    $words = preg_split('/\s+/', mb_strtolower(trim((string) ($_GET['q'] ?? ''))), -1, PREG_SPLIT_NO_EMPTY);
    foreach (array_slice($words, 0, 6) as $w) {
        $like = '%' . str_replace(['%', '_'], '', $w) . '%';
        $where[] = '(LOWER(i.title) LIKE ? OR LOWER(i.tags) LIKE ? OR LOWER(i.category) LIKE ? OR LOWER(i.description) LIKE ?
                     OR LOWER(i.color) LIKE ? OR LOWER(i.brand) LIKE ? OR LOWER(l.name) LIKE ?)';
        array_push($params, $like, $like, $like, $like, $like, $like, $like);
    }
    if (!empty($_GET['tag'])) {
        $where[] = 'i.tags LIKE ?';
        $params[] = '%,' . mb_strtolower(trim((string) $_GET['tag'])) . ',%';
    }
    if (!empty($_GET['location'])) {
        $where[] = 'i.location_id = ?';
        $params[] = (int) $_GET['location'];
    }
    if (!empty($_GET['category'])) {
        $where[] = 'i.category = ?';
        $params[] = (string) $_GET['category'];
    }
    if (!empty($_GET['status'])) {
        $where[] = 'i.status = ?';
        $params[] = (string) $_GET['status'];
    }
    if (!empty($_GET['favorite'])) {
        $where[] = 'i.favorite = 1';
    }

    $rows = all(
        'SELECT i.* FROM items i LEFT JOIN locations l ON l.id = i.location_id
          WHERE ' . implode(' AND ', $where) . ' ORDER BY i.updated_at DESC, i.id DESC LIMIT 3000',
        $params
    );
    $images = images_for(array_map(fn ($r) => (int) $r['id'], $rows));
    return ['items' => array_map(fn ($r) => item_out($r, $images[(int) $r['id']] ?? []), $rows)];
}

function own_item(int $id): array
{
    $i = one('SELECT * FROM items WHERE id = ? AND user_id = ?', [$id, current_user()['id']]);
    if (!$i) {
        throw new HttpError('Item not found', 404);
    }
    return $i;
}

function item_payload(array $i): array
{
    return ['item' => item_out($i, images_for([(int) $i['id']])[(int) $i['id']] ?? [])];
}

function items_show(string $id): array
{
    return item_payload(own_item((int) $id));
}

/** Reads the editable item fields from the request. */
function item_fields(bool $creating): array
{
    $row = [];
    if ($creating || has_in('title')) {
        $title = str_in('title', 120);
        if ($title === '') {
            throw new HttpError('Give your cloth a title, e.g. "Blue party dress"');
        }
        $row['title'] = $title;
    }
    foreach (['category' => 40, 'color' => 30, 'season' => 20, 'brand' => 60] as $f => $max) {
        if ($creating || has_in($f)) {
            $row[$f] = str_in($f, $max);
        }
    }
    if (isset($row['category']) && $row['category'] === '') {
        $row['category'] = 'Other';
    }
    if ($creating || has_in('description')) {
        $row['description'] = str_in('description', 2000);
    }
    if ($creating || has_in('placement')) {
        $row['placement'] = str_in('placement') === 'hang' ? 'hang' : 'fold';
    }
    if ($creating || has_in('tags')) {
        $row['tags'] = normalize_tags(input()['tags'] ?? '');
    }
    if ($creating || has_in('status')) {
        $s = str_in('status', 20, 'in');
        $row['status'] = in_array($s, STATUSES, true) ? $s : 'in';
    }
    foreach (['is_public', 'favorite'] as $f) {
        if ($creating || has_in($f)) {
            $row[$f] = bool_in($f);
        }
    }
    if ($creating || has_in('location_id')) {
        $loc = (int) (input()['location_id'] ?? 0);
        $row['location_id'] = $loc ? (int) own_location($loc)['id'] : null;
    }
    return $row;
}

function attach_images(int $itemId, array $user): void
{
    $files = uploaded_files('images');
    if (!$files) {
        return;
    }
    $existing = (int) val('SELECT COUNT(*) FROM item_images WHERE item_id = ?', [$itemId]);
    $max = (int) setting('max_images_item');
    if ($existing + count($files) > $max) {
        throw new HttpError("You can add at most $max photos per item");
    }
    $sort = (int) val('SELECT COALESCE(MAX(sort), -1) + 1 FROM item_images WHERE item_id = ?', [$itemId]);
    $stored = [];
    try {
        foreach ($files as $file) {
            [$path, $thumb, $bytes, $tbytes, $w, $h] = store_image($file, $user);
            $stored[] = $path;
            $stored[] = $thumb;
            insert('item_images', [
                'item_id' => $itemId, 'user_id' => $user['id'], 'path' => $path, 'thumb' => $thumb,
                'size_bytes' => $bytes, 'thumb_bytes' => $tbytes, 'width' => $w, 'height' => $h,
                'sort' => $sort++, 'created_at' => now(),
            ]);
        }
    } catch (Throwable $e) {
        // Rows may be rolled back by the caller, so remove the files written in this call.
        delete_files(...$stored);
        throw $e;
    }
}

function items_create(): array
{
    $u = current_user();
    if ((int) val('SELECT COUNT(*) FROM items WHERE user_id = ?', [$u['id']]) >= 3000) {
        throw new HttpError('Item limit reached (3000)');
    }
    $row = item_fields(true) + ['user_id' => $u['id'], 'created_at' => now(), 'updated_at' => now()];
    db()->beginTransaction();
    try {
        $id = insert('items', $row);
        attach_images($id, $u);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return item_payload(own_item($id));
}

function items_update(string $id): array
{
    $u = current_user();
    $item = own_item((int) $id);
    $row = item_fields(false);
    $row['updated_at'] = now();
    update('items', (int) $item['id'], $row);

    $remove = input()['remove_images'] ?? [];
    if (is_string($remove)) {
        $remove = array_filter(explode(',', $remove));
    }
    if ($remove) {
        $ids = array_map('intval', (array) $remove);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        delete_image_rows(all(
            "SELECT id, path, thumb FROM item_images WHERE item_id = ? AND id IN ($marks)",
            [$item['id'], ...$ids]
        ));
    }
    attach_images((int) $item['id'], $u);

    $cover = (int) (input()['cover_image_id'] ?? 0);
    if ($cover) {
        q('UPDATE item_images SET sort = sort + 1 WHERE item_id = ?', [$item['id']]);
        q('UPDATE item_images SET sort = 0 WHERE item_id = ? AND id = ?', [$item['id'], $cover]);
    }
    return item_payload(own_item((int) $item['id']));
}

function items_wear(string $id): array
{
    $item = own_item((int) $id);
    q(
        'UPDATE items SET wear_count = wear_count + 1, last_worn_at = ?, updated_at = ? WHERE id = ?',
        [now(), now(), $item['id']]
    );
    return item_payload(own_item((int) $item['id']));
}

function items_delete(string $id): array
{
    $item = own_item((int) $id);
    delete_image_rows(all('SELECT id, path, thumb FROM item_images WHERE item_id = ?', [$item['id']]));
    q('UPDATE chat_messages SET item_id = NULL WHERE item_id = ?', [$item['id']]);
    q('DELETE FROM items WHERE id = ?', [$item['id']]);
    return ['ok' => true];
}

function my_stats(): array
{
    $u = current_user();
    $byStatus = [];
    foreach (all('SELECT status, COUNT(*) AS c FROM items WHERE user_id = ? GROUP BY status', [$u['id']]) as $r) {
        $byStatus[$r['status']] = (int) $r['c'];
    }
    $tags = [];
    foreach (all("SELECT tags FROM items WHERE user_id = ? AND tags <> ''", [$u['id']]) as $r) {
        foreach (tags_array($r['tags']) as $t) {
            $tags[$t] = ($tags[$t] ?? 0) + 1;
        }
    }
    arsort($tags);
    return [
        'items'     => array_sum($byStatus),
        'by_status' => $byStatus,
        'images'    => (int) val('SELECT COUNT(*) FROM item_images WHERE user_id = ?', [$u['id']]),
        'storage'   => ['used' => user_storage_bytes((int) $u['id']), 'quota_mb' => user_quota_mb($u)],
        'tags'      => $tags,
    ];
}
