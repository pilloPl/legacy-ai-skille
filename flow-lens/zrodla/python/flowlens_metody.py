"""flow-lens: spany OpenTelemetry dla metod klas z mapy (Python).

Auto-instrumentacja OTel w Pythonie daje biblioteki (SQLAlchemy, psycopg, HTTP), ale nie metody naszych klas —
tego nie da się włączyć konfiguracją jak w agencie Javy. Ten moduł robi to przez sys.monitoring (3.12+; starszy
Python — sys.setprofile): przy wejściu do metody klasy z mapy otwiera span (code.namespace = moduł.Klasa,
code.function = metoda) i ustawia go jako bieżący kontekst, więc SQL i logi wołane w środku stają się jego dziećmi.
- metoda async to jeden span: await (PY_YIELD w korutynie) jej nie kończy, kończy powrót;
- wyjątek wychodzący z metody (PY_UNWIND) → record_exception + status ERROR;
- generator (też async, np. zależność FastAPI z yield) kończy span na yield, wznowienie otwiera nowy;
- stos spanów w contextvars: zadania asyncio i wątki go nie dzielą, attach/detach w tym samym kontekście.
Klasy spoza mapy nic nie kosztują poza pierwszym sprawdzeniem (potem zdarzenia ich kodu są wyłączane).

Włączany przez sitecustomize.py z tego katalogu, gdy jest FLOWLENS_MAPA (flow.mjs ustawia to sam).
"""
import contextvars
import dis
import importlib
import json
import os
import re
import sys
import threading

RYSOWANE = {"wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"}
_CO_GEN, _CO_KOR, _CO_IKOR, _CO_AGEN = 0x20, 0x80, 0x100, 0x200
_YIELD = dis.opmap.get("YIELD_VALUE")
_BEGIN_SQL = re.compile(r"\s*(BEGIN|START\s+TRANSACTION)\b", re.I)
# loggery, których rekordów nie eksportujemy przez OTLP: eksporter (requests → urllib3) sam loguje na DEBUG, każdy
# taki log to kolejny eksport — przy urllib3 na DEBUG pętla bez końca (proces wisi)
POMIJANE_LOGI = ("urllib3", "requests", "opentelemetry")


def _prawdziwy_yield(kod, wartosc):
    """yield oddający wartość wołającemu (span się kończy) — a nie zawieszenie na await (span trwa). W korutynie każdy
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


def _span_tx(tracer, nazwa, kontekst=None):
    from opentelemetry import trace
    s = tracer.start_span(nazwa, context=kontekst, kind=trace.SpanKind.CLIENT, attributes={"db.statement": nazwa, "db.system": "postgresql"})
    s.end()


def _transakcje(tracer):
    """Instrumentacja OTel dla psycopg2 / SQLAlchemy nie daje spanów BEGIN/COMMIT/ROLLBACK — dokładamy je ze zdarzeń
    SQLAlchemy (krótkie spany db z db.statement = BEGIN/COMMIT/ROLLBACK, w bieżącym kontekście)."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    for zd, nazwa in (("begin", "BEGIN"), ("commit", "COMMIT"), ("rollback", "ROLLBACK")):
        event.listen(Engine, zd, (lambda n: lambda conn: _span_tx(tracer, n))(nazwa))


def _dekorowana(ramka):
    """Funkcja pod dekoratorem z kontekstem (@transaction.atomic — contextlib.ContextDecorator): __enter__ woła
    `inner` z contextlib, a funkcja z dekoratorem jest w jego `func`. Kolejne __wrapped__ (inne dekoratory pod spodem)."""
    for _ in range(3):                                     # nad __enter__ bywa jeszcze łatka
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


class _Globalne:                                           # „ramka” dla cel(): tylko f_globals funkcji
    def __init__(self, f):
        self.f_globals = getattr(f, "__globals__", {})


# Metoda z mapy pod @transaction.atomic: dekorator otwiera atomic (SAVEPOINT / BEGIN) przed jej kodem i zamyka
# (RELEASE / COMMIT) po powrocie, a PY_START / PY_RETURN widzą tylko jej ciało — SAVEPOINT był dzieckiem wołającego.
# Span otwieramy w Atomic.__enter__ (wcześniej niż jej kod), zamykamy w __exit__; wejście w kod i powrót z niego
# tylko zmieniają stan wpisu [kod, stan („czeka” → „trwa” → „koniec”), ramka, wyjątek, klucz spanu] — stos w kontekście.
_WCZESNIE = contextvars.ContextVar("flowlens_wczesnie", default=())
_DEKORATOR = [None]                                        # (cel, otworz, zamknij) z wlacz


def _wczesnie_przed(ramka):
    if _DEKORATOR[0] is None:
        return None
    cel, otworz, _ = _DEKORATOR[0]
    for f in _dekorowana(ramka):
        kod = getattr(f, "__code__", None)
        if kod is None or kod.co_flags & (_CO_GEN | _CO_KOR | _CO_IKOR | _CO_AGEN):
            continue
        km = cel(kod, _Globalne(f))
        if km:
            klucz = object()                               # zamiast ramki (jej jeszcze nie ma) na stosie spanów
            wpis = [kod, "czeka", None, None, klucz]
            _WCZESNIE.set(_WCZESNIE.get() + (wpis,))
            otworz(klucz, km)
            return wpis
    return None


def _wczesnie_start(kod, ramka):
    w = _WCZESNIE.get()
    if w and w[-1][0] is kod and w[-1][1] == "czeka":
        w[-1][1], w[-1][2] = "trwa", ramka
        return True
    return False


def _wczesnie_koniec(ramka, wyjatek=None):
    w = _WCZESNIE.get()
    if w and w[-1][1] == "trwa" and w[-1][2] is ramka:
        w[-1][1], w[-1][2], w[-1][3] = "koniec", None, wyjatek
        return True
    return False


def _wczesnie_po(wartosc=None):
    """Atomic.__exit__: zamyka span z wierzchu, jeśli to jego atomic (metoda już wróciła albo nie ruszyła);
    __exit__ zagnieżdżonego `with atomic()` w trakcie metody (stan „trwa”) — nie"""
    w = _WCZESNIE.get()
    if not w or w[-1][1] == "trwa" or _DEKORATOR[0] is None:
        return
    _, _, _, wyjatek, klucz = w[-1]
    _WCZESNIE.set(w[:-1])
    e = wyjatek if wyjatek is not None else wartosc
    _DEKORATOR[0][2](klucz, e if isinstance(e, BaseException) and not isinstance(e, GeneratorExit) else None)


def _smtp(tracer):
    """Auto-instrumentacja OTel Pythona nie ma smtplib — span innego systemu (SMTP) na wysłany list, w tym samym kształcie
    co zew diag (messaging.system smtp, odbiorcy w messaging.destination.name); łatka wspólna z flowlens_diag."""
    import smtplib
    import time
    from opentelemetry import trace
    from opentelemetry.trace import Status, StatusCode
    from flowlens_diag import owin_smtp

    def zapisz(cel, ms, blad):
        host = cel.split(" → ")[0]
        koniec = time.time_ns()
        s = tracer.start_span(f"smtp {cel}", kind=trace.SpanKind.CLIENT, start_time=koniec - int(ms * 1e6),
                              attributes={"messaging.system": "smtp", "messaging.destination.name": cel, "server.address": host})
        if blad:
            s.set_status(Status(StatusCode.ERROR, blad))
        s.end(end_time=koniec)
    owin_smtp(smtplib, zapisz)


def _transakcje_django(tracer):
    """Django: zewnętrzny atomic() → spany BEGIN i COMMIT/ROLLBACK (zagnieżdżone to SAVEPOINT — jest w spanach SQL).
    BEGIN dopiero przy pierwszym zapytaniu w atomic() (tak wysyła go sterownik; atomic bez SQL nie jest transakcją
    w bazie), COMMIT/ROLLBACK pod kodem, który otworzył zewnętrzny atomic() (span bieżący przy wejściu: serwis z
    `with atomic()`), a gdy przy wejściu nie było spanu (@atomic na metodzie wejścia: jej span zaczyna się w środku
    i kończy przed COMMIT) — pod rodzicem BEGIN. Zawsze pod rodzicem BEGIN (leniwy BEGIN w repozytorium) transakcja
    kończyła się w repozytorium i SAVEPOINT zagnieżdżonego atomic() w serwisie był poza nią.
    ROLLBACK także przy set_rollback(True) (DRF przy obsłużonym wyjątku) i przy odrzuconym COMMIT — z faktycznego
    commit() / rollback() połączenia."""
    from opentelemetry import context, trace
    from django.db import transaction
    from django.db.backends import utils

    polaczenie = getattr(transaction, "get_connection", None) or (lambda using=None: transaction.connections[using or "default"])
    oe, ox = transaction.Atomic.__enter__, transaction.Atomic.__exit__

    def wejdz(self):
        try:                                               # @atomic na metodzie z mapy: span przed SAVEPOINT / BEGIN
            wpis = _wczesnie_przed(sys._getframe(1))
        except Exception:
            wpis = None
        pol = polaczenie(self.using)
        try:
            zewn = not pol.in_atomic_block and pol.get_autocommit()
        except Exception:
            zewn = False
        if zewn:
            pol._flowlens_tx = "czeka"
            ctx = context.get_current()
            pol._flowlens_ctx_wejscia = ctx if trace.get_current_span(ctx).get_span_context().is_valid else None
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
                if stan == "otwarta":                              # połączenie zamknięte w transakcji: baza cofa sama
                    _span_tx(tracer, "ROLLBACK", _ctx_konca(pol))
                pol._flowlens_ctx = pol._flowlens_ctx_wejscia = None
            try:
                _wczesnie_po(wartosc)
            except Exception:
                pass

    # koniec z faktycznego commit() / rollback() połączenia (woła je zewnętrzny Atomic.__exit__) — przed on_commit
    from django.db.backends.base.base import BaseDatabaseWrapper

    def _ctx_konca(pol):
        return getattr(pol, "_flowlens_ctx_wejscia", None) or getattr(pol, "_flowlens_ctx", None)

    def koniec(orig, nazwa):
        def f(self, *a, **k):
            wynik = orig(self, *a, **k)
            if getattr(self, "_flowlens_tx", None) == "otwarta":
                self._flowlens_tx = "koniec"
                _span_tx(tracer, nazwa, _ctx_konca(self))
            return wynik
        return f
    BaseDatabaseWrapper.commit = koniec(BaseDatabaseWrapper.commit, "COMMIT")
    BaseDatabaseWrapper.rollback = koniec(BaseDatabaseWrapper.rollback, "ROLLBACK")
    transaction.Atomic.__enter__, transaction.Atomic.__exit__ = wejdz, wyjdz

    def begin(pol, tekst):
        if getattr(pol, "_flowlens_tx", None) != "czeka":
            return
        pol._flowlens_tx, pol._flowlens_ctx = "otwarta", context.get_current()
        if not _BEGIN_SQL.match(str(tekst)):                             # sqlite: Django sam wysyła BEGIN jako SQL
            _span_tx(tracer, "BEGIN")
    for nazwa in ("execute", "executemany"):
        orig = getattr(utils.CursorWrapper, nazwa)

        def owinieta(self, *a, __orig=orig, **k):          # sygnatura oryginału: execute(sql=…) też działa
            try:
                begin(self.db, k["sql"] if "sql" in k else a[0])
            except Exception:
                pass
            return __orig(self, *a, **k)
        setattr(utils.CursorWrapper, nazwa, owinieta)


def bez_petli_logow():
    """Handler logów OTel (OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED) pomija loggery eksportera — patrz
    POMIJANE_LOGI. Na klasie, nie na obiekcie: aplikacja może dołożyć handler później (dictConfig)."""
    ile = 0
    for modul in ("opentelemetry.sdk._logs", "opentelemetry.instrumentation.logging.handler"):
        try:
            klasa = importlib.import_module(modul).LoggingHandler
        except Exception:
            continue
        if "_flowlens_bez_petli" in klasa.__dict__:
            continue
        orig = klasa.emit

        def emit(self, rekord, __orig=orig):
            if str(getattr(rekord, "name", "")).split(".", 1)[0] in POMIJANE_LOGI:
                return None
            return __orig(self, rekord)
        klasa.emit, klasa._flowlens_bez_petli = emit, True
        ile += 1
    return ile


class _PoImporcie:
    """Hak importu: funkcja po wykonaniu modułu (aplikacja importuje SQLAlchemy później niż sitecustomize)."""
    def __init__(self, nazwa, f):
        self.nazwa, self.f = nazwa, f

    def find_spec(self, nazwa, sciezka=None, cel=None):
        if nazwa != self.nazwa or self.f is None:
            return None
        f, self.f = self.f, None
        for k in sys.meta_path:
            if k is self or not hasattr(k, "find_spec"):
                continue
            spec = k.find_spec(nazwa, sciezka, cel)
            if spec is not None:
                break
        else:
            return None
        orig = spec.loader.exec_module

        def exec_module(m):
            orig(m)
            try:
                f()
            except Exception:
                pass
        spec.loader.exec_module = exec_module
        return spec


def wlacz(plik_mapy):
    from opentelemetry import context, trace
    from opentelemetry.trace import Status, StatusCode

    with open(plik_mapy, encoding="utf-8") as f:
        mapa = json.load(f)
    cele = {fq: set(k.get("metody") or []) for fq, k in mapa.get("klasy", {}).items() if k.get("rola") in RYSOWANE and k.get("metody")}
    if not cele:
        return 0
    tracer = trace.get_tracer("flowlens.metody")
    stos_spanow = contextvars.ContextVar("flowlens_spany", default=())   # krotki (ramka, token, span)
    pamiec = {}                                                           # obiekt kodu → (klasa, metoda) albo None

    def klasa_metoda(kod, frame):
        qn = getattr(kod, "co_qualname", None)              # Python 3.11+: "Klasa.metoda", "Zewn.Wewn.metoda"
        modul = frame.f_globals.get("__name__", "")
        if qn is not None:
            if "." not in qn:                              # funkcja modułu: „klasa-moduł” w mapie
                return (modul, qn) if "<" not in qn else None
            kl, met = qn.rsplit(".", 1)
            if "<locals>" in kl:
                return None
        else:                                              # starszy Python: klasa z self / cls (bez bool() na obiektach)
            lok = frame.f_locals
            ja = lok["self"] if "self" in lok else lok.get("cls")
            if ja is None:
                return None
            kl, met = (ja.__name__ if isinstance(ja, type) else type(ja).__qualname__), kod.co_name
        return f"{modul}.{kl}", met

    def cel(kod, frame):
        if kod in pamiec:
            return pamiec[kod]
        km = klasa_metoda(kod, frame)
        if km and km[1] not in cele.get(km[0], ()):
            km = None
        if km and not _z_modulu(frame, frame.f_globals.get("__name__", "")):
            km = None
        if getattr(kod, "co_qualname", None) is not None:  # bez co_qualname klasa zależy od self — nie zapamiętujemy
            pamiec[kod] = km
        return km

    def otworz(frame, km):
        span = tracer.start_span(f"{km[0].rsplit('.', 1)[-1]}.{km[1]}", attributes={"code.namespace": km[0], "code.function": km[1]})
        token = context.attach(trace.set_span_in_context(span))
        stos_spanow.set(stos_spanow.get() + ((frame, token, span),))

    def zamknij(frame, wyjatek=None):
        stos = stos_spanow.get()
        if not stos or stos[-1][0] is not frame:
            return False
        _, token, span = stos[-1]
        stos_spanow.set(stos[:-1])
        if wyjatek is not None:
            span.record_exception(wyjatek)
            span.set_status(Status(StatusCode.ERROR, f"{type(wyjatek).__qualname__}: {wyjatek}"[:300]))
        span.end()
        try:
            context.detach(token)
        except Exception:
            pass
        return True

    # generator po yield: span zamknięty, wznowienie (next / asend / athrow / close) otwiera nowy. Globalnie (nie
    # w kontekście) — generator bywa wznawiany w innym wątku / kopii kontekstu.
    po_yield, wrzucone = {}, {}

    def wydaj(frame, km, wartosc):
        if _prawdziwy_yield(frame.f_code, wartosc) and zamknij(frame):
            po_yield[id(frame)] = frame

    def wznow(frame, km, wyjatek=None):
        if po_yield.pop(id(frame), None) is not None:
            otworz(frame, km)
            if wyjatek is not None:
                wrzucone[id(frame)] = wyjatek

    def zakoncz(frame, wyjatek=None):
        po_yield.pop(id(frame), None)
        wrzucony = wrzucone.pop(id(frame), None)
        if _wczesnie_koniec(frame, wyjatek):
            return
        # wyjątek wrzucony do generatora przy sprzątaniu (athrow, close) i przepuszczony dalej — nie jego błąd
        cudzy = wyjatek is None or wyjatek is wrzucony or isinstance(wyjatek, GeneratorExit)
        zamknij(frame, None if cudzy else wyjatek)

    def bezpiecznie(f):
        def g(*a):
            try:
                return f(*a)
            except Exception:                              # profiler nigdy nie psuje aplikacji
                return None
        return g

    if hasattr(sys, "monitoring") and not os.environ.get("FLOWLENS_SETPROFILE"):
        M = sys.monitoring
        narzedzie = next(i for i in (M.PROFILER_ID, M.OPTIMIZER_ID, 4, 3) if M.get_tool(i) is None)
        M.use_tool_id(narzedzie, "flowlens.metody")

        @bezpiecznie
        def start(kod, off):
            frame = sys._getframe(2)
            km = cel(kod, frame)
            if km is None:
                return M.DISABLE
            if not _wczesnie_start(kod, frame):
                otworz(frame, km)

        @bezpiecznie
        def koniec(kod, off, wartosc):
            frame = sys._getframe(2)
            if cel(kod, frame) is None:
                return M.DISABLE
            zakoncz(frame)

        @bezpiecznie
        def yield_(kod, off, wartosc):
            frame = sys._getframe(2)
            km = cel(kod, frame)
            if km is None:
                return M.DISABLE
            wydaj(frame, km, wartosc)

        @bezpiecznie
        def wznowienie(kod, off):
            frame = sys._getframe(2)
            km = cel(kod, frame)
            if km is None:
                return M.DISABLE
            wznow(frame, km)

        @bezpiecznie
        def rzut(kod, off, wyjatek):                       # PY_THROW / PY_UNWIND nie da się wyłączyć
            frame = sys._getframe(2)
            km = cel(kod, frame)
            if km is not None:
                wznow(frame, km, wyjatek)

        @bezpiecznie
        def odwin(kod, off, wyjatek):
            frame = sys._getframe(2)
            if cel(kod, frame) is not None:
                zakoncz(frame, wyjatek)

        E = M.events
        for zd, f in ((E.PY_START, start), (E.PY_RETURN, koniec), (E.PY_YIELD, yield_), (E.PY_RESUME, wznowienie),
                      (E.PY_THROW, rzut), (E.PY_UNWIND, odwin)):
            M.register_callback(narzedzie, zd, f)
        M.set_events(narzedzie, E.PY_START | E.PY_RETURN | E.PY_YIELD | E.PY_RESUME | E.PY_THROW | E.PY_UNWIND)
        _WYLACZ[:] = [lambda: (M.set_events(narzedzie, 0), M.free_tool_id(narzedzie))]
    else:
        zawieszone = {}                                    # id ramki → ramka: korutyna stoi na await

        def profil(frame, zdarzenie, arg):                 # starszy Python: bez wyjątków metod
            try:
                if zdarzenie == "call":
                    km = cel(frame.f_code, frame)
                    if not km:
                        return
                    if zawieszone.pop(id(frame), None) is not None:   # powrót z await
                        pass
                    elif id(frame) in po_yield:
                        wznow(frame, km)
                    elif not _wczesnie_start(frame.f_code, frame):
                        otworz(frame, km)
                elif zdarzenie == "return":
                    km = cel(frame.f_code, frame)
                    if not km:
                        return
                    if not _zawieszenie(frame):
                        zakoncz(frame)
                    elif _prawdziwy_yield(frame.f_code, arg):
                        wydaj(frame, km, arg)
                        if id(frame) not in po_yield:      # span nie był na wierzchu: wznowienie go nie otwiera
                            zawieszone[id(frame)] = frame
                    else:
                        zawieszone[id(frame)] = frame
            except Exception:
                pass
        sys.setprofile(profil)
        threading.setprofile(profil)
        _WYLACZ[:] = [lambda: (sys.setprofile(None), threading.setprofile(None))]

    _DEKORATOR[0] = (cel, otworz, zamknij)
    for modul, f in (("sqlalchemy.engine", _transakcje), ("django.db.transaction", _transakcje_django), ("smtplib", _smtp)):
        if modul in sys.modules:
            try:
                f(tracer)
            except Exception:
                pass
        else:
            sys.meta_path.insert(0, _PoImporcie(modul, (lambda f_: lambda: f_(tracer))(f)))
    return len(cele)


_WYLACZ = []


def wylacz():
    """Zdejmuje śledzenie metod (testy)."""
    for f in _WYLACZ:
        f()
    _WYLACZ.clear()
    _DEKORATOR[0] = None
