<?php
// flow-lens (PHP): hak przed każdym skryptem/żądaniem (auto_prepend_file). Wymaga rozszerzenia opentelemetry
// (funkcja OpenTelemetry\Instrumentation\hook) — bez zmian w kodzie aplikacji.
//
// - FLOWLENS_DIAG=<katalog>: log diagnostyczny (format zrodla/diag.mjs): metody klas z mapy (in/out, wyjątek),
//   granice żądania HTTP (szablon trasy z routera Laravela albo Symfony; procedura JSON-RPC jako rpc.method),
//   PDO i mysqli (SQL z parametrami tak, jak dostała je baza; transakcje), inne systemy (Guzzle, curl, SOAP, RabbitMQ).
//   Granice poza HTTP:
//     • komenda CLI (artisan, bin/console, dowolny skrypt) — jeden przebieg na całe wykonanie skryptu
//       („Command <nazwa>”, z bootstrapem frameworka), wejście zapisywane przy pierwszym zdarzeniu;
//     • worker (queue:work, messenger:consume, serve…) — przebieg tylko na job: od Worker::process Laravela
//       (deserializacja joba → handle → usunięcie z kolejki) albo Worker::handleMessage Messengera (→ ack);
//       poza jobem (odpytywanie kolejki, bootstrap) nic nie zapisujemy.
// - bez FLOWLENS_DIAG, z OTel (OTEL_PHP_AUTOLOAD_ENABLED=true): spany metod klas z mapy (code.namespace =
//   klasa z mapy) — resztę (HTTP, PDO, Guzzle) daje auto-instrumentacja. Do tego te same granice co w logu
//   diagnostycznym tam, gdzie auto-instrumentacja ich nie daje: span-korzeń „Command <nazwa>” procesu CLI
//   i szablon trasy Symfony („PUT /courses/{id}” zamiast nazwy trasy „courses_put”).
// Ustawienia: zmienne środowiskowe albo wpisy php.ini o tych samych nazwach (np. `php artisan serve` czyści
// środowisko workerów). FLOWLENS_MAPA = ścieżka do .flow-lens/mapa.json (klasy z kropkami: App.Magazyn.Magazyn → App\Magazyn\Magazyn).

if (!function_exists('OpenTelemetry\Instrumentation\hook')) return;

final class FlowlensDiag
{
    public const NAGLOWEK = 'X-Flowlens-Kor';    // korelacja niesiona przez HTTP między procesami z hakiem
    public static ?string $katalog = null;
    public static $plik = null;
    public static int $sek = 0;
    public static int $id = 0;
    public static ?string $kor = null;
    public static array $stos = [];          // [id] otwartych wywołań w tym procesie (0 = wywołanie bez zapisu)
    public static array $par = [];           // spl_object_id(PDOStatement) → [nr => [wartość, typ PDO::PARAM_*]]
    public static array $bazy = [];          // spl_object_id(PDO albo PDOStatement) → nazwa bazy (dbname z DSN)
    public static ?string $trasa = null;
    public static array $atrybuty = [];      // atrybuty wejścia (rpc.method) — na zamknięciu korzenia
    public static ?float $t0 = null;
    public static float $n0 = 0;
    public static bool $tylkoGranice = false; // worker: zapis tylko w granicach joba
    public static ?array $korzen = null;      // odłożone wejście procesu CLI: id, ts, wejscie, zapisane
    public static ?int $granica = null;       // id korzenia otwartego joba (worker)
    public static array $granice = [];        // stos haków granic: czy otworzyły przebieg
    public static ?array $bufor = null;       // linie granicy odroczonej (pobranie z kolejki: zapis tylko, gdy był job)

    public static function ts(): float
    {
        return round(self::$t0 + (hrtime(true) - self::$n0) / 1e6, 3);
    }

    public static function pisz(string $ev, array $pola, ?float $ts = null): void
    {
        if (self::$tylkoGranice && self::$kor === null) return;      // worker poza jobem
        if (self::$plik === null) {
            @mkdir(self::$katalog, 0777, true);
            self::$plik = @fopen(self::$katalog . '/' . getmypid() . '.jsonl', 'a');
            if (!self::$plik) return;
        }
        // wejście procesu CLI dopiero przy pierwszym zdarzeniu (proces bez pracy w mapie nie daje pustego przebiegu)
        if (self::$korzen && !self::$korzen['zapisane']) {
            self::$korzen['zapisane'] = true;
            self::pisz('in', ['id' => self::$korzen['id'], 'klasa' => 'cli', 'metoda' => self::$korzen['metoda'], 'wejscie' => self::$korzen['wejscie']], self::$korzen['ts']);
        }
        $rodzic = end(self::$stos);
        $z = ['v' => 1, 'ts' => $ts ?? self::ts(), 'pid' => getmypid(), 'w' => 'main', 'kor' => self::$kor, 'sek' => ++self::$sek, 'ev' => $ev]
            + ($rodzic && !isset($pola['id']) ? ['rodzic' => $rodzic] : []) + $pola;
        $linia = json_encode($z, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR) . "\n";
        if (self::$bufor !== null) { self::$bufor[] = $linia; return; }
        @fwrite(self::$plik, $linia);
    }

    public static function nowyKor(): string
    {
        return self::$kor = 'k-' . getmypid() . '-' . bin2hex(random_bytes(4));
    }

    public static function wejdz(string $klasa, string $metoda, ?array $wejscie = null): void
    {
        if (self::$kor === null) {
            if (self::$tylkoGranice && !$wejscie) { self::$stos[] = 0; return; }   // worker poza jobem: bez zapisu
            self::nowyKor();
            $wejscie ??= ['rodzaj' => PHP_SAPI === 'cli' ? 'job' : 'wywolanie', 'nazwa' => substr(strrchr('.' . $klasa, '.'), 1) . '.' . $metoda];
        } elseif (self::$stos) $wejscie = null;                      // wejście tylko na pustym stosie (kor z nagłówka)
        $id = ++self::$id;
        $rodzic = end(self::$stos);
        self::pisz('in', ['id' => $id, 'klasa' => $klasa, 'metoda' => $metoda] + ($rodzic ? ['rodzic' => $rodzic] : []) + ($wejscie ? ['wejscie' => $wejscie] : []));
        self::$stos[] = $id;
    }

    public static function wyjdz(string $klasa, string $metoda, ?\Throwable $e = null, array $reszta = []): void
    {
        $id = array_pop(self::$stos);
        if (!$id) return;                                            // wywołanie bez zapisu (worker poza jobem)
        $rodzic = end(self::$stos);
        self::pisz('out', ['id' => $id, 'klasa' => $klasa, 'metoda' => $metoda] + ($rodzic ? ['rodzic' => $rodzic] : [])
            + ($e ? ['blad' => get_class($e) . ': ' . substr($e->getMessage(), 0, 300)] : []) + $reszta);
        if ($id === self::$granica) { self::$kor = null; self::$granica = null; }
    }

    // granica joba w workerze (hak pre/post): otwiera przebieg tylko poza innym przebiegiem
    public static function granicaOd(string $klasa, string $metoda, array $wejscie): void
    {
        if (self::$kor !== null || !self::$tylkoGranice) { self::$granice[] = false; return; }
        self::$atrybuty = [];
        self::wejdz($klasa, $metoda, $wejscie);
        self::$granica = end(self::$stos);
        self::$granice[] = true;
    }

    // granica odroczona: zdarzenia w buforze, o zapisie decyduje koniec (pobranie z kolejki bez joba to szum)
    public static function granicaOdroczona(string $klasa, string $metoda, array $wejscie): void
    {
        if (self::$kor !== null || !self::$tylkoGranice) { self::$granice[] = false; return; }
        self::$bufor = [];
        self::granicaOd($klasa, $metoda, $wejscie);
    }

    public static function granicaOdroczonaDo(string $klasa, string $metoda, bool $zapisz, ?\Throwable $e, array $atrybuty = []): void
    {
        if (end(self::$granice) !== true) { array_pop(self::$granice); return; }
        if (!$zapisz) {                                              // pusto: przebieg wycofany
            array_pop(self::$granice);
            while (self::$stos && end(self::$stos) !== self::$granica) array_pop(self::$stos);
            array_pop(self::$stos);
            self::$bufor = null; self::$kor = null; self::$granica = null; self::$atrybuty = [];
            return;
        }
        self::granicaDo($klasa, $metoda, $e, $atrybuty);
        $linie = self::$bufor ?? [];
        self::$bufor = null;
        if (self::$plik) foreach ($linie as $l) @fwrite(self::$plik, $l);
    }

    public static function granicaDo(string $klasa, string $metoda, ?\Throwable $e, array $atrybuty = []): void
    {
        if (!array_pop(self::$granice)) return;
        while (self::$stos && end(self::$stos) !== self::$granica) self::wyjdz('?', '?');
        $atr = array_filter($atrybuty + self::$atrybuty, static fn ($v) => $v !== null);
        self::wyjdz($klasa, $metoda, $e, $atr ? ['atrybuty' => $atr] : []);
        self::$atrybuty = [];
    }

    // wartość parametru tak, jak trafia do bazy: PDO dla PARAM_STR zamienia wartość na tekst (false → '', true → '1'),
    // dla PARAM_INT bool na liczbę, dla PARAM_BOOL liczbę na bool; NULL zostaje NULL (pdo_stmt.c, really_register_bound_param)
    public static function wartoscPdo($v, int $typ = \PDO::PARAM_STR)
    {
        $typ &= 0xFFFF;                                              // bez flag (PARAM_INPUT_OUTPUT, PARAM_STR_NATL)
        if ($v === null || $typ === \PDO::PARAM_NULL) return null;
        if (is_resource($v)) return '[lob]';
        if ($typ === \PDO::PARAM_STR && is_scalar($v)) return (string) $v;
        if ($typ === \PDO::PARAM_INT && is_bool($v)) return (int) $v;
        if ($typ === \PDO::PARAM_BOOL && is_int($v)) return (bool) $v;
        return $v;
    }

    public static function literal($v): string
    {
        if ($v === null) return 'NULL';
        if (is_bool($v)) return $v ? 'true' : 'false';
        if (is_int($v) || is_float($v)) return (string) $v;
        if ($v instanceof \DateTimeInterface) $v = $v->format('Y-m-d H:i:s');
        if (is_array($v) || (is_object($v) && !method_exists($v, '__toString'))) return '?';
        return "'" . str_replace("'", "''", substr((string) $v, 0, 200)) . "'";
    }

    public static function zWartosciami(string $sql, array $par): string
    {
        if (!$par) return $sql;
        $i = 0;
        return preg_replace_callback('/\?|:(\w+)/', function ($m) use (&$i, $par) {
            if ($m[0] === '?') { $i++; return array_key_exists($i, $par) ? self::literal($par[$i]) : (array_key_exists($i - 1, $par) ? self::literal($par[$i - 1]) : '?'); }
            return array_key_exists($m[1], $par) ? self::literal($par[$m[1]]) : (array_key_exists(':' . $m[1], $par) ? self::literal($par[':' . $m[1]]) : $m[0]);
        }, $sql);
    }

    // parametry wykonania: execute($tablica) wiąże wszystko jako PARAM_STR, bindValue — z podanym typem
    public static function parametry(int $id, $tablica): array
    {
        if (is_array($tablica) && $tablica) {
            $par = array_is_list($tablica) ? array_combine(range(1, count($tablica)), $tablica) : $tablica;
            return array_map(static fn ($v) => self::wartoscPdo($v), $par);
        }
        return array_map(static fn ($p) => self::wartoscPdo($p[0], $p[1]), self::$par[$id] ?? []);
    }

    // szablon ścieżki trasy Symfony: z skompilowanego generatora (cache, tanio), inaczej z kolekcji tras
    public static function sciezkaSymfony($router, string $nazwa): ?string
    {
        try {
            $gen = method_exists($router, 'getGenerator') ? $router->getGenerator() : null;
            $skompilowane = $gen ? (\Closure::bind(fn () => $this->compiledRoutes ?? null, $gen, get_class($gen)))() : null;
            if (is_array($skompilowane) && isset($skompilowane[$nazwa][3])) {
                $s = '';
                foreach ($skompilowane[$nazwa][3] as $t) $s = $t[0] === 'variable' ? $t[1] . '{' . $t[3] . '}' . $s : $t[1] . $s;
                return $s === '' ? '/' : $s;
            }
            $trasa = method_exists($router, 'getRouteCollection') ? $router->getRouteCollection()->get($nazwa) : null;
            return $trasa ? $trasa->getPath() : null;
        } catch (\Throwable) {
            return null;
        }
    }
}

// Proces CLI: komenda (nazwa jak w OTel Laravela: „Command sklep:porzadki”) i rozpoznanie workera
final class FlowlensCli
{
    // komendy, które obsługują wiele jobów / żądań w jednym procesie — przebiegi tylko w granicach
    public const WORKER = '/^(queue:(work|listen)|horizon(:work)?|messenger:consume|serve|schedule:work|octane:\w+|reverb:start)$/';

    public static function argumenty(): array
    {
        $argv = $_SERVER['argv'] ?? [];
        $komenda = null;
        foreach (array_slice($argv, 1) as $a) if (!str_starts_with((string) $a, '-')) { $komenda = (string) $a; break; }
        return [basename((string) ($argv[0] ?? 'php')), $komenda];
    }

    public static function worker(): bool
    {
        [, $komenda] = self::argumenty();
        return PHP_SAPI === 'cli' && $komenda !== null && (bool) preg_match(self::WORKER, $komenda);
    }

    public static function nazwa(): string
    {
        [$skrypt, $komenda] = self::argumenty();
        // konsola (artisan, bin/console, ./cli) albo nazwa w stylu „grupa:komenda” — „Command <nazwa>”
        if ($komenda !== null && (preg_match('/^(artisan|console|cli)$/', $skrypt) || preg_match('/^[\w.-]+(:[\w.-]+)+$/', $komenda))) return "Command $komenda";
        return trim("$skrypt " . ($komenda ?? ''));
    }
}

// metody, które nie są przebiegiem domenowym: autoloadery (spl_autoload_register) — wołane przy pierwszym użyciu
// klasy, więc zależne od tego, co załadowało się wcześniej (np. SDK OTel), a nie od logiki
function flowlens_pomin_metode(string $met): bool
{
    return (bool) preg_match('/^(autoload|autoloader|loadClass|registerAutoload(er)?|unregisterAutoload(er)?)$/i', $met);
}

(function () {
    // zmienna środowiskowa albo wpis php.ini o tej samej nazwie (serwery czyszczące środowisko workerów)
    $ustawienie = static fn (string $n) => getenv($n) ?: (get_cfg_var($n) ?: null);
    $mapa = $ustawienie('FLOWLENS_MAPA');
    $diag = $ustawienie('FLOWLENS_DIAG');
    $klasy = [];
    if ($mapa && is_readable($mapa)) {
        $m = json_decode(file_get_contents($mapa), true);
        foreach (($m['klasy'] ?? []) as $fqn => $k) {
            if (!in_array($k['rola'] ?? '', ['wejscie', 'aplikacja', 'domena', 'repozytorium', 'zewnetrzne'], true) || empty($k['metody'])) continue;
            if (!str_ends_with($k['plik'] ?? '', '.php') && !preg_match('/\.php:\d+$/', $k['plik'] ?? '')) continue;
            $metody = array_values(array_filter($k['metody'], static fn ($met) => !flowlens_pomin_metode((string) $met)));
            if ($metody) $klasy[$fqn] = $metody;
        }
    }
    $hook = 'OpenTelemetry\Instrumentation\hook';
    $cliKomenda = PHP_SAPI === 'cli' && !FlowlensCli::worker();

    // szablon trasy Symfony z routera (RouterListener woła Router::matchRequest, inne miejsca — match):
    // nazwa trasy z wyniku (_route), ścieżka z trasy o tej nazwie; pierwsze dopasowanie = żądanie główne
    $trasaSymfony = null;
    if (PHP_SAPI !== 'cli') {
        foreach (['matchRequest', 'match'] as $fn) {
            $hook('Symfony\Component\Routing\Router', $fn, post: static function ($router, array $p, $wynik) use (&$trasaSymfony) {
                if ($trasaSymfony !== null || !is_array($wynik) || !isset($wynik['_route'])) return;
                $trasaSymfony = FlowlensDiag::sciezkaSymfony($router, (string) $wynik['_route']);
                if ($trasaSymfony !== null && FlowlensDiag::$katalog !== null) FlowlensDiag::$trasa = $trasaSymfony;
            });
        }
    }

    if (!$diag) {
        // OTel: spany metod klas z mapy przez API OTel (SDK ładuje auto-instrumentacja), aktywne jako kontekst
        $korzen = null; $zakresKorzenia = null;
        // proces CLI (nie worker): jeden span-korzeń na całe wykonanie — otwierany przy pierwszej pracy (SDK jest
        // już załadowane), zamykany w funkcji shutdown zarejestrowanej tu, czyli przed flush SDK
        $zapewnijKorzen = static function () use ($cliKomenda, &$korzen, &$zakresKorzenia) {
            if (!$cliKomenda || $korzen || !class_exists('OpenTelemetry\API\Globals')) return;
            $korzen = \OpenTelemetry\API\Globals::tracerProvider()->getTracer('flowlens.metody')
                ->spanBuilder(FlowlensCli::nazwa())->setAttribute('flowlens.wejscie', 'job')->startSpan();
            $zakresKorzenia = \OpenTelemetry\Context\Context::storage()->attach($korzen->storeInContext(\OpenTelemetry\Context\Context::getCurrent()));
        };
        if ($cliKomenda) {
            register_shutdown_function(static function () use (&$korzen, &$zakresKorzenia) {
                if (!$korzen) return;
                try { $zakresKorzenia?->detach(); } catch (\Throwable) {}
                $korzen->end();
            });
            foreach (['__construct', 'exec', 'query', 'prepare', 'beginTransaction'] as $fn) $hook('PDO', $fn, pre: static fn () => $zapewnijKorzen());
        }
        foreach ($klasy as $fqn => $metody) {
            $php = str_replace('.', '\\', $fqn);
            foreach ($metody as $met) {
                $hook($php, $met,
                    pre: static function ($o, array $p, string $c, string $f) use ($fqn, $met, $zapewnijKorzen) {
                        if (!class_exists('OpenTelemetry\API\Globals')) return;
                        $zapewnijKorzen();
                        $span = \OpenTelemetry\API\Globals::tracerProvider()->getTracer('flowlens.metody')
                            ->spanBuilder(substr(strrchr('.' . $fqn, '.'), 1) . '.' . $met)
                            ->setAttribute('code.namespace', $fqn)->setAttribute('code.function', $met)->startSpan();
                        \OpenTelemetry\Context\Context::storage()->attach($span->storeInContext(\OpenTelemetry\Context\Context::getCurrent()));
                    },
                    post: static function ($o, array $p, $wynik, ?\Throwable $e) {
                        if (!class_exists('OpenTelemetry\API\Globals')) return;
                        $zakres = \OpenTelemetry\Context\Context::storage()->scope();
                        if (!$zakres) return;
                        $zakres->detach();
                        $span = \OpenTelemetry\API\Trace\Span::fromContext($zakres->context());
                        if ($e) { $span->recordException($e); $span->setStatus(\OpenTelemetry\API\Trace\StatusCode::STATUS_ERROR, $e->getMessage()); }
                        $span->end();
                    });
            }
        }
        // Symfony (auto-symfony): nazwa spana żądania i http.route z _route — to nazwa trasy („courses_put”), nie
        // szablon ścieżki. Hak auto-symfony czyta _route w post HttpKernel::terminate (po listenerach kernel.terminate),
        // więc po rozesłaniu TerminateEvent podmieniamy _route na szablon, a po terminate przywracamy (post-haki
        // idą w odwrotnej kolejności rejestracji — nasz, zarejestrowany pierwszy, jest ostatni)
        if (PHP_SAPI !== 'cli') {
            $podmiana = null;
            // zdarzenie z wyniku: `return $event` przenosi zmienną, więc w post-haku parametr jest już pusty
            $hook('Symfony\Contracts\EventDispatcher\EventDispatcherInterface', 'dispatch', post: static function ($d, array $p, $wynik) use (&$trasaSymfony, &$podmiana) {
                $ev = is_object($wynik) ? $wynik : ($p[0] ?? null);
                if ($trasaSymfony === null || $podmiana !== null || !is_object($ev) || !is_a($ev, 'Symfony\Component\HttpKernel\Event\TerminateEvent')) return;
                $atr = $ev->getRequest()->attributes;
                $podmiana = [$atr, $atr->get('_route')];
                $atr->set('_route', $trasaSymfony);
            });
            $hook('Symfony\Component\HttpKernel\HttpKernel', 'terminate', post: static function () use (&$podmiana) {
                if ($podmiana) { $podmiana[0]->set('_route', $podmiana[1]); $podmiana = null; }
            });
        }
        return;
    }

    FlowlensDiag::$katalog = $diag;
    FlowlensDiag::$t0 = microtime(true) * 1000;
    FlowlensDiag::$n0 = hrtime(true);

    // granice żądania HTTP (SAPI serwerowe); koniec z kodem odpowiedzi i szablonem trasy
    if (PHP_SAPI !== 'cli' && isset($_SERVER['REQUEST_METHOD'])) {
        $metoda = $_SERVER['REQUEST_METHOD'];
        $sciezka = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
        // żądanie od procesu z hakiem (Guzzle niesie X-Flowlens-Kor): ten sam przebieg co wołający
        if (preg_match('/^k-[\w-]{1,64}$/', (string) ($_SERVER['HTTP_X_FLOWLENS_KOR'] ?? ''))) FlowlensDiag::$kor = $_SERVER['HTTP_X_FLOWLENS_KOR'];
        FlowlensDiag::wejdz('http', $sciezka, ['rodzaj' => 'http', 'metoda' => $metoda, 'sciezka' => $sciezka, 'nazwa' => "$metoda $sciezka"]);
        // koniec żądania po wszystkich funkcjach shutdown aplikacji (zapis sesji OpenCart: Session\DB::write / gc
        // w shutdown z Session::__construct): funkcja zarejestrowana w trakcie shutdown wykonuje się na końcu kolejki
        register_shutdown_function(static fn () => register_shutdown_function(static function () use ($sciezka) {
            while (count(FlowlensDiag::$stos) > 1) FlowlensDiag::wyjdz('?', '?');
            $blad = error_get_last();
            FlowlensDiag::wyjdz('http', $sciezka, null, ['status' => http_response_code() ?: 200]
                + (FlowlensDiag::$trasa ? ['sciezka' => FlowlensDiag::$trasa] : [])
                + (FlowlensDiag::$atrybuty ? ['atrybuty' => FlowlensDiag::$atrybuty] : [])
                + ($blad && in_array($blad['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true) ? ['blad' => $blad['message']] : []));
        }));
        $hook('Illuminate\Routing\Router', 'findRoute', post: static function ($o, array $p, $trasa) {
            if (is_object($trasa) && method_exists($trasa, 'uri')) FlowlensDiag::$trasa = '/' . ltrim($trasa->uri(), '/');
        });
        // JSON-RPC (fguillot/json-rpc, np. Kanboard): wszystkie procedury pod jednym adresem — nazwa procedury
        $hook('JsonRPC\ProcedureHandler', 'executeProcedure', pre: static function ($o, array $p) {
            FlowlensDiag::$atrybuty['rpc.method'] ??= (string) ($p[0] ?? '');
        });
    } elseif (PHP_SAPI === 'cli' && !$cliKomenda) {
        // worker: przebiegi tylko w granicach joba
        FlowlensDiag::$tylkoGranice = true;
        // pobranie z kolejki (jak „receive <kolejka>” w auto-laravel): osobny przebieg tylko, gdy przyszedł job
        $hook('Illuminate\Queue\Worker', 'getNextJob',
            pre: static function ($w, array $p) {
                $q = $p[0] ?? null;
                $kolejka = '(anonymous)';
                try { if (is_object($q) && preg_match('/\\\\(Redis|Sqs|Beanstalkd)Queue$/', get_class($q)) && method_exists($q, 'getQueue')) $kolejka = (string) $q->getQueue($p[1] ?? null); } catch (\Throwable) {}
                FlowlensDiag::granicaOdroczona('Illuminate.Queue.Worker', 'getNextJob', ['rodzaj' => 'kolejka', 'nazwa' => "receive $kolejka"]);
            },
            post: static function ($w, array $p, $job, ?\Throwable $e) {
                $dane = [];
                try { $dane = is_object($job) && method_exists($job, 'payload') ? (array) $job->payload() : []; } catch (\Throwable) {}
                FlowlensDiag::granicaOdroczonaDo('Illuminate.Queue.Worker', 'getNextJob', is_object($job), $e, ['messaging.message.id' => $dane['uuid'] ?? $dane['id'] ?? null]);
            });
        $hook('Illuminate\Queue\Worker', 'process',
            pre: static function ($w, array $p) {
                $job = $p[1] ?? null;
                // nazwa jak w auto-laravel: „process <kolejka>”, kolejka znana tylko dla redis / sqs / beanstalkd
                $kolejka = is_object($job) && preg_match('/\\\\(Redis|Sqs|Beanstalkd)Job$/', get_class($job)) && method_exists($job, 'getQueue') ? (string) $job->getQueue() : '(anonymous)';
                FlowlensDiag::granicaOd('Illuminate.Queue.Worker', 'process', ['rodzaj' => 'kolejka', 'nazwa' => "process $kolejka"]);
            },
            post: static function ($w, array $p, $wynik, ?\Throwable $e) {
                $job = $p[1] ?? null;
                $dane = [];
                try { $dane = is_object($job) && method_exists($job, 'payload') ? (array) $job->payload() : []; } catch (\Throwable) {}
                FlowlensDiag::granicaDo('Illuminate.Queue.Worker', 'process', $e, ['messaging.message.id' => $dane['uuid'] ?? $dane['id'] ?? null,
                    'messaging.message.job_name' => $dane['displayName'] ?? $dane['job'] ?? null]);
            });
        $hook('Symfony\Component\Messenger\Worker', 'handleMessage',
            pre: static function ($w, array $p) {
                $env = $p[0] ?? null;
                $klasa = is_object($env) && method_exists($env, 'getMessage') ? get_class($env->getMessage()) : '?';
                FlowlensDiag::granicaOd('Symfony.Component.Messenger.Worker', 'handleMessage', ['rodzaj' => 'kolejka', 'nazwa' => "CONSUME $klasa"]);
            },
            post: static function ($w, array $p, $wynik, ?\Throwable $e) {
                $env = $p[0] ?? null;
                $id = null;
                try { $st = is_object($env) ? $env->last('Symfony\Component\Messenger\Stamp\TransportMessageIdStamp') : null; $id = $st ? (string) $st->getId() : null; } catch (\Throwable) {}
                FlowlensDiag::granicaDo('Symfony.Component.Messenger.Worker', 'handleMessage', $e, ['messaging.message.id' => $id, 'messaging.transport' => (string) ($p[1] ?? '')]);
            });
    } elseif ($cliKomenda) {
        // komenda / skrypt CLI: jeden przebieg na całe wykonanie (bootstrap frameworka, rejestracja komend i właściwa
        // praca pod jednym wejściem); wejście zapisuje się przy pierwszym zdarzeniu, zamyka w shutdown
        FlowlensDiag::nowyKor();
        $id = ++FlowlensDiag::$id;
        FlowlensDiag::$korzen = ['id' => $id, 'ts' => FlowlensDiag::ts(), 'metoda' => FlowlensCli::nazwa(), 'zapisane' => false,
            'wejscie' => ['rodzaj' => 'job', 'nazwa' => FlowlensCli::nazwa()]];
        FlowlensDiag::$stos[] = $id;
        // zamknięcie po funkcjach shutdown aplikacji (jak przy HTTP: rejestracja w trakcie shutdown = koniec kolejki)
        register_shutdown_function(static fn () => register_shutdown_function(static function () use ($id) {
            // proces bez pracy z mapy: bez przebiegu (także destruktory po shutdown)
            if (!FlowlensDiag::$korzen['zapisane']) { FlowlensDiag::$stos = []; FlowlensDiag::$korzen = null; FlowlensDiag::$kor = null; FlowlensDiag::$tylkoGranice = true; return; }
            while (FlowlensDiag::$stos && end(FlowlensDiag::$stos) !== $id) FlowlensDiag::wyjdz('?', '?');
            $blad = error_get_last();
            FlowlensDiag::wyjdz('cli', FlowlensDiag::$korzen['metoda'], null,
                $blad && in_array($blad['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true) ? ['blad' => $blad['message']] : []);
        }));
    }

    // metody klas z mapy
    foreach ($klasy as $fqn => $metody) {
        $php = str_replace('.', '\\', $fqn);
        foreach ($metody as $met) {
            $hook($php, $met,
                pre: static fn ($o, array $p, string $c, string $f) => FlowlensDiag::wejdz($fqn, $met),
                post: static fn ($o, array $p, $w, ?\Throwable $e) => FlowlensDiag::wyjdz($fqn, $met, $e));
        }
    }

    // PDO: SQL z parametrami (wartości tak, jak dostała je baza), transakcje (savepointy Laravela to zwykłe SQL:
    // SAVEPOINT / RELEASE / ROLLBACK TO); baza z DSN połączenia (instrukcja dziedziczy ją w prepare). Ustawienia
    // sesji (SET NAMES, SET SESSION TRANSACTION ISOLATION, USE, set search_path) zostają — auto-pdo też je pokazuje
    $t = [];
    $baza = static fn ($o) => FlowlensDiag::$bazy[spl_object_id($o)] ?? null;
    $hook('PDO', '__construct', post: static function ($pdo, array $p) {
        if (preg_match('/(?:dbname|database)=([^;]+)/i', (string) ($p[0] ?? ''), $m)) FlowlensDiag::$bazy[spl_object_id($pdo)] = trim($m[1], "'\" ");
        elseif (preg_match('/^sqlite:(.+)$/', (string) ($p[0] ?? ''), $m)) FlowlensDiag::$bazy[spl_object_id($pdo)] = basename($m[1]);
    });
    $hook('PDO', 'prepare', post: static function ($pdo, array $p, $s) use ($baza) {
        if (is_object($s)) {
            unset(FlowlensDiag::$par[spl_object_id($s)]);                // nowy obiekt pod starym spl_object_id
            if ($b = $baza($pdo)) FlowlensDiag::$bazy[spl_object_id($s)] = $b;
        }
    });
    $hook('PDOStatement', 'bindValue', post: static function ($s, array $p) {
        FlowlensDiag::$par[spl_object_id($s)][$p[0]] = [$p[1] ?? null, (int) ($p[2] ?? \PDO::PARAM_STR)];
    });
    $hook('PDOStatement', 'execute',
        pre: static function ($s) use (&$t) { $t[spl_object_id($s)] = hrtime(true); },
        post: static function ($s, array $p, $w, ?\Throwable $e) use (&$t, $baza) {
            $id = spl_object_id($s);
            $par = FlowlensDiag::parametry($id, $p[0] ?? null);
            $ms = isset($t[$id]) ? (hrtime(true) - $t[$id]) / 1e6 : 0;
            unset($t[$id]);
            FlowlensDiag::pisz('sql', ['sql' => FlowlensDiag::zWartosciami($s->queryString, $par), 'ms' => round($ms, 3)]
                + (($b = $baza($s)) ? ['baza' => $b] : []) + ($e ? ['blad' => $e->getMessage()] : []));
        });
    foreach (['exec', 'query'] as $fn) {
        $hook('PDO', $fn,
            pre: static function ($pdo) use (&$t) { $t['pdo'] = hrtime(true); },
            post: static function ($pdo, array $p, $w, ?\Throwable $e) use (&$t, $baza, $fn) {
                if ($fn === 'query' && is_object($w)) unset(FlowlensDiag::$par[spl_object_id($w)]);
                FlowlensDiag::pisz('sql', ['sql' => (string) ($p[0] ?? ''), 'ms' => round((hrtime(true) - ($t['pdo'] ?? hrtime(true))) / 1e6, 3)]
                    + (($b = $baza($pdo)) ? ['baza' => $b] : []) + ($e ? ['blad' => $e->getMessage()] : []));
            });
    }
    foreach (['beginTransaction' => 'begin', 'commit' => 'commit', 'rollBack' => 'rollback'] as $fn => $faza) {
        $hook('PDO', $fn, post: static fn ($pdo, array $p, $w, ?\Throwable $e) => $e ? null : FlowlensDiag::pisz('tx', ['faza' => $faza, 'zrodlo' => 'pdo']));
    }

    // mysqli (OpenCart, WordPress, stary kod bez PDO): metody obiektowe i funkcje proceduralne (te same funkcje C,
    // hak widzi je osobno — bez podwójnego SQL). Instrukcja przygotowana: SQL z prepare, parametry z bind_param albo
    // execute($tablica), zapis przy execute. Błąd z wyjątku (mysqli_report STRICT, domyślne od PHP 8.1) albo z ->error.
    // Id połączenia (thread_id) jako db.pid — SQL z innego połączenia nie wchodzi do otwartej transakcji
    $mysqli = static function ($m) {
        $a = [];
        try { if (is_object($m) && $m->thread_id) $a['db.pid'] = $m->thread_id; } catch (\Throwable) {}
        return $a;
    };
    $zapiszMysqli = static function ($polaczenie, string $sql, float $t0, $wynik, ?\Throwable $e, $obiektBledu = null) use ($baza, $mysqli) {
        $blad = $e ? $e->getMessage() : null;
        if (!$blad && $wynik === false) { try { $blad = (string) (($obiektBledu ?? $polaczenie)->error ?? '') ?: 'błąd mysqli'; } catch (\Throwable) { $blad = 'błąd mysqli'; } }
        $atr = $mysqli($polaczenie);
        FlowlensDiag::pisz('sql', ['sql' => $sql, 'ms' => round((hrtime(true) - $t0) / 1e6, 3)]
            + (is_object($polaczenie) && ($b = $baza($polaczenie)) ? ['baza' => $b] : []) + ($atr ? ['atrybuty' => $atr] : []) + ($blad ? ['blad' => $blad] : []));
    };
    $stmtSql = [];                                                    // spl_object_id(mysqli_stmt) → [sql, połączenie]
    $tm = [];
    $polaczBaze = static function ($m, $nazwa) { if (is_object($m) && is_string($nazwa) && $nazwa !== '') FlowlensDiag::$bazy[spl_object_id($m)] = $nazwa; };
    $hook('mysqli', '__construct', post: static fn ($m, array $p) => $polaczBaze($m, $p[3] ?? null));
    $hook('mysqli', 'real_connect', post: static fn ($m, array $p) => $polaczBaze($m, $p[3] ?? null));
    $hook(null, 'mysqli_connect', post: static fn ($o, array $p, $m) => $polaczBaze($m, $p[3] ?? null));
    $hook('mysqli', 'select_db', post: static fn ($m, array $p, $w) => $w ? $polaczBaze($m, $p[0] ?? null) : null);
    $hook(null, 'mysqli_select_db', post: static fn ($o, array $p, $w) => $w ? $polaczBaze($p[0] ?? null, $p[1] ?? null) : null);
    foreach (['query', 'real_query', 'multi_query'] as $fn) {
        $hook('mysqli', $fn,
            pre: static function () use (&$tm) { $tm[] = hrtime(true); },
            post: static function ($m, array $p, $w, ?\Throwable $e) use (&$tm, $zapiszMysqli) { $zapiszMysqli($m, (string) ($p[0] ?? ''), array_pop($tm) ?? hrtime(true), $w, $e); });
        $hook(null, "mysqli_$fn",
            pre: static function () use (&$tm) { $tm[] = hrtime(true); },
            post: static function ($o, array $p, $w, ?\Throwable $e) use (&$tm, $zapiszMysqli) { $zapiszMysqli($p[0] ?? null, (string) ($p[1] ?? ''), array_pop($tm) ?? hrtime(true), $w, $e); });
    }
    $przygotowane = static function ($m, $sql, $s) use (&$stmtSql) {
        if (!is_object($s)) return;
        $stmtSql[spl_object_id($s)] = [(string) $sql, $m];
        unset(FlowlensDiag::$par[spl_object_id($s)]);
    };
    $hook('mysqli', 'prepare', post: static fn ($m, array $p, $s) => $przygotowane($m, $p[0] ?? '', $s));
    $hook(null, 'mysqli_prepare', post: static fn ($o, array $p, $s) => $przygotowane($p[0] ?? null, $p[1] ?? '', $s));
    $hook('mysqli_stmt', 'prepare', post: static fn ($s, array $p, $w) => $w ? $przygotowane($stmtSql[spl_object_id($s)][1] ?? null, $p[0] ?? '', $s) : null);
    // bind_param wiąże przez referencję — wartości z chwili wiązania (zwykle tuż przed execute)
    $wiaz = static function ($s, array $wartosci) {
        if (!is_object($s)) return;
        FlowlensDiag::$par[spl_object_id($s)] = [];
        foreach (array_values($wartosci) as $i => $v) FlowlensDiag::$par[spl_object_id($s)][$i + 1] = [$v, is_int($v) ? \PDO::PARAM_INT : \PDO::PARAM_STR];
    };
    $hook('mysqli_stmt', 'bind_param', post: static fn ($s, array $p) => $wiaz($s, array_slice($p, 1)));
    $hook(null, 'mysqli_stmt_bind_param', post: static fn ($o, array $p) => $wiaz($p[0] ?? null, array_slice($p, 2)));
    $wykonaj = static function ($s, $tablica, float $t0, $w, ?\Throwable $e) use (&$stmtSql, $zapiszMysqli) {
        if (!is_object($s) || !isset($stmtSql[spl_object_id($s)])) return;
        [$sql, $m] = $stmtSql[spl_object_id($s)];
        $par = FlowlensDiag::parametry(spl_object_id($s), $tablica);
        $zapiszMysqli($m, FlowlensDiag::zWartosciami($sql, $par), $t0, $w, $e, $s);
    };
    $hook('mysqli_stmt', 'execute',
        pre: static function () use (&$tm) { $tm[] = hrtime(true); },
        post: static function ($s, array $p, $w, ?\Throwable $e) use (&$tm, $wykonaj) { $wykonaj($s, $p[0] ?? null, array_pop($tm) ?? hrtime(true), $w, $e); });
    $hook(null, 'mysqli_stmt_execute',
        pre: static function () use (&$tm) { $tm[] = hrtime(true); },
        post: static function ($o, array $p, $w, ?\Throwable $e) use (&$tm, $wykonaj) { $wykonaj($p[0] ?? null, $p[1] ?? null, array_pop($tm) ?? hrtime(true), $w, $e); });
    foreach (['begin_transaction' => 'begin', 'commit' => 'commit', 'rollback' => 'rollback'] as $fn => $faza) {
        $hook('mysqli', $fn, post: static fn ($m, array $p, $w, ?\Throwable $e) => $e || $w === false ? null
            : FlowlensDiag::pisz('tx', ['faza' => $faza, 'zrodlo' => 'mysqli'] + (($a = $mysqli($m)) ? ['atrybuty' => $a] : [])));
        $hook(null, "mysqli_$fn", post: static fn ($o, array $p, $w, ?\Throwable $e) => $e || $w === false ? null
            : FlowlensDiag::pisz('tx', ['faza' => $faza, 'zrodlo' => 'mysqli'] + (($a = $mysqli($p[0] ?? null)) ? ['atrybuty' => $a] : [])));
    }

    // curl (bez Guzzle: OpenCart pobiera kursy walut przez curl_exec): metoda i adres z curl_setopt, czas, błąd z
    // curl_error. Żądanie Guzzle też idzie przez curl_exec — zapisane już w Client::transfer, więc pomijamy je tu
    $curl = [];                                                       // spl_object_id(CurlHandle) → [url, metoda]
    $guzzle = [];                                                     // adresy żądań Guzzle czekające na curl_exec
    $opcja = static function ($ch, $o, $v) use (&$curl) {
        if (!is_object($ch)) return;
        $c = &$curl[spl_object_id($ch)];
        $c ??= ['url' => null, 'metoda' => 'GET'];
        if ($o === CURLOPT_URL) $c['url'] = (string) $v;
        elseif ($o === CURLOPT_CUSTOMREQUEST && $v) $c['metoda'] = strtoupper((string) $v);
        elseif ($o === CURLOPT_POST && $v && $c['metoda'] === 'GET') $c['metoda'] = 'POST';
        elseif ($o === CURLOPT_NOBODY && $v && $c['metoda'] === 'GET') $c['metoda'] = 'HEAD';
    };
    $hook(null, 'curl_init', post: static function ($o, array $p, $ch) use (&$curl) { if (is_object($ch)) $curl[spl_object_id($ch)] = ['url' => isset($p[0]) ? (string) $p[0] : null, 'metoda' => 'GET']; });
    $hook(null, 'curl_setopt', post: static fn ($o, array $p) => $opcja($p[0] ?? null, $p[1] ?? null, $p[2] ?? null));
    $hook(null, 'curl_setopt_array', post: static function ($o, array $p) use ($opcja) { foreach ((array) ($p[1] ?? []) as $k => $v) $opcja($p[0] ?? null, $k, $v); });
    $hook(null, 'curl_exec',
        pre: static function () use (&$tm) { $tm[] = hrtime(true); },
        post: static function ($o, array $p, $w) use (&$tm, &$curl, &$guzzle) {
            $t0 = array_pop($tm) ?? hrtime(true);
            $ch = $p[0] ?? null;
            if (!is_object($ch)) return;
            $c = $curl[spl_object_id($ch)] ?? ['url' => null, 'metoda' => 'GET'];
            $url = $c['url'] ?? (string) @curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
            if (($i = array_search($url, $guzzle, true)) !== false) { unset($guzzle[$i]); return; }
            $blad = $w === false ? (@curl_error($ch) ?: 'błąd curl') : null;
            FlowlensDiag::pisz('zew', ['metoda' => $c['metoda'], 'url' => $url, 'ms' => round((hrtime(true) - $t0) / 1e6, 3)] + ($blad ? ['blad' => $blad] : []));
        });

    // inne systemy: Guzzle (Laravel Http::), SoapClient
    // Guzzle niesie też korelację (nagłówek X-Flowlens-Kor): żądanie do aplikacji z hakiem (webhook do siebie, drugi
    // serwis PHP) trafia do przebiegu wołającego — jak w OTel, gdzie auto-guzzle wstrzykuje traceparent
    $hook('GuzzleHttp\Client', 'transfer', pre: static function ($o, array $p) use (&$guzzle) {
        $r = $p[0] ?? null;
        if (!is_object($r) || !method_exists($r, 'getUri')) return null;
        FlowlensDiag::pisz('zew', ['metoda' => $r->getMethod(), 'url' => (string) $r->getUri()]);
        $guzzle[] = (string) $r->getUri();
        if (count($guzzle) > 50) array_shift($guzzle);
        if (FlowlensDiag::$kor === null || !method_exists($r, 'withHeader') || $r->hasHeader(FlowlensDiag::NAGLOWEK)) return null;
        return [0 => $r->withHeader(FlowlensDiag::NAGLOWEK, FlowlensDiag::$kor)];
    });
    $hook('SoapClient', '__doRequest', pre: static fn ($o, array $p) => FlowlensDiag::pisz('zew', ['system' => 'SOAP', 'cel' => (string) ($p[1] ?? '')]));

    // RabbitMQ: ext-amqp (AMQPExchange / AMQPQueue) i php-amqplib (AMQPChannel). Cel jak w auto-ext-amqp:
    // publikacja → routing key (wymiana w messaging.destination_publish.name), operacja na kolejce → nazwa kolejki.
    // Publikacja z czasem i błędem (broker niedostępny → AMQPException), consume — przy wejściu (blokuje i woła callback)
    $amqp = static function (string $op, string $cel, array $atr = [], float $ms = 0, ?\Throwable $e = null) {
        FlowlensDiag::pisz('zew', ['system' => 'amqp', 'cel' => $cel, 'ms' => round($ms, 3), 'atrybuty' => ['messaging.operation.type' => $op] + $atr]
            + ($e ? ['blad' => get_class($e) . ': ' . substr($e->getMessage(), 0, 300)] : []));
    };
    $tp = [];
    $publikacja = static function (string $wymiana, string $klucz) {
        return ['messaging.destination_publish.name' => trim("$wymiana $klucz"), 'messaging.rabbitmq.routing.key' => $klucz];
    };
    $hook('AMQPExchange', 'publish',
        pre: static function ($x) use (&$tp) { $tp[spl_object_id($x)] = hrtime(true); },
        post: static function ($x, array $p, $w, ?\Throwable $e) use (&$tp, $amqp, $publikacja) {
            $ms = isset($tp[spl_object_id($x)]) ? (hrtime(true) - $tp[spl_object_id($x)]) / 1e6 : 0;
            $klucz = (string) ($p[1] ?? '');
            $wymiana = ''; try { $wymiana = (string) $x->getName(); } catch (\Throwable) {}
            $amqp('publish', $klucz !== '' ? $klucz : $wymiana, $publikacja($wymiana, $klucz), $ms, $e);
        });
    $kolejka = static function ($q) { try { return (string) $q->getName(); } catch (\Throwable) { return '?'; } };
    foreach (['ack', 'nack', 'reject', 'consume'] as $op) {
        $hook('AMQPQueue', $op, pre: static fn ($q) => $amqp($op, $kolejka($q)));
    }
    $hook('AMQPQueue', 'get', post: static fn ($q, array $p, $w) => is_object($w) ? $amqp('receive', $kolejka($q)) : null);
    $hook('PhpAmqpLib\Channel\AMQPChannel', 'basic_publish',
        pre: static function ($c) use (&$tp) { $tp[spl_object_id($c)] = hrtime(true); },
        post: static function ($c, array $p, $w, ?\Throwable $e) use (&$tp, $amqp, $publikacja) {
            $ms = isset($tp[spl_object_id($c)]) ? (hrtime(true) - $tp[spl_object_id($c)]) / 1e6 : 0;
            $wymiana = (string) ($p[1] ?? ''); $klucz = (string) ($p[2] ?? '');
            $amqp('publish', $klucz !== '' ? $klucz : $wymiana, $publikacja($wymiana, $klucz), $ms, $e);
        });
    foreach (['basic_ack' => 'ack', 'basic_nack' => 'nack', 'basic_reject' => 'reject'] as $fn => $op) {
        $hook('PhpAmqpLib\Channel\AMQPChannel', $fn, pre: static fn ($c, array $p) => $amqp($op, 'delivery ' . (string) ($p[0] ?? '')));
    }
    $hook('PhpAmqpLib\Channel\AMQPChannel', 'basic_consume', pre: static fn ($c, array $p) => $amqp('consume', (string) ($p[0] ?? '')));
    $hook('PhpAmqpLib\Channel\AMQPChannel', 'basic_get', post: static fn ($c, array $p, $w) => is_object($w) ? $amqp('receive', (string) ($p[0] ?? '')) : null);
})();
