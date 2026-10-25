---
disable-model-invocation: true
name: archetype-implementer
description: Generuje działający kod dla rozpoznanych archetypów oprogramowania na bazie referencyjnych implementacji in-memory z publicznego repo archetypów (https://github.com/Archetypy-Oprogramowania/archetypes, Maven, Java 21, z testami). Wejściem jest MOCNE PODSUMOWANIE z analizy archetypowej (np. podsumowanie trybu głębokiego skilla archetype-storyteller) - tabela mapowania pojęcie-domenowe→element-archetypu, niezmienniki, polityki, integracje. Dla każdego archetypu wskazuje właściwy moduł repo, adaptuje go pod słownik biznesu i generuje kod + testy w konwencjach modułu referencyjnego. Invoke when user asks to "wygeneruj kod z archetypu", "zaimplementuj ten archetyp pod mój biznes", "przenieś mapowanie na kod", "użyj repo archetypów do implementacji" - or right after archetype-storyteller finishes a detailed mapping and the user wants working code.
argument-hint: "[mocne podsumowanie mapowania / ścieżka do raportu storytellera] [docelowy katalog projektu]"
---

# Archetype Implementer

Zamieniasz **mocne podsumowanie** analizy archetypowej na **działający kod z testami**,
wzorowany na referencyjnych implementacjach in-memory z repo
`<archetypes>` — lokalny klon publicznego repo https://github.com/Archetypy-Oprogramowania/archetypes (multi-moduł Maven, Java 21, JUnit 5 + AssertJ).
Nie ma go na dysku: `git clone --depth 1 https://github.com/Archetypy-Oprogramowania/archetypes` do katalogu poza repo projektu (np. obok) i podstaw jego
ścieżkę za `<archetypes>` w opisach z `references/`. Moduł `matching` jest tylko w wersji autorów (nie ma go
w repo publicznym).
Nie wymyślasz modelu od zera — model już jest w repo; Ty go **konkretyzujesz pod słownik
i reguły biznesu** z podsumowania.

## Kontrakt wejścia — "mocne podsumowanie"

Minimalny komplet (zwykle podsumowanie trybu głębokiego skilla `archetype-storyteller`, FAZA 5c, razem z sekcjami „Integracje" i „Odniesienia semantyczne"):

1. **Lista potwierdzonych archetypów** z dowodami.
2. **Per archetyp: tabela mapowania** `pojęcie domenowe → element archetypu → dowód`.
3. **Niezmienniki i reguły** domenowe, które model musi egzekwować.
4. **Polityki** (np. polityka kolejkowania, polityka tolerancji delty, posting rules).
5. **Połączenia** między wystąpieniami archetypów, jeśli storyteller jakieś ustalił:
   integracje (wywołania, tylko od Orderingu/Oferty/grafów/Rules) i odniesienia semantyczne
   (identyfikator-string albo rzut). Mogą być puste — wtedy każdy archetyp stawiasz osobno.
6. Docelowy katalog/projekt, język (domyślnie Java 21 jak referencja) i słownik nazw
   (wersja specyficzna z "przełącznika języka" storytellera, jeśli jest).

**Jeśli czegoś brakuje — nie zgaduj.** Zapytaj użytkownika albo odeślij do
`archetype-storyteller` po uzupełnienie mapowania. Bez tabeli mapowania nie generujesz kodu.

## Mapa: archetyp → moduł referencyjny

| Archetyp | Moduł w repo archetypów | Testy | Referencja |
|---|---|---|---|
| Product | `product/`, `configurator/` (moduły rootowego poma) | `./mvnw -pl product,configurator test` | `references/product-impl.md` |
| Pricing | `pricing/` (+ `pricing/docs/`) | `./mvnw -pl pricing test` | `references/pricing-impl.md` |
| Rules & Scoring | `rules/` | `./mvnw -pl rules test` | `references/rules-impl.md` |
| Accounting | `accounting/`, `quantity/`, `common/` | `./mvnw -pl accounting,quantity,common test` | `references/accounting-impl.md` |
| Party | `party/` — **samodzielny projekt** (własny pom) | `cd party && ./mvnw test` | `references/party-impl.md` |
| Inventory / Availability | `availability/simple-availability`, `availability/timed-availability`, `waitlist/`; `inventory/` — **samodzielny projekt** | `./mvnw -pl availability/...,waitlist test`; `cd inventory && ./mvnw test` | `references/inventory-impl.md` |
| Matching / Optymalizacja | `general-assignment/` (knapsack + simulation) | `./mvnw -pl general-assignment test` | `references/matching-impl.md` |
| Plan vs Wykonanie (Delta) | `planvsexecution/` | `./mvnw -pl planvsexecution test` | `references/planvsexecution-impl.md` |
| Archetypy grafowe | `graphs/` | `./mvnw -pl graphs test` | `references/graphs-impl.md` |
| Ordering | **brak modułu referencyjnego** — komponuj z Product+Pricing+Inventory+Party wg `archetype-storyteller/references/ordering.md`; maszyna stanów + snapshoty + Saga/Outbox | — | — |

## Proces

### KROK 1 — Walidacja wejścia
Sprawdź kontrakt wejścia (powyżej). Braki → pytanie do użytkownika, nie zgadywanie.

### KROK 2 — Plan implementacji (per archetyp)
Dla każdego archetypu z podsumowania przeczytaj **tylko jego** plik `references/*-impl.md`
(progressive disclosure — nie czytaj wszystkich). Z referencji weź: mapę kodu, punkty
adaptacji i przepis generacji. Ustal i pokaż użytkownikowi krótki plan:
- które klasy referencyjne wchodzą **bez zmian** (generyczna mechanika),
- które dostają **domenowe nazwy** ze słownika podsumowania (tu użyj tabeli mapowania
  wprost: kolumna "pojęcie domenowe" → nazwa klasy/metody),
- gdzie wstrzykujesz **polityki/niezmienniki** z podsumowania,
- kolejność: archetypy fundamentowe najpierw (Party, Product, Accounting), procesowe
  na końcu (Ordering) — zgodnie z kierunkami upstream/downstream z podsumowania.

Przy niejasnej decyzji projektowej (np. wybór wariantu dostępności simple/timed/pool,
strategia alokacji) — krótka bramka z pytaniem, z rekomendacją.

**Element bez implementacji referencyjnej.** Jeżeli podsumowanie mapuje coś, czego moduł
referencyjny nie ma (np. uprawnienia z relacji w Party, przepływ G15 w grafach, Ordering
w całości), nie udawaj, że jest wzorzec. Zaznacz to w planie jako **projekt luźny**:
zaprojektuj element samodzielnie, ale w stylu, który moduł już ma (te same fasady,
commandy i eventy, `Result`, polityki wstrzykiwane z zewnątrz, `Validity`, buildery
i konwencje testów), i dołóż go obok istniejącej mechaniki, nie w jej środek. W raporcie
końcowym wymień go jako świadome rozszerzenie bez wzorca.

### KROK 3 — Generacja: testy najpierw
Dla każdego archetypu, w kolejności z planu:
1. **Zacznij od testów** — przepisz scenariusze biznesowe z podsumowania na testy
   w konwencjach modułu referencyjnego (te konwencje opisuje sekcja "Testy jako
   specyfikacja" w `*-impl.md`; wzoruj się na istniejących testach repo, in-memory,
   bez frameworków infrastrukturalnych).
2. **Kod**: kopiuj/adaptuj klasy wg przepisu z referencji. Mechanika generyczna zostaje
   jak w repo; słownik domenowy z tabeli mapowania; polityki jako wstrzykiwane
   implementacje (interfejs/funkcja), nie if-y w środku mechaniki.
3. Zachowaj dwuwarstwowość tam, gdzie referencja ją ma (np. generyczny knapsack vs
   domenowa symulacja; generyczny graf vs domenowy model) — to świadome modelowanie
   niepewności, nie przerost.
4. **Uruchom testy** po każdym archetypie, nie na końcu. Czerwone → napraw przed
   przejściem dalej.

### KROK 4 — Połączenia
Po postawieniu archetypów połącz tylko to, co wymienia podsumowanie. Integrację implementuj
jako wywołanie (np. Ordering woła Pricing o wycenę i zapisuje snapshot) i pokryj testem
przepływu. Odniesienie semantyczne implementuj jako pole z identyfikatorem-stringiem albo
własny rzut po stronie trzymającego, bez zależności od typów drugiego modułu. Nie dodawaj
połączeń, których w podsumowaniu nie ma; przy pustych sekcjach pomiń krok.

### KROK 5 — Raport końcowy
Podsumuj: wygenerowane moduły/pakiety, mapowanie nazw (domenowe ↔ referencyjne),
wynik testów (`Tests run: ...`), świadome odstępstwa od referencji i dlaczego,
oraz co pozostało (np. persystencja zamiast in-memory, API HTTP).

## Reguły twarde

- **Testy repo referencyjnego są źródłem konwencji** — nowy kod testuje się tak samo
  (fasady, buildery, asercje stanu obserwowalnego, in-memory).
- Nie modyfikuj repo archetypów — to wzorzec; generujesz do projektu docelowego.
  (Kopiowanie klas do projektu docelowego jest OK; zależność Maven na moduł też OK,
  jeśli użytkownik woli.)
- Nie betonuj: polityki i zmienne reguły z podsumowania zawsze jako wstrzykiwane
  abstrakcje, słowniki/typy definiowane w runtime tam, gdzie referencja tak robi.
- Kod w języku ze słownika biznesu (wersja specyficzna), komentarze tylko tam,
  gdzie kod nie wyrazi ograniczenia.
- Każdy wygenerowany archetyp musi mieć zielone testy zanim przejdziesz do następnego.
- To, czego referencja nie ma, projektujesz luźno w jej stylu i nazywasz w raporcie
  rozszerzeniem bez wzorca; nie dopisujesz tego do opisu referencji jako istniejącego.
