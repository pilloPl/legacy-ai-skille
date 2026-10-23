"""Reguły Pythona: role klas z dekoratorów, klas bazowych i konwencji nazw (SQLAlchemy, pydantic, dataclasses,
FastAPI/Django/Flask). Umowa jak w entry-flows/rules.

k: dict z polami nazwa, fqn, pakiet, plik, adnotacje (dekoratory), bazowe (lista klas bazowych jako tekst),
metody [{nazwa, adnotacje, linia, koniec, ...}].
"""
import re

JEZYK = "python"
ORDER = 30

def DETECT(p):
    return any(k["jezyk"] == "python" for k in p.klasy.values())

TECH_NAZWA = re.compile(r"(Exception|Error|Mapper|Converter|Dto|DTO|Request|Response|Settings|Config|Schema|Serializer|"
                        r"Factory|Builder|Utils?|Helper|Mixin|Admin|Migration|Test)$")
TECH_PAKIET = re.compile(r"\.(config|settings|migrations|utils?|common|schemas|serializers|api|web|views|routers|tests?)(\.|$)")


# Django: model (także przez własną bazę abstrakcyjną — bazowe są przechodnie), przed regułą pydantic: własna klasa
# BaseModel(models.Model) to encja, nie DTO
ENCJA_DJANGO = re.compile(r"\b(models\.Model|db\.Model|AbstractBaseUser|AbstractUser|PermissionsMixin|DeclarativeBase|MappedAsDataclass|AsDataclass)\b")
LOGOWANIE = re.compile(r"\blogging\.\w*(Handler|Filter|Formatter)\b|\b(StreamHandler|FileHandler|RotatingFileHandler|TimedRotatingFileHandler|"
                       r"QueueHandler|NullHandler|SysLogHandler|HTTPHandler|SMTPHandler)\b")
WALIDATORY = {"validator", "field_validator", "root_validator", "model_validator", "computed_field", "property", "field_serializer",
              "model_serializer", "cached_property"}


def _metody_z_cialem(k):
    return [m for m in k["metody"] if not re.fullmatch(r"__\w+__", m["nazwa"])]


def doczytuje_relacje(k):
    """Metoda mapująca obiekt z parametru, która idzie po nim dwa poziomy w głąb (w.ksiazka.autor.nazwisko) — przy modelu
    ORM to leniwe doczytanie relacji (osobny SELECT na obiekt, N+1), czyli krok z dostępem do bazy, nie samo DTO."""
    for m in k["metody"]:
        cialo = m.get("cialo") or ""
        sygn = re.search(r"\bdef\s+\w+\s*\(((?:[^()]|\([^()]*\))*)\)", cialo)
        if not sygn: continue
        prm = {re.split(r"[\s:=]", x.strip().lstrip("*"))[0] for x in sygn.group(1).split(",")} - {"self", "cls", ""}
        reszta = cialo[sygn.end():]
        if any(re.search(r"(?<![\w.])" + re.escape(p_) + r"\.(?!_)\w+\.(?!_)\w+\b(?!\s*\()", reszta) for p_ in prm): return True
    return False


def klasyfikuj(k):
    n, baz, dek = k["nazwa"], k.get("bazowe", ""), k["adnotacje"]
    if LOGOWANIE.search(baz):
        return "pomin", "infrastruktura logowania (logging.Handler / Filter)", "pewne"
    # DTO / mapper, który z modelu ORM czyta relacje (w.ksiazka.autor.nazwisko): leniwe doczytania to SQL tego kroku
    if re.search(r"(Dto|DTO|Mapper|Converter)$", n) and not re.search(r"\b(Exception|Error|BaseModel|Schema)\b", baz) \
            and doczytuje_relacje(k):
        return "domena", "mapowanie modelu z doczytaniem relacji (w.relacja.pole — możliwe N+1)", "do potwierdzenia"
    if re.search(r"\b(Exception|Error|BaseException)\b", baz) or (TECH_NAZWA.search(n) and not n.endswith("Admin")):
        return "pomin", "techniczna (nazwa / wyjątek)", "pewne"
    if re.search(r"\b(Protocol|ABC|Generic)\b", baz) and not [m for m in k["metody"] if m["koniec"] - m["linia"] > 2]:
        return "pomin", "interfejs (Protocol/ABC) — rysujemy implementację", "pewne"
    if ENCJA_DJANGO.search(baz) or re.search(r"\b(Base|Model)\b", baz) and not re.search(r"\bBaseModel\b", baz):
        return "domena", "encja ORM (SQLAlchemy / Django)", "pewne"
    # dataclass bez zachowania (komenda, zdarzenie, wartość) — przed regułą wejść: class Allocate(Command) to dane, nie wejście
    if "dataclass" in dek and not _metody_z_cialem(k):
        return "pomin", "wartość (@dataclass bez zachowania)", "do potwierdzenia"
    if re.search(r"\b(BaseModel|BaseSettings)\b", baz):
        # model pydantic z własnymi metodami domenowymi (UserInDB.check_password) — nie sam DTO
        dom = [m for m in _metody_z_cialem(k) if not (m["adnotacje"] & WALIDATORY) and m["nazwa"] not in ("Config", "dict", "json")]
        if dom and "BaseSettings" not in baz:
            return "domena", "model pydantic z metodami domenowymi", "do potwierdzenia"
        return "pomin", "DTO (pydantic)", "do potwierdzenia"
    if re.search(r"\b(TypedDict|NamedTuple|Enum|IntEnum|StrEnum|TextChoices|IntegerChoices)\b", baz):
        return "pomin", "wyliczenie / krotka (Enum, TypedDict)", "do potwierdzenia"
    # Django admin: akcje (@admin.action, actions = [...]) to wejście z panelu; sam ModelAdmin bez akcji — konfiguracja
    if n.endswith("Admin") or re.search(r"\b(ModelAdmin|admin\.ModelAdmin)\b", baz):
        if [m for m in k["metody"] if m["adnotacje"] & {"action", "admin.action"}]:
            return "wejscie", "akcje panelu Django admin (@admin.action)", "do potwierdzenia"
        return "pomin", "konfiguracja panelu admin", "pewne"
    # komenda konsoli tylko z bazy Django (BaseCommand…), nie każda klasa o bazie „Command” (komendy szyny to dane)
    if re.search(r"\b(\w*APIView|\w*View|\w*ViewSet|Resource|MethodView|Consumer|BaseCommand|AppCommand|LabelCommand)\b", baz) \
            or re.search(r"(Controller|Endpoint|Handler|Listener|Consumer)$", n):
        return "wejscie", "kontroler / handler wejścia", "do potwierdzenia"
    if re.search(r"(Repository|Repo|Dao|DAO)$", n):
        return "repozytorium", "nazwa *Repository / *Dao", "pewne"
    # szyna komend/zdarzeń (MessageBus.handle) — warstwa aplikacji, korzeń przebiegu konsumenta
    if re.search(r"(Bus|MessageBus|Dispatcher|Mediator)$", n):
        return "aplikacja", "szyna komend / zdarzeń", "do potwierdzenia"
    if re.search(r"(Facade|ApplicationService|UseCase|Service)$", n):
        rola = "aplikacja" if re.search(r"(Facade|ApplicationService|UseCase)$", n) else "domena"
        return rola, f"nazwa *{re.search(r'(Facade|ApplicationService|UseCase|Service)$', n).group(1)}", "do potwierdzenia"
    if TECH_PAKIET.search("." + k["pakiet"]):
        return "pomin", "pakiet techniczny", "do potwierdzenia"
    if not _metody_z_cialem(k):
        return "pomin", "brak metod poza __dunder__", "pewne"
    return "domena", "klasa z logiką poza pakietami technicznymi", "do potwierdzenia"
