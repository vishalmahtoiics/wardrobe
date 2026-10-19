<?php
declare(strict_types=1);

function api_meta(): array
{
    return [
        'app_name'       => setting('app_name'),
        'allow_register' => setting('allow_register') === '1',
        'chat_enabled'   => setting('chat_enabled') === '1',
        'max_upload_mb'  => (int) setting('max_upload_mb'),
        'max_images'     => (int) setting('max_images_item'),
        'welcome_note'   => setting('welcome_note'),
        'rooms'          => CHAT_ROOMS,
        'themes'         => THEMES,
    ];
}

function auth_register(): array
{
    if (setting('allow_register') !== '1') {
        throw new HttpError('New registrations are closed right now');
    }
    $name = str_in('name', 80);
    $email = strtolower(str_in('email', 190));
    $password = (string) (input()['password'] ?? '');
    $gender = str_in('gender', 10, 'other');

    if (mb_strlen($name) < 2) {
        throw new HttpError('Please enter your name');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new HttpError('Please enter a valid email');
    }
    if (strlen($password) < 6) {
        throw new HttpError('Password must be at least 6 characters');
    }
    if (!in_array($gender, GENDERS, true)) {
        $gender = 'other';
    }
    if (val('SELECT id FROM users WHERE email = ?', [$email])) {
        throw new HttpError('This email is already registered. Please login.');
    }
    $id = insert('users', [
        'name'          => $name,
        'email'         => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'gender'        => $gender,
        'role'          => 'user',
        'status'        => 'active',
        'visibility'    => 'private',
        'theme'         => $gender === 'female' ? 'rose' : 'teak',
        'created_at'    => now(),
        'last_seen_at'  => now(),
    ]);
    create_default_locations($id);

    return ['token' => issue_token($id), 'user' => user_out(one('SELECT * FROM users WHERE id = ?', [$id]), true)];
}

function create_default_locations(int $userId): void
{
    foreach ([['Ghar', '🏠'], ['Flat', '🏢']] as $i => [$name, $emoji]) {
        insert('locations', [
            'user_id' => $userId, 'name' => $name, 'emoji' => $emoji, 'sort' => $i, 'created_at' => now(),
        ]);
    }
}

function auth_login(): array
{
    $email = strtolower(str_in('email', 190));
    $password = (string) (input()['password'] ?? '');
    $u = one('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$u || !password_verify($password, $u['password_hash'])) {
        usleep(400000);
        throw new HttpError('Email or password is wrong', 401);
    }
    if ($u['status'] !== 'active') {
        throw new HttpError('Your account is blocked. Contact admin.', 403);
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    q('UPDATE users SET last_seen_at = ? WHERE id = ?', [now(), $u['id']]);
    return ['token' => issue_token((int) $u['id']), 'user' => user_out($u, true)];
}

function auth_logout(): array
{
    $token = auth_token();
    if ($token) {
        q('DELETE FROM tokens WHERE token_hash = ?', [hash('sha256', $token)]);
    }
    return ['ok' => true];
}

function auth_me(): array
{
    $u = current_user();
    return [
        'user'    => user_out($u, true),
        'storage' => ['used' => user_storage_bytes((int) $u['id']), 'quota_mb' => user_quota_mb($u)],
    ];
}

function profile_update(): array
{
    $u = current_user();
    $row = [];
    if (has_in('name')) {
        $name = str_in('name', 80);
        if (mb_strlen($name) < 2) {
            throw new HttpError('Name is too short');
        }
        $row['name'] = $name;
    }
    if (has_in('gender') && in_array(str_in('gender'), GENDERS, true)) {
        $row['gender'] = str_in('gender');
    }
    if (has_in('bio')) {
        $row['bio'] = str_in('bio', 300);
    }
    if (has_in('theme') && in_array(str_in('theme'), THEMES, true)) {
        $row['theme'] = str_in('theme');
    }
    if (has_in('visibility') && in_array(str_in('visibility'), VISIBILITIES, true)) {
        $row['visibility'] = str_in('visibility');
    }
    update('users', (int) $u['id'], $row);
    return ['user' => user_out(one('SELECT * FROM users WHERE id = ?', [$u['id']]), true)];
}

function profile_avatar(): array
{
    $u = current_user();
    $files = uploaded_files('avatar');
    if (!$files) {
        throw new HttpError('Choose a photo');
    }
    [$path, $thumb] = store_image($files[0], $u, 256, false);
    if ($thumb !== $path) {
        delete_files($path);
    }
    if ($u['avatar']) {
        delete_files($u['avatar']);
    }
    q('UPDATE users SET avatar = ? WHERE id = ?', [$thumb, $u['id']]);
    return ['avatar' => $thumb];
}

function profile_password(): array
{
    $u = current_user();
    $current = (string) (input()['current'] ?? '');
    $new = (string) (input()['password'] ?? '');
    if (!password_verify($current, $u['password_hash'])) {
        throw new HttpError('Current password is wrong');
    }
    if (strlen($new) < 6) {
        throw new HttpError('New password must be at least 6 characters');
    }
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    q('DELETE FROM tokens WHERE user_id = ? AND id <> ?', [$u['id'], $u['token_id']]);
    return ['ok' => true];
}

function profile_delete(): array
{
    $u = current_user();
    if (!password_verify((string) (input()['password'] ?? ''), $u['password_hash'])) {
        throw new HttpError('Password is wrong');
    }
    if ($u['role'] === 'superadmin' && (int) val("SELECT COUNT(*) FROM users WHERE role = 'superadmin'") <= 1) {
        throw new HttpError('You are the only Super Admin, this account cannot be deleted');
    }
    delete_user_completely((int) $u['id']);
    return ['ok' => true];
}
