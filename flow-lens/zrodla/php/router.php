<?php
// flow-lens: router dla wbudowanego serwera PHP (php -S, `php artisan serve`). Skrypt routera NIE dostaje
// auto_prepend_file, więc hak ładujemy tu sam, a potem oddajemy żądanie właściwemu routerowi:
//   php -S 0.0.0.0:8000 -t public /flowlens/router.php                 (FLOWLENS_ROUTER = router aplikacji, opcjonalnie)
//   Laravel: zamontuj jako <app>/server.php — ServeCommand bierze base_path('server.php'), jeśli istnieje.
// Plik statyczny: return false, serwer poda go sam (a wtedy auto_prepend_file już działa).
$sciezka = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '');
if ($sciezka !== '/' && is_file(getcwd() . $sciezka)) return false;

// router bywa montowany gdzie indziej (np. /app/server.php): hak z auto_prepend_file, inaczej obok routera
if (!class_exists('FlowlensDiag', false)) require (ini_get('auto_prepend_file') ?: __DIR__ . '/flowlens.php');

$router = getenv('FLOWLENS_ROUTER') ?: (get_cfg_var('FLOWLENS_ROUTER') ?: null);
$laravel = dirname(getcwd()) . '/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php';
if ($router) return require $router;
if (is_file($laravel)) return require $laravel;
// php -S wypisuje linię dostępu („[200]: POST /login/check”) tylko dla skryptów, które wykonuje sam; żądanie obsłużone
// przez router jej nie ma (dlatego server.php Laravela pisze ją sam). Bez routera flow-lens index.php dostałby ją od
// serwera — dopisujemy ją w jego formacie (z [pid] przy PHP_CLI_SERVER_WORKERS), ze statusem z końca żądania.
register_shutdown_function(static function () {
    $kod = http_response_code();
    file_put_contents('php://stderr', sprintf("%s[%s %2d %s] %s:%s [%d]: %s %s\n",
        (int) getenv('PHP_CLI_SERVER_WORKERS') > 1 ? '[' . getmypid() . '] ' : '', date('D M'), (int) date('j'), date('H:i:s Y'),
        $_SERVER['REMOTE_ADDR'] ?? '-', $_SERVER['REMOTE_PORT'] ?? '0', $kod === false ? 200 : $kod,
        $_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/'));
});
require getcwd() . '/index.php';
