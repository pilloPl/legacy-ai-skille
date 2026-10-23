"""Reguły Spring: role klas z adnotacji i konwencji nazw. Umowa jak w entry-flows/rules.

klasyfikuj(k) → (rola, powód, pewność) albo None (decyduje następna reguła).
k: dict z polami nazwa, fqn, pakiet, modul, rodzaj, adnotacje (set), rozszerza, implementuje, record,
abstrakcyjna, metody [{nazwa, adnotacje, ...}].
"""
import re

JEZYK = "java"
ORDER = 20

def DETECT(p):
    znaczniki = {"RestController", "Controller", "Service", "SpringBootApplication", "Configuration"}
    return "org.springframework" in p.tekst() or any(k["adnotacje"] & znaczniki for k in p.klasy.values())

WEJSCIE_KLASA = {"RestController", "Controller", "WebService", "Endpoint", "RepositoryRestResource"}
WEJSCIE_METODA = {"Scheduled", "EventListener", "TransactionalEventListener", "KafkaListener", "JmsListener",
                  "RabbitListener", "SqsListener", "StreamListener"}
INFRA = {"Configuration", "ConfigurationProperties", "ControllerAdvice", "RestControllerAdvice", "SpringBootApplication",
         "SpringBootConfiguration", "EnableAutoConfiguration", "EnableWebSecurity", "Aspect"}
STEREOTYP = {"Component", "Service", "Repository", "Controller", "RestController", "Configuration", "Named", "ManagedBean"}
# rozszerzenia kontenera (BeanPostProcessor…) — działają przy starcie, nie w requeście
KONTENER = re.compile(r"\b(BeanPostProcessor|BeanFactoryPostProcessor|BeanDefinitionRegistryPostProcessor|BeanFactoryAware|"
                      r"ApplicationContextAware|ImportBeanDefinitionRegistrar|ImportSelector|SmartInitializingSingleton|"
                      r"ApplicationContextInitializer|EnvironmentPostProcessor|FactoryBean)\b")
ENCJA = {"Entity", "Embeddable", "MappedSuperclass", "Document", "Table"}
TECH_PAKIET = re.compile(r"\.(security|config|configuration|util|utils|audit|webservice|web|infrastructure\.web)(\.|$)")
APLIKACJA_NAZWA = re.compile(r"(ApiService|ApplicationService|Facade|UseCase|Handler|Orchestrator|Coordinator)$")


def klasyfikuj(k):
    a, n = k["adnotacje"], k["nazwa"]
    metody_ann = set().union(*[m["adnotacje"] for m in k["metody"]]) if k["metody"] else set()
    if a & WEJSCIE_KLASA:
        return "wejscie", "@" + sorted(a & WEJSCIE_KLASA)[0], "pewne"
    if a & INFRA:
        return "pomin", "infrastruktura @" + sorted(a & INFRA)[0], "pewne"
    if KONTENER.search(k["rozszerza"] + " " + k["implementuje"]) or "Configuration" in k.get("adnotacje_zewn", ()):
        return "pomin", "rozszerzenie kontenera / klasa wewnątrz @Configuration", "pewne"
    if re.search(r"\b(OncePerRequestFilter|GenericFilterBean|Filter|HandlerInterceptor|WebMvcConfigurer)\b",
                 k["rozszerza"] + " " + k["implementuje"]):
        return "pomin", "filtr / konfiguracja web", "pewne"
    if "Repository" in a or re.search(r"(Repository|Dao|DaoImpl|DaoCustom)$", n) \
            or re.search(r"(Jpa|Crud|PagingAndSorting)Repository", k["rozszerza"]):
        return "repozytorium", "@Repository / *Dao / *Repository", "pewne"
    # @EventListener / @Scheduled działają tylko w beanie: klasa ze stereotypem albo zarejestrowana przez @Bean / XML.
    # Klasa-wartość z martwą adnotacją (Lombok @Value + @EventListener) nie jest wejściem.
    bean = bool(a & STEREOTYP) or k.get("bean") or not k.get("beany_znane")
    if metody_ann & WEJSCIE_METODA and not bean:
        return None
    if metody_ann & WEJSCIE_METODA or re.search(r"\b(QuartzJobBean|Job)\b", k["rozszerza"] + " " + k["implementuje"]):
        wej = sorted(metody_ann & WEJSCIE_METODA) or ["Job"]
        return "wejscie", "job / listener (@" + wej[0] + ")", "pewne"
    if a & ENCJA:
        return "domena", "encja @" + sorted(a & ENCJA)[0], "pewne"
    if a & {"Service", "Component"}:
        if TECH_PAKIET.search(k["pakiet"]) or re.search(r"\b(AuthenticationProvider|UserDetailsService|AuthenticationEntryPoint|"
                                                         r"AccessDeniedHandler|Converter|Formatter)\b", k["implementuje"] + " " + k["rozszerza"]):
            return "pomin", "komponent techniczny (pakiet / interfejs Springa)", "pewne"
        if APLIKACJA_NAZWA.search(n):
            return "aplikacja", f"@{sorted(a & {'Service', 'Component'})[0]} + nazwa *{APLIKACJA_NAZWA.search(n).group(1)}", "pewne"
        if re.search(r"(Mapper|Converter|Notifier|Mail\w*|Sender|Client|Gateway|Adapter|Exporter|Importer|Audit\w*)$", n):
            return "pomin", "komponent techniczny (nazwa)", "do potwierdzenia"
        return "domena", "@Service/@Component z logiką w pakiecie funkcyjnym", "do potwierdzenia"
    return None
