"""flow-lens (Python) bez OpenTelemetry: log diagnostyczny (format zrodla/diag.mjs) z działającej aplikacji.

Wstrzyknięcie w runtime, bez zmian w kodzie i bez pakietów OTel:
- metody klas z mapy: sys.monitoring (3.12+: osobno powrót, zawieszenie na await i wyjątek), starszy Python —
  sys.setprofile; generator (też async, np. zależność FastAPI z yield) kończy krok na yield, wznowienie to nowy krok;
- kor (identyfikator requestu): contextvars — przechodzi przez await i do zadań asyncio, wątek startuje bez kor;
- granice requestu HTTP z szablonem ścieżki: Starlette/FastAPI, Django, Flask; zadanie Celery jako wejście;
- SQL i transakcje: zdarzenia SQLAlchemy (także AsyncEngine), kursor i atomic() Django (BEGIN leniwie, jak sterownik),
  asyncpg, psycopg wprost (bez ORM);
- inne systemy: requests, httpx, Redis, SMTP, wysłanie zadania Celery.

Włączany przez sitecustomize.py, gdy jest FLOWLENS_DIAG (katalog na pliki .jsonl) i FLOWLENS_MAPA.
"""
import contextvars
import dis
import itertools
import json
import os
import re
import sys
import threading
import time

RYSOWANE = {"wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"}
_KOR = contextvars.ContextVar("flowlens_kor", default=None)
_STOS = contextvars.ContextVar("flowlens_stos", default=())   # krotki (niezmienne): zadania asyncio nie dzielą listy
_TX = contextvars.ContextVar("flowlens_tx", default=None)      # kor transakcji, gdy request już się zamknął
_SEK = itertools.count(1)
_KORY = itertools.count(1)
_PID = os.getpid()
_T0, _N0 = time.time() * 1000, time.perf_counter_ns()
_blokada = threading.Lock()
_plik = None
_katalog = None


def _po_forku():
    """Dziecko fork() (prefork Celery, gunicorn): własny pid, plik i liczniki — inaczej pisze do pliku rodzica
    z jego pid i tymi samymi kor, a różne requesty sklejają się w jeden przebieg."""
    global _PID, _plik, _KORY, _SEK, _blokada
    _PID, _plik, _KORY, _SEK, _blokada = os.getpid(), None, itertools.count(1), itertools.count(1), threading.Lock()


if hasattr(os, "register_at_fork"):
    os.register_at_fork(after_in_child=_po_forku)


def _ts():
    return round(_T0 + (time.perf_counter_ns() - _N0) / 1e6, 3)


def _pisz(zd):
    global _plik
    try:
        with _blokada:
            if _plik is None:
                os.makedirs(_katalog, exist_ok=True)
                _plik = open(os.path.join(_katalog, f"{_PID}.jsonl"), "a", encoding="utf-8", buffering=1)
            _plik.write(json.dumps(zd, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass


def _zd(ev, kor=None, **pola):
    return {"v": 1, "ts": _ts(), "pid": _PID, "w": threading.current_thread().name, "kor": kor if kor is not None else _KOR.get(),
            "sek": next(_SEK), "ev": ev, **pola}


# ---------------------------------------------------------------- API (też do wołania ręcznie)
def wejscie(klasa, metoda, wej=None):
    if _KOR.get() is None and not _STOS.get():
        _KOR.set(f"k-{_PID}-{next(_KORY)}")
        wej = wej or {"rodzaj": "wywolanie", "nazwa": f"{klasa.rsplit('.', 1)[-1]}.{metoda}"}
    else:
        wej = None
    _STOS.set(_STOS.get() + ((klasa, metoda),))
    _pisz(_zd("in", klasa=klasa, metoda=metoda, **({"wejscie": wej} if wej else {})))


def wyjscie(klasa, metoda, blad=None, **reszta):
    stos = _STOS.get()
    _pisz(_zd("out", klasa=klasa, metoda=metoda, **({"blad": blad} if blad else {}), **reszta))
    stos = stos[:-1] if stos else stos
    _STOS.set(stos)
    if not stos:
        _KOR.set(None)


def sql(tekst, ms=0.0, baza=None, blad=None, partia=0, szablon=None):
    """tekst — SQL z wartościami (do pokazania); szablon — surowy tekst z placeholderami, gdy wartości wpisaliśmy"""
    kor = _KOR.get() or _TX.get()
    _pisz(_zd("sql", kor=kor, sql=str(tekst), ms=round(ms, 3), **({"baza": baza} if baza else {}), **({"blad": blad} if blad else {}),
              **({"partia": partia} if partia else {}), **({"szablon": str(szablon)} if szablon is not None and str(szablon) != str(tekst) else {})))


def tx(faza, zrodlo):
    kor = _KOR.get() or _TX.get()
    if faza == "begin" and _KOR.get():
        _TX.set(_KOR.get())
    if faza in ("commit", "rollback"):
        _TX.set(None)
    _pisz(_zd("tx", kor=kor, faza=faza, zrodlo=zrodlo))


def zew(metoda=None, url=None, ms=0.0, blad=None, system=None, cel=None):
    """HTTP: metoda + url; kolejka, Redis, SMTP…: system + cel"""
    pola = {"metoda": metoda, "url": str(url)} if url is not None else {"system": system, "cel": str(cel or "")}
    _pisz(_zd("zew", **pola, ms=round(ms, 3), **({"blad": blad} if blad else {})))


def http_start(metoda, sciezka):
    _KOR.set(None)
    _STOS.set(())
    wejscie("http", sciezka, {"rodzaj": "http", "metoda": metoda, "sciezka": sciezka, "nazwa": f"{metoda} {sciezka}"})


def http_koniec(sciezka, status, wzorzec=None, blad=None):
    stos = _STOS.get()
    _pisz(_zd("out", klasa="http", metoda=sciezka, status=status, **({"sciezka": wzorzec} if wzorzec else {}), **({"blad": blad} if blad else {})))
    _STOS.set(())
    _KOR.set(None)


def _arg(a, k, poz, nazwa, domyslna=None):
    """argument wywołania po pozycji albo po nazwie. Łatka przyjmuje (*a, **k) i przekazuje je oryginałowi bez zmian —
    własne parametry pozycyjne zawężały sygnaturę: sendmail(from_addr=…, to_addrs=…) rzucał TypeError w aplikacji"""
    return k[nazwa] if nazwa in k else a[poz] if len(a) > poz else domyslna


def _opis_bledu(e):
    return f"{type(e).__module__}.{type(e).__qualname__}: {e}"[:300]


# ---------------------------------------------------------------- metody klas z mapy
_CO_GEN, _CO_KOR, _CO_IKOR, _CO_AGEN = 0x20, 0x80, 0x100, 0x200
_YIELD = dis.opmap.get("YIELD_VALUE")


def _prawdziwy_yield(kod, wartosc):
    """yield oddający wartość wołającemu (krok się kończy) — a nie zawieszenie na await (krok trwa). W korutynie każdy
    yield to await; w generatorze async wartość z `yield` jest opakowana (async_generator_wrapped_value)."""
    f = kod.co_flags
    if f & (_CO_KOR | _CO_IKOR):
        return False
    if f & _CO_AGEN:
        return type(wartosc).__name__ == "async_generator_wrapped_value"
    return bool(f & _CO_GEN)


def _zawieszenie(ramka):
    """setprofile: „return” z ramki stojącej na YIELD_VALUE to yield/await, nie powrót"""
    try:
        return ramka.f_code.co_flags & (_CO_GEN | _CO_KOR | _CO_IKOR | _CO_AGEN) and ramka.f_code.co_code[ramka.f_lasti] == _YIELD
    except Exception:
        return False


def _z_modulu(ramka, modul):
    """kod z pliku modułu, nie z exec w osobnej przestrzeni nazw (zaślepka sygnatury zadania Celery z head_from_fun
    ma ten sam co_qualname i __name__ co zadanie, ale własne globalne)"""
    m = sys.modules.get(modul)
    return m is not None and getattr(m, "__dict__", None) is ramka.f_globals
def _dekorowana(ramka):
    """Funkcja pod dekoratorem z kontekstem (@transaction.atomic — contextlib.ContextDecorator): __enter__ woła
    `inner` z contextlib, a funkcja z dekoratorem jest w jego `func`. Kolejne __wrapped__ (inne dekoratory pod spodem)."""
    for _ in range(3):                                               # nad __enter__ bywa jeszcze łatka (nasza, OTel)
        if ramka is None:
            return []
        k = ramka.f_code
        if k.co_name == "inner" and k.co_filename.endswith("contextlib.py"):
            f, wynik = ramka.f_locals.get("func"), []
            while f is not None and len(wynik) < 5:
                wynik.append(f)
                f = getattr(f, "__wrapped__", None)
            return wynik
        ramka = ramka.f_back
    return []


class _Globalne:                                                     # „ramka” dla cel(): tylko f_globals funkcji
    def __init__(self, f):
        self.f_globals = getattr(f, "__globals__", {})


# Metoda z mapy pod @transaction.atomic: dekorator otwiera atomic (SAVEPOINT / BEGIN) przed jej kodem i zamyka
# (RELEASE / COMMIT) po powrocie, a PY_START / PY_RETURN widzą tylko jej ciało — savepoint był krokiem wołającego.
# Krok otwieramy w Atomic.__enter__, zamykamy w __exit__; wejście w kod i powrót z niego tylko zmieniają stan wpisu.
# Wpis: [kod, stan („czeka” → „trwa” → „koniec”), ramka, wyjątek, (klasa, metoda)] — stos w kontekście.
_WCZESNIE = contextvars.ContextVar("flowlens_wczesnie", default=())
_DEKORATOR = [None]                                                  # cel(kod, ramka) z _metody — dla __enter__ atomic


def _wczesnie_przed(ramka):
    cel = _DEKORATOR[0]
    if cel is None:
        return None
    for f in _dekorowana(ramka):
        kod = getattr(f, "__code__", None)
        if kod is None or kod.co_flags & (_CO_GEN | _CO_KOR | _CO_IKOR | _CO_AGEN):
            continue
        c = cel(kod, _Globalne(f))
        if c:
            wpis = [kod, "czeka", None, None, c]
            _WCZESNIE.set(_WCZESNIE.get() + (wpis,))
            wejscie(*c)
            return wpis
    return None


def _wczesnie_start(kod, ramka):
    """PY_START metody otwartej już w __enter__ atomic — bez drugiego kroku"""
    w = _WCZESNIE.get()
    if w and w[-1][0] is kod and w[-1][1] == "czeka":
        w[-1][1], w[-1][2] = "trwa", ramka
        return True
    return False


def _wczesnie_koniec(ramka, wyjatek=None):
    """powrót z metody otwartej w __enter__ atomic — krok zamknie __exit__ (po RELEASE / COMMIT)"""
    w = _WCZESNIE.get()
    if w and w[-1][1] == "trwa" and w[-1][2] is ramka:
        w[-1][1], w[-1][2], w[-1][3] = "koniec", None, wyjatek
        return True
    return False


def _wczesnie_po(wartosc=None):
    """Atomic.__exit__: zamyka wpis z wierzchu, jeśli to jego atomic (metoda już wróciła albo w ogóle nie ruszyła);
    __exit__ zagnieżdżonego `with atomic()` w trakcie metody (stan „trwa”) — nie"""
    w = _WCZESNIE.get()
    if not w or w[-1][1] == "trwa":
        return
    kod, stan, _, wyjatek, c = w[-1]
    _WCZESNIE.set(w[:-1])
    e = wyjatek if wyjatek is not None else wartosc
    if _STOS.get()[-1:] == (c,):
        wyjscie(*c, **({"blad": _opis_bledu(e)} if isinstance(e, BaseException) and not isinstance(e, GeneratorExit) else {}))


def _metody(cele):
    pamiec = {}                                                      # obiekt kodu → (klasa, metoda) albo None

    def cel(kod, ramka):
        if kod in pamiec:
            return pamiec[kod]
        wynik = None
        qn = getattr(kod, "co_qualname", None)
        modul = ramka.f_globals.get('__name__', '')
        if qn and "." in qn and "<locals>" not in qn:
            kl, met = qn.rsplit(".", 1)
            fq = f"{modul}.{kl}"
            if met in cele.get(fq, ()):
                wynik = (fq, met)
        elif qn and "<" not in qn and qn in cele.get(modul, ()):            # funkcja modułu („klasa-moduł” w mapie)
            wynik = (modul, qn)
        if wynik and not _z_modulu(ramka, modul):
            wynik = None
        pamiec[kod] = wynik
        return wynik
    _DEKORATOR[0] = cel

    # generator po yield: krok zamknięty, wznowienie (next / asend / athrow / close) otwiera nowy krok tej metody.
    # Klucz: id ramki (ramka trzymana w wartości, więc id się nie powtórzy); globalnie — generator bywa wznawiany
    # w innym wątku / kopii kontekstu (zależność synchroniczna FastAPI w puli wątków).
    po_yield, wrzucone = {}, {}

    def wydaj(c, ramka, wartosc):
        if _prawdziwy_yield(ramka.f_code, wartosc) and _STOS.get()[-1:] == (c,):
            wyjscie(*c)
            po_yield[id(ramka)] = ramka

    def wznow(c, ramka, wyjatek=None):
        if po_yield.pop(id(ramka), None) is not None:
            wejscie(*c)
            if wyjatek is not None:
                wrzucone[id(ramka)] = wyjatek

    def zakoncz(c, ramka, wyjatek=None):
        po_yield.pop(id(ramka), None)
        wrzucony = wrzucone.pop(id(ramka), None)
        if _wczesnie_koniec(ramka, wyjatek):
            return
        if _STOS.get()[-1:] != (c,):
            return
        # wyjątek wrzucony do generatora przy sprzątaniu (athrow, close) i przepuszczony dalej — nie jego błąd
        cudzy = wyjatek is None or wyjatek is wrzucony or isinstance(wyjatek, GeneratorExit)
        wyjscie(*c, **({} if cudzy else {"blad": _opis_bledu(wyjatek)}))

    def bezpiecznie(f):                                              # wyjątek w callbacku poszedłby do aplikacji
        def g(*a):
            try:
                return f(*a)
            except Exception:
                return None
        return g

    if hasattr(sys, "monitoring") and not os.environ.get("FLOWLENS_SETPROFILE"):
        M = sys.monitoring                                           # 3.12+: osobno start, yield/await, powrót, wyjątek
        narzedzie = next(i for i in (M.PROFILER_ID, M.OPTIMIZER_ID, 4, 3) if M.get_tool(i) is None)
        M.use_tool_id(narzedzie, "flowlens")

        @bezpiecznie
        def start(kod, off):
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is None:
                return M.DISABLE
            if not _wczesnie_start(kod, ramka):
                wejscie(*c)

        @bezpiecznie
        def koniec(kod, off, wartosc):
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is None:
                return M.DISABLE
            zakoncz(c, ramka)

        @bezpiecznie
        def yield_(kod, off, wartosc):
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is None:
                return M.DISABLE
            wydaj(c, ramka, wartosc)

        @bezpiecznie
        def wznowienie(kod, off):
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is None:
                return M.DISABLE
            wznow(c, ramka)

        @bezpiecznie
        def rzut(kod, off, wyjatek):                                 # PY_THROW / PY_UNWIND nie da się wyłączyć
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is not None:
                wznow(c, ramka, wyjatek)

        @bezpiecznie
        def odwin(kod, off, wyjatek):
            ramka = sys._getframe(2)
            c = cel(kod, ramka)
            if c is not None:
                zakoncz(c, ramka, wyjatek)

        E = M.events
        for zd, f in ((E.PY_START, start), (E.PY_RETURN, koniec), (E.PY_YIELD, yield_), (E.PY_RESUME, wznowienie),
                      (E.PY_THROW, rzut), (E.PY_UNWIND, odwin)):
            M.register_callback(narzedzie, zd, f)
        M.set_events(narzedzie, E.PY_START | E.PY_RETURN | E.PY_YIELD | E.PY_RESUME | E.PY_THROW | E.PY_UNWIND)
        return

    zawieszone = {}                                                  # id ramki → ramka: korutyna stoi na await

    def profil(ramka, zdarzenie, arg):                               # starszy Python: bez wyjątków metod
        try:
            if zdarzenie == "call":
                c = cel(ramka.f_code, ramka)
                if not c:
                    return
                if zawieszone.pop(id(ramka), None) is not None:      # powrót z await
                    pass
                elif id(ramka) in po_yield:
                    wznow(c, ramka)
                elif not _wczesnie_start(ramka.f_code, ramka):
                    wejscie(*c)
            elif zdarzenie == "return":
                c = cel(ramka.f_code, ramka)
                if not c:
                    return
                if not _zawieszenie(ramka):
                    zakoncz(c, ramka)
                elif _prawdziwy_yield(ramka.f_code, arg):
                    wydaj(c, ramka, arg)
                    if id(ramka) not in po_yield:                    # krok nie był na wierzchu: wznowienie go nie otwiera
                        zawieszone[id(ramka)] = ramka
                else:
                    zawieszone[id(ramka)] = ramka
        except Exception:
            pass
    sys.setprofile(profil)
    threading.setprofile(profil)


# ---------------------------------------------------------------- SQL, transakcje, HTTP — łatki bibliotek
def _sqlalchemy():
    try:
        from sqlalchemy import event
        from sqlalchemy.engine import Engine
    except Exception:
        return

    @event.listens_for(Engine, "before_cursor_execute")
    def _przed(conn, kursor, tekst, parametry, kontekst, wiele):
        conn.info["flowlens_t0"] = time.perf_counter()

    @event.listens_for(Engine, "after_cursor_execute")
    def _po(conn, kursor, tekst, parametry, kontekst, wiele):
        ms = (time.perf_counter() - conn.info.pop("flowlens_t0", time.perf_counter())) * 1000
        sql(_z_parametrami(tekst, parametry, wiele), ms, conn.engine.url.database, partia=len(parametry) if wiele and parametry else 0, szablon=tekst)

    @event.listens_for(Engine, "handle_error")
    def _blad(kontekst):                                              # zapytanie, które padło (np. naruszenie unikalności)
        try:
            ms = (time.perf_counter() - kontekst.connection.info.pop("flowlens_t0", time.perf_counter())) * 1000 if kontekst.connection else 0
            sql(_z_parametrami(kontekst.statement, kontekst.parameters), ms, None, f"{type(kontekst.original_exception).__name__}: {kontekst.original_exception}"[:300],
                szablon=kontekst.statement)
        except Exception:
            pass

    for nazwa, faza in (("begin", "begin"), ("commit", "commit"), ("rollback", "rollback")):
        event.listen(Engine, nazwa, (lambda f: lambda conn: tx(f, "sqlalchemy"))(faza))
    # savepointy: z tekstu SQL (SAVEPOINT / RELEASE / ROLLBACK TO) — rozpoznaje je przebieg.mjs
    _SQLALCHEMY[0] = True


_SQLALCHEMY = [False]


def _z_parametrami(tekst, parametry, wiele=False):
    try:
        if wiele or parametry is None:
            return tekst
        if isinstance(parametry, dict):
            wynik = tekst
            for k, v in sorted(parametry.items(), key=lambda x: -len(str(x[0]))):
                wynik = wynik.replace(f"%({k})s", _literal(v)).replace(f":{k}", _literal(v))
            return wynik
        if isinstance(parametry, (list, tuple)):
            czesci, i = [], iter(parametry)
            for kawalek in tekst.replace("%s", "\0").replace("?", "\0").split("\0")[:-1]:
                czesci.append(kawalek + _literal(next(i, "?")))
            return "".join(czesci) + tekst.replace("%s", "\0").replace("?", "\0").split("\0")[-1]
    except Exception:
        pass
    return tekst


def _literal(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(v)
    s = str(v)
    return "'" + (s[:200] + "…" if len(s) > 200 else s).replace("'", "''") + "'"


def _django():
    try:
        from django.db.backends import utils
    except Exception:
        return
    orig_e, orig_m = utils.CursorWrapper.execute, utils.CursorWrapper.executemany

    def execute(self, *a, **k):
        tekst, parametry = _arg(a, k, 0, "sql"), _arg(a, k, 1, "params")
        _django_begin(self.db, tekst)
        t0, blad = time.perf_counter(), None
        try:
            return orig_e(self, *a, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            sql(_z_parametrami(tekst, parametry), (time.perf_counter() - t0) * 1000, getattr(self.db, "alias", None), blad, szablon=tekst)

    def executemany(self, *a, **k):
        tekst, lista = _arg(a, k, 0, "sql"), _arg(a, k, 1, "param_list")
        _django_begin(self.db, tekst)
        t0, blad = time.perf_counter(), None
        try:
            return orig_m(self, *a, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            sql(tekst, (time.perf_counter() - t0) * 1000, getattr(self.db, "alias", None), blad, partia=len(lista) if hasattr(lista, "__len__") else 0)

    utils.CursorWrapper.execute, utils.CursorWrapper.executemany = execute, executemany


_BEGIN_SQL = re.compile(r"\s*(BEGIN|START\s+TRANSACTION)\b", re.I)


def _django_begin(pol, tekst):
    """BEGIN zewnętrznego atomic() dopiero przy pierwszym zapytaniu w nim — tak robi sterownik (psycopg2 wysyła BEGIN
    przed pierwszym zapytaniem po wyłączeniu autocommit). Atomic bez SQL nie jest transakcją w bazie. Pierwsze
    zapytanie jest już w metodzie (także pod dekoratorem @atomic), więc BEGIN dostaje jej kor."""
    if getattr(pol, "_flowlens_tx", None) != "czeka":
        return
    pol._flowlens_tx = "otwarta"
    if not _BEGIN_SQL.match(str(tekst)):                                 # sqlite: Django sam wysyła BEGIN jako SQL
        tx("begin", "django-atomic")


def _django_atomic():
    from django.db import transaction
    oe, ox = transaction.Atomic.__enter__, transaction.Atomic.__exit__
    polaczenie = getattr(transaction, "get_connection", None) or (lambda using=None: transaction.connections[using or "default"])

    # tylko zewnętrzny atomic() to BEGIN/COMMIT; zagnieżdżony jest SAVEPOINT (widać go w tekście SQL). Stan na
    # połączeniu (jest per wątek), nie na obiekcie Atomic — dekorator @atomic używa jednego obiektu dla wszystkich wywołań.
    # @atomic na metodzie z mapy: jej krok obejmuje cały dekorator (SAVEPOINT / BEGIN i RELEASE / COMMIT są w nim)
    def wejdz(self):
        try:
            wpis = _wczesnie_przed(sys._getframe(1))
        except Exception:
            wpis = None
        pol = polaczenie(self.using)
        try:
            zewn = not pol.in_atomic_block and pol.get_autocommit()          # autocommit wyłączony ręcznie: nie nasza transakcja
        except Exception:
            zewn = False
        if zewn:
            pol._flowlens_tx = "czeka"
        try:
            return oe(self)
        except BaseException as e:
            if zewn:
                pol._flowlens_tx = None
            if wpis is not None:
                _wczesnie_po(e)
            raise

    def wyjdz(self, typ, wartosc, tb):
        pol = polaczenie(self.using)
        try:
            return ox(self, typ, wartosc, tb)
        finally:
            if not pol.in_atomic_block and getattr(pol, "_flowlens_tx", None):
                stan, pol._flowlens_tx = pol._flowlens_tx, None
                if stan == "otwarta":                                        # połączenie zamknięte w transakcji: baza cofa sama
                    tx("rollback", "django-atomic")
            try:
                _wczesnie_po(wartosc)
            except Exception:
                pass

    # koniec transakcji z faktycznego commit() / rollback() połączenia, które woła zewnętrzny Atomic.__exit__: ROLLBACK
    # też przy set_rollback(True) (DRF przy obsłużonym wyjątku: 400/403/404) i po odrzuconym COMMIT; zdarzenie przed
    # on_commit (np. zadanie.delay po zatwierdzeniu)
    from django.db.backends.base.base import BaseDatabaseWrapper

    def koniec(orig, faza):
        def f(self, *a, **k):
            wynik = orig(self, *a, **k)
            if getattr(self, "_flowlens_tx", None) == "otwarta":
                self._flowlens_tx = "koniec"
                tx(faza, "django-atomic")
            return wynik
        return f
    BaseDatabaseWrapper.commit = koniec(BaseDatabaseWrapper.commit, "commit")
    BaseDatabaseWrapper.rollback = koniec(BaseDatabaseWrapper.rollback, "rollback")
    transaction.Atomic.__enter__, transaction.Atomic.__exit__ = wejdz, wyjdz


def _sterowniki():
    """Sam sterownik (bez ORM): psycopg2, psycopg 3, sqlite3. Gdy działa SQLAlchemy, jego zdarzenia już to łapią."""
    def owin_kursor(modul_kursora, nazwa_klasy):
        try:
            mod = __import__(modul_kursora, fromlist=[nazwa_klasy])
            klasa = getattr(mod, nazwa_klasy)
        except Exception:
            return
        for nazwa in ("execute", "executemany"):
            orig = getattr(klasa, nazwa, None)
            if orig is None:
                continue

            def owinieta(self, *a, __orig=orig, __n=nazwa, **k):
                if _w_orm():                                   # ORM (SQLAlchemy, Django) już raportuje to zapytanie
                    return __orig(self, *a, **k)
                tekst, parametry = _arg(a, k, 0, "query"), _arg(a, k, 1, "params_seq" if __n == "executemany" else "params")
                t0 = time.perf_counter()
                try:
                    return __orig(self, *a, **k)
                finally:
                    sql(tekst if __n == "executemany" else _z_parametrami(str(tekst), parametry), (time.perf_counter() - t0) * 1000)
            try:
                setattr(klasa, nazwa, owinieta)
            except TypeError:                                  # typ w C bez możliwości podmiany (sqlite3.Cursor)
                pass
    owin_kursor("psycopg", "Cursor")


def _w_orm():
    f = sys._getframe(2)
    while f is not None:
        n = f.f_code.co_filename
        if ("sqlalchemy" in n and _SQLALCHEMY[0]) or ("django" in n and os.sep + "db" + os.sep in n):
            return True
        f = f.f_back
    return False


def _dolar(tekst, parametry):
    """$1, $2… (asyncpg, Postgres) → wartości; od najdłuższego numeru, żeby $1 nie zjadło początku $10"""
    wynik = str(tekst)
    for n in sorted(range(1, len(parametry) + 1), key=lambda n: -n):
        wynik = re.sub(rf"\${n}(?!\d)", lambda m, v=parametry[n - 1]: _literal(v), wynik)
    return wynik


def _owin_asyncpg(klasa):
    """Connection asyncpg (sam albo pod aiosql / pypika): zapytanie z argumentu, wartości z *args, błąd z wyjątku.
    BEGIN / COMMIT / ROLLBACK / SAVEPOINT z Transaction też idą przez execute — rozpoznaje je przebieg.mjs z tekstu,
    tak jak spany instrumentacji OTel asyncpg. Reset połączenia przy zwrocie do puli zostaje (SQL techniczny, zwijany)."""
    for nazwa in ("execute", "executemany", "fetch", "fetchrow", "fetchval", "fetchmany"):
        orig = klasa.__dict__.get(nazwa)
        if orig is None:
            continue

        async def owinieta(self, *args, __orig=orig, __n=nazwa, **k):
            if _w_orm():                                                 # SQLAlchemy z dialektem asyncpg już raportuje
                return await __orig(self, *args, **k)
            t0, blad = time.perf_counter(), None
            try:
                return await __orig(self, *args, **k)
            except Exception as e:
                blad = f"{type(e).__name__}: {e}"[:300]
                raise
            finally:
                zapytanie = args[0] if args else k.get("query", k.get("command", ""))
                wartosci = args[1:]
                partia = __n in ("executemany", "fetchmany")
                lista = (wartosci[0] if wartosci else k.get("args")) if partia else None
                sql(_dolar(zapytanie, wartosci) if wartosci and not partia else zapytanie, (time.perf_counter() - t0) * 1000, None, blad,
                    partia=len(lista) if hasattr(lista, "__len__") else 0, szablon=zapytanie)
        owinieta.__name__ = nazwa
        setattr(klasa, nazwa, owinieta)


def _asyncpg():
    from asyncpg import connection
    _owin_asyncpg(connection.Connection)


def _celery():
    """Zadanie Celery jako wejście (kolejka): kor od task_prerun do task_postrun, więc obejmuje też zapis wyniku
    (backend wyników) i on_failure, nie tylko funkcję zadania. Wysłanie zadania (delay / apply_async) — inny system."""
    from celery import signals
    otwarte = {}                                                         # id zadania → nazwa (wejście otworzyliśmy my)

    def przed(sender=None, task_id=None, task=None, **k):
        if _KOR.get() is not None or _STOS.get():                        # wykonanie w miejscu (eager): część bieżącego przebiegu
            return
        nazwa = getattr(task, "name", None) or str(sender)
        otwarte[task_id] = nazwa
        wejscie("celery", nazwa, {"rodzaj": "kolejka", "nazwa": nazwa})

    def po(sender=None, task_id=None, task=None, retval=None, state=None, **k):
        nazwa = otwarte.pop(task_id, None)
        if nazwa is None:
            return
        blad = None
        if state in ("FAILURE", "RETRY"):
            e = getattr(retval, "exception", retval)
            blad = _opis_bledu(e) if isinstance(e, BaseException) else f"{state}: {e}"[:300]
        _pisz(_zd("out", klasa="celery", metoda=nazwa, **({"stan": state} if state else {}), **({"blad": blad} if blad else {})))
        _STOS.set(())
        _KOR.set(None)

    def wyslanie(sender=None, routing_key=None, **k):
        zew(system="celery", cel=str(sender))
    signals.task_prerun.connect(przed, weak=False)
    signals.task_postrun.connect(po, weak=False)
    signals.before_task_publish.connect(wyslanie, weak=False)


def _redis_cel(args):
    """komenda i klucz / kanał, bez wartości: „PUBLISH line_allocated”"""
    tekst = [a.decode(errors="replace") if isinstance(a, bytes) else str(a) for a in args[:2]]
    return " ".join([tekst[0].upper(), *tekst[1:]]) if tekst else "?"


def _redis():
    from redis import client

    orig = client.Redis.execute_command

    def execute_command(self, *args, **k):
        t0, blad = time.perf_counter(), None
        try:
            return orig(self, *args, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            zew(system="redis", cel=_redis_cel(args), ms=(time.perf_counter() - t0) * 1000, blad=blad)
    client.Redis.execute_command = execute_command

    orig_p = client.Pipeline.execute                                    # pipeline: komendy idą razem przy execute()

    def execute(self, *a, **k):
        komendy = [c[0] for c in getattr(self, "command_stack", [])]
        t0, blad = time.perf_counter(), None
        try:
            return orig_p(self, *a, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            if komendy:
                zew(system="redis", cel="PIPELINE " + " ".join(_redis_cel(c) for c in komendy)[:200], ms=(time.perf_counter() - t0) * 1000, blad=blad)
    client.Pipeline.execute = execute


def _redis_async():
    from redis.asyncio import client

    orig = client.Redis.execute_command

    async def execute_command(self, *args, **k):
        t0, blad = time.perf_counter(), None
        try:
            return await orig(self, *args, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            zew(system="redis", cel=_redis_cel(args), ms=(time.perf_counter() - t0) * 1000, blad=blad)
    client.Redis.execute_command = execute_command


def _smtplib():
    """SMTP przez smtplib. Klient bywa podklasą SMTP z własnym sendmail bez super() (biblioteka emails:
    SMTPClientWithResponse wysyła przez mail / rcpt / data), więc list łapiemy na DATA — każdy klient kończy nią
    wysyłkę — z odbiorcami zebranymi z rcpt(); sendmail / send_message: jeden zew na list (także gdy padło przed DATA)."""
    import smtplib
    owin_smtp(smtplib, lambda cel, ms, blad: zew(system="smtp", cel=cel, ms=ms, blad=blad))


def owin_smtp(smtplib, zapisz):
    """Wspólne dla logu diagnostycznego i OTel (flowlens_metody): zapisz(cel, ms, blad) raz na wysłany list."""
    S = smtplib.SMTP
    if S.__dict__.get("_flowlens_smtp"):
        return
    o_mail, o_rcpt, o_data, o_send = S.mail, S.rcpt, S.data, S.sendmail

    def cel(self, do):
        do = do if isinstance(do, str) else ", ".join(map(str, do or []))
        return f"{getattr(self, '_host', '') or 'smtp'} → {do}"[:200]

    def mail(self, *a, **k):
        self._flowlens_do = []
        return o_mail(self, *a, **k)

    def rcpt(self, *a, **k):
        r = o_rcpt(self, *a, **k)
        try:
            self.__dict__.setdefault("_flowlens_do", []).append(_arg(a, k, 0, "recip", ""))
        except Exception:
            pass
        return r

    def data(self, *a, **k):
        if getattr(self, "_flowlens_w_sendmail", False):
            return o_data(self, *a, **k)
        t0, blad = time.perf_counter(), None
        try:
            return o_data(self, *a, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            zapisz(cel(self, getattr(self, "_flowlens_do", [])), (time.perf_counter() - t0) * 1000, blad)

    def sendmail(self, *a, **k):
        do = _arg(a, k, 1, "to_addrs", "")
        t0, blad, bylo = time.perf_counter(), None, getattr(self, "_flowlens_w_sendmail", False)
        self._flowlens_w_sendmail = True
        try:
            return o_send(self, *a, **k)
        except Exception as e:
            blad = f"{type(e).__name__}: {e}"[:300]
            raise
        finally:
            self._flowlens_w_sendmail = bylo
            if not bylo:
                zapisz(cel(self, do), (time.perf_counter() - t0) * 1000, blad)
    S.mail, S.rcpt, S.data, S.sendmail = mail, rcpt, data, sendmail
    S._flowlens_smtp = True


def _requests():
    try:
        import requests

        orig = requests.Session.send

        def send(self, *a, **k):
            zadanie = _arg(a, k, 0, "request")
            t0 = time.perf_counter()
            try:
                return orig(self, *a, **k)
            finally:
                zew(zadanie.method, zadanie.url, (time.perf_counter() - t0) * 1000)
        requests.Session.send = send
    except Exception:
        pass


def _httpx():
    try:
        import httpx

        os_, oa = httpx.Client.send, httpx.AsyncClient.send

        def send(self, *a, **k):
            zadanie = _arg(a, k, 0, "request")
            t0 = time.perf_counter()
            try:
                return os_(self, *a, **k)
            finally:
                zew(zadanie.method, zadanie.url, (time.perf_counter() - t0) * 1000)

        async def asend(self, *a, **k):
            zadanie = _arg(a, k, 0, "request")
            t0 = time.perf_counter()
            try:
                return await oa(self, *a, **k)
            finally:
                zew(zadanie.method, zadanie.url, (time.perf_counter() - t0) * 1000)
        httpx.Client.send, httpx.AsyncClient.send = send, asend
    except Exception:
        pass


def _starlette():
    try:                                                             # Starlette / FastAPI (ASGI)
        from starlette.applications import Starlette

        orig = Starlette.__call__

        async def wywolaj(self, scope, receive, send):
            if scope.get("type") != "http":
                return await orig(self, scope, receive, send)
            status = [500]

            async def wyslij(wiadomosc):
                if wiadomosc.get("type") == "http.response.start":
                    status[0] = wiadomosc.get("status", 500)
                await send(wiadomosc)
            http_start(scope.get("method", "GET"), scope.get("path", "/"))
            blad = None
            try:
                await orig(self, scope, receive, wyslij)
            except BaseException as e:
                blad = f"{type(e).__qualname__}: {e}"[:300]
                raise
            finally:
                http_koniec(scope.get("path", "/"), status[0], _szablon_starlette(scope), blad)
        Starlette.__call__ = wywolaj
    except Exception:
        pass


def _szablon_starlette(scope):
    """Pełny szablon trasy. FastAPI ≥ 0.137 zagnieżdża routery z include_router (_IncludedRouter), a w scope['route']
    jest trasa liścia ze ścieżką względną („/utils/health-check/” bez „/api/v1”), tak jak w Mount. Brakujący prefiks
    to początek faktycznej ścieżki przed miejscem, od którego do końca pasuje path_regex trasy."""
    trasa = scope.get("route")
    wzor = getattr(trasa, "path", None)
    if not isinstance(wzor, str):
        return None
    sciezka, rx = scope.get("path", "") or "", getattr(trasa, "path_regex", None)
    if rx is None or rx.match(sciezka):
        return wzor
    try:
        for i, z in enumerate(sciezka):
            if z == "/" and i and rx.match(sciezka[i:]):
                return sciezka[:i] + wzor
    except Exception:
        pass
    return wzor


def _django_web():
    try:                                                             # Django (WSGI i ASGI)
        from django.core.handlers.base import BaseHandler

        orig_g = BaseHandler.get_response

        def get_response(self, *a, **k):
            zadanie = _arg(a, k, 0, "request")
            http_start(zadanie.method, zadanie.path)
            odp = None
            try:
                odp = orig_g(self, *a, **k)
                return odp
            finally:
                dop = getattr(zadanie, "resolver_match", None)
                http_koniec(zadanie.path, getattr(odp, "status_code", 500), "/" + dop.route if dop and getattr(dop, "route", None) else None)
        BaseHandler.get_response = get_response
    except Exception:
        pass


def _flask():
    try:                                                             # Flask
        import flask

        orig_f = flask.Flask.full_dispatch_request

        def full_dispatch_request(self):
            from flask import request
            http_start(request.method, request.path)
            odp = blad = None
            try:
                odp = orig_f(self)
                return odp
            except BaseException as e:                                   # nieobsłużony: Flask zrobi z niego 500 wyżej (handle_exception)
                blad = f"{type(e).__qualname__}: {e}"[:300]
                raise
            finally:
                http_koniec(request.path, getattr(odp, "status_code", 500), str(request.url_rule) if request.url_rule else None, blad)
        flask.Flask.full_dispatch_request = full_dispatch_request
    except Exception:
        pass


def _watki():
    """Wątek uruchomiony w trakcie requestu dziedziczy kopię kontekstu (kor) — praca w tle (threading.Thread,
    pula) przypina się do requestu jak przy asyncio.to_thread; wątki startowane poza requestem zostają bez kor."""
    start = threading.Thread.start

    def start_z_kontekstem(self):
        if _KOR.get() is not None and not getattr(self, "_flowlens", False):
            ctx = contextvars.copy_context()
            run = self.run
            self.run = lambda: ctx.run(run)
            self._flowlens = True
        return start(self)
    threading.Thread.start = start_z_kontekstem


def wlacz(plik_mapy, katalog):
    global _katalog
    _katalog = katalog
    with open(plik_mapy, encoding="utf-8") as f:
        mapa = json.load(f)
    cele = {fq: set(k.get("metody") or []) for fq, k in mapa.get("klasy", {}).items() if k.get("rola") in RYSOWANE and k.get("metody")}
    if cele:
        _metody(cele)
    _watki()
    return len(cele)


# moduł → łatka po jego wykonaniu (aplikacja importuje biblioteki później niż sitecustomize)
_PO_IMPORCIE = {"sqlalchemy.engine": _sqlalchemy, "django.db.backends.utils": _django, "django.db.transaction": _django_atomic,
                "django.core.handlers.base": _django_web, "starlette.applications": _starlette, "flask": _flask,
                "psycopg": _sterowniki, "requests": _requests, "httpx": _httpx, "asyncpg.connection": _asyncpg, "celery.signals": _celery,
                "redis.client": _redis, "redis.asyncio.client": _redis_async, "smtplib": _smtplib}


class _Haczyk:
    """Finder w sys.meta_path: dla modułów z _PO_IMPORCIE podmienia exec_module ich loadera tak, żeby po wykonaniu
    modułu założyć łatkę (raz)."""
    def find_spec(self, nazwa, sciezka=None, cel=None):
        lat = _PO_IMPORCIE.pop(nazwa, None)
        if lat is None:
            return None
        for f in sys.meta_path:
            if f is self or not hasattr(f, "find_spec"):
                continue
            spec = f.find_spec(nazwa, sciezka, cel)
            if spec is not None:
                break
        else:
            return None
        orig = spec.loader.exec_module

        def exec_module(modul):
            orig(modul)
            try:
                lat()
            except Exception:
                pass
        spec.loader.exec_module = exec_module
        return spec


def zainstaluj_latki():
    for nazwa in list(_PO_IMPORCIE):                                 # już zaimportowane — od razu
        if nazwa in sys.modules:
            try:
                _PO_IMPORCIE.pop(nazwa)()
            except Exception:
                pass
    sys.meta_path.insert(0, _Haczyk())
