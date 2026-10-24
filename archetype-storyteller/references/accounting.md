# Archetyp Accounting — plik referencyjny

Źródło: moduł M06 szkolenia (Scenka 1, L01–L13, Scenka 2). Opisuje KAŻDY aspekt archetypu
Accounting omówiony w transkrypcji: od problemu pojedynczego pola `amount`, przez pełny model
(Account, Entry, Transaction, Validity, alokacje, konta projekcyjne i pozabilansowe, constrainty,
PostingRules), po miejsce w architekturze i zastosowania niefinansowe.

---

## 1. Esencja — wartość w systemach, pojęcie i znaczenie

Accounting to **archetyp śledzenia ruchu wartości** — nie księgowość, nie faktury, nie moduł
bankowy. To model, który pozwala jednocześnie: identyfikować zasoby, zapisywać historię operacji,
rozliczać błędy i korekty, analizować genezę stanu ("skąd się wzięło to saldo"), wprowadzać spójne
reguły biznesowe, budować elastyczne raporty i tworzyć reguły reagowania na zmiany wartości.

W prawie każdym biznesie istnieją zasoby, które wędrują — czasem cyfrowo, czasem dosłownie:

| Branża | Wędrująca wartość |
|---|---|
| Bankowość | pieniądze między kontami: przelewy, prowizje, odsetki, opłaty, blokady |
| Logistyka | paczki zmieniające lokalizację, status, właściciela (bus → sortownia → tir → odbiorca) |
| E-commerce | towary: magazyn → półka → zwrot; salda kart podarunkowych, punkty |
| Telekomunikacja | pakiety danych: przyznane, zużyte, dokupione, przeniesione na kolejny miesiąc |
| HR | dni urlopowe (wypoczynkowy, macierzyński, okolicznościowy), wymiar czasu pracy, rozliczenie etatu |
| Energetyka | przedpłaty, nadpłaty, rezerwy na korekty zużycia |
| SaaS / IT | zużycie zasobów chmurowych, licencje, API calls |

Kluczowa myśl otwierająca moduł (telekom, pakiet internetu): gdy klient chce wiedzieć **ile
przyznano, ile zużył, ile pozostało, co jest zablokowane (sesja może trwać) i do kiedy pakiet jest
ważny** — to nie jest pole `remainingDataMegabytes` aktualizowane CRUD-em z booleanem na blokadę.
To Accounting: *przyznanie* to transfer (z puli zewnętrznej na konto klienta), *zużycie* to
transfer z konta klienta na konto zewnętrzne, *doładowanie* to transfer z zewnętrznej puli na
konto, a *blokada* to także wpis na koncie. Wystarczy w miejsce słowa "pieniądze" wstawić
"internet w gigabajtach" — model pozostaje ten sam.

Dlaczego to ważne biznesowo i prawnie:
- **Prawo tego wymaga** — trzeba wiedzieć, co się wydarzyło i kiedy (sprawozdawczość, regulator).
- **Klient pyta**: ile mam danych, skąd blokada 10 zł, dlaczego saldo takie, czemu premia niska.
- **Firma chce rozumieć**: co generuje przychody, co koszty, gdzie ucieka wartość.
- **Trzeba umieć cofać błędy**, realizować reklamacje, odtwarzać historię.
- **Na tej podstawie zapadają decyzje**: bonusy, rabaty, limity.

Uogólnione pytania, na które system musi umieć odpowiedzieć: *Co się wydarzyło? Kiedy? Co miało
wpływ na stan? Czy możemy to cofnąć? Czy możemy to zrozumieć?* Klient, który nie rozumie — dzwoni
(koszt infolinii, reklamacje, frustracja). Firma, która nie rozumie — nie potrafi liczyć.

Sygnał alarmowy w organizacji: istnienie dedykowanych stanowisk ludzi, którzy wyłącznie analizują
zgłoszenia "dlaczego klient ma takie saldo" — grzebią po logach, zestawiają dane z trzech
systemów, piszą SQL-e, robią screeny. Ich praca ratuje firmę operacyjnie, ale jej istnienie
oznacza: system nie daje odpowiedzi, nie wspiera transparentności → ogromne koszty operacyjne,
brak automatyzacji, rosnąca zależność od ekspertów-ludzi.

**Accounting to nie tylko pieniądze.** Złotówki, kilogramy, gigabajty, licencje, bilety, punkty,
dni urlopu, paczki — w pewnych kontekstach są od siebie nierozróżnialne. To esencja myślenia
kontekstowego: dostrzeganie wspólnych struktur tam, gdzie pozornie mamy różne światy.

---

## 2. Sygnały dopasowania — triggery językowe

Nie szukaj od razu słów "konto", "saldo", "pieniądze". Słuchaj, co naprawdę się dzieje — archetyp
często "siedzi cicho, przebrany za coś zupełnie innego" (L13).

### Triggery słownikowe (słowo biznesowe → element archetypu)

| Słyszysz | Prawdopodobnie oznacza |
|---|---|
| przyznane / przyznać | credit (wpis zwiększający) — transfer z puli zewnętrznej |
| zużyte / zużycie / wykorzystane | debit z konta zasobów |
| pozostałe / do wykorzystania | saldo konta (balance) |
| zablokowane / blokada / rezerwacja | wpis na koncie (osobne konto rezerwacyjne / reguła blokady), NIE boolean |
| naliczyć / naliczenie | wygenerować zapis (Entry), często przez PostingRule |
| odebrać / anulować / wycofać | korekta — odwrócenie wpisu / transakcja wycofująca (refId) |
| transfer / przeniesienie / przeksięgowanie | transakcja: debit na jednym koncie + credit na drugim |
| saldo / stan / bilans | Account.balance; pytanie o genezę stanu → historia Entries |
| historia / audyt / "skąd się wzięło" | trwały, audytowalny rejestr wpisów |
| ważne do / wygasa / przepada / przedawnienie | Validity na wpisie + kompensacja przeterminowanych |
| rozliczyć / rozliczenie okresu / zamknięcie dnia | Account-based firing, kompensacje, agregacje |
| doładowanie / top-up | credit na konto z puli zewnętrznej |
| nadpłata / zaliczka / rezerwa | wpis z własnym oknem ważności / konto komponentu |
| cashback / bonus / premia "gdy..." | PostingRule (reguła reaktywna) |
| sumaryczne zużycie z wielu produktów/numerów | konto projekcyjne (filtr nad wieloma kontami) |
| symulacja / podgląd / "ile by było" | konto OFF_BALANCE / MEMO (np. BILLING_PREVIEW, CORRECTION_PREVIEW) |

### Triggery zdaniowe (złożone)

- *"Klient zużył już pakiet, ale został mu bonus"* → dwa konta (podstawowe + bonusowe), jedno się
  debituje, drugie czeka; bilans + reguła kolejności zużycia (strategia alokacji FIFO/LIFO/manual).
- *"Pracownikowi przysługuje 1 dzień urlopu za 18 przepracowanych dni"* → Accounting z PostingRule.
- *"Kiedy przekroczy 100 zł wydatków, przyznaj 10% cashbacku"* → system obserwuje konto, reguła
  księgowa tworzy wpis zwrotny.

### Pytania kontrolne ("czy to Accounting?") — z L13

1. Czy mam wartości, które zmieniają się w czasie?
2. Czy muszę rejestrować każdą zmianę wartości?
3. Czy potrzebuję historii, audytu, korekt wartości?
4. Czy logika działania wygląda jak: coś się wydarzyło → coś trzeba zapisać → rozliczyć?
5. Czy różne procesy operują na tych samych liczbach, ale w różnych kontekstach?

Jeśli tak — "pachnie Accountingiem".

### Triggery kodowe (symptomy w istniejącym kodzie)

- Pole `amount` / `remainingX` / `availableBalance` / `monthlySpendingLimit` doklejone do encji
  biznesowej (klient, umowa, karta) i aktualizowane update'em.
- Pola typu `availableBalanceInPLN` albo doklejane `currency` "ratujące" nowy rynek.
- Boolean `blocked` zamiast modelu blokady.
- `correlationId` ręcznie zszywający zdarzenia z wielu systemów.
- Pary ad-hoc zdarzeń kompensujących bez standardu: `...Reversed`, `...Cancelled`, `...Negated`.
- Cronjoby i handlery zdarzeń implementujące "specyficzne" naliczenia (cashback, limit) twardo w kodzie.

---

## 3. Anty-sygnały / granice archetypu

- **Accounting ≠ silnik billingowy.** Zmienne ceny w czasie, segmentacja klientów, taryfy, rabaty,
  promocje, harmonogramy → osobny moduł billingowy/rozliczeniowy, który wykona kalkulacje i wyśle
  do Accountingu *jedno precyzyjne polecenie*. "Accounting nie ma znać taryf. Ma znać wartość i ją
  zaksięgować."
- **Accounting ≠ silnik reguł (rule engine).** AccountRule/constraint to punkt integracji; pełny
  silnik reguł z własnym DSL-em, kontekstem, warunkami i akcjami to oddzielny archetyp.
- **Accounting ≠ warstwa procesowa.** Procesy wieloetapowe z cyklem życia, stanem i autoryzacjami
  (np. safeguarding: zablokuj środki klienta → wykonaj operację z kont operacyjnych → rozlicz →
  odblokuj; compliance na wielu etapach) wymagają modelu **zlecenia transakcyjnego** (złożone →
  zaakceptowane → rozliczane → zakończone), który dopiero na końcu tworzy wpisy księgowe.
  Maszyna stanów na metadanych transakcji lub podtypach "zabiłaby kombinatorycznie". Warstwa
  procesowa to naturalne *uzupełnienie* Accountingu, nie konkurencja.
- **Accounting nie powinien znać intencji biznesowych.** Jeśli reaguje na zdarzenia domenowe
  (płatność przyszła, proces komorniczy, system sprzedażowy) i koduje w regułach wiedzę domenową —
  to przeciek; inne moduły mają zlecać mu czyste transakcje (patrz §13).
- **Pojedyncza, nieaudytowalna wartość bez historii i korekt** — jeśli biznes naprawdę nigdy nie
  pyta "skąd", "kiedy", "cofnij", archetyp może być przerostem (choć transkrypcja ostrzega, że te
  pytania zwykle przychodzą później).
- **Nie modeluj w Accountingu procesów, rozliczeń, cenników, produktów** — zarządzaj w nim
  wartością. Tylko wtedy złożone scenariusze buduje się z prostych, spójnych komponentów ("szeroki
  zielony klocek LEGO", nie puzzle z różnych zestawów).

---

## 4. Rzeczywista struktura wartości — komponenty i semantyka (L02)

### Formy wartości finansowej spotykane w systemach
Środki na koncie bankowym (availableBalance), saldo prepaid (telekom, kurier w logistyce), kwota
na wypożyczenia rowerów, kredyt odnawialny (availableCreditLimit), miesięczny limit karty flotowej
(monthlySpendingLimit), budżet zakupowy B2B, przychód per użytkownik/segment/kanał
(monthlyRevenue). Konsumenci tych wartości to nie tylko klienci — także zespoły finansowe,
controllingowe, analityczne. Dwa podstawowe pytania: *ile klient ma/wykorzystał* oraz *ile firma
zarobiła/straciła*.

### Dlaczego jedno pole `amount` nie wystarcza — kaskada problemów

1. **Tylko bieżący stan.** Klasy z polem amount trzymają wyłącznie "teraz"; poprzedni stan znika —
   bez historii, śladów, kontekstu. Stan to skutek; biznes pyta o **przyczynę** ("dlaczego
   zabraliście mi 10 zł?", "dlaczego limit spadł wczoraj o 14:00?").
2. **Logi to nie historia.** Problemy logów: brak gwarancji spójności ze źródłem prawdy (operacja
   mogła nie wpłynąć na bazę / zmiana mogła nie trafić do loga); przy skalowaniu horyzontalnym
   wymagają agregacji; są nieustrukturyzowane; dodawane dopiero *po* incydencie; niedostępne dla
   użytkowników biznesowych.
3. **Zdarzenia domenowe pomagają warunkowo.** Audyt w formie zdarzeń jest użyteczny tylko gdy:
   zdarzenia są trwale zapisane (Event Store / Message Log), istnieje gwarancja emisji po
   skutecznej operacji (Transactional Outbox), a zdarzenia determinują stan (event sourcing lub
   projekcje sterowane zdarzeniami). Ale: każde zdarzenie jest specyficzne dla biznesu, każde nowe
   wymaga nowej logiki, projekcji, integracji — to ogranicza skalowalność modelu.
4. **Dwa momenty czasowe.** `occurredAt` (kiedy operacja faktycznie miała miejsce) vs `appliesAt`
   (od kiedy obowiązuje rozliczeniowo/podatkowo — np. faktura zaksięgowana na koniec miesiąca).
   Dla księgowości, regulatora i analityki ten drugi bywa ważniejszy. Eventy zwykle niosą tylko
   jeden; zgranie obu światów bez wspólnej referencji bywa niemożliwe.
5. **Brak powiązań operacji.** Jedna wpłata wywołuje skutki w wielu systemach (saldo + zaliczka
   VAT + przychód; zwrot = mniejszy przychód + wycofana prowizja + statystyki; doładowanie prepaid
   aktywuje bonus = koszt marketingowy; faktura częściowo z salda kredytowego + przelew; przedpłata
   za energię = netto + VAT + rezerwa na korektę). `correlationId` to "techniczna naklejka" —
   mówi *dlaczego* zdarzenie wystąpiło (do jakiej operacji biznesowej należy), w odróżnieniu od
   identyfikatorów encji (accountId, invoiceId — *czego* dotyczy). Ale niczego nie wymusza: jeden
   system go nie przekaże albo nada inaczej — i nici z analizy. To metainformacja, nie element
   modelu; wymagania spełniamy technicznie, ale **żaden model ich nie wspiera**.
6. **Wycofywanie.** Biznes to nie undo w edytorze: delete na bazie = zakłamywanie rzeczywistości
   (posądzenie o machloje). Potrzebny ślad + referencja do operacji pierwotnej + powód. Na
   zdarzeniach wymaga ręcznie kodowanych operacji kompensujących (DepositReceived→DepositReturned,
   VatAdvanceBooked→VatAdvanceReversed, NetBalanceCredited→NetBalanceDebited) i wzorca Sagi
   (seria lokalnych transakcji + akcje kompensujące zamiast wspólnego locka). Konsekwencje:
   złożoność rośnie wykładniczo, logika kompensacji rozsiana po zespołach, brak formalnego modelu
   (system przechowuje tylko skutki), brak standardu korekt (reversed/cancelled/negated), problemy
   kolejności, duplikatów i opóźnień zdarzeń.
7. **Ważność czasowa.** Nie wszystko jest wieczne: promocyjny limit +100 zł na święta, miesięczny
   budżet flotowy, nadpłata za prąd rozliczalna 6 miesięcy. Wartość widoczna dziś jutro może "nie
   istnieć", choć nikt jej nie zabrał. `amount` nie ma daty i kontekstu; pola validFrom/validTo w
   tabelach to początek, ale potrzebna jest logika: saldo na dzień, strategia zużycia (FIFO/LIFO),
   aktualizacja po wygaśnięciu — każda konsumpcja musi wiedzieć, *z czego* korzysta.
8. **Komponenty kwoty.** Jedna liczba to fikcja: rata 1000 zł = 800 kapitał + 150 odsetki + 50
   opłata; zwrot 200 zł = 160 towar + 40 potrącona wysyłka; bonus 100 zł = 50 promocyjne (tylko
   internet) + 50 główne; nadpłata 300 zł = 250 energia + 50 rezerwa. Dla klienta bez znaczenia,
   dla księgowości/podatków/marketingu/regulatora — ogromne.
9. **Analiza wielowymiarowa.** Pytania typu: odsetki klienta w tym roku, przelewy od kontrahenta,
   doładowania promocyjne per kanał, przychód z portalu w lipcu, korekty z anomalii zużycia.
   Rozwiązania zastępcze: logi (nie), selecty + Excel + ręczna praca (kosztowne, błędogenne),
   API Composition / CQRS (najpopularniejsze, ale to wszystko praca "ekstra", bo model nie wspiera).
10. **Spójność.** Rata 1000 zł: kapitał 800 + odsetki 192 = 992. Gdzie 8 zł? W historii znajdziesz
    jedynie niespójność — wykrytą na zamknięciu dnia, przez telefon klienta albo księgowość;
    potem "wykopaliska, selecty i dzielny update na produkcji". Antidotum: podwójne księgowanie.
11. **Reaktywność.** Pole amount samo z siebie nie zareaguje ("spłacił wcześniej → cashback 1%",
    "wpływy z pensji > 8 tys. → limit 3 tys."). Cronjoby i handlery to specyficzne, ręczne kodowanie.

**Wniosek L02:** to nie błędy implementacji — to ograniczenia samego podejścia (klasycznego,
dosłownego modelowania wartości). Potrzebny model radzący sobie z historią, powiązaniami,
komponentami, ważnością, anulowaniem, automatycznym księgowaniem i spójnością — Accounting.

---

## 5. Elementy modelu: Account, Entry, Transaction (L03–L04)

### Account

| Pole | Semantyka |
|---|---|
| `AccountId` | unikalna tożsamość; wartość staje się śledzalnym, niezależnym bytem |
| `balance: Money` | bieżący stan (Money = wartość + waluta + operacje arytmetyczne; kandydat na osobny archetyp) |
| `AccountName` | nazwa semantyczna: zwykły string lub struktura `client:1234:vat`, `fleet:bonus:october` — aliasy/etykiety dla debugowania, UI, konfiguracji, mapowań administracyjnych; oddzielona od tożsamości, więc bezpiecznie zmienialna/lokalizowalna |
| `AccountType` | klasyfikacja funkcji: ASSET, LIABILITY, REVENUE, EXPENSE, OFF_BALANCE — **umowna etykieta, nie sztywny schemat** |
| `rules` | podpinane/odpinane obiekty reguł (patrz §10) |

Kluczowe decyzje projektowe:
- **Własność NIE wchodzi do modelu konta.** Informacja "konto należy do klienta Adama / karty
  Marka" żyje poziom wyżej (np. archetyp Party). Gdyby wyciekła do Account, model nie różniłby się
  od encji z masą metadanych — byłby zanieczyszczony przypadkami użycia; im więcej danych w
  obiekcie, tym więcej funkcji i powodów do zmiany.
- **AccountType jest zależny od domeny**: kredyt klienta −5000 zł to dla banku ASSET (przyszła
  należność), dla klienta LIABILITY. Typ służy do: stosowania reguł (czy saldo może być ujemne),
  filtrowania w analizach, zarządzania zachowaniem (czy obowiązuje podwójny zapis). To sygnał, nie
  centralna oś konstrukcji — nowy typ (np. bonus) można dodać bez psucia reszty.

### Entry (wpis)

| Pole | Semantyka |
|---|---|
| `EntryId` | jednoznaczna identyfikacja: wyszukiwanie, śledzenie wpływu na saldo, referencje w kompensacjach |
| `AccountId` | wpis zawsze należy do konta — "nie ma wpisu bez konta" |
| typ: `DEBIT` / `CREDIT` | dwie operacje zmieniające stan zasobu |
| `amount: Money` | wartość |
| `occurredAt` | kiedy operacja miała miejsce w rzeczywistości |
| `appliesAt` | od kiedy efekt finansowy obowiązuje (rozliczenia okresowe, progi podatkowe, limity); bywa tożsame z occurredAt |
| `MetaData` | mapa klucz–wartość: źródło operacji, typ promocji, kanał, inicjator, id zewnętrzne |
| `Validity` | okres ważności wpisu (L06) |
| `appliedTo` | opcjonalna jawna relacja alokacji do innego wpisu (L06) |

- **Semantyka debit/credit.** W modelu archetypu pragmatycznie: credit = dodaj, debit = odejmij.
  W klasycznej rachunkowości znaczenie zależy od typu konta i równania bilansowego (aktywa =
  pasywa + kapitał własny): na ASSETS debit zwiększa, credit zmniejsza; na LIABILITIES/EQUITY
  odwrotnie; na REVENUE credit zwiększa przychód; na EXPENSE debit zwiększa koszt — dlatego
  w księgowości nie ma wartości ujemnych (zmianę wyraża typ wpisu, nie znak). Nasza konwencja to
  decyzja projektowa, nie prawda objawiona; przy modelu stricte księgowym można interpretować
  debit/credit per AccountType, zastąpić je increase/decrease albo trzymać tylko kwoty dodatnie.
  **Debit i credit to intencje operacyjne, nie znaki kwot.** Uproszczenie działa, bo jest czytelne
  językowo, wygodne w transakcjach, spójne z operacjami użytkowników, otwarte na reinterpretację.
- **Wpisy są niemutowalne** — element audytowalnej historii. Podmiana wartości pod tym samym ID =
  oszustwo; przeliczenia wymagają innego mechanizmu (OFF_BALANCE, §9).
- **MetaData jako wentyl bezpieczeństwa**: zamiast nowych pól (promotionCode, sourceSystem,
  channelId, salesRepId, productType) — wpisy w mapie. Model domenowy zostaje czysty i stabilny,
  struktury reużywalne między kontekstami, metadane interpretują warstwy wyższe (reguły reaktywne,
  widoki, integracje). Elastyczność do używania rozważnie.

### Zachowanie: gdzie żyje addEntry — trzy podejścia

1. **Pełne oddzielenie** (Entry samodzielny, referencja przez AccountId, logika w serwisie): tanie
   i lekkie, ale zero gwarancji spójności (równoległe wpisy → przekroczenie limitu, ujemne saldo);
   walidacje i blokady rosną w serwisach — system bez granic spójności.
2. **Pełne przeniesienie do konta** (Account trzyma kolekcję wpisów, addEntry na obiekcie): mocna
   spójność i zgodność z językiem ("dodaj wpis na koncie"), ale wysoka cena — konto ze 100 tys.
   operacji zalewa pamięć; typowy błąd "adeptów DDD": chciwe modelowanie granicy spójności
   natychmiastowej tam, gdzie niepotrzebna.
3. **Kompromis (REKOMENDOWANE)**: Account ma addEntry i **zna bieżący stan (balance), ale nie
   trzyma historii**; konstruktor nie przyjmuje kolekcji wpisów. Konto jest strażnikiem spójności:
   przyjmuje wpis, weryfikuje reguły bieżącego stanu, aktualizuje saldo; historia trafia do bazy
   i jest czytana niezależnie (stronicowanie, filtrowanie, agregacje).

Klasyfikacja reguł, która uzasadnia kompromis:
- **Reguły stanu bieżącego** (czy nie zejdziemy poniżej zera, czy nie przekroczymy limitu) —
  sprawdzane natychmiast, przy addEntry; wystarczy aktualny stan.
- **Reguły odwołujące się do przeszłości** ("jeśli zapłacił fakturę w 30 dni → bonus", "brak
  obciążeń przez miesiąc → konto nieaktywne") — nie blokują operacji; to reguły procesowe,
  asynchroniczne, Eventual Consistency; realizuje je inny proces (zdarzenia, zapytania analityczne).
  Kluczem projektowym jest **rozpoznanie i klasyfikacja reguł na natychmiastowo i końcowo spójne**.

Persystencja: relacyjnie — entries referują AccountId, Account bez kolekcji; dokumentowo — osobne
dokumenty powiązane referencją; możliwe strategie hybrydowe. Oddzielenie odpowiedzialności:
Account zna tożsamość, bieżący stan, metadane; Entry to atomowy, osadzony w czasie zapis zmiany.
Nośnikiem zmiany jest operacja/transakcja, nie encja.

### Transaction (L04)

Transakcja to **pojęcie nadrzędne nad wpisami** — jawny model zależności finansowych zamiast
zszywania po fakcie correlationId. Mówi *co, kiedy i dlaczego* się wydarzyło. Można o niej myśleć
jak o **agregacie procesowym**: określa granice spójności i egzekwuje istotną operację biznesową.

| Element | Semantyka |
|---|---|
| `TransactionId` | audytowalność, historia, wycofywanie całości, reguły spójności |
| `type` | semantyczny identyfikator intencji ("co się wydarzyło biznesowo": wpłata, opłata, korekta); baza do raportów ("wszystkie korekty na koncie Adama") i reguł ("korekty zatwierdza główna księgowa") |
| `occurredAt` / `appliesAt` | czasy transakcji, propagowane do wpisów |
| `refId` | referencja do transakcji bazowej przy wycofaniu (L05) |
| `metaData` | kontekst |
| wpisy + **referencje do obiektów Account** | transakcja zna kontekst, na który wpływa |
| `execute()` | wykonanie wpisów na kontach |

- **CRC**: Transaction (Class) ma odpowiedzialność (Responsibility) wykonania wpisów (Entry) na
  kontach (Account); współpracuje (Collaboration) z Account i Entry. `execute` to klasyczny
  **Command Pattern** (GoF): transakcja wie, które konto co powinno dostać, i to robi — bez
  serwisów, delegacji, logiki rozsianej po systemie.
- **Budowa przez Builder (GoF) + TransactionBuilderFactory.** Poprawność transakcji to nie tylko
  składnia, ale zgodność z regułami i stanem systemu (czy konto istnieje, czy appliesAt w
  dozwolonym przedziale, czy środki ważne). Walidacje w serwisach = każdy klient musi wiedzieć
  wszystko, łatwo pominąć. Builder jest wewnętrznym DSL-em: deklaratywnie opisuje transakcję
  (kiedy wystąpiła, kiedy obowiązuje, typ, metadane, wpisy "zabierz z jednego konta, dodaj do
  drugiego") i chroni przed błędami: brak timestampu, nieistniejące konto, ujemna kwota,
  niedopasowana waluta, brak wpisu przeciwstawnego. Factory kapsułkuje zależności: repozytoria
  kont/transakcji/wpisów, alokator wpisów, zegar — jeden punkt wejścia; Builder wychodzi z niej
  gotowy do walidacji i alokacji. Zyski: bezpieczeństwo zmian (reguły w jednym miejscu),
  elastyczność scenariuszy bez rozdmuchiwania modeli, czytelność DSL-owa.

Przykłady przepływu wartości:
- **Bank, rata 1000 zł**: debit konta klienta 1000; credit kapitał 900, credit odsetki 80,
  credit opłaty serwisowe 20 (w innym miejscu transkrypcji wariant 800/150/50 — proporcje umowne).
- **Sklep, zwrot 123 zł** z zakupu 369 brutto: debit przychodów 100, debit VAT 23, credit portfela
  klienta 123.

---

## 6. Wycofywanie transakcji i pełna historia (L05) — storno vs update

Błędy są nieuniknione: podwójna płatność, wpłata zaksięgowana bez powodu, bonus przyznany nie temu
użytkownikowi. Potrzebujemy **rewersu — odwrócenia skutków — a nie usunięcia** (storno, nie update
ani delete).

Zasada: każdemu creditowi z transakcji bazowej odpowiada debit o tej samej wartości i odwrotnie.
Wycofanie = **transakcja kompensująca (wycofująca)**, która:
- jest zwykłą transakcją w historii (pełen ślad, audytowalność),
- nosi `refId` wskazujący transakcję bazową ("co było wycofywane i że to wycofanie"),
- powstaje przez API Buildera: metoda `reverting(baseTransactionId)` — generuje wpisy
  przeciwstawne automatycznie. Ręczne budowanie odwrotności przez klienta jest błędogenne
  (pominięty wpis = niespójność); `reverting` zdejmuje ten ciężar, a nawet przy próbie nadużycia
  Buildera **wszystkie wpisy poza wycofującymi są zapominane** (zawężony stożek operacji).

Przykłady:
- Podwójna spłata raty 1000 zł (900 kapitał / 80 odsetki / 20 opłaty): rewers = credit klienta
  1000, debit kapitału 900, debit odsetek 80, debit opłat 20.
- Klient anulował zwrot towaru (odebrał towar z powrotem): rewers transakcji zwrotu = debit
  portfela 123, credit zysków netto 100, credit VAT 23.

Istota: wycofywanie to **jawne skorygowanie, nie usunięcie błędu**. Dzięki temu, że transakcja
spina wszystkie wpisy, odwracamy ją jedną komendą, bez ręcznej logiki kompensującej; odwrotne
wpisy są powiązane z oryginalnymi, historia pełna i spójna.

---

## 7. Przedawnienia, kompensacje i alokacje (L06)

### Validity — ważność wpisu
Nie każda operacja obowiązuje wiecznie: promocyjny limit +100 zł tylko w grudniu, miesięczny
budżet flotowy bez przenoszenia, nadpłata za prąd ważna 6 miesięcy. Daty occurredAt/appliesAt nie
wystarczą — każdy Entry dostaje pole **`Validity`**: niemutowalny rekord (przedział czasu)
z metodami kreacyjnymi i metodą "czy punkt czasu mieści się w przedziale". Domyślnie
`Validity.always` (cała oś czasu od Epoch); na żądanie dowolny przedział (np. aktywny tylko
w grudniu 2025).

### Kompensacja przeterminowanego wpisu
- **Przypadek prosty** — bonus 30 zł (20–27 XII) w całości niewykorzystany: zwykła transakcja
  wycofująca; bonus wraca do puli operatora, który rozliczy niewykorzystane punkty.
- **Przypadek częściowego zużycia** — limit flotowy 500 zł na październik, zatankowano 150:
  transakcja wycofująca nie zadziała (nie zwracamy 500, tylko różnicę 350). Logika wyrównania
  żyje w Builderze: metody `compensatingExpired(entryId | entryRef)` tworzą subBuilder o zawężonym
  stożku możliwości — jedyną opcją jest wskazanie **konta kompensacyjnego** (potrzebnego np. z
  reguły podwójnego zapisu; nie da się go pewnie wywnioskować z transakcji inicjalnej, więc podaje
  się je przez API). `calculateRemainingAmount` wylicza pozostałość (zero → Optional pusty, nie
  kompensujemy); referencję przeterminowanego wpisu może dostarczyć np. cronjob przeglądający konta.
- To **nie jest** typowe wycofanie: odkręcamy jeden wpis, nie całą transakcję.

### Alokacje — jawne relacje między wpisami
Naiwne "sumuj wpisy, które wydarzyły się po" zawodzi, gdy nakładają się źródła: limit bazowy
500 zł/mies. + promocyjny 200 zł (15 X – 15 XI); tankowanie 150 zł — z limitu? z bonusu? 50/50?
**Odczyt to za późno na taką decyzję** — przy budowie transakcji definiujemy **strategię
alokacji**:
- struktura: opcjonalne pole `appliedTo` w Entry (do którego wpisu-źródła alokujemy zużycie),
- `EntryAllocationStrategy`: **FIFO** (kolejka — najstarsze aktywne wpisy najpierw), **LIFO**
  (stos), **Manual** (ręczny wybór powiązanego wpisu),
- `EntryAllocationFilter` + `EntryAllocationFilterBuilder`: zawężanie — konto, typ wpisu,
  ważność w punkcie czasu, dowolna liczba filtrów; filtr definiuje się przy tworzeniu wpisów,
  Builder uwzględnia go w metodach kreacyjnych.
- `calculateRemainingAmount` po wprowadzeniu alokacji szuka w repozytorium wpisów z `appliedTo`
  pasującym do wpisu bazowego, nie "wpisów po".

Efekt różnicy strategii (przykład flotowy, tankowanie 16 X): FIFO → zużycie z limitu bazowego,
po wygaśnięciu promocji wraca 350 zł z bazowego okna; LIFO → zużycie rozliczone z bonusu, wraca
pełne 500 zł. Rozszerzenie: strategię alokacji można powiązać z kontem, by zachowanie (np. karty
flotowej) było stałe i nie wymagało wyboru przy każdej transakcji.

Podsumowanie L06: model rozumie **czas, relacje i intencje, a nie tylko sumuje liczby** —
zautomatyzowane, przejrzyste rozliczanie bonusów, wygasających limitów, przedpłat i nadpłat.

---

## 8. Wiele kont vs metadane Entry (L07) — kryteria decyzji

"Pieniądz pieniądzowi nierówny": rata = kapitał + odsetki + opłaty manipulacyjne + prowizje +
ubezpieczenie (za składową często stoi proces, np. ubezpieczenie w zewnętrznym towarzystwie);
zakup = towar + przesyłka + prowizja za przelew natychmiastowy. Pytanie projektowe: **komponenty
modelujemy osobnymi kontami czy metadanymi wpisów w jednym koncie?**

- **Opcja 1 — wiele kont**: konto per komponent (umowa 123 → konta principal/interest/fee);
  rata dzielona routingiem (np. procentowo) — po jednym wpisie na każdym koncie.
- **Opcja 2 — jedno konto + metadane**: trzy wpisy na koncie umowy 123, każdy z metadaną nazwy
  komponentu; można pójść dalej — jedno konto dla wszystkich kredytów, szczegóły w metadanych.

| Kryterium | Wiele kont | Jedno konto + metadane |
|---|---|---|
| Czytelność odczytu | intuicyjna — saldo/historia mówi same za siebie (loan123.interest) | wymaga wejścia w strukturę wpisów i interpretacji atrybutów |
| Separacja / audyt | naturalna (konta per klient/produkt/komponent/strumień) — łatwy audyt i raportowanie | możliwa, ale przez filtrowanie; mniej przejrzysta |
| Reguły | proste i lokalne (np. credit-only na koncie bonusowym) | reguły muszą analizować typ wpisu + metadane; więcej wpisów → więcej reguł → złożoność |
| Raportowanie | konto = naturalna jednostka analityczna (salda, zestawienia, wykresy) | filtrowanie, grupowanie, agregacje — wykonalne, ale wymaga technologii i dyscypliny metadanych |
| Elastyczność | nowe komponenty = nowe konta | rozszerzenie słownika etykiet; nowe analizy bez zmiany struktury kont; modelowo porównywalna, różni się złożonością operacyjną |
| Konfigurowalność tworzenia wpisów | routing do kont | przypisywanie atrybutów — równie silne |
| Koszt operacyjny | więcej obiektów: zarządzanie, wersjonowanie, synchronizacja | mniej kont, więcej logiki przetwarzania |
| Typowe zastosowania | wysoka spójność: bankowość (spłaty kredytów), energetyka (taryfy), podatki, compliance | elastyczność i szybkość adaptacji: marketplace'y, promocje, bonusy, rabaty, dynamiczne budżety |

**W praktyce dominują modele hybrydowe** — dedykowane konta dla jednych komponentów, metadane dla
innych. Decyzja ma być świadoma: czytelność, złożoność, potrzeby audytowe, wymogi regulacyjne.

---

## 9. Filtrowanie, analiza, odczyty (L08)

Proste pytania (ile mamy/zużyliśmy/zostało) załatwia saldo i — przy kontach per komponent —
spojrzenie na właściwe konto (loan123.fee, loan123.interest). Ale pytania rosną: łączne bonusy
marketingowe klienta 123 ze wszystkich produktów; udział środków promocyjnych z kanału POS
w doładowaniach; wpływy z promocji Black Friday w kwartale. Wpisy bywają rozproszone po wielu
kontach, pomieszane z innymi, a widoki — bardzo specyficzne. (Dygresja z lekcji: z pomocą AI sami
możemy generować takie pytania analityczne i pokazywać biznesowi możliwości modelu — zmiana reguł
gry we współpracy.)

Selecty/CQRS/eventy "się da", ale solidny model daje więcej — widok, który ma wpisy jak konto,
jest identyfikowalny jak konto i wersjonowalny jak konto:

### Konto projekcyjne (ProjectionAccount)
- **Nie jest zwykłym kontem**: nie przyjmuje wpisów, nie zmienia stanu, nie uczestniczy
  w transakcjach. To obliczalny widok.
- Struktura: `AccountId`, `Filter` (para predykatów: filtr wpisów + filtr kont), nazwa, **wersja**
  (audyt / aktualizacje definicji).
- **Kompozycja zamiast dziedziczenia po Account**: dziedziczenie służy relacjom strukturalnym /
  polimorfizmowi, a projekcja nie ma wpisów własnych (tylko filtruje), nie ma zachowań mutujących,
  nie może brać udziału w transakcji i ma inny cel (analiza, nie księgowanie). Jeśli kiedyś trzeba
  wspólnej abstrakcji (getAccountId/name) — mały interfejs typu `AccountDescriptor`; logika i dane
  zostają oddzielone. Implementacja filtra (lambda czy SQL) to szczegół.
- Ten sam wpis może być "widoczny" na dwóch kontach, choć zapisany raz — na koncie bilansowym.
- Przykłady: (1) projekcja flotowa menedżera — wszystkie wpisy z kont klienta Client123
  dotyczących kart flotowych: suma wydatków floty, wykres per miesiąc, trendy, odchylenia per
  kierowca, budżet na kolejny rok; (2) telekom — doładowania (credity) z kanału MobileApp na
  koncie CLIENT123:WALLET: wartość i liczba doładowań per kanał, ocena kampanii.

### Granica projekcji → konta OFF_BALANCE (MEMO ACCOUNT)
Projekcja **zawodzi, gdy trzeba przeliczać wartości** (np. symulacja odsetek 5% od depozytów):
filtr to filtr, nie funkcja mutująca. Entry jest niemutowalne — inna wartość pod tym samym ID to
oszustwo; świeże ID "wirtualnego" wpisu może zmylić, jeśli trafi do obiegu. Gdy chcemy nadać
wpisowi wartość, identyfikator, datę powstania i pełną historię — używamy **zwykłych kont typu
OFF_BALANCE** (enum AccountType):
- nie podlegają klasycznym zasadom bilansowania, nie wymagają wpisów przeciwnych, mogą działać
  jednostronnie;
- służą do danych tymczasowych, szacunkowych, planistycznych — wspierają decyzje, nie wpływają na
  saldo klienta;
- przykłady: bank — przy każdej wpłacie credit 23% na taxAccountId (podgląd przyszłego VAT,
  liczony przy okazji transakcji: debit clientIncome, credit checkingAccount, credit taxAccount);
  windykacja — wspólny dług 10 tys. na jednym koncie bilansowym + konto OFF_BALANCE per
  współdłużnik do zarządzania oczekiwaniami i procesem; energetyka — CORRECTION_PREVIEW (jak
  wyglądałby rachunek po zmianie taryfy/odczycie licznika, porównanie scenariuszy przed oficjalnym
  przeliczeniem); telekom — BILLING_PREVIEW (podgląd naliczeń przed fakturą; konsultant może
  zareagować, zaproponować taryfę).

**Kiedy OFF_BALANCE zamiast projekcji**: gdy trzeba coś przeliczyć lub zmienić; gdy wynik ma być
zapisany na stałe, ale nie wpływa na saldo; gdy analiza/proces decyzyjny wymaga osobnych danych
z własną historią i tożsamością.

---

## 10. Spójność modelu i reguły walidacji (L09)

### Double Entry Booking (podwójne księgowanie) — reguła transakcji
Żelazna zasada finansów: **każda operacja wpływa na co najmniej dwa konta, a suma wpisów
w transakcji (przy konwencji credit=+, debit=−) daje zero**. Pieniądze nie powstają z powietrza
i nie znikają; jeśli system nie umie zaksięgować brakujących 8 zł z raty — musi to zgłosić
i **zatrzymać operację** (a nie dopuścić niespójność wykrywaną telefonem klienta).

Umiejscowienie: konto nie sprawdzi, czy jego wpis kompensuje się z wpisem innego konta; Entry to
za niski poziom. **Reguła podwójnego zapisu dotyczy transakcji** — tam żyje, jako predykat
`TransactionEntriesConstraint`, wymuszany już na etapie konstrukcji obiektu transakcji (wybór
reguł przez TransactionBuilder). Kont w transakcji może być więcej niż dwa — liczy się zerowanie
sumy.

### Stosowalność reguły a typy kont
Projekcyjne nie przyjmują wpisów → reguły transakcji ich nie dotyczą. OFF_BALANCE przyjmują
dowolne wpisy (kopie debitów/creditów, wyniki obliczeń) i **nie wchodzą do bilansowania**
(np. bonusUsageTracker w telco — zapis zużycia bonusów bez drugiej strony; wypłata pensji
12 300 zł — pełny debit+credit na kontach bilansowych, a na taxProjectionAccount wpis z funkcji
wyliczającej podatek). Gdzie umieścić "tego ifa":
- **Flaga na typie** (`doubleEntryBookingEnabled` w AccountType + filtr w constraincie): jedna
  linijka, czytelność przy typie ("widzę, że OFF_BALANCE nie wspiera DEB"); ale kolejne constrainty
  → kolejne booleany (supportsBooking, allowsPartialReversal, requiresTwoAccounts) → kombinatoryczny
  koszmar; AccountType zaczyna rozumieć logikę constraintów — złamanie SRP.
- **Samowystarczalny constraint z `isApplicable`** (REKOMENDOWANE): reguła sama decyduje, kiedy
  działa (po koncie, typie transakcji, produkcie, kanale), iteruje po kontach wpisów i wybiera,
  które brać pod uwagę; zero zmian w typach, lepsza separacja, otwartość na rozwój. Zastrzeżenie:
  w małym systemie z dwoma typami kont flagi mogą wystarczyć — kontekst decyduje.

Inne reguły transakcyjne: minimum dwa wpisy, minimum dwa różne konta; kompozycja reguł → wzorzec
Specification.

### Reguły na poziomie konta (inwarianty natychmiastowe)
Sprawdzane w `addEntry`, blisko danych konta — "żaden wpis nie powinien zniszczyć modelu":
- **No Overdraft Rule** — saldo nie schodzi poniżej zera (portfele, prepaidy, limity wydatków;
  bankowość, telco, energetyka…),
- **blokada konta** — decyzja wewnętrzna/zewnętrzna (prawna, klient: zgubiona karta, antyfraud);
  żaden wpis nie wchodzi,
- **wymagane metadane** — wpis tylko z kanałem sprzedaży / reservationId / orderId (np. konsumpcja
  pakietu prepaid wymaga id produktu i kanału),
- **limity kwot wejścia/wyjścia** — doładowanie 5–1000 zł, płatność max 50 zł.

**Anty-wzorzec**: pola konfiguracyjne w Account (overdraftPossible, blocked, requiredMetadata,
minEntryAmount, maxEntryAmount) + ify w addEntry. Działa, ale: sztywna logika (zmienność =
kodowanie), trudne testowanie pojedynczej reguły (trzeba stawiać całe konto), brak historii reguł
(kto/kiedy zmienił), eksplozja pól (reguła dla 1% kont = pole u 100%), zerowa konfigurowalność
("dziś limit, jutro nie; dziś tylko POS, jutro dowolny kanał").

**Model docelowy**: reguła = osobny obiekt (`AccountRule`) — testowalny, rozszerzalny, podpinany
i odpinany od konta. Tworzeniem kont z zestawami reguł zajmuje się `AccountFactory` (konfiguracja
z bazy/pliku); zarządzaniem zestawami — fasada `AccountingFacade`: przypinanie/odpinanie,
**wersjonowanie** ("wersja 2 od 1 listopada"), **historia aktywności reguł**, **logowanie
niepowodzeń** (która reguła i dlaczego nie przeszła). Uwaga: to NIE jest silnik reguł — silnik
(z DSL-em, kontekstem, warunkami, akcjami) to oddzielny archetyp; tu tylko punkt integracji.

### Reguły wykraczające poza konto
Decyzje typu "czy klient może wykonać operację" wymagają szerszego kontekstu: użytkownik
(właściciel? prokurent? uprawnienia tylko do transakcji wewnętrznych?), limity dzienne na
wszystkie konta klienta, limity walutowe/kanałowe/geograficzne, czas, produkt, poprzednie
transakcje. **Account egzekwuje reguły lokalne** (saldo, blokada, metadane), ale nie odpowiada na
"czy możesz wypłacić środki" — to poza jego odpowiedzialnością; **nie można go wtedy traktować
jako agregatu** tej decyzji. AccountRule pozostaje użyteczny: nie musi wiedzieć, skąd dane —
dostaje szerszy `AccountRuleContext` albo woła inne fasady. Model wskazuje miejsce wpięcia, nie
rozwiązuje całych limitów/uwierzytelniania/procesów.

Podsumowanie L09: reguły na dwóch poziomach — transakcji (constrainty, z Double Entry Booking na
czele) i konta (natychmiastowe inwarianty w addEntry, odseparowane od typu, konfigurowalne,
testowalne). Gdy reguł jest dużo, zmieniają się, mają wersje i zależności — naturalny krok to
wydzielenie osobnego archetypu reguł.

---

## 11. Posting Rules i modele reaktywne (L10)

**PostingRule** to reaktywna funkcja: obserwuje wpisy na koncie wyzwalającym (*trigger account*)
i w odpowiedzi tworzy wpisy na kontach docelowych (*target accounts*), mogąc przeliczać wartości
(procent, przekształcenie, dowolny algorytm). Wisienka na torcie modelu — i narzędzie równie
potężne, co niebezpieczne (łatwo z czytelnego modelu zrobić plątaninę zależności i efektów
ubocznych).

Przykłady potrzeb: wcześniejsza spłata kredytu → premia/cashback 1%; wpływy > 8 tys. zł → limit
3 tys.; doładowanie z aplikacji → bonus promocyjny; brak spłaty w terminie → odsetki karne;
sztandarowy: każdy credit na koncie przychodowym → wpis 23% na podatkowym koncie OFF_BALANCE.

### Struktura reguły
- `PostingRuleId` — reguła ma cykl życia: tworzenie, usuwanie, blokowanie, wersjonowanie, okres
  aktywności; opisowa nazwa; **priorytet** (kolejność wykonywania).
- `isEligible` — czy reguła kwalifikuje się do uruchomienia dla danego kontekstu.
- Bazowa implementacja = trzy elementy:
  1. **EligibilityCondition** — predykat z helperami `accountEquals` (konkretne konto),
     `entryTypeEquals` (tylko credit/debit), `accountType` (szerokie reguły per typ konta),
     dowolne predykaty; operatory logiczne AND/OR/NOT.
  2. **AccountFinder** — znajdowanie kont docelowych (na sztywno przez metody kreacyjne albo
     dynamicznie).
  3. **PostingCalculator** — serce: dla kontekstu i kont docelowych buduje transakcje (np. sumuje
     wartości wpisów wyzwalających, liczy 23%, przez accountingFacade buduje transakcję z wpisem
     kredytowym).
- `execute(PostingContext) -> List<Transaction>` — zero, jedna lub wiele transakcji.
- **PostingContext** — struktura z danymi i zależnościami: zbiór wpisów wyzwalających, zegar
  (czasy nowych wpisów), referencja do fasady Accountingu (szukanie kont, budowa transakcji);
  katalog otwarty (można np. dodać metadaną PostingRuleId do nowych wpisów).
- **PostingRuleExecutor** (za fasadą): wyszukuje w repozytorium reguły eligible dla kontekstu,
  sortuje po priorytecie, wykonuje regułę po regule.

### Pięć strategii wyzwalania

| Strategia | Mechanika | Zalety | Wady / zastosowanie |
|---|---|---|---|
| **Eager firing** | przy wykonaniu transakcji model natychmiast dokłada wpisy reguł do TEJ SAMEJ transakcji | natychmiastowa reakcja; bazodanowa transakcyjność zmiany wielu kont | trudny debug (wpisy bazowe i regułowe zmieszane — metadane pomagają); nie da się wycofać fragmentu (kompensacja musi wybierać wpisy); czas transakcji rośnie z liczbą reguł. Tylko bardzo proste systemy / reguły zawsze wykonywane razem z wpisem |
| **Event-driven firing** | transakcja → wpisy → zdarzenia (np. creditEntryRegistered) → PostingRulesEventHandler → PostingRulesFacade; osobny wątek/proces | separacja logiki i danych; kontrola błędów, wycofywanie, śledzenie; wydajność i skalowalność przy wielu regułach | strategia stosowana "u nas" — rekomendowana dla złożonych systemów |
| **Account-based firing** | konto samo decyduje kiedy uruchomić reguły: po każdym wpisie, periodycznie, albo ręcznie ("zamknij dzień") | idealne do naliczania odsetek, zamykania okresów, przeliczania sald; pełna kontrola nad wpisami w scenariuszach batchowych | semantyka nie-reaktywna (eventy zbyt granularne np. dla opłaty za brak płatności kartą w okresie); konieczność znakowania przetworzonych wpisów; batch bierze wszystko naraz (vs wypłaszczony ruch real-time) |
| **Backward-chained firing** | konto docelowe (np. TAX_ACCOUNT) odpytuje inne konta o delty i buduje wpisy dla siebie | główne zastosowanie: symulacje i projekcje | podobne do pollingu — dużo bezwartościowego ruchu |
| **Manual firing** | człowiek/system wybiera regułę (UI, endpoint, komenda) i ją uruchamia | akcje zatwierdzane przez człowieka ("nalicz bonus"), scenariusze testowe, administracja | narzędzie czysto administracyjne / "wytrych na czarną godzinę"; nie porównywać z automatami |

Strategie **mogą współistnieć** (część reguł na zdarzeniach, część przy zamknięciu dnia, część
ręcznie) — elastyczność zobowiązuje do dobrego zaprojektowania zależności.

### Cykle w sieci reguł
Reguły łączą konta w strumienie przepływu wartości → **graf skierowany**. Cykl = potencjalnie
nieskończona pętla ("system wybucha"). Przykład: ADAM:ROR (≥20 tys. → reguła Savings przelewa
wpływ >1000 zł na ADAM:SAVINGS) + reguła PARTY_AGAIN (SAVINGS >15 tys. → wraca na ROR) → ping-pong.
Gdy wszystkie AccountFindery zwracają konkretne ID, cykle można wykrywać zawczasu (problem cyklu
w grafie skierowanym, np. DFS); przy dynamicznym doborze kont wykrycie w runtime jest trudniejsze.
Morał: gdziekolwiek budujesz relacje, tam masz graf z jego dobrodziejstwami i problemami.

### Granice użycia reguł
- **Przesada**: billing przez pajęczynę kont i reguł ("wpłacisz tu, naliczy się tam, z trzech
  miejsc zsumuje na piętnaste konto i fakturka") → poznanie drogi wartości staje się sportem
  ekstremalnym. Rada-klucz: **zarządzaj w Accountingu wartością — nie procesami, rozliczeniami,
  cennikami, produktami.**
- **Niewystarczalność**: procesy wieloetapowe (safeguarding — blokada środków klienta, operacja
  z kont operacyjnych na własne ryzyko, zabezpieczenia, rozliczenie, odblokowanie/przeksięgowanie;
  compliance na każdym etapie) wymagają warstwy procesowej — modelu zlecenia z cyklem życia
  (złożone → zaakceptowane → rozliczane → zakończone), reagującego na zdarzenia zewnętrzne
  (odpowiedź banku, potwierdzenie przelewu) i tworzącego wpisy dopiero na końcu. Reguła księgowa =
  prosta zależność "jeśli wpis, to reakcja".

### Persystencja reguł — podejście ewolucyjne
1. **Reguły w kodzie** (klasy, lambdy; w bazie tylko identyfikatory/tagi): najprostsze, niezawodne,
   testowalne; brak dynamicznej edycji w runtime (co bywa wręcz wskazane).
2. **Reguły konfigurowalne**: warunki aktywacji, procenty, tagi kont z bazy; silnik w kodzie —
   kompromis (prosty kod, elastyczne reguły; ograniczona czytelność/rozwijalność).
3. **Pełny DSL** (JsonLogic, SpEL…) interpretowany w runtime: reguły tworzone przez
   użytkowników/adminów; maksymalna dynamika, ale trudniejsze tworzenie, testowanie, debug.

Rekomendacja: zacznij od kodu, dodawaj elastyczność z czasem, po DSL sięgaj dopiero przy realnej
potrzebie. Najważniejsze: **reaktywność jako zorganizowany, modelowy mechanizm, nie zbiór losowych
if-ów**.

---

## 12. Accounting dla ilości fizycznych i niefinansowych (L11)

**Money to szczególny przypadek Quantity** (archetyp z katalogu "Enterprise Patterns and MDA"):
Quantity = liczba + jednostka miary (5 kg); Money = ilość + waluta + operacje respektujące reguły
biznesowe (zaokrąglenia per waluta: PLN dwie cyfry po przecinku, JPY zero; mnożenie; konwersje).
Konsekwencja: **cały model — konta, wpisy, transakcje, wycofania, Validity, projekcje,
OFF_BALANCE, PostingRules — działa bez zmian dla dowolnych ilości**.

### Studium: skup ziemniaków (pan Marek, Tarnobrzeg)
Konta: `OFF:INTAKE` (źródło zewnętrzne wartości — fizyczny świat), `FARMER:ZDZISLAW:INVENTORY`
(inwentarz rolnika), `FARMER:ZDZISLAW:RESERVED` (rezerwacje), `FARMER:CEZARY:OUTGOING`,
`FARMER:KRZYSZTOF:OUTGOING` (wydania).

Przebieg (transakcje zawsze bilansowane):
1. Zdzisław przywozi 1500 kg → debit OFF:INTAKE / credit INVENTORY. Salda: INTAKE −1500,
   INVENTORY 1500.
2. Rezerwacja Cezarego 500 kg na 24 h → INVENTORY → RESERVED. (INVENTORY 1000, RESERVED 500.)
3. Rezerwacja Krzysztofa 200 kg → INVENTORY 800, RESERVED 700.
4. Cezary odbiera tylko 100 kg → RESERVED → CEZARY:OUTGOING (RESERVED 600, OUTGOING 100); wpis na
   OUTGOING to podstawa faktury, rozliczenia logistycznego, aktualizacji stoku.
5. Wygasa rezerwacja Cezarego: niewykorzystane 400 kg wraca do inwentarza (kompensacja
   przeterminowanego wpisu): INVENTORY 1200, RESERVED 200.
6. Krzysztof odbiera całe 200 kg → RESERVED → KRZYSZTOF:OUTGOING.
7. Wygasa rezerwacja Krzysztofa: system sprawdza, czy wpis na RESERVED wymaga kompensacji —
   pozostałość zerowa, kompensacja zbędna, konto zbilansowane.
8. Właściciel ma **konto projekcyjne** (cały stan — kontrola dostępnej przestrzeni) i **konto
   pozabilansowe** zbierające rezerwacje (planowanie obsady pracowników do wydawania zamówień).

To **dokładnie ten sam model — także matematycznie**:
- **Grupa addytywna**: Money i Quantity mają element neutralny (0 zł, 0 kg), element przeciwny
  (−10 zł, −5 kg), dodawanie łączne i przemienne; operacje zdefiniowane tylko wewnątrz jednostki —
  dlatego nie dodasz Money("PLN",100) + Money("USD",50) bez konwersji; model chroni.
- **Przestrzeń wymiarowa**: wartość jako wektor (liczba + jednostka z przestrzeni wymiarów); nie
  dodasz masy do czasu ani waluty do gigabajtów, ale w ramach wymiaru — proszę bardzo.

Zmienia się tylko kontekst biznesowy; model zostaje. Złotówki, kilogramy, gigabajty, licencje,
bilety — z tej perspektywy nierozróżnialne. (Scenka 2 domyka klamrę: monitoring ginących paczek
w logistyce — wystarczy w miejsce pieniędzy/gigabajtów wstawić paczki, a kontami uczynić tira,
półkę magazynową, sortownię, skrytkę w skrytkomacie — i "Accounting daje historię out of the box",
bez składania tysięcy eventów.)

---

## 13. Miejsce w architekturze systemu; integracje z archetypami (L12)

### Pozycja strategiczna
Mechanika kont/wpisów/transakcji to **generyczna zdolność biznesowa (capability)** — mówi, CO
organizacja potrafi (zarządzać dowolną wartością), niezależnie od JAK. Zastosowania: fintech
(pieniądze, kredyty, długi, cashback, limity), e-commerce (punkty lojalnościowe, karty podarunkowe,
prepaid), telco (pakiety minut/danych, taryfy, prepaid), logistyka (paczki, kilometry, rezerwacje
przestrzeni w sortowniach/magazynach/tirach/statkach), produkcja i magazyny (towar, przestrzeń,
zamówienia, rezerwacje), SaaS (zasoby chmurowe, licencje, API calls).

W strategicznym DDD Accounting powinien być **upstream**: nie wie, do czego jest używany;
dostarcza funkcje procesom operacyjnym; jego logika nie zależy od żadnej dziedziny; z zewnątrz
przyjmuje **dane, nie intencje biznesowe**.

### Zależności (Accounting jako downstream — tak, wybiórczo)
- **Party (upstream dla Accountingu)**: właścicielstwo kont, inicjator transakcji, podmiot
  rozliczenia, autoryzacja operacji, wzbogacanie śladu audytowego. (Własność celowo trzymana POZA
  modelem konta — patrz §5.)
- **Moduły autoryzacyjne**: kto ma prawo wykonać operację, na jaką kwotę, z jakiego kontekstu;
  za regułami autoryzacyjnymi kryją się całe procesy (do 10 tys. pracownik sam; wyżej dyrektor
  regionu; powyżej miliona dodatkowo zarząd).
- **Moduły limitów i blokad**: decyzje na bazie historii w oknie czasowym lub decyzji zewnętrznych
  (np. komorniczych).
- **Zewnętrzne reguły podatkowe i walidacyjne**: dostarczają danych lub ograniczeń.

Zasada: w każdym przypadku **to Accounting decyduje, co może zrobić na swoim terenie** — otrzymuje
dane wspierające jego wewnętrzne decyzje.

### Klienci Accountingu
Moduł zakupowy (zamówienia, zlecenia zakupu), billing/rozliczenia (ile klient ma zapłacić), moduł
promocji (bonusy, cashbacki, nagrody), risk & scoring (wartość ekspozycji), loyalty (punkty,
benefity), procesy operacyjne tworzące wpisy ze zdarzeń — i inne. **One podejmują decyzje,
Accounting księguje.**

### Typowe błędy architektoniczne
- **Przeciekanie wiedzy domenowej przez zdarzenia**: generyczny Accounting reagujący na zdarzenia
  o płatnościach, procesach sądowych/komorniczych, sprzedaży — "a potem czekamy na feature
  9 miesięcy". Inne moduły mają zlecać czyste transakcje, nie uczyć Accounting reagowania.
- **Silnik reguł jako logika procesowa / billing w PostingRules** (patrz §3, §11).
- Uwaga na architekturę event-driven przy modelach generycznych; **luźne sprzężenie ≠ eventy** —
  asynchroniczna komenda + Outbox Pattern pozwalają poluzować sprzężenie, zachowując generyczność.

### Biblioteka vs serwis vs drogowskaz
Dylemat praktyczny (np. firma kurierska: paczki + prepaid + lojalność + vouchery i rabaty — jeden
model dla wszystkich?):

| Opcja | Zalety | Wady / warunki |
|---|---|---|
| **Biblioteka** (odruch DRY) | spójność, eliminacja duplikacji — na tym zalety się kończą | sprzężenia binarne (zmiana i awaria dotykają wszystkich konsumentów); piekło wersjonowania i wdrożeń; rozmyta odpowiedzialność (kultura obwiniania); Accounting jest **stanowy, nie funkcyjny** — każda aplikacja musiałaby mieć lokalną bazę kont/wpisów/transakcji, integralność, rollbacki, raporty; w systemach regulowanych (finanse, zdrowie, e-commerce) rozproszony model często nieakceptowalny (audytowalność, sprawozdawczość przy wielu aplikacjach do odpytania) |
| **Autonomiczny serwis** (własna baza, API, model, zespół) | luźne sprzężenie przez API; pojedyncze źródło prawdy z pełnym audytem i sprawozdawczością (łatwiej dla regulatora); produkt organizacyjny z opiekunem odblokowuje inne zespoły (zdejmuje obciążenie kognitywne złożoności wartości) | kosztuje (serwis + zespół + integracja); preferowany tam, gdzie zarządzanie wartością to znaczący wycinek biznesu: bankowość, windykacja, ubezpieczenia, magazyny, logistyka — "tam bez tego będziesz cierpieć" |
| **Drogowskaz** (opcja pośrednia) | zestaw wiedzy projektowej, nie kod do reużycia (choć część może pójść 1:1): pojęcia (konta, wpisy, transakcje), granice spójności natychmiastowej, typowe scenariusze (wycofania, projekcje); każdy zespół wdraża własną wersję na wspólnej koncepcji → **lokalna autonomia, globalna spójność** | wymaga dyscypliny koncepcyjnej |

O DRY: w systemach dużej skali/rozproszonych **autonomia zespołu jest ważniejsza niż
zaoszczędzone kilobajty** — czasy bezwzględnego DRY minęły.

Ryzyko generyczności: jeśli Accounting zwiąże się z procesami organizacji, "nacieknie ich logiką"
— i trzeba go będzie przepisywać przy każdej zmianie strategii firmy.

---

## 14. Cztery perspektywy (L13)

| Perspektywa | Bez Accountingu | Z Accountingiem |
|---|---|---|
| **Analitycy** | chaos: reguły porozrzucane, dane o niejasnym znaczeniu, zasady wartości ("prowizja od brutto") żyją w dokumentach albo w czyimś Excelu | wspólny język modelowania wartości: konto, wpis, transakcja, reguła, bilans — nie techniczne byty, lecz **jednostki myślenia** pozwalające przejrzyście modelować złożone zasady |
| **Biznes** | trudno odpowiedzieć: ile zarobiliśmy na usłudze? czy klient zapłacił? kiedy uznać przychód? audyt trudny, zgodność regulacyjna bolesna | "zapalenie światła w ciemnym pokoju": każda odpowiedź = zbadanie wpisów na kontach; system przejrzysty, kontrolowalny, audytowalny → sprawność operacyjna, łatwe raportowanie, wymogi prawne. Wartość biznesowa to nie tylko feature'y — to też wydajność wytwórcza i operacyjna, mniejsze koszty |
| **Programiści** | logika rozproszona po mikroserwisach i zespołach, każdy liczy po swojemu, te same wartości w wielu systemach do synchronizacji — łatwo o błąd | centralny, jednoznaczny model wartości (Entry to tylko jeden poziom: są konta, transakcje, reguły); dostarczanie wartości bez powtarzania, dublowania, błędów |
| **Architektura** (aplikacyjna i systemowa) | nie wiadomo, gdzie jest prawda: ktoś coś liczy, coś wie, coś zmienia; zależności niejawne, system nieczytelny | Accounting ma konkretne miejsce: **tam i tylko tam** jest prawda o wartości — ile czego mamy, komu co przysługuje, kto ile i kiedy zapłacił; jasne zależności, podzielone role, klarowne odpowiedzialności |

Puenta: Accounting to nie tylko kod — to sposób myślenia o systemach; żeby system nie tylko
działał, ale dało się go **zrozumieć, rozwinąć, audytować i mu zaufać**.

---

## 15. Typowe błędne implementacje i ich konsekwencje

| Anty-wzorzec | Konsekwencje |
|---|---|
| Pole `remainingX` / `amount` doklejone do encji (klient/umowa/karta) + update CRUD | znika poprzedni stan: brak historii, śladów, kontekstu; nie da się odpowiedzieć "skąd saldo", "ile miałem tydzień temu"; każda reklamacja = wykopaliska |
| Boolean `blocked` na blokadę | blokada bez historii, powodu, zakresu i czasu; w archetypie blokada to wpis/reguła na koncie |
| Pola `availableBalanceInPLN` / doklejane `currency` | model ratowany ad hoc przy nowym rynku; symptom braku typu Money |
| "Mamy logi" jako historia | brak gwarancji spójności ze stanem bazy; nieustrukturyzowane; wymagają agregacji; dodawane po incydencie; niedostępne dla biznesu |
| Historia na surowych zdarzeniach domenowych bez Outbox/ES | brak gwarancji emisji po skutecznej operacji; każde zdarzenie = osobna logika/projekcja/integracja; jedno pole czasu (occurredAt bez appliesAt) |
| `correlationId` jako model powiązań | niczego nie wymusza — jedno pominięcie lub niespójna konwencja i analiza pada; metainformacja techniczna poza modelem |
| Delete / update na błędnej operacji finansowej | zakłamywanie rzeczywistości ("machloje"); utrata śladu; zamiast tego: transakcja wycofująca z refId |
| Kompensacje ręczne + Saga per przypadek | wykładniczy wzrost złożoności; logika rozsiana po zespołach; brak standardu korekt (reversed/cancelled/negated); kruchość na kolejność/duplikaty zdarzeń |
| Ignorowanie ważności środków | system pokazuje wartości, które przestały obowiązywać — mylące saldo i historia |
| Wszystkie komponenty kwoty w jednym polu | nie wiadomo, ile czego jest ani skąd; problemy księgowe, podatkowe, regulacyjne |
| Brak podwójnego zapisu | pieniądze "z powietrza" i "w nicość"; niespójności wykrywane telefonem klienta / na zamknięciu dnia; "dzielne update'y na produkcji"; utrata zaufania |
| Account jako worek z pełną kolekcją wpisów (chciwe DDD) | zalanie pamięci przy dużych kontach; wolny, podatny na błędy system |
| Reguły jako pola konfiguracyjne + ify w addEntry | sztywność, nietestowalność, brak historii reguł, eksplozja pól, zero konfigurowalności |
| Flagi boolean per constraint na AccountType | kombinatoryczny koszmar; AccountType rozumie logikę constraintów (złamanie SRP) |
| Przeliczanie wartości w projekcji / podmiana wartości Entry | fałszowanie audytowalnej historii; mylące sztuczne ID w obiegu — użyj OFF_BALANCE |
| Billing / procesy / taryfy w PostingRules | pajęczyna kont i reguł, droga wartości jako sport ekstremalny; 9 miesięcy na feature |
| Sieć reguł bez analizy cykli | nieskończone pętle przepływu wartości ("system wybucha") |
| Accounting nasłuchujący zdarzeń domenowych (płatności, komornik, sprzedaż) | generyczny moduł nacieka logiką domen; przepisywanie przy każdej zmianie strategii |
| Wspólna biblioteka Accountingu (DRY) w dużej skali | sprzężenia binarne, piekło wersji, rozmyta odpowiedzialność, rozproszony stan nieakceptowalny regulacyjnie |

---

## 16. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie domenowe / potrzeba | Element archetypu |
|---|---|
| pula, portfel, limit, budżet, inwentarz, pakiet | Account (z AccountId, balance, AccountName, AccountType) |
| właściciel konta, inicjator operacji | poziom wyżej: archetyp Party (upstream) |
| klasyfikacja: aktywo/pasywo/przychód/koszt/pozabilans | AccountType (ASSET, LIABILITY, REVENUE, EXPENSE, OFF_BALANCE) — umowna etykieta |
| pojedyncza zmiana wartości: naliczenie, zużycie, przyznanie | Entry (debit / credit) |
| "kiedy się wydarzyło" vs "od kiedy obowiązuje" | occurredAt vs appliesAt |
| kanał, promocja, źródło, id zewnętrzne | Entry.MetaData |
| operacja biznesowa spinająca wiele zmian (wpłata → saldo+VAT+przychód) | Transaction (type, execute, wpisy na wielu kontach) |
| korekta, anulowanie, storno | transakcja wycofująca: Builder.reverting + refId |
| "ważne do", wygasanie, przepadanie środków | Entry.Validity + compensatingExpired (konto kompensacyjne, calculateRemainingAmount) |
| "z czego zużywamy najpierw" (bonus vs pula) | alokacja: appliedTo + EntryAllocationStrategy (FIFO/LIFO/Manual) + EntryAllocationFilter |
| komponenty kwoty (kapitał/odsetki/opłaty) | wiele kont per komponent LUB metadane wpisów (lub hybryda) — §8 |
| zbiorczy widok, raport przekrojowy, "sumaryczne zużycie" | ProjectionAccount (filtr wpisów + filtr kont, wersjonowany) |
| symulacja, podgląd, dane planistyczne, udziały dłużników | konto OFF_BALANCE / MEMO (BILLING_PREVIEW, CORRECTION_PREVIEW, taxAccount) |
| "nie zgub ani złotówki", bilansowanie | TransactionEntriesConstraint: Double Entry Booking (suma wpisów = 0) z isApplicable |
| "saldo nie poniżej zera", "konto zablokowane", "wymagane metadane", "kwota 5–1000 zł" | AccountRule (obiekty podpinane/odpinane; AccountFactory, AccountingFacade) |
| decyzje wielokontowe, limity dzienne, uprawnienia | AccountRuleContext / zewnętrzne fasady (poza odpowiedzialnością Account) |
| "gdy X na koncie, nalicz Y" (cashback, VAT, odsetki, urlop za przepracowane dni) | PostingRule (EligibilityCondition + AccountFinder + PostingCalculator) + strategia wyzwalania |
| zamknięcie dnia / okresu, odsetki okresowe | Account-based firing |
| symulacje "co mogę sobie dopisać" | Backward-chained firing |
| proces wieloetapowy z autoryzacjami (safeguarding) | warstwa procesowa: model zlecenia transakcyjnego (uzupełnienie archetypu) |
| kwota + waluta, kg, GB, sztuki | Money / Quantity (grupa addytywna, przestrzeń wymiarowa) |
| rezerwacja towaru / przestrzeni | transfer INVENTORY → RESERVED; wygaśnięcie = kompensacja |
| wydanie / dostawa / konsumpcja | transfer RESERVED/INVENTORY → OUTGOING / konto zewnętrzne |
| przyjęcie z zewnątrz (dostawa, doładowanie) | transfer z konta zewnętrznego (OFF:INTAKE / pula operatora) |

---

## 17. Pytania do biznesu przy odkrywaniu archetypu

Pytania diagnostyczne (wzorzec ze Scenki 1 + L13 + treść lekcji):

**Rozpoznanie zasobu i przepływu**
1. Co jest tutaj zasobem, którym zarządzamy? (internet, pieniądze, punkty, dni, towar, przestrzeń?)
2. Skąd ta wartość się bierze i dokąd płynie? (przyznanie/doładowanie = skąd; zużycie = dokąd?)
3. Czy różne procesy operują na tych samych liczbach w różnych kontekstach?

**Historia i audyt**
4. Czy potrzebujecie historii przyznań, zużyć, blokad? (W Scence 1: "Tak. Potrzebujesz.")
5. Czy ktoś pyta "skąd się wzięło to saldo / dlaczego zabraliście X"? Kto dziś na to odpowiada
   i jakim kosztem (logi, SQL-e, screeny)?
6. Czy regulator / księgowość wymaga audytowalnej historii i ścieżki wyliczeń?
7. Czy "kiedy się wydarzyło" i "od kiedy obowiązuje" to u was dwa różne momenty (księgowania,
   progi podatkowe, okresy)?

**Korekty i spójność**
8. Co się dzieje przy pomyłce — klient zapłacił dwa razy, bonus trafił nie do tej osoby? Czy
   wolno "usunąć", czy trzeba jawnie wycofać ze śladem i powodem?
9. Czy zdarza się, że wartości "się nie zgadzają" (gubią się złotówki/kilogramy)? Jak szybko to
   wykrywacie i kto płaci za naprawę?
10. Czy każda operacja ma swoją "drugą stronę" (skądś ubywa, gdzieś przybywa)?

**Czas i ważność**
11. Czy niewykorzystana pula przepada? Kiedy i co się z nią dzieje (wraca do puli, znika,
    przechodzi dalej)?
12. Czy są środki ważne tylko w okresie (promocje, budżety miesięczne, nadpłaty rozliczalne
    w oknie)?
13. Gdy klient ma kilka źródeł (pula + bonus), z czego zużywamy najpierw? Kto o tym decyduje —
    reguła (FIFO/LIFO) czy człowiek?

**Struktura wartości**
14. Czy kwota/ilość ma składniki (kapitał/odsetki/opłaty; towar/wysyłka/prowizja; netto/VAT/
    rezerwa)? Kto musi je widzieć osobno (księgowość, podatki, marketing, regulator)?
15. Czy komponenty wymagają osobnej spójności/audytu (→ osobne konta), czy elastycznej analityki
    (→ metadane)?

**Agregacje i odczyty**
16. Czy ktoś chce widzieć sumarycznie wiele produktów/numerów/kont naraz? (W Scence 1: abonent
    z wieloma numerami i sumaryczne zużycie — "Skąd Ty to wiesz?")
17. Jakie pytania analityczne padają dziś lub mogłyby paść (per kanał, per okres, per promocja)?
18. Czy potrzebne są symulacje / podglądy przed oficjalnym rozliczeniem (billing preview, korekta
    taryfy, projekcja podatku)?

**Reaktywność i blokady**
19. Czy są reguły "gdy stanie się X na wartościach, zrób Y" (cashback, podniesienie limitu,
    odsetki karne, 1 dzień urlopu za 18 przepracowanych)?
20. Co jest u was "zablokowane" i dlaczego (trwająca sesja, fraud, komornik, rezerwacja)? Jak
    długo i kto blokuje/odblokowuje?
21. Czy są procesy wieloetapowe z autoryzacjami i stanem (progi zatwierdzeń, safeguarding)? —
    sygnał, że obok Accountingu potrzebna warstwa procesowa/zleceń.

**Architektura i własność**
22. Kto jest właścicielem kont i kto może inicjować operacje (→ integracja z Party, autoryzacją,
    limitami)?
23. Ile obszarów biznesu zarządza jakąś wartością (prepaid, lojalność, vouchery, magazyn)? —
    decyzja biblioteka / serwis / drogowskaz.

Jeśli odpowiedzi układają się w: wartości zmienne w czasie + rejestracja każdej zmiany + historia,
audyt i korekty + logika "wydarzyło się → zapisz → rozlicz" + wspólne liczby w wielu kontekstach —
**to Accounting**.
