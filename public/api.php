<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';
require ROOT . '/app/http.php';
require ROOT . '/app/uploads.php';
require ROOT . '/app/api/auth.php';
require ROOT . '/app/api/items.php';
require ROOT . '/app/api/community.php';
require ROOT . '/app/api/admin.php';

cors();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const ROUTES = [
    ['GET',    'meta',                   'api_meta'],
    ['POST',   'auth/register',          'auth_register'],
    ['POST',   'auth/login',             'auth_login'],
    ['POST',   'auth/logout',            'auth_logout'],
    ['GET',    'auth/me',                'auth_me'],
    ['POST',   'profile',                'profile_update'],
    ['POST',   'profile/avatar',         'profile_avatar'],
    ['POST',   'profile/password',       'profile_password'],
    ['POST',   'profile/delete',         'profile_delete'],
    ['GET',    'stats',                  'my_stats'],

    ['GET',    'locations',              'locations_list'],
    ['POST',   'locations',              'locations_create'],
    ['POST',   'locations/(\d+)',        'locations_update'],
    ['DELETE', 'locations/(\d+)',        'locations_delete'],

    ['GET',    'items',                  'items_list'],
    ['POST',   'items',                  'items_create'],
    ['GET',    'items/(\d+)',            'items_show'],
    ['POST',   'items/(\d+)',            'items_update'],
    ['POST',   'items/(\d+)/wear',       'items_wear'],
    ['DELETE', 'items/(\d+)',            'items_delete'],

    ['GET',    'chat',                   'chat_list'],
    ['POST',   'chat',                   'chat_send'],
    ['DELETE', 'chat/(\d+)',             'chat_delete'],
    ['GET',    'community/wardrobes',    'community_wardrobes'],
    ['GET',    'community/feed',         'community_feed'],
    ['GET',    'community/users/(\d+)',  'community_profile'],
    ['GET',    'community/items/(\d+)',  'community_item'],

    ['GET',    'admin/stats',            'admin_stats'],
    ['GET',    'admin/users',            'admin_users'],
    ['GET',    'admin/users/(\d+)',      'admin_user_show'],
    ['POST',   'admin/users/(\d+)',      'admin_user_update'],
    ['DELETE', 'admin/users/(\d+)',      'admin_user_delete'],
    ['GET',    'admin/images',           'admin_images'],
    ['DELETE', 'admin/images/(\d+)',     'admin_image_delete'],
    ['GET',    'admin/chat',             'admin_chat'],
    ['DELETE', 'admin/chat/(\d+)',       'admin_chat_delete'],
    ['GET',    'admin/settings',         'admin_settings'],
    ['POST',   'admin/settings',         'admin_settings_save'],
    ['GET',    'admin/storage',          'admin_storage_scan'],
];

try {
    if (!is_installed()) {
        throw new HttpError('Wardrobe is not installed yet. Open install.php on the server.', 503);
    }
    $route = trim((string) ($_GET['r'] ?? ''), '/');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $pathMatched = false;
    foreach (ROUTES as [$m, $pattern, $handler]) {
        if (!preg_match('#^' . $pattern . '$#', $route, $args)) {
            continue;
        }
        $pathMatched = true;
        if ($m === $method) {
            json_out($handler(...array_slice($args, 1)));
        }
    }
    throw new HttpError($pathMatched ? 'Method not allowed' : 'Not found', $pathMatched ? 405 : 404);
} catch (HttpError $e) {
    json_out(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[wardrobe] ' . $e);
    $debug = (bool) (config()['debug'] ?? false);
    json_out(['error' => $debug ? $e->getMessage() : 'Something went wrong on the server'], 500);
}
