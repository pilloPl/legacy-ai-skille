"""Reguły PHP: Laravel, Symfony i własne mikro-frameworki (role z klas bazowych, interfejsów, importów, katalogów i nazw).
Umowa jak w entry-flows/rules.

k: dict z polami nazwa, fqn (z kropkami), pakiet, plik, bazowe („extends X implements Y, Z”, przechodnio), metody.
DETECT liczy z importów (use …) i atrybutów, które klasy są komendami konsoli — reguła dostaje tylko k."""
import re

JEZYK = "php"
ORDER = 40
_STAN = {"konsola": set(), "atrybuty": {}, "laravel": False}

# nazwy techniczne niezależne od frameworka; Middleware / Notification / Provider tylko z sygnałem frameworka (niżej)
TECH_NAZWA = re.compile(r"(Exception|Error|Request|Resource|Collection|Kernel|Factory|Seeder|Migration|Policy|Rule|Cast|Test|"
                        r"Dto|DTO|Enum|Interface|Trait|Mail|Event)$")
KONSOLA_BAZA = re.compile(r"^(Symfony\\Component\\Console\\Command\\Command|Illuminate\\Console\\Command|Illuminate\\Console\\Scheduling\\\w+)$")


def DETECT(p):
    php = [k for k in p.klasy.values() if k["jezyk"] == "php"]
    if not php: return False
    konsola, atrybuty = set(), {}
    for k in php:
        linie = p.zrodlo(k["plik"])
        tekst = "\n".join(linie)
        uzycia = dict((u.split("\\")[-1] if not a else a, u) for u, a in re.findall(r"^\s*use\s+\\?([\w\\]+)(?:\s+as\s+(\w+))?\s*;", tekst, re.M))
        # atrybuty klasy (#[AsCommand(...)] w kilku liniach): od początku klasy w CodeGraph do deklaracji
        nad = "\n".join(linie[max(0, k["linia"] - 15):k["linia"] + 15])
        dekl = re.search(r"(?:#\[[^\]]*\]\s*|\s)*\b(?:final\s+|abstract\s+|readonly\s+)*class\s+" + re.escape(k["nazwa"]) + r"\b", nad)
        atr = set(re.findall(r"#\[\s*\\?(?:[\w\\]+\\)?(\w+)", nad[:dekl.end()] if dekl else ""))
        atrybuty[k["fqn"]] = atr
        e = re.search(r"\bclass\s+" + re.escape(k["nazwa"]) + r"\s+extends\s+\\?([\w\\]+)", tekst)
        baza = e.group(1) if e else ""
        pelna = baza if "\\" in baza else uzycia.get(baza, baza)
        if KONSOLA_BAZA.match(pelna) or "AsCommand" in atr: konsola.add(k["nazwa"])
        if pelna.startswith("Illuminate\\"): _STAN["laravel"] = True
    # przechodnio (bazowe są już przechodnie): Kanboard CronjobCommand → BaseCommand → Symfony Command
    for k in php:
        if any(b.split("\\")[-1] in konsola for b in re.split(r"[\s,]+", k.get("bazowe", "")) if b): konsola.add(k["nazwa"])
    _STAN["konsola"], _STAN["atrybuty"] = konsola, atrybuty
    _STAN["laravel"] = _STAN["laravel"] or any("/Http/Controllers/" in k["plik"] or k["plik"].startswith("app/Providers/") for k in php)
    return True


def klasyfikuj(k):
    n, baz, plik = k["nazwa"], k.get("bazowe", ""), k["plik"]
    atr = _STAN["atrybuty"].get(k["fqn"], set())
    laravel = _STAN["laravel"]
    if k["rodzaj"] == "interface":
        return "pomin", "interfejs (rysujemy implementację)", "pewne"
    if re.search(r"\b(\w*Exception|Throwable)\b", baz) or TECH_NAZWA.search(n) or re.search(r"/(Http/Requests|Http/Resources|database)/", plik):
        return "pomin", "techniczna (nazwa / katalog)", "pewne"
    # rejestracja DI (ServiceProvider Laravela, Pimple ServiceProviderInterface) — kompozycja przy starcie
    if re.search(r"\b(ServiceProvider|ServiceProviderInterface)\b", baz) or "/Providers/" in plik or (laravel and n.endswith("Provider")):
        return "pomin", "rejestracja usług (ServiceProvider)", "pewne"
    if laravel and (re.search(r"/Http/Middleware/|(^|/)app/Notifications/|(^|/)app/Exceptions/", plik) or re.search(r"\bNotification\b", baz) and n.endswith("Notification")):
        return "pomin", "techniczna Laravela (middleware / powiadomienie)", "pewne"
    if re.search(r"(Controller)$", n) or "/Http/Controllers/" in plik or re.search(r"\bAbstractController\b", baz):
        return "wejscie", "kontroler HTTP", "pewne"
    if re.search(r"\bShouldQueue\b", baz) or "/Jobs/" in plik:
        return "wejscie", "job kolejki (ShouldQueue)", "pewne"
    # komenda konsoli: extends Symfony\Component\Console\Command\Command / Illuminate\Console\Command (także przez własną
    # bazę) albo #[AsCommand]. Klasa *Command implementująca interfejs szyny to DTO komendy, nie wejście.
    if n in _STAN["konsola"] or "AsCommand" in atr or "/Console/Commands/" in plik:
        if k["abstrakcyjna"]: return "pomin", "baza komend konsoli", "pewne"
        return "wejscie", "komenda konsoli (artisan / Symfony Console)", "pewne"
    if n.endswith(("Command", "Query")) and not [m for m in k["metody"] if m["koniec"] - m["linia"] > 3 and m["nazwa"] != "__construct"]:
        return "pomin", "DTO komendy / zapytania szyny", "pewne"
    if re.search(r"(CommandHandler|QueryHandler)$", n) or re.search(r"\b(CommandHandler|QueryHandler)\b", baz):
        return "aplikacja", "handler komendy / zapytania (szyna w procesie)", "do potwierdzenia"
    if "AsMessageHandler" in atr or re.search(r"\bMessageHandlerInterface\b", baz):
        return "wejscie", "handler wiadomości (Symfony Messenger)", "do potwierdzenia"
    if "/Listeners/" in plik or re.search(r"\bEventSubscriberInterface\b", baz) or re.search(r"(Listener|Subscriber)$", n):
        return "wejscie", "listener / subscriber zdarzeń", "do potwierdzenia"
    if re.search(r"\b(SessionHandlerInterface|SessionUpdateTimestampHandlerInterface)\b", baz):
        # własny magazyn sesji aplikacji w bazie (Kanboard SessionHandler: $this->db->table('sessions')) — pisze do bazy
        # w każdym requeście, więc jest właścicielem tej transakcji i SQL; handler bez bazy (pliki, pamięć) — infrastruktura
        if any(re.search(r"->db\b|->table\(|\bPDO\b|->(?:query|prepare|exec|execute)\(|\bDB::", m.get("cialo") or "") for m in k["metody"]):
            return "repozytorium", "magazyn sesji w bazie (SessionHandlerInterface)", "do potwierdzenia"
        return "pomin", "obsługa sesji PHP (SessionHandlerInterface)", "pewne"
    # procedury JSON-RPC (Kanboard Api/Procedure, JsonRPC withObject) — wejście API; baza procedur (autoryzacja) — aplikacja
    if re.search(r"/Api/Procedures?/|/Rpc/|/JsonRpc/", plik) or n.endswith("Procedure"):
        if k["abstrakcyjna"] or n.startswith("Base"): return "aplikacja", "baza procedur JSON-RPC (autoryzacja przed procedurą)", "do potwierdzenia"
        return "wejscie", "procedura JSON-RPC", "do potwierdzenia"
    if re.search(r"(Repository|Repo|Dao|DAO)$", n) or re.search(r"\bServiceEntityRepository\b|\bEntityRepository\b", baz):
        return "repozytorium", "nazwa *Repository / *Dao", "pewne"
    if re.search(r"\bModel\b|\bAuthenticatable\b|\bPivot\b", baz) or "/Models/" in plik:
        return "domena", "encja (Eloquent Model)", "pewne"
    # middleware własnego frameworka z logiką (uwierzytelnianie, autoryzacja) — krok każdego requestu
    if re.search(r"Middleware$", n):
        if not [m for m in k["metody"] if m["koniec"] - m["linia"] > 2]: return "pomin", "middleware bez logiki", "pewne"
        return "aplikacja", "middleware z logiką (uwierzytelnianie / autoryzacja)", "do potwierdzenia"
    if re.search(r"(Facade|ApplicationService|UseCase|Handler)$", n):
        return "aplikacja", "nazwa fasady / serwisu aplikacyjnego / handlera", "do potwierdzenia"
    if not k["metody"]:
        return "pomin", "brak metod", "pewne"
    return "domena", "klasa z logiką", "do potwierdzenia"
