<?php
declare(strict_types=1);

const IMAGE_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
];

/** Normalises $_FILES[$field] (single or multiple) into a flat list. */
function uploaded_files(string $field): array
{
    $f = $_FILES[$field] ?? null;
    if (!$f) {
        return [];
    }
    if (!is_array($f['name'])) {
        return $f['error'] === UPLOAD_ERR_NO_FILE ? [] : [$f];
    }
    $list = [];
    foreach ($f['name'] as $i => $name) {
        if ($f['error'][$i] === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $list[] = [
            'name'     => $name,
            'type'     => $f['type'][$i],
            'tmp_name' => $f['tmp_name'][$i],
            'error'    => $f['error'][$i],
            'size'     => $f['size'][$i],
        ];
    }
    return $list;
}

/**
 * Validates and stores one uploaded image for a user, plus a small thumbnail.
 * Returns [path, thumb, size_bytes, thumb_bytes, width, height] with paths relative to /public.
 */
function store_image(array $file, array $user, int $thumbMax = 420, bool $countQuota = true): array
{
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new HttpError($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE
            ? 'Image is too large'
            : 'Image upload failed');
    }
    $maxBytes = (int) setting('max_upload_mb') * 1024 * 1024;
    if ($file['size'] > $maxBytes) {
        throw new HttpError('Image is larger than ' . setting('max_upload_mb') . ' MB');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
    if (!isset(IMAGE_TYPES[$mime])) {
        throw new HttpError('Only JPG, PNG, WEBP or GIF images are allowed');
    }
    $info = @getimagesize($file['tmp_name']);
    if (!$info) {
        throw new HttpError('That file is not a valid image');
    }
    if ($countQuota) {
        $quota = user_quota_mb($user) * 1024 * 1024;
        if (user_storage_bytes((int) $user['id']) + $file['size'] > $quota) {
            throw new HttpError('Storage full! Your limit is ' . user_quota_mb($user) . ' MB. Delete some photos or ask admin.');
        }
    }

    $dir = 'uploads/u' . (int) $user['id'];
    if (!is_dir(PUBLIC_DIR . '/' . $dir) && !mkdir(PUBLIC_DIR . '/' . $dir, 0755, true)) {
        throw new HttpError('Server cannot save images (uploads folder not writable)', 500);
    }
    $name = bin2hex(random_bytes(12));
    $path = "$dir/$name." . IMAGE_TYPES[$mime];
    if (!move_uploaded_file($file['tmp_name'], PUBLIC_DIR . '/' . $path)) {
        throw new HttpError('Could not save the image', 500);
    }

    $thumb = $path;
    $thumbBytes = 0;
    $made = make_thumbnail(PUBLIC_DIR . '/' . $path, PUBLIC_DIR . "/$dir/t_$name.jpg", $thumbMax, $mime);
    if ($made) {
        $thumb = "$dir/t_$name.jpg";
        $thumbBytes = (int) filesize(PUBLIC_DIR . '/' . $thumb);
    }
    return [$path, $thumb, (int) filesize(PUBLIC_DIR . '/' . $path), $thumbBytes, (int) $info[0], (int) $info[1]];
}

function make_thumbnail(string $src, string $dest, int $max, string $mime): bool
{
    if (!function_exists('imagecreatefromstring') || $mime === 'image/gif') {
        return false;
    }
    $img = @imagecreatefromstring((string) file_get_contents($src));
    if (!$img) {
        return false;
    }
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($src);
        $angle = [3 => 180, 6 => -90, 8 => 90][$exif['Orientation'] ?? 1] ?? 0;
        if ($angle) {
            $img = imagerotate($img, $angle, 0);
        }
    }
    $w = imagesx($img);
    $h = imagesy($img);
    $scale = min(1, $max / max($w, $h));
    $tw = max(1, (int) round($w * $scale));
    $th = max(1, (int) round($h * $scale));
    $out = imagecreatetruecolor($tw, $th);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $tw, $th, $w, $h);
    $ok = imagejpeg($out, $dest, 78);
    imagedestroy($img);
    imagedestroy($out);
    return $ok;
}

function delete_files(string ...$paths): void
{
    foreach (array_unique(array_filter($paths)) as $p) {
        if (!str_starts_with($p, 'uploads/') || str_contains($p, '..')) {
            continue;
        }
        $full = PUBLIC_DIR . '/' . $p;
        if (is_file($full)) {
            @unlink($full);
        }
    }
}

function delete_image_rows(array $images): void
{
    foreach ($images as $img) {
        delete_files($img['path'], $img['thumb']);
        q('DELETE FROM item_images WHERE id = ?', [$img['id']]);
    }
}

/** Removes a user's files and rows. */
function delete_user_completely(int $userId): void
{
    $u = one('SELECT avatar FROM users WHERE id = ?', [$userId]);
    delete_image_rows(all('SELECT id, path, thumb FROM item_images WHERE user_id = ?', [$userId]));
    if ($u && $u['avatar']) {
        delete_files($u['avatar']);
    }
    q('DELETE FROM chat_messages WHERE user_id = ?', [$userId]);
    q('DELETE FROM items WHERE user_id = ?', [$userId]);
    q('DELETE FROM locations WHERE user_id = ?', [$userId]);
    q('DELETE FROM tokens WHERE user_id = ?', [$userId]);
    q('DELETE FROM users WHERE id = ?', [$userId]);
    @rmdir(UPLOAD_DIR . '/u' . $userId);
}
