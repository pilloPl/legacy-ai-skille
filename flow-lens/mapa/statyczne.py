#!/usr/bin/env python3
"""Przebiegi statyczne z CodeGraph: dla każdego wejścia (kontroler, endpoint SOAP, handler, job) drzewo wywołań przez
klasy z mapy, w kolejności linii, z tabelami przy miejscach dostępu do danych. To szkielet „którędy może pójść”
— bez wykonania. flow-lens nakłada na niego SQL złapany w runtime (log bazy, log ORM) → przebieg hybrydowy.

Użycie: python3 statyczne.py <repo> [--mapa <repo>/.flow-lens/mapa.json] [--wyjscie <repo>/.flow-lens/statyczne.json]
"""
import argparse, json, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zbuduj_mape import Projekt, dekoratory_py, czytaj, modul_pythona  # noqa: E402

RYSOWANE = {"wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"}
MAPPING = re.compile(r'@(Get|Post|Put|Delete|Patch|Request)Mapping\b(?:\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?([^)]*)\))?')
HTTP = {"Get": "GET", "Post": "POST", "Put": "PUT", "Delete": "DELETE", "Patch": "PATCH", "Request": ""}
# Nest (TypeScript): @Controller("prefiks") na klasie, @Get("ścieżka") na metodzie
NEST_KLASA = re.compile(r'@Controller\s*\(\s*(?:[\'"`]([^\'"`]*)[\'"`]|\{[^}]*path\s*:\s*[\'"`]([^\'"`]*)[\'"`][^}]*\})?\s*\)')
NEST_METODA = re.compile(r'@(Get|Post|Put|Delete|Patch|All)\s*\(\s*(?:[\'"`]([^\'"`]*)[\'"`])?\s*\)')
# Django: path("x/<int:id>", modul.Klasa.as_view()) w urls.py (_django_trasy); metoda HTTP = nazwa metody widoku
DJANGO_METODY = {"get": "GET", "post": "POST", "put": "PUT", "patch": "PATCH", "delete": "DELETE"}
# Express z klasami: app.post('/x/:id', kontroler.metoda.bind(kontroler)) + const kontroler = new KlasaController(…)
EXPRESS_TRASA = re.compile(r'\b(?:app|router|\w+Router)\.(get|post|put|delete|patch)\(\s*[\'"`]([^\'"`]+)[\'"`]\s*,(?:[^;]*?,)?\s*(\w+)\.(\w+)(?:\.bind\(\s*\w+\s*\))?\s*\)')
EXPRESS_NEW = re.compile(r'\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+)\s*\(')
SQL_LITERAL = re.compile(r'(?:"""|\'\'\'|`)\s*((?:select|insert|update|delete|with|merge|call)\b.*?)(?:"""|\'\'\'|`)|["\']((?:select|insert|update|delete|with|merge|call)\b[^"\'\n]*)["\']', re.I | re.S)
# identyfikator jak w hybryda.mjs: zwykły, "ANSI", `MySQL`, [SQL Server], z opcjonalnym schematem
IDENT = r'(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$#]+)'
# typy klientów innych systemów (pole wołane wprost: kafka.send(…) w klasie z mapy) — jak w KLIENT_INNEGO_SYSTEMU
TYPY_KLIENTOW = {"RestTemplate", "RestClient", "WebClient", "OkHttpClient", "CloseableHttpClient", "HttpClient", "KafkaTemplate",
                 "JmsTemplate", "RabbitTemplate", "AmqpTemplate", "StreamBridge", "SqsTemplate", "SnsTemplate", "WebServiceTemplate",
                 "JavaMailSender", "SmtpClient", "S3Client", "DynamoDbClient", "ServiceBusClient", "IPublishEndpoint", "KafkaProducer",
                 "ClientProxy", "HttpService", "ServiceBusSender", "IProducer"}
TABELA = re.compile(r'\b(?:from|join|into|update|delete\s+from|merge\s+into)\s+(' + IDENT + r'(?:\s*\.\s*' + IDENT + r')*)', re.I)


# PHP heredoc / nowdoc: <<<'SQL' … SQL (surowy SQL w DB::select)
HEREDOC = re.compile(r"<<<\s*['\"]?(\w+)['\"]?\s*\n(.*?)\n\s*\1\b", re.S)
# koniec literału, „+”, początek następnego: "SELECT " + "FROM x" → "SELECT FROM x" (tylko literał + literał)
SKLEJENIE = re.compile(r"(?<=[^\\\"])\"[ \t]*\+[ \t]*(?:\r?\n[ \t]*)?\"(?!\")|(?<=[^\\'])'[ \t]*\+[ \t]*(?:\r?\n[ \t]*)?'(?!')")


def literaly_sql(tekst):
    """Teksty SQL z kodu: literały w cudzysłowach, text blocki / backticki, heredoc PHP. Literały sklejane „+”
    (także przez kilka linii: const string sql = "SELECT " +\\n "[Order].[Id] " + … — Dapper) łączymy w jeden."""
    tekst = SKLEJENIE.sub("", tekst)
    wynik = [b or l for b, l in SQL_LITERAL.findall(tekst)]
    wynik += [h.strip() for _, h in HEREDOC.findall(tekst) if re.match(r"\s*(select|insert|update|delete|with|merge|call)\b", h, re.I)]
    return wynik


def tabele_sql(sql, encje=None):
    """Tabele z SQL. Z encje (nazwa encji → tabela) także JPQL/HQL: FROM Owner o → tabela encji, „join fetch o.pets”
    (ścieżka relacji przez alias) pomijamy — to tabele możliwe, nie jawne."""
    cte = {m.group(1).lower() for m in re.finditer(r'(?:\bwith\s+(?:recursive\s+)?|,)\s*(\w+)\s*(?:\([^)]*\))?\s+as\s*\(', sql, re.I)}
    wynik = []
    sql = re.sub(r"\bjoin\s+fetch\s+", "join ", sql, flags=re.I)
    for m in TABELA.finditer(re.sub(r"'(?:[^']|'')*'", "''", sql)):
        surowa = re.sub(r'["`\[\]]', "", re.sub(r'\s*\.\s*', ".", m.group(1)))
        if encje is not None and surowa in encje:
            if encje[surowa] not in wynik: wynik.append(encje[surowa])
            continue
        if encje is not None and "." in surowa and surowa.split(".")[0][:1].islower() and re.search(r"\b(?i:from)\s+[A-Z]", sql): continue
        t = surowa.split(".")[-1].lower()
        if t and t not in cte and t not in ("select", "lateral", "values", "dual", "set", "fetch") and t not in wynik:
            wynik.append(t)
    return wynik


RZUT = re.compile(r"::\s*[a-z_]\w*(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone))?(?:\s*\([\d\s,]*\))?(?:\s*\[\])*")


def normalizuj(sql):
    """Kopia 1:1 normalizuj() z zrodla/log-bazy.mjs (zmieniaj oba miejsca razem; test test_korpus_sql_zgodnosc)."""
    s = re.sub(r"'(?:[^']|'')*'", "?", str(sql or "").lower())
    s = re.sub(r"/\*[\s\S]*?\*/", " ", s)
    s = re.sub(r"--[^\n]*", " ", s)
    s = RZUT.sub("", s)
    s = re.sub(r"%\(\w+\)s|%s|\$\d+|\?\d+|(?<![\w:@]):(?:[a-z_]\w*|\d+)|(?<![\w@])@[a-z_]\w*", "?", s)
    s = re.sub(r"(?<![\w.?])\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w.])|\?\.\?", "?", s)
    s = re.sub(r"\b(?:null|true|false)\b", "?", s)
    s = re.sub(r"([=<>(,]\s*)-\s*\?", r"\1?", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    s = re.sub(r"\s*,\s*", ", ", s)
    s = re.sub(r"\s*;\s*$", "", s)
    s = re.sub(r"\(\?(?:, \?)*\)", "(?)", s)
    s = re.sub(r"\(\?\)(?:, \(\?\))+", "(?)", s)
    return s.strip()


def zloz_sciezke(*czesci):
    """Spring: context-path + @RequestMapping klasy + metody — „api” znaczy „/api”, bez podwójnych „/”; pusta → „/”."""
    return "/" + "/".join(x.strip("/") for x in czesci if x and x.strip("/"))


def snake(nazwa):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", nazwa).lower()


# metody kolekcji / odpowiedzi HTTP w PHP (Laravel Collection, Response) — po samej nazwie łatwo o fałszywy cel
GENERYCZNE_PHP = {"json", "filter", "map", "each", "first", "all", "count", "toArray", "toJson", "pluck", "sortBy", "values", "keys",
                  "merge", "push", "put", "forget", "transform", "reduce", "sum", "avg", "has", "only", "except", "with", "make",
                  "render", "view", "response", "redirect", "back", "abort", "get", "set", "find", "where", "flatten", "unique",
                  "contains", "isEmpty", "isNotEmpty", "last", "slice", "chunk", "groupBy", "keyBy", "mapWithKeys", "sort"}

# Laravel (Doctrine Inflector): rzeczowniki bez liczby mnogiej i nieregularne — tabela domyślna modelu = liczba mnoga
# ostatniego słowa nazwy w snake_case (EntityContainerData → entity_container_data, Person → people)
NIEPOLICZALNE = {"data", "metadata", "information", "equipment", "feedback", "news", "series", "species", "sheep", "fish",
                 "deer", "media", "audio", "education", "knowledge", "staff", "traffic", "software", "hardware", "chassis",
                 "rice", "money", "moose", "police", "evidence", "advice", "emoji", "cattle", "pokemon", "coreopsis", "gold"}
NIEREGULARNE = {"person": "people", "child": "children", "man": "men", "woman": "women", "foot": "feet", "tooth": "teeth",
                "goose": "geese", "mouse": "mice", "ox": "oxen", "leaf": "leaves", "life": "lives", "knife": "knives",
                "wife": "wives", "criterion": "criteria", "analysis": "analyses", "status": "statuses", "index": "indices",
                "matrix": "matrices", "vertex": "vertices", "quiz": "quizzes", "alias": "aliases", "axis": "axes"}


def mnoga(snake_nazwa):
    *przed, ost = snake_nazwa.split("_")
    if ost in NIEPOLICZALNE: pl = ost
    elif ost in NIEREGULARNE: pl = NIEREGULARNE[ost]
    elif re.search(r"[^aeiou]y$", ost): pl = ost[:-1] + "ies"
    elif re.search(r"(s|x|z|ch|sh)$", ost): pl = ost + "es"
    else: pl = ost + "s"
    return "_".join(przed + [pl])


def mapowanie(tekst, stale=None):
    """Adnotacja mapowania Springa w tekście (także wieloliniowa, z atrybutami): → (metoda HTTP | "", wyrażenie ścieżki)
    albo None. @RequestMapping(method = RequestMethod.POST, value = OwnersApi.PATH_ADD_OWNER, …), @GetMapping("/x"),
    @GetMapping(value = {"/a", "/b"}) — bierzemy pierwszą ścieżkę."""
    m = re.search(r"@(Get|Post|Put|Delete|Patch|Request)Mapping\b", tekst)
    if not m: return None
    i, glebia, args = m.end(), 0, ""
    while i < len(tekst) and tekst[i] in " \t\n": i += 1
    if i < len(tekst) and tekst[i] == "(":
        glebia, i = 1, i + 1
        while i < len(tekst) and glebia:
            c = tekst[i]; i += 1
            glebia += (c == "(") - (c == ")")
            if glebia: args += c
    metoda = HTTP[m.group(1)]
    mm = re.search(r"\bmethod\s*=\s*\{?\s*(?:RequestMethod\.)?(\w+)", args)
    if mm and not metoda: metoda = mm.group(1).upper()
    w = re.search(r"\b(?:value|path)\s*=\s*(\{[^}]*\}|[^,]+)", args)
    if w: wyr = w.group(1)
    elif args.strip() and not re.match(r"\s*\w+\s*=", args): wyr = re.split(r",(?![^{]*\})", args)[0]
    else: wyr = ""
    wyr = wyr.strip()
    if wyr.startswith("{"): wyr = wyr.strip("{} \n").split(",")[0]
    return metoda, wyr.strip()


class Statyczne:
    def __init__(self, repo, mapa):
        self.p = Projekt(repo)
        self.mapa = mapa
        self.rola = {}                                   # klucz klasy → rola z mapy
        for klucz, k in self.p.klasy.items():
            self.rola[klucz] = (mapa["klasy"].get(k["fqn"]) or {}).get("rola", "pomin")
        q = self.p.c.execute
        self.wyw = defaultdict(list)                     # id metody → [(linia, id metody celu)]
        kol = {r[1] for r in q("pragma table_info(edges)")}
        meta = "metadata" if "metadata" in kol else "''"
        self.kolumny = {}                                # (id źródła, linia, id celu | tekst ref) → kolumna wywołania
        for s, t, linia, md, c in q(f"select source, target, line, {meta}, {'col' if 'col' in kol else 'null'} from edges where kind='calls'"):
            # MediatR: CodeGraph łączy Send(new X.Command) ze wszystkimi handlerami po krótkiej nazwie typu — rozwiązujemy
            # po pełnym typie żądania w mediatr()
            if md and "mediatr-dispatch" in str(md): continue
            if s in self.p.metody and t in self.p.metody:
                if self._nadpisanie(s, t, linia): continue
                self.wyw[s].append((linia or 0, t))
                if c is not None: self.kolumny.setdefault((s, linia or 0, t), c)
        # implementacje w stałej kolejności (plik#klasa) — zbiór dawał inne drzewo przy każdym uruchomieniu (PYTHONHASHSEED)
        self.impl = {i: sorted(v) for i, v in self.p.implementacje.items()}
        # wywołania, których CodeGraph nie rozwiązał (lambda, generyki, łańcuchy jak getBean().findTariffs()):
        # dopasowujemy po nazwie metody w klasach z mapy, ale tylko takich, które plik wołającego „zna” (nazwa klasy
        # albo jej interfejsu występuje w pliku) — węzeł dostaje „zgadniety”: true
        self.po_nazwie = defaultdict(list)
        for mid, (klucz, nazwa) in self.p.metody.items():
            if self.rola.get(klucz) in RYSOWANE: self.po_nazwie[nazwa].append(mid)
        self.nierozw = defaultdict(list)
        kol_u = {r[1] for r in q("pragma table_info(unresolved_refs)")}
        for zrodlo, ref, linia, c in q(f"select from_node_id, reference_name, line, {'col' if 'col' in kol_u else 'null'} from unresolved_refs where reference_kind='calls'"):
            if zrodlo in self.p.metody:
                self.nierozw[zrodlo].append((linia, ref))
                if c is not None: self.kolumny.setdefault((zrodlo, linia or 0, ref), c)
        self.stale = self._stale()
        self.encje = self._encje()

    def _nadpisanie(self, s, t, linia):
        """Krawędź „calls” z linii deklaracji metody do metody o tej samej nazwie w podtypie — CodeGraph zapisuje tak
        nadpisanie metody default interfejsu (PatronEvent.normalize → BookPlacedOnHoldEvents.normalize), a nie wywołanie."""
        (ks, ns), (kt, nt) = self.p.metody[s], self.p.metody[t]
        if ns != nt or ks == kt: return False
        ms = next((x for x in self.p.klasy[ks]["metody"] if x["id"] == s), None)
        if not ms or linia != ms["linia"]: return False
        return self.p.klasy[ks]["nazwa"] in self.nadtypy(self.p.klasy[kt]["nazwa"])

    def _zna(self, tekst, klucz):
        k = self.p.klasy[klucz]
        nazwy = [k["nazwa"]] + [n.strip().split("<")[0] for n in (k.get("implementuje", "") + "," + k.get("rozszerza", "")).split(",") if n.strip()]
        nazwy += self._menedzery().get(k["nazwa"], [])                     # Django: Model.objects.m() → menedżer modelu
        return any(re.search(r"\b" + re.escape(n) + r"\b", tekst) for n in nazwy if n)

    def _menedzery(self):
        """Django: klasa menedżera → modele, które go używają (objects = BaseUserManager())."""
        if not hasattr(self, "_mgr"):
            self._mgr = defaultdict(list)
            for k in self.p.klasy.values():
                if k["jezyk"] != "python" or k["rodzaj"] == "modul": continue
                cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
                for mgr in re.findall(r"^\s+\w+\s*=\s*(\w+)\(\s*\)", cialo, re.M):
                    if mgr.endswith("Manager") or mgr.endswith("QuerySet"): self._mgr[mgr].append(k["nazwa"])
        return self._mgr

    # stałe String (static final) do składania ścieżek, np. TARIFF = CONSOLE + "/tariff"
    def _stale(self):
        surowe = {}
        for k in self.p.klasy.values():
            for linia in self.p.zrodlo(k["plik"]):
                m = re.search(r'static\s+final\s+String\s+(\w+)\s*=\s*(.+?);', linia)
                if m: surowe[m.group(1)] = m.group(2)
        wynik = {}
        def licz(nazwa, glebokosc=0):
            if nazwa in wynik: return wynik[nazwa]
            if glebokosc > 10 or nazwa not in surowe: return None
            czesci = []
            for cz in surowe[nazwa].split("+"):
                cz = cz.strip()
                if cz.startswith('"'): czesci.append(cz.strip('"'))
                else:
                    v = licz(cz.split(".")[-1], glebokosc + 1)
                    if v is None: return None
                    czesci.append(v)
            wynik[nazwa] = "".join(czesci)
            return wynik[nazwa]
        for n in surowe: licz(n)
        return wynik

    def _sciezka(self, wyr):
        wyr = wyr.strip().strip("{}").split(",")[0].strip()
        if not wyr: return ""
        czesci = []
        for cz in wyr.split("+"):
            cz = cz.strip()
            if cz.startswith('"'): czesci.append(cz.strip('"'))
            else: czesci.append(self.stale.get(cz.split(".")[-1], "{" + cz + "}"))
        return "".join(czesci)

    # encje: prosta nazwa → tabela (@Table(name=...) albo nazwa klasy)
    def _encje(self):
        wynik = {}
        self.encje_php = {}                                                  # PHP: FQN modelu (z kropkami) → tabela
        self.eloquent = set()                                                # PHP: FQN modeli Eloquent (Model::find…)
        for k in self.p.klasy.values():
            linie = self.p.zrodlo(k["plik"])
            if "Entity" in k["adnotacje"]:                                   # JPA, TypeORM
                tekst = " ".join(linie[max(0, k["linia"] - 8):k["linia"] + 2])
                m = re.search(r'@Table\s*\(\s*(?:name\s*=\s*)?"([^"]+)"', tekst) or re.search(r'@Entity\s*\(\s*(?:\{[^}]*name\s*:\s*)?[\'"`]([^\'"`]+)[\'"`]', tekst)
                wynik[k["nazwa"]] = (m.group(1) if m else snake(k["nazwa"])).lower()
                continue
            if k["jezyk"] == "python" and re.search(r"\b(Model|DeclarativeBase|Base)\b", k.get("bazowe", "")):
                cialo = "\n".join(linie[k["linia"] - 1:k["koniec"]])
                m = re.search(r'__tablename__\s*=\s*[\'"]([^\'"]+)', cialo) or re.search(r'db_table\s*=\s*[\'"]([^\'"]+)', cialo)
                if m: wynik[k["nazwa"]] = m.group(1).lower()
                elif re.search(r"\bmodels\.Model\b|\bModel\b", k.get("bazowe", "")) and "abstract = True" not in cialo:
                    wynik[k["nazwa"]] = f'{self._etykieta_django(k)}_{k["nazwa"].lower()}'   # Django: <etykieta aplikacji>_<model>
            if k["jezyk"] == "csharp":                                   # EF Core: [Table("t")] na encji
                tekst = " ".join(linie[max(0, k["linia"] - 4):k["linia"]])
                m = re.search(r'\[Table\(\s*"([^"]+)"', tekst)
                if m: wynik[k["nazwa"]] = m.group(1).lower()
            if k["jezyk"] == "php":
                # Eloquent: model bezpośrednio albo przez własną bazę (Book → Entity → Model); $table od najbliższego
                # przodka, który go ustawia (Entity: 'entities'), inaczej snake_case w liczbie mnogiej
                lancuch = self._przodkowie_php(k)
                if re.search(r"\b(Model|Pivot|Authenticatable)\b", k.get("rozszerza", "") or k.get("bazowe", "")) or \
                        any(re.fullmatch(r"Model|Pivot|Authenticatable|MorphPivot", n) for n in lancuch["nazwy"]):
                    tab = next((t_ for t_ in lancuch["tabele"] if t_), None)
                    wynik[k["nazwa"]] = (tab or mnoga(snake(k["nazwa"]))).lower()
                    self.encje_php[k["fqn"]] = wynik[k["nazwa"]]
                    self.eloquent.add(k["fqn"])
        # Doctrine: mapowanie XML (<entity name="FQN" table="t">) i atrybuty #[ORM\Table(name: "t")] / #[ORM\Entity]
        for plik in self._pliki_repo((".orm.xml", ".dcm.xml")):
            for nazwa, atr in re.findall(r'<entity\b[^>]*?\bname="([\w\\]+)"([^>]*)>', "\n".join(self.p.zrodlo(plik))):
                tab = re.search(r'\btable="([^"]+)"', atr)
                prosta = nazwa.split("\\")[-1]
                self.encje_php[nazwa.replace("\\", ".")] = (tab.group(1) if tab else snake(prosta)).lower()
                wynik.setdefault(prosta, self.encje_php[nazwa.replace("\\", ".")])
        for k in self.p.klasy.values():
            if k["jezyk"] != "php" or k["fqn"] in self.encje_php: continue
            nad = "\n".join(self.p.zrodlo(k["plik"])[max(0, k["linia"] - 8):k["linia"] + 8])
            if not re.search(r"#\[\s*(?:ORM\\)?Entity\b|@ORM\\Entity\b", nad): continue
            tab = re.search(r"(?:#\[\s*(?:ORM\\)?Table\s*\(\s*(?:name\s*:\s*)?|@ORM\\Table\s*\(\s*name\s*=\s*)['\"]([^'\"]+)", nad)
            self.encje_php[k["fqn"]] = (tab.group(1) if tab else snake(k["nazwa"])).lower()
            wynik.setdefault(k["nazwa"], self.encje_php[k["fqn"]])
        # SQLAlchemy, mapowanie klasyczne: products = Table("products", metadata, …); mapper(model.Product, products) /
        # registry.map_imperatively(model.Product, products)
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "mapper(" not in tekst and "map_imperatively(" not in tekst: continue
            tabele_py = dict(re.findall(r"^(\w+)\s*=\s*(?:sa\.|sqlalchemy\.)?Table\(\s*['\"](\w+)['\"]", tekst, re.M))
            for e, zm in re.findall(r"\b(?:mapper|map_imperatively)\(\s*(?:\w+\.)*([A-Z]\w*)\s*,\s*(\w+)", tekst):
                if zm in tabele_py: wynik.setdefault(e, tabele_py[zm].lower())
        return wynik

    def _przodkowie_php(self, k):
        """PHP: łańcuch extends od klasy w górę → {nazwy: proste nazwy przodków (także spoza projektu), tabele: $table
        kolejnych klas łańcucha od samej klasy}."""
        po_nazwie = {x["nazwa"]: x for x in self.p.klasy.values() if x["jezyk"] == "php"}
        nazwy, tabele, x, widziane = [], [], k, set()
        while x and x["nazwa"] not in widziane:
            widziane.add(x["nazwa"])
            linie = self.p.zrodlo(x["plik"])
            cialo = "\n".join(linie[x["linia"] - 1:x["koniec"]])
            m = re.search(r'(?:protected|public)\s+\$table\s*=\s*[\'"]([^\'"]+)', cialo)
            tabele.append(m.group(1) if m else None)
            e = re.search(r"\bclass\s+" + re.escape(x["nazwa"]) + r"\s+extends\s+\\?([\w\\]+)", cialo)
            if not e: break
            n = e.group(1).split("\\")[-1]
            nazwy.append(n)
            x = po_nazwie.get(n)
        return {"nazwy": nazwy, "tabele": tabele}

    def _etykieta_django(self, k):
        """Etykieta aplikacji Django modelu: AppConfig.label z apps.py pakietu aplikacji, inaczej ostatni człon nazwy
        pakietu aplikacji (styleguide_example.users.models.BaseUser → users)."""
        cz = k["fqn"].split(".")[:-1]
        if "models" in cz: cz = cz[:cz.index("models")]
        elif len(cz) > 1: cz = cz[:-1]
        if not cz: return k["fqn"].split(".")[0]
        apps = os.path.join(self.p.repo, *cz, "apps.py")
        if not os.path.exists(apps): apps = os.path.join(self.p.repo, "src", *cz, "apps.py")
        if os.path.exists(apps):
            m = re.search(r"^\s+label\s*=\s*['\"](\w+)", czytaj(apps), re.M)
            if m: return m.group(1)
        return cz[-1]

    def ef(self):
        """EF Core: z klas DbContext — DbSet<X> Nazwa (nazwa właściwości → encja) i tabele encji: Entity<X>().ToTable("t"),
        Entity<X>(e => e.ToTable("t")), [Table] (encje), inaczej nazwa DbSet (konwencja EF)."""
        if hasattr(self, "_ef"): return self._ef
        zbiory, tabele = {}, {}
        for k in self.p.klasy.values():
            if k["jezyk"] != "csharp": continue
            cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
            if "DbSet<" not in cialo and "ToTable(" not in cialo: continue
            for e, nazwa in re.findall(r"DbSet<\s*(\w+)\s*>\??\s+(\w+)", cialo):
                zbiory[nazwa] = e
                tabele.setdefault(e, nazwa.lower())
            for e, t_ in re.findall(r"Entity<\s*(\w+)\s*>\s*\(\s*\)\s*\.ToTable\(\s*\"([^\"]+)\"", cialo): tabele[e] = t_.lower()
            for e, t_ in re.findall(r"Entity<\s*(\w+)\s*>\s*\(\s*\w+\s*=>[^;]*?\.ToTable\(\s*\"([^\"]+)\"", cialo, re.S): tabele[e] = t_.lower()
        tabele.update({e: t_ for e, t_ in self.encje.items() if any(k["nazwa"] == e and k["jezyk"] == "csharp" for k in self.p.klasy.values())})
        self._ef = (zbiory, tabele)
        return self._ef

    def tabele_cs(self, tekst, plik=None):
        """C#: kontekst.Zbior (DbSet), Set<X>(), Query<X>/Find<X> → tabela encji (SQL w literałach łapie SQL_LITERAL).
        plik: typy pól i parametrów konstruktora (głównego też) przy rozpoznawaniu kontekstu."""
        zbiory, tabele = self.ef()
        wynik = [tabele[zbiory[z]] for o, z in re.findall(r"(\w+)\s*\??\.\s*(\w+)\b", tekst) if z in zbiory and zbiory[z] in tabele and self._kontekst_ef(o, tekst, plik)]
        wynik += [tabele[e] for e in re.findall(r"\b(?:Set|Find|Entry)<\s*(\w+)\s*>", tekst) if e in tabele]
        return wynik

    def _kontekst_ef(self, odb, tekst, plik=None):
        """Odbiorca „odb.Zbior” to kontekst EF (dostęp do bazy), a nie encja w pamięci z nawigacją o tej samej nazwie
        (article.ArticleTags): this/base, zmienna typu klasy z DbSet<> albo DbSet<X>, parametr lambdy w Include /
        ThenInclude (łączenie w tym samym zapytaniu), a przy nieznanym typie — nazwa kontekstu (context, _db, dbContext)."""
        if not hasattr(self, "_konteksty_ef"):
            self._konteksty_ef = {k["nazwa"] for k in self.p.klasy.values() if k["jezyk"] == "csharp" and
                                  ("DbContext" in (k.get("bazowe") or "") or "DbSet<" in "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]]))}
        if odb in ("this", "base"): return True
        typ = re.search(r"\b([A-Z]\w*)(?:<[^>;()]*>)?\??\s+" + re.escape(odb) + r"\s*[;=,)]", tekst)
        typ = typ.group(1) if typ else None
        if typ is None and plik: typ = self.typy_pol(plik).get(odb)
        if typ: return typ in self._konteksty_ef or typ in ("DbSet", "DbContext", "IQueryable")
        if odb in re.findall(r"\b(?:Then)?Include\(\s*(\w+)\s*=>", tekst): return True
        return bool(re.fullmatch(r"_?(?:\w*[cC]ontext|ctx|_?db|\w*Db|\w*DbContext|uow|unitOfWork)", odb))

    def tabele_php(self, klucz, tekst):
        """Laravel: Model::find/where/create/insert…, DB::table('t'), w modelu $this->save() i relacje
        ($this->hasMany(X::class)), zmienne typu modelu ($x = Model::…, parametr Model $x) → $x->save()/update()/delete()."""
        k, tabele = self.p.klasy[klucz], []
        for e in re.findall(r"\b([A-Z]\w*)::(?!class\b)\w+\s*\(", tekst):            # Eloquent: Model::find(…)
            t_ = self.encja_php(k["plik"], e, eloquent=True)
            if t_: tabele.append(t_)
        tabele += [t_.lower() for t_ in re.findall(r"\bDB::table\(\s*['\"](\w+)", tekst)]
        # query builder z nazwą tabeli w stałej klasy (PicoDb Kanboarda): ->table(self::TABLE), ->join(UserModel::TABLE, …)
        for kl_, st in re.findall(r"->(?:table|join|left|inner|outerJoin|leftJoin|innerJoin)\(\s*\\?(?:[\w\\]+\\)?(\w+)::([A-Z_]\w*)\s*[,)]", tekst):
            t_ = self.stala_php(k, kl_, st)
            if t_: tabele.append(t_.lower())
        tabele += [t_.lower() for t_ in re.findall(r"->table\(\s*['\"](\w+)['\"]\s*\)", tekst)]
        # Doctrine: $this->repository(Course::class) / getRepository(Course::class), persist / remove obiektu typu encji
        for e in re.findall(r"(?:repository|getRepository)\(\s*\\?(?:[\w\\]+\\)?(\w+)::class", tekst):
            t_ = self.encja_php(k["plik"], e)
            if t_: tabele.append(t_)
        typy_php = {v: e for e, v in re.findall(r"\b([A-Z]\w*)\s+\$(\w+)", tekst)}
        for v in re.findall(r"->(?:persist|remove|merge|refresh)\(\s*\$(\w+)", tekst):
            t_ = self.encja_php(k["plik"], typy_php[v]) if v in typy_php else None
            if t_: tabele.append(t_)
        if k["fqn"] in self.eloquent:
            if re.search(r"\$this->(?:save|update|delete|increment|decrement|refresh|push|forceDelete)\s*\(", tekst): tabele.append(self.encje[k["nazwa"]])
            for e, pivot in re.findall(r"\$this->(?:hasMany|hasOne|belongsTo|belongsToMany|morphMany|morphOne|hasManyThrough)\(\s*\\?(?:[\w\\]+\\)?(\w+)::class(?:\s*,\s*['\"](\w+)['\"])?", tekst):
                if e in self.encje: tabele.append(self.encje[e])
        zmienne = {v: e for e, v in re.findall(r"\b([A-Z]\w*)\s+\$(\w+)", tekst) if self.encja_php(k["plik"], e, eloquent=True)}
        zmienne.update({v: e for v, e in re.findall(r"\$(\w+)\s*=\s*([A-Z]\w*)::", tekst) if self.encja_php(k["plik"], e, eloquent=True)})
        for v in re.findall(r"\$(\w+)->(?:save|update|delete|increment|decrement|refresh|push|forceDelete)\s*\(", tekst):
            if v in zmienne: tabele.append(self.encja_php(k["plik"], zmienne[v], eloquent=True))
        return tabele

    def php_fqn(self, plik, nazwa):
        """PHP: prosta nazwa klasy w pliku → FQN z kropkami (use … [as …], inaczej przestrzeń nazw pliku)."""
        if not hasattr(self, "_php_use"): self._php_use = {}
        if plik not in self._php_use:
            tekst = "\n".join(self.p.zrodlo(plik))
            uz = {(a or u.split("\\")[-1]): u.replace("\\", ".") for u, a in re.findall(r"^\s*use\s+\\?([\w\\]+)(?:\s+as\s+(\w+))?\s*;", tekst, re.M)}
            ns = re.search(r"^\s*namespace\s+([\w\\]+)\s*;", tekst, re.M)
            self._php_use[plik] = (uz, ns.group(1).replace("\\", ".") if ns else "")
        uz, ns = self._php_use[plik]
        return uz.get(nazwa) or (f"{ns}.{nazwa}" if ns else nazwa)

    def encja_php(self, plik, nazwa, eloquent=False):
        """Tabela modelu wskazanego w pliku prostą nazwą — po FQN (fasada Activity ≠ model Activity o tej samej nazwie);
        gdy FQN nie jest znaną klasą projektu, po samej nazwie. eloquent: tylko model Eloquent (Course::create(…) encji
        Doctrine to nazwany konstruktor, nie zapytanie)."""
        f = self.php_fqn(plik, nazwa)
        if f in self.encje_php: return self.encje_php[f] if not eloquent or f in self.eloquent else None
        if any(k["fqn"] == f for k in self.p.klasy.values()): return None
        return self.encje.get(nazwa) if not eloquent or any(e.endswith("." + nazwa) for e in self.eloquent) else None

    def stala_php(self, k, klasa, nazwa):
        """Wartość napisowej stałej klasy PHP: self::/static:: → klasa k, inaczej klasa projektu o tej prostej nazwie."""
        if klasa in ("self", "static"): cel = k
        else: cel = next((x for x in self.p.klasy.values() if x["jezyk"] == "php" and x["nazwa"] == klasa), None)
        if not cel: return None
        m = re.search(r"\bconst\s+" + re.escape(nazwa) + r"\s*=\s*['\"]([^'\"]+)['\"]", "\n".join(self.p.zrodlo(cel["plik"])[cel["linia"] - 1:cel["koniec"]]))
        return m.group(1) if m else None

    def wlasciwosc_php(self, k, nazwa):
        """PHP: $this->taskFinderModel bez deklaracji w klasie, a przodek ma __get (kontener Pimple: Base::__get →
        $this->container[$name]) — klucz kontenera to nazwa klasy od małej litery (ClassProvider Kanboarda).
        → klucz klasy projektu albo None."""
        if not hasattr(self, "_magiczne"): self._magiczne = {}
        if k["nazwa"] not in self._magiczne:
            lancuch = [k] + [x for n in self._przodkowie_php(k)["nazwy"] for x in self.p.klasy.values() if x["jezyk"] == "php" and x["nazwa"] == n]
            self._magiczne[k["nazwa"]] = any(any(m["nazwa"] == "__get" for m in x["metody"]) for x in lancuch)
        if not self._magiczne[k["nazwa"]]: return None
        cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
        if re.search(r"(?:private|protected|public|var)\s+(?:readonly\s+)?(?:\??[\w\\]+\s+)?\$" + re.escape(nazwa) + r"\b", cialo): return None
        if not hasattr(self, "_php_nazwy"):
            self._php_nazwy = {}
            for kl, x in self.p.klasy.items():
                if x["jezyk"] == "php" and x["rodzaj"] != "interface": self._php_nazwy.setdefault(x["nazwa"], kl)
        return self._php_nazwy.get(nazwa[:1].upper() + nazwa[1:])

    def php_fasady(self):
        """Laravel: FQN fasady (extends Facade) → klucz klasy celu. Cel z getFacadeAccessor(): X::class wprost, napis
        'activity' → powiązanie w providerach ('activity' => X::class w $singletons/$bindings, ->singleton('activity', X::class
        / fn() => new X)), w ostateczności @mixin X w docblocku fasady."""
        if hasattr(self, "_fas"): return self._fas
        self._fas = {}
        fasady = [k for k in self.p.klasy.values() if k["jezyk"] == "php" and re.search(r"\bFacade\b", k.get("bazowe", "") or "")]
        if not fasady: return self._fas
        po_fqn = {k["fqn"]: kl for kl, k in self.p.klasy.items()}
        powiazania = {}
        for kl, k in self.p.klasy.items():
            if k["jezyk"] != "php" or not re.search(r"Provider\b", k["nazwa"]): continue
            tekst = "\n".join(self.p.zrodlo(k["plik"]))
            pary = re.findall(r"['\"]([\w.-]+)['\"]\s*=>\s*\\?([\w\\]+)::class", tekst)
            pary += [(a, b or c) for a, b, c in re.findall(r"->(?:singleton|bind|scoped)\(\s*['\"]([\w.-]+)['\"]\s*,\s*(?:\\?([\w\\]+)::class|(?:static\s+)?(?:function|fn)\b[^;]*?\bnew\s+\\?([\w\\]+))", tekst, re.S)]
            for acc, cel in pary:
                pelna = cel.replace("\\", ".") if "\\" in cel else self.php_fqn(k["plik"], cel)
                powiazania.setdefault(acc, pelna)
        for k in fasady:
            tekst = "\n".join(self.p.zrodlo(k["plik"]))
            acc = re.search(r"function\s+getFacadeAccessor\s*\([^)]*\)[^{]*\{\s*return\s+(?:['\"]([\w.-]+)['\"]|\\?([\w\\]+)::class)", tekst)
            cel = None
            if acc and acc.group(2): cel = self.php_fqn(k["plik"], acc.group(2)) if "\\" not in acc.group(2) else acc.group(2).replace("\\", ".")
            elif acc: cel = powiazania.get(acc.group(1))
            if not cel or cel not in po_fqn:
                mx = re.search(r"@mixin\s+\\?([\w\\]+)", tekst)
                if mx: cel = mx.group(1).replace("\\", ".") if "\\" in mx.group(1) else self.php_fqn(k["plik"], mx.group(1))
            if cel in po_fqn: self._fas[k["fqn"]] = po_fqn[cel]
        return self._fas

    def _szyna_php(self):
        """PHP (Symfony Messenger, własne szyny komend/zapytań, Laravel Bus): prosta nazwa typu wiadomości → [id metod
        handlerów]. Handler: __invoke / handle z typem pierwszego parametru w klasie *Handler, implementującej
        *Handler / MessageHandlerInterface albo z #[AsMessageHandler]."""
        if hasattr(self, "_szyna"): return self._szyna
        self._szyna = defaultdict(list)
        for kl, k in self.p.klasy.items():
            if k["jezyk"] != "php" or k["rodzaj"] == "interface": continue
            nad = "\n".join(self.p.zrodlo(k["plik"])[max(0, k["linia"] - 6):k["linia"] + 3])
            if not (k["nazwa"].endswith("Handler") or re.search(r"\w*Handler(Interface)?\b", k.get("bazowe", "") or "") or "AsMessageHandler" in nad): continue
            for m in k["metody"]:
                if m["nazwa"] not in ("__invoke", "handle"): continue
                e = re.search(r"function\s+\w+\s*\(\s*\\?(?:[\w\\]+\\)?(\w+)\s+\$", m.get("cialo") or "")
                if e: self._szyna[e.group(1)].append(m["id"])
        return self._szyna

    def szyna_php(self, k, m):
        """(linia, id handlera) dla wiadomości tworzonej w metodzie i wysyłanej na szynę: $this->dispatch(new FooCommand(…)),
        $bus->ask(new FooQuery(…)), Bus::dispatch(new FooJob) — handler dziecko węzła szyny (podpinane w domknieciach)."""
        if k["jezyk"] != "php": return []
        szyna = self._szyna_php()
        if not szyna: return []
        linie = self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]
        tekst = "\n".join(linie)
        wynik = []
        for w_ in re.finditer(r"\b(?:dispatch\w*|ask|handle|send|query|command|execute)\s*\(\s*new\s+\\?(?:[\w\\]+\\)?(\w+)\s*\(", tekst):
            nr = m["linia"] + tekst.count("\n", 0, w_.start())
            wynik += [(nr, h) for h in szyna.get(w_.group(1), []) if h != m["id"]]
        return wynik

    def _laravel_zdarzenia(self):
        """Laravel — wywołania, których nie ma w grafie: słuchacze zdarzeń (Event::listen(E::class, [L::class, 'm']),
        Event::listen(E::class, L::class) → handle, klasa z metodą handle(E $e)) i observery modeli (#[ObservedBy(O::class)],
        Model::observe(O::class)). Wynik: (zdarzenia: E → [(klasa, metoda)], observery: model → [klasa])."""
        if hasattr(self, "_lz"): return self._lz
        sl, ob = defaultdict(list), defaultdict(list)
        pliki = {k["plik"] for k in self.p.klasy.values() if k["jezyk"] == "php"}
        for d in ("app/Providers", "bootstrap"):
            kat = os.path.join(self.p.repo, d)
            if os.path.isdir(kat): pliki |= {os.path.relpath(os.path.join(kat, f), self.p.repo) for f in os.listdir(kat) if f.endswith(".php")}
        for plik in pliki:
            tekst = "\n".join(self.p.zrodlo(plik))
            for e, l_, met in re.findall(r"Event::listen\(\s*\\?(?:[\w\\]+\\)?(\w+)::class\s*,\s*\[\s*\\?(?:[\w\\]+\\)?(\w+)::class\s*,\s*['\"](\w+)['\"]", tekst): sl[e].append((l_, met))
            for e, l_ in re.findall(r"Event::listen\(\s*\\?(?:[\w\\]+\\)?(\w+)::class\s*,\s*\\?(?:[\w\\]+\\)?(\w+)::class\s*\)", tekst): sl[e].append((l_, "handle"))
            for o in re.findall(r"#\[ObservedBy\(\s*\[?\s*\\?(?:[\w\\]+\\)?(\w+)::class", tekst):
                kl = re.search(r"#\[ObservedBy[^\n]*\n(?:\s*#\[[^\n]*\n)*\s*(?:final\s+|abstract\s+)?class\s+(\w+)", tekst)
                if kl: ob[kl.group(1)].append(o)
            for m_, o in re.findall(r"\b(\w+)::observe\(\s*\\?(?:[\w\\]+\\)?(\w+)::class", tekst): ob[m_].append(o)
        for k in self.p.klasy.values():                                   # auto-discovery: handle(Zdarzenie $e)
            if k["jezyk"] != "php": continue
            for m_ in k["metody"]:
                if m_["nazwa"] not in ("handle", "__invoke"): continue
                sygn = " ".join(self.p.zrodlo(k["plik"])[m_["linia"] - 1:m_["linia"] + 1])
                e = re.search(r"function\s+\w+\s*\(\s*\\?(?:[\w\\]+\\)?(\w+)\s+\$", sygn)
                if e and (k["nazwa"], m_["nazwa"]) not in sl[e.group(1)]: sl[e.group(1)].append((k["nazwa"], m_["nazwa"]))
        self._lz = (sl, ob)
        return self._lz

    def php_ukryte(self, klucz, m):
        """(linia, id metody) wywołań przez zdarzenia Laravela z ciała metody: event(new E) / E::dispatch → słuchacze,
        zapis modelu (save/create/update/delete) → metody observera."""
        k = self.p.klasy[klucz]
        sl, ob = self._laravel_zdarzenia()
        fas = self.php_fasady()
        if not sl and not ob and not fas: return []
        linie = self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]
        po_nazwie = {x["nazwa"]: kl for kl, x in self.p.klasy.items()}
        def metoda(kl, met):
            kk = po_nazwie.get(kl)
            return next((x["id"] for x in self.p.klasy[kk]["metody"] if x["nazwa"] == met), None) if kk else None
        tekst = "\n".join(linie)
        zmienne = {v: e for e, v in re.findall(r"\b([A-Z]\w*)\s+\$(\w+)", tekst)}
        zmienne.update({v: e for v, e in re.findall(r"\$(\w+)\s*=\s*([A-Z]\w*)::", tekst)})
        wynik = []
        for i, l in enumerate(linie):
            nr = m["linia"] + i
            for f_, met in re.findall(r"(?<![\w\\$>])\\?([A-Z]\w*)::(\w+)\s*\(", l):     # fasada: Activity::add(…) → ActivityLogger.add
                cel = fas.get(self.php_fqn(k["plik"], f_))
                if cel: wynik += [(nr, x["id"]) for x in self.p.klasy[cel]["metody"] if x["nazwa"] == met]
            for e in re.findall(r"\bevent\(\s*new\s+\\?(?:[\w\\]+\\)?(\w+)|\b(\w+)::dispatch\(", l):
                for kl, met in sl.get(e[0] or e[1], []):
                    c = metoda(kl, met)
                    if c: wynik.append((nr, c))
            modele = [mm for mm in re.findall(r"\b([A-Z]\w*)::(?:create|update|delete|destroy|firstOrCreate|updateOrCreate)\s*\(", l)]
            modele += [zmienne[v] for v in re.findall(r"\$(\w+)->(?:save|update|delete|push)\s*\(", l) if v in zmienne]
            if re.search(r"\$this->(?:save|update|delete|push)\s*\(", l): modele.append(k["nazwa"])
            for mod in modele:
                for o in ob.get(mod, []):
                    for x in self.p.klasy.get(po_nazwie.get(o), {}).get("metody", []):
                        if x["nazwa"] in ("creating", "created", "updating", "updated", "saving", "saved", "deleting", "deleted"): wynik.append((nr, x["id"]))
        return wynik

    # relacje encji: tabela encji → tabele, do których ORM może sięgnąć (relacje, @JoinTable, @CollectionTable),
    # dwa poziomy w głąb — lazy loading i fetch join dają SQL na tych tabelach bez jawnego zapytania w kodzie
    def _relacje(self):
        if hasattr(self, "_rel"): return self._rel
        bezposrednie = defaultdict(set)
        for k in self.p.klasy.values():
            if "Entity" not in k["adnotacje"] or k["nazwa"] not in self.encje: continue
            tabela = self.encje[k["nazwa"]]
            linie = self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]]
            for i, l in enumerate(linie):
                if not re.search(r"@(OneToMany|ManyToOne|ManyToMany|OneToOne|ElementCollection)", l): continue
                okno = " ".join(linie[i:i + 7])
                jt = re.search(r'@(?:JoinTable|CollectionTable)\s*\(\s*name\s*=\s*"([^"]+)"', okno)
                if jt: bezposrednie[tabela].add(jt.group(1).lower())
                typ = re.search(r'(?:private|protected|public)?\s*(?:final\s+)?(?:[\w.]*(?:List|Set|Collection|Map)<\s*(?:\w+\s*,\s*)?(\w+)\s*>|(\w+))\s+\w+\s*[;=]', okno)
                nazwa_t = typ and (typ.group(1) or typ.group(2))
                if nazwa_t in self.encje: bezposrednie[tabela].add(self.encje[nazwa_t])
        self._relacje_sqlalchemy(bezposrednie)
        self._rel = {}
        for t in list(bezposrednie):
            zas = set(bezposrednie[t])
            for t2 in list(zas): zas |= bezposrednie.get(t2, set())
            self._rel[t] = sorted(zas - {t})
        return self._rel

    def _relacje_sqlalchemy(self, bezposrednie):
        """SQLAlchemy: relacje modeli — mapowanie klasyczne (mapper(model.Product, products, properties={"batches":
        relationship(batches_mapper)}), relationship(lines_mapper, secondary=allocations)) i deklaratywne (relationship("X",
        secondary=…) w klasie z __tablename__) → tabela modelu: {tabele relacji i tabel pośrednich}."""
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "relationship(" not in tekst: continue
            tab_zm = dict(re.findall(r"^\s*(\w+)\s*=\s*(?:sa\.|sqlalchemy\.)?Table\(\s*['\"](\w+)['\"]", tekst, re.M))
            mappery = {}                                                    # zmienna mappera → tabela
            wywolania = []
            for w_ in re.finditer(r"(?:\b(\w+)\s*=\s*)?\b(?:mapper|map_imperatively)\(", tekst):
                args, _ = self._argumenty(tekst, w_.end())
                if len(args) < 2 or args[1].strip() not in tab_zm: continue
                t_ = tab_zm[args[1].strip()].lower()
                if w_.group(1): mappery[w_.group(1)] = t_
                wywolania.append((t_, ",".join(args[2:])))
            def tabela(cel):
                cel = cel.strip().strip("'\"")
                return mappery.get(cel) or self.encje.get(cel.split(".")[-1]) or (tab_zm.get(cel) or "").lower() or None
            for t_, wlasciwosci in wywolania:
                for cel, reszta in re.findall(r"relationship\(\s*([\w.'\"]+)([^)]*)", wlasciwosci):
                    for x in [tabela(cel)] + [tabela(s_) for s_ in re.findall(r"\bsecondary\s*=\s*([\w.'\"]+)", reszta)]:
                        if x and x != t_: bezposrednie[t_].add(x)
            for k in self.p.klasy.values():                                 # deklaratywnie: relationship w klasie modelu
                if k["plik"] != plik or k["nazwa"] not in self.encje: continue
                cialo = "\n".join(self.p.zrodlo(plik)[k["linia"] - 1:k["koniec"]])
                for cel, reszta in re.findall(r"relationship\(\s*([\w.'\"]+)([^)]*)", cialo):
                    for x in [tabela(cel)] + [tabela(s_) for s_ in re.findall(r"\bsecondary\s*=\s*([\w.'\"]+)", reszta)]:
                        if x and x != self.encje[k["nazwa"]]: bezposrednie[self.encje[k["nazwa"]]].add(x)

    def _nad_metoda(self, k, m):
        """Adnotacje / dekoratory nad metodą (@Query("…") nad deklaracją) — do 5 linii, ale bez końca poprzedniej składowej
        (ostatnia linia z „}” / „;” / „{”; Python: tylko blok dekoratorów). Inaczej SQL poprzedniej metody (return
        em.createQuery("SELECT ptype FROM PetType …") tuż nad findById) trafiałby do tej."""
        linie = self.p.zrodlo(k["plik"])
        if k["jezyk"] == "python": return dekoratory_py(linie, m["linia"])
        okno = linie[max(0, m["linia"] - 6):max(0, m["linia"] - 1)]
        koniec = max([i + 1 for i, l in enumerate(okno) if l.rstrip().endswith(("}", ";", "{")) and not l.lstrip().startswith(("@", "#[", "["))] or [0])
        return "\n".join(okno[koniec:])

    def tabele_metody(self, klucz, m, klasa=True):
        k = self.p.klasy[klucz]
        linie = self.p.zrodlo(k["plik"])
        tekst = self._nad_metoda(k, m) + "\n" + "\n".join(linie[max(0, m["linia"] - 1):m["koniec"]])
        tabele = []
        jpa = self.encje if k["jezyk"] in ("java", "csharp") else None                    # JPQL / HQL: encje → tabele
        for s_ in literaly_sql(tekst): tabele += tabele_sql(s_, jpa)                      # natywny SQL (też text block, heredoc)
        for nazwa_s, s_ in self.sql_stale(klucz).items():                              # stała z SQL użyta w metodzie
            if re.search(r"\b" + nazwa_s + r"\b", "\n".join(linie[m["linia"]:m["koniec"]])): tabele += tabele_sql(s_)
        for q_ in re.findall(r'@Query\s*\(\s*(?:value\s*=\s*)?"([^"]+)"', tekst):  # JPQL: encje → tabele
            tabele += tabele_sql(q_, self.encje)
        # Prisma: prisma.model.findMany(…) → tabela z schema.prisma; knex: knex('tabela'), .from/.into/.table('tabela')
        for model in re.findall(r"\.(\w+)\.(?:findMany|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(", tekst):
            if model in self.prisma(): tabele.append(self.prisma()[model])
        for tab in re.findall(r"\b(?:knex|db|trx|tx)\s*\(\s*[\'\"`](\w+)(?:\s+as\s+\w+)?[\'\"`]|\.(?:from|into|table|join|innerJoin|leftJoin)\(\s*[\'\"`](\w+)", tekst):
            tabele.append((tab[0] or tab[1]).lower())
        # ORM-y poza JPA: Django (Model.objects), SQLAlchemy (select/query/get), TypeORM (getRepository, manager.find)
        for e in re.findall(r"\b([A-Z]\w*)\.objects\b|\bselect\(\s*([A-Z]\w*)\b|\.query\(\s*(?:[a-z_]\w*\.)*([A-Z]\w*)\b|\.get\(\s*([A-Z]\w*)\s*,|getRepository\(\s*([A-Z]\w*)\s*\)|\.(?:find|findOne|findOneBy|findOneOrFail|findAndCount|findBy|count|save|delete|update|insert|upsert|nativeUpdate|nativeDelete|nativeInsert)\(\s*([A-Z]\w*)\s*,", tekst):
            nazwa_e = next(x for x in e if x)
            if nazwa_e in self.encje: tabele.append(self.encje[nazwa_e])
        if k["jezyk"] == "python" and re.search(r"\.query\(|\bselect\(", tekst):       # SQLAlchemy: .join(model.Batch)
            tabele += [self.encje[e] for e in re.findall(r"\.(?:join|outerjoin)\(\s*(?:[a-z_]\w*\.)*([A-Z]\w*)\s*[,)]", tekst) if e in self.encje]
        if k["jezyk"] == "java":                     # JPA / Hibernate: em.find(Pet.class, id), session.get(Owner.class, id)
            for e in re.findall(r"\.(?:find|getReference|get|load|byId|createQuery|createNamedQuery|createNativeQuery)\((?:[^;()]|\([^()]*\))*?\b([A-Z]\w*)\.class\b", tekst):
                if e in self.encje: tabele.append(self.encje[e])
        if k["jezyk"] == "php": tabele += self.tabele_php(klucz, "\n".join(linie[max(0, m["linia"] - 1):m["koniec"]]))
        if k["jezyk"] == "csharp": tabele += self.tabele_cs("\n".join(linie[max(0, m["linia"] - 1):m["koniec"]]), k["plik"])
        if k["jezyk"] in ("java", "csharp"):                       # JPA / EF: em.persist(pet), merge, remove — typ zmiennej → encja
            typy = {n: t_ for t_, n in re.findall(r"\b([A-Z]\w*)\s+(\w+)\s*[,)=;]", tekst)}
            for v in re.findall(r"\.(?:persist|merge|remove|Add|Remove|Update|Attach)\(\s*(\w+)\s*\)", tekst):
                if typy.get(v) in self.encje: tabele.append(self.encje[typy[v]])
        if k["jezyk"] == "java" and self.rola.get(klucz) == "repozytorium":                      # mapper MyBatis: SQL z XML
            sql_x = self.mybatis().get(k["fqn"], {}).get(m["nazwa"])
            if sql_x: tabele += tabele_sql(sql_x)
        if k["jezyk"] == "python":                                                         # aiosql: queries.nazwa(…)
            for s_ in self.sql_aiosql(klucz, m): tabele += tabele_sql(s_)
            # obiekt modelu zapisany wprost: file = File(…); file.save() / obj.delete()
            zm = {v: e for v, e in re.findall(r"\b(\w+)\s*=\s*([A-Z]\w*)\(", tekst) if e in self.encje}
            # parametr z adnotacją modelu: def auth_logout(user: BaseUser): user.save(update_fields=[…]) / user.full_clean()
            zm.update({v: e for v, e in re.findall(r"[(,]\s*\*?\s*(\w+)\s*:\s*(?:Optional\[)?([A-Z]\w*)", tekst) if e in self.encje})
            if k["nazwa"] in self.encje: zm["self"] = k["nazwa"]                   # metoda modelu: self.save()
            # parametr bez adnotacji nazwany jak model (def zapisz_stan(ksiazka): ksiazka.save(…) → Ksiazka)
            for v in re.findall(r"\b(\w+)\.(?:save|delete|full_clean|refresh_from_db)\(", tekst):
                e = self._modele_py().get(v.lower().replace("_", ""))
                if e and v not in zm: zm[v] = e
            tabele += [self.encje[zm[v]] for v in re.findall(r"\b(\w+)\.(?:save|delete|full_clean|validate_unique|refresh_from_db)\(", tekst) if v in zm]
            # SQLAlchemy: session.add(product) / session.delete(x) / merge — obiekt modelu (typ z adnotacji albo z nazwy)
            for v in re.findall(r"\bsession\.(?:add|delete|merge)\(\s*(\w+)\s*\)", tekst):
                e = zm.get(v) or self._modele_py().get(v.lower().replace("_", ""))
                if e in self.encje: tabele.append(self.encje[e])
            tabele += self.tabele_django_obce(k["plik"], tekst)
            tabele += self.tabele_pypika(k["plik"], tekst)
            # menedżer Django (objects = BaseUserManager()): self.model(…) / .save() / self.get_queryset() → tabela modelu
            if k["nazwa"] in self._menedzery() and re.search(r"\bself\.(?:model|create|get_queryset|filter|get|all|update|bulk_create)\b|\.save\(", tekst):
                tabele += [self.encje[x] for x in self._menedzery()[k["nazwa"]] if x in self.encje]
        if not tabele and self.rola.get(klucz) == "repozytorium": tabele += self.tabele_repo(klucz)   # repozytorium encji
        if klasa and not tabele and self.rola.get(klucz) == "repozytorium" and k["jezyk"] == "python" and re.search(r"\.(?:save|delete|update|refresh_from_db)\(", tekst):
            tabele += self.tabele_klasy_py(klucz, m)                                     # repozytorium jednej tabeli
        return list(dict.fromkeys(t for t in tabele if t))

    def _modele_py(self):
        """Python: nazwa modelu ORM bez „_” małymi literami → nazwa klasy (wypozyczenie → Wypozyczenie)."""
        if not hasattr(self, "_mpy"):
            self._mpy = {x["nazwa"].lower(): x["nazwa"] for x in self.p.klasy.values() if x["jezyk"] == "python" and x["nazwa"] in self.encje}
        return self._mpy

    def tabele_klasy_py(self, klucz, m):
        """Repozytorium Pythona, którego pozostałe metody sięgają do jednej tabeli — zapis obiektu bez typu (x.save())
        też do niej (KsiazkaRepo.zapisz_stan(ksiazka) obok Ksiazka.objects…)."""
        k = self.p.klasy[klucz]
        inne = {t for x in k["metody"] if x["id"] != m["id"] for t in self._tabele_bez_klasy(klucz, x)}
        return list(inne) if len(inne) == 1 else []

    def _tabele_bez_klasy(self, klucz, m):
        if not hasattr(self, "_tbk"): self._tbk = {}
        if m["id"] not in self._tbk:
            self._tbk[m["id"]] = []                                            # bez rekurencji przez tabele_klasy_py
            self._tbk[m["id"]] = [t for t in self.tabele_metody(klucz, m, klasa=False)]
        return self._tbk[m["id"]]

    def _pypika(self):
        """pypika: obiekty tabel w projekcie — moduł → {zmienna: tabela}: x = Table("t"), x = Klasa() dla klasy
        dziedziczącej po Table z __table__ = "t" (TypedTable z fastapi-realworld)."""
        if hasattr(self, "_pyp"): return self._pyp
        self._pyp = defaultdict(dict)
        klasy = {}
        for k in self.p.klasy.values():
            if k["jezyk"] != "python" or not re.search(r"\b(?:Table|\w+Table)\b", k.get("bazowe", "")): continue
            m = re.search(r"__table__\s*=\s*['\"]([^'\"]+)", "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]]))
            if m: klasy[k["nazwa"]] = m.group(1)
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "pypika" not in tekst and not any(n in tekst for n in klasy): continue
            for zm, t_ in re.findall(r"^(\w+)\s*=\s*Table\(\s*['\"]([^'\"]+)", tekst, re.M): self._pyp[modul_pythona(plik)][zm] = t_
            for zm, kl in re.findall(r"^(\w+)\s*=\s*([A-Z]\w*)\(\s*\)", tekst, re.M):
                if kl in klasy: self._pyp[modul_pythona(plik)][zm] = klasy[kl]
        return self._pyp

    def tabele_pypika(self, plik, tekst):
        """Zapytanie pypika w metodzie: Query.from_(articles) / .join(users) / Query.into / Query.update / Query.delete
        (zmienne tabel z modułu albo z importu, także „tags as tags_table”) → tabele (operacja z SQL runtime)."""
        if "Query." not in tekst or not self._pypika(): return []
        widoczne = dict(self._pypika().get(modul_pythona(plik), {}))
        for baza, lista in re.findall(r"^\s*from\s+([\w.]+)\s+import\s+(\([^)]*\)|[^\n]+)", "\n".join(self.p.zrodlo(plik)), re.M):
            if baza not in self._pypika(): continue
            lista = lista.strip("()")
            for cz in lista.split(","):
                org, _, alias = cz.strip().partition(" as ")
                if org.strip() in self._pypika()[baza]: widoczne[(alias or org).strip()] = self._pypika()[baza][org.strip()]
        return [widoczne[v] for v in re.findall(r"(?:\bQuery\.(?:from_|into|update|delete|into_table)|\.(?:join|left_join|inner_join|outer_join|from_))\(\s*(\w+)", tekst) if v in widoczne]

    def tabele_django_obce(self, plik, tekst):
        """Django: modele z zainstalowanych pakietów spoza repozytorium (from django_celery_beat.models import
        PeriodicTask; from django.contrib.auth.models import Group) — tabela z konwencji <etykieta aplikacji>_<model>,
        etykieta = ostatni człon pakietu przed .models (django_celery_beat_periodictask, auth_group)."""
        obce = {}
        for pakiet, lista in re.findall(r"^\s*from\s+([\w.]+)\.models\s+import\s+(\([^)]*\)|[^\n]+)", "\n".join(self.p.zrodlo(plik)), re.M):
            lista = lista.strip("()")
            if pakiet.startswith(".") or os.path.isdir(os.path.join(self.p.repo, *pakiet.split("."))) or os.path.isdir(os.path.join(self.p.repo, "src", *pakiet.split("."))): continue
            for cz in lista.split(","):
                org, _, alias = cz.strip().partition(" as ")
                if re.fullmatch(r"[A-Z]\w*", org.strip()): obce[(alias or org).strip()] = f"{pakiet.split('.')[-1]}_{org.strip().lower()}"
        return [obce[e] for e in re.findall(r"\b([A-Z]\w*)\.objects\b", tekst) if e in obce and e not in self.encje]

    def sql_stale(self, klucz):
        """Stałe klasy z SQL (C# const string X = \"\"\"…\"\"\", Java static final String X = "…") — metoda używa ich po nazwie."""
        if not hasattr(self, "_sqls"): self._sqls = {}
        if klucz in self._sqls: return self._sqls[klucz]
        k = self.p.klasy[klucz]
        cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
        wynik = {}
        for m_ in re.finditer(r"\b(?:const\s+string|static\s+(?:final\s+)?String|static\s+readonly\s+string|private\s+const\s+string)\s+(\w+)\s*=\s*", cialo):
            sql = literaly_sql(cialo[m_.end():m_.end() + 4000].split(";\n")[0] + ";")
            if sql: wynik[m_.group(1)] = sql[0]
        self._sqls[klucz] = wynik
        return wynik

    def sql_metody(self, klucz, m):
        """Teksty SQL z kodu metody (literały, text blocki), znormalizowane — do dopasowania zapytań z runtime."""
        tekst = "\n".join(self.p.zrodlo(self.p.klasy[klucz]["plik"])[max(0, m["linia"] - 1):m["koniec"]])
        stale = [s_ for n_, s_ in self.sql_stale(klucz).items() if re.search(r"\b" + n_ + r"\b", tekst)]
        xml = self.mybatis().get(self.p.klasy[klucz]["fqn"], {}).get(m["nazwa"])
        xml = [re.sub(r"#\{[^}]*\}", "?", xml)] if xml else []
        aio = self.sql_aiosql(klucz, m) if self.p.klasy[klucz]["jezyk"] == "python" else []
        return list(dict.fromkeys(normalizuj(s_) for s_ in literaly_sql(tekst) + stale + xml + aio))

    def aiosql(self):
        """aiosql: pliki *.sql z blokami „-- name: get-user-by-email^” → nazwa metody (get_user_by_email) → SQL."""
        if hasattr(self, "_aio"): return self._aio
        self._aio = {}
        for plik in self._pliki_repo((".sql",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "-- name:" not in tekst: continue
            for nazwa, sql in re.findall(r"^--\s*name:\s*([\w-]+)[<>!^$*#]*[^\n]*\n(.*?)(?=^--\s*name:|\Z)", tekst, re.M | re.S):
                sql = "\n".join(l for l in sql.split("\n") if not l.strip().startswith("--")).strip()
                if sql: self._aio.setdefault(nazwa.replace("-", "_"), sql)
        return self._aio

    def obiekty_aiosql(self, plik):
        """Nazwy obiektów aiosql widoczne w pliku: przypisane z aiosql.from_path / from_str (queries = aiosql.from_path(…))
        w tym pliku albo zaimportowane z modułu, który je przypisuje (from app.db.queries.queries import queries [as q]).
        None — w projekcie nie ma żadnego takiego przypisania (obiekt tworzony inaczej)."""
        if not hasattr(self, "_aio_obj"):
            self._aio_obj = defaultdict(set)                                  # moduł → nazwy obiektów aiosql
            for p_ in self._pliki_repo((".py",)):
                tekst = "\n".join(self.p.zrodlo(p_))
                if "aiosql" not in tekst: continue
                for n in re.findall(r"^(\w+)\s*(?::[^=\n]+)?=\s*aiosql\.from_(?:path|str)\s*\(", tekst, re.M): self._aio_obj[modul_pythona(p_)].add(n)
            self._aio_plik = {}
        if not self._aio_obj: return None
        if plik not in self._aio_plik:
            tekst = "\n".join(self.p.zrodlo(plik))
            nazwy = set(self._aio_obj.get(modul_pythona(plik), ()))
            for mod, lista in re.findall(r"^\s*from\s+([\w.]+)\s+import\s+(\([^)]*\)|[^\n]+)", tekst, re.M):
                if mod not in self._aio_obj: continue
                lista = lista.strip("()")
                for cz in lista.split(","):
                    org, _, alias = cz.strip().partition(" as ")
                    if org.strip() in self._aio_obj[mod]: nazwy.add((alias or org).strip())
            self._aio_plik[plik] = nazwy
        return self._aio_plik[plik]

    def sql_aiosql(self, klucz, m):
        """SQL zapytań aiosql wołanych w metodzie: obiekt.nazwa(…), gdzie obiekt to obiekt aiosql (obiekty_aiosql).
        Bez przypisania z aiosql.from_* w projekcie: odbiorca to nazwa globalna — nie self/cls, nie parametr, nie zmienna
        lokalna, nie atrybut (repo.get_user_by_username(…) w serwisie to metoda repozytorium, nie zapytanie)."""
        if not self.aiosql(): return []
        plik = self.p.klasy[klucz]["plik"]
        tekst = "\n".join(self.p.zrodlo(plik)[max(0, m["linia"] - 1):m["koniec"]])
        obiekty = self.obiekty_aiosql(plik)
        if obiekty is None:
            sygn = re.search(r"\bdef\s+\w+\s*\((.*?)\)\s*(?:->[^:]*)?:", tekst, re.S)
            lokalne = {x.strip().lstrip("*").split(":")[0].split("=")[0].strip() for x in (sygn.group(1) if sygn else "").split(",")}
            lokalne |= set(re.findall(r"^\s*(\w+)\s*(?::[^=\n]+)?=(?!=)", tekst, re.M)) | {"self", "cls"}
            pasuje = lambda o, kropka: not kropka and o not in lokalne
        else:
            pasuje = lambda o, kropka: not kropka and o in obiekty
        return [self.aiosql()[n] for kropka, o, n in re.findall(r"(\.?)\b(\w+)\.(\w+)\s*\(", tekst) if n in self.aiosql() and pasuje(o, kropka)]

    def mybatis(self):
        """MyBatis: XML mapperów — namespace (FQN interfejsu) → {id instrukcji: SQL bez znaczników (<if>, <where>…)};
        <include refid> rozwijamy z <sql id> tego samego pliku."""
        if hasattr(self, "_mb"): return self._mb
        self._mb = {}
        for d, _, fs in os.walk(self.p.repo):
            if "/." in d or "/target" in d or "node_modules" in d: continue
            for f in fs:
                if not f.endswith(".xml"): continue
                try: x = czytaj(os.path.join(d, f))
                except OSError: continue
                ns = re.search(r'<mapper\s+namespace="([\w.$]+)"', x)
                if not ns: continue
                fragmenty = dict(re.findall(r'<sql\s+id="(\w+)"[^>]*>(.*?)</sql>', x, re.S))
                wpisy = {}
                for id_, cialo in re.findall(r'<(?:select|insert|update|delete)\b[^>]*\bid="(\w+)"[^>]*>(.*?)</(?:select|insert|update|delete)>', x, re.S):
                    cialo = re.sub(r'<include\s+refid="(\w+)"\s*/>', lambda mm: fragmenty.get(mm.group(1), ""), cialo)
                    cialo = re.sub(r"<!\[CDATA\[|\]\]>", "", re.sub(r"<(?!!\[)[^>]+>", " ", cialo))
                    wpisy[id_] = re.sub(r"\s+", " ", cialo.replace("&lt;", "<").replace("&gt;", ">")).strip()
                self._mb[ns.group(1)] = wpisy
        return self._mb

    def prisma(self):
        """Prisma: dostęp przez klienta (model z małej litery) → tabela (@@map albo nazwa modelu) ze schema.prisma."""
        if hasattr(self, "_prisma"): return self._prisma
        self._prisma = {}
        for d, _, fs in os.walk(self.p.repo):
            if "node_modules" in d or "/." in d: continue
            for f in fs:
                if not f.endswith(".prisma"): continue
                tekst = czytaj(os.path.join(d, f))
                for model, cialo in re.findall(r"\bmodel\s+(\w+)\s*\{([^}]*)\}", tekst):
                    m = re.search(r'@@map\(\s*"([^"]+)"', cialo)
                    self._prisma[model[0].lower() + model[1:]] = (m.group(1) if m else model).lower()
        return self._prisma

    def wstrzykniecia(self):
        """DI bez typów (JS): (klucz klasy, pole) → klucz klasy celu. Z korzenia kompozycji: const a = new A(…),
        new B(a, …) i konstruktora B: constructor(x, …) { this.pole = x }."""
        if hasattr(self, "_di"): return self._di
        self._di = {}
        po_nazwie = {k["nazwa"]: kl for kl, k in self.p.klasy.items()}
        zmienne, wywolania = {}, []
        for plik in sorted({k["plik"] for k in self.p.klasy.values()} | {os.path.relpath(os.path.join(d, f), self.p.repo) for d, _, fs in os.walk(self.p.repo)
                     if "node_modules" not in d and "/." not in d for f in fs if f.endswith((".js", ".mjs", ".ts"))}):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "new " not in tekst: continue
            for zm_, kl in re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+)\s*\(", tekst): zmienne[zm_] = kl
            # także zagnieżdżone: new A(new B(x, new C(knex)), y) — argumenty z nawiasami, każde new osobno
            for w_ in re.finditer(r"\bnew\s+(\w+)\s*\(", tekst):
                if w_.group(1) in po_nazwie: wywolania.append((w_.group(1), self._argumenty(tekst, w_.end())[0]))
        def klasa_arg(a):                                                    # argument → nazwa klasy | None
            n = re.match(r"new\s+(\w+)\s*\(", a.strip())
            return n.group(1) if n else zmienne.get(a.strip())
        for kl, args in wywolania:
            klucz = po_nazwie[kl]
            k = self.p.klasy[klucz]
            cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
            c = re.search(r"\bconstructor\s*\(", cialo)
            if not c: continue
            surowe, kon = self._argumenty(cialo, c.end())
            b = re.match(r"[^{;]*\{", cialo[kon:])
            tresc = ",".join(self._argumenty(cialo, kon + b.end())[0]) if b else ""
            pola = dict((p_, pole) for pole, p_ in re.findall(r"this\.(\w+)\s*=\s*(\w+)", tresc))
            for i, x in enumerate(surowe):
                if i >= len(args): break
                x = x.strip()
                if x.startswith("{") and args[i].strip().startswith("{"):    # constructor({ a, b }) ← new X({ a, b: c })
                    wart = {}
                    for a in self._argumenty(args[i].strip(), 1)[0]:
                        kk, _, v = a.partition(":")
                        if kk.strip(): wart[kk.strip()] = (v or kk).strip()
                    for kk in (re.split(r"[\s:=]", y.strip())[0] for y in self._argumenty(x, 1)[0] if y.strip()):
                        cel = klasa_arg(wart.get(kk, ""))
                        if cel in po_nazwie: self._di[(klucz, pola.get(kk, kk))] = po_nazwie[cel]
                    continue
                prm = re.split(r"[\s:=?]", re.sub(r"^(?:(?:private|public|protected|readonly)\s+)+", "", x))[0]   # TS: private readonly repo: Repo
                cel = klasa_arg(args[i])
                if prm and cel in po_nazwie: self._di[(klucz, pola.get(prm, prm))] = po_nazwie[cel]
        return self._di

    def tabele_repo(self, klucz):
        k = self.p.klasy[klucz]
        linie = self.p.zrodlo(k["plik"])
        m_ = re.search(r'(?:Repository|Dao)\s*<\s*(\w+)', k.get("rozszerza", "") + " " + " ".join(linie[k["linia"] - 1:k["linia"] + 2]))
        if not m_:                                                       # TypeORM: wstrzyknięte Repository<X> w klasie
            cialo = "\n".join(linie[k["linia"] - 1:k["koniec"]])
            m_ = re.search(r'@InjectRepository\(\s*(\w+)\s*\)', cialo) or re.search(r'\bRepository\s*<\s*(\w+)\s*>', cialo)
        return [self.encje.get(m_.group(1), snake(m_.group(1)))] if m_ else []

    # pola klasy typu repozytorium z mapy: nazwa pola → klucz klasy (odbiorca odziedziczonych metod save/findById…)
    def repo_pola(self, plik):
        if not hasattr(self, "_pola"): self._pola = {}
        if plik in self._pola: return self._pola[plik]
        po_nazwie = {k["nazwa"]: kl for kl, k in self.p.klasy.items() if self.rola.get(kl) == "repozytorium"}
        wynik = {}
        for m in re.finditer(r'\b([A-Z]\w*)(?:<[^>;()]*>)?\s+(\w+)\s*[;=,)]', "\n".join(self.p.zrodlo(plik))):
            if m.group(1) in po_nazwie: wynik[m.group(2)] = po_nazwie[m.group(1)]
        self._pola[plik] = wynik
        return wynik

    def wezel(self, mid, sciezka, licznik, dodatkowe=(), zawezenie=None):
        """Drzewo wywołań od metody mid. dodatkowe: [(linia, [węzły])] — wstawione między wywołania tej metody
        (handler w miejscu next() zachowania potoku). zawezenie: parametr → typy obiektów przekazanych w miejscu wywołania
        (CheckRule(new XRule(…))) — wywołanie przez interfejs na tym parametrze rozwija się tylko do tych typów."""
        klucz, nazwa = self.p.metody[mid]
        k = self.p.klasy[klucz]
        m = next(x for x in k["metody"] if x["id"] == mid)
        w = {"klasa": k["fqn"], "nazwa": k["nazwa"], "metoda": nazwa, "rola": self.rola.get(klucz), "linia": m["linia"], "dzieci": []}
        t = self.tabele_metody(klucz, m)
        sql = self.sql_metody(klucz, m)
        if sql: w["sql"] = sql
        if t:
            w["tabele"] = t
            mozliwe = sorted({r for x in t for r in self._relacje().get(x, [])} - set(t))
            if mozliwe: w["tabele_mozliwe"] = mozliwe
        rz = self.rzuty(k, m)
        if rz: w["rzuca"] = rz
        if len(sciezka) > 14 or licznik[0] > 400: return w
        plik_tekst = "\n".join(self.p.zrodlo(k["plik"]))
        zgadniete, odziedziczone, di_pewne = set(), [], set()
        kol_ref = {}                                                            # (linia, cel) → kolumna nierozwiązanego wywołania
        for linia, ref in self.nierozw.get(mid, []):
            czesci = [c.split("(")[0] for c in ref.split(".")]                     # a.b(x).c → [a, b, c]
            nazwa_m = czesci[-1]
            if (mid, linia or 0, ref) in self.kolumny:
                for c in self.po_nazwie.get(nazwa_m, []): kol_ref.setdefault((linia, c), self.kolumny[(mid, linia or 0, ref)])
            # metoda odziedziczona po repozytorium frameworka (save, findById, saveAll…): nie ma jej w źródle, a odbiorca
            # to pole typu repozytorium z mapy → węzeł repozytorium z tabelą jego encji
            # this.pole.metoda() z DI bez typów: klasa pola z korzenia kompozycji
            if len(czesci) >= 3 and czesci[-3] == "this":
                cel_kl = self.wstrzykniecia().get((klucz, czesci[-2]))
                if cel_kl:
                    trafienia = [x["id"] for x in self.p.klasy[cel_kl]["metody"] if x["nazwa"] == nazwa_m]
                    if trafienia:
                        zgadniete.add((linia, trafienia[0])); di_pewne.add((linia, trafienia[0]))
                        continue
            mg = re.fullmatch(r"this->(\w+)", czesci[-2]) if k["jezyk"] == "php" and len(czesci) == 2 else None
            if mg:                                                          # $this->modelX->m() przez __get kontenera
                cel_kl = self.wlasciwosc_php(k, mg.group(1))
                trafienia = [x["id"] for x in self.p.klasy[cel_kl]["metody"] if x["nazwa"] == nazwa_m] if cel_kl else []
                if trafienia:
                    zgadniete.add((linia, trafienia[0])); di_pewne.add((linia, trafienia[0]))
                    continue
            rk = self.repo_pola(k["plik"]).get(czesci[-2]) if len(czesci) >= 2 else None
            if rk and not any(x["nazwa"] == nazwa_m for x in self.p.klasy[rk]["metody"]):
                rkl = self.p.klasy[rk]
                if any(l == (linia or 0) and d["klasa"] == rkl["fqn"] and d["metoda"] == nazwa_m for l, d, _ in odziedziczone): continue
                odziedziczone.append((linia or 0, {"klasa": rkl["fqn"], "nazwa": rkl["nazwa"], "metoda": nazwa_m, "rola": "repozytorium",
                                                   "linia": rkl["linia"], "dzieci": [], "tabele": self.tabele_repo(rk)}, ref))
                continue
            # odbiorca o znanym typie: wynik wywołania w łańcuchu (find(id).getVisits() → typ zwracany find) albo zmienna
            # przypisana z wywołania (var w = await repo.Znajdz(id); w.Zwroc()) — metoda tego typu, bez zgadywania
            cele_t, kl_t = self.metody_odbiorcy(klucz, m, linia, ref, czesci)
            if cele_t:
                for c in cele_t:
                    if (mid, linia or 0, ref) in self.kolumny: kol_ref.setdefault((linia, c), self.kolumny[(mid, linia or 0, ref)])
                    if c not in sciezka: zgadniete.add((linia, c)); di_pewne.add((linia, c))
                continue
            if kl_t is not None:                                                # typ znany, bez tej metody w źródle
                kt = self.p.klasy.get(kl_t) or {}
                if kt and kt["fqn"] in self.eloquent and nazwa_m in ("save", "update", "delete", "push", "increment", "decrement", "forceDelete", "touch") \
                        and not any(l == (linia or 0) and d["klasa"] == kt["fqn"] and d["metoda"] == nazwa_m for l, d, _ in odziedziczone):
                    # Eloquent: $this->webhook->save() — metoda Model, zapis do tabeli modelu
                    odziedziczone.append((linia or 0, {"klasa": kt["fqn"], "nazwa": kt["nazwa"], "metoda": nazwa_m,
                                                       "rola": self.rola.get(kl_t) if self.rola.get(kl_t) in RYSOWANE else "repozytorium",
                                                       "linia": kt["linia"], "dzieci": [], "tabele": [self.encje_php[kt["fqn"]]]}, ref))
                continue                                                        # List.add, Model::save — nie zgadujemy po nazwie
            kand = [c for c in self.po_nazwie.get(nazwa_m, []) if c not in sciezka and self._zna(plik_tekst, self.p.metody[c][0])]
            if 0 < len(kand) <= 3:
                for c in kand: zgadniete.add((linia, c))
        szyna, rozsylka = set(), set()
        if k["jezyk"] == "php":                                                 # zdarzenia i observery Laravela, szyna komend
            for linia, cel in self.php_ukryte(klucz, m):
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel))
            for linia, cel in self.szyna_php(k, m):
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel)); szyna.add((linia, cel))
        if k["jezyk"] == "python":                                              # szyna komend: bus.handle(Komenda(…))
            for linia, cel in self.szyna_py(k, m):
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel)); szyna.add((linia, cel))
            for linia, cel in self.sygnaly_py(klucz, m):                       # Django: zapis modelu → post_save / pre_save
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel))
            for linia, cel in self.rozsylka_py(k, m):                          # self.event_handlers[type(event)] → odbiorcy
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel)); rozsylka.add((linia, cel))
        if k["jezyk"] in ("typescript", "javascript"):                          # Nest: emitter.emit('x') → @OnEvent('x')
            for linia, cel in self.zdarzenia_ts(k, m):
                if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel))
        kolejnosc, synt_widziane = list(dodatkowe), set()                       # (linia wywołania, węzły) — w kolejności kodu
        poz = {}                                                                # id listy węzłów → pozycja w linii
        for linia, d, ref in odziedziczone:
            if not d["tabele"]: del d["tabele"]
            kolejnosc.append((linia, [d]))
            poz[id(kolejnosc[-1][1])] = self.pozycja_wywolania(k, linia, self.kolumny.get((mid, linia, ref)), d["metoda"])
        for linia, cel in self.referencje_metod(klucz, m):                     # this::m, X::m
            if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel))
        med = set()
        for linia, cel in self.mediatr(klucz, m, zawezenie):                    # Send(new X.Command) → handler (przez potok)
            if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel)); med.add((linia, cel))
        zal_py = set()
        for linia, cel in self.zaleznosci_py(klucz, m):                         # FastAPI: Depends(f) przed ciałem
            if cel not in sciezka: zgadniete.add((linia, cel)); di_pewne.add((linia, cel)); zal_py.add((linia, cel))
        if self.rola.get(klucz) != "zewnetrzne":                                # kafka.send(…) na polu KafkaTemplate
            for linia, d in self.klienci_pol(k, m):
                kolejnosc.append((linia, [d]))
                poz[id(kolejnosc[-1][1])] = self.pozycja_wywolania(k, linia, None, d["metoda"])
        for linia, cel, pewne in self.zdarzenia_spring(klucz, m):                   # publishEvent → @EventListener
            if cel not in sciezka:
                zgadniete.add((linia, cel))
                if pewne: di_pewne.add((linia, cel))
        # kolejność w linii: wywołania kończą się w kolejności nawiasów zamykających — find(id).getVisits(): najpierw find,
        # save(build(x)): najpierw build; CodeGraph daje kolumnę początku wyrażenia (łańcuch ma jedną kolumnę)
        def dodaj(lista):
            poz[id(lista)] = p_
            kolejnosc.append((linia or 0, lista))
        for (linia, cel) in sorted(set(self.wyw.get(mid, [])) | zgadniete):
            p_ = self.pozycja_wywolania(k, linia, self.kolumny.get((mid, linia or 0, cel), kol_ref.get((linia, cel))), self.p.metody[cel][1])
            if (linia, cel) in zal_py: p_ = self._zal_poz.get((mid, linia, cel), p_)
            if not self.odbiorca_zgodny(k, linia, cel): continue           # Instant.now() ≠ PatronCreated.now()
            pomin, rk = self.odbiorca_typu(k, linia, cel)                 # jdbcTemplate.update(…) ≠ własne update(…)
            if rk and (linia or 0, rk) not in synt_widziane:              # metoda dziedziczona po repozytorium frameworka
                synt_widziane.add((linia or 0, rk))
                rkl = self.p.klasy[rk]
                d = {"klasa": rkl["fqn"], "nazwa": rkl["nazwa"], "metoda": self.p.metody[cel][1], "rola": "repozytorium", "linia": rkl["linia"], "dzieci": []}
                if self.tabele_repo(rk): d["tabele"] = self.tabele_repo(rk)
                dodaj([d])
            if pomin: continue
            cel = self.przeciazenie(k, linia, cel)
            cele = [cel]
            ck = self.p.metody[cel][0]
            niejednoznaczny = False
            mc_ = next((x for x in self.p.klasy[ck]["metody"] if x["id"] == cel), {})
            abstrakcyjna = self.p.klasy[ck]["rodzaj"] != "interface" and (mc_.get("abstrakcyjna") or mc_.get("adnotacje", set()) & {"abstractmethod", "abc.abstractmethod"}) \
                and any(x["nazwa"] == self.p.metody[cel][1] for i in self.impl.get(ck, ()) for x in self.p.klasy[i]["metody"])
            if self.p.klasy[ck]["rodzaj"] == "interface" or abstrakcyjna:      # przez interfejs / metodę abstrakcyjną → implementacje
                # tylko implementacje aktywne w runtime (Spring @Profile); kilka aktywnych — krok niejednoznaczny
                impl = [i for i in self.impl.get(ck, ()) if not self.p.klasy[i].get("nieaktywny_profil")]
                if zawezenie:                                                  # rule.IsBroken() na parametrze z new XRule(…)
                    odb = re.findall(r"(\w+)\s*\??\.\s*" + re.escape(self.p.metody[cel][1]) + r"\s*\(", self._linia(k, linia))
                    typy_z = set().union(*(zawezenie.get(o, set()) for o in odb)) if odb else set()
                    zaw = [i for i in impl if self.nadtypy(self.p.klasy[i]["nazwa"]) & typy_z] if typy_z else []
                    if zaw: impl = zaw
                nowe = [x["id"] for i in impl for x in self.p.klasy[i]["metody"] if x["nazwa"] == self.p.metody[cel][1]]
                if not nowe:                                                   # Spring Data: metoda odziedziczona przez podinterfejs
                    nowe, synt = self.podinterfejsy(ck, self.p.metody[cel][1], impl)
                    for d in synt:
                        if (linia or 0, d["klasa"], d["metoda"]) in synt_widziane: continue
                        synt_widziane.add((linia or 0, d["klasa"], d["metoda"]))
                        dodaj([d])
                    if synt and not nowe: continue
                # metoda z ciałem w interfejsie (Java default, C# 8) nienadpisana przez część implementacji — wykonuje się
                # też ona: cel zostaje obok nadpisań, krok niejednoznaczny
                mc = next(x for x in self.p.klasy[ck]["metody"] if x["id"] == cel)
                naglowek = re.split(r"\{|=>", mc.get("cialo") or "", maxsplit=1)
                z_cialem = len(naglowek) > 1 and not naglowek[0].rstrip().endswith(";") and not mc.get("abstrakcyjna")
                bez_nadpisania = [i for i in impl if self.p.klasy[i]["rodzaj"] != "interface" and not self.p.klasy[i].get("abstrakcyjna")
                                  and not any(x["nazwa"] == self.p.metody[cel][1] for x in self.p.klasy[i]["metody"])]
                if nowe and z_cialem and bez_nadpisania: nowe = [cel] + nowe
                cele = nowe or cele
                niejednoznaczny = len({self.p.metody[c][0] for c in cele}) > 1
            for c in cele:
                if c in sciezka: continue
                licznik[0] += 1
                ck = self.p.metody[c][0]
                wpis = self.mapa["klasy"].get(self.p.klasy[ck]["fqn"]) or {}
                istotna = self.rola.get(ck) == "repozytorium" or self.p.metody[c][1] in (wpis.get("metody") or [])
                if (linia, cel) in med and (self.potok_cs() or self.dekoratory_cs()):                   # zachowania potoku mediatora wokół handlera
                    dodaj(self.przez_potok(c, sciezka, licznik))
                    continue
                zaw_c = self.zawezenie_argumentow(k, linia, c)
                if self.rola.get(ck) in RYSOWANE and istotna:
                    d = self.wezel(c, sciezka | {c}, licznik, zawezenie=zaw_c)
                    if (linia, cel) in szyna: d["_szyna"] = True
                    if (linia, cel) in zal_py: d["_zalezn"] = True
                    if (linia, cel) in zgadniete and (linia, cel) not in di_pewne: d["zgadniety"] = True
                    if niejednoznaczny or (linia, cel) in rozsylka: d["niejednoznaczny"] = True
                    dodaj([d])
                else:                                                          # klasa spoza mapy: przejdź przez nią
                    dodaj(self.wezel(c, sciezka | {c}, licznik, zawezenie=zaw_c)["dzieci"])
        if k["jezyk"] == "php": kolejnosc = self.pod_szyne(self.domkniecia_php(k, m, kolejnosc, sciezka, licznik))
        if k["jezyk"] == "python" and szyna: kolejnosc = self.pod_szyne(kolejnosc)
        for _, dz in sorted(kolejnosc, key=lambda x: (x[0], poz.get(id(x[1]), -1))): w["dzieci"].extend(dz)
        return w

    def _szyna_py_mapy(self):
        """Python: słowniki typ wiadomości → handler(y) (cosmicpython: COMMAND_HANDLERS = {commands.Allocate: allocate},
        EVENT_HANDLERS = {events.Allocated: [publish_allocated_event, …]}) → prosta nazwa typu → [id funkcji]. Słownik
        liczy się, gdy co najmniej dwa wpisy mają klucz-klasę i funkcję projektu jako wartość."""
        if hasattr(self, "_szpy"): return self._szpy
        self._szpy = defaultdict(list)
        self._szpy_listy = {}                                               # nazwa słownika (małe litery) → [id] — wartości to listy
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "{" not in tekst: continue
            for w_ in re.finditer(r"(?:^(\w+)\s*(?::[^=\n]+)?)?=\s*\{", tekst, re.M):
                wpisy, _ = self._argumenty(tekst, w_.end())
                mapa, listy = {}, True
                for wp in wpisy:
                    kv = re.fullmatch(r"(?:\w+\.)*([A-Z]\w*)\s*:\s*(\[[^\]]*\]|[\w.]+)", wp.strip(), re.S)
                    if not kv: continue
                    ids = [self._funkcja_py(plik, f.strip()) for f in kv.group(2).strip("[]").split(",") if f.strip()]
                    if ids and all(ids): mapa[kv.group(1)] = ids; listy = listy and kv.group(2).startswith("[")
                if len(mapa) >= 2:
                    for t_, ids in mapa.items(): self._szpy[t_] += [i for i in ids if i not in self._szpy[t_]]
                    if listy and w_.group(1): self._szpy_listy[w_.group(1).lower()] = list(dict.fromkeys(i for ids in mapa.values() for i in ids))
        return self._szpy

    def rozsylka_py(self, k, m):
        """Rozsyłka po typie w czasie wykonania: for handler in self.event_handlers[type(event)] — typ zdarzenia powstaje
        w domenie, więc dziećmi są wszyscy odbiorcy ze słownika typ → [handlery] o tej nazwie (EVENT_HANDLERS), jako
        niejednoznaczne. Tylko słowniki z listami (fan-out zdarzeń); komenda ma jeden handler i typ znany przy wysyłce."""
        self._szyna_py_mapy()
        if not self._szpy_listy: return []
        wynik = []
        for i, l in enumerate(self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]):
            for nazwa in re.findall(r"\b(?:self\.)?(\w+)\[\s*type\(\s*\w+\s*\)\s*\]", l):
                wynik += [(m["linia"] + i, h) for h in self._szpy_listy.get(nazwa.lower(), []) if h != m["id"]]
        return wynik

    def szyna_py(self, k, m):
        """(linia, id handlera) dla wiadomości wysyłanej na szynę w metodzie: bus.handle(cmd) przy cmd = commands.X(…),
        messagebus.handle(X(…)), dispatch/send/publish — handler ze słownika typów (_szyna_py_mapy)."""
        mapy = self._szyna_py_mapy()
        if not mapy: return []
        tekst = "\n".join(self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]])
        zmienne = {v: t_ for v, t_ in re.findall(r"\b(\w+)\s*=\s*(?:\w+\.)*([A-Z]\w*)\(", tekst)}
        wynik = []
        for w_ in re.finditer(r"\.(?:handle|dispatch|send|publish|execute|handle_command|handle_event)\(\s*(?:(?:\w+\.)*([A-Z]\w*)\(|(\w+)\s*[,)])", tekst):
            t_ = w_.group(1) or zmienne.get(w_.group(2))
            nr = m["linia"] + tekst.count("\n", 0, w_.start())
            wynik += [(nr, h) for h in mapy.get(t_, []) if h != m["id"]]
        return wynik

    def _funkcja_py(self, plik, nazwa):
        """Python: nazwa funkcji w pliku (f lokalna, from m import f [as g], modul.f przez import modułu) → id metody
        funkcji modułu z indeksu albo None."""
        imp = self._importy_py(plik)
        def w_module(mod, f):
            k = self._mod_py.get(mod)
            return next((x["id"] for x in (k or {}).get("metody", []) if x["nazwa"] == f), None)
        pierwszy, _, reszta = nazwa.partition(".")
        if reszta:                                                          # authentication.get_current_user
            baza, org = imp.get(pierwszy, (None, None))
            if baza: return w_module(f"{baza}.{org}" if org else baza, reszta)
            return None
        if pierwszy in imp:
            baza, org = imp[pierwszy]
            return w_module(baza, org) if org else None
        return w_module(modul_pythona(plik), pierwszy)

    def _importy_py(self, plik):
        """Importy pliku Pythona: nazwa lokalna → (moduł, nazwa w module | None dla „import moduł”)."""
        if not hasattr(self, "_mod_py"):
            self._mod_py = {k["fqn"]: k for k in self.p.klasy.values() if k["jezyk"] == "python" and k["rodzaj"] == "modul"}
            self._imp_py = {}
        if plik not in self._imp_py:
            imp = {}
            pakiet = modul_pythona(plik).rpartition(".")[0]
            for baza, lista in re.findall(r"^\s*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n]+)", "\n".join(self.p.zrodlo(plik)), re.M):
                lista = re.sub(r"#[^\n]*", "", lista).strip("()")
                if baza.startswith("."): baza = ".".join([x for x in pakiet.split(".")[:len(pakiet.split(".")) - (len(baza) - len(baza.lstrip(".")) - 1)] if x] + [baza.lstrip(".")]).strip(".")
                for cz in lista.split(","):
                    org, _, alias = cz.strip().partition(" as ")
                    if org.strip(): imp[(alias or org).strip()] = (baza, org.strip())
            for mod, alias in re.findall(r"^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?", "\n".join(self.p.zrodlo(plik)), re.M):
                imp[alias or mod] = (mod, None)
            self._imp_py[plik] = imp
        return self._imp_py[plik]

    def _aliasy_py(self):
        """FastAPI: aliasy zależności na poziomie modułu — SessionDep = Annotated[Session, Depends(get_db)] (też
        „X: TypeAlias = …” i „type X = …”) → {(moduł, alias): (plik, treść Annotated[…])}."""
        if hasattr(self, "_al_py"): return self._al_py
        self._al_py = {}
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "Annotated" not in tekst or ("Depends" not in tekst and "Security" not in tekst): continue
            for w_ in re.finditer(r"^(?:type\s+)?(\w+)\s*(?::\s*[\w.]+\s*)?=\s*(?:typing\.|typing_extensions\.)?Annotated\[", tekst, re.M):
                i, bilans = w_.end(), 1
                while i < len(tekst) and bilans:
                    bilans += {"[": 1, "]": -1}.get(tekst[i], 0); i += 1
                tresc = tekst[w_.end():i - 1]
                if re.search(r"\b(?:Depends|Security)\(", tresc): self._al_py[(modul_pythona(plik), w_.group(1))] = (plik, tresc)
        return self._al_py

    def _alias_py(self, plik, nazwa):
        """Alias zależności użyty w pliku (zdefiniowany w nim albo zaimportowany) → (plik aliasu, treść) | None."""
        al = self._aliasy_py()
        if not al: return None
        pierwszy, _, reszta = nazwa.partition(".")
        baza, org = self._importy_py(plik).get(pierwszy, (None, None))
        if reszta: return al.get((f"{baza}.{org}" if org else baza, reszta)) if baza else None
        return al.get((baza, org)) if baza and org else al.get((modul_pythona(plik), pierwszy))

    def zaleznosci_py(self, klucz, m):
        """FastAPI: zależności wykonywane przed ciałem funkcji — Depends(f) / Security(f) w parametrach i w
        dependencies=[Depends(f)] dekoratora. Fabryka Depends(fabryka(required=False)) → zwracana funkcja z gałęzi
        „return a if required else b” (wartość parametru z wywołania albo domyślna). → [(linia, id funkcji)]."""
        k = self.p.klasy[klucz]
        if k["jezyk"] != "python": return []
        pam = self.__dict__.setdefault("_zal_py", {})
        if m["id"] in pam: return pam[m["id"]] or []                       # None = w trakcie (cykl zależności)
        pam[m["id"]] = None
        pam[m["id"]] = self._zaleznosci_py(k, m)
        return pam[m["id"]]

    def _zaleznosci_py(self, k, m):
        linie = self.p.zrodlo(k["plik"])
        cialo = m.get("cialo") or ""
        sygn = re.search(r"\bdef\s+\w+\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)", cialo)
        nad = "" if cialo.lstrip().startswith("@") else dekoratory_py(linie, m["linia"])   # CodeGraph: start od dekoratora
        tekst = nad + "\n" + (cialo[:sygn.end()] if sygn else "")
        # adnotacje parametrów, które są aliasami zależności (session: SessionDep, user: deps.CurrentUser)
        aliasy = [(w_, self._alias_py(k["plik"], w_.group(1))) for w_ in re.finditer(r"[(,]\s*\*{0,2}\w+\s*:\s*([\w.]+)", tekst)] if sygn else []
        aliasy = [(w_, a) for w_, a in aliasy if a]
        if "Depends" not in tekst and "Security" not in tekst and not aliasy: return []
        wynik, start = [], m["linia"] - nad.count("\n") - 1
        def zbierz(tekst_, plik, nr=None):
            for w_ in re.finditer(r"\b(?:Depends|Security)\(\s*(?:dependency\s*=\s*)?([\w.]+)\s*(\()?", tekst_):
                nr_ = nr if nr is not None else start + tekst_.count("\n", 0, w_.start())
                f = self._funkcja_py(plik, w_.group(1))
                if not f: continue
                if w_.group(2):                                             # fabryka zależności
                    args, _ = self._argumenty(tekst_, w_.end())
                    wynik.extend((w_.start(), nr_, cel) for cel in self._z_fabryki(f, args))
                    continue
                wynik.append((w_.start() if nr is None else nr, nr_, f))
        zbierz(tekst, k["plik"])
        for w_, (plik_a, tresc) in aliasy:
            przed = len(wynik)
            zbierz(tresc, plik_a, start + tekst.count("\n", 0, w_.start()))
            wynik[przed:] = [(w_.start(), nr_, c) for _, nr_, c in wynik[przed:]]
        wynik.sort(key=lambda x: x[0])                                      # kolejność w tekście: dekorator, parametry
        # ta sama zależność raz na request (FastAPI: use_cache) — pierwsze wystąpienie, także jako podzależność
        # wcześniejszej (get_current_user ← SessionDep: późniejsze session: SessionDep nie woła get_db drugi raz)
        widziane, wyj = set(), []
        poz = self.__dict__.setdefault("_zal_poz", {})                      # kolejność zależności w jednej linii sygnatury
        for p_, nr, c in wynik:
            if c == m["id"] or c in widziane: continue
            widziane.add(c); wyj.append((nr, c)); poz[(m["id"], nr, c)] = p_
            widziane |= self._podzaleznosci_py(c, {m["id"], c})
        return wyj

    def _raz_na_request(self, drzewo):
        """FastAPI (use_cache): zależność rozwiązana raz w requeście — kolejne węzły tej samej zależności w drzewie
        (podzależność późniejszego parametru: get_current_user ← SessionDep po session: SessionDep) wypadają. Depends
        w sygnaturze funkcji wołanej wprost (await _get_current_user(repo, token, settings)) się nie wykonuje —
        zależności są tylko pod wejściem i pod węzłami-zależnościami."""
        widziane = set()
        def chodz(w, rozwiazywane):
            nowe = []
            for d in w["dzieci"]:
                kl, zal = (d["klasa"], d["metoda"]), d.pop("_zalezn", False)     # węzeł z Depends, nie zwykłe wywołanie
                if zal:
                    if not rozwiazywane or kl in widziane: continue
                    widziane.add(kl)
                chodz(d, zal); nowe.append(d)
            w["dzieci"] = nowe
        chodz(drzewo, True)

    def _podzaleznosci_py(self, f, sciezka):
        """Zależności zależności f (przechodnio) — FastAPI rozwiązuje je przed f i trzyma w pamięci requestu."""
        kf, _ = self.p.metody[f]
        mf = next(x for x in self.p.klasy[kf]["metody"] if x["id"] == f)
        wynik = set()
        for _, c in self.zaleznosci_py(kf, mf):
            if c in sciezka: continue
            wynik.add(c); wynik |= self._podzaleznosci_py(c, sciezka | {c})
        return wynik

    def _z_fabryki(self, f, args):
        """Funkcje zwracane przez fabrykę zależności dla podanych argumentów wywołania."""
        kf, _ = self.p.metody[f]
        mf = next(x for x in self.p.klasy[kf]["metody"] if x["id"] == f)
        r = re.search(r"^\s+return\s+(\w+)(?:\s+if\s+(not\s+)?(\w+)\s+else\s+(\w+))?\s*(?:#.*)?$", mf.get("cialo") or "", re.M)
        if not r: return []
        if not r.group(3): nazwy = [r.group(1)]
        else:
            dom = re.search(r"\b" + re.escape(r.group(3)) + r"\s*(?::[^=,)]+)?=\s*(\w+)", (mf.get("cialo") or "").split(")")[0])
            wart = dict(a.split("=", 1) for a in (x.replace(" ", "") for x in args) if "=" in a).get(r.group(3), dom.group(1) if dom else None)
            if wart in ("True", "False"):
                prawda = (wart == "True") != bool(r.group(2))
                nazwy = [r.group(1) if prawda else r.group(4)]
            else: nazwy = [r.group(1), r.group(4)]
        return [c for c in (self._funkcja_py(self.p.klasy[kf]["plik"], n) for n in nazwy) if c]

    @staticmethod
    def pod_szyne(kolejnosc):
        """Handler wiadomości (z szyna_php) pod najgłębszy węzeł szyny wywołany w tej samej linii: kontroler →
        ApiController.dispatch → InMemorySymfonyCommandBus.dispatch → CreateCourseCommandHandler.__invoke."""
        handlery = [(l, d) for l, dz in kolejnosc for d in dz if d.pop("_szyna", None)]
        if not handlery: return kolejnosc
        for l, h in handlery:
            inne = [d for l2, dz in kolejnosc if l2 == l for d in dz if d is not h and not d.get("_szyna")]
            if not inne: continue
            cel = inne[0]
            while True:
                dalej = [x for x in cel["dzieci"] if re.match(r"(?:dispatch\w*|ask|handle(?:_command)?|send|query|command|execute|__invoke)$", x["metoda"])]
                if not dalej: break
                cel = dalej[0]
            cel["dzieci"].append(h)
            for i, (l2, dz) in enumerate(kolejnosc):
                if h in dz: kolejnosc[i] = (l2, [d for d in dz if d is not h])
        return kolejnosc

    def domkniecia_php(self, k, m, kolejnosc, sciezka, licznik):
        """PHP: domknięcie przekazane do konstruktora opakowania, na którym od razu woła się metodę —
        (new DatabaseTransaction(function () { … }))->run() — wykonuje się w tej metodzie (run), nie w metodzie
        otaczającej: wywołania z linii domknięcia trafiają pod węzeł X.run (SQL transakcji ma właściciela)."""
        linie = self.p.zrodlo(k["plik"])
        tekst = "\n".join(linie[m["linia"] - 1:m["koniec"]])
        po_nazwie = None
        for w_ in re.finditer(r"\(\s*new\s+\\?(?:[\w\\]+\\)?(\w+)\s*\(\s*(?:static\s+)?(?:function|fn)\b", tekst):
            _, kon = self._argumenty(tekst, tekst.index("(", w_.start() + 1) + 1)
            po = re.match(r"\s*\)\s*->\s*(\w+)\s*\(", tekst[kon:])
            if not po: continue
            po_nazwie = po_nazwie or {x["nazwa"]: kl for kl, x in self.p.klasy.items() if x["jezyk"] == "php"}
            kl = po_nazwie.get(w_.group(1))
            cel = next((x["id"] for x in self.p.klasy[kl]["metody"] if x["nazwa"] == po.group(1)), None) if kl else None
            if not cel or cel in sciezka: continue
            od = m["linia"] + tekst.count("\n", 0, w_.start())
            do = m["linia"] + tekst.count("\n", 0, kon + po.end())
            fqn_ = self.p.klasy[kl]["fqn"]
            jest = [(i, d) for i, (l, dz) in enumerate(kolejnosc) if od <= l <= do for d in dz if d["klasa"] == fqn_ and d["metoda"] == po.group(1)]
            if jest: i_run, wez = jest[0]
            else:
                wez = self.wezel(cel, sciezka | {cel}, licznik)
                kolejnosc.append((do, [wez])); i_run = len(kolejnosc) - 1
            zostaje, wewnatrz = [], []
            for i, (l, dz) in enumerate(kolejnosc):
                if i != i_run and od <= l <= do: wewnatrz.append((l, [d for d in dz if d is not wez]))
                else: zostaje.append((l, dz))
            for _, dz in sorted(wewnatrz, key=lambda x: x[0]): wez["dzieci"].extend(dz)
            kolejnosc = zostaje
        return kolejnosc

    def podinterfejsy(self, ck, nazwa, impl):
        """Interfejs domenowy bez aktywnej implementacji z tą metodą, a z aktywnym podinterfejsem Spring Data
        (SpringDataOwnerRepository extends OwnerRepository, Repository<Owner, Integer>): metoda dziedziczona z repozytorium
        frameworka. Fragment z własną implementacją (PetRepositoryOverride → SpringDataPetRepositoryImpl.delete) — ta
        implementacja; inaczej węzeł podinterfejsu z tabelą jego encji. → (id metod, węzły bez źródła)."""
        po_nazwie = {x["nazwa"]: kl for kl, x in self.p.klasy.items()}
        ids, synt = [], []
        for i in impl:
            ki = self.p.klasy[i]
            if ki["rodzaj"] != "interface": continue
            nad = [re.sub(r"<.*", "", n).strip().split(".")[-1] for n in re.split(r",(?![^<]*>)", ki.get("rozszerza", "")) if n.strip()]
            if not any(re.fullmatch(r"\w*(Repository|Dao)", n) and n not in po_nazwie for n in nad): continue   # bez bazy frameworka
            fragmenty = [x["id"] for n in nad if n in po_nazwie and po_nazwie[n] != ck
                         for j in self.impl.get(po_nazwie[n], ()) if self.p.klasy[j]["rodzaj"] != "interface" and not self.p.klasy[j].get("nieaktywny_profil")
                         for x in self.p.klasy[j]["metody"] if x["nazwa"] == nazwa]
            if fragmenty: ids += fragmenty; continue
            d = {"klasa": ki["fqn"], "nazwa": ki["nazwa"], "metoda": nazwa, "rola": "repozytorium", "linia": ki["linia"], "dzieci": []}
            t = self.tabele_repo(i)
            if t: d["tabele"] = t
            synt.append(d)
        return list(dict.fromkeys(ids)), synt

    def _linia(self, k, linia):
        l = self.p.zrodlo(k["plik"])
        return l[linia - 1] if linia and 0 < linia <= len(l) else ""

    def zawezenie_argumentow(self, k, linia, cel):
        """Argumenty tworzone w miejscu wywołania (CheckRule(new CustomerCannotOrderMoreThan2OrdersOnTheSameDayRule(…)))
        → {nazwa parametru metody celu: {typ}} albo None."""
        tekst = self._linia(k, linia)
        nazwa = self.p.metody[cel][1]
        if "new" not in tekst: return None
        w_ = re.search(r"(?<![\w$])" + re.escape(nazwa) + r"\s*(?:<[^<>()]*>)?\s*\(", tekst)
        if not w_: return None
        args, _ = self._argumenty(tekst, w_.end())
        typy = [re.match(r"new\s+([\w.]+)\s*[({<]", a.strip()) for a in args]
        if not any(typy): return None
        mc = next(x for x in self.p.klasy[self.p.metody[cel][0]]["metody"] if x["id"] == cel)
        sg = re.search(re.escape(nazwa) + r"\s*(?:<[^<>()]*>)?\s*\(([^)]*)\)", mc.get("cialo") or "")
        if not sg: return None
        prm = [re.split(r"[\s:=?]+", re.sub(r"^(?:(?:final|readonly|private|public|protected|this|params|ref|out|in)\s+)+", "", x.strip().split("=")[0].strip()))
               for x in re.split(r",(?![^<]*>)", sg.group(1)) if x.strip()]
        wynik = {}
        for t, pr in zip(typy, prm):
            if not t or not pr: continue
            n = pr[-1] if k["jezyk"] in ("java", "csharp", "kotlin") or len(pr) == 1 else pr[0]   # Java/C#: Typ nazwa; TS/Python: nazwa: Typ
            wynik[n.lstrip("$")] = {t.group(1).split(".")[-1]}
        return wynik or None

    def klienci_pol(self, k, m):
        """Wywołania na polu / parametrze typu klienta innego systemu (KafkaTemplate, RestTemplate, WebClient, JmsTemplate,
        HttpClient…) w metodzie klasy z mapy, która sama nie jest klientem — kafka.send(temat, …) w OutboxPublisher.
        → [(linia, węzeł „zewnetrzne”)] z celem (temat / adres), gdy pierwszy argument to literał albo stała."""
        if k["jezyk"] not in ("java", "csharp", "typescript", "javascript", "kotlin"): return []
        typy = {n: t for n, t in self.typy_pol(k["plik"]).items() if t in TYPY_KLIENTOW and t not in self._po_nazwie_klas()}
        if not typy: return []
        plik = "\n".join(self.p.zrodlo(k["plik"]))
        wynik, linie = [], self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]
        for i, l in enumerate(linie[1:], 1):                                 # bez linii deklaracji (parametry)
            for o, met in re.findall(r"(?<![\w$.])(?:this\.|_)?(\w+)\s*\??\.\s*(\w+)\s*\(", l):
                t = typy.get(o) or typy.get("_" + o)
                if not t or any(d["metoda"] == met and nr == m["linia"] + i for nr, d in wynik): continue
                imp = re.search(r"^\s*(?:import|using)\s+([\w.]+\." + re.escape(t) + r")\s*;", plik, re.M)
                d = {"klasa": imp.group(1) if imp else t, "nazwa": t, "metoda": met, "rola": "zewnetrzne", "linia": m["linia"] + i, "dzieci": []}
                w_ = re.search(r"\b" + re.escape(o) + r"\s*\??\.\s*" + re.escape(met) + r"\s*\(", l)
                args, _ = self._argumenty(l, w_.end()) if w_ else ([], 0)
                a0 = args[0].strip() if args else ""
                cel = a0.strip("\"'`") if re.fullmatch(r"([\"'`])[^\"'`]*\1", a0) else self.stale.get(a0.split(".")[-1])
                if cel: d["cel"] = cel
                wynik.append((m["linia"] + i, d))
        return wynik

    def pozycja_wywolania(self, k, linia, kolumna, nazwa):
        """Miejsce wykonania wywołania w jego linii: pozycja nawiasu zamykającego (argumenty i odbiorca w łańcuchu idą
        wcześniej — find(id).getVisits(), save(build(x))). Z lambdą / domknięciem w argumentach — nawias otwierający
        (ciało lambdy wykonuje się w środku wywołania). Wywołanie niedomknięte w tej linii — za resztą linii.
        kolumna: początek wyrażenia z CodeGraph (None — szukamy nazwy od początku linii)."""
        tekst = self._linia(k, linia)
        if not tekst: return 0
        od = max(0, (kolumna or 0) - 1)
        w_ = re.compile(r"(?<![\w$])" + re.escape(nazwa) + r"\s*(?:<[^<>()]*>)?\s*\(").search(tekst, od)
        if not w_: return len(tekst)                     # wywołanie niejawne (słuchacz, handler) — po wyrażeniu, które je wyzwala
        args, kon = self._argumenty(tekst, w_.end())
        if kon >= len(tekst) and not tekst.rstrip().endswith(")"): return len(tekst) + 1
        if re.search(r"->|=>|\bfunction\b|\bfn\b|\blambda\b", ",".join(args)): return w_.end()
        return kon

    # opakowania wyniku: typ właściwy to argument (Task<T>, Promise<T | null>, Optional<T>, Optional[T])
    OPAKOWANIA = {"Task", "ValueTask", "Promise", "Optional", "Mono", "Future", "CompletableFuture", "CompletionStage",
                  "Awaitable", "Coroutine", "Maybe", "Nullable", "Option", "PromiseLike"}

    def zdejmij_typ(self, t):
        """Wyrażenie typu → prosta nazwa typu wartości: bez ?, null / undefined / None z unii i bez opakowań
        asynchronicznych / opcjonalnych. Kolekcje i inne generyki → None (element nie jest odbiorcą)."""
        t = (t or "").strip()
        for _ in range(5):
            t = re.sub(r"^\?|\?$", "", t.strip()).strip()
            cz = [x.strip() for x in re.split(r"\|(?![^<\[]*[>\]])", t) if x.strip() not in ("null", "undefined", "None", "void", "")]
            if len(cz) != 1: return None
            t = cz[0]
            g = re.fullmatch(r"([\w.\\]+)\s*(?:<(.*)>|\[(.*)\])", t, re.S)
            if g and re.split(r"[.\\]", g.group(1))[-1] in self.OPAKOWANIA: t = g.group(2) or g.group(3); continue
            if g or not re.fullmatch(r"[\w.\\]+", t): return None
            return re.split(r"[.\\]", t)[-1]
        return None

    def typ_zwracany(self, cel):
        """Prosta nazwa typu zwracanego metody projektu: deklaracja w źródle (C#: Task<Wypozyczenie> Znajdz(…), Java: Pet
        findPetById(…), TS: znajdz(…): Promise<Wypozyczenie | null>, Python: -> X, PHP: ): ?X), inaczej sygnatura CodeGraph
        (Java: „Pet (int id)”). → nazwa | None."""
        if not hasattr(self, "_tz"): self._tz = {}
        if cel in self._tz: return self._tz[cel]
        klucz, nazwa = self.p.metody[cel]
        m = next(x for x in self.p.klasy[klucz]["metody"] if x["id"] == cel)
        cialo, typ = m.get("cialo") or "", None
        d = re.search(r"(?<![\w$.])" + re.escape(nazwa) + r"\s*(?:<[^<>()]*>)?\s*\(", cialo)
        if d:
            _, kon = self._argumenty(cialo, d.end())
            po = re.match(r"\s*(?:->|:)\s*([^{;=\n]+?)\s*(?:\{|=>|;|:?\s*$|:\s*\n)", cialo[kon:kon + 300])
            przed = cialo[cialo.rfind("\n", 0, d.start()) + 1:d.start()]
            przed = re.sub(r"\b(?:public|private|protected|internal|static|final|async|abstract|override|virtual|sealed|readonly|synchronized|new|def|function|fun|func)\b", " ", przed)
            pr = re.search(r"([\w.\\]+(?:<.*>)?(?:\[\])?\??)\s*$", przed.strip()) if przed.strip() and not przed.strip().startswith("@") else None
            if po and re.match(r"[\w?\\]", po.group(1).strip()): typ = po.group(1)
            elif pr and pr.group(1) not in ("void", "var", "get", "set"): typ = pr.group(1)
        if not typ:
            s_ = re.match(r"\s*([^()]+?)\s*\(", m.get("sygnatura") or "")
            if s_: typ = s_.group(1)
        self._tz[cel] = self.zdejmij_typ(typ) if typ else None
        return self._tz[cel]

    def metody_typu(self, typ, nazwa):
        """Metody o tej nazwie w typie projektu (prosta nazwa) albo jego nadtypach z projektu. → (ids, typ jest w projekcie)."""
        if typ not in self._po_nazwie_klas(): return [], False
        for n in [typ] + sorted(self.nadtypy(typ) - {typ}):
            ids = [x["id"] for k_ in self._po_nazwie_klas().get(n, ()) for x in k_["metody"] if x["nazwa"] == nazwa]
            if ids: return ids[:3], True
        return [], True

    def metody_odbiorcy(self, klucz, m, linia, ref, czesci):
        """Wywołanie nierozwiązane przez CodeGraph na odbiorcy o typie wyliczalnym bez zgadywania:
        - wynik wywołania w łańcuchu: this.svc.findPetById(id).getVisits() — typ zwracany findPetById (krawędź w tej linii);
        - zmienna lokalna z typem jawnym albo przypisana z wywołania: var w = await repo.Znajdz(id) / const w = await
          this.repo.znajdz(id) (Task<T>, Promise<T | null>) — typ zwracany wywołanej metody;
        - PHP: właściwość z typem (protected Webhook $webhook; @var Webhook; promocja w konstruktorze) i (new X())->m().
        → (ids metod celu, klucz klasy typu odbiorcy, gdy to typ projektu | None)."""
        k = self.p.klasy[klucz]
        seg = ref.split(".")
        if len(seg) == 1 and k["jezyk"] == "python":                      # CodeGraph (Python) zapisuje samą nazwę: odbiorca z linii
            w_ = re.search(r"(?<![\w.])((?:\w+\.)+)" + re.escape(ref) + r"\s*\(", self._linia(k, linia))
            if w_: seg = w_.group(1).rstrip(".").split(".") + [ref]
        if len(seg) < 2 or k["jezyk"] not in ("java", "csharp", "typescript", "javascript", "python", "kotlin", "php"): return [], None
        odb = seg[-2]
        typy = []
        nowy = re.fullmatch(r"\(?\s*new\s+\\?([\w\\]+)\s*\(.*\)\s*\)?", odb)
        wl = re.fullmatch(r"(?:\$?this->|this\.)(\w+)", odb) if k["jezyk"] == "php" else None
        if nowy: typy = [nowy.group(1)]
        elif wl and len(seg) == 2: typy = [self.typ_wlasciwosci_php(k, wl.group(1))]
        elif len(seg) == 3 and re.fullmatch(r"[a-z_]\w*", seg[0]) and re.fullmatch(r"\w+", seg[1]) and k["jezyk"] in ("python", "typescript", "javascript", "java", "csharp"):
            # uow.products.get(…) / self.repo.get(…): typ atrybutu w klasie odbiorcy (adnotacja products: AbstractRepository)
            wlasc = klucz if seg[0] in ("self", "this") else None
            if not wlasc:
                t0 = self.typ_zmiennej(klucz, m, seg[0])
                wlasc = next((x for x, kk in self.p.klasy.items() if kk["nazwa"] == t0 and kk["rodzaj"] != "modul"), None) if t0 else None
            typy = [self.typ_atrybutu(wlasc, seg[1])] if wlasc else []
        elif odb.endswith(")"):
            cele = [t for l, t in self.wyw.get(m["id"], []) if l == linia and self.p.metody[t][1] == czesci[-2]]
            typy = [self.typ_zwracany(t) for t in cele]
        elif len(seg) == 2 and re.fullmatch(r"\$?[a-z_]\w*", odb) and odb.lstrip("$") not in ("this", "self", "super", "base", "cls"):
            typy = [self.typ_zmiennej(klucz, m, odb.lstrip("$"))]
        if typy == [""]: return [], ""                                      # typ spoza projektu (kolekcja wbudowana)
        typy = list(dict.fromkeys(t for t in typy if t))
        if len(typy) != 1: return [], None
        typ = typy[0]
        kl = None
        if k["jezyk"] == "php":                                             # PHP: klasa po FQN z use / przestrzeni nazw
            f = typ.replace("\\", ".") if "\\" in typ else self.php_fqn(k["plik"], typ)
            kl = next((x for x, kk in self.p.klasy.items() if kk["fqn"] == f), None)
            typ = typ.split("\\")[-1]
            if not kl:                                                      # typ zwracany z use innego pliku: jedyna klasa o tej nazwie
                kand = [x for x, kk in self.p.klasy.items() if kk["jezyk"] == "php" and kk["nazwa"] == typ and kk["rodzaj"] != "modul"]
                kl = kand[0] if len(kand) == 1 else None
            if not kl: return [], None
            ids = [x["id"] for x in self.p.klasy[kl]["metody"] if x["nazwa"] == czesci[-1]]
            if not ids:
                for n in self._przodkowie_php(self.p.klasy[kl])["nazwy"]:
                    ids = [x["id"] for kk in self._po_nazwie_klas().get(n, ()) if kk["jezyk"] == "php" for x in kk["metody"] if x["nazwa"] == czesci[-1]]
                    if ids: break
            return ids[:3], kl
        ids, znany = self.metody_typu(typ, czesci[-1])
        if not znany: return [], None
        return ids, next((x for x, kk in self.p.klasy.items() if kk["nazwa"] == typ and kk["rodzaj"] != "modul"), None)

    def typ_atrybutu(self, klucz, nazwa):
        """Typ atrybutu / pola klasy (z nadtypami z projektu): Python — adnotacja w ciele klasy (products: AbstractRepository)
        albo self.x: T = … / self.x = T(…); inne języki — deklaracja pola w pliku klasy."""
        k = self.p.klasy[klucz]
        for n in [k["nazwa"]] + sorted(self.nadtypy(k["nazwa"]) - {k["nazwa"]}):
            for x in ([k] if n == k["nazwa"] else self._po_nazwie_klas().get(n, ())):
                if x["jezyk"] == "python":
                    cialo = "\n".join(self.p.zrodlo(x["plik"])[x["linia"] - 1:x["koniec"]])
                    t = re.search(r"^\s+" + re.escape(nazwa) + r"\s*:\s*([^=\n#]+)", cialo, re.M) or \
                        re.search(r"\bself\." + re.escape(nazwa) + r"\s*:\s*([^=\n#]+)=", cialo) or \
                        re.search(r"\bself\." + re.escape(nazwa) + r"\s*=\s*((?:\w+\.)*[A-Z]\w*)\(", cialo)
                    if t: return self.zdejmij_typ(t.group(1).strip().strip("'\""))
                    w_ = re.search(r"\bself\." + re.escape(nazwa) + r"\s*=\s*(set|list|dict|tuple|frozenset|defaultdict|deque|OrderedDict|Counter)?\s*([\[{(])", cialo)
                    if w_: return ""                                         # kolekcja wbudowana (self.seen = set()) — typ spoza projektu
                else:
                    t = self.typy_pol(x["plik"]).get(nazwa)
                    if t: return t
        return None

    def _po_nazwie_klas(self):
        if not hasattr(self, "_po_nazwie_kl"):
            self._po_nazwie_kl = defaultdict(list)
            for x in self.p.klasy.values():
                if x["rodzaj"] != "modul": self._po_nazwie_kl[x["nazwa"]].append(x)
        return self._po_nazwie_kl

    def typ_wlasciwosci_php(self, k, nazwa):
        """PHP: zadeklarowany typ właściwości klasy — typed property (protected Webhook $webhook;), promocja w konstruktorze
        (private readonly Repo $repo) albo docblock @var nad nią. → nazwa typu (z przestrzenią nazw, jeśli podana) | None."""
        cialo = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
        t = re.search(r"\b(?:private|protected|public|var)\s+(?:static\s+)?(?:readonly\s+)?\??(\\?[A-Z][\w\\]*)\s+\$" + re.escape(nazwa) + r"\b", cialo)
        if t: return t.group(1).lstrip("\\")
        d = re.search(r"@var\s+\??(\\?[A-Z][\w\\]*)(?:\|null)?\s*(?:\$" + re.escape(nazwa) + r"\b)?[^/]*?\*/\s*(?:(?:private|protected|public|var)\s+)+(?:static\s+)?\$" + re.escape(nazwa) + r"\b", cialo)
        return d.group(1).lstrip("\\") if d else None

    def typ_zmiennej(self, klucz, m, v):
        """Typ zmiennej lokalnej / parametru w metodzie: deklaracja jawna (Wypozyczenie w = …, const w: Wypozyczenie = …,
        parametr w: T / T w) albo typ zwracany metody, z której wywołania jest przypisana (z await)."""
        k = self.p.klasy[klucz]
        cialo = m.get("cialo") or ""
        dekl = re.search(r"(?:\b(?:var|let|const|val|auto)\s+|\b([A-Z][\w.]*(?:<[^<>;()=]*>)?\??)\s+|^\s*)\$?" + re.escape(v) +
                         r"\b\s*(?::\s*([^=;,)]+?))?\s*=(?![=>])\s*(?:await\s+)?([^;\n]*)", cialo, re.M)
        if dekl:
            if dekl.group(1): return self.zdejmij_typ(dekl.group(1))
            if dekl.group(2): return self.zdejmij_typ(dekl.group(2))
            wyr = dekl.group(3).strip()
            n = re.match(r"new\s+([\w.]+)\s*[({]", wyr)
            if n: return n.group(1).split(".")[-1]
            w_ = re.match(r"((?:[\w$]+\s*(?:\?\.|\.|->)\s*)*)(\w+)\s*(?:<[^<>()]*>)?\s*\(", wyr)
            if not w_: return None
            nr = m["linia"] + cialo.count("\n", 0, dekl.start(3))
            cele = [t for l, t in self.wyw.get(m["id"], []) if l == nr and self.p.metody[t][1] == w_.group(2)]
            if not cele:                                                    # odbiorca to pole o znanym typie: this.repo.znajdz(…)
                pole = [x for x in re.split(r"\s*(?:\?\.|\.|->)\s*", w_.group(1)) if x and x not in ("this", "self")]
                if len(pole) == 1:
                    kl = self.wstrzykniecia().get((klucz, pole[0]))
                    typ_p = self.p.klasy[kl]["nazwa"] if kl else self.typy_pol(k["plik"]).get(pole[0])
                    cele = self.metody_typu(typ_p, w_.group(2))[0] if typ_p else []
            typy = {self.typ_zwracany(t) for t in cele} - {None}
            return typy.pop() if len(typy) == 1 else None
        naglowek = cialo.split("{")[0]
        p_ = re.search(r"[(,]\s*(?:(?:private|public|protected|readonly)\s+)*" + re.escape(v) + r"\s*\??\s*:\s*([\w.]+(?:<[^<>]*>)?)", naglowek) or \
            re.search(r"[(,]\s*(?:final\s+)?([A-Z][\w.]*(?:<[^<>]*>)?\??)\s+" + re.escape(v) + r"\s*[,)=]", naglowek)
        return self.zdejmij_typ(p_.group(1)) if p_ else None

    def odbiorca_zgodny(self, k, linia, cel):
        """Java/TS: wywołanie statyczne kwalifikowane klasą (Instant.now(), Optional.of()) prowadzi do tej klasy —
        CodeGraph łączy je czasem po samej nazwie metody z inną klasą projektu. Odrzucamy krawędź, gdy w linii wywołania
        każdy odbiorca tej metody to inna klasa (wielka litera), a wywołania bez odbiorcy nie ma."""
        if k["jezyk"] == "php": return self._odbiorca_php(k, linia, cel)
        if k["jezyk"] not in ("java", "typescript", "javascript"): return True
        tekst = self._linia(k, linia)
        ck, nazwa = self.p.metody[cel]
        if not tekst or not re.search(r"\b" + re.escape(nazwa) + r"\s*\(", tekst): return True
        odb = re.findall(r"(\w+)\s*\.\s*(?:<[^>]*>\s*)?" + re.escape(nazwa) + r"\s*\(", tekst)
        if not odb or re.search(r"(?<![.\w])" + re.escape(nazwa) + r"\s*\(", tekst): return True
        kc = self.p.klasy[ck]
        swoje = {kc["nazwa"], *kc["qn"].split("::")[1:], *[n.strip().split("<")[0].split(".")[-1] for n in (kc.get("rozszerza", "") + "," + kc.get("implementuje", "")).split(",") if n.strip()]}
        return any(not o[0].isupper() or o in swoje or o in ("this", "super") for o in odb)

    def typy_pol(self, plik):
        """Java / C# / TS: nazwa pola, parametru albo zmiennej → zadeklarowany typ (prosta nazwa), z całego pliku."""
        if not hasattr(self, "_typy_pol"): self._typy_pol = {}
        if plik not in self._typy_pol:
            tekst = "\n".join(self.p.zrodlo(plik))
            w = {}
            for typ, nazwa in re.findall(r"\b([A-Z][\w.]*)(?:<[^>;()]*>)?(?:\[\])?\s+(\w+)\s*[;=,)]", tekst): w.setdefault(nazwa, typ.split(".")[-1])
            for nazwa, typ in re.findall(r"\b(\w+)\s*:\s*([A-Z][\w.]*)(?:<[^>;()]*>)?\s*[;=,)]", tekst): w.setdefault(nazwa, typ.split(".")[-1])
            self._typy_pol[plik] = w
        return self._typy_pol[plik]

    def odbiorca_typu(self, k, linia, cel):
        """Odbiorca wywołania z zadeklarowanym typem (pole, parametr, zmienna) a cel krawędzi CodeGraph / zgadywania:
        - typ spoza projektu (JdbcTemplate, EntityManager, RestTemplate) — krawędź do metody projektu o tej nazwie
          jest fałszywa (jdbcTemplate.update(…) ≠ własne update(…));
        - typ z projektu niezwiązany z klasą celu (patronEntityRepository.save(…) → BookDatabaseRepository.save) — też
          fałszywa; gdy typ to repozytorium bez tej metody w źródle, metoda jest dziedziczona po repozytorium frameworka.
        Liczy się tylko, gdy każde wywołanie tej nazwy w linii (z następną: łańcuch .save( w nowej linii) ma taki odbiorca.
        → (pominąć, klucz repozytorium z metodą dziedziczoną | None)."""
        if k["jezyk"] not in ("java", "csharp", "typescript", "javascript") or not linia: return False, None
        ck, nazwa = self.p.metody[cel]
        tekst = self._linia(k, linia) + "\n" + self._linia(k, linia + 1)
        if re.search(r"(?<![.\w])" + re.escape(nazwa) + r"\s*\(", tekst): return False, None
        odb = re.findall(r"(\w+)\s*\??\.\s*(?:<[^>]*>\s*)?" + re.escape(nazwa) + r"\s*\(", tekst)
        if not odb: return False, None
        if not hasattr(self, "_nazwy_projektu"):
            self._klucz_nazwy = {}
            for kl, x in self.p.klasy.items(): self._klucz_nazwy.setdefault(x["nazwa"], kl)
            self._nazwy_projektu = set(self._klucz_nazwy) | {
                n.strip().split("<")[0].split(".")[-1] for x in self.p.klasy.values()
                for n in re.split(r"[,\s]+", x.get("implementuje", "") + "," + x.get("rozszerza", "") + "," + x.get("bazowe", "")) if n.strip()}
        typy = dict(self.typy_pol(k["plik"]))
        m = next((x for x in k["metody"] if x["linia"] <= linia <= x["koniec"]), None)   # deklaracja w metodzie ma pierwszeństwo
        if m:
            typy.update({n: t.split(".")[-1] for t, n in re.findall(r"\b([A-Z][\w.]*)(?:<[^>;()]*>)?(?:\[\])?\s+(\w+)\s*[;=,)]", m.get("cialo") or "")})
        cn = self.p.klasy[ck]["nazwa"]
        obce, niezwiazane = 0, set()
        for o in odb:
            t = typy.get(o) if o not in ("this", "super", "base") and o[:1].islower() else None
            if not t: return False, None
            if t not in self._nazwy_projektu: obce += 1; continue
            if cn in self.nadtypy(t) or t in self.nadtypy(cn) or t not in self._klucz_nazwy: return False, None
            niezwiazane.add(t)
        repo = None
        if len(niezwiazane) == 1:
            rk = self._klucz_nazwy[next(iter(niezwiazane))]
            if self.rola.get(rk) == "repozytorium" and not any(x["nazwa"] == nazwa for x in self.p.klasy[rk]["metody"]): repo = rk
        return True, repo

    def _odbiorca_php(self, k, linia, cel):
        """PHP: CodeGraph rozwiązuje ->json() / ->filter() / ->map() po samej nazwie metody (BookApiController → ApiDocsController
        ::json). Dla metod o nazwach kolekcji / odpowiedzi zostawiamy krawędź tylko przy znanym typie odbiorcy: $this (własna
        klasa i przodkowie), Klasa::m(), zmienna z typem parametru / new / właściwość z typem."""
        ck, nazwa = self.p.metody[cel]
        tekst = self._linia(k, linia)
        # metodę klasy woła się tylko przez ->m( / ::m( — samo m( to funkcja albo konstrukcja języka (empty, isset,
        # count, array_map…), której CodeGraph przypisał metodę o tej nazwie (TrashCan::empty)
        przed = [tekst[:x.start()].rstrip() for x in re.finditer(r"(?<![\w$])" + re.escape(nazwa) + r"\s*\(", tekst or "")]
        if przed and not any(p_.endswith(("->", "::")) for p_ in przed): return False
        if nazwa not in GENERYCZNE_PHP: return True
        if not tekst: return True
        kc = self.p.klasy[ck]
        swoje = {kc["nazwa"]}
        # przodkowie: bazowe „WebController, ApiController” / „X implements Y” (z przecinkami i przestrzeniami nazw)
        # i dalej łańcuch extends z projektu
        przodkowie = {x.split("\\")[-1] for x in re.split(r"[\s,]+", k.get("bazowe") or "") if x} | {k["nazwa"]} | set(self._przodkowie_php(k)["nazwy"])
        for odb in re.findall(r"(\$this|\$\w+|\b[A-Z]\w*)\s*(?:->|::)\s*" + re.escape(nazwa) + r"\s*\(", tekst):
            if odb == "$this":
                if kc["nazwa"] in przodkowie: return True
                continue
            if not odb.startswith("$"):
                if odb in swoje or odb in ("self", "static", "parent") and kc["nazwa"] in przodkowie: return True
                continue
            plik = "\n".join(self.p.zrodlo(k["plik"]))
            typy = set(re.findall(r"\b([A-Z]\w*)\s+" + re.escape(odb) + r"\b", plik)) | \
                set(re.findall(re.escape(odb) + r"\s*=\s*new\s+\\?(?:[\w\\]+\\)?(\w+)", plik))
            if typy & swoje: return True
        return False

    def przeciazenie(self, k, linia, cel):
        """Przeciążenia (find(BookId) / find(PatronId)): CodeGraph wskazuje jedno z nich dla każdego wywołania. Wybieramy
        po liczbie argumentów i po zgodności typu / nazwy parametru z tekstem argumentu (command.getPatronId() → PatronId)."""
        ck, nazwa = self.p.metody[cel]
        kand = [x for x in self.p.klasy[ck]["metody"] if x["nazwa"] == nazwa]
        if len(kand) < 2: return cel
        tekst = " ".join(self.p.zrodlo(k["plik"])[max(0, linia - 1):linia + 2]) if linia else ""
        mm = re.search(r"(?<![\w$])" + re.escape(nazwa) + r"\s*\(", tekst)
        if not mm: return cel
        i, glebia, arg, args = mm.end(), 1, "", []
        while i < len(tekst) and glebia:
            c = tekst[i]; i += 1
            if c in "([{": glebia += 1
            elif c in ")]}": glebia -= 1
            if glebia == 1 and c == ",": args.append(arg); arg = ""; continue
            if glebia: arg += c
        if arg.strip(): args.append(arg)
        def parametry(x):
            sig = x.get("sygnatura") or ""
            w = re.search(r"\((.*)\)", sig, re.S)
            if not w:
                w = re.search(re.escape(nazwa) + r"\s*\(([^)]*)\)", x.get("cialo") or "")
            cz = [c.strip() for c in re.split(r",(?![^<]*>)", w.group(1)) if c.strip()] if w else []
            return [re.sub(r"@\w+(\([^)]*\))?\s*", "", c).split() for c in cz]
        def wynik(x):
            prm = parametry(x)
            pkt = -10 * abs(len(prm) - len(args))
            for a, pr in zip(args, prm):
                a = a.lower().replace("_", "")
                typ = pr[-2].split("<")[0].split(".")[-1].lower() if len(pr) >= 2 else ""
                nazwa_p = pr[-1].lower() if pr else ""
                if typ and typ in a: pkt += 2                                   # typ parametru w argumencie (getPatronId → PatronId)
                if len(nazwa_p) > 2 and nazwa_p in a: pkt += 1                  # nazwa parametru (bez ogólnych id/x)
            return pkt
        oceny = sorted(((wynik(x), x["id"]) for x in kand), reverse=True)
        return oceny[0][1] if oceny[0][0] > oceny[1][0] else cel

    def referencje_metod(self, klucz, m):
        """Java: referencje metod (this::publishEvents, Klasa::metoda) — CodeGraph ich nie łączy."""
        k = self.p.klasy[klucz]
        if k["jezyk"] != "java": return []
        wynik, po_nazwie = [], None
        for i, l in enumerate(self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]):
            for odb, met in re.findall(r"\b(this|super|[A-Z]\w*)::(\w+)", l):
                if met == "new": continue
                if odb in ("this", "super", k["nazwa"]): cel_kl = [klucz]
                else:
                    po_nazwie = po_nazwie or {x["nazwa"]: kl for kl, x in self.p.klasy.items()}
                    cel_kl = [po_nazwie[odb]] if odb in po_nazwie else []
                for kl in cel_kl:
                    kand = [x for x in self.p.klasy[kl]["metody"] if x["nazwa"] == met and x["id"] != m["id"]]
                    # przeciążenia: Case($(instanceOf(BookOnHold.class)), this::update) → update(BookOnHold …)
                    typy = set(re.findall(r"\b([A-Z]\w*)\.class\b", l))
                    pasujace = [x for x in kand if self._typ_parametru(x) in typy] if len(kand) > 1 and typy else []
                    wynik += [(m["linia"] + i, x["id"]) for x in (pasujace or kand)]
        return wynik

    def nadtypy(self, nazwa):
        """Prosta nazwa typu → ona i wszystkie jej nadtypy z projektu (extends / implements, przechodnio). C# i Python
        mają klasę bazową i interfejsy razem w „bazowe” (C# 12: public class ProfileReader(\\n …\\n) : IProfileReader)."""
        if not hasattr(self, "_nad"):
            self._nad_bezp = defaultdict(set)
            for x in self.p.klasy.values():
                bazowe = x.get("bazowe", "") if x["jezyk"] in ("csharp", "python") else ""
                for n in re.split(r",(?![^<]*>)|\s+", x.get("rozszerza", "") + "," + x.get("implementuje", "") + "," + bazowe):
                    if n.strip(): self._nad_bezp[x["nazwa"]].add(re.sub(r"<.*", "", n.strip()).split(".")[-1])
            self._nad = {}
        if nazwa not in self._nad:
            wynik, kolejka = set(), [nazwa]
            while kolejka:
                n = kolejka.pop()
                if n in wynik: continue
                wynik.add(n); kolejka += list(self._nad_bezp.get(n, ()))
            self._nad[nazwa] = wynik
        return self._nad[nazwa]

    def zdarzenia_spring(self, klucz, m):
        """Spring: publishEvent(zdarzenie) → metody @EventListener / @TransactionalEventListener z mapy, których typ
        parametru to typ zdarzenia albo jego nadtyp (pewne), albo podtyp (zdarzenie zadeklarowane ogólniej, np. DomainEvent
        — możliwe, „zgadniety”). → [(linia, id metody, pewne)]."""
        k = self.p.klasy[klucz]
        if k["jezyk"] != "java" or "publishEvent" not in (m.get("cialo") or ""): return []
        if not hasattr(self, "_sluchacze"):
            self._sluchacze = [(x["id"], self._typ_parametru(x)) for kl, kk in self.p.klasy.items() if kk["jezyk"] == "java"
                               and self.rola.get(kl) in RYSOWANE for x in kk["metody"] if x["adnotacje"] & {"EventListener", "TransactionalEventListener"}]
        linie = self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]
        tekst = "\n".join(linie)
        wynik = []
        for i, l in enumerate(linie):
            for nowy, zm, fabr in re.findall(r"\bpublishEvent\(\s*(?:new\s+(\w+)|(\w+)\s*\)|(?:[\w.]+\.)?(\w+)\s*\()", l):
                if fabr:                                                    # publishEvent(zlozone(z, …)) — typ zwracany fabryki
                    cele = [t for nr, t in self.wyw.get(m["id"], []) if nr == m["linia"] + i and self.p.metody[t][1] == fabr]
                    cele = cele or [x["id"] for x in k["metody"] if x["nazwa"] == fabr]
                    typy = {self.typ_zwracany(t) for t in cele} - {None}
                    typ = typy.pop() if len(typy) == 1 else None
                else: typ = nowy or (re.search(r"\b([A-Z]\w*)(?:<[^>]*>)?\s+" + re.escape(zm) + r"\b", tekst) or [None, None])[1] or self.typy_pol(k["plik"]).get(zm)
                if not typ: continue
                nad = self.nadtypy(typ)
                for id_, t in self._sluchacze:
                    if not t or id_ == m["id"]: continue
                    if t in nad: wynik.append((m["linia"] + i, id_, True))
                    elif typ in self.nadtypy(t): wynik.append((m["linia"] + i, id_, False))
        return wynik

    SYGNALY_ZAPISU = {"pre_save", "post_save"}
    SYGNALY_USUNIECIA = {"pre_delete", "post_delete"}

    def _sygnaly_django(self):
        """Django: odbiorcy sygnałów modeli — post_save.connect(KartyCzytelnikow.po_zapisie_czytelnika, sender=Czytelnik)
        i @receiver(post_save, sender=Czytelnik) nad funkcją. → {(model, „zapis” | „usuniecie”): [id odbiorców]}."""
        if hasattr(self, "_syg"): return self._syg
        self._syg = defaultdict(list)
        po_nazwie = {x["nazwa"]: x for x in self.p.klasy.values() if x["jezyk"] == "python" and x["rodzaj"] != "modul"}
        def odbiorca(plik, wyr):
            kl, _, met = wyr.rpartition(".")
            if kl.split(".")[-1] in po_nazwie:
                return next((x["id"] for x in po_nazwie[kl.split(".")[-1]]["metody"] if x["nazwa"] == met), None)
            return self._funkcja_py(plik, wyr)
        for plik in self._pliki_repo((".py",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "_save" not in tekst and "_delete" not in tekst: continue
            pary = [(s_, h, mod) for s_, h, mod in re.findall(r"\b(pre_save|post_save|pre_delete|post_delete)\.connect\(\s*([\w.]+)\s*,[^)]*?\bsender\s*=\s*(?:\w+\.)*([A-Z]\w*)", tekst, re.S)]
            pary += [(s_, f, mod) for s_, mod, f in re.findall(r"@receiver\(\s*(?:\w+\.)*(pre_save|post_save|pre_delete|post_delete)\s*,[^)]*?\bsender\s*=\s*(?:\w+\.)*([A-Z]\w*)[^)]*\)\s*\n(?:\s*@[^\n]*\n)*\s*def\s+(\w+)", tekst)]
            for s_, h, mod in pary:
                c = odbiorca(plik, h)
                rodzaj = "zapis" if s_ in self.SYGNALY_ZAPISU else "usuniecie"
                if c and c not in self._syg[(mod, rodzaj)]: self._syg[(mod, rodzaj)].append(c)
        return self._syg

    def sygnaly_py(self, klucz, m):
        """(linia, id odbiorcy) sygnałów Django wysyłanych w metodzie: Model.objects.create / get_or_create /
        update_or_create i x.save() na obiekcie modelu → pre_save / post_save; x.delete() / Model.objects…delete() →
        pre_delete / post_delete."""
        syg = self._sygnaly_django()
        if not syg: return []
        k = self.p.klasy[klucz]
        linie = self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]
        tekst = "\n".join(linie)
        zm = {v: e for v, e in re.findall(r"\b(\w+)\s*=\s*([A-Z]\w*)(?:\(|\.objects\b)", tekst) if e in self.encje}
        zm.update({v: e for v, e in re.findall(r"[(,]\s*\*?\s*(\w+)\s*:\s*(?:Optional\[)?([A-Z]\w*)", tekst) if e in self.encje})
        if k["nazwa"] in self.encje: zm["self"] = k["nazwa"]
        wynik = []
        for i, l in enumerate(linie):
            zdarzenia = [(e, "zapis") for e in re.findall(r"\b([A-Z]\w*)\.objects\.(?:create|get_or_create|update_or_create)\(", l)]
            zdarzenia += [(e, "usuniecie") for e in re.findall(r"\b([A-Z]\w*)\.objects\b[^\n]*\.delete\(", l)]
            for v, op in re.findall(r"\b(\w+)\.(save|delete)\(", l):
                e = zm.get(v) or self._modele_py().get(v.lower().replace("_", ""))
                if e: zdarzenia.append((e, "zapis" if op == "save" else "usuniecie"))
            for e, rodzaj in zdarzenia:
                wynik += [(m["linia"] + i, c) for c in syg.get((e, rodzaj), []) if c != m["id"]]
        return wynik

    def _wartosc_ts(self, plik, wyr):
        """Wartość napisowa wyrażenia TS/JS: literał, Klasa.STALA (static readonly STALA = "x") albo stała modułu."""
        wyr = wyr.strip()
        lit = re.fullmatch(r"([\'\"`])([^\'\"`]*)\1", wyr)
        if lit: return lit.group(2)
        kl, _, st = wyr.rpartition(".")
        if kl:
            for x in self._po_nazwie_klas().get(kl.split(".")[-1], ()):
                w_ = re.search(r"\b" + re.escape(st) + r"\s*(?::\s*\w+)?\s*=\s*([\'\"`])([^\'\"`]*)\1", "\n".join(self.p.zrodlo(x["plik"])[x["linia"] - 1:x["koniec"]]))
                if w_: return w_.group(2)
            return None
        w_ = re.search(r"\b(?:const|let|var)\s+" + re.escape(wyr) + r"\s*(?::\s*\w+)?\s*=\s*([\'\"`])([^\'\"`]*)\1", "\n".join(self.p.zrodlo(plik)))
        return w_.group(2) if w_ else None

    def zdarzenia_ts(self, k, m):
        """Nest (@nestjs/event-emitter): this.zdarzenia.emit(X.NAZWA, …) / emitAsync → metody z @OnEvent o tej samej
        nazwie zdarzenia (literał albo stała). → [(linia, id metody słuchacza)]."""
        if "emit" not in (m.get("cialo") or ""): return []
        if not hasattr(self, "_on_event"):
            self._on_event = defaultdict(list)
            for kl, x in self.p.klasy.items():
                if x["jezyk"] not in ("typescript", "javascript") or self.rola.get(kl) not in RYSOWANE: continue
                linie_x = self.p.zrodlo(x["plik"])
                for mt in x["metody"]:
                    nad = " ".join(linie_x[max(0, mt["linia"] - 4):mt["linia"]])
                    o = re.search(r"@OnEvent\(\s*([^,)]+)", nad)
                    w_ = self._wartosc_ts(x["plik"], o.group(1)) if o else None
                    if w_: self._on_event[w_].append(mt["id"])
        if not self._on_event: return []
        wynik = []
        for i, l in enumerate(self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]]):
            for wyr in re.findall(r"\.emit(?:Async)?\(\s*([^,)]+)", l):
                w_ = self._wartosc_ts(k["plik"], wyr)
                wynik += [(m["linia"] + i, c) for c in self._on_event.get(w_, []) if c != m["id"]]
        return wynik

    @staticmethod
    def _typ_parametru(x):
        """Prosta nazwa typu pierwszego parametru metody (Java / C#)."""
        w = re.search(r"\(\s*(?:final\s+)?(?:@\w+\s+)*([\w.]+)(?:<[^>]*>)?\s+\w+\s*[,)]", x.get("sygnatura") or x.get("cialo") or "")
        return w.group(1).split(".")[-1] if w else None

    def _mediatr_handlery(self):
        """C#: typ żądania → handlery (IRequestHandler<T,…> / INotificationHandler<T>). Typ w klasie zagnieżdżonej
        (Create.Command z handlerem Create.Handler) nazywamy z klasą zewnętrzną."""
        if hasattr(self, "_mh"): return self._mh
        self._mh = defaultdict(list)
        for kl, k in self.p.klasy.items():
            if k["jezyk"] != "csharp": continue
            for t in re.findall(r"\bI(?:Request|Notification|Command|Query)Handler\s*<\s*([\w.]+)", k.get("bazowe", "")):
                cz = k["qn"].split("::")
                pelny = ".".join(cz[1:-1] + [t]) if "." not in t and len(cz) > 2 else t
                self._mh[".".join(pelny.split(".")[-2:])].append(kl)       # klucz: Create.Command albo CreateUserCommand
        return self._mh

    def _rejestracje_cs(self):
        """Teksty plików C# z kompozycją (Program.cs, Startup.cs, *Extensions.cs i pozostałe pliki projektu)."""
        return {p: "\n".join(self.p.zrodlo(p)) for p in self._pliki_repo((".cs",)) if re.search(r"PipelineBehavior|AddOpenBehavior|UseMiddleware|AddBehavior|RegisterGenericDecorator", "\n".join(self.p.zrodlo(p)))}

    def potok_cs(self):
        """Mediator / MediatR: zachowania potoku w kolejności rejestracji (PipelineBehaviors = [typeof(X<,>), …],
        AddOpenBehavior(typeof(X<,>)), services.AddScoped(typeof(IPipelineBehavior<,>), typeof(X<,>))) → [id Handle]."""
        if hasattr(self, "_potok"): return self._potok
        nazwy = []
        for tekst in self._rejestracje_cs().values():
            for blok in re.findall(r"PipelineBehaviors\s*=\s*(?:new\s*(?:\w+\s*)?\[\s*\]\s*)?[\[{](.*?)[\]}]\s*;", tekst, re.S):
                nazwy += re.findall(r"typeof\(\s*(\w+)\s*<", blok)
            nazwy += re.findall(r"AddOpenBehavior\(\s*typeof\(\s*(\w+)\s*<", tekst)
            nazwy += re.findall(r"Add(?:Transient|Scoped|Singleton)\(\s*typeof\(\s*IPipelineBehavior\s*<[^>]*>\s*\)\s*,\s*typeof\(\s*(\w+)\s*<", tekst)
            # Autofac: builder.RegisterGeneric(typeof(X<,>)).As(typeof(IPipelineBehavior<,>))
            nazwy += re.findall(r"RegisterGeneric\(\s*typeof\(\s*(\w+)\s*<[^>]*>\s*\)\s*\)\s*\.As\(\s*typeof\(\s*IPipelineBehavior\s*<", tekst)
        self._potok = []
        for n in dict.fromkeys(nazwy):
            k = next((x for x in self.p.klasy.values() if x["jezyk"] == "csharp" and x["nazwa"] == n), None)
            h = next((x["id"] for x in (k or {}).get("metody", []) if x["nazwa"] in ("Handle", "HandleAsync")), None)
            if h: self._potok.append(h)
        return self._potok

    def dekoratory_cs(self):
        """Autofac: builder.RegisterGenericDecorator(typeof(D<>), typeof(ICommandHandler<>)) w kolejności rejestracji
        (pierwszy najbliżej handlera, ostatni na zewnątrz) → [(interfejs, liczba parametrów generycznych, id D.Handle)]."""
        if hasattr(self, "_dek_cs"): return self._dek_cs
        self._dek_cs = []
        for _, tekst in sorted(self._rejestracje_cs().items()):
            for d, inter, arg in re.findall(r"RegisterGenericDecorator\(\s*typeof\(\s*(\w+)\s*<[^>]*>\s*\)\s*,\s*typeof\(\s*(\w+)\s*<([^>]*)>\s*\)", tekst):
                k = next((x for x in self.p.klasy.values() if x["jezyk"] == "csharp" and x["nazwa"] == d), None)
                h = next((x["id"] for x in (k or {}).get("metody", []) if x["nazwa"] in ("Handle", "HandleAsync")), None)
                if h: self._dek_cs.append((inter, arg.count(",") + 1, h))
        return self._dek_cs

    def _dekoratory_handlera(self, handler):
        """Dekoratory Autofac pasujące do klasy handlera (implementuje interfejs o tej liczbie parametrów), od wewnątrz."""
        k = self.p.klasy[self.p.metody[handler][0]]
        wynik = []
        for inter, ile, h in self.dekoratory_cs():
            for args in re.findall(r"\b" + re.escape(inter) + r"\s*<((?:[^<>]|<[^<>]*>)*)>", k.get("bazowe", "")):
                if len(re.split(r",(?![^<]*>)", args)) == ile and h not in wynik: wynik.append(h)
        return wynik

    def przez_potok(self, handler, sciezka, licznik):
        """Handler opakowany zachowaniami potoku: B1.Handle → B2.Handle → handler, każdy w miejscu ostatniego next(…);
        bliżej handlera dekoratory Autofac (Logging → UnitOfWork → handler) w miejscu wywołania _decorated.Handle(…)."""
        wezly = self._wezly(handler, licznik)
        for b in self._dekoratory_handlera(handler):
            if b in sciezka: continue
            kb = self.p.klasy[self.p.metody[b][0]]
            mb = next(x for x in kb["metody"] if x["id"] == b)
            linie = self.p.zrodlo(kb["plik"])[mb["linia"] - 1:mb["koniec"]]
            nr = max([mb["linia"] + i for i, l in enumerate(linie) if re.search(r"\.\s*Handle(?:Async)?\s*\(", l)] or [mb["linia"]])
            d = self.opakowanie(self.wezel(b, sciezka | {b}, licznik, dodatkowe=[(nr, wezly)]))
            wpis = self.mapa["klasy"].get(kb["fqn"]) or {}
            wezly = [d] if self.rola.get(self.p.metody[b][0]) in RYSOWANE and mb["nazwa"] in (wpis.get("metody") or []) else d["dzieci"]
        for b in reversed(self.potok_cs()):
            if b in sciezka: continue
            kb, mb = self.p.klasy[self.p.metody[b][0]], None
            mb = next(x for x in kb["metody"] if x["id"] == b)
            linie = self.p.zrodlo(kb["plik"])[mb["linia"] - 1:mb["koniec"]]
            nr = max([mb["linia"] + i for i, l in enumerate(linie) if re.search(r"\bnext\s*\(", l)] or [mb["linia"]])
            d = self.opakowanie(self.wezel(b, sciezka | {b}, licznik, dodatkowe=[(nr, wezly)]))
            wpis = self.mapa["klasy"].get(kb["fqn"]) or {}
            wezly = [d] if self.rola.get(self.p.metody[b][0]) in RYSOWANE and mb["nazwa"] in (wpis.get("metody") or []) else d["dzieci"]
        return wezly

    @staticmethod
    def opakowanie(d):
        """Zachowanie potoku / dekorator wokół każdego handlera: jego własny dostęp do danych jest warunkowy (dekorator
        UoW czyta InternalCommands tylko dla komend wewnętrznych) — tabele jako możliwe, żeby węzeł bez SQL w przebiegu
        nie wycinał całego handlera pod sobą (hybryda przycina węzły z tabelami bez potwierdzenia)."""
        if d.get("tabele"): d["tabele_mozliwe"] = sorted(set(d.get("tabele_mozliwe", [])) | set(d.pop("tabele")))
        return d

    def middleware_cs(self):
        """ASP.NET Core: app.UseMiddleware<T>() w kolejności → [id T.Invoke / InvokeAsync]."""
        if hasattr(self, "_mw"): return self._mw
        self._mw = []
        for tekst in self._rejestracje_cs().values():
            for n in re.findall(r"UseMiddleware\s*<\s*(\w+)\s*>", tekst):
                k = next((x for x in self.p.klasy.values() if x["jezyk"] == "csharp" and x["nazwa"] == n), None)
                i = next((x["id"] for x in (k or {}).get("metody", []) if x["nazwa"] in ("Invoke", "InvokeAsync")), None)
                if i and i not in self._mw: self._mw.append(i)
        return self._mw

    def mediatr(self, klucz, m, zawezenie=None):
        """Send(new X.Command(…)) / Send(zmienna typu X.Command) / Publish(new XEvent(…)) → Handle handlera tego typu.
        Ta sama nazwa typu w kilku przestrzeniach nazw (Users.Create.Command, Articles.Create.Command): najpierw
        przestrzeń wołającego, potem z jego using. Parametr typu ogólnego (Execute(ICommand command) → Send(command)) —
        typ obiektu z miejsca wywołania (zawezenie: CommandsExecutor.Execute(new ProcessOutboxCommand()))."""
        k = self.p.klasy[klucz]
        if k["jezyk"] != "csharp": return []
        linie = self.p.zrodlo(k["plik"])
        wlasna = k["qn"].split("::")[0]
        uzycia = set(re.findall(r"^\s*using\s+([\w.]+)\s*;", "\n".join(linie), re.M))
        tekst = "\n".join(linie[m["linia"] - 1:m["koniec"]])
        wynik = []
        for w in re.finditer(r"\b(?:Send|Publish|SendAsync|PublishAsync)\s*\(\s*(?:new\s+([\w.]+)\s*[({]|(\w+)\s*[,)])", tekst):
            t = w.group(1)
            if not t and zawezenie and len(zawezenie.get(w.group(2), ())) == 1: t = next(iter(zawezenie[w.group(2)]))
            if not t:                                                   # zmienna: parametr albo lokalna (var x = new T(…))
                d = re.search(r"([\w.]+)\s+" + re.escape(w.group(2)) + r"\s*[,)=]", tekst)
                n = re.search(r"\b" + re.escape(w.group(2)) + r"\s*=\s*new\s+([\w.]+)\s*[({]", tekst)
                t = n.group(1) if n else d.group(1) if d and d.group(1) not in ("var", "return", "await") else None
            if not t: continue
            kand = self._mediatr_handlery().get(".".join(t.split(".")[-2:]), [])
            ns = lambda h: self.p.klasy[h]["qn"].split("::")[0]
            wybor = [h for h in kand if ns(h) == wlasna] or [h for h in kand if ns(h) in uzycia] or kand
            nr = m["linia"] + tekst.count("\n", 0, w.start())
            for h in wybor:
                wynik += [(nr, x["id"]) for x in self.p.klasy[h]["metody"] if x["nazwa"] in ("Handle", "HandleAsync", "Consume")]
        return wynik

    # Django: klasa widoku → ścieżka z urls.py (z prefiksami include)
    def _django_trasy(self):
        """urlpatterns z urls.py przez ast: path/re_path(trasa, Widok.as_view()), include("modul"), include(("modul", "ns")),
        include(([path(…), …], "ns")) z listą w tym samym pliku i include(lista). Prefiksy rekurencyjnie od ROOT_URLCONF
        (inaczej od plików, których nikt nie dołącza). Klucz: pełna nazwa klasy widoku (moduł z importu) i — gdy
        jednoznaczna — sama nazwa."""
        if hasattr(self, "_dj"): return self._dj
        import ast
        self._dj = {}
        urls = {modul_pythona(p): p for p in self._pliki_repo((".py",)) if p.endswith("urls.py")}
        drzewa, importy = {}, {}
        for mod, plik in urls.items():
            try: drzewa[mod] = ast.parse("\n".join(self.p.zrodlo(plik)))
            except (SyntaxError, ValueError): continue
            pakiet = mod.rpartition(".")[0]
            imp = {}
            for w in ast.walk(drzewa[mod]):
                if isinstance(w, ast.ImportFrom):
                    baza = w.module or ""
                    if w.level: baza = ".".join([x for x in pakiet.split(".")[:len(pakiet.split(".")) - (w.level - 1)] if x] + ([baza] if baza else []))
                    for n in w.names: imp[n.asname or n.name] = f"{baza}.{n.name}" if baza else n.name
            importy[mod] = imp
        def listy(w):                                                       # [..] + static(..) + [..] → elementy list
            if isinstance(w, (ast.List, ast.Tuple)): return list(w.elts)
            if isinstance(w, ast.BinOp): return listy(w.left) + listy(w.right)
            return []
        def wzorce(mod):
            wynik = []
            for w in getattr(drzewa.get(mod), "body", []):
                if isinstance(w, (ast.Assign, ast.AugAssign)):
                    cele = w.targets if isinstance(w, ast.Assign) else [w.target]
                    if any(isinstance(c, ast.Name) and c.id == "urlpatterns" for c in cele): wynik += listy(w.value)
            return wynik
        def zmienna(mod, nazwa):
            for w in getattr(drzewa.get(mod), "body", []):
                if isinstance(w, ast.Assign) and any(isinstance(c, ast.Name) and c.id == nazwa for c in w.targets): return listy(w.value)
            return []
        def nazwa_wyr(w):
            return w.id if isinstance(w, ast.Name) else nazwa_wyr(w.value) + "." + w.attr if isinstance(w, ast.Attribute) else None
        dolaczone, trasy = set(), []
        def zbierz(elementy, prefiks, mod, glebokosc=0):
            if glebokosc > 10: return
            for e in elementy:
                if not (isinstance(e, ast.Call) and isinstance(e.func, ast.Name) and e.func.id in ("path", "re_path", "url") and len(e.args) >= 2): continue
                if not (isinstance(e.args[0], ast.Constant) and isinstance(e.args[0].value, str)): continue
                trasa, cel = prefiks + e.args[0].value, e.args[1]
                if isinstance(cel, ast.Call) and isinstance(cel.func, ast.Name) and cel.func.id == "include" and cel.args:
                    a = cel.args[0]
                    if isinstance(a, ast.Tuple) and a.elts: a = a.elts[0]                 # include(("modul", "ns")) / include(([…], "ns"))
                    if isinstance(a, ast.Constant) and isinstance(a.value, str):
                        dolaczone.add(a.value); zbierz(wzorce(a.value), trasa, a.value, glebokosc + 1)
                    elif isinstance(a, (ast.List, ast.BinOp)): zbierz(listy(a), trasa, mod, glebokosc + 1)
                    elif isinstance(a, ast.Name): zbierz(zmienna(mod, a.id), trasa, mod, glebokosc + 1)
                    continue
                if isinstance(cel, ast.Call) and isinstance(cel.func, ast.Attribute) and cel.func.attr == "as_view":
                    widok = nazwa_wyr(cel.func.value)
                    if not widok: continue
                    pierwszy, _, reszta = widok.partition(".")
                    pelna = importy.get(mod, {}).get(pierwszy)
                    pelna = (pelna + ("." + reszta if reszta else "")) if pelna else (f"{mod.rpartition('.')[0]}.{widok}" if "." not in widok else widok)
                    s = "/" + re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", re.sub(r"^\^|\$$", "", trasa)).lstrip("/")
                    trasy.append((pelna, widok.split(".")[-1], s))
        korzen = None
        for plik in self._pliki_repo((".py",)):
            if "settings" in plik:
                m = re.search(r"ROOT_URLCONF\s*=\s*['\"]([\w.]+)", "\n".join(self.p.zrodlo(plik)))
                if m and m.group(1) in drzewa: korzen = m.group(1); break
        if korzen: zbierz(wzorce(korzen), "", korzen)
        for d in drzewa.values():                                           # wszystkie include("modul") — nie korzenie
            for w in ast.walk(d):
                if isinstance(w, ast.Call) and isinstance(w.func, ast.Name) and w.func.id == "include" and w.args:
                    a = w.args[0].elts[0] if isinstance(w.args[0], ast.Tuple) and w.args[0].elts else w.args[0]
                    if isinstance(a, ast.Constant) and isinstance(a.value, str): dolaczone.add(a.value)
        for mod in sorted(drzewa):                                          # bez korzenia albo poza nim: od plików,
            if mod != korzen and mod not in dolaczone: zbierz(wzorce(mod), "", mod)   # których nikt nie dołącza
        ile = defaultdict(set)
        for pelna, krotka, s in trasy: ile[krotka].add(s)
        for pelna, krotka, s in trasy:
            self._dj.setdefault(pelna, s)
            if len(ile[krotka]) == 1: self._dj.setdefault(krotka, s)
        return self._dj

    def _pliki_repo(self, koncowki, pomin=("node_modules", "/.", "venv", "site-packages", "/vendor", "/target", "/bin", "/obj")):
        """Pliki źródłowe repozytorium (ścieżki względne) o podanych końcówkach — też te bez klas w indeksie."""
        if not hasattr(self, "_pliki"): self._pliki = {}
        if koncowki not in self._pliki:
            self._pliki[koncowki] = sorted({os.path.relpath(os.path.join(d, f), self.p.repo) for d, _, fs in os.walk(self.p.repo)
                                            if not any(x in d for x in pomin) for f in fs if f.endswith(koncowki)})
        return self._pliki[koncowki]

    def _prefiksy_py(self):
        """FastAPI / Flask: (moduł, zmienna routera) → pełny prefiks z łańcucha include_router / register_blueprint
        (prefix=… przy dołączeniu i APIRouter(prefix=…) / Blueprint(url_prefix=…) samego routera), z importami
        (from pakiet import modul; from m import router as api_router). Prefiks z ustawień (prefix=settings.api_prefix)
        — wartość domyślna pola o tej nazwie w klasie ustawień (api_prefix: str = "/api")."""
        if hasattr(self, "_pre_py"): return self._pre_py
        import ast
        pliki = {modul_pythona(p): p for p in self._pliki_repo((".py",))}
        wlasne, dolaczenia, pola = {}, [], {}
        def stala(w):
            if isinstance(w, ast.Constant) and isinstance(w.value, str): return w.value
            if isinstance(w, ast.Attribute): return ("pole", w.attr)
            if isinstance(w, ast.JoinedStr): return "".join(x.value for x in w.values if isinstance(x, ast.Constant))
            return ""
        for mod, plik in pliki.items():
            tekst = "\n".join(self.p.zrodlo(plik))
            for a, b in re.findall(r"^\s+(\w+)\s*(?::[^=\n]+)?=\s*[\'\"]([^\'\"]*)[\'\"]", tekst, re.M):
                pola.setdefault(a, b)                                       # pola klas ustawień: api_prefix: str = "/api"
            if not re.search(r"\b(include_router|register_blueprint|APIRouter|Blueprint|FastAPI|Flask)\b", tekst): continue
            try: drzewo = ast.parse(tekst)
            except (SyntaxError, ValueError): continue
            pakiet = mod if plik.endswith("__init__.py") else mod.rpartition(".")[0]
            importy = {}                                                    # nazwa lokalna → pełna nazwa (moduł[.atrybut])
            for w in ast.walk(drzewo):
                if isinstance(w, ast.ImportFrom):
                    baza = w.module or ""
                    if w.level: baza = ".".join([x for x in pakiet.split(".")[:len(pakiet.split(".")) - (w.level - 1)] if x] + ([baza] if baza else []))
                    for n in w.names: importy[n.asname or n.name] = f"{baza}.{n.name}" if baza else n.name
                elif isinstance(w, ast.Import):
                    for n in w.names: importy[n.asname or n.name.split(".")[0]] = n.name if n.asname else n.name.split(".")[0]
            def router(w):                                                 # wyrażenie routera → (moduł, zmienna)
                if isinstance(w, ast.Name):
                    pelna = importy.get(w.id)
                    if pelna and pelna not in pliki and pelna.rpartition(".")[0] in pliki: return tuple(pelna.rsplit(".", 1))
                    return (mod, w.id)
                if isinstance(w, ast.Attribute) and isinstance(w.value, ast.Name):
                    pelna = importy.get(w.value.id, w.value.id)
                    return (pelna, w.attr) if pelna in pliki else None
                return None
            for w in ast.walk(drzewo):
                if isinstance(w, ast.Assign) and isinstance(w.value, ast.Call) and isinstance(w.value.func, (ast.Name, ast.Attribute)):
                    f = w.value.func.id if isinstance(w.value.func, ast.Name) else w.value.func.attr
                    if f in ("APIRouter", "Blueprint", "FastAPI", "Flask"):
                        pre = next((stala(x.value) for x in w.value.keywords if x.arg in ("prefix", "url_prefix")), "")
                        for t in w.targets:
                            if isinstance(t, ast.Name): wlasne[(mod, t.id)] = pre
                if isinstance(w, ast.Call) and isinstance(w.func, ast.Attribute) and w.func.attr in ("include_router", "register_blueprint") \
                        and isinstance(w.func.value, ast.Name) and w.args:
                    cel = router(w.args[0])
                    pre = next((stala(x.value) for x in w.keywords if x.arg in ("prefix", "url_prefix")), "")
                    if cel: dolaczenia.append(((mod, w.func.value.id), cel, pre))
        wartosc = lambda pre: pola.get(pre[1], "") if isinstance(pre, tuple) else pre
        rodzic = {}
        for nad, cel, pre in dolaczenia: rodzic.setdefault(cel, (nad, wartosc(pre)))
        self._pre_py = {}
        def pelny(r, glebokosc=0):
            if r in self._pre_py: return self._pre_py[r]
            wynik = wartosc(wlasne.get(r, ""))
            if r in rodzic and glebokosc < 10: wynik = pelny(rodzic[r][0], glebokosc + 1) + rodzic[r][1] + wynik
            self._pre_py[r] = wynik
            return wynik
        for r in set(wlasne) | set(rodzic): pelny(r)
        return self._pre_py

    # Laravel: routes/*.php — Route::get('/x/{id}', [Kontroler::class, 'metoda']) → (klasa, metoda) → trasa;
    # api.php dostaje prefiks /api, chyba że bootstrap/app.php ustawia apiPrefix
    def _laravel_trasy(self):
        if hasattr(self, "_lv"): return self._lv
        self._lv = {}
        kat = os.path.join(self.p.repo, "routes")
        if not os.path.isdir(kat): return self._lv
        boot = os.path.join(self.p.repo, "bootstrap", "app.php")
        pre_api = "/api"
        if os.path.exists(boot):
            m = re.search(r"apiPrefix\s*:\s*['\"]([^'\"]*)", czytaj(boot))
            if m: pre_api = "/" + m.group(1).strip("/") if m.group(1).strip("/") else ""
        for f in sorted(os.listdir(kat)):
            if not f.endswith(".php"): continue
            tekst = czytaj(os.path.join(kat, f))
            pre = pre_api if f == "api.php" else ""
            for metoda, sciezka, kl, met in re.findall(r"Route::(get|post|put|patch|delete|any|options)\(\s*['\"]([^'\"]*)['\"]\s*,\s*\[\s*\\?(?:[\w\\]+\\)?(\w+)::class\s*,\s*['\"](\w+)['\"]\s*\]", tekst):
                s = (pre + "/" + sciezka.strip("/")).rstrip("/") or "/"
                self._lv[(kl, met)] = {"metoda": "" if metoda == "any" else metoda.upper(), "sciezka": re.sub(r"\{(\w+)\?\}", r"{\1}", s)}
        return self._lv

    def _symfony_trasy(self):
        """Symfony: trasy z config/routes*/*.yaml (także apps/*/config/routes): nazwa: {path, controller: FQN[::metoda],
        methods: [..]} → (FQN klasy z kropkami, metoda | __invoke) → trasa; prefix: z bloku importu (resource + prefix)
        dla plików w katalogu zasobu."""
        if hasattr(self, "_sf"): return self._sf
        self._sf = {}
        pliki = [p for p in self._pliki_repo((".yaml", ".yml")) if re.search(r"(^|/)config/routes?(/|\.ya?ml$|_)", p)]
        prefiksy = {}
        for plik in pliki:
            for blok in re.split(r"\n(?=\S)", "\n".join(self.p.zrodlo(plik))):
                res = re.search(r"^\s+resource:\s*['\"]?([^'\"\s#]+)", blok, re.M)
                pre = re.search(r"^\s+prefix:\s*['\"]?([^'\"\s#]+)", blok, re.M)
                if res and pre: prefiksy[os.path.normpath(os.path.join(os.path.dirname(plik), res.group(1).replace("%kernel.project_dir%", ".")))] = pre.group(1)
        for plik in pliki:
            pre = next((v for k_, v in prefiksy.items() if os.path.normpath(plik).startswith(k_.rstrip("*").rstrip("/"))), "")
            for blok in re.split(r"\n(?=\S)", "\n".join(self.p.zrodlo(plik))):
                sc = re.search(r"^\s+path:\s*['\"]?([^'\"\s#]+)", blok, re.M)
                ko = re.search(r"^\s+controller:\s*['\"]?([\w\\]+)(?:::(\w+))?", blok, re.M)
                if not sc or not ko: continue
                me = re.search(r"^\s+methods:\s*\[?\s*['\"]?(\w+)", blok, re.M)
                self._sf[(ko.group(1).replace("\\", "."), ko.group(2) or "__invoke")] = {"metoda": me.group(1).upper() if me else "", "sciezka": zloz_sciezke(pre, sc.group(1))}
        return self._sf

    def _php_trasy_kodu(self):
        """PHP bez frameworka tras (Kanboard): ->addRoute('board/:project_id', 'BoardViewController', 'show') — dowolna
        metoda HTTP, :x → {x}, kontroler po prostej nazwie (najpierw z przestrzeni nazw *Controller*); JSON-RPC:
        ->withObject(new TaskProcedure(…)) — publiczne metody procedury na POST pliku punktu wejścia (jsonrpc.php)
        z nazwą metody jako zdarzeniem. → {(FQN, metoda): trasa}."""
        if hasattr(self, "_php_tk"): return self._php_tk
        self._php_tk = {}
        php = [k for k in self.p.klasy.values() if k["jezyk"] == "php" and k["rodzaj"] != "interface"]
        if not php: return self._php_tk
        def klasa(n):
            kand = [k for k in php if k["nazwa"] == n]
            return next((k for k in kand if "Controller" in k["pakiet"] or "Procedure" in k["pakiet"] or "Api" in k["pakiet"]), kand[0] if kand else None)
        # plik punktu wejścia RPC: nie szablon ani konfiguracja (app/Template/config/api.php), najpierw ten, który
        # uruchamia serwer (->withObject, new Server, ->execute(), provider API), potem płytszy
        kand = [p_ for p_ in self._pliki_repo((".php",)) if re.fullmatch(r"(?:[\w/]*/)?(?:jsonrpc|api|rpc)\.php", p_)
                and not re.search(r"(?:^|/)(?:[Tt]emplates?|views?|config|tests?|lang|locale)/", p_)]
        uruchamia = lambda p_: bool(re.search(r"->withObject\(|\bnew\s+\\?(?:[\w\\]+\\)?Server\b|->execute\(|ApiProvider|JsonRPC", "\n".join(self.p.zrodlo(p_))))
        rpc = min(kand, key=lambda p_: (not uruchamia(p_), p_.count("/"), p_)) if kand else None
        for plik in self._pliki_repo((".php",)):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "addRoute" not in tekst and "withObject" not in tekst: continue
            for sc, kl, met in re.findall(r"->addRoute\(\s*['\"]([^'\"]*)['\"]\s*,\s*['\"](\w+)['\"]\s*,\s*['\"](\w+)['\"]", tekst):
                k = klasa(kl)
                if k: self._php_tk.setdefault((k["fqn"], met), {"metoda": "", "sciezka": zloz_sciezke(re.sub(r":(\w+)", r"{\1}", sc))})
            for kl in re.findall(r"->withObject\(\s*new\s+\\?(?:[\w\\]+\\)?(\w+)\s*\(", tekst) if rpc else []:
                k = klasa(kl)
                for m in (k or {}).get("metody", []):
                    if m["widocznosc"] in ("public", "") and not m["nazwa"].startswith("__"):
                        self._php_tk.setdefault((k["fqn"], m["nazwa"]), {"metoda": "POST", "sciezka": "/" + os.path.basename(rpc), "zdarzenie": m["nazwa"]})
        return self._php_tk

    def _symfony_atrybut(self, k, m):
        """Symfony: #[Route('/x/{id}', methods: ['GET'])] / @Route("/x", methods={"GET"}) nad metodą (__invoke: nad klasą),
        prefiks z #[Route] klasy."""
        linie = self.p.zrodlo(k["plik"])
        wzor = r"(?:#\[\s*Route|@Route)\s*\(\s*(?:path\s*[:=]\s*)?['\"]([^'\"]*)['\"]([^\]\n]*)"
        nad_m = " ".join(linie[max(0, m["linia"] - 6):m["linia"]])
        nad_m = nad_m[max(nad_m.rfind("}"), nad_m.rfind(";")) + 1:]
        nad_k = " ".join(linie[max(0, k["linia"] - 8):k["linia"] + 1])
        mm = re.search(wzor, nad_m)
        mk = re.search(wzor, nad_k)
        if not mm and not (mk and m["nazwa"] == "__invoke"): return None
        sciezka = zloz_sciezke(mk.group(1) if mk and mm else "", (mm or mk).group(1))
        me = re.search(r"methods\s*[:=]\s*[\[{]\s*['\"](\w+)", (mm or mk).group(2))
        return {"metoda": me.group(1).upper() if me else "", "sciezka": sciezka}

    def _express_trasy(self):
        """Express / Koa: (nazwa klasy, metoda) → trasa dla handlerów-metod klas (kontroler.metoda, Klasa.metoda statyczna,
        przez import i reeksport). Trasy z handlerem inline i z funkcją modułu — w _js_trasy()[1]."""
        if hasattr(self, "_ex"): return self._ex
        self._ex = {}
        for plik in sorted({k["plik"] for k in self.p.klasy.values()} | {os.path.relpath(os.path.join(d, f), self.p.repo) for d, _, fs in os.walk(self.p.repo)
                     if "node_modules" not in d and "/." not in d for f in fs if f.endswith((".js", ".ts", ".mjs")) and f.split(".")[0] in ("app", "routes", "router", "serwer", "server", "index", "trasy")}):
            tekst = "\n".join(self.p.zrodlo(plik))
            if "new " not in tekst: continue
            zmienne = dict(EXPRESS_NEW.findall(tekst))
            for metoda, sciezka, zm, met in EXPRESS_TRASA.findall(tekst):
                if zm in zmienne:
                    self._ex[(zmienne[zm], met)] = {"metoda": metoda.upper(), "sciezka": re.sub(r":(\w+)", r"{\1}", sciezka)}
        for (rodzaj, cel), http in self._js_trasy()[0].items():
            if rodzaj == "klasa": self._ex.setdefault(cel, http)
        return self._ex

    def _express_lancuchy(self):
        """Express: łańcuch handlerów trasy, a nie tylko ostatni — app.get('/konto', ident.wymagajCzytelnika.bind(ident),
        konto.moje.bind(konto)): middleware wykonuje się przed handlerem (i może go nie wywołać, gdy nie zawoła next()).
        app.use(x.m.bind(x)) z handlerem o 4 parametrach (err, req, res, next) to obsługa błędów — po handlerze, tylko przy
        błędzie; app.use(h) z handlerem projektu o mniejszej liczbie parametrów — przed trasami zarejestrowanymi niżej.
        → {(nazwa klasy, metoda) | ("funkcja", id): {"przed": [id metod], "bledy": [id metod]}}."""
        if hasattr(self, "_ex_l"): return self._ex_l
        self._ex_l = {}
        po_nazwie = {k["nazwa"]: kl for kl, k in self.p.klasy.items() if k["jezyk"] in ("typescript", "javascript") and k["rodzaj"] != "modul"}
        def parametry(c):
            x = next(x for x in self.p.klasy[self.p.metody[c][0]]["metody"] if x["id"] == c)
            w_ = re.search(r"\(([^()]*)\)", x.get("cialo") or "")
            return len([a for a in w_.group(1).split(",") if a.strip()]) if w_ else 0
        for plik in self._pliki_ts() + [p_ for p_ in self._pliki_repo((".mjs", ".cjs")) if "node_modules" not in p_]:
            tekst = "\n".join(self.p.zrodlo(plik))
            if not re.search(r"\.(?:get|post|put|delete|patch|all|use)\s*\(", tekst): continue
            zmienne = dict(EXPRESS_NEW.findall(tekst))
            def handler(a):
                h = re.sub(r"\.bind\([^)]*\)$", "", a.strip())
                hm = re.fullmatch(r"(\w+)\.(\w+)", h)
                if hm:
                    kl = po_nazwie.get(zmienne.get(hm.group(1), ""))
                    if not kl:
                        r = self._js_lokalna(plik, hm.group(1))
                        kl = r[1] if r and r[0] == "klasa" else None
                    c = next((x["id"] for x in self.p.klasy[kl]["metody"] if x["nazwa"] == hm.group(2)), None) if kl else None
                    return ((self.p.klasy[kl]["nazwa"], hm.group(2)), c) if c else None
                if re.fullmatch(r"\w+", h):
                    r = self._js_lokalna(plik, h)
                    return (("funkcja", r[1]), r[1]) if r and r[0] == "funkcja" else None
                return None
            przed_wsz, bledy, trasy = [], [], []
            for w_ in re.finditer(r"(?<![.\w])(\w+)\s*\.\s*(get|post|put|delete|patch|all|use)\s*\(", tekst):
                odb = w_.group(1)
                r = self._js_lokalna(plik, odb)
                if not (r and r[0] == "router") and not re.fullmatch(r"app|router|\w*[rR]outer|api|server", odb): continue
                args, _ = self._argumenty(tekst, w_.end())
                if args and re.fullmatch(r"([\'\"`]).*\1", args[0], re.S): args = args[1:]
                hs = [handler(a) for a in args]
                if w_.group(2) == "use":
                    for h in hs:
                        if not h: continue
                        (bledy if parametry(h[1]) >= 4 else przed_wsz).append(h[1])
                    continue
                if not hs or not hs[-1]: continue
                trasy.append((hs[-1][0], list(przed_wsz) + [h[1] for h in hs[:-1] if h]))
            for klucz, przed in trasy:
                self._ex_l.setdefault(klucz, {"przed": przed, "bledy": list(bledy)})
        return self._ex_l

    # ---------------------------------------------------------------- Express / Koa: trasy przez importy
    def _js_plik(self, z_pliku, spec):
        """Import względny ('./auth.service', '../controller') → plik w repozytorium albo None (pakiet z node_modules)."""
        if not spec.startswith("."): return None
        baza = os.path.normpath(os.path.join(os.path.dirname(z_pliku), spec))
        for kand in (baza, *(baza + e for e in (".ts", ".js", ".mjs", ".cjs", ".tsx")), *(os.path.join(baza, "index" + e) for e in (".ts", ".js", ".mjs"))):
            if os.path.isfile(os.path.join(self.p.repo, kand)): return kand
        return None

    def _js_importy(self, plik):
        """nazwa lokalna → (plik źródłowy, nazwa eksportu | 'default' | '*')."""
        if not hasattr(self, "_jsi"): self._jsi = {}
        if plik in self._jsi: return self._jsi[plik]
        tekst, w = "\n".join(self.p.zrodlo(plik)), {}
        for dom, naz, ns, spec in re.findall(r"\bimport\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s*['\"]([^'\"]+)['\"]", tekst):
            cel = self._js_plik(plik, spec)
            if not cel: continue
            if dom: w[dom] = (cel, "default")
            if ns: w[ns] = (cel, "*")
            for cz in (naz or "").split(","):
                cz = cz.strip().split(" as ")
                if cz[0].strip(): w[cz[-1].strip()] = (cel, cz[0].strip())
        for nazwa, naz, spec in re.findall(r"\b(?:const|let|var)\s+(?:(\w+)|\{([^}]*)\})\s*=\s*require\(\s*['\"]([^'\"]+)['\"]\s*\)", tekst):
            cel = self._js_plik(plik, spec)
            if not cel: continue
            if nazwa: w[nazwa] = (cel, "*")
            for cz in (naz or "").split(","):
                cz = cz.strip().split(":")
                if cz[0].strip(): w[cz[-1].strip()] = (cel, cz[0].strip())
        self._jsi[plik] = w
        return w

    def _js_lokalna(self, plik, nazwa, glebokosc=0):
        """Nazwa w pliku → ('klasa', klucz) | ('router', (plik, nazwa)) | ('funkcja', id metody) | ('modul', plik) | None."""
        if glebokosc > 8: return None
        tekst = "\n".join(self.p.zrodlo(plik))
        kl = next((kk for kk, k in self.p.klasy.items() if k["plik"] == plik and k["nazwa"] == nazwa and k["rodzaj"] != "modul"), None)
        if kl: return ("klasa", kl)
        if re.search(r"\b(?:const|let|var)\s+" + re.escape(nazwa) + r"\s*(?::[^=]+)?=\s*(?:(?:express|koa)\.)?(?:Router\(|express\(|new\s+(?:\w*Router|Koa)\b)", tekst):
            return ("router", (plik, nazwa))
        nowy = re.search(r"\b(?:const|let|var)\s+" + re.escape(nazwa) + r"\s*(?::[^=]+)?=\s*new\s+(\w+)\s*\(", tekst)
        if nowy:
            r = self._js_lokalna(plik, nowy.group(1), glebokosc + 1)
            return r if r and r[0] == "klasa" else None
        mod = next((k for k in self.p.klasy.values() if k["plik"] == plik and k["rodzaj"] == "modul"), None)
        f = next((x["id"] for x in (mod or {}).get("metody", []) if x["nazwa"] == nazwa), None)
        if f: return ("funkcja", f)
        imp = self._js_importy(plik).get(nazwa)
        if imp: return ("modul", imp[0]) if imp[1] == "*" else self._js_eksport(imp[0], imp[1], glebokosc + 1)
        return None

    def _js_eksport(self, plik, nazwa, glebokosc=0):
        if glebokosc > 8: return None
        tekst = "\n".join(self.p.zrodlo(plik))
        if nazwa == "default":
            m = re.search(r"\bexport\s+default\s+(?:abstract\s+)?class\s+(\w+)", tekst) or re.search(r"\bexport\s+default\s+(\w+)\s*;?\s*$", tekst, re.M) \
                or re.search(r"\bmodule\.exports\s*=\s*(\w+)\s*;?\s*$", tekst, re.M)
            if m: return self._js_lokalna(plik, m.group(1), glebokosc + 1)
            if re.search(r"\bexport\s+default\s+(?:(?:express|koa)\.)?(?:Router\(|new\s+\w*Router\b)", tekst): return ("router", (plik, "default"))
            return None
        for org, spec in re.findall(r"\bexport\s*\{[^}]*?\b(\w+)\s+as\s+" + re.escape(nazwa) + r"\b[^}]*\}\s*from\s*['\"]([^'\"]+)['\"]", tekst):
            cel = self._js_plik(plik, spec)
            if cel: return self._js_eksport(cel, org, glebokosc + 1)
        for spec in re.findall(r"\bexport\s*\{[^}]*?\b" + re.escape(nazwa) + r"\b(?!\s+as)[^}]*\}\s*from\s*['\"]([^'\"]+)['\"]", tekst):
            cel = self._js_plik(plik, spec)
            if cel: return self._js_eksport(cel, nazwa, glebokosc + 1)
        lok = self._js_lokalna(plik, nazwa, glebokosc + 1)
        if lok: return lok
        for spec in re.findall(r"\bexport\s*\*\s*from\s*['\"]([^'\"]+)['\"]", tekst):
            cel = self._js_plik(plik, spec)
            r = cel and self._js_eksport(cel, nazwa, glebokosc + 1)
            if r: return r
        return None

    @staticmethod
    def _argumenty(tekst, od):
        """Argumenty wywołania od pozycji za „(” do zamykającego „)” (z nawiasami i napisami) → (lista tekstów, koniec)."""
        args, arg, glebia, i, napis = [], "", 1, od, None
        while i < len(tekst) and glebia:
            c = tekst[i]; i += 1
            if napis:
                arg += c
                if c == napis and tekst[i - 2] != "\\": napis = None
                continue
            if c in "'\"`": napis = c
            elif c in "([{": glebia += 1
            elif c in ")]}": glebia -= 1
            if glebia == 1 and c == ",": args.append(arg); arg = ""; continue
            if glebia: arg += c
        if arg.strip(): args.append(arg)
        return [a.strip() for a in args], i

    def _js_trasy(self):
        """Express / Koa (bez klas-kontrolerów z mapy też): router.get('/x', [middleware…,] handler) w dowolnym pliku
        .ts/.js, handler przez importy i reeksporty (user.getUser → export { default as user } → class UserController),
        funkcja modułu albo funkcja inline (drzewo z wywołań funkcji importowanych z modułów mapy). Prefiksy montowania:
        .use('/api', api), Router({ prefix }), także w łańcuchu Router().use(…).use(…).
        → ({('klasa', (nazwa, metoda)) | ('funkcja', id): http}, [wejścia inline: {klasa, metoda, http, wywolania}])."""
        if hasattr(self, "_jst"): return self._jst
        trasy, inline, montaz, wlasne = {}, [], [], {}
        pliki = [p for p in self._pliki_repo((".ts", ".js", ".mjs", ".cjs"), ("node_modules", "/.", "/dist", "/build", "/coverage", "/public", "/static"))
                 if not re.search(r"\.(test|spec|d)\.[jt]s$|(^|/)(test|tests|e2e|__tests__)/", p)]
        surowe = []
        for plik in pliki:
            tekst = "\n".join(self.p.zrodlo(plik))
            if not re.search(r"\.(?:get|post|put|delete|patch|all|use)\s*\(", tekst): continue
            for m in re.finditer(r"\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*new\s+\w*Router\s*\(\s*\{[^}]*\bprefix\s*:\s*['\"`]([^'\"`]*)", tekst):
                wlasne[(plik, m.group(1))] = m.group(2)
            # montaż: X.use('/p', y) i łańcuch const api = Router().use('/', a).use(…); export default Router().use('/api', api)
            for m in re.finditer(r"(?:\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*|\bexport\s+default\s+)(?:(?:express|koa)\.)?(?:Router\(\)|new\s+\w*Router\([^)]*\))((?:\s*\.use\((?:[^()]|\([^()]*\))*\))+)", tekst):
                rodzic = (plik, m.group(1) or "default")
                for pre, dz in re.findall(r"\.use\(\s*(?:['\"`]([^'\"`]*)['\"`]\s*,\s*)?(\w+)", m.group(2)): montaz.append((rodzic, plik, dz, pre))
            for m in re.finditer(r"(?<![.\w])(\w+)\s*\.\s*use\(\s*(?:['\"`]([^'\"`]*)['\"`]\s*,\s*)?(\w+)(?:\.routes\(\))?\s*[,)]", tekst):
                montaz.append(((plik, m.group(1)), plik, m.group(3), m.group(2) or ""))
            for m in re.finditer(r"(?<![.\w])(\w+)\s*\.\s*(get|post|put|delete|patch|all)\s*\(\s*(['\"`])([^'\"`]+)\3\s*,", tekst):
                odb = m.group(1)
                r = self._js_lokalna(plik, odb)
                if not (r and r[0] == "router") and not re.fullmatch(r"app|router|\w*[rR]outer|api|server", odb): continue
                args, _ = self._argumenty(tekst, m.end())
                if not args: continue
                surowe.append((plik, odb, m.group(2), m.group(4), args[-1]))
        rodzic = {}
        for nad, plik, dz, pre in montaz:
            r = self._js_lokalna(plik, dz)
            if r and r[0] == "router" and r[1] != nad: rodzic.setdefault(r[1], (nad, pre))
        pre_cache = {}
        def prefiks(r, g=0):
            if r in pre_cache: return pre_cache[r]
            w = wlasne.get(r, "")
            if r in rodzic and g < 10: w = zloz_sciezke(prefiks(rodzic[r][0], g + 1), rodzic[r][1], w)
            pre_cache[r] = w
            return w
        for plik, odb, metoda, sciezka, handler in surowe:
            r = self._js_lokalna(plik, odb)
            pelna = zloz_sciezke(prefiks(r[1] if r and r[0] == "router" else (plik, odb)), sciezka)
            http = {"metoda": "" if metoda == "all" else metoda.upper(), "sciezka": re.sub(r":(\w+)", r"{\1}", pelna)}
            h = re.sub(r"\.bind\([^)]*\)$", "", handler.strip())
            hm = re.fullmatch(r"(\w+)\.(\w+)", h)
            if hm:
                cel = self._js_lokalna(plik, hm.group(1))
                if cel and cel[0] == "klasa": trasy.setdefault(("klasa", (self.p.klasy[cel[1]]["nazwa"], hm.group(2))), http); continue
                if cel and cel[0] == "modul":
                    mod = next((k for k in self.p.klasy.values() if k["plik"] == cel[1] and k["rodzaj"] == "modul"), None)
                    f = next((x["id"] for x in (mod or {}).get("metody", []) if x["nazwa"] == hm.group(2)), None)
                    if f: trasy.setdefault(("funkcja", f), http)
                continue
            if re.fullmatch(r"\w+", h):
                cel = self._js_lokalna(plik, h)
                if cel and cel[0] == "funkcja": trasy.setdefault(("funkcja", cel[1]), http)
                continue
            if re.match(r"(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>|(?:async\s+)?function\b", h):    # handler inline
                wyw = []
                for o, n in re.findall(r"(?<![.\w])(?:(\w+)\s*\.\s*)?(\w+)\s*\(", h):
                    cel = self._js_lokalna(plik, o) if o else self._js_lokalna(plik, n)
                    if not cel: continue
                    if not o and cel[0] == "funkcja": wyw.append(cel[1])
                    elif o and cel[0] == "klasa": wyw += [x["id"] for x in self.p.klasy[cel[1]]["metody"] if x["nazwa"] == n]
                    elif o and cel[0] == "modul":
                        mod = next((k for k in self.p.klasy.values() if k["plik"] == cel[1] and k["rodzaj"] == "modul"), None)
                        wyw += [x["id"] for x in (mod or {}).get("metody", []) if x["nazwa"] == n]
                inline.append({"plik": plik, "http": http, "wywolania": list(dict.fromkeys(wyw))})
        self._jst = (trasy, inline)
        return self._jst

    def stripes(self, k, m):
        """Stripes: zdarzenie ActionBeana = metoda zwracająca Resolution; ścieżka z @UrlBinding albo z konwencji
        NameBasedActionResolver (/actions/Catalog.action dla web.actions.CatalogActionBean); zdarzenie w parametrze."""
        if not re.search(r"Resolution\s+" + re.escape(m["nazwa"]) + r"\s*\(", m.get("cialo") or ""): return None
        nad = " ".join(self.p.zrodlo(k["plik"])[max(0, k["linia"] - 6):k["linia"] + 1])
        u = re.search(r'@UrlBinding\s*\(\s*"([^"]+)"', nad)
        sciezka = u.group(1) if u else "/" + "/".join(
            [x for x in k["pakiet"].split(".")[k["pakiet"].split(".").index("web") + 1:] if "web" in k["pakiet"].split(".")] or ["actions"]) \
            + "/" + re.sub(r"(ActionBean|Action|Bean)$", "", k["nazwa"]) + ".action"
        return {"metoda": "", "sciezka": sciezka, "zdarzenie": m["nazwa"]}

    def _prefiks_aspnet(self):
        """ASP.NET Core: globalny prefiks tras z konwencji IApplicationModelConvention (opt.Conventions.Add(new X("api")),
        argument z konfiguracji z wartością domyślną: Configuration["ApiPrefix"] ?? "api" — najpierw appsettings.json)."""
        if hasattr(self, "_pre_cs"): return self._pre_cs
        self._pre_cs = ""
        konw = {k["nazwa"]: k for k in self.p.klasy.values() if k["jezyk"] == "csharp" and "IApplicationModelConvention" in k.get("bazowe", "")}
        if not konw: return ""
        ustawienia = {}
        for d, _, fs in os.walk(self.p.repo):
            if "/." in d or "/bin" in d or "/obj" in d: continue
            for f in fs:
                if re.fullmatch(r"appsettings(\.\w+)?\.json", f):
                    try: ustawienia.update({a: b for a, b in re.findall(r'"(\w+)"\s*:\s*"([^"]*)"', czytaj(os.path.join(d, f)))})
                    except OSError: pass
        for plik in sorted({k["plik"] for k in self.p.klasy.values() if k["jezyk"] == "csharp"} | {os.path.relpath(os.path.join(d, f), self.p.repo)
                     for d, _, fs in os.walk(self.p.repo) if "/." not in d and "/bin" not in d and "/obj" not in d for f in fs if f in ("Program.cs", "Startup.cs")}):
            tekst = "\n".join(self.p.zrodlo(plik))
            for nazwa, args in re.findall(r"Conventions\.Add\(\s*new\s+(\w+)\s*\(((?:[^()]|\([^()]*\))*)\)", tekst):
                if nazwa not in konw: continue
                kl = re.search(r'\[\s*"(\w+)"\s*\]', args)
                lit = re.findall(r'"([^"]*)"', args)
                w = ustawienia.get(kl.group(1)) if kl else None
                w = w if w is not None else (lit[-1] if lit else None)
                if w is None:                                               # literał w samej konwencji: new RouteAttribute("api")
                    k = konw[nazwa]
                    r = re.search(r'RouteAttribute\(\s*"([^"]*)"', "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]]))
                    w = r.group(1) if r else ""
                self._pre_cs = "/" + w.strip("/") if w.strip("/") else ""
        return self._pre_cs

    def _pliki_ts(self):
        return [p_ for p_ in self._pliki_repo((".ts", ".js"), ("node_modules", "/.", "/dist", "/build", "/coverage"))
                if not re.search(r"\.(test|spec|d)\.[jt]s$|(^|/)(test|tests|e2e|__tests__)/", p_)]

    @staticmethod
    def _nest_wpisy(tekst):
        """Argumenty forRoutes / exclude Nesta → [(ścieżka | None, metoda | "", kontroler | None)]:
        'cats', { path: 'cats/:id', method: RequestMethod.GET }, CatsController."""
        wynik = []
        for a in Statyczne._argumenty(tekst + ")", 0)[0] if tekst else []:
            a = a.strip()
            n = re.match(r"['\"`]([^'\"`]*)['\"`]$", a)
            if n: wynik.append((n.group(1), "", None)); continue
            o = re.match(r"\{(.*)\}$", a, re.S)
            if o:
                p_ = re.search(r"\bpath\s*:\s*['\"`]([^'\"`]*)", o.group(1))
                me = re.search(r"\bmethod\s*:\s*(?:RequestMethod\.)?(\w+)", o.group(1))
                wynik.append((p_.group(1) if p_ else "", "" if not me or me.group(1).upper() == "ALL" else me.group(1).upper(), None)); continue
            if re.fullmatch(r"[A-Z]\w*", a): wynik.append((None, "", a))
        return wynik

    @staticmethod
    def _nest_trasa_pasuje(wpis, sciezka, metoda, kontroler=None):
        """Wpis forRoutes / exclude (ścieżka z :param i *, metoda) a trasa wejścia bez globalnego prefiksu."""
        sc, me, kl = wpis
        if kl is not None: return kl == kontroler
        if me and metoda and me != metoda: return False
        wzor = "/".join("[^/]+" if c.startswith((":", "{")) else ".*" if c in ("*", "(.*)") else re.escape(c).replace(r"\*", ".*")
                        for c in sc.strip("/").split("/"))
        return bool(re.fullmatch(wzor, re.sub(r"\{\w+\}|:\w+", "x", sciezka.strip("/"))))

    def _nest_prefiks(self):
        """Nest: app.setGlobalPrefix('api', { exclude: [...] }) w pliku startowym → (prefiks, wyjątki jak w forRoutes)."""
        if hasattr(self, "_nest_pre"): return self._nest_pre
        self._nest_pre = ("", [])
        for p_ in self._pliki_ts():
            tekst = "\n".join(self.p.zrodlo(p_))
            g = re.search(r"\.setGlobalPrefix\(\s*['\"`]([^'\"`]*)['\"`]", tekst)
            if not g: continue
            args, _ = self._argumenty(tekst, tekst.index("(", g.start()) + 1)
            ex = re.search(r"\bexclude\s*:\s*\[", args[1]) if len(args) > 1 else None
            wyjatki = self._nest_wpisy(",".join(self._argumenty(args[1], ex.end())[0])) if ex else []
            self._nest_pre = (g.group(1).strip("/"), wyjatki)
            break
        return self._nest_pre

    def _nest_middleware(self):
        """Nest: configure(consumer) w modułach — consumer.apply(A, B).exclude(…).forRoutes(…) → [(id metod use, wpisy,
        wyjątki)] w kolejności kodu."""
        if hasattr(self, "_nest_mw"): return self._nest_mw
        self._nest_mw = []
        po_nazwie = {k["nazwa"]: k for k in self.p.klasy.values() if k["jezyk"] in ("typescript", "javascript")}
        for p_ in self._pliki_ts():
            tekst = "\n".join(self.p.zrodlo(p_))
            if "forRoutes" not in tekst: continue
            for a in re.finditer(r"\.apply\(", tekst):
                klasy, kon = self._argumenty(tekst, a.end())
                reszta = tekst[kon:kon + 3000]
                fr = re.match(r"(?:\s*\.exclude\((?:[^()]|\([^()]*\))*\))?\s*\.forRoutes\(", reszta)
                if not fr: continue
                wpisy = self._nest_wpisy(",".join(self._argumenty(reszta, fr.end())[0]))
                ex = re.match(r"\s*\.exclude\(", reszta)
                wyjatki = self._nest_wpisy(",".join(self._argumenty(reszta, ex.end())[0])) if ex else []
                use = [x["id"] for n in klasy if n.strip() in po_nazwie for x in po_nazwie[n.strip()]["metody"] if x["nazwa"] == "use"]
                if use: self._nest_mw.append((use, wpisy, wyjatki))
        return self._nest_mw

    def _nest_middleware_dla(self, k, http):
        """Metody use middleware Nesta podpiętego do trasy wejścia (ścieżka bez globalnego prefiksu, metoda HTTP)."""
        if not http or not self._nest_middleware(): return []
        pre = self._nest_prefiks()[0]
        s = http["sciezka"]
        if pre and (s + "/").startswith("/" + pre + "/"): s = s[len(pre) + 1:] or "/"
        wynik = []
        for use, wpisy, wyjatki in self._nest_middleware():
            if any(self._nest_trasa_pasuje(w, s, http["metoda"], k["nazwa"]) for w in wpisy) and \
                    not any(self._nest_trasa_pasuje(w, s, http["metoda"], k["nazwa"]) for w in wyjatki):
                wynik += [u for u in use if u not in wynik]
        return wynik

    def _http_innych(self, k, m):
        """Wejście HTTP poza Springiem: Nest (dekoratory) i Django (urls.py + nazwa metody)."""
        linie = self.p.zrodlo(k["plik"])
        if k["plik"].endswith((".ts", ".js")):
            mk = NEST_KLASA.search(" ".join(linie[max(0, k["linia"] - 4):k["linia"] + 1]))
            mm = NEST_METODA.search(" ".join(linie[max(0, m["linia"] - 4):m["linia"]]))
            if mm:
                baza = (mk.group(1) or mk.group(2) or "") if mk else ""
                s = "/" + "/".join(x.strip("/") for x in (baza, mm.group(2) or "") if x and x.strip("/"))
                metoda = "" if mm.group(1) == "All" else mm.group(1).upper()
                pre, wyjatki = self._nest_prefiks()
                if pre and not any(self._nest_trasa_pasuje(w, s, metoda) for w in wyjatki): s = zloz_sciezke(pre, s)
                return {"metoda": metoda, "sciezka": re.sub(r":(\w+)", r"{\1}", s)}
        if k["plik"].endswith((".js", ".ts", ".mjs")):
            tr = self._express_trasy().get((k["nazwa"], m["nazwa"]))
            if tr: return tr
            # koa-swagger-decorator: @request("get", "/users/{id}") nad metodą, @prefix("/api") nad klasą
            okno = linie[max(0, m["linia"] - 8):m["linia"] + 6]               # od końca poprzedniej składowej do deklaracji
            dekl = next((i for i, l in enumerate(okno) if re.search(r"\b" + re.escape(m["nazwa"]) + r"\s*\(", l) and "@" not in l), len(okno))
            okno = okno[:dekl]
            okno = okno[max([i + 1 for i, l in enumerate(okno) if re.match(r"\s*\}\s*$", l)] or [0]):]
            mr = re.search(r"@request\(\s*['\"`](\w+)['\"`]\s*,\s*['\"`]([^'\"`]+)['\"`]", " ".join(okno))
            if mr:
                pk = re.search(r"@prefix\(\s*['\"`]([^'\"`]*)", " ".join(linie[max(0, k["linia"] - 8):k["linia"] + 1]))
                return {"metoda": mr.group(1).upper(), "sciezka": re.sub(r":(\w+)", r"{\1}", zloz_sciezke(pk.group(1) if pk else "", mr.group(2)))}
        if k["plik"].endswith(".cs"):                                    # ASP.NET Core: [Route] na klasie + [HttpX("…")] / [Route] na metodzie
            def atrybuty(od, wzor):                                       # blok atrybutów tuż nad deklaracją
                # CodeGraph zaczyna składową od pierwszego atrybutu — deklaracji szukamy najpierw w dół, potem w górę
                okno = list(range(max(0, od), min(len(linie), od + 16))) + list(range(od - 1, max(-1, od - 7), -1))
                dekl = next((i for i in okno if re.search(wzor, linie[i])), None)
                if dekl is None: return ""
                # po nawiasach, nie po liniach: [SwaggerOperation(\n Summary = "…",\n …)] w kilku liniach
                wynik, i, bilans = [], dekl - 1, 0
                while i >= 0:
                    l = re.sub(r'"(?:[^"\\]|\\.)*"', '""', linie[i])
                    b_ = l.count("[") - l.count("]")
                    if not (bilans < 0 or l.strip().startswith("[") or b_ < 0): break
                    wynik.insert(0, linie[i]); bilans += b_; i -= 1
                return " ".join(wynik) + " " + linie[dekl].split("(")[0]
            nad_k = atrybuty(k["linia"] - 1, r"\bclass\s+" + re.escape(k["nazwa"]) + r"\b")
            mk = re.search(r'\[Route\(\s*"([^"]*)"', nad_k)
            nad = atrybuty(m["linia"] - 1, r"\b" + re.escape(m["nazwa"]) + r"\s*(?:<[^>]*>)?\s*\(")
            mm = re.search(r'\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)"[^)]*\))?\]', nad)
            mr = re.search(r'\[Route\(\s*"([^"]*)"', nad)
            if mm or mr:
                kontroler = re.sub(r"Controller$", "", k["nazwa"])
                czesci = [(mk.group(1) if mk else "")] if not ((mm and (mm.group(2) or "").startswith("/")) or (mr and mr.group(1).startswith("/"))) else []
                czesci.append((mm.group(2) if mm and mm.group(2) is not None else (mr.group(1) if mr else "")) or "")
                s = "/" + "/".join(x.strip("/") for x in czesci if x and x.strip("/"))
                # akcja bez sufiksu Async (SuppressAsyncSuffixInActionNames); RouteTokenTransformerConvention (slugify):
                # [controller]/[action] w kebab-case — MyOrders → my-orders
                akcja = re.sub(r"(?<=.)Async$", "", m["nazwa"])
                zamien = (lambda x: re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", x).lower()) if self._slugify_cs() else str.lower
                s = s.replace("[controller]", zamien(kontroler)).replace("[action]", zamien(akcja))
                if self._prefiks_aspnet() and not s.startswith(self._prefiks_aspnet() + "/"): s = self._prefiks_aspnet() + s
                return {"metoda": mm.group(1).upper() if mm else "", "sciezka": re.sub(r"\{(\w+)(?::[^}]*)?\??\}", r"{\1}", s)}
            return self._razor_page(k, m) or self._minimal_api(k, m)
        if k["plik"].endswith(".java"):
            tr = self._jaxrs(k, m)
            if tr: return tr
        if k["plik"].endswith(".php"):
            tr = self._laravel_trasy().get((k["nazwa"], m["nazwa"])) or self._symfony_trasy().get((k["fqn"], m["nazwa"])) \
                or self._php_trasy_kodu().get((k["fqn"], m["nazwa"]))
            if tr: return tr
            tr = self._symfony_atrybut(k, m)
            if tr: return tr
            tr = self._opencart(k, m)
            if tr: return tr
        if k["plik"].endswith(".py"):                                    # FastAPI / Flask: dekorator routera nad funkcją
            nad = " ".join(dekoratory_py(linie, m["linia"]).split("\n"))     # dekorator bywa w kilku liniach
            mf = re.search(r"@\s*(\w+)\.(get|post|put|delete|patch|route)\(\s*[\'\"]([^\'\"]*)[\'\"]", nad)
            if mf:
                pre = self._prefiksy_py().get((modul_pythona(k["plik"]), mf.group(1)))
                if pre is None:                                            # router spoza łańcucha include_router
                    p_ = re.search(re.escape(mf.group(1)) + r"\s*=\s*(?:APIRouter|Blueprint)\([^)]*?(?:prefix|url_prefix)\s*=\s*[\'\"]([^\'\"]*)", "\n".join(linie))
                    pre = p_.group(1) if p_ else ""
                metoda = mf.group(2).upper() if mf.group(2) != "route" else (re.search(r"methods\s*=\s*\[\s*[\'\"](\w+)", nad) or [None, "GET"])[1].upper()
                s = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", pre + mf.group(3))
                # prefiks „/api/articles” + „/” to w FastAPI „/api/articles/”, request przychodzi jako /api/articles
                return {"metoda": metoda, "sciezka": re.sub(r"/{2,}", "/", s).rstrip("/") or "/"}
        if k["plik"].endswith(".py") and m["nazwa"] in DJANGO_METODY:
            s = self._django_trasy().get(k["fqn"]) or self._django_trasy().get(k["nazwa"])
            if s: return {"metoda": DJANGO_METODY[m["nazwa"]], "sciezka": s}
        if k["plik"].endswith(".py"): return self._akcja_admina(k, m)
        return None

    def _opencart(self, k, m):
        """Trasa w parametrze zapytania (OpenCart): kontroler <aplikacja>/controller/a/b.php, metoda m → index.php?route=a/b.m
        (index → a/b); rozszerzenie extension/<x>/<aplikacja>/controller/c.php → route=extension/<x>/c. Aplikacja catalog
        to /index.php, inna (admin) — /<aplikacja>/index.php. Separator metody z system/engine/action.php („.”, starsze „|”)."""
        w = re.search(r"(?:^|/)(?:extension/(\w+)/)?(\w+)/controller/((?:\w+/)*\w+)\.php$", k["plik"])
        if not w or m["widocznosc"] not in ("public", "") or m["statyczna"] or m["nazwa"].startswith("__"): return None
        if not re.search(r"\bController\b", k.get("bazowe", "")): return None
        korzen = k["plik"][:w.start() + (1 if k["plik"][w.start()] == "/" else 0)]
        if not os.path.exists(os.path.join(self.p.repo, korzen, "index.php")) and not os.path.exists(os.path.join(self.p.repo, korzen, w.group(2), "index.php")): return None
        if not hasattr(self, "_oc_sep"):
            a = next((p_ for p_ in self._pliki_repo(("action.php",)) if p_.endswith("system/engine/action.php")), None)
            s = re.search(r"strrpos\(\s*\$route\s*,\s*'(.)'", czytaj(os.path.join(self.p.repo, a))) if a else None
            self._oc_sep = s.group(1) if s else "."
        trasa = (f"extension/{w.group(1)}/" if w.group(1) else "") + w.group(3) + ("" if m["nazwa"] == "index" else self._oc_sep + m["nazwa"])
        plik_wej = "/index.php" if w.group(2) == "catalog" or not os.path.exists(os.path.join(self.p.repo, korzen, w.group(2), "index.php")) else f"/{w.group(2)}/index.php"
        return {"metoda": "", "sciezka": f"{plik_wej}?route={trasa}", "parametr": "route"}

    JAXRS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}

    def _jaxrs(self, k, m):
        """JAX-RS (Jakarta REST / Jersey / RESTEasy): @Path klasy + @GET/@POST… metody i jej @Path; prefiks z
        @ApplicationPath (albo url-pattern serwletu JAX-RS w web.xml) i ścieżka kontekstu WAR."""
        if not m["adnotacje"] & self.JAXRS: return None
        linie = self.p.zrodlo(k["plik"])
        do = next((i for i in range(max(0, k["linia"] - 1), min(len(linie), k["linia"] + 30)) if re.search(r"\bclass\s+" + re.escape(k["nazwa"]) + r"\b", linie[i])), k["linia"] - 1)
        pk = re.search(r'@Path\s*\(\s*(?:value\s*=\s*)?"([^"]*)"', "\n".join(linie[max(0, k["linia"] - 8):do + 1]))
        if not pk: return None
        dm = next((i for i in range(m["linia"] - 1, min(len(linie), m["linia"] + 10)) if re.search(r"\b" + re.escape(m["nazwa"]) + r"\s*\(", linie[i])), m["linia"] - 1)
        nad = "\n".join(linie[max(0, m["linia"] - 8):dm])                    # adnotacje tej metody: od końca poprzedniej składowej
        maska = re.sub(r"\((?:[^()]|\([^()]*\))*\)", lambda x: " " * len(x.group(0)), nad)   # @Consumes({…}) to nie koniec składowej
        nad = nad[max(maska.rfind(";"), maska.rfind("}"), maska.rfind("{")) + 1:]
        pm = re.search(r'@Path\s*\(\s*(?:value\s*=\s*)?"([^"]*)"', nad)
        if not hasattr(self, "_jaxrs_pre"):
            self._jaxrs_pre = ""
            for x in self.p.klasy.values():
                if x["jezyk"] != "java": continue
                a = re.search(r'@ApplicationPath\s*\(\s*"([^"]*)"', " ".join(self.p.zrodlo(x["plik"])[max(0, x["linia"] - 8):x["linia"] + 2]))
                if a: self._jaxrs_pre = a.group(1).strip("/").rstrip("/*"); break
            else:
                for p_ in self._pliki_repo(("web.xml",)):
                    w = czytaj(os.path.join(self.p.repo, p_))
                    s = re.search(r"<servlet-class>\s*(?:org\.glassfish\.jersey|org\.jboss\.resteasy|com\.sun\.jersey)[^<]*</servlet-class>.*?<servlet-name>\s*([^<]+?)\s*</servlet-name>", w, re.S) \
                        or re.search(r"<servlet-name>\s*([^<]+?)\s*</servlet-name>\s*<servlet-class>\s*(?:org\.glassfish\.jersey|org\.jboss\.resteasy|com\.sun\.jersey)", w)
                    u = re.search(r"<servlet-mapping>\s*<servlet-name>\s*" + re.escape(s.group(1)) + r"\s*</servlet-name>\s*<url-pattern>\s*([^<]+?)\s*</url-pattern>", w) if s else None
                    if u: self._jaxrs_pre = u.group(1).strip("/").rstrip("/*").strip("/"); break
        ctx = self._kontekst_war() if any(p_.endswith("WEB-INF/web.xml") for p_ in self._pliki_repo(("web.xml",))) or os.path.exists(os.path.join(self.p.repo, "pom.xml")) and "<packaging>war</packaging>" in czytaj(os.path.join(self.p.repo, "pom.xml")) else ""
        s = zloz_sciezke(ctx, self._jaxrs_pre, pk.group(1), pm.group(1) if pm else "")
        return {"metoda": sorted(m["adnotacje"] & self.JAXRS)[0], "sciezka": re.sub(r"\{(\w+)\s*(?::[^}]*)?\}", r"{\1}", s)}

    def _slugify_cs(self):
        """ASP.NET Core: options.Conventions.Add(new RouteTokenTransformerConvention(new Slugify…())) w Program/Startup —
        tokeny [controller]/[action] tras atrybutowych w kebab-case."""
        if not hasattr(self, "_slug_cs"):
            self._slug_cs = any("RouteTokenTransformerConvention" in "\n".join(self.p.zrodlo(p_)) for p_ in self._pliki_repo((".cs",)))
        return self._slug_cs

    HANDLER_STRONY = re.compile(r"^On(Get|Post|Put|Delete|Patch)(\w*?)(?:Async)?$")

    def _razor_page(self, k, m):
        """Razor Pages: trasa z położenia pliku względem Pages/ (Index → katalog; Areas/X/Pages/… → /X/…) i z @page
        w .cshtml (szablon względny albo „/…” bezwzględny), metoda HTTP z nazwy handlera OnGet/OnPost[Nazwa][Async].
        Handler nazwany: segment szablonu {handler?} albo zdarzenie (?handler=nazwa)."""
        h = self.HANDLER_STRONY.match(m["nazwa"])
        w = re.search(r"(?:^|/)(?:Areas/(\w+)/)?Pages/((?:[\w.-]+/)*[\w.-]+)\.cshtml\.cs$", k["plik"])
        if not h or not w: return None
        widok = "\n".join(self.p.zrodlo(k["plik"][:-3]))
        pg = re.search(r'^[\s\ufeff]*@page(?:\s+"([^"]*)")?', widok, re.M)
        if widok and not pg: return None                                    # widok częściowy, nie strona
        sciezka = "/".join(x for x in [w.group(1) or "", *w.group(2).split("/")] if x)
        sciezka = re.sub(r"(^|/)Index$", "", sciezka)
        szablon = (pg.group(1) or "") if pg else ""
        sciezka = szablon if szablon.startswith("/") else "/" + "/".join(x for x in (sciezka, szablon) if x)
        wynik = {"metoda": h.group(1).upper()}
        if h.group(2):
            if re.search(r"\{handler\??\}", sciezka): sciezka = re.sub(r"\{handler\??\}", h.group(2), sciezka)
            else: wynik["zdarzenie"] = h.group(2)
        sciezka = re.sub(r"/?\{handler\??\}", "", sciezka)
        wynik["sciezka"] = re.sub(r"\{(\w+)(?::[^}]*)?\??\}", r"{\1}", sciezka) or "/"
        return wynik

    def _minimal_api(self, k, m):
        """ASP.NET Core minimal API w klasie: app.MapPost("api/x", … => HandleAsync(…)) albo MapGet("x", HandleAsync)
        — wejściem jest metoda tej klasy wołana z delegata trasy."""
        if not hasattr(self, "_min_cs"): self._min_cs = {}
        if k["plik"] + "#" + k["qn"] not in self._min_cs:
            tekst = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
            nazwy, trasy = {x["nazwa"] for x in k["metody"]}, {}
            for w_ in re.finditer(r"\.Map(Get|Post|Put|Delete|Patch)\(\s*\$?\"([^\"]*)\"\s*,", tekst):
                args, _ = self._argumenty(tekst, tekst.index("(", w_.start()) + 1)
                delegat = ",".join(args[1:])
                for n in dict.fromkeys(re.findall(r"(?<![\w.])(\w+)\s*(?:\(|$)", delegat.strip()) + re.findall(r"(?<![\w.])(\w+)\s*\(", delegat)):
                    if n in nazwy and n != "AddRoute":
                        trasy.setdefault(n, {"metoda": w_.group(1).upper(), "sciezka": re.sub(r"\{(\w+)(?::[^}]*)?\??\}", r"{\1}", "/" + w_.group(2).lstrip("/"))})
            self._min_cs[k["plik"] + "#" + k["qn"]] = trasy
        return self._min_cs[k["plik"] + "#" + k["qn"]].get(m["nazwa"])

    def _akcja_admina(self, k, m):
        """Django admin: akcja ModelAdmin (@admin.action albo nazwa w actions = [...]) idzie POST-em na listę zmian modelu
        /admin/<etykieta aplikacji>/<model>/ (pole action w treści). Model z @admin.register(X) nad klasą albo
        admin.site.register(X, KlasaAdmin)."""
        cialo_k = "\n".join(self.p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
        akcje = set(re.findall(r"['\"](\w+)['\"]", (re.search(r"^\s+actions\s*=\s*[\[(]([^\])]*)", cialo_k, re.M) or [None, ""])[1]))
        if m["nazwa"] not in akcje and not m["adnotacje"] & {"action", "admin.action"}: return None
        linie = self.p.zrodlo(k["plik"])
        nad = " ".join(linie[max(0, k["linia"] - 4):k["linia"] + 1])
        mod = re.search(r"@admin\.register\(\s*(\w+)", nad) or \
            re.search(r"\badmin\.site\.register\(\s*(\w+)\s*,\s*" + re.escape(k["nazwa"]) + r"\b", "\n".join(linie))
        if not mod: return None
        modele = [x for x in self.p.klasy.values() if x["jezyk"] == "python" and x["nazwa"] == mod.group(1)]
        if not modele: return None
        model = next((x for x in modele if x["pakiet"].split(".")[:-1] == k["pakiet"].split(".")[:-1]), modele[0])
        return {"metoda": "POST", "sciezka": f"/admin/{self._etykieta_django(model)}/{model['nazwa'].lower()}/", "zdarzenie": m["nazwa"]}

    def kontekst_servletu(self):
        """Spring Boot: server.servlet.context-path (server.context-path) z application*.properties / *.yml — prefiks
        wszystkich tras HTTP w działającej aplikacji."""
        if hasattr(self, "_ctx"): return self._ctx
        self._ctx = ""
        for d, _, fs in os.walk(self.p.repo):
            if "/." in d or "/target" in d or "/test" in d or "node_modules" in d: continue
            for f in sorted(fs):
                if not re.fullmatch(r"application\.(properties|ya?ml)", f): continue
                t = czytaj(os.path.join(d, f))
                m = re.search(r"^\s*server\.(?:servlet\.)?context-path\s*[=:]\s*([^\s#]+)", t, re.M) or \
                    re.search(r"^\s+context-path:\s*['\"]?([^\s'\"#]+)", t, re.M)
                if m and m.group(1).strip("/"): self._ctx = "/" + m.group(1).strip("/")
        return self._ctx

    def _plik_typu(self, nazwa):
        """Źródło typu spoza indeksu (interfejs wygenerowany przez OpenAPI Generator w target/generated-sources)."""
        if not hasattr(self, "_typy"):
            self._typy = {}
            for d, _, fs in os.walk(self.p.repo):
                if "/." in d or "node_modules" in d: continue
                if not re.search(r"/(target|build)/generated[\w-]*/|/src/main/", d + "/"): continue
                for f in fs:
                    if f.endswith(".java"): self._typy.setdefault(f[:-5], os.path.join(d, f))
        return self._typy.get(nazwa)

    def mapowanie_interfejsu(self, k, m):
        """Metoda kontrolera bez mapowania (@Override metody z interfejsu API): adnotacje mapowania z implementowanego
        interfejsu — z indeksu albo z pliku wygenerowanego (OpenAPI Generator). → (metoda, ścieżka) albo None."""
        for n in [x.strip().split("<")[0].split(".")[-1] for x in (k.get("implementuje", "") + "," + k.get("rozszerza", "")).split(",") if x.strip()]:
            plik = self._plik_typu(n)
            if not plik: continue
            try: linie = czytaj(plik).split("\n")
            except OSError: continue
            stale = dict(re.findall(r"\bString\s+(\w+)\s*=\s*\"([^\"]*)\"\s*;", "\n".join(linie)))
            def wartosc(wyr):
                cz = []
                for c in wyr.split("+"):
                    c = c.strip()
                    cz.append(c.strip('"') if c.startswith('"') else stale.get(c.split(".")[-1], self.stale.get(c.split(".")[-1], "{" + c + "}")))
                return "".join(cz)
            dekl = next((i for i, l in enumerate(linie) if re.search(r"\binterface\s+" + re.escape(n) + r"\b", l)), 0)
            mk = mapowanie("\n".join(linie[max(0, dekl - 10):dekl + 1]))
            baza = wartosc(mk[1]) if mk and mk[1] else ""
            for i, l in enumerate(linie):
                if not re.search(r"\b" + re.escape(m["nazwa"]) + r"\s*\(", l) or re.search(r"[=.]\s*" + re.escape(m["nazwa"]) + r"\s*\(", l): continue
                # najbliższa adnotacja mapowania nad deklaracją, bez innej deklaracji metody pomiędzy
                j = i - 1
                while j >= 0 and i - j < 80 and not re.search(r"@\w*Mapping\b", linie[j]):
                    if re.match(r"\s*(default|public|private|protected|abstract)\b[^=]*\(", linie[j]) and not linie[j].strip().startswith("@"): j = -1; break
                    j -= 1
                if j < 0 or i - j >= 80: continue
                mm = mapowanie("\n".join(linie[j:i + 1]))
                if mm: return mm[0], baza + wartosc(mm[1])
        return None

    def wejscia(self):
        wynik = []
        ctx = self.kontekst_servletu()
        for klucz, k in self.p.klasy.items():
            if self.rola.get(klucz) != "wejscie": continue
            linie_k = self.p.zrodlo(k["plik"])
            # adnotacje klasy: CodeGraph zaczyna klasę od pierwszej adnotacji, @RequestMapping bywa niżej — do linii z „class”
            do = next((i for i in range(max(0, k["linia"] - 1), min(len(linie_k), k["linia"] + 30))
                       if re.search(r"\b(class|interface)\s+" + re.escape(k["nazwa"]) + r"\b", linie_k[i])), k["linia"])
            dekl = " ".join(linie_k[max(0, k["linia"] - 6):do + 1])
            mk = mapowanie(dekl)
            baza = self._sciezka(mk[1] or "") if mk else ""
            for m in k["metody"]:
                if m["nazwa"] in ("constructor", "__init__", k["nazwa"]): continue     # konstruktor to nie wejście
                inne = self._http_innych(k, m)
                if inne:
                    drzewo = self.wezel(m["id"], {m["id"]}, [0])
                    if k["jezyk"] == "python": self._raz_na_request(drzewo)
                    if k["jezyk"] == "csharp":                                  # middleware (UseMiddleware<T>) przed akcją
                        licznik = [0]
                        drzewo["dzieci"][:0] = [d for i in self.middleware_cs() for d in self._wezly(i, licznik)]
                    if k["jezyk"] in ("typescript", "javascript"):              # Nest: consumer.apply(X).forRoutes(…)
                        licznik = [0]
                        drzewo["dzieci"][:0] = [d for i in self._nest_middleware_dla(k, inne) for d in self._wezly(i, licznik)]
                        self._lancuch_express(drzewo, (k["nazwa"], m["nazwa"]))
                    wynik.append({"id": f'{k["fqn"]}#{m["nazwa"]}', "klasa": k["fqn"], "metoda": m["nazwa"], "http": inne, "drzewo": drzewo})
                    continue
                nad = self.p.zrodlo(k["plik"])[max(0, m["linia"] - 4):m["linia"]]
                while nad and re.search(r"\b(class|interface)\b", " ".join(nad)): nad = nad[1:]
                tekst = " ".join(nad)
                mm = mapowanie(tekst)
                http = {"metoda": mm[0], "sciezka": zloz_sciezke(baza, self._sciezka(mm[1] or ""))} if mm else None
                if not mm and k["jezyk"] == "java":                          # trasa w interfejsie API (OpenAPI Generator)
                    mi = self.mapowanie_interfejsu(k, m)
                    if mi: mm, http = mi, {"metoda": mi[0], "sciezka": zloz_sciezke(baza, mi[1])}
                if not mm and k["jezyk"] == "java" and re.search(r"\w*ActionBean\b", k.get("implementuje", "") + " " + k.get("rozszerza", "")):
                    http = self.stripes(k, m)
                if http and k["jezyk"] == "java" and ctx: http["sciezka"] = zloz_sciezke(ctx, http["sciezka"])
                # wejście bez adnotacji (Quartz executeInternal, Job.execute, handler z interfejsu): metoda wybrana w mapie
                z_mapy = m["nazwa"] in ((self.mapa["klasy"].get(k["fqn"]) or {}).get("metody") or [])
                if not mm and not z_mapy and not (m["adnotacje"] & {"Scheduled", "KafkaListener", "RabbitListener", "JmsListener", "EventListener", "WebMethod"}): continue
                zwrotne = self.zwrotne_celery(k)
                if any(f == m["nazwa"] for v in zwrotne.values() for f, _ in v): continue   # on_failure=f — część zadania, nie wejście
                drzewo = self.wezel(m["id"], {m["id"]}, [0])
                if k["jezyk"] == "python": self._raz_na_request(drzewo)
                if mm and k["jezyk"] == "java": drzewo["dzieci"][:0] = self.preludia_mvc(klucz, k, m)
                for f, warunek in zwrotne.get(m["nazwa"], []):               # Celery: on_failure / on_retry / on_success po zadaniu
                    for x in k["metody"]:
                        if x["nazwa"] != f: continue
                        for d in self._wezly(x["id"], [0]):
                            d["warunek"] = warunek
                            drzewo["dzieci"].append(d)
                wynik.append({"id": f'{k["fqn"]}#{m["nazwa"]}', "klasa": k["fqn"], "metoda": m["nazwa"], "http": http, "drzewo": drzewo})
        if any(k["jezyk"] in ("typescript", "javascript") for k in self.p.klasy.values()): wynik += self._wejscia_js({w["id"] for w in wynik})
        if any(k["jezyk"] == "java" for k in self.p.klasy.values()): wynik += self._wejscia_jsf()
        return wynik

    ZAKRES_ZADANIA = {"RequestScoped", "Dependent", "RequestScope"}           # bean tworzony w każdym requeście

    def _kontekst_war(self):
        """Ścieżka kontekstu aplikacji WAR: <context-root> z glassfish-web.xml / jboss-web.xml / sun-web.xml, inaczej
        <finalName> albo artifactId z pom.xml (nazwa pliku .war)."""
        for nazwa in ("glassfish-web.xml", "jboss-web.xml", "sun-web.xml", "payara-web.xml"):
            for plik in self._pliki_repo((nazwa,)):
                c = re.search(r"<context-root>\s*([^<\s]*)\s*</context-root>", czytaj(os.path.join(self.p.repo, plik)))
                if c: return "/" + c.group(1).strip("/") if c.group(1).strip("/") else ""
        pom = os.path.join(self.p.repo, "pom.xml")
        if os.path.exists(pom):
            x = re.sub(r"<parent>.*?</parent>|<dependencies>.*?</dependencies>|<plugins>.*?</plugins>", "", czytaj(pom), flags=re.S)
            n = re.search(r"<finalName>\s*([\w.-]+)\s*</finalName>", czytaj(pom)) or re.search(r"<artifactId>\s*([\w.-]+)\s*</artifactId>", x)
            if n: return "/" + n.group(1)
        return ""

    def _wejscia_jsf(self):
        """JSF / Facelets: widok *.xhtml (pod katalogiem z WEB-INF) → wejścia HTTP. GET /<kontekst>/<widok>.xhtml:
        @PostConstruct beanów użytych w EL (#{bean.…}, także w ui:include / szablonie) i nasłuchy f:viewAction /
        f:event preRenderView, w kolejności w tekście. POST tego widoku: akcja (action / actionListener / listener
        p:ajax) z @PostConstruct beana o zakresie requestu przed nią. Nazwa beana: @Named("x") albo klasa małą literą."""
        beany = {}
        for k in self.p.klasy.values():
            if k["jezyk"] != "java" or not k["adnotacje"] & {"Named", "ManagedBean"}: continue
            nad = " ".join(self.p.zrodlo(k["plik"])[max(0, k["linia"] - 8):k["linia"] + 2])
            n = re.search(r'@(?:Named|ManagedBean)\s*\(\s*(?:value\s*=\s*|name\s*=\s*)?"([^"]+)"', nad)
            beany[n.group(1) if n else k["nazwa"][0].lower() + k["nazwa"][1:]] = k
        if not beany: return []
        korzenie = sorted({d for d in (os.path.dirname(os.path.dirname(p_)) for p_ in self._pliki_repo(("web.xml",)) if p_.endswith("WEB-INF/web.xml"))}
                          | {os.path.dirname(os.path.dirname(p_)) for p_ in self._pliki_repo(("faces-config.xml",)) if "WEB-INF/" in p_})
        korzenie = [k_ for k_ in korzenie if not re.search(r"(^|/)(target|build|\.flow-lens)(/|$)", k_)]
        if not korzenie: return []
        ctx, wynik = self._kontekst_war(), []
        nazwy = sorted(beany, key=len, reverse=True)                            # public.track przed public
        def tekst_widoku(korzen, plik, g=0):
            try: x = czytaj(os.path.join(self.p.repo, korzen, plik.lstrip("/")))
            except OSError: return ""
            if g >= 3: return x
            for src in re.findall(r'<ui:(?:include|composition|decorate)\b[^>]*\b(?:src|template)="([^"#]+)"', x):
                x += "\n" + tekst_widoku(korzen, src if src.startswith("/") else os.path.join(os.path.dirname(plik), src), g + 1)
            return x
        def metoda(k, nazwa):
            return next((x for x in k["metody"] if x["nazwa"] == nazwa), None)
        def postconstruct(k):
            return next((x for x in k["metody"] if "PostConstruct" in x["adnotacje"]), None)
        for korzen in korzenie:
            widoki = [p_[len(korzen):] for p_ in self._pliki_repo((".xhtml",)) if p_.startswith(korzen + "/") and "/WEB-INF/" not in p_ and "/resources/" not in p_]
            wlaczane = set()                                                    # fragmenty z ui:include — nie są osobnymi stronami
            for widok in widoki:
                try: x = czytaj(os.path.join(self.p.repo, korzen, widok.lstrip("/")))
                except OSError: continue
                for src in re.findall(r'<ui:include\b[^>]*\bsrc="([^"#]+)"', x):
                    wlaczane.add(os.path.normpath(src if src.startswith("/") else os.path.join(os.path.dirname(widok), src)))
            for widok in widoki:
                if widok in wlaczane: continue
                tekst = re.sub(r"<!--.*?-->", "", tekst_widoku(korzen, widok), flags=re.S)
                if "#{" not in tekst: continue
                sciezka = (ctx + widok) if ctx else widok
                uzycia = []                                                     # (pozycja, rodzaj, bean, metoda)
                for el in re.finditer(r"#\{([^}]*)\}", tekst):
                    wyr = el.group(1)
                    for n in nazwy:
                        for w_ in re.finditer(r"(?<![\w.])" + re.escape(n) + r"\.(\w+)(\s*\()?", wyr):
                            atr = re.search(r'(\w+)\s*=\s*"[^"]*$', tekst[max(0, el.start() - 200):el.start()])
                            atr = atr.group(1) if atr else ""
                            znacznik = tekst[tekst.rfind("<", 0, el.start()):el.start()]
                            if znacznik.startswith("<f:viewAction") or znacznik.startswith("<f:event") and "preRenderView" in znacznik: rodzaj = "widok"
                            elif atr in ("action", "actionListener", "listener"): rodzaj = "akcja"
                            else: rodzaj = "el"
                            uzycia.append((el.start(), rodzaj, n, w_.group(1)))
                if not uzycia: continue
                licznik, dzieci, pc_widziane = [0], [], set()
                for _, rodzaj, n, met in uzycia:                                 # GET: pierwszy render widoku
                    k = beany[n]
                    pc = postconstruct(k)
                    if pc and n not in pc_widziane:
                        pc_widziane.add(n); dzieci += self._wezly(pc["id"], licznik)
                    x = metoda(k, met)
                    if rodzaj == "widok" and x: dzieci += self._wezly(x["id"], licznik)
                if dzieci:
                    wynik.append({"id": f"jsf:{widok}#GET", "klasa": "", "metoda": f"GET {sciezka}", "http": {"metoda": "GET", "sciezka": sciezka},
                                  "drzewo": {"klasa": "", "nazwa": "", "metoda": f"GET {sciezka}", "rola": "wejscie", "linia": 1, "dzieci": dzieci}})
                for n, met in dict.fromkeys((n, m_) for _, r, n, m_ in uzycia if r == "akcja"):   # POST: akcja formularza / AJAX
                    k, x = beany[n], metoda(beany[n], met)
                    if not x: continue
                    drzewo = self.wezel(x["id"], {x["id"]}, [0])
                    pc = postconstruct(k)
                    if pc and pc["id"] != x["id"] and k["adnotacje"] & self.ZAKRES_ZADANIA:     # bean zakresu requestu: nowy przy POST
                        drzewo["dzieci"][:0] = self._wezly(pc["id"], [0])
                    wynik.append({"id": f'{k["fqn"]}#{met}', "klasa": k["fqn"], "metoda": met, "http": {"metoda": "POST", "sciezka": sciezka}, "drzewo": drzewo})
        return wynik

    def _lancuch_express(self, drzewo, klucz):
        """Middleware trasy Express przed dziećmi handlera, obsługa błędów na końcu z warunkiem „przy błędzie”."""
        l = self._express_lancuchy().get(klucz)
        if not l: return
        licznik = [0]
        drzewo["dzieci"][:0] = [d for i in l["przed"] for d in self._wezly(i, licznik)]
        for i in l["bledy"]:
            for d in self._wezly(i, licznik):
                d["warunek"] = "przy błędzie"
                drzewo["dzieci"].append(d)

    STATUSY = {"BadRequest": 400, "BAD_REQUEST": 400, "Unauthorized": 401, "UNAUTHORIZED": 401, "Forbidden": 403, "FORBIDDEN": 403,
               "NotFound": 404, "NOT_FOUND": 404, "Conflict": 409, "CONFLICT": 409, "UnprocessableEntity": 422, "UNPROCESSABLE_ENTITY": 422,
               "InternalServerError": 500, "INTERNAL_SERVER_ERROR": 500, "ServiceUnavailable": 503, "SERVICE_UNAVAILABLE": 503}

    def rzuty(self, k, m):
        """Wyjątki rzucane w ciele metody: throw new X(…) / raise X(…) → [{typ, linia, komunikat?, status?}] — komunikat
        (pierwszy literał napisowy) wiąże treść wyjątku z logu z metodą, status (HttpStatusCode.Forbidden, HttpStatus.NOT_FOUND,
        literał 4xx/5xx) — miejsce rzutu ze statusem odpowiedzi."""
        tekst = "\n".join(self.p.zrodlo(k["plik"])[m["linia"] - 1:m["koniec"]])
        if not re.search(r"\b(?:throw|raise)\b", tekst): return []
        wzor = r"\braise\s+((?:\w+\.)*[A-Z]\w*)\s*\(" if k["jezyk"] == "python" else r"\bthrow\s+new\s+\\?((?:[\w\\]+[.\\])*[A-Z]\w*)\s*(?:<[^<>]*>)?\s*\("
        wynik = []
        for w_ in re.finditer(wzor, tekst):
            args, _ = self._argumenty(tekst, w_.end())
            r = {"typ": re.split(r"[.\\]", w_.group(1))[-1], "linia": m["linia"] + tekst.count("\n", 0, w_.start())}
            lit = re.search(r"(?<![\w])[fr]?([\"'`])((?:(?!\1).)+)\1", ",".join(args))
            if lit: r["komunikat"] = lit.group(2)
            st = re.search(r"\bHttpStatus(?:Code)?\.(\w+)", ",".join(args))
            kod = self.STATUSY.get(st.group(1)) if st else None
            if kod is None:
                n = re.search(r"(?<![\w.])([45]\d\d)(?![\w.])", ",".join(a for a in args if not re.match(r"\s*[fr]?[\"'`]", a)))
                kod = int(n.group(1)) if n else None
            if kod: r["status"] = kod
            if r not in wynik: wynik.append(r)
        return wynik

    def zwrotne_celery(self, k):
        """Celery: @shared_task(bind=True, on_failure=_email_send_failure) — funkcja zwrotna wykonuje się w tym samym
        workerze po zadaniu (przy błędzie / ponowieniu / sukcesie). → {zadanie: [(funkcja, warunek)]} dla modułu k."""
        if k["jezyk"] != "python": return {}
        if not hasattr(self, "_celery_cb"): self._celery_cb = {}
        if k["plik"] not in self._celery_cb:
            tekst, wynik = "\n".join(self.p.zrodlo(k["plik"])), defaultdict(list)
            for args, zad in re.findall(r"@[\w.]*task\(((?:[^()]|\([^()]*\))*)\)\s*\n(?:\s*@[^\n]*\n)*\s*(?:async\s+)?def\s+(\w+)", tekst):
                for rodzaj, f in re.findall(r"\bon_(failure|retry|success)\s*=\s*(\w+)", args):
                    wynik[zad].append((f, "po sukcesie" if rodzaj == "success" else "przy błędzie"))
            self._celery_cb[k["plik"]] = dict(wynik)
        return self._celery_cb[k["plik"]]

    def _wezly(self, c, licznik):
        """Węzeł metody c jak w wezel: klasa z mapy z tą metodą → węzeł, inaczej jego dzieci (przejście przez klasę)."""
        ck = self.p.metody[c][0]
        wpis = self.mapa["klasy"].get(self.p.klasy[ck]["fqn"]) or {}
        d = self.wezel(c, {c}, licznik)
        istotna = self.rola.get(ck) in RYSOWANE and (self.rola.get(ck) == "repozytorium" or self.p.metody[c][1] in (wpis.get("metody") or []))
        return [d] if istotna else d["dzieci"]

    def preludia_mvc(self, klucz, k, m):
        """Spring MVC: kroki, które framework wykonuje przed handlerem — metody @ModelAttribute kontrolera i
        @ControllerAdvice, Formatter<X>.parse dla pól typu X w obiekcie wiązanym z parametru handlera, walidator z
        @InitBinder (dataBinder.setValidator(new V())) dla parametru @Valid o tej nazwie atrybutu."""
        licznik, wynik = [0], []
        porady = [x for x in self.p.klasy.values() if x["jezyk"] == "java" and x["adnotacje"] & {"ControllerAdvice", "RestControllerAdvice"}]
        for x in [k] + porady:
            for mt in x["metody"]:
                if "ModelAttribute" in mt["adnotacje"] and mt["id"] != m["id"]: wynik += self._wezly(mt["id"], licznik)
        sygn = re.search(r"\b" + re.escape(m["nazwa"]) + r"\s*\(((?:[^()]|\([^()]*\))*)\)", m.get("cialo") or "")
        parametry = [re.sub(r"@\w+(?:\([^)]*\))?\s*", "", p_).split() + [p_] for p_ in re.split(r",(?![^<]*>)", sygn.group(1))] if sygn else []
        po_nazwie = {x["nazwa"]: x for x in self.p.klasy.values() if x["jezyk"] == "java"}
        if not hasattr(self, "_formattery"):
            self._formattery = {}
            for x in self.p.klasy.values():
                f = re.search(r"\b(?:Formatter|Converter)\s*<\s*(?:\w+\s*,\s*)?(\w+)\s*>", x.get("implementuje", ""))
                if f: self._formattery[f.group(1)] = x
        for pr in parametry:
            if len(pr) < 3 or pr[0] not in po_nazwie: continue
            typ, nazwa_p, surowy = pr[0], pr[1], pr[-1]
            if re.search(r"@(?:PathVariable|RequestParam|RequestBody|RequestHeader)\b", surowy): continue
            cialo_t = "\n".join(self.p.zrodlo(po_nazwie[typ]["plik"])[po_nazwie[typ]["linia"] - 1:po_nazwie[typ]["koniec"]])
            for pole in dict.fromkeys(re.findall(r"\b(?:private|protected)\s+([A-Z]\w*)\s+\w+\s*[;=]", cialo_t)):
                f = self._formattery.get(pole)
                parse = next((x["id"] for x in f["metody"] if x["nazwa"] in ("parse", "convert")), None) if f else None
                if parse: wynik += self._wezly(parse, licznik)
            if "@Valid" not in surowy and "@Validated" not in surowy: continue
            atr = re.search(r"@ModelAttribute\(\s*(?:value\s*=\s*)?\"(\w+)\"", surowy)
            atr = atr.group(1) if atr else typ[0].lower() + typ[1:]
            for ib in k["metody"]:
                if "InitBinder" not in ib["adnotacje"]: continue
                nad = " ".join(self.p.zrodlo(k["plik"])[max(0, ib["linia"] - 3):ib["linia"]])
                wart = re.search(r"@InitBinder\(\s*(?:value\s*=\s*)?\{?\s*\"(\w+)\"", nad + " " + (ib.get("cialo") or "").split("{")[0])
                if wart and wart.group(1) != atr: continue
                for v in re.findall(r"setValidator\(\s*new\s+(\w+)\s*\(", ib.get("cialo") or ""):
                    walid = next((x["id"] for x in po_nazwie[v]["metody"] if x["nazwa"] == "validate"), None) if v in po_nazwie else None
                    if walid: wynik += self._wezly(walid, licznik)
        return wynik

    def _wejscia_js(self, widziane):
        """Express / Koa: trasy z handlerem — funkcją modułu (router.get('/x', getTags)) albo inline (async (req, res) => {…
        await createUser(…) }) — wejścia spoza klas-kontrolerów mapy. Wejście inline: klasa = moduł pliku z trasą, metoda =
        „METODA /ścieżka”, dzieci = wywołane funkcje modułów z mapy."""
        trasy, inline = self._js_trasy()
        wynik = []
        for (rodzaj, cel), http in trasy.items():
            if rodzaj != "funkcja": continue
            klucz, nazwa = self.p.metody[cel]
            k = self.p.klasy[klucz]
            id_ = f'{k["fqn"]}#{nazwa}'
            if id_ in widziane: continue
            widziane.add(id_)
            drzewo = self.wezel(cel, {cel}, [0])
            self._lancuch_express(drzewo, ("funkcja", cel))
            wynik.append({"id": id_, "klasa": k["fqn"], "metoda": nazwa, "http": http, "drzewo": drzewo})
        for e in inline:
            fqn_ = re.sub(r"\.(m|c)?[jt]sx?$", "", e["plik"]).replace("/", ".")
            metoda = f'{e["http"]["metoda"] or "ALL"} {e["http"]["sciezka"]}'
            id_ = f"{fqn_}#{metoda}"
            if id_ in widziane: continue
            widziane.add(id_)
            korzen = {"klasa": fqn_, "nazwa": os.path.basename(e["plik"]).rsplit(".", 1)[0], "metoda": metoda, "rola": "wejscie", "linia": 1, "dzieci": []}
            licznik = [0]
            for c in e["wywolania"]: korzen["dzieci"] += self._wezly(c, licznik)
            wynik.append({"id": id_, "klasa": fqn_, "metoda": metoda, "http": e["http"], "drzewo": korzen})
        return wynik


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("repo"); a.add_argument("--mapa"); a.add_argument("--wyjscie")
    o = a.parse_args()
    repo = os.path.abspath(o.repo)
    plik_mapy = o.mapa or os.path.join(repo, ".flow-lens", "mapa.json")
    with open(plik_mapy, encoding="utf-8") as f: mapa = json.load(f)
    s = Statyczne(repo, mapa)
    wej = s.wejscia()
    wyj = o.wyjscie or os.path.join(repo, ".flow-lens", "statyczne.json")
    # trasa w parametrze zapytania (OpenCart index.php?route=…): wejście = ścieżka + ten parametr, nie sama ścieżka
    param = sorted({w["http"]["parametr"] for w in wej if (w.get("http") or {}).get("parametr")})
    with open(wyj, "w", encoding="utf-8") as f:
        json.dump({"projekt": mapa.get("projekt"), **({"trasa_z_parametru": param[0]} if param else {}), "wejscia": wej}, f, ensure_ascii=False)
    tab = sum(1 for w in wej for _ in re.finditer('"tabele"', json.dumps(w)))
    print(f"{wyj}: {len(wej)} wejść, węzły z tabelami: {tab}")
