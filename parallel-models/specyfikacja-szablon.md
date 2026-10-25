# Specyfikacja: <obszar> — <rozwiązanie> obok starego modelu

Źródło prawdy dla workflow `parallel-models`. Każdy krok dopisuje swoją sekcję; commit kroku zawiera zmianę kodu
i tej specyfikacji razem. Źródło leży bez zmian w `zrodlo.md`, wybrane miejsca w `miejsca.md`, stan przebiegu w `stan.json`,
wyniki bramek w `bramki.jsonl`. Widok: `specyfikacja.html`.
Krok 1 zakłada plik z całego szablonu: wypełnia swoje sekcje, placeholderów innych kroków nie usuwa.

<!-- krok: swappable-dsl.1 -->
## Stary model
<nazwa, mechanizm (JAK) w 2–3 zdaniach ze źródła (np. Implementation Notes i kolumna JAK STARE mappera); pakiety w kodzie>

<!-- krok: swappable-dsl.1 -->
## Nowe rozwiązanie
<czym jest (np. archetyp Party); elementy (np. typy, role, relacje); pytania, na które odpowiada>
Implementacja referencyjna: <ze źródła: opis implementacji i repo albo „brak, od zera”>

<!-- krok: swappable-dsl.1 -->
## Słowniki
- **CO** (pytania w języku problemu): …
- **Mapowanie** (pojęcie starego modelu → element nowego rozwiązania): …
- **Zakazany** (słowa JAK starego modelu, których nie używa port, DSL, scenariusze ani nowe rozwiązanie; formy kodowe
  z kontekstem identyfikatora, np. `parentGroup`, `GroupType.SITE`, `HouseCard` — te same w `stan.json` → `zakazane`): …

<!-- krok: swappable-dsl.1 -->
## Kandydaci
| CO | Wołający (plik:linia) | JAK stare | JAK w nowym rozwiązaniu | Odpowiedź | Skąd (bolączka / źródło) |
|---|---|---|---|---|---|

<!-- krok: swappable-dsl.1 -->
## Zmiany zachowania według źródła
<decyzje i założenia źródła, po których nowe rozwiązanie odpowiadałoby inaczej niż stary model; i tak dostaje stare
zachowanie, a człowiek potwierdza każdą w kroku 4. Dwie listy: **w odpowiedziach** na pytania z miejsc (te sprawdzą
scenariusze) i **w skutkach komend** (np. co zmienia przeniesienie) — tylko do wiadomości, workflow komend nie robi>

<!-- krok: swappable-dsl.4 -->
### Potwierdzenia (krok 4)
<dla każdej zmiany w odpowiedziach: czy dzisiejsze zachowanie to błąd — decyzja człowieka; bez niej „nierozstrzygnięte —
zostaje dzisiejsze”; albo „nie dotyczy wybranych miejsc”. Nowe rozwiązanie i tak odpowiada po staremu>

<!-- krok: swappable-dsl.1 -->
## Poza nowym rozwiązaniem
<pojęcia, których nowe rozwiązanie nie wyraża (np. niezmapowane przez mappera)>

<!-- krok: swappable-dsl.2 -->
## Miejsca
Kontrakt miejsc: [`miejsca.md`](miejsca.md). Od kroku 3 workflow pracuje tylko na nim.

<!-- krok: swappable-dsl.3 -->
## Port i świat
<sygnatura portu w języku CO, typy wartości i rekordy wyniku; komendy świata; jak świat zasila stary model
(zachowanie produkcyjne czy repozytorium); wejście spoza świata = odpowiedź jak na brak (bez wyjątku „nieznane”)>

### Ograniczenia świata na starym modelu
<komendy, których legacy nie wyraża wprost, dane, które legacy dokłada samo, warianty legacy, których świat celowo
nie wyraża, izolacja od danych innych testów; albo „brak”>

<!-- krok: swappable-dsl.3 -->
## Scenariusze
<scenariusz na wiersz: miejsce, given / when / then w języku CO>

<!-- krok: swappable-dsl.4 -->
## Nowe rozwiązanie w kodzie
<moduł (`modul_rozwiazania`), co weszło ze specyfikacji, czego nie użyto; elementy dodane tylko do starego zachowania
(w tym tłumaczenia komend świata na dzisiejszą semantykę w `<Rozwiązanie><Obszar>World`); reguły starego
zachowania bez scenariusza („niesprawdzona scenariuszem”)>

<!-- krok: swappable-dsl.4 -->
### Różnice poza scenariuszami
<różnice legacy zauważone w kodzie, których scenariusze nie obejmują (czyta krok 6 i router); albo „brak”>

<!-- krok: swappable-dsl.4 -->
## Nieudane miejsca
| Miejsce | Czego brakuje (w specyfikacji / w implementacji) | Podejścia |
|---|---|---|
| brak | | |

<!-- krok: swappable-dsl.5 -->
## Wpięcie, przełącznik, seeder
<wołający i linia; klucz i wartości przełącznika; moduł seedera i jak go uruchomić; co seeder przygotowuje do
porównania (dane, atrapy usług zewnętrznych); tabele i progi id, które sprząta skrypt czyszczący demo; adapter,
który może znaleźć inną encję niż wołający (indeks unikalny z migracji albo reguła wyboru przy duplikatach); wartości
z bazy, dla których wołający idzie starą drogą; plik identyfikatorów seedu (`seed-identyfikatory.txt`, jeden na linię);
„przygotuj wejście ponownie” (komenda albo endpoint w profilu seedera) i reset odczytu atrap; test sanity i co sprawdza>

<!-- krok: swappable-dsl.6 -->
## Wejście do porównania i wyniki
<na miejsce: okienko (ekran) / API / „brak wejścia, zostają scenariusze”; przypadki z seedu (identyfikatory seedu,
nie zbiorcze liczby); wynik n/n to samo;
linki do ekran/story.html; czego nagranie nie dowodzi (dane spoza seedu, joby, reszta aplikacji)>

<!-- krok: parallel-model-router.1 -->
## Flaga
<mechanizm, klucze, reguła routingu, pozycja domyślna (= przełącznik startowy), reakcja na różnicę (domyślnie `log`),
jak zmienia ją człowiek, ile trwa, zanim zmiana dotrze>

<!-- krok: parallel-model-router.2 -->
## Router
<wajcha: interfejs `<Obszar>Lever`, implementacja na mechanizmie (`<Mechanizm><Obszar>Lever`), wajcha testowa w pamięci;
kto odpowiada przy jakiej pozycji wajchy; wajcha w mechanizmie wygrywa z przełącznikiem startowym; transakcja przy
porównaniu; katalog różnic (`<obszar>.reconciliation.dir`, domyślny); testy przełącznika z kroku 5 po zmianie;
komendy poza zakresem>

<!-- krok: parallel-model-router.3 -->
## Ekran wajchy
<gdzie jest, co pokazuje>

<!-- krok: parallel-model-router.4 -->
## Testy routera i zgodności
<co sprawdzają; dziedzina testu zgodności = o co pytają wołający z miejsca.md; wykluczenia (czego test celowo nie
pyta i dlaczego); test na seedzie (moduł, katalog różnic w target/); test ścieżki z osobną transakcją>

<!-- krok: parallel-model-router.5 -->
## Przełączenie na żywo
<nagranie (okienka przepiętych miejsc przed i po przełączeniu); jak przełączyć; jak wrócić; katalog różnic (wynik
bramki `--roznice`: seed / poza seedem — dla seedu 0); czego przełączenie nie obejmuje: reszta systemu, wołający spoza
miejsca.md, dane spoza seedu, komendy>

### Wymaga migracji danych
<różnice spoza seedu: pytanie, dane (np. karty demo), odpowiedź starego vs nowego, przez którą akcję/okienko (także
pytania zadawane mimochodem); co realnie zmieniło się w systemie po przełączeniu (np. „karty demo nie poszły do
partnera”); albo „brak”. To wejście do migracji danych — osobny etap, poza workflow>

## Odstępstwa (zmienione pliki legacy)
| Krok | Plik | Co | Powód (test / wpięcie / wajcha / ekran / build) |
|---|---|---|---|

