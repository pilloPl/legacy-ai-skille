---
disable-model-invocation: true
name: archetype-storyteller
description: Nadrzędny skill archetypowy — wyłapuje WYSTĄPIENIA archetypów oprogramowania (Product, Pricing, Rules, Accounting, Party, Inventory/Availability, Ordering, Plan-vs-Wykonanie/Delta, Matching/Optymalizacja) w biznesie, projekcie lub kodzie legacy i opowiada o nich językiem archetypów. NIE projektuje architektury. Każdy archetyp sprawdza osobny agent z kartą fit-check (domyślnie NIE PASUJE), pytania zadawane razem po skanie, łączenie tylko według connections.md. Ma dwa tryby - skan (fit-check, raport, opowieść, propozycja jednego archetypu z gotowym promptem pogłębienia) i pogłębienie (osobne uruchomienie z gotowym promptem, który oddaje skan: jeden archetyp, bez fit-checku, mapper z pytaniami od razu dostaje bolączki z adresami w kodzie i oddaje tabelę CO | JAK stare | JAK w archetypie oraz 3 ficzery). "Nic nie pasuje" jest poprawnym wynikiem. Invoke when user asks to "opowiedz ten biznes archetypami", "jakie archetypy tu pasują", "przeanalizuj system/kod legacy archetypowo", "zmapuj wymagania na archetypy", or any analysis through software archetypes.
argument-hint: "[opis biznesu / ścieżka do kodu lub dokumentów / wymagania]"
---

# Archetype Storyteller

Wyłapujesz **wystąpienia archetypów oprogramowania** w biznesie, projekcie albo kodzie legacy
i opowiadasz o nich. Archetyp to powtarzalny, sprawdzony model dziedzinowy, który pojawia się
w różnych branżach pod różnymi słownikami.

**Czym ten skill nie jest:** nie projektuje architektury, nie dzieli systemu na moduły, nie
wyznacza granic ani integracji. Wynikiem jest lista wystąpień: „w tym fragmencie biznesu
działa ten archetyp, oto dowody". Wystąpienia nie muszą się ze sobą łączyć i zwykle się nie
łączą. Łączyć wolno wyłącznie według `connections.md`, które rozdziela dwa rodzaje połączeń:
**integracje** (strzałki; wolno tylko Orderingowi i Ofercie, plus samowolka Rules)
i **odniesienia semantyczne** (identyfikator albo rzut; wolno każdemu).

**Zasada naczelna (bottom-up):** ty, jako orkiestrator, **nie oceniasz dopasowania sam**.
Każdy archetyp sprawdza osobny agent we własnym kontekście, na podstawie własnej karty
fit-check. Ty zbierasz raporty, zadajesz użytkownikowi pytania agentów, składasz raport
i dopiero z niego opowieść. Powód: skan robiony w jednym kontekście, z jednej tabeli sygnałów,
znajdował archetypy zbyt ochoczo, bo każde słowo-klucz dawało się dopasować do czegoś.

## Rejestr archetypów

| ID | Archetyp | Fit-check (skan) | Mapper (pogłębienie) | Referencja |
|---|---|---|---|---|
| `product` | Product — definicja vs instancja, katalog, warianty, pakiety | `fit-checks/product.md` | brak w tej wersji | `references/product.md` |
| `pricing` | Pricing — cena jako funkcja kontekstu, składniki, kalkulatory | `fit-checks/pricing.md` | `mappers/pricing/SKILL.md` | `references/pricing.md` |
| `rules` | Rules & Scoring — reguły dynamiczne, kompozycja, scoring | `fit-checks/rules.md` | brak w tej wersji | `references/rules.md` |
| `accounting` | Accounting — konta, wpisy, transakcje, ruch wartości | `fit-checks/accounting.md` | `mappers/accounting/SKILL.md` | `references/accounting.md` |
| `party` | Party — tożsamość vs rola, relacje podmiotów | `fit-checks/party.md` | `mappers/party/SKILL.md` | `references/party.md` |
| `inventory` | Inventory/Availability — ograniczone zasoby, rezerwacje, kolejki | `fit-checks/inventory.md` | brak w tej wersji | `references/inventory.md` |
| `ordering` | Ordering — zamówienie jako zlecenie realizacji | `fit-checks/ordering.md` | brak w tej wersji | `references/ordering.md` |
| `delta` | Plan vs Wykonanie — harmonogram vs realizacja, odchylenia | `fit-checks/delta.md` | brak w tej wersji | `references/delta.md` |
| `matching` | Matching/Optymalizacja — dopasowanie zbiorów, plecak | `fit-checks/matching.md` | brak w tej wersji | `references/matching.md` |

Pozostałe pliki: `fit-checks/_protocol.md` (wspólny protokół agentów skanu: postawa, test
dopasowania, format raportu), `mappers/_protocol.md` (wspólny protokół agentów-mapperów),
`connections.md` (reguły łączenia),
`references/00-foundations.md` (fundamenty myślenia archetypowego).

Nowy archetyp = nowy wiersz rejestru + karta w `fit-checks/` + skill `<id>-archetype-mapper`
+ wiersz w `mappers/_protocol.md` + referencja.

**Grafy są poza rejestrem.** Ukrytych grafów i innych nietypowych reprezentacji szuka osobny
skaner reprezentacji, nie ten skill. Pliki `fit-checks/graphs.md`, `references/graphs.md`
i skill `graphs-archetype-mapper` zostają na dysku, ale storyteller ich nie uruchamia.

## Dwa tryby: skan i pogłębienie

To dwa osobne uruchomienia. Skan nie uruchamia mappera, pogłębienie nie powtarza skanu.

| | Skan | Pogłębienie |
|---|---|---|
| Kiedy | domyślnie, także gdy użytkownik pisze „analiza głęboka” | prompt zaczyna się od „Pogłębienie: <ID>” (gotowy prompt ze skanu) |
| Wejście | problem w języku biznesu i kontekst; skan NIE WIDZI kodu | plik skanu i bolączki z adresami w kodzie wklejone w prompt |
| Co robi | FAZY 1–4 → zapis → propozycja **jednego** archetypu i gotowy prompt pogłębienia | FAZY 5, 5b, 5c: mapper w trybie z pytaniami → podsumowanie dopisane do pliku skanu |
| Pytania | raz po skanie, tylko zmieniające werdykt | od razu po każdym raporcie mappera |

## Proces

```
FAZA 1: SKAN (9 agentów, równolegle, każdy osobno)
   ↓
FAZA 2: PYTANIA (zebrane od agentów, zadane razem)
   ↓
FAZA 3: RAPORT DOPASOWANIA
   ↓
FAZA 4: OPOWIEŚĆ + ŁĄCZENIE → ZAPIS → PROPOZYCJA JEDNEGO ARCHETYPU + GOTOWY PROMPT
   (koniec skanu)

osobne uruchomienie „Pogłębienie: <ID>” (bez FAZ 1–4 i bez fit-checku):
FAZA 5: MAPOWANIE (jeden agent-mapper, bolączki z adresami w kodzie z promptu)
   ↓
FAZA 5b: PYTANIA MAPPERA (od razu, runda po rundzie)
   ↓
FAZA 5c: PODSUMOWANIE (dopisane do pliku skanu)
   ↓
na życzenie:  FAZA 6: RYSUNEK  ·  FAZA 7: PRZEŁĄCZNIK JĘZYKA
   ↓
FAZA 8: HISTORIA KOŃCOWA (na samym końcu, gdy wszystko inne jest już zrobione)
```

### FAZA 1 — SKAN bottom-up

1. Ustal wejście. Jeżeli to tekst, zachowaj go dosłownie. Jeżeli to pliki, dokumenty lub
   repozytorium, ustal bezwzględne ścieżki. Jeżeli wejścia nie ma, poproś o nie i nic więcej
   nie rób.
2. **Bolączki z adresami w kodzie nie idą do skanu.** Jeżeli wejście ma część z miejscami w kodzie (`plik:linia`,
   wołający, jak kod odpowiada), skan dostaje wejście bez niej; tę część dostaje dopiero mapper
   w osobnym pogłębieniu (FAZA 5), wklejoną przez użytkownika. Skan NIE WIDZI kodu: dostaje tylko język problemu i kontekst biznesowy.
2a. **Nie streszczaj i nie interpretuj wejścia** przed przekazaniem agentom: streszczenie już
   zawiera twoje dopasowania. Nie czytaj kart fit-check ani referencji i nie formułuj własnych
   hipotez o tym, co pasuje.
Prompt może zawęzić skan do listy archetypów („Skanuj tylko: …”): uruchamiasz agentów tylko dla nich, a raport
   wymienia archetypy niesprawdzone. Kontekst systemu (plik) podajesz agentom ścieżką bezwzględną.
3. Uruchom **po jednym agencie na każdy wiersz rejestru**, wszystkie w jednej wiadomości
   (równolegle), narzędziem Agent (`subagent_type: general-purpose`). Każdy agent dostaje
   świeży kontekst i dokładnie ten prompt:

   ```
   Sprawdzasz dopasowanie JEDNEGO archetypu oprogramowania do zadanego wejścia.
   Archetyp: <ID>

   Najpierw przeczytaj w całości dwa pliki i stosuj je ściśle:
   1. .claude/skills/archetype-storyteller/fit-checks/_protocol.md  (jak pracujesz i jak raportujesz)
   2. .claude/skills/archetype-storyteller/fit-checks/<ID>.md       (czego szukasz)

   Jeżeli karta nie rozstrzyga przypadku granicznego, możesz doczytać sekcje o sygnałach
   i anty-sygnałach w .claude/skills/archetype-storyteller/references/<ID>.md.
   Nie czytaj kart ani referencji innych archetypów.

   Domyślny werdykt to NIE PASUJE. Zero wystąpień jest poprawnym wynikiem.

   ## Wejście
   <dosłowny tekst wejścia ALBO lista bezwzględnych ścieżek do przeczytania>

   Zwróć raport dokładnie w formacie z _protocol.md, sekcja 5. Nic poza nim.
   ```

4. Poczekaj na wszystkie raporty. Agent, który nie zwrócił raportu w formacie, liczy się jako
   NIE PASUJE z adnotacją „brak raportu"; odnotuj to w raporcie.

### FAZA 2 — PYTANIA (po skanie, przed raportem)

Agenci nie mogą pytać użytkownika (narzędzie AskUserQuestion jest podagentom odebrane), więc
oddają pytania w raportach, a zadajesz je ty, raz, po zakończeniu całego skanu.

1. Zbierz pytania ze wszystkich wystąpień z werdyktem NIEROZSTRZYGNIĘTE.
2. Scal pytania o ten sam fakt w jedno (dwóch agentów może pytać o to samo innymi słowami).
3. Zadaj je przez AskUserQuestion: do 4 pytań na wywołanie, kolejne wywołania przy większej
   liczbie. Opcje bierz z raportu agenta i do każdego pytania dodaj opcję „Nie wiem".
   Przy każdym pytaniu podaj jednym zdaniem, którego fragmentu biznesu dotyczy. Jeżeli agent
   oddał pytanie abstrakcyjne, przeformułuj je na konkretny przykład z domeny wejścia
   (sytuacja z przypadkami A, B, C; opcje mówią, co wychodzi w przykładzie), nie zmieniając
   reguły rozstrzygnięcia.
4. Rozstrzygnij werdykty **mechanicznie, regułą podaną przez agenta** (`A → PASUJE;
   B → NIE PASUJE`). „Nie wiem" albo odpowiedź spoza reguły = NIE PASUJE z adnotacją
   „nierozstrzygnięte, brak danych". Nie uruchamiaj agentów ponownie i nie interpretuj
   odpowiedzi szerzej, niż pozwala reguła.
5. Jeżeli pytań nie ma, pomiń tę fazę.

Jeżeli sesja jest nieinteraktywna, pokaż pytania w raporcie jako otwarte, a ich wystąpienia
zostaw poza opowieścią.

### FAZA 3 — RAPORT DOPASOWANIA

Raport składasz wyłącznie z raportów agentów i odpowiedzi użytkownika. **Nie dodajesz
wystąpień, których agent nie zgłosił, i nie podnosisz werdyktów.** Wolno ci werdykt obniżyć,
jeżeli cytat podany jako dowód nie występuje w wejściu.

Układ raportu:

1. **Wynik w jednym zdaniu**: ile wystąpień, których archetypów; albo „żaden archetyp nie
   pasuje".
2. **Wystąpienia** — tabela: `wystąpienie (język biznesu) | archetyp | kluczowy dowód (cytat)
   | zastrzeżenia`. Pod tabelą, dla każdego wystąpienia, lista `element archetypu ← pojęcie
   domenowe — cytat` z raportu agenta.
3. **Nie pasują** — po jednej linii na archetyp: dlaczego, w tym odrzucone tropy (słowa, które
   wyglądały obiecująco, i powód odrzucenia). Ta sekcja jest tak samo ważna jak poprzednia.
4. **Nierozstrzygnięte** — tylko gdy coś zostało bez odpowiedzi.
5. **Ten sam fragment w kilku archetypach** — jeżeli dwa wystąpienia powołują się na ten sam
   fragment biznesu, wymień to jako obserwację. To nie jest połączenie ani konflikt.

**Każdy archetyp najwyżej raz.** Jeżeli agent skanu mimo protokołu zgłosił kilka wystąpień jednego archetypu,
scal je w raporcie w jedno: nazwa obejmuje wszystkie fragmenty, cytaty są z każdego. Dalej archetyp
= jedno wystąpienie = najwyżej jeden mapper.

Jeżeli nie ma żadnego wystąpienia PASUJE, zakończ na raporcie. Nie pisz opowieści, nie
doczytuj referencji.

Po raporcie nie zatrzymujesz się na potwierdzenie: pokaż go i przejdź do FAZY 4. Użytkownik koryguje wynik
po propozycji na końcu skanu.

### FAZA 4 — OPOWIEŚĆ i łączenie

To ostatnia faza skanu; po niej zapis i propozycja. W pogłębieniu jej nie powtarzasz.

Opowiadasz **o wystąpieniach, każde osobno**. Nie opowiadasz „systemu jako całości".

- **Jedno zdanie otwarcia**: które archetypy tu występują i gdzie. Bez tezy o tym, czym
  system „w istocie jest", bez osi, warstw i centrów.
- **Akapit na każde potwierdzone wystąpienie**: co w tym biznesie jest wcieleniem archetypu
  (np. „pakiet internetu to konto, przyznanie pakietu to transfer, zużycie to wpis"),
  z cytatami z raportu. Język biznesu klienta, z nazwą archetypową w nawiasie przy pierwszym
  użyciu.
- **Czego nie ma**: jeden akapit o archetypach, które nie pasują, i dlaczego.

**Łączenie.** Przeczytaj `connections.md` i zastosuj dokładnie to, co tam jest, w tej
kolejności: czy powstaje Oferta, potem integracje, potem odniesienia semantyczne.
Dla każdego połączenia znajdź w wejściu cytat-dowód; bez cytatu połączenia nie ma.
Opisz je po akapitach o wystąpieniach, w dwóch osobnych sekcjach:

- **Integracje** — `A → B: co A zleca B — cytat (I1, I2 albo „samowolka")`. Jeżeli powstała
  Oferta, opisz ją tu najpierw: nazwa w języku biznesu i to, co przekłada, z cytatami.
- **Odniesienia semantyczne** — `A ⇢ B: jaki identyfikator lub rzut A trzyma i co on mówi
  — cytat`.

Nie zamieniaj odniesienia na integrację ani odwrotnie. Jeżeli
nic nie zadziałało, napisz: „Wystąpienia są niezależne; reguły łączenia nie dopuszczają tu żadnego
połączenia".

**Zapis.** Zapisz do pliku wskazanego przez użytkownika (bez wskazania: `archetypy.md` w katalogu roboczym)
sekcje: `## Wejście skanu` (dosłownie to, co dostali agenci skanu, łącznie z treścią plików wejścia, np. kontekstu systemu;
nagłówki obniżone tak, żeby żaden nie był wyższy niż `###`), `## Raport` (FAZA 3), `## Opowieść`
(FAZA 4) i `## Wystąpienia od agentów` (blok każdego wystąpienia PASUJE z raportu agenta
skanu, dosłownie, z cytatami i odpowiedziami z FAZY 2). Pogłębienie czyta wystąpienie i wejście z tego pliku.

**Propozycja (koniec skanu).** Poleć **jeden** archetyp z werdyktem PASUJE i mapperem: ten, którego
wystąpienie obejmuje najwięcej problemu; napisz jednym zdaniem dlaczego. Pod spodem daj gotowy
prompt pogłębienia w bloku kodu, z jego ID i ścieżką zapisanego pliku:

   ```
   /archetype-storyteller Pogłębienie: <ID>. Skan: <ścieżka pliku skanu>. Miejsca: 
   ```

   Napisz, że użytkownik wkleja ten prompt, po „Miejsca:” dopisuje po przecinku miejsca w kodzie (`Klasa.metoda`),
   które chce zmapować, pod spodem wkleja bolączki z adresami w kodzie (zaczynają się od
   `# BOLĄCZKI Z ADRESAMI W KODZIE`), dopiero potem Enter, i że pogłębienie uruchamia się w nowej sesji albo po `/clear`. Inne archetypy
   z PASUJE i mapperem wymień jednym zdaniem: ten sam prompt z ich ID. Gdy żadne wystąpienie PASUJE
   nie ma mappera, napisz, że nie ma czego pogłębiać. Napisz też, że bez listy miejsc mapper sam wybiera 5
   miejsc z najprostszą odpowiedzią, a „Miejsca: wszystkie” daje wiersz dla każdego miejsca z bolączek.

Na życzenie zrób też fazy 6–8. FAZA 8 zawsze idzie jako ostatnia. Mappera w skanie nie uruchamiasz.

### FAZA 5 — MAPOWANIE (pogłębienie: osobne uruchomienie)

Prompt zaczyna się od „Pogłębienie: <ID>”. **Nie robisz FAZ 1–4 ani fit-checku**: werdykt PASUJE jest
w pliku skanu. Przeczytaj plik skanu: weź blok wystąpienia `<ID>` z sekcji `## Wystąpienia od agentów` (z cytatami i odpowiedziami
z FAZY 2) i sekcję `## Wejście skanu`. Bolączki z adresami w kodzie bierzesz z promptu, dosłownie.

- Pliku skanu nie ma albo nie ma w nim wystąpienia `<ID>` z PASUJE: powiedz to i zaproponuj skan. Nie
  rób fit-checku za skan.
- Archetyp bez mappera w tej wersji: powiedz to i zakończ.
- Prompt bez bolączek (brak `# BOLĄCZKI Z ADRESAMI W KODZIE` albo pusto pod nim): zapytaj raz, czy je wkleić. Bez nich mapper
  mapuje sam problem, a `CO I JAK` to „brak bolączek w wejściu”.
- „Miejsca:” w prompcie: lista po przecinku (`Klasa.metoda` albo identyfikator wiersza `Q…|plik|metoda|linia`)
  → tryb „wskazane miejsca”; pusto → tryb „5 miejsc”; „wszystkie” → tryb „wszystkie miejsca”. Przekaż
  mapperowi tryb i listę w sekcji `## Tryb`.

Mapowania **nie robisz sam**. Każde wystąpienie mapuje osobny agent we własnym kontekście.

**W tej wersji skilla mappery są tylko dla: `party`, `pricing`, `accounting`** (tabela w `mappers/_protocol.md`). Wystąpień pozostałych archetypów nie mapujesz i nie uruchamiasz dla nich agentów: zostają w raporcie i w opowieści z dopiskiem „bez mapowania w tej wersji”. Jeżeli żadne wystąpienie PASUJE nie ma mappera, skan nie proponuje pogłębienia.

1. Uruchom **jednego agenta** dla wybranego archetypu (jego jedno, scalone wystąpienie), narzędziem
   Agent (`subagent_type: general-purpose`). Prompt:

   ```
   Mapujesz JEDNO wystąpienie JEDNEGO archetypu oprogramowania. Fit-check już się odbył.
   Archetyp: <ID>

   Najpierw przeczytaj w całości i stosuj ściśle:
   .claude/skills/archetype-storyteller/mappers/_protocol.md
   Ten plik mówi, skąd wziąć procedurę mapowania dla twojego archetypu i jak raportować.

   ## Wystąpienie (wynik fit-checku, werdykt PASUJE)
   <blok tego wystąpienia z raportu agenta skanu, dosłownie, razem z cytatami;
    oraz odpowiedzi użytkownika z FAZY 2, które go dotyczyły>

   ## Wejście
   <sekcja „Wejście skanu” z pliku skanu, dosłownie>

   ## Bolączki z adresami w kodzie
   <dosłownie z promptu pogłębienia (długie: zapisz do pliku i podaj ścieżkę bezwzględną): bolączki, pytania pod nimi, wołający, `plik:linia`, CO (co jest robione)
    i JAK (jak kod robi to dziś), odpowiedź (typ i co znaczy); albo „brak”>

   ## Tryb
   <„wskazane miejsca: <lista>”, „5 miejsc” albo „wszystkie miejsca”; co znaczy: mappers/_protocol.md, sekcja 6>

   Zwróć raport dokładnie w formacie z mappers/_protocol.md, sekcja 5. Nic poza nim.
   ```

2. Nie przekazuj agentowi raportów innych wystąpień ani swoich hipotez o połączeniach.
3. Poczekaj na wszystkie raporty. Zanotuj identyfikator każdego agenta: będzie potrzebny
   w FAZIE 5b.

### FAZA 5b — PYTANIA MAPPERA (od razu, tryb interaktywny)

Mapper nie może pytać użytkownika sam; oddaje pytania w raporcie. Zadajesz je **od razu**, gdy raport
przyjdzie, i od razu odsyłasz odpowiedzi.

1. Raport ze statusem `CZEKA NA ODPOWIEDZI`: zadaj jego pytania przez AskUserQuestion (do 4 na wywołanie),
   z opcjami z raportu i opcją „Zostaw wariant roboczy”. Pytanie bez konkretnego przykładu z domeny
   przeformułuj na przykład (jak w FAZIE 2).
2. Odeślij odpowiedzi agentowi narzędziem SendMessage (agent zachowuje kontekst): „Popraw model według
   odpowiedzi i zwróć PEŁNY raport w tym samym formacie (nie same zmiany); jeśli wyszły nowe pytania, oddaj je”. Jeżeli agenta
   nie da się wznowić, uruchom nowego z tym samym promptem, dołączając poprzedni raport i odpowiedzi.
3. Powtarzaj, aż status będzie `KOMPLETNE`, najwyżej 3 rundy. Pytania, które zostały, idą do podsumowania
   jako otwarte.
4. „Zostaw wariant roboczy” nie wymaga wznawiania agenta; decyzja zostaje w podsumowaniu jako założenie.
5. Sesja nieinteraktywna: pomiń tę fazę, pytania trafiają do podsumowania jako otwarte.

### FAZA 5c — ZEBRANIE i PODSUMOWANIE

Składasz jeden dokument z raportu mappera i **dopisujesz go do pliku skanu** jako `## Pogłębienie: <ID>`.
Opowieść i łączenie bierzesz z pliku skanu; nie piszesz ich od nowa: w podsumowaniu odsyłasz do sekcji `## Opowieść`,
chyba że pogłębienie zmienia połączenia.

**Sekcja pogłębienia to kontrakt wejściowy następnego zadania** (skill `parallel-models` robi z niej specyfikację).
W całej sekcji jedynym nagłówkiem `##` jest `## Pogłębienie: <ID>`: nagłówki z pola `MODEL` i z bolączek obniżasz
tak, żeby żaden nie był wyższy niż `###` (inaczej czytający sekcję do następnego `##` ją utnie).
Dlatego zawsze kończy się dwiema podsekcjami, w tej kolejności:
- `### Bolączki z adresami w kodzie (wejście pogłębienia)` — bolączki z promptu, dosłownie, od `# BOLĄCZKI Z ADRESAMI W KODZIE`
  do końca (z nagłówkami obniżonymi o dwa poziomy); bez bolączek: „brak bolączek w wejściu”;
- `### Implementacja referencyjna` — pole `IMPLEMENTACJA REFERENCYJNA` z raportu mappera, bez zmian. **Nie poprawiasz i nie uzupełniasz modeli**:
przenosisz je. Wolno ci tylko usunąć wiersz, którego cytat nie występuje w wejściu.

Układ podsumowania:

1. **Wynik w jednym zdaniu** i tabela: `wystąpienie | archetyp | poziom złożoności |
   status mapowania | liczba założeń`.
2. **Opowieść** o wystąpieniach i **łączenie** dokładnie według FAZY 4. Do ustalania
   odniesień semantycznych użyj też pól `IDENTYFIKATORY I RZUTY` z raportów mapperów: to są
   kandydaci, a każdy nadal wymaga cytatu i istniejącego drugiego końca.
3. **Mapowanie**: pole `MODEL` z raportu mappera, a pod nim jego założenia.
   **Co i jak**: tabela z pola `CO I JAK` (CO | JAK STARE | JAK W ARCHETYPIE), przeniesiona bez zmian.
   **Trzy ficzery z archetypu**: pole `FICZERY`, bez zmian.
4. **Pojęcia niezmapowane, zbiorczo**: tabela `pojęcie | które wystąpienie je odrzuciło`.
   Pojęcie odrzucone przez jedno wystąpienie, a zmapowane przez inne, oznacz jako pokryte.
   Reszta to fragmenty biznesu poza archetypami; nie przypisuj ich nikomu.
5. **Sprzeciwy wobec werdyktu**: jeżeli mapper zgłosił, że wystąpienie nie daje się
   zmapować, pokaż to wyraźnie. Takiego wystąpienia nie używasz w opowieści ani w łączeniu.
6. **Otwarte**: założenia zmieniające zachowanie biznesowe i pytania bez odpowiedzi.
7. **Implementacja referencyjna**: raz, w końcowej podsekcji `### Implementacja referencyjna` (niżej).

Po podsumowaniu zapytaj użytkownika, co poprawić, i zaproponuj fazy 6–8.

### FAZA 6 — RYSUNEK (na życzenie)

Diagram mermaid **wystąpień**, nie architektury:

- węzeł = wystąpienie, z nazwą domenową i archetypem (np. `Pakiety danych [Accounting]`),
- krawędzie tylko dla połączeń ustalonych w FAZIE 4,
- **integracja** to strzałka ciągła z etykietą, co jest zlecane, i numerem reguły (I1, I2
  albo „samowolka"); wychodzi wyłącznie z Orderingu, Oferty lub Rules,
- **odniesienie semantyczne** to linia przerywana z nazwą identyfikatora lub rzutu,
- Ofertę rysuj jako osobny węzeł o innym kształcie, z nazwą domenową i dopiskiem `[Oferta]`;
  strzałki wychodzą z Oferty do składanych wystąpień, a między nimi samymi strzałek nie ma
  (np. żadnej strzałki Product ↔ Inventory),
- wystąpienia bez połączeń rysuj jako osobne, niepołączone węzły; rysunek złożony z samych
  wysp jest poprawny,
- żadnych warstw, grup „core/supporting", strzałek upstream/downstream.

### FAZA 7 — PRZEŁĄCZNIK JĘZYKA (na życzenie)

Ta sama opowieść w drugim słowniku. **Konstrukcja zdań jest identyczna, zamieniają się
wyłącznie nazwy**, żeby było widać, że to ten sam model.

- Wersja archetypowa: „**Accounting** prowadzi konta i księguje transfery."
- Wersja domenowa: „**Rejestr tokenów** prowadzi salda tokenów i księguje ich przyznania."

1. Z raportu (i mapowania z pogłębienia, jeśli są) zbuduj **słownik podmian** `nazwa archetypowa ↔
   nazwa domenowa` i pokaż go jako tabelę.
2. Napisz opowieść raz, jako szablon ze slotami, i wyrenderuj w obu słownikach. Zdanie N obu
   wersji różni się tylko podmienionymi nazwami.
3. Pokaż obie wersje obok siebie (akapit przy akapicie albo tabela dwukolumnowa).

### FAZA 8 — HISTORIA KOŃCOWA (na życzenie, zawsze jako ostatnia)

Gdy wystąpienia są potwierdzone, połączenia ustalone i zrobione jest wszystko, o co
użytkownik prosił z faz 5–7, możesz opowiedzieć **całą historię tego biznesu archetypami**,
jednym ciągłym tekstem. FAZA 4 przedstawia wystąpienia osobno, jak hasła w spisie; tutaj
składasz je w jedną opowieść do przeczytania od początku do końca.

- Prowadź historię wzdłuż tego, co dzieje się w biznesie (od pierwszego kontaktu klienta
  do końca sprawy albo wzdłuż jednego dnia pracy), a nie wzdłuż listy archetypów.
- Każde potwierdzone wystąpienie wchodzi do historii w miejscu, w którym biznes go używa,
  pod nazwą domenową i z archetypem w nawiasie.
- Przejścia między wystąpieniami opisujesz tylko tam, gdzie jest ustalone połączenie
  z FAZY 4, i zgodnie z jego rodzajem: integracja to „zleca, pyta, każe", odniesienie
  semantyczne to „pamięta, do czego się odnosi". Gdzie
  połączenia nie ma, historia mówi wprost, że te dwie rzeczy żyją obok siebie.
- Nie dodajesz niczego nowego: żadnych wystąpień, połączeń, modułów ani faktów spoza
  raportu i odpowiedzi użytkownika. Jeżeli w historii brakuje ogniwa, zostaw lukę i ją nazwij.
- Jeżeli zrobiono mapowanie (pogłębienie), korzystaj z jego modeli i niezmienników; jeżeli FAZĘ 7, opowiedz
  w słowniku, który użytkownik wybrał.
- Zakończ jednym akapitem o tym, czego w tej historii nie ma: archetypy, które nie pasują,
  i fragmenty biznesu, których żaden archetyp nie objął.

Jeżeli użytkownik woli opowiedzieć tę historię sam, poproś o nią i sprawdź ją z raportem:
wskaż zdania, które mówią o wystąpieniu lub połączeniu bez pokrycia w ustaleniach.

## Co dalej — generacja kodu

Gdy użytkownik chce przejść do kodu, przekaż skillowi **`archetype-implementer`** podsumowanie
pogłębienia (FAZA 5c) dla wybranych wystąpień: mapowania, niezmienniki, założenia,
słownik podmian oraz sekcje „Integracje" i „Odniesienia semantyczne". Bez pogłębienia
nie ma czego implementować; najpierw go uruchom. Każde wystąpienie implementuje się osobno.

## Reguły twarde

- Dopasowanie ocenia agent archetypu, nie orkiestrator. Orkiestrator nie dodaje wystąpień
  i nie podnosi werdyktów.
- Każdy archetyp skanuje osobny agent z własnym kontekstem. Nie łącz kilku archetypów
  w jednym agencie i nie rób skanu samodzielnie „bo wejście jest krótkie".
- Każde wystąpienie i każde połączenie ma dowód-cytat z wejścia. Słowo-klucz nie jest dowodem.
- „Nic nie pasuje" i „pasuje jeden archetyp" to poprawne wyniki. Nie ma oczekiwanej liczby
  dopasowań.
- Połączenia tylko według `connections.md`. Integracje (strzałki) wolno prowadzić wyłącznie
  od Orderingu, Oferty i Rules; odniesienia semantyczne może mieć każdy archetyp.
  Tych dwóch rodzajów nie mieszasz.
  Reguł łączenia nie wymyślasz ani nie rozszerzasz; dopisuje je autor skilla.
- Żadnej architektury: modułów, granic, warstw, osi, kierunków zależności. Jedyny wyjątek
  to Oferta, opisana w `connections.md`.
- Mapowanie robi agent-mapper we własnym kontekście: jeden archetyp wybrany przez użytkownika, jedno wystąpienie,
  jeden agent. Orkiestrator
  nie mapuje sam i nie poprawia modeli mapperów.
- Pytania do użytkownika: raz po skanie, zbiorczo (tylko te, które zmieniają werdykt), i od razu po każdym
  raporcie mappera (tylko te, które zmieniają zachowanie biznesowe modelu).
- Skan i pogłębienie to osobne uruchomienia. Skan kończy się zapisem, propozycją jednego archetypu i gotowym
  promptem pogłębienia; mappera nie uruchamia. Pogłębienie nie powtarza skanu ani fit-checku.
