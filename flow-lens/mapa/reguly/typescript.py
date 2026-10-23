"""Reguły TypeScript / JavaScript: role klas z nazw, klas bazowych i dekoratorów (NestJS, Express, TypeORM, Drizzle).
Typy i interfejsy znikają w runtime — rysujemy tylko klasy. Umowa jak w entry-flows/rules."""
import re

JEZYK = "typescript"
ORDER = 30

def DETECT(p):
    return any(k["jezyk"] in ("typescript", "javascript") for k in p.klasy.values())

TECH_NAZWA = re.compile(r"(Error|Exception|Dto|DTO|Request|Response|Config|Configuration|Module|Schema|Mapper|Factory|"
                        r"Builder|Utils?|Helper|Spec|Test|Mock|Stub|Fake)$")
TECH_PAKIET = re.compile(r"\.(config|utils?|common|dto|infrastructure\.web|migrations|storage|setup)(\.|$)")


def klasyfikuj(k):
    n, baz, dek = k["nazwa"], k.get("bazowe", ""), k["adnotacje"]
    if k["rodzaj"] == "interface":
        return "pomin", "interfejs (znika w runtime)", "pewne"
    if re.search(r"\b(Error|Exception)\b", baz) or TECH_NAZWA.search(n):
        return "pomin", "techniczna (nazwa / błąd)", "pewne"
    if dek & {"Controller", "Resolver", "WebSocketGateway", "EventPattern", "MessagePattern", "Processor"} or re.search(r"(Controller|Router|Handler|Listener|Consumer)$", n):
        return "wejscie", "kontroler / handler wejścia", "do potwierdzenia"
    # metody-wejścia (Nest): joby @Cron/@Interval/@Timeout, zdarzenia @OnEvent, kolejki @Process/@EventPattern
    metody_dek = set().union(*[m["adnotacje"] for m in k["metody"]]) if k["metody"] else set()
    if metody_dek & {"Cron", "Interval", "Timeout"}:
        return "wejscie", "job (@" + sorted(metody_dek & {"Cron", "Interval", "Timeout"})[0] + ")", "pewne"
    if metody_dek & {"OnEvent", "EventPattern", "MessagePattern", "Process", "OnQueueActive", "SqsMessageHandler"}:
        return "wejscie", "handler zdarzenia / kolejki (@" + sorted(metody_dek & {"OnEvent", "EventPattern", "MessagePattern", "Process", "OnQueueActive", "SqsMessageHandler"})[0] + ")", "pewne"
    if re.search(r"(Repository|Repo|Dao|DAO|Store)$", n) or dek & {"EntityRepository"}:
        return "repozytorium", "nazwa *Repository / *Dao", "pewne"
    if re.search(r"(Facade|ApplicationService|UseCase|CommandHandler)$", n):
        return "aplikacja", "nazwa fasady / serwisu aplikacyjnego", "do potwierdzenia"
    if dek & {"Entity", "Embeddable", "Schema"}:
        return "domena", "encja ORM (@Entity)", "pewne"
    if TECH_PAKIET.search("." + k["pakiet"]):
        return "pomin", "pakiet techniczny", "do potwierdzenia"
    if not [m for m in k["metody"] if m["nazwa"] not in ("constructor",)]:
        return "pomin", "brak metod (sam konstruktor / pola)", "pewne"
    return "domena", "klasa z logiką poza pakietami technicznymi", "do potwierdzenia"
