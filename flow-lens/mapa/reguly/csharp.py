"""Reguły C# / .NET: role klas z atrybutów ([ApiController]), klas bazowych (ControllerBase, DbContext,
IRequestHandler) i nazw. Umowa jak w entry-flows/rules. Atrybuty C# ([Nazwa]) czytamy z linii nad klasą."""
import re

JEZYK = "csharp"
ORDER = 30

def DETECT(p):
    return any(k["jezyk"] == "csharp" for k in p.klasy.values())

TECH_NAZWA = re.compile(r"(Exception|Dto|DTO|Request|Response|Options|Settings|Config|Configuration|Extensions|Module|"
                        r"Mapper|Factory|Builder|Helper|Utils?|Migration|Snapshot|Tests?)$")




# rozruch i kompozycja (Program.Main, Startup, moduły Autofac, wzbogacacze Serilog) — działa przy starcie, a Activity
# otwarta w Main nigdy się nie kończy i przechodzi na wątki jobów
ROZRUCH_NAZWA = re.compile(r"^(Program|Startup|\w+Startup|ApplicationStartup|CompositionRoot|\w*Bootstrapper)$|(Enricher|Installer|Registrar)$")
ROZRUCH_BAZA = re.compile(r"\b(Autofac\.Module|Module|IRegistrationSource|ILogEventEnricher|IStartupFilter|IConfigureOptions|"
                          r"IPostConfigureOptions|IApplicationModelConvention|IStartup)\b")


def klasyfikuj(k):
    n, baz = k["nazwa"], k.get("bazowe", "")
    if k["rodzaj"] == "interface":
        return "pomin", "interfejs — rysujemy implementację", "pewne"
    if re.search(r"\bException\b", baz) or TECH_NAZWA.search(n):
        return "pomin", "techniczna (nazwa / wyjątek)", "pewne"
    if ROZRUCH_NAZWA.search(n) or ROZRUCH_BAZA.search(baz):
        return "pomin", "rozruch / kompozycja (Program, Startup, moduł DI, enricher)", "pewne"
    if re.search(r"\b(ControllerBase|Controller|Hub)\b", baz) or re.search(r"(Controller|Endpoints?)$", n):
        return "wejscie", "kontroler ASP.NET", "pewne"
    # Razor Pages: handlery OnGet/OnPost[Async] strony (trasa z położenia .cshtml względem Pages/)
    if re.search(r"\bPageModel\b", baz) and any(re.match(r"On(Get|Post|Put|Delete|Patch)", m["nazwa"]) for m in k["metody"]):
        return "wejscie", "strona Razor Pages (PageModel z handlerami OnGet/OnPost)", "pewne"
    if re.search(r"\b(BackgroundService|IHostedService|IConsumer|IJob|IInvocable|IRecurringJob)\b", baz):
        return "wejscie", "zadanie w tle / konsument (BackgroundService, Quartz IJob, MassTransit)", "do potwierdzenia"
    # handler zdarzenia w procesie (MediatR Publish) działa wewnątrz requestu / joba, który zdarzenie opublikował
    if re.search(r"\bINotificationHandler\b|\bIDomainEventHandler\b", baz):
        return "aplikacja", "handler zdarzenia w procesie (INotificationHandler)", "do potwierdzenia"
    if re.search(r"\b(DbContext)\b", baz) or re.search(r"(Repository|Repo|Dao)$", n):
        return "repozytorium", "DbContext / *Repository", "pewne"
    if re.search(r"\bIRequestHandler\b", baz) or re.search(r"(Facade|ApplicationService|UseCase|Handler)$", n):
        return "aplikacja", "fasada / handler (MediatR)", "do potwierdzenia"
    if k["rodzaj"] in ("enum", "record") or k["record"]:
        return "pomin", "wartość (enum / record)", "do potwierdzenia"
    if not [m for m in k["metody"] if not m["abstrakcyjna"]]:
        return "pomin", "brak metod z ciałem", "pewne"
    return "domena", "klasa z logiką", "do potwierdzenia"
