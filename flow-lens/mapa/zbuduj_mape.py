#!/usr/bin/env python3
"""Proponuje mapę projektu dla flow-lens: które klasy nas interesują, w jakiej roli i na jakim poziomie rysunku.

Wejście: indeks CodeGraph (<repo>/.codegraph/codegraph.db) i źródła (adnotacje czytamy z nagłówków plików,
bo CodeGraph ich nie zapisuje). Role nadają reguły per technologia z mapa/reguly/<tech>.py (ta sama umowa co
w entry-flows/rules: ORDER, DETECT, klasyfikuj). Graf wywołań służy tylko do poziomów, nie do filtrowania —
dynamiczne wywołania (lambda, refleksja, proxy) i tak zobaczy dopiero przebieg z działającej aplikacji.

Użycie:
  python3 zbuduj_mape.py <repo> [--wyjscie <repo>/.flow-lens/mapa.json] [--zachowaj]
  --zachowaj: decyzje z istniejącej mapy (pole "zatwierdzone": true przy klasie) nie są nadpisywane.
Wynik: mapa.json + propozycja.md (lista do przejrzenia, przypadki graniczne jako pytania).
"""
import argparse, importlib.util, json, os, re, sqlite3, sys, time
from collections import defaultdict

TU = os.path.dirname(os.path.abspath(__file__))
ROLE = ["wejscie", "aplikacja", "domena", "repozytorium", "pomin"]
ROLE_RYSOWANE = {"wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"}
# klient innego systemu: typy/biblioteki w źródle klasy (HTTP, kolejki, SOAP, gRPC, poczta, chmura) — Java, Python, TS, C#
KLIENT_INNEGO_SYSTEMU = re.compile(
    r"\b(RestTemplate|RestClient|WebClient|OkHttpClient|CloseableHttpClient|HttpURLConnection|HttpClient|IHttpClientFactory|FeignClient|"
    r"KafkaTemplate|JmsTemplate|RabbitTemplate|AmqpTemplate|StreamBridge|SqsTemplate|SnsTemplate|WebServiceTemplate|ManagedChannel|GrpcChannel|"
    r"JavaMailSender|SmtpClient|S3Client|DynamoDbClient|ServiceBusClient|IPublishEndpoint|KafkaProducer|ClientProxy|HttpService|"
    r"requests\.(?:get|post|put|delete|patch|request)|httpx\.|aiohttp\.|boto3\.|pika\.|smtplib\.|redis\.(?:Redis|StrictRedis|from_url)|axios|nodemailer|amqplib|"
    r"Http::(?:get|post|put|patch|delete|withHeaders|acceptJson|timeout|retry|baseUrl|asJson|asForm)|GuzzleHttp|curl_exec|SoapClient|"
    r"httpClient->(?:post\w*|get\w*|put\w*|delete|patch|send\w*|request)|"
    # PHP: ext-amqp / php-amqplib / rdkafka — połączenie z brokerem tworzone w klasie (new AMQPConnection, new AMQPChannel…)
    r"new\s+\\?AMQP(?:Stream|SSL|Lazy)?(?:Connection|Channel|Exchange)|PhpAmqpLib\\\w+|new\s+\\?RdKafka\\(?:Producer|KafkaConsumer))\b")
# kompozycja / rejestracja DI — wymienia klasy klientów, ale sama nie woła innych systemów
ROZRUCH_DI = re.compile(r"(Provider|ServiceProvider|Container|Registry|Bootstrap\w*|Startup|Module|Installer|Registrar)\b|\bServiceProviderInterface\b")


def bez_napisow(tekst):
    """Literały napisów → '' (nazwa klasy w napisie, np. rejestracja 'HttpClient' w kontenerze, to nie użycie)."""
    return re.sub(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"", "''", tekst)


TRYWIALNE = {"equals", "hashCode", "toString", "compareTo", "canEqual", "builder", "main",
             "Equals", "GetHashCode", "ToString", "CompareTo", "Deconstruct", "PrintMembers", "Main",          # C#
             "__toString", "__get", "__set", "__isset", "__unset", "__clone", "__destruct", "__sleep", "__wakeup",  # PHP
             "__serialize", "__unserialize", "__debugInfo", "__set_state"}


# ---------------------------------------------------------------- reguły
def wczytaj_reguly():
    reguly = []
    for f in sorted(os.listdir(os.path.join(TU, "reguly"))):
        if not f.endswith(".py") or f.startswith("_"): continue
        spec = importlib.util.spec_from_file_location("reguly_" + f[:-3], os.path.join(TU, "reguly", f))
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        reguly.append(m)
    return sorted(reguly, key=lambda m: m.ORDER)


# ---------------------------------------------------------------- model projektu z CodeGraph
class Projekt:
    def __init__(self, repo):
        self.repo = os.path.abspath(repo)
        _REPO_PY[0] = self.repo
        db =os.path.join(self.repo, ".codegraph", "codegraph.db")
        if not os.path.exists(db):
            sys.exit(f"Brak indeksu CodeGraph: {db}. Uruchom `codegraph init {self.repo}`.")
        self.c = sqlite3.connect(db)
        self._zrodla = {}
        self.klasy = {}       # klucz (plik#qn) -> klasa
        self.metody = {}      # id -> (klucz klasy, nazwa)
        self._wczytaj()

    def zrodlo(self, plik):
        if plik not in self._zrodla:
            try:
                with open(os.path.join(self.repo, plik), encoding="utf-8", errors="replace") as f:
                    self._zrodla[plik] = f.read().split("\n")
            except OSError:
                self._zrodla[plik] = []
        return self._zrodla[plik]

    def adnotacje_nad(self, plik, linia):
        """Adnotacje deklaracji — CodeGraph ich nie zapisuje. Jego linia początku bywa linią pierwszej adnotacji
        (@Service), więc zbieramy też w dół, aż do linii z samą deklaracją, i w górę nad nią."""
        l = self.zrodlo(plik)
        wynik = []
        j = linia - 1
        while 0 <= j < len(l) and j < linia + 8:
            s = l[j].strip()
            if s.startswith("@"):
                wynik += re.findall(r"@(\w+)", s.split("(")[0] if s.count("(") else s); j += 1; continue
            if not s or s.startswith("//") or s.startswith("*") or s.startswith("/*") or s.startswith(")"):
                j += 1; continue
            break
        wynik, k = wynik, linia - 1
        tekst = l[k] if 0 <= k < len(l) else ""
        wynik += re.findall(r"@(\w+)", tekst.split("(")[0] if "class " not in tekst else tekst.split("class ")[0])
        k -= 1
        while k >= 0:
            s = l[k].strip()
            if not s or s.startswith("//") or s.startswith("*") or s.startswith("/*"):
                if s.startswith("*/") or s.startswith("/**") or s.startswith("*") or s.startswith("//") or not s:
                    k -= 1; continue
            if s.startswith("@") or (s.endswith(")") and "@" in "".join(l[max(0, k - 3):k + 1])) or s.startswith('"') or s.startswith("}"):
                if s.startswith("}") and not s.startswith("})"): break
                wynik += re.findall(r"@(\w+)", s); k -= 1; continue
            break
        return wynik

    def adnotacje_metody(self, plik, linia, jezyk):
        if jezyk == "python":                                   # dekoratory w kilku liniach: @router.post(\n "…",\n)
            nazwy = re.findall(r"^\s*@\s*([\w.]+)", dekoratory_py(self.zrodlo(plik), linia), re.M)
            return [x for n in nazwy for x in (n, *n.split("."))]          # @admin.action → admin.action, admin, action
        return self.adnotacje_nad(plik, linia)

    def _wczytaj(self):
        q = self.c.execute
        for id_, kind, name, qn, plik, sl, el, vis, sig, stat, abst, jezyk in q(
                "select id, kind, name, qualified_name, file_path, start_line, end_line, visibility, signature, is_static, is_abstract, language "
                f"from nodes where kind in ('class','interface','enum','record') and language in ({JEZYKI_SQL})"):
            if testowy(plik) or obcy(plik): continue
            # klasy anonimowe i lokalne (CodeGraph: Klasa::metoda::<Typ$anon@32>) — JVM nazywa je Klasa$1, pomijamy
            if not all(re.fullmatch(r"[\w.\\]+", cz) for cz in qn.split("::")): continue
            dekl = deklaracja(self.zrodlo(plik), sl, name)
            pelna = fqn(qn, plik, jezyk)
            self.klasy[f"{plik}#{qn}"] = dict(
                id=id_, qn=qn, rodzaj=kind, nazwa=name, plik=plik, linia=sl, koniec=el, jezyk=jezyk,
                pakiet=pelna.rsplit(".", 1)[0], fqn=pelna, modul=plik.split("/")[0],
                adnotacje=set(self.adnotacje_nad(plik, sl)),
                bazowe=(re.search(r"\bclass\s+\w+\s*\(([^)]*)\)", dekl) or [None, ""])[1] if jezyk == "python"
                       else bazowe_php(dekl) if jezyk == "php"
                       else (re.search(r"\bextends\s+([\w.]+)", dekl) or [None, ""])[1] if jezyk in ("typescript", "javascript")
                       else (re.search(r"\b(?:class|record)\s+\w+(?:<[^>]*>)?\s*(?:\((?:[^()]|\([^()]*\))*\))?\s*:\s*([^{;]+)", dekl) or [None, ""])[1] if jezyk == "csharp" else "",
                rozszerza=(re.search(r"\bextends\s+([\w.<>, ]+?)(?:\s+implements|\s*\{|$)", dekl) or [None, ""])[1].strip(),
                implementuje=(re.search(r"\bimplements\s+([\w.<>, ]+?)\s*\{", dekl) or [None, ""])[1].strip(),
                record=bool(re.search(r"\brecord\s+" + re.escape(name) + r"\b", dekl)),
                abstrakcyjna=bool(abst) or " abstract " in f" {dekl} ",
                metody=[])
        for id_, name, qn, plik, sl, el, vis, sig, stat, abst in q(
                "select id, name, qualified_name, file_path, start_line, end_line, visibility, signature, is_static, is_abstract "
                f"from nodes where kind='method' and language in ({JEZYKI_SQL})"):
            kq = f"{plik}#{qn.rsplit('::', 1)[0]}"
            k = self.klasy.get(kq)
            if not k: continue
            self.metody[id_] = (kq, name)
            k["metody"].append(dict(id=id_, nazwa=name, linia=sl, koniec=el, widocznosc=vis or "",
                                    statyczna=bool(stat), abstrakcyjna=bool(abst) or (sig or "").rstrip().endswith(";"), sygnatura=sig or "",
                                    adnotacje=set(self.adnotacje_metody(plik, sl, k["jezyk"])),
                                    cialo="\n".join(self.zrodlo(plik)[sl - 1:el])))
        # Python: funkcje modułu (trasy FastAPI/Flask, zależności Depends, zadania, serwisy/selektory); JS/TS: eksportowane
        # funkcje modułu (export const createArticle = async …) — jako metody „klasy-modułu” o nazwie modułu,
        # w przebiegu i w mapie zachowują się jak metody klas
        kolumny = {r[1] for r in q("pragma table_info(nodes)")}
        eksport = "is_exported" if "is_exported" in kolumny else "1"
        for id_, name, qn, plik, sl, el, jezyk, eksp in q(f"select id, name, qualified_name, file_path, start_line, end_line, language, {eksport} "
                                                         "from nodes where kind='function' and language in ('python','typescript','javascript')"):
            if "::" in qn or "." in qn or name.startswith("<") or testowy(plik) or obcy(plik): continue
            if jezyk != "python" and (not eksp or re.search(r"(^|/)(dist|build|out|coverage)/|\.d\.ts$|\.config\.[mc]?[jt]s$", plik)): continue
            mod = modul_pythona(plik) if jezyk == "python" else re.sub(r"\.(m|c)?[jt]sx?$", "", plik).replace("/", ".")
            kq = f"{plik}#{mod}"
            if kq not in self.klasy:
                self.klasy[kq] = dict(id=f"modul:{plik}", qn=mod, rodzaj="modul", nazwa=mod.split(".")[-1] if jezyk == "python" else os.path.basename(plik).rsplit(".", 1)[0],
                                      plik=plik, linia=1, koniec=len(self.zrodlo(plik)), jezyk=jezyk, pakiet=mod.rsplit(".", 1)[0], fqn=mod,
                                      modul=plik.split("/")[0], adnotacje=set(), bazowe="", rozszerza="", implementuje="",
                                      record=False, abstrakcyjna=False, metody=[])
            self.metody[id_] = (kq, name)
            self.klasy[kq]["metody"].append(dict(id=id_, nazwa=name, linia=sl, koniec=el, widocznosc="public", statyczna=True,
                                                 abstrakcyjna=False, adnotacje=set(self.adnotacje_metody(plik, sl, jezyk)),
                                                 cialo="\n".join(self.zrodlo(plik)[sl - 1:el])))
        # pola klasy (i składowe rekordu) — metoda o nazwie pola i krótkim ciele to akcesor, nie krok przebiegu
        for qn, plik in q(f"select qualified_name, file_path from nodes where kind in ('field','property') and language in ({JEZYKI_SQL})"):
            if "::" not in qn: continue
            kq, n = qn.rsplit("::", 1)
            kq = f"{plik}#{kq}"
            if kq in self.klasy: self.klasy[kq].setdefault("pola", set()).add(n)
        for k in self.klasy.values():
            dekl = " ".join(self.zrodlo(k["plik"])[k["linia"] - 1:k["linia"] + 3])
            m = re.search(r"\brecord\s+\w+\s*(?:<[^>]*>)?\s*\(([^)]*)\)", dekl)
            if m: k.setdefault("pola", set()).update(re.findall(r"(\w+)\s*(?:,|$)", m.group(1).strip()))
        # klasy bazowe przechodnio w obrębie projektu (Python/TS/C#: WypozyczeniaView → Api → View) — reguły
        # sprawdzają nazwy bazowych frameworka, a bezpośrednia bazowa bywa własną klasą pośrednią
        po_nazwie = {}
        for k in self.klasy.values(): po_nazwie.setdefault(k["nazwa"], k)
        for k in self.klasy.values():
            if not k.get("bazowe"): continue
            widziane, kolejka, dopisane = {k["nazwa"]}, [b.strip().split("[")[0].split("<")[0].split(".")[-1] for b in k["bazowe"].split(",")], []
            while kolejka:
                n = kolejka.pop()
                if n in widziane or n not in po_nazwie: continue
                widziane.add(n)
                nad = po_nazwie[n].get("bazowe", "")
                if nad:
                    dopisane.append(nad)
                    kolejka += [b.strip().split("[")[0].split("<")[0].split(".")[-1] for b in nad.split(",")]
            if dopisane: k["bazowe"] = ", ".join([k["bazowe"], *dopisane])
        # klasy zagnieżdżone: adnotacje klasy zewnętrznej (Java: klasa pomocnicza w @Configuration to infrastruktura)
        for k in self.klasy.values():
            cz = k["qn"].split("::")
            if len(cz) > 2 and k["jezyk"] == "java":
                zew = self.klasy.get(f'{k["plik"]}#{"::".join(cz[:-1])}')
                if zew: k["adnotacje_zewn"] = zew["adnotacje"] | zew.get("adnotacje_zewn", set())
        self._spring()
        # krawędzie klasa → klasa (wywołania) i interfejs → implementacje
        self.wywolania = defaultdict(set)
        for s, t in q("select source, target from edges where kind='calls'"):
            a, b = self.metody.get(s), self.metody.get(t)
            if a and b and a[0] != b[0]: self.wywolania[a[0]].add(b[0])
        id2qn = {k["id"]: qn for qn, k in self.klasy.items()}
        self.implementacje = defaultdict(set)
        for s, t in q("select source, target from edges where kind in ('implements','extends')"):
            if s in id2qn and t in id2qn: self.implementacje[id2qn[t]].add(id2qn[s])

    def _spring(self):
        """Spring (Java): beany spoza skanu komponentów — typy zwracane przez metody @Bean i new X(…) w klasach
        @Configuration, class="…" w XML — oraz @Profile klas względem aktywnych profili (env SPRING_PROFILES_ACTIVE,
        application*.properties / *.yml). Bez aktywnego profilu nie odrzucamy niczego."""
        java = [k for k in self.klasy.values() if k["jezyk"] == "java"]
        if not java: return
        self.beany = set()
        for k in java:
            if "Configuration" not in k["adnotacje"] and "SpringBootConfiguration" not in k["adnotacje"]: continue
            tekst = "\n".join(self.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])
            self.beany |= set(re.findall(r"@Bean\b[^\n]*\n(?:\s*@[^\n]*\n)*\s*(?:public\s+|protected\s+|private\s+|static\s+)*(\w+)(?:<[^>]*>)?\s+\w+\s*\(", tekst))
            self.beany |= set(re.findall(r"\bnew\s+(\w+)\s*(?:<[^>]*>)?\(", tekst))
        profile_xml = []                                                  # (profile bloku, pakiet skanu | None, klasa | None)
        for d, _, fs in os.walk(self.repo):
            if "/." in d or "/target" in d or "node_modules" in d or "/test" in d: continue
            for f in fs:
                if not f.endswith(".xml") or f == "pom.xml": continue
                try: x = czytaj(os.path.join(d, f))
                except OSError: continue
                if "<bean" in x: self.beany |= {c.split(".")[-1].split("$")[-1] for c in re.findall(r'<bean\b[^>]*\bclass="([\w.$]+)"', x)}
                profile_xml += profile_xml_springa(x)
        self.profile_aktywne = profile_springa(self.repo, list(dict.fromkeys(k["plik"] for k in java)))
        for k in java:
            if "Profile" not in k["adnotacje"]: continue
            tekst = " ".join(self.zrodlo(k["plik"])[max(0, k["linia"] - 8):k["linia"] + 3])
            m = re.search(r"@Profile\s*\(\s*(?:value\s*=\s*)?\{?([^)}]*)", tekst)
            if not m: continue
            k["profil"] = re.findall(r'"([^"]+)"', m.group(1))
            if self.profile_aktywne is not None and k["profil"] and not profil_aktywny(k["profil"], self.profile_aktywne):
                k["nieaktywny_profil"] = True
        # XML: <beans profile="jpa"> z <context:component-scan base-package="…jpa"/> / <jpa:repositories …/> / <bean class>
        # — klasy z tego pakietu (i beany) istnieją tylko przy aktywnym profilu bloku (spring-framework-petclinic)
        for k in java:
            if k.get("profil"): continue
            prof = [p_ for p_, pak, kl in profile_xml if (pak and (k["pakiet"] + ".").startswith(pak + ".")) or kl == k["fqn"]]
            if not prof: continue
            k["profil"] = sorted({x for p_ in prof for x in p_})
            if self.profile_aktywne is not None and not any(profil_aktywny(p_, self.profile_aktywne) for p_ in prof):
                k["nieaktywny_profil"] = True

    def tekst(self):
        """Próbka źródeł do DETECT reguł."""
        pliki = list({k["plik"] for k in self.klasy.values()})[:400]
        return "\n".join("\n".join(self.zrodlo(p)[:40]) for p in pliki)


def czytaj(sciezka):
    with open(sciezka, encoding="utf-8", errors="replace") as f: return f.read()


def profile_xml_springa(x):
    """Bloki <beans profile="a,b"> w XML Springa → [(profile, pakiet skanu | None, klasa beana | None)]: pakiety z
    <context:component-scan base-package> i <jpa:repositories base-package>, klasy z <bean class>."""
    wynik = []
    for prof, blok in re.findall(r'<beans\b[^>]*\bprofile="([^"]+)"[^>]*>(.*?)</beans>', re.sub(r"<!--.*?-->", "", x, flags=re.S), re.S):
        p_ = [s.strip() for s in prof.split(",") if s.strip()]
        for pak in re.findall(r'<[\w:]*(?:component-scan|repositories)\b[^>]*\bbase-package="([^"]+)"', blok):
            wynik += [(p_, s.strip(), None) for s in re.split(r"[,;\s]+", pak) if s.strip()]
        wynik += [(p_, None, c.replace("$", ".")) for c in re.findall(r'<bean\b[^>]*\bclass="([\w.$]+)"', blok)]
    return wynik


def profile_springa(repo, pliki_java=None):
    """Aktywne profile Springa: SPRING_PROFILES_ACTIVE ze środowiska, inaczej spring.profiles.active z application*.properties
    / application*.yml w src/main/resources (pierwsze trafienie), inaczej domyślne / aktywne profile ustawione w kodzie
    (getEnvironment().setDefaultProfiles(SPRING_PROFILE) / setActiveProfiles("jpa"), stała z tego samego pliku) albo
    w web.xml (context-param spring.profiles.active / spring.profiles.default). None — nie wiadomo (wtedy nie filtrujemy)."""
    env = os.environ.get("SPRING_PROFILES_ACTIVE")
    if env: return {x.strip() for x in env.split(",") if x.strip()}
    wynik = _profile_z_plikow(repo)
    if wynik is not None: return wynik
    for plik in pliki_java or ():
        try: t = czytaj(os.path.join(repo, plik))
        except OSError: continue
        m = re.search(r"\.set(?:Active|Default)Profiles\(\s*([^)]*)\)", t)
        if not m: continue
        stale = dict(re.findall(r"\bString\s+(\w+)\s*=\s*\"([^\"]*)\"", t))
        nazwy = [a.strip().strip('"') if a.strip().startswith('"') else stale.get(a.strip().split(".")[-1], "") for a in m.group(1).split(",")]
        if any(nazwy): return {n for n in nazwy if n}
    for d, _, fs in os.walk(repo):
        if "/." in d or "/target" in d or "node_modules" in d: continue
        if "web.xml" in fs:
            m = re.search(r"<param-name>\s*spring\.profiles\.(?:active|default)\s*</param-name>\s*<param-value>\s*([^<]+)</param-value>", czytaj(os.path.join(d, "web.xml")))
            if m: return {x.strip() for x in m.group(1).split(",") if x.strip()}
    return None


def _profile_z_plikow(repo):
    for d, _, fs in os.walk(repo):
        if "/." in d or "/target" in d or "/test" in d or "node_modules" in d: continue
        for f in sorted(fs):
            if not re.fullmatch(r"application(-\w+)?\.(properties|ya?ml)|bootstrap\.(properties|ya?ml)", f) or "-" in f: continue
            try: t = czytaj(os.path.join(d, f))
            except OSError: continue
            m = re.search(r"^\s*spring\.profiles\.active\s*[=:]\s*([^\n#]+)", t, re.M) or \
                re.search(r"^spring:\s*\n(?:[ \t]+.*\n)*?[ \t]+profiles:\s*\n(?:[ \t]+.*\n)*?[ \t]+active:\s*([^\n#]+)", t, re.M)
            if m:
                w = m.group(1).strip().strip("'\"")
                w = re.sub(r"\$\{[^:}]+:([^}]*)\}", r"\1", w)            # ${SPRING_PROFILES:dev} → dev
                return {x.strip() for x in w.split(",") if x.strip()}
    return None


def profil_aktywny(wyrazenia, aktywne):
    """@Profile("a"), @Profile({"a","b"}) (dowolny), @Profile("!a") — bez wyrażeń złożonych (&, |)."""
    for w in wyrazenia:
        w = w.strip()
        if w.startswith("!") and w[1:] not in aktywne: return True
        if not w.startswith("!") and (w in aktywne or ("default" == w and not aktywne)): return True
    return False


JEZYKI = ("java", "python", "typescript", "javascript", "csharp", "php")
JEZYKI_SQL = ",".join(f"'{j}'" for j in JEZYKI)


def dekoratory_py(linie, linia):
    """Blok dekoratorów nad def (linia = numer linii def, od 1), także rozpisanych na kilka linii:
    idziemy w górę, licząc nawiasy — linia z „@” przy zerowym bilansie zaczyna dekorator."""
    if not linie or linia < 1: return ""
    i, bilans, gora = linia - 2, 0, linia - 1
    # CodeGraph bywa, że zaczyna funkcję od dekoratora — wtedy blok leży od linii startu do def
    if 0 <= linia - 1 < len(linie) and linie[linia - 1].lstrip().startswith("@"):
        j = linia - 1
        while j < len(linie) and not re.match(r"\s*(async\s+)?def\s", linie[j]) and j < linia + 30: j += 1
        return "\n".join(linie[linia - 1:j])
    while i >= 0 and linia - 1 - i <= 40:
        l = re.sub(r"#.*$", "", linie[i]) if not re.search(r"[\'\"]", linie[i]) else linie[i]
        bilans += l.count(")") + l.count("]") + l.count("}") - l.count("(") - l.count("[") - l.count("{")
        s = l.strip()
        if bilans <= 0 and s.startswith("@"): gora, bilans = i, 0
        elif bilans <= 0 and s and not s.startswith("#"): break
        i -= 1
    return "\n".join(linie[gora:linia - 1])


def deklaracja(linie, sl, nazwa):
    """Tekst deklaracji klasy: od linii ze słowem class/interface/record … <nazwa> do „{” (albo „:” w Pythonie).
    CodeGraph zaczyna klasę od pierwszego atrybutu / adnotacji (#[AsCommand(...)] w kilku liniach, @Service), więc
    deklaracji szukamy niżej, pomijając blok atrybutów."""
    if not linie: return ""
    wzor = re.compile(r"\b(?:class|interface|enum|record|trait|struct)\s+" + re.escape(nazwa) + r"\b")
    od = next((i for i in range(max(0, sl - 1), min(len(linie), sl + 40)) if wzor.search(linie[i])), None)
    if od is None: return " ".join(linie[sl - 1:sl + 2])
    wynik = []
    for l in linie[od:od + 10]:
        wynik.append(l)
        if "{" in l or re.search(r"\)\s*:\s*(#.*)?$|^\s*class\s+\w+\s*:", l) or l.rstrip().endswith(";"): break
    return " ".join(wynik)


def bazowe_php(dekl):
    """PHP: „extends X implements Y, Z” → „X Y Z” (z przestrzeniami nazw)."""
    e = re.search(r"\bextends\s+([\w\\]+)", dekl)
    i = re.search(r"\bimplements\s+([\w\\, ]+)", dekl)
    return " ".join(x for x in ((e.group(1) if e else ""), (i.group(1).replace(",", " ") if i else "")) if x)


def testowy(plik):
    """Testy każdego rodzaju: jednostkowe, integracyjne (src/integration-test, *IT), obciążeniowe (loadtests/, locust), e2e."""
    return bool(re.search(r"(^|/)(src/(?:\w+-)?[tT]est[\w-]*|test|tests|spec|__tests__|e2e|loadtests?|load-tests?|integrationtests?|integration-tests?)/"
                          r"|\.Tests?/|(^|/)test_[^/]*\.py$|_test\.py$|(^|/)(conftest|locustfile\w*)\.py$|(Tests?|IT)\.(java|groovy|kt)$|\.(test|spec)\.[jt]s$", plik))


def obcy(plik):
    """Kod spoza aplikacji trzymany w repozytorium: biblioteki skopiowane do repo (vendor/, third_party/, PHP libs/)
    i wrappery narzędzi budowania (.mvn/, .gradle/) — nie są krokami przebiegu."""
    return bool(re.search(r"(^|/)(vendor|third_party|third-party|node_modules|bower_components|\.mvn|\.gradle|gradle/wrapper|flowlens|\.flow-lens)/"
                          r"|(^|/)flowlens[_-][\w-]*\.\w+$", plik)
                or plik.endswith(".php") and re.search(r"(^|/)libs/", plik)
                # kod przeglądarki w repozytorium backendu (Laravel resources/js, public/, wwwroot/) — nie biegnie w serwerze
                or re.search(r"\.(m|c)?[jt]sx?$", plik) and re.search(r"(^|/)(resources/(js|assets)|public|static|assets|wwwroot|webapp)/", plik))


_REPO_PY = [None]          # repozytorium ostatniego Projektu — korzeń pakietów Pythona liczony po __init__.py
_KORZENIE_PY = {}


def korzen_pythona(plik, repo=None):
    """Katalog źródeł Pythona (względem repo) dla pliku: rodzic najwyższego katalogu z __init__.py na drodze od repo do
    pliku (backend/app/__init__.py → „backend”, działająca aplikacja z cwd backend ma __name__ „app.*”). Bez __init__.py
    na drodze albo z __init__.py w samym korzeniu repo — None (wtedy konwencja src/, lib/)."""
    repo = repo or _REPO_PY[0]
    if not repo: return None
    czesci = plik.replace("\\", "/").split("/")[:-1]
    klucz = (repo, "/".join(czesci))
    if klucz not in _KORZENIE_PY:
        wynik = None
        if not os.path.exists(os.path.join(repo, "__init__.py")):
            for i in range(len(czesci)):
                if os.path.exists(os.path.join(repo, *czesci[:i + 1], "__init__.py")): wynik = "/".join(czesci[:i]); break
        _KORZENIE_PY[klucz] = wynik
    return _KORZENIE_PY[klucz]


def modul_pythona(plik, repo=None):
    """Nazwa modułu jak __name__ w działającej aplikacji: od katalogu źródeł (korzeń pakietu po __init__.py, inaczej
    bez src/, lib/) i bez .__init__ — ta sama dla klas i funkcji modułu."""
    plik = plik.replace("\\", "/")
    korzen = korzen_pythona(plik, repo)
    plik = plik[len(korzen) + 1:] if korzen else re.sub(r"^(src|lib)/", "", plik)
    return re.sub(r"\.py$", "", plik).replace("/", ".").removesuffix(".__init__")


def fqn(qn, plik="", jezyk="java"):
    """Nazwa klasy tak, jak widzi ją działająca aplikacja (i atrybut code.namespace):
    Java: pkg::Outer::Inner → pkg.Outer$Inner;  Python: plik a/b/c.py + Outer::Inner → a.b.c.Outer.Inner."""
    cz = qn.split("::")
    if jezyk == "python":
        return modul_pythona(plik) + "." + ".".join(cz)
    if jezyk in ("typescript", "javascript"):              # moduł = ścieżka pliku (flow-lens sam owija klasy w Node)
        modul = re.sub(r"\.(m|c)?[jt]sx?$", "", plik).replace("/", ".")
        return modul + "." + ".".join(cz)
    if jezyk == "php":                                     # PHP: App\Audyt::AudytService → App.Audyt.AudytService (hak PHP zamienia „.” na „\”)
        return ".".join(c.replace("\\", ".") for c in cz)
    if jezyk == "csharp":                                  # .NET: klasa zagnieżdżona przez „+” (Type.FullName)
        return cz[0] + "." + "+".join(cz[1:]) if len(cz) > 1 else cz[0]
    return cz[0] + "." + "$".join(cz[1:]) if len(cz) > 1 else cz[0]


# ---------------------------------------------------------------- klasyfikacja i poziomy
def klasyfikuj(p, reguly):
    aktywne = [r for r in reguly if r.DETECT(p)]
    for k in p.klasy.values():
        k["rola"], k["powod"], k["pewnosc"] = "pomin", "żadna reguła nie pasuje", "do potwierdzenia"
        if k["rodzaj"] == "modul":                                    # funkcje modułu (Python, JS/TS)
            w = rola_modulu(p, k)
            if w: k["rola"], k["powod"], k["pewnosc"] = w
            elif k["metody"]:                                         # moduł, który sam woła inny system (redis, HTTP…)
                m = KLIENT_INNEGO_SYSTEMU.search("\n".join(p.zrodlo(k["plik"])))      # klient bywa zmienną modułu (r = redis.Redis())
                if m: k["rola"], k["powod"], k["pewnosc"] = "zewnetrzne", f"klient innego systemu ({m.group(1)})", "do potwierdzenia"
            continue
        if k.get("nieaktywny_profil"):                               # Spring @Profile poza aktywnymi — beana nie ma w runtime
            k["rola"], k["powod"], k["pewnosc"] = "pomin", f"nieaktywny profil {'@Profile' if 'Profile' in k['adnotacje'] else 'Springa z XML'}({', '.join(k['profil'])})", "do potwierdzenia"
            continue
        k["bean"] = k["nazwa"] in getattr(p, "beany", ())                # Spring: bean z @Bean / XML (bez adnotacji stereotypu)
        k["beany_znane"] = bool(getattr(p, "beany", None))
        for r in aktywne:
            if getattr(r, "JEZYK", k["jezyk"]) != {"javascript": "typescript"}.get(k["jezyk"], k["jezyk"]): continue
            w = r.klasyfikuj(k)
            if w:
                k["rola"], k["powod"], k["pewnosc"] = w[0], f"{r.__name__.replace('reguly_', '')}: {w[1]}", w[2]
                break
        # pętla joba: metoda z nieskończoną pętlą i sleep (while True / while(true) / for(;;)) — każda iteracja to osobny
        # przebieg, więc samej pętli nie śledzimy (zamknęłaby jeden „request” na całe życie aplikacji)
        petle = petle_jobow(p, k)
        if petle:
            k["petle"] = petle
            if k["rola"] in ("pomin", "domena", "aplikacja"):
                k["rola"], k["powod"], k["pewnosc"] = "wejscie", f"job (pętla z uśpieniem w {', '.join(sorted(petle))})", "do potwierdzenia"
                continue
        # job bez dekoratora: metoda podana do setInterval / setTimeout / cron.schedule / scheduler.add_job
        if k["nazwa"] in joby_bez_dekoratora(p) and k["rola"] in ("pomin", "domena", "aplikacja"):
            k["rola"], k["powod"], k["pewnosc"] = "wejscie", "job (wywoływany z harmonogramu w kodzie)", "do potwierdzenia"
            continue
        # klasa, która sama woła inny system (HTTP, kolejka, SOAP…), to granica — rysowana jako „inny system”
        # (bez rejestracji DI — ServiceProvider / kontener wymienia typy klientów jako napisy — i bez literałów napisów)
        if k["rola"] in ("pomin", "domena") and not k.get("rodzaj") == "interface" and not ROZRUCH_DI.search(k["nazwa"] + " " + k.get("bazowe", "")):
            m = KLIENT_INNEGO_SYSTEMU.search(bez_napisow("\n".join(p.zrodlo(k["plik"])[k["linia"] - 1:k["koniec"]])))
            if m: k["rola"], k["powod"], k["pewnosc"] = "zewnetrzne", f"klient innego systemu ({m.group(1)})", "do potwierdzenia"
    return [r.__name__.replace("reguly_", "") for r in aktywne]


UNCHECKED = {"RuntimeException", "Error", "IllegalStateException", "IllegalArgumentException", "UnsupportedOperationException",
             "DataAccessException", "PersistenceException", "NoSuchElementException"}
CHECKED = {"Exception", "Throwable", "IOException", "SQLException", "TimeoutException", "ExecutionException"}


def wyjatki(p):
    """Wyjątki aplikacji (Java): unchecked / checked po łańcuchu „extends” — do wnioskowania końca transakcji (Spring:
    rollback przy unchecked, commit przy checked), gdy źródło nie widzi rollbacku (OTel)."""
    po_nazwie = {k["nazwa"]: k for k in p.klasy.values() if k["jezyk"] == "java"}
    wynik = {}
    for k in po_nazwie.values():
        n, widziane = k, set()
        while n and n["nazwa"] not in widziane:
            widziane.add(n["nazwa"])
            # EJB: @ApplicationException(rollback = true) → rollback, bez rollback (domyślnie false) → commit, także
            # dla RuntimeException; adnotacja dziedziczy się (inherited = true domyślnie)
            if "ApplicationException" in n["adnotacje"]:
                wynik[k["fqn"]] = "unchecked" if re.search(r"@ApplicationException\s*\([^)]*\brollback\s*=\s*true", _naglowek_klasy(p, n)) else "checked"
                break
            nad = re.split(r"[<\s,]", n.get("rozszerza", "").strip())[0].split(".")[-1]
            if nad in UNCHECKED: wynik[k["fqn"]] = "unchecked"; break
            if nad in CHECKED: wynik[k["fqn"]] = "checked"; break
            n = po_nazwie.get(nad)
    return wynik


HARMONOGRAM = re.compile(r"\b(?:setInterval|setTimeout|cron\.schedule|schedule\.scheduleJob|scheduler\.add_job|add_job|schedule\.every\([^)]*\)\.[\w.]+\.do|scheduleAtFixedRate|scheduleWithFixedDelay|schedule)\s*\(\s*"
                         r"(?:[^,]*?,\s*)?(?:(?:async\s*)?\(\s*\)\s*(?:=>|->)\s*\{?\s*(?:await\s+)?|lambda\s*:\s*)?(?:this\.)?(\w+)(?:\.|::)(\w+)")
NOWY_OBIEKT = re.compile(r"\b(\w+)\s*=\s*(?:await\s+)?new\s+(\w+)\s*\(|\b(\w+)\s*=\s*([A-Z]\w*)\s*\(")


TRASA_FUNKCJI = re.compile(r"@\s*\w+\.(get|post|put|delete|patch|api_route|route|websocket)\s*\(")
ZADANIE_FUNKCJI = re.compile(r"@\s*(?:\w+\.)?(task|shared_task|scheduled_job|periodic_task|job|cron|actor)\b")
# konsument kolejki / pub-sub: pętla po wiadomościach (redis pubsub.listen(), kafka consumer, pika basic_consume)
PETLA_WIADOMOSCI = re.compile(r"\bfor\s+\w+\s+in\s+[\w.]*\.(?:listen|consume|messages|iter_messages)\s*\(|\bfor\s+\w+\s+in\s+\w*consumer\s*:"
                              r"|\.(?:basic_consume|start_consuming)\s*\(")
# moduły funkcji warstwy aplikacji (HackSoft: services/selectors, cosmicpython: service_layer.handlers, use_cases…)
MODUL_APLIKACJI = re.compile(r"(^|[._-])(services?|selectors?|service_layer|use_?cases?|usecases|interactors?|handlers?|commands|queries|application)([._-]|$)")
MODUL_REPO = re.compile(r"(^|[._-])(repositor(?:y|ies)|repo|dao|store|crud|queries\.sql)([._-]|$)")
# funkcja dostępu do danych: sesja / połączenie w parametrze i operacja ORM na nim (session.exec / add / commit / get…)
FUNKCJA_DANYCH = re.compile(r"\b(session|db|conn|connection|sesja|cursor)\s*\.\s*(exec|execute|add|add_all|commit|get|query|scalars?|scalar_one\w*|"
                            r"delete|merge|refresh|flush|fetch\w*|select)\s*\(")
MODUL_TECH = re.compile(r"(^|[._-])(config|configuration|settings|conf|migrations?|tests?|utils?|helpers?|mappers?|models?|dto|schemas?|types|constants|logging|logger|setup|manage|wsgi|asgi|gunicorn|exception_handlers?|error_handlers?)([._-]|$)")


def zaleznosci_fastapi(p):
    """FastAPI: funkcje podawane do Depends(f) / Security(f) (strażnicy, dostawcy danych) i fabryki zależności —
    funkcje wywoływane w Depends(f(…)) przy imporcie modułu (zwracają właściwą zależność)."""
    if hasattr(p, "_zal"): return p._zal
    zal, fab = set(), set()
    for plik in {k["plik"] for k in p.klasy.values() if k["jezyk"] == "python"}:
        tekst = "\n".join(p.zrodlo(plik))
        if "Depends" not in tekst and "Security" not in tekst: continue
        # Depends(modul.f(…)) — liczy się ostatni człon (nazwa modułu przed kropką to nie zależność)
        for f, nast in re.findall(r"\b(?:Depends|Security)\(\s*(?:dependency\s*=\s*)?(?:\w+\.)*(\w+)\s*([(),=]?)", tekst):
            (fab if nast == "(" else zal).add(f)
    # fabryka zależności zwraca właściwą zależność: return a / return a if … else b — obie funkcje modułu są zależnościami
    for k in p.klasy.values():
        if k["rodzaj"] != "modul" or k["jezyk"] != "python": continue
        nazwy = {m["nazwa"] for m in k["metody"]}
        for m in k["metody"]:
            if m["nazwa"] in fab: zal |= set(zwracane_funkcje(m)) & nazwy
    p._zal = (zal, fab)
    return p._zal


def zwracane_funkcje(m):
    """Nazwy zwracane przez funkcję bez wywołania: return a, return a if warunek else b (obie gałęzie)."""
    wynik = []
    for r in re.findall(r"^\s+return\s+(.+?)\s*(?:#.*)?$", m.get("cialo") or "", re.M):
        w = re.fullmatch(r"(\w+)(?:\s+if\s+.+\s+else\s+(.+))?", r)
        if w: wynik += [x for x in w.groups() if x and re.fullmatch(r"\w+", x)]
    return wynik


def fabryka(m, nazwy_modulu):
    """Funkcja zwracająca inną funkcję (zagnieżdżony def albo funkcja modułu bez wywołania) — fabryka zależności,
    wołana przy imporcie; krokiem przebiegu jest dopiero zwrócona funkcja."""
    cialo = m.get("cialo") or ""
    wew = set(re.findall(r"^\s+(?:async\s+)?def\s+(\w+)", cialo, re.M))
    return any(r in wew or r in nazwy_modulu for r in zwracane_funkcje(m))


def rola_modulu(p, k):
    """Rola modułu z funkcjami: trasy HTTP (FastAPI, Flask) i zadania (Celery, APScheduler), konsumenci kolejek → wejście;
    zależność dostarczająca sesję bazy (yield + Session/sesja/db) → dostęp do danych; zależności FastAPI (Depends)
    i moduły warstwy usług (services/selectors/handlers…) → aplikacja; reszta — pomocnicze (pomijane)."""
    linie = p.zrodlo(k["plik"])
    nazwy = {m["nazwa"] for m in k["metody"]}
    zal, fab = zaleznosci_fastapi(p) if k["jezyk"] == "python" else (set(), set())
    for m in k["metody"]:
        if m["nazwa"] in fab or (k["jezyk"] == "python" and fabryka(m, nazwy)): m["fabryka"] = True
    if k["jezyk"] == "python":
        nad = lambda m: dekoratory_py(linie, m["linia"])
        if any(TRASA_FUNKCJI.search(nad(m)) for m in k["metody"]):
            return "wejscie", "funkcje-trasy HTTP (dekorator routera)", "pewne"
        if any(ZADANIE_FUNKCJI.search(nad(m)) for m in k["metody"]):
            return "wejscie", "funkcje-zadania (Celery / harmonogram)", "do potwierdzenia"
    # konsument: funkcja z pętlą po wiadomościach to cały czas życia procesu — granicą przebiegu jest funkcja
    # wołana w pętli dla każdej wiadomości, więc samej pętli nie śledzimy (jak pętli joba)
    petle = {m["nazwa"] for m in k["metody"] if PETLA_WIADOMOSCI.search(m.get("cialo") or "")}
    if petle:
        k["petle"] = petle
        return "wejscie", f"konsument kolejki / pub-sub (pętla po wiadomościach w {', '.join(sorted(petle))})", "do potwierdzenia"
    petle = petle_jobow(p, k)
    if petle:
        k["petle"] = petle
        return "wejscie", f"job (pętla z uśpieniem w {', '.join(sorted(petle))})", "do potwierdzenia"
    sesja = lambda m: re.search(r"\byield\b", m.get("cialo") or "") and re.search(r"(Session|sesja|session|db|engine|connection)", m.get("cialo") or "")
    if any(sesja(m) for m in k["metody"]):
        # rola per funkcja, gdy w module są też strażnicy (Depends): get_db → repozytorium, get_current_user → aplikacja
        inne = {m["nazwa"]: "aplikacja" for m in k["metody"] if not sesja(m) and m["nazwa"] in zal}
        if inne: k["role_metod"] = {**{m["nazwa"]: "repozytorium" for m in k["metody"] if sesja(m)}, **inne}
        return "repozytorium", "dostawca sesji bazy (zależność z yield)", "do potwierdzenia"
    nazwa = k["fqn"].lower()
    if MODUL_TECH.search(nazwa.rsplit(".", 1)[-1]) or re.search(r"(^|\.)(config|settings|migrations)(\.|$)", nazwa): return None
    if nazwy & zal:
        return "aplikacja", "zależności FastAPI (Depends / Security) — strażnicy i dostawcy danych", "do potwierdzenia"
    if MODUL_REPO.search(nazwa.rsplit(".", 1)[-1]) or k["jezyk"] == "python" and re.search(r"(^|\.)crud(\.|$)", nazwa):
        return "repozytorium", "moduł funkcji dostępu do danych (*.repository / dao / crud)", "do potwierdzenia"
    if MODUL_APLIKACJI.search(nazwa.rsplit(".", 1)[-1] if k["jezyk"] != "python" else nazwa):
        return "aplikacja", "funkcje modułu warstwy usług (services / selectors / handlers / use cases)", "do potwierdzenia"
    if k["jezyk"] == "python" and any(re.search(r"^\s*@\s*transaction\.atomic", dekoratory_py(linie, m["linia"]), re.M) for m in k["metody"]):
        return "aplikacja", "funkcje z @transaction.atomic", "do potwierdzenia"
    # moduł views z funkcjami bez requestu (cosmicpython: views.allocations(orderid, uow)) — zapytania modelu odczytu;
    # widoki Django (def widok(request, …)) to wejścia z urls.py, nie warstwa aplikacji
    if k["jezyk"] == "python" and re.search(r"(^|\.)views$", nazwa) and not any(
            re.search(r"\bdef\s+\w+\s*\(\s*(request|req)\b", m.get("cialo") or "") for m in k["metody"]):
        return "aplikacja", "zapytania modelu odczytu (views bez requestu)", "do potwierdzenia"
    # moduł funkcji, z których każda dostaje sesję / połączenie i robi na nim operację ORM (FastAPI: crud.create_user(*, session, …))
    publiczne = [m for m in k["metody"] if not m["nazwa"].startswith("_") and not m.get("fabryka")]
    if k["jezyk"] == "python" and publiczne and all(dane_funkcji(m) for m in publiczne):
        return "repozytorium", "funkcje dostępu do danych (sesja w parametrze, operacje ORM)", "do potwierdzenia"
    return None


def dane_funkcji(m):
    """Funkcja z sesją / połączeniem w parametrach, która woła na nim operację dostępu do danych."""
    cialo = m.get("cialo") or ""
    sygn = re.search(r"\bdef\s+\w+\s*\(((?:[^()]|\([^()]*\))*)\)", cialo)
    if not sygn: return False
    prm = {re.split(r"[\s:=]", x.strip().lstrip("*"))[0] for x in sygn.group(1).split(",")}
    return any(r.group(1) in prm for r in FUNKCJA_DANYCH.finditer(cialo[sygn.end():]))


PETLA = re.compile(r"\bwhile\s*(?:\(\s*)?(?:True|true|1)\s*\)?\s*[:{]|\bfor\s*\(\s*;\s*;\s*\)")
# .NET: pętla na PeriodicTimer (czeka sama, bez osobnego uśpienia)
PETLA_ZEGARA = re.compile(r"\bwhile\s*\(\s*await\s+[\w.]+\.WaitForNextTickAsync\b")
USPIENIE = re.compile(r"\b(?:asyncio\.sleep|time\.sleep|sleep|Thread\.sleep|TimeUnit\.\w+\.sleep|setTimeout|Task\.Delay|delay)\s*\(")


def petle_jobow(p, k):
    linie = p.zrodlo(k["plik"])
    wynik = set()
    for m in k["metody"]:
        cialo = "\n".join(linie[m["linia"] - 1:m["koniec"]])
        if PETLA.search(cialo) and USPIENIE.search(cialo) or PETLA_ZEGARA.search(cialo): wynik.add(m["nazwa"])
    return wynik


def joby_bez_dekoratora(p):
    """Klasy, których metody uruchamia harmonogram w kodzie (Node setInterval/cron, Python APScheduler/schedule)."""
    if hasattr(p, "_joby"): return p._joby
    p._joby = set()
    pliki = {k["plik"] for k in p.klasy.values()} | {os.path.relpath(os.path.join(d, f), p.repo) for d, _, fs in os.walk(p.repo)
             if "node_modules" not in d and "/." not in d and "venv" not in d for f in fs if f.endswith((".js", ".ts", ".mjs", ".py"))}
    nazwy = {k["nazwa"] for k in p.klasy.values()}
    for plik in pliki:
        tekst = "\n".join(p.zrodlo(plik))
        if not HARMONOGRAM.search(tekst) and not re.search(r"\b(?:schedule\w*|setInterval|setTimeout)\s*\(", tekst): continue
        zmienne = {}
        for m in NOWY_OBIEKT.finditer(tekst):
            zm, kl = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            zmienne[zm] = kl
        for zm, met in HARMONOGRAM.findall(tekst):
            kl = zmienne.get(zm) or (zm[0].upper() + zm[1:] if zm[0].upper() + zm[1:] in nazwy else None)
            if kl in nazwy: p._joby.add(kl)
        # harmonogram w samej klasie: setInterval(() => this.wyslij(), …) — jobem jest klasa zawierająca tę linię
        # (Java: scheduleWithFixedDelay(this::m, …), schedule(new TimerTask() { run() {…} }), lambda () -> this.m())
        for m in re.finditer(r"\b(?:setInterval|setTimeout|cron\.schedule|schedule\.scheduleJob)\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{?\s*(?:await\s+)?this\.\w+\s*\("
                             r"|\b(?:schedule\w*|submit|execute)\s*\(\s*(?:this::\w+|new\s+TimerTask\s*\(\s*\)\s*\{|\(\s*\)\s*->\s*(?:this\.)?\w+\s*\()", tekst):
            linia = tekst.count("\n", 0, m.start()) + 1
            for k in p.klasy.values():
                if k["plik"] == plik and k["linia"] <= linia <= k["koniec"]: p._joby.add(k["nazwa"])
    return p._joby


def poziomy(p):
    """Wyżej = bliżej wejścia. wejście 0, aplikacja 1, domena 2..n wg najdłuższej ścieżki wywołań, repozytorium na dole."""
    rola = {qn: k["rola"] for qn, k in p.klasy.items()}
    def cele(qn):
        for t in p.wywolania.get(qn, ()):
            yield t
            yield from p.implementacje.get(t, ())   # wywołanie przez interfejs → implementacje
    dom = [qn for qn, r in rola.items() if r == "domena"]
    poz = {qn: 2 for qn in dom}
    for _ in range(8):                               # relaksacja z limitem — cykle nie zapętlą
        zmiana = False
        for a in dom:
            for b in cele(a):
                if rola.get(b) == "domena" and b != a and poz[b] < min(poz[a] + 1, 9):
                    poz[b] = poz[a] + 1; zmiana = True
        if not zmiana: break
    dol = max(poz.values(), default=2) + 1
    for qn, k in p.klasy.items():
        k["poziom"] = {"wejscie": 0, "aplikacja": 1, "repozytorium": dol}.get(k["rola"], poz.get(qn))


# adnotacje / dekoratory metody wejścia: trasa HTTP, handler wiadomości — taka metoda nigdy nie jest akcesorem
ADNOTACJE_WEJSCIA = re.compile(r"^(Get|Post|Put|Delete|Patch|All|Head|Options|\w*Mapping|Route|Http\w+|MessagePattern|EventPattern|"
                               r"\w*Listener|Scheduled|Cron|Interval|Timeout|OnEvent|Process|WebMethod|action|task|shared_task|"
                               r"router|app|bp|blueprint|api)$")


def cialo_bez_sygnatury(m):
    """Ciało metody po sygnaturze: za „{” / „=>” po liście parametrów albo za „:” kończącym def (Python)."""
    t = m.get("cialo") or ""
    py = re.search(r"\bdef\s+\w+\s*\((?:[^()]|\([^()]*\))*\)\s*(?:->[^:]+)?:", t)
    if py: return t[py.end():]
    nawias = re.search(r"\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)", t)
    od = nawias.end() if nawias else 0
    c = re.search(r"\{|=>", t[od:])
    return t[od + c.end():] if c else ""


def trywialny_akcesor(k, m):
    """Getter/setter/is/has/with do 3 linii, którego ciało tylko zwraca albo ustawia pole (return this.x; / $this->x = $x;
    / return self._x) — bez wywołań innych obiektów. get*, które woła repozytorium (return $this->db->table(…)->findOne();
    return mapper.getItem(id)), to krok przebiegu. Metoda z adnotacją wejścia (@Get, @GetMapping…) nigdy nie jest akcesorem."""
    n = m["nazwa"]
    if m["koniec"] - m["linia"] > 3: return False
    if not (re.match(r"^(get|set|is|has|with)[A-Z_]", n) or n in k.get("pola", ())): return False
    if any(ADNOTACJE_WEJSCIA.match(a) for a in m["adnotacje"]): return False
    if "cialo" not in m: return True                                   # bez źródła: dawna heurystyka po nazwie
    cialo = re.sub(r"\bnew\s+[\w.<>]+\s*\(", "(", cialo_bez_sygnatury(m))         # konstruktor wartości to nie krok
    # wywołania w ciele: odbiorca (pole / zmienna / this) i nazwa metody
    for odb, nazwa in re.findall(r"(?:([\w$]+)\s*(?:\.|->|::|\?\.)\s*)?\b([A-Za-z_]\w*)\s*\(", cialo):
        if nazwa in ("return", "if", "for", "while", "switch", "catch", "function", "fn", "lambda", "await"): continue
        if nazwa in TANIE: continue                                       # String/kolekcje/Optional na własnym polu
        if re.match(r"^(get|is|has|set)[A-Z]\w*$", nazwa) and not ZALEZNOSC.search(odb or ""): continue   # akcesor obiektu-wartości
        return False
    return True


# metody biblioteki standardowej na własnym polu — getter z nimi dalej jest akcesorem (return name.trim(); items.size())
TANIE = {"trim", "strip", "size", "length", "isEmpty", "iterator", "contains", "containsKey", "equals", "toString", "toUpperCase",
         "toLowerCase", "stream", "values", "keySet", "entrySet", "clone", "intValue", "longValue", "doubleValue", "booleanValue",
         "compareTo", "hashCode", "name", "ordinal", "unmodifiableList", "unmodifiableSet", "unmodifiableMap", "unmodifiableCollection",
         "copyOf", "of", "ofNullable", "valueOf", "emptyList", "emptySet", "emptyMap", "asList", "requireNonNull", "isPresent",
         "orElse", "orElseThrow", "map", "toList", "ToList", "ToString", "Any", "Count", "count", "len", "str", "int", "bool", "list",
         "dict", "tuple", "set", "frozenset", "sorted", "format", "isset", "empty", "strtolower", "strtoupper", "array",
         "t", "e", "_", "__", "gettext", "sprintf", "in_array", "array_keys", "array_values", "array_merge", "intval", "strval",
         "json_encode", "json_decode", "implode", "explode", "is_null", "is_array"}
# odbiorca-zależność (mapper, repozytorium, serwis, klient…) — wywołanie na nim to krok przebiegu, nie akcesor
ZALEZNOSC = re.compile(r"(?i)(mapper|repository|repo|dao|service|client|gateway|facade|db|em|entitymanager|session|template|jdbc|"
                       r"query|queries|store|provider|api|http|model|manager|handler|container|registry|factory|executor|processor|bus)$")


def metody_do_instrumentacji(k):
    """Metody, w które wejście ma być krokiem: bez konstruktorów, trywialnych getterów/setterów, abstrakcyjnych,
    metod technicznych (equals/hashCode/toString, operatory, magiczne PHP) i fabryk zależności (wołanych przy imporcie)."""
    wynik = []
    for m in k["metody"]:
        n = m["nazwa"]
        if m["abstrakcyjna"] or n == k["nazwa"] or n in ("constructor", "__init__", "__construct") or n in TRYWIALNE or n.startswith("lambda$") or re.fullmatch(r"__\w+__", n): continue
        if n.startswith(("op_", "operator")) or m.get("fabryka"): continue
        if "property" in m["adnotacje"] or "InitBinder" in m["adnotacje"]: continue   # @InitBinder: konfiguracja bindera
        if trywialny_akcesor(k, m): continue
        wynik.append(n)
    return sorted(set(wynik))


BEZ_TX = {"NOT_SUPPORTED", "NEVER", "SUPPORTS"}      # EJB / Jakarta TxType: metoda nie otwiera transakcji


def _nad_metoda(linie, m):
    """Tekst adnotacji tej metody: od końca poprzedniej składowej („;”, „{”, „}”) do deklaracji. CodeGraph zaczyna
    metodę od pierwszej adnotacji albo od deklaracji — deklaracji szukamy od linii startu w dół."""
    dekl = next((i for i in range(max(0, m["linia"] - 1), min(len(linie), m["linia"] + 10))
                 if re.search(r"\b" + re.escape(m["nazwa"]) + r"\s*\(", linie[i]) and not linie[i].lstrip().startswith("@")), m["linia"])
    nad = "\n".join(linie[max(0, m["linia"] - 8):dekl])
    maska = re.sub(r"\((?:[^()]|\([^()]*\))*\)", lambda x: " " * len(x.group(0)), nad)   # @X({…}) to nie koniec składowej
    return nad[max(maska.rfind(";"), maska.rfind("}"), maska.rfind("{")) + 1:]


def _naglowek_klasy(p, k):
    linie = p.zrodlo(k["plik"])
    do = next((i for i in range(max(0, k["linia"] - 1), min(len(linie), k["linia"] + 30))
               if re.search(r"\b(class|interface)\s+" + re.escape(k["nazwa"]) + r"\b", linie[i])), k["linia"] - 1)
    return "\n".join(linie[max(0, k["linia"] - 8):do + 1])


def _typ_tx(tekst):
    """@TransactionAttribute(TransactionAttributeType.X) / @Transactional(TxType.X) / @Transactional(value = Transactional.TxType.X)."""
    m = re.search(r"@(?:javax\.ejb\.|jakarta\.ejb\.)?TransactionAttribute\s*\(\s*(?:value\s*=\s*)?(?:[\w.]*TransactionAttributeType\.)?(\w+)", tekst) \
        or re.search(r"@(?:[\w.]+\.)?Transactional\s*\(\s*(?:value\s*=\s*)?(?:[\w.]*TxType\.)(\w+)", tekst)
    return m.group(1) if m else None


def ejb(p, k):
    """Bean EJB z transakcjami kontenera (CMT): @Stateless / @Stateful / @MessageDriven / @Singleton z javax|jakarta.ejb,
    bez @TransactionManagement(BEAN). Domyślnie każda metoda biznesowa (publiczna) to REQUIRED."""
    if k["jezyk"] != "java" or not p: return False
    a = k["adnotacje"]
    if not (a & {"Stateless", "Stateful", "MessageDriven"} or "Singleton" in a and re.search(
            r"^\s*import\s+(?:javax|jakarta)\.ejb\.(?:Singleton|\*)\s*;|@(?:javax|jakarta)\.ejb\.Singleton\b", "\n".join(p.zrodlo(k["plik"])), re.M)):
        return False
    return not re.search(r"@TransactionManagement\s*\(\s*(?:value\s*=\s*)?(?:[\w.]*TransactionManagementType\.)?BEAN\b", _naglowek_klasy(p, k))


def transakcyjne(k, p=None):
    if p and ejb(p, k):
        linie, klasa = p.zrodlo(k["plik"]), _typ_tx(_naglowek_klasy(p, k)) or "REQUIRED"
        return sorted({m["nazwa"] for m in k["metody"] if m["widocznosc"] in ("public", "") and not m["statyczna"] and m["nazwa"] != k["nazwa"]
                       and not m["adnotacje"] & {"PostConstruct", "PreDestroy"} and (_typ_tx(_nad_metoda(linie, m)) or klasa) not in BEZ_TX})
    if "Transactional" in k["adnotacje"]:
        klasa = _typ_tx(_naglowek_klasy(p, k)) if p else None
        return sorted({m["nazwa"] for m in k["metody"] if m["widocznosc"] in ("public", "") and not m["statyczna"] and m["nazwa"] != k["nazwa"]
                       and (not p or (_typ_tx(_nad_metoda(p.zrodlo(k["plik"]), m)) or klasa) not in BEZ_TX)})
    return sorted({m["nazwa"] for m in k["metody"] if "Transactional" in m["adnotacje"]
                   and (not p or _typ_tx(_nad_metoda(p.zrodlo(k["plik"]), m)) not in BEZ_TX)})


def atrybuty_transakcji(p, k):
    """Niedomyślne atrybuty @Transactional metod: propagacja (REQUIRES_NEW, NESTED, …) i readOnly — z adnotacji
    metody albo klasy (także @TransactionAttribute EJB i TxType Jakarty). Źródła, które nie widzą BEGIN (OTel), dostają
    z tego osobną transakcję zamiast „dołącza”."""
    linie = p.zrodlo(k["plik"])
    def z_tekstu(t):
        w = {}
        typ = _typ_tx(t)
        if typ and typ != "REQUIRED": w["propagacja"] = typ
        m = re.search(r"@Transactional\s*\(([^)]*)\)", t, re.S)
        if not m: return w
        a = m.group(1)
        pr = re.search(r"Propagation\.(\w+)", a) or re.search(r"propagation\s*=\s*\"?(\w+)", a)
        if pr and pr.group(1) != "REQUIRED": w["propagacja"] = pr.group(1)
        if re.search(r"readOnly\s*=\s*true", a): w["tylkoOdczyt"] = True
        return w
    klasa = z_tekstu("\n".join(linie[max(0, k["linia"] - 8):k["linia"] + 1]))
    wynik, tx = {}, transakcyjne(k, p)
    for m in k["metody"]:
        if m["nazwa"] not in tx: continue
        w = {**klasa, **z_tekstu(_nad_metoda(linie, m))}
        if w: wynik[m["nazwa"]] = w
    return wynik


def transakcje_xml(p):
    """Spring XML: <tx:advice> (tx:method name/read-only/propagation) + <aop:advisor> z pointcutem execution(…).
    Zwraca fqn klasy → {metoda-wzorzec: atrybuty}. Obsługiwany podzbiór AspectJ: execution([public] * typ.metoda(..)),
    „..” i „*” we wzorcu typu, and/&&, !within(pakiet..*)."""
    porady, punkty, doradcy = {}, {}, []
    for d, _, fs in os.walk(p.repo):
        if "/." in d or "target" in d or "node_modules" in d: continue
        for f in fs:
            if not f.endswith(".xml"): continue
            try: x = czytaj(os.path.join(d, f))
            except OSError: continue
            if "tx:advice" not in x and "aop:config" not in x: continue
            for id_, cialo in re.findall(r'<tx:advice[^>]*\bid="([^"]+)"[^>]*>(.*?)</tx:advice>', x, re.S):
                porady[id_] = [(dict(re.findall(r'([\w-]+)="([^"]*)"', m))) for m in re.findall(r"<tx:method\b([^>]*)/?>", cialo)]
            for id_, wyr in re.findall(r'<aop:pointcut[^>]*\bid="([^"]+)"[^>]*\bexpression="([^"]+)"', x): punkty[id_] = wyr
            for atr in re.findall(r"<aop:advisor\b([^>]*)/?>", x):
                a = dict(re.findall(r'([\w-]+)="([^"]*)"', atr))
                doradcy.append((a.get("advice-ref"), a.get("pointcut") or punkty.get(a.get("pointcut-ref"), "")))
    def wzorzec(w):                                   # AspectJ typ → regex
        w = re.escape(w).replace(r"\.\.", r"(?:\.\w+)*\.").replace(r"\*", r"\w*")
        return re.compile("^" + w + "$")
    wynik = {}
    for porada, wyr in doradcy:
        if porada not in porady or not wyr: continue
        wyr = wyr.replace("&amp;&amp;", " and ").replace("&&", " and ")
        tak = [m for m in re.findall(r"execution\(\s*(?:public\s+)?\S+\s+([\w.*]+)\.([\w*]+)\s*\(", wyr)]
        nie = re.findall(r"!\s*within\(\s*([\w.*]+)\s*\)", wyr)
        for k in p.klasy.values():
            if k["jezyk"] != "java": continue
            for typ, met in tak:
                if not wzorzec(typ).match(k["fqn"]) or any(wzorzec(n.rstrip("*").rstrip(".") + "..*").match(k["fqn"]) or wzorzec(n).match(k["fqn"]) for n in nie): continue
                for m in k["metody"]:
                    if m["widocznosc"] not in ("public", "") or m["nazwa"] == k["nazwa"] or not wzorzec(met).match(m["nazwa"]): continue
                    atr = next((a for a in porady[porada] if wzorzec(a.get("name", "*")).match(m["nazwa"])), None)
                    if atr is None: continue
                    w = {}
                    if atr.get("read-only") == "true": w["tylkoOdczyt"] = True
                    if atr.get("propagation") and atr["propagation"] != "REQUIRED": w["propagacja"] = atr["propagation"]
                    wynik.setdefault(k["fqn"], {})[m["nazwa"]] = w
    return wynik


# ---------------------------------------------------------------- zapis
def zbuduj(repo, wyjscie=None, zachowaj=False):
    p = Projekt(repo)
    tech = klasyfikuj(p, wczytaj_reguly())
    poziomy(p)
    wyjscie = wyjscie or os.path.join(p.repo, ".flow-lens", "mapa.json")
    stara = {}
    if zachowaj and os.path.exists(wyjscie):
        with open(wyjscie, encoding="utf-8") as f: stara = json.load(f)
    klasy = {}
    tx_xml = transakcje_xml(p)
    for qn, k in sorted(p.klasy.items(), key=lambda x: x[1]["fqn"]):
        poprz = stara.get("klasy", {}).get(k["fqn"])
        if poprz and poprz.get("zatwierdzone"):
            # transakcje kontenera EJB to fakt z kodu, nie decyzja: wpis zatwierdzony bez „transakcyjne” dostaje je z CMT
            if poprz.get("rola") in ROLE_RYSOWANE and "transakcyjne" not in poprz and ejb(p, k):
                t = [x for x in transakcyjne(k, p) if x in (poprz.get("metody") or [x])]
                a = {m_: w for m_, w in atrybuty_transakcji(p, k).items() if m_ in t}
                if t: poprz = {**poprz, "transakcyjne": t, **({"transakcje": a} if a else {})}
            klasy[k["fqn"]] = poprz; continue
        wpis = dict(rola=k["rola"], nazwa=k["nazwa"], powod=k["powod"], pewnosc=k["pewnosc"], plik=f'{k["plik"]}:{k["linia"]}')
        if k["rola"] in ROLE_RYSOWANE:
            wpis["poziom"] = k["poziom"]
            if k.get("rodzaj") == "interface": wpis["interfejs"] = True
            if k.get("rodzaj") == "modul": wpis["modul"] = True           # funkcje modułu, nie klasa (hak Node owija eksporty)
            if k.get("role_metod"): wpis["role_metod"] = k["role_metod"]  # moduł o mieszanych rolach funkcji (rola = rola modułu)
            # metody także repozytoriów: Java ma je ze Spring Data (agent_otel ich nie dokłada), Python/Node — z naszego źródła
            wpis["metody"] = [m for m in metody_do_instrumentacji(k) if m not in k.get("petle", ())]
            if k.get("metody_interfejsu") and not wpis["metody"]: wpis["metody"] = k["metody_interfejsu"]   # mapper MyBatis: id instrukcji
            t = transakcyjne(k, p)
            a = atrybuty_transakcji(p, k) if t else {}
            for met, atr in tx_xml.get(k["fqn"], {}).items():       # transakcje deklaratywne z XML (tx:advice + aop)
                if met not in t: t = sorted(set(t) | {met})
                if atr: a[met] = {**a.get(met, {}), **atr}
            if t: wpis["transakcyjne"] = t
            if a: wpis["transakcje"] = a
        klasy[k["fqn"]] = wpis
    mapa = dict(
        projekt=os.path.basename(p.repo), technologie=tech, wyjatki=wyjatki(p),
        zrodlo=dict(codegraph=os.path.join(p.repo, ".codegraph", "codegraph.db"), zbudowano=time.strftime("%Y-%m-%dT%H:%M:%S")),
        zatwierdzona=stara.get("zatwierdzona", False),
        pomin_sciezki=stara.get("pomin_sciezki", ["^/actuator", "^/v3/api-docs", "^/swagger", "\\.(js|css|png|ico|svg|map)$"]),
        klasy=klasy)
    os.makedirs(os.path.dirname(wyjscie), exist_ok=True)
    with open(wyjscie, "w", encoding="utf-8") as f: json.dump(mapa, f, ensure_ascii=False, indent=1)
    with open(os.path.join(os.path.dirname(wyjscie), "propozycja.md"), "w", encoding="utf-8") as f: f.write(propozycja(mapa))
    return mapa, wyjscie


def propozycja(mapa):
    grupy = defaultdict(list)
    for fq, k in mapa["klasy"].items(): grupy[k["rola"]].append((fq, k))
    w = [f"# Mapa {mapa['projekt']} — propozycja do zatwierdzenia", "",
         f"Technologie: {', '.join(mapa['technologie'])}. Zbudowano {mapa['zrodlo']['zbudowano']}.", "",
         "| rola | klas | do potwierdzenia |", "|---|---|---|"]
    for r in ROLE:
        g = grupy.get(r, [])
        w.append(f"| {r} | {len(g)} | {sum(1 for _, k in g if k['pewnosc'] != 'pewne')} |")
    for r in ["wejscie", "aplikacja", "domena", "repozytorium"]:
        w += ["", f"## {r}", ""]
        for fq, k in sorted(grupy.get(r, []), key=lambda x: (x[1].get("poziom") or 0, x[0])):
            znak = "" if k["pewnosc"] == "pewne" else " **?**"
            w.append(f"- `{fq}` (poziom {k.get('poziom')}, {len(k.get('metody', []))} metod){znak} — {k['powod']}")
    w += ["", "## Pytania (przypadki graniczne)", ""]
    for fq, k in sorted(mapa["klasy"].items()):
        if k["pewnosc"] != "pewne" and k["rola"] in ("domena", "aplikacja"):
            w.append(f"- `{k['nazwa']}` → {k['rola']}? ({k['powod']})")
    return "\n".join(w) + "\n"


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("repo"); a.add_argument("--wyjscie"); a.add_argument("--zachowaj", action="store_true")
    o = a.parse_args()
    mapa, plik = zbuduj(o.repo, o.wyjscie, o.zachowaj)
    licz = defaultdict(int)
    for k in mapa["klasy"].values(): licz[k["rola"]] += 1
    print(f"mapa: {plik}")
    print("  " + ", ".join(f"{r} {licz[r]}" for r in ROLE))
    print(f"  propozycja: {os.path.join(os.path.dirname(plik), 'propozycja.md')}")
