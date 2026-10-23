"""Reguły Javy bez frameworka: to, co techniczne niezależnie od Springa/Jakarty. Ostatnie w kolejności."""
import re

JEZYK = "java"
ORDER = 90

def DETECT(p):
    return any(k["plik"].endswith(".java") for k in p.klasy.values())

TECH_NAZWA = re.compile(r"(Exception|Fault|Error|Mapper|Converter|Dto|DTO|Request|Response|Config|Configuration|"
                        r"Properties|Utils?|Helper|Builder|Constants?|Test|Factory)$")
TECH_PAKIET = re.compile(r"\.(config|configuration|util|utils|common|dto|transfer|webservice|security|audit|"
                         r"persistence|infrastructure\.web)(\.|$)")


def klasyfikuj(k):
    n, pak = k["nazwa"], k["pakiet"]
    if k["rodzaj"] == "interface":
        return "pomin", "interfejs (rysujemy implementację)", "pewne"
    # Jakarta / Java EE: wejścia kontenera — konsument JMS, zasób JAX-RS, bean widoku JSF (akcje i nasłuchy z *.xhtml)
    a = k["adnotacje"]
    if "MessageDriven" in a:
        return "wejscie", "konsument JMS (@MessageDriven)", "pewne"
    if "Path" in a and a & {"Stateless", "Singleton", "RequestScoped", "ApplicationScoped", "Dependent"} | {"Path"} and not TECH_NAZWA.search(n):
        return "wejscie", "zasób JAX-RS (@Path)", "do potwierdzenia"
    if "Named" in a and a & {"RequestScoped", "ViewScoped", "SessionScoped", "ConversationScoped", "FlowScoped"}:
        return "wejscie", "bean widoku JSF (@Named + zakres widoku)", "do potwierdzenia"
    if re.search(r"\b\w*(Exception|Error|Throwable)\b", k["rozszerza"]) or TECH_NAZWA.search(n):
        return "pomin", "techniczna (nazwa)", "pewne"
    if k["rodzaj"] == "enum" or k["record"]:
        return "pomin", "wartość (enum/record) — bez zachowania w przebiegu", "do potwierdzenia"
    if re.search(r"\.persistence(\.|$)|\.dao(\.|$)|\.repository(\.|$)", pak):
        return "repozytorium", "pakiet persistence/dao/repository", "pewne"
    if TECH_PAKIET.search(pak):
        return "pomin", "pakiet techniczny", "do potwierdzenia"
    if not [m for m in k["metody"] if not m["abstrakcyjna"]]:
        return "pomin", "brak metod z ciałem", "pewne"
    if re.search(r"(Facade|ApplicationService|UseCase|CommandHandler|Orchestrator)$", n):
        return "aplikacja", "nazwa fasady / serwisu aplikacyjnego", "do potwierdzenia"
    return "domena", "klasa z logiką poza pakietami technicznymi", "do potwierdzenia"
