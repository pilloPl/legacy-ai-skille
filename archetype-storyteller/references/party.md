# Archetyp Party — tożsamość vs rola podmiotów

Referencja na podstawie modułu M07 szkolenia o archetypach (transkrypcja AO_M07). Obejmuje:
wprowadzenie (L01), narastającą złożoność typów podmiotów (L02), krytykę dosłownego modelu
ról (L03), pełny model Party (L04), granice archetypu (L05), błędy i poprawne modelowanie
relacji (L06–L07), rozszerzenia i zastosowania branżowe z Capabilities (L08), miejsce Party
w architekturze organizacji (L09) oraz cztery perspektywy oceny (L10).

---

## 1. Esencja — tożsamość vs rola

Każdy biznes zaczyna się od ludzi i organizacji — nie od kodu i procesów, lecz od relacji.
Firmy, spółki, działy, zespoły; ludzie, którzy pracują, kupują, dostarczają, podpisują umowy,
klikają „zarejestruj". Każdy z nich gra w systemie jakąś rolę — prostą, złożoną, zmienną
w czasie. Choć różnią się nazwami (user, client, partner, vendor, employee), wszyscy są
częścią jednego porządku: świata, w którym system musi wiedzieć, **kto jest kim, w jakim
kontekście i co może zrobić**.

Kluczowa obserwacja: **osoba jest jedna, firma jest jedna — a ról może być wiele**. Chaos
zaczyna się, gdy systemy próbują zamknąć cały ten świat w jednej klasie `User`, a każdą nową
potrzebę łatają flagą: `isCustomer`, `isPartner`, `isLead`. Potem proces się zmienia —
chcemy zarejestrować klienta, który jeszcze nie ma konta użytkownika — i kończymy
z „userem bez usera". Model przypomina Frankensteina poskładanego z wyjątków, tymczasowych
łatek i warunków, których nikt już w pełni nie rozumie.

### Dlaczego `User` z flagami `isClient`/`isPartner` się nie spina

Esencja scenki otwierającej moduł: zespół dostaje „prosty system do zarządzania
użytkownikiem", z zastrzeżeniem, że ten użytkownik bywa też partnerem i klientem. Odruchowa
odpowiedź dewelopera to klasa `User` z flagami `isClient`, `isPartner`, a na relacje —
drzewko z flagą/`parentId` w tej samej klasie. Dwa pytania kontrolne rozbijają ten pomysł:

1. **Czy klient zawsze jest użytkownikiem?** Nie. Skoro tak, to w klasie `User` musielibyśmy
   trzymać „usera bez usera" — rekord użytkownika reprezentujący kogoś, kto użytkownikiem
   nie jest. Model się nie spina semantycznie.
2. **Czy relacje między podmiotami zawsze są hierarchiczne?** Nie. Rodzeństwo (brat
   i siostra) nie da się powiązać relacją rodzic–dziecko bez wprowadzania ojca do modelu.
   Flaga czy pole `parentId` nie rozwiązuje relacji nienadrzędnych — potrzebny jest model
   relacji jako osobnego bytu.

Ważne: odruch „w takim razie zróbmy oddzielne moduły: User, Client, Partner…" jest **równie
błędny** — to drugi antywzorzec, omówiony w sekcji 5 (L03).

### Objawy złego modelu podmiotów w organizacji (L01)

- Każdy zespół/system ma **własną definicję** klienta i partnera: w jednym systemie klient to
  osoba z aktywną fakturą, w innym każdy, kto kliknął w newsletter; partner raz jest firmą,
  raz userem z `isPartner = true`. Każdy system żyje własnym życiem.
- **Dane się rozjeżdżają**: adres zmieniony w CRM nie dociera do billingu; zgoda cofnięta
  w aplikacji nadal widnieje w systemie mailingowym; zespół integracyjny walczy
  z synchronizacją danych o tym samym człowieku i nikt nie wie, gdzie jest prawda.
- **Użytkownicy to czują**: wpisują te same dane trzy razy, nie znajdują zamówień (są „na
  innym koncie"), call center prosi o numer klienta, którego system nie potrafi znaleźć.
- **Compliance**: RODO/GDPR, audyty — jedna osoba to kilkanaście kopii w różnych systemach,
  każda z własnymi zasadami i ryzykiem; im więcej miejsc, tym trudniej o bezpieczeństwo.
- **Relacje bez właściciela**: firma ma oddziały, pracowników, przedstawicieli, a nikt nie
  wie, kto działa w czyim imieniu; płaski model danych → logika rozlewa się po kodzie „jak
  woda w piwnicy".
- Finał: nikt nie chce dotykać modelu `User`, bo każda zmiana grozi lawiną błędów; proste
  rzeczy trwają tygodniami; wszyscy czują, że coś jest fundamentalnie nie tak.

### Czym jest archetyp Party

Party to **wzorzec porządkujący świat podmiotów**: nie kolejny model danych, lecz sposób
myślenia o tym, kim są uczestnicy systemu, jak działają i jak się łączą. Odwraca środek
ciężkości: zamiast ról (niestabilnych, zmiennych) w centrum stawia **tożsamość** (trwałą).
Party mówi: „to jest podmiot — osoba lub organizacja — który może być klientem, dostawcą,
partnerem i zmieniać tę rolę w czasie". To także miejsce na zachowania i reguły: jak podmioty
się tworzą, weryfikują, łączą i współdziałają; kto może reprezentować kogo; jak potwierdzać
tożsamość; jak utrzymać spójność danych w ruchu. Z czasem okazuje się skarbnicą możliwości:
relacje, konteksty, automatyzacje, inteligentne decyzje.

---

## 2. Sygnały dopasowania (triggery)

Archetyp Party pasuje, gdy w systemie pojawiają się **różne podmioty, które wchodzą ze sobą
w relacje i zmieniają rolę w zależności od kontekstu**. Rzadko usłyszysz dosłownie „podmiot"
czy „rola" — częściej padają „słowa-mosty" (L10):

### Sygnały językowe

- „Użytkownik **czasem jest** partnerem / klientem / dostawcą" — ten sam byt w wielu rolach.
- „Czy klient zawsze jest użytkownikiem?" — odpowiedź „nie" = trigger (klient bez konta,
  import z CRM, integracja B2B przez API, klient, który nigdy konta nie dostanie).
- „Firma, która wczoraj była leadem, dziś jest customerem"; „partner sam zaczyna od nas
  kupować"; „dostawca staje się partnerem handlowym" — **migracja ról w czasie**.
- „Osoba lub firma jest **jednocześnie** klientem, dostawcą i partnerem".
- Słowa: **partner, dostawca, podwykonawca, kontrahent, oddział, placówka, filia, zespół,
  departament, spółka córka, grupa kapitałowa**.
- Czasowniki relacyjne: **zatrudnia, zleca, współpracuje, reprezentuje, obsługuje, rozlicza,
  nadzoruje, działa w imieniu**.
- „JDG — i osoba, i firma jednocześnie"; „klientem bywa osoba fizyczna albo firma".
- Pytania o sieć: „kto jest czyim opiekunem?", „kto może podpisać umowę w imieniu spółki?",
  „znajdź pracowników naszego dostawcy", „kto jest partnerem naszego partnera?".
- Pytania o zdolności: „znajdź lekarza z uprawnieniami do USG w Warszawie", „który zespół
  może wziąć projekt wymagający certyfikatu AWS?" (→ Capabilities).

### Sygnały kodowe

- Klasa `User`/`Customer` z flagami ról: `isCustomer`, `isPartner`, `isVendor`, `isLead`.
- Pola wykluczające się semantycznie w jednej klasie: `firstName`/`lastName` obok
  `companyName`/`taxNumber`; null jako „narzędzie modelowania" (osoba ma puste
  `companyName`, firma puste `firstName`, JDG wszystko naraz).
- Logika typu `if (user.companyName != null && user.isCustomer) …` — rozpoznawanie rodzaju
  podmiotu po kombinacjach nulli i flag.
- Klasa-walizka: dane osobowe + dane firmy + role + adresy + dane transakcyjne
  (`contractSignedAt`) + stan (`isActive`, `isDeleted`) w jednym bycie; skrajnie — 120 pól
  i stan konta prepaid w `User`.
- **Duplikacja danych osobowych** między modelami/serwisami: te same dane w `Lead`,
  `Customer`, `User`; kopiowanie przy „awansie" leada na klienta; synchronizacja i rozjazdy.
- `parentId`/drzewko w klasie podmiotu jako jedyny model relacji.
- Każdy mikroserwis z własną tabelą `User`/`Customer`/`Partner` i własnym identyfikatorem;
  brak odpowiedzi na „ilu mamy klientów?".
- Identyfikatory semantyczne (PESEL, NIP, e-mail, telefon) jako klucze główne podmiotów.

---

## 3. Anty-sygnały / granice archetypu (L05)

Granice to rdzeń L05: **nie każda informacja o Party musi być w Party** i nie każda operacja
powiązana z Party musi być z nią atomowo zsynchronizowana. Tożsamość jest sercem modelu, ale
„serce nie znaczy wół juczny".

### Problem: agregat-moloch

Na diagramie UML dorysowanie do Party asocjacji z `Address`, `Preferences`, `Consents`
wygląda pięknie. W praktyce: ktoś aktualizuje adres klienta, w tym samym czasie inny proces
zmienia zgodę marketingową, a trzeci numer paszportu — i system blokuje transakcję, bo
wszystko jest jedną transakcyjną sekcją krytyczną (jeden obiekt Party w bazie). Biznesowo to
nonsens: aktualizacja adresu i zgody **nie są współzależne**, nie wpływają na siebie, nie
muszą dziać się razem. To nie wina bazy ani narzędzi — to model, który „nie rozumie granic".
Asocjacja na diagramie to nie tylko kreseczka — w kodzie wychodzi, czy ona tam w ogóle jest
i co faktycznie znaczy.

### Co zostaje w Party, a co orbituje obok

W atomowym jądrze Party zostaje to, co **współtworzy tożsamość** i musi zmieniać się razem:
`PartyId`, zarejestrowane identyfikatory, role (+ pole `version`). Obok, jako osobne
agregaty/moduły o spójności ostatecznej, żyją rzeczy „na tej samej orbicie semantycznej":

- **adresy** (sztandarowy przykład L05),
- **preferencje** (ulubiony paczkomat, preferowany kanał komunikacji, godziny kontaktu),
- **zgody** (marketingowe, RODO, cookies),
- **ustawienia bezpieczeństwa i uwierzytelniania**,
- (w L07–L08 analogicznie: **relacje** i zwykle **capabilities**).

Każdy z tych bytów jest powiązany z Party, ale ma własne reguły, własny cykl życia i zmienia
się w innym rytmie — a mimo to zbyt często bywa wciśnięty w ten sam agregat.

Obserwacja projektowa z praktyki: operacje na adresach mają inny cykl życia (tworzenie,
walidacja, dezaktywacja) niż identyfikatory i role; reguły wymagające natychmiastowej
spójności dotyczą zwykle **albo** uwierzytelniania, **albo** adresów — rzadko łączą te
obszary i wymagają atomowości między nimi.

### Pytania-bramki przed dopięciem czegoś do Party

1. Czy ta informacja faktycznie **współtworzy tożsamość** podmiotu?
2. Czy jej zmiana musi być **natychmiastowo spójna** z resztą danych?
3. **Jak często** się zmienia — częściej, rzadziej, niezależnie?
4. Jakie **reguły** rządzą tą zmianą?
5. Czy operacje na niej mogą być wykonywane **równolegle** z innymi?

### Anty-sygnały (kiedy nie przesadzać z archetypem)

- **Mały system, banalne adresy/relacje**: wydzielanie osobnych agregatów (`Addresses`,
  `PartyRelationship`) to „strzelanie z armaty do muchy" — dodaje dwa repozytoria, dwa
  konteksty transakcyjne i synchronizację zdarzeń; kolekcja w Party bywa wystarczająca.
- **Pełna hierarchia nie jest obowiązkowa**: archetyp to sposób myślenia — wybiera się
  elementy pasujące do biznesu (np. bez podtypów spółek), a reszta czeka na potrzebę.
- **Relacje pełnorelacyjne tam, gdzie wystarczy klasyfikacja**: firma z 1000 pracowników,
  30 partnerów i 18 dostawców modelowana wyłącznie relacjami („zatrudnia", „współpracuje",
  „kupuje od") to „zakładanie gaci przez głowę" — jeśli jedyne istotne relacje to relacje od
  samej firmy, wystarczą **role globalne** (ta firma jest dostawcą, ten człowiek klientem).
- **Ordering i migawki**: proces, który potrzebuje danych podmiotu „na moment w czasie"
  (zamówienie), nie referencuje żywego Party — bierze **snapshot**; zamówienie bez
  rejestracji w ogóle nie tworzy podmiotu (L09).
- **Responsibilities z literatury**: formalne modelowanie obowiązków ról z conditions of
  satisfaction w praktyce prawie nikt nie robi — to domena kontraktów i umów w dedykowanych
  modułach (L08).

Zasada zamykająca L05: umiejętność rozpoznania różnic między „razem" a „osobno" i świadomego
postawienia granicy to jedno z najważniejszych narzędzi architekta. **Dobrze zaprojektowane
granice nie ograniczają — budują siłę** (m.in. otwierają drogę do modułu/mikroserwisu).

---

## 4. Narastająca złożoność typów podmiotów (L02)

Trzy poziomy, przez które przechodzi niemal każda organizacja. Każda rozmowa („a czy
użytkownik może być klientem?", „a jak obsłużyć firmy?", „a partnerzy, dostawcy, oddziały,
API partnerów?") brzmi rozsądnie i dotyczy realnej potrzeby — i każda prowadzi do świata,
w którym prosty model przestaje wystarczać.

### Poziom 1: niewinność — User = tożsamość

System ma jednego bohatera: użytkownika. Każdy `User` reprezentuje jedną osobę fizyczną.
Scenariusze: tworzy konto, uwierzytelnia się hasłem, edytuje dane, może mieć kilka adresów
i przypisane role. Model: `UserId`, imię, nazwisko, e-mail, `passwordHash`, kolekcje `roles`
i `addresses`. Ważne: model **nie jest workiem na dane** — ma zachowania (`authenticate`,
`assign` roli, `assignOrUpdate` adresu, `remove`). Jest czysty, spójny, każda linijka wspiera
jedną historię biznesową; świat jest binarny: użytkownik = tożsamość. Ale prostota ma cenę —
ten model zaraz trafi w ścianę rzeczywistości.

### Poziom 2: pojawia się klient — tożsamość zaczyna się rozmywać

Organizacja zaczyna zarabiać → pojawia się **klient** (ktoś, kto kupuje) obok użytkownika
(ktoś, kto ma konto). To nie zawsze ta sama osoba. Klientem bywa osoba fizyczna, firma albo
JDG — „i osoba, i firma jednocześnie". Typowe scenariusze:

- użytkownik rejestruje się, potem **staje się** klientem;
- użytkownik **nigdy** nie staje się klientem;
- rejestrujemy klienta, potem on staje się użytkownikiem;
- klient **nigdy** nie otrzymuje konta użytkownika (import z CRM, integracja B2B przez API).

Zespół „ulepsza" model: flaga `isCustomer`, potem `companyName` i `taxNumber`. Skutki:

- `companyName`/`taxNumber` nie mają sensu dla osób; `firstName`/`lastName` dla firm;
  `isCustomer` skleja dwa światy o różnych znaczeniach słowa „klient".
- Użytkownik indywidualny ma puste `companyName`, firma puste `firstName`, JDG wszystko
  naraz. Kod działa, semantyka się rozjeżdża; programiści piszą warunki na kombinacjach
  nulli. **Null staje się narzędziem modelowania świata — a null to nie brak danych, to brak
  decyzji.** To zawsze zły znak.
- `User` staje się „pojęciem bazą", z którego wszyscy korzystają, ale nikt nie wie, co
  znaczy; mamy „użytkownika bez użytkownika". Typowy dialog: „Czy User to klient?" —
  „Zależy." „Czy każdy klient ma Usera?" — „Nie zawsze." „Czy User może być firmą?" —
  „Teoretycznie tak, ale nie powinien." („Teoretycznie" zwiastuje chaos.)
- Architektonicznie: **pierwsze naruszenie granic tożsamości** — klasa traci kohezję, ma
  kilka odpowiedzialności, staje się punktem przecięcia zbyt wielu kontekstów (security,
  CRM, billing, ordering, accounting). Każdy coś dopisuje, a ponieważ klasa jest wspólna,
  nikt nie może jej zmienić bez ryzyka.
- Anegdota z projektu doradczego: klasa `User` ze **120 polami**, łącznie ze stanem konta
  prepaidowego.
- Symptomy: zmiana w jednym procesie psuje inne; błędy integracyjne; biznes narzeka, że
  zmiany trwają tygodniami; duplikacja danych (każdy system robi własną wersję Usera);
  użytkownicy wpisują dane w kilku miejscach, dane klientów się rozjeżdżają.

Diagnoza poziomu 2: problem nie wynika z błędnego kodu, lecz z **nieadekwatnego modelu** —
biznes się rozrósł, model tożsamości nie; kod nadąża łatkami (flagi, pola, nulle), a im
więcej wyjątków, tym mniej logiki. Organizacja mówi „potrzebujemy nowego modelu danych" —
i ma rację, tylko nie chodzi o kolejny `User`.

### Poziom 3: rzeczywistość dużych biznesów — erozja modelu

Wchodzą: **leady** (marketing), **partnerzy i dystrybutorzy** (sprzedaż), **dostawcy**
(zakupy), **integracje B2B przez API**, **oddziały, spółki córki, departamenty, grupy
kapitałowe** (kontroling). Każdy byt: inne dane, procesy, uprawnienia, reguły. Scenariusze:
osoba/firma nie jest ani użytkownikiem, ani klientem; firma składa się z działów, z których
każdy wykonuje inny zestaw operacji; firmy tworzą grupę, w której jedna kupuje, druga płaci,
trzecia zarządza; wreszcie „strzał z shotguna": podmiot jest **jednocześnie** klientem,
dostawcą, partnerem i kimś jeszcze. A każdy mówi: „to w sumie też jakiś User" — więc zespół
otwiera klasę `User` i dopisuje pola.

`User` staje się walizką, do której latami dokładano przedmioty, „bo nie było gdzie indziej":
dane osobowe, dane firmy, dane relacyjne (roles, addresses), transakcyjne
(`contractSignedAt`), stanu (`isActive`, `isDeleted`), role biznesowe jako flagi
(`isCustomer`, `isPartner`, `isVendor`, `isLead`). Model staje się „centralnym punktem
wszechświata": każdy system go dotyka, każdy zespół dopisuje, nikt nie wie, gdzie kończy się
tożsamość, a zaczyna rola. Przykłady chaosu:

- lead nie ma konta, ale ma `UserId`;
- partner ma `companyName`, ale nie ma `passwordHash`;
- vendor nie istnieje w CRM, ale istnieje w `UserRepository`;
- customer ma `isCustomer = true`, ale `isActive = false`;
- employee nie ma flagi w ogóle — każdy system rozpoznaje go po roli.

Działa to tylko dlatego, że system ma „więcej if-ów niż linijek faktycznej logiki" — if-ów,
których znaczenie („pierwszy to klient indywidualny, drugi kontrahent z API, trzeci lead
z kampanii offline — przecież to widać") żyje wyłącznie w głowach autorów.

**Granice między domenami się rozmywają**: formalnie `User` należy do Identity & Access
Management, praktycznie jest punktem centralnym CRM (klienci, leady), orderingu (zamówienia),
accountingu (płatności), partner managementu (usługi). Każdy kontekst dokłada pola „bo już
jest". Model traci jednoznaczność, a przez to **zdolność do ewolucji**.

Skutki — techniczne, operacyjne i poznawcze:

- **koszt zmian eksploduje**: każda modyfikacja Usera wymaga synchronizacji wielu zespołów;
  czas dostarczania funkcji rośnie lawinowo;
- **integracje się gryzą**: każda aplikacja ma własną definicję klienta, dane o tych samych
  podmiotach niespójne;
- **utrata zrozumienia domeny**: programiści nie wiedzą, co jest czym; analitycy tłumaczą
  intencje sprzed lat; nowy członek zespołu tygodniami dochodzi, czemu `isPartner`
  i `isVendor` mogą być true jednocześnie;
- **compliance i bezpieczeństwo**: dane osobowe, firmowe i kontraktowe w jednym modelu;
  trudna kontrola dostępu, trudne RODO; luka w jednym miejscu daje wgląd we wszystko.

Finał: „wypadałoby zrobić osiemnastą transformację zwinną i przepisać system. Tylko jak?" —
co prowadzi do L03.

---

## 5. Dlaczego dosłowny model ról nie działa (L03)

Odpowiedź wielu zespołów na Krakena-Usera: „skoro jeden model nie daje rady, zróbmy ich
wiele" — osobne klasy/moduły `User`, `Customer`, `Partner`, `Vendor`, `Lead`. Brzmi jak
rozdzielenie obowiązków; znikają flagi; każda klasa reprezentuje konkretną rolę; kod czytelny,
architekci czują ulgę. To pułapka — pełna lista argumentów:

1. **To nie są modele z potrzeby biznesowej, tylko z łatania wyjątków.** Więcej modeli jest
   dobre, o ile każdy ma jasny cel i opisuje coś realnego w domenie; tutaj modeli jest
   więcej, bo nie trafiono w sedno — więcej klas, ale wciąż bez odpowiedzi „kto jest kim
   i dlaczego".
2. **Problem osób vs firm nie znika.** W każdym z obiektów (Customer, Lead…) nadal siedzi
   logika rozróżniania osoby fizycznej od firmy — bazująca na nullach.
3. **Role migrują, a dane są kopiowane.** Lead staje się customerem (podpisana umowa) → dane
   kopiowane, identyfikator zachowany „żeby powiązać byty". Klient dostaje konto → kolejna
   kopia do modelu użytkownika. Partner zaczyna kupować; dostawca zostaje partnerem. „Skoro
   to ta sama firma, czemu mamy o niej trzy rekordy?" Te same dane (firma, adres, e-mail)
   w trzech osobnych obiektach.
4. **Rozjazd danych i synchronizacja.** Jednorazowa kopia wydaje się znośna — do czasu, gdy
   ktoś zmieni dane w jednym miejscu. Potem: szukanie aktualnej wersji, synchronizacja,
   sprzątanie.
5. **Eksplozja kombinatoryczna.** Próba likwidacji duplikacji przez łączenie typów (iloczyn
   kartezjański ról) → każdy nowy przypadek to nowy zestaw kombinacji; liczba klas rośnie
   wykładniczo, a wszystkie robią to samo w innym kontekście.
6. **Wariant rozproszony jest jeszcze gorszy.** Każdy mikroserwis ma swoją tabelę, API,
   reguły i identyfikator — na poziomie kodu czysto, semantycznie to wciąż te same osoby
   i firmy rozproszone po architekturze, każdy z „własnym pojęciem prawdy". Pytanie „ilu mamy
   klientów?" albo „z iloma partnerami współpracujemy?" nie ma odpowiedzi, bo nikt nie widzi
   całości. („Tylko kocem to zgasisz.")
7. **Sedno: źle dobrany środek ciężkości.** W centrum modelu — jako stabilny, abstrakcyjny
   byt, na którym buduje się kolejne funkcje — postawiono **role**: elementy z natury
   niestabilne i zmienne w czasie. W paradygmacie obiektowym stabilnym bytem są klasy; jeśli
   klasy odwzorowują coś wysoce zmiennego, każda nowa potrzeba biznesowa i każda zmiana
   relacji między podmiotami uderza w sam środek konstrukcji — w fundament.
8. **Zasada stabilnych abstrakcji (wujek Bob).** Komponent powinien być tak abstrakcyjny, jak
   jest stabilny. Co niestabilne, nie może być osią, wokół której budujemy resztę. Role
   (klient, partner, dostawca, użytkownik, lead) są **niestabilne z definicji**: zmieniają
   się w czasie, między kontekstami, a nawet w ramach jednego procesu. Model wokół ról to
   budynek na ruchomych fundamentach — wygląda solidnie do pierwszego silniejszego wiatru.

Obie drogi — `User` z flagami **i** osobne typy per rola — prowadzą do tych samych trzech
konsekwencji:

- **Ograniczona czytelność**: każdy moduł opisuje ten sam świat z innej perspektywy; zamiast
  jednej spójnej semantyki — wiele wersji prawdy; system przestaje być zrozumiały w całości
  (pierwszy krok do utraty kontroli nad domeną).
- **Ograniczona elastyczność**: każda zmiana reguł/procesów wymaga aktualizacji wielu modeli
  powielających te same dane; dodanie roli lub relacji ma wysoki koszt poznawczy
  i implementacyjny.
- **Ograniczona skalowalność**: więcej ról → więcej kombinacji, wyjątków i zależności;
  architektura rozrasta się „nie przez projekt, lecz przez przypadek"; system miał być
  modularny, a jest mozaiką połączeń bez wspólnej osi.

Wniosek: potrzebny model oparty na **stabilnej abstrakcji** — a tą nie są role, lecz
**tożsamość**.

---

## 6. Model Party jako wspólny model podmiotów (L04)

### Hierarchia typów

- **Party** — abstrakcyjna reprezentacja dowolnego podmiotu (osoby, firmy, instytucji,
  departamentu); skupia wspólną logikę i dane sensowne dla każdego typu: identyfikatory,
  role, (adresy — patrz granice).
  - **Person** — osoba fizyczna: człowiek, pracownik, użytkownik systemu; rozszerza bazę
    o dane personalne (koniec problemu „osoba z polem nazwy firmy i odwrotnie" — każdy typ
    ma to, co dla niego charakterystyczne).
  - **Organization** — byt prawny: firma, instytucja, grupa; oraz jednostki organizacyjne:
    - **OrganizationUnit** — wewnętrzna jednostka: dział, departament, oddział, zespół;
    - **Company** — formalna jednostka gospodarcza działająca niezależnie, z podtypami form
      prawnych: **JointStock** (S.A.), **LimitedLiability** (sp. z o.o.),
      **LimitedPartnership** (sp. komandytowa). Każdy dziedziczy te same fundamenty
      (identyfikatory, role, dane kontaktowe), może mieć własne rozszerzenia i polityki.

Użycie archetypu **nie wymaga** pełnej hierarchii — wybiera się elementy pasujące do biznesu;
archetyp daje możliwość rozwoju, gdy zajdzie potrzeba.

### Role jako dane, nie typy — serce odwrócenia

Każdy podmiot (osoba czy organizacja) może mieć **zero lub więcej ról**; to one nadają sens
uczestnictwu w procesach. Relacja 1→N między Party a Role: podmiot może pełnić dowolną liczbę
ról, każda rola wskazuje jeden podmiot. Kluczowa różnica wobec modelu role-centric: **role
nie definiują podmiotów — to podmioty posiadają role.** Efekty: dane o osobach i firmach
w jednym miejscu; relacje prostsze (wszystko odnosi się do Party, nie do konkretnej roli);
model rośnie z organizacją bez eksplozji klas i duplikacji danych; zmiana statusu = zmiana
danych, nie migracja między klasami.

### Wnętrze Party: stan, zachowania, zdarzenia

Party przechowuje i modyfikuje to, co każdy podmiot może/musi mieć: role, identyfikatory,
klucz **PartyId**, oraz atrybut **version** (bezpieczeństwo dostępu współbieżnego). Każdy
konkretny typ **rozszerza klasę bazową** i dokłada metadane oraz zachowania. Ponieważ każdy
podtyp ma inne dane, co innego znaczy „zarejestrowanie podmiotu" — stąd abstrakcyjna metoda
`toPartyRegisteredEvent`, wymagająca implementacji w podklasie.

**Dlaczego dziedziczenie, a nie interfejs/kompozycja?**

- Interfejs: w Party istnieje **wspólny stan i wspólne reguły**, które muszą być spójnie
  egzekwowane dla wszystkich podtypów; przy interfejsie każdy typ sam implementowałby
  dodawanie ról, rejestrowanie identyfikatorów, emisję zdarzeń, wersjonowanie → duplikacja
  i rozjazd zachowań, czyli dokładnie chaos, przed którym uciekamy.
- Kompozycja: Party stałoby się workiem na dane, a nie rdzeniem tożsamości; trzeba by ręcznie
  pilnować, żeby każdy Person/Organization używał tej samej implementacji — co i tak
  sprowadza się do jednego centralnego komponentu.
- Dziedziczenie daje **jasną, wymuszoną abstrakcję**: czym jest podmiot i jaki minimalny
  zestaw zachowań musi mieć; wspólny mechanizm identyfikacji, ról, zdarzeń i wersjonowania +
  możliwość rozszerzeń per typ. (Przykłady w Javie; inne języki mają inne konstrukcje do
  modelowania zmienności — użyj swoich.)

### PartyId — identyfikacja ponad granicami typów

Problem: identyfikatory **semantyczne** jako klucze są kruche:

- PESEL/NIP — unikalne tylko w podzbiorze rzeczywistości (firma nie ma PESEL-u, osoba nie
  musi znać/używać NIP-u) — działają w części przypadków;
- numer telefonu — krótka żywotność, pula ograniczona, numery ponownie przydzielane (numer
  sprzed roku może należeć do kogoś innego);
- e-mail — nie zawsze weryfikowany, często współdzielony (oferta na adres żony → system myli
  tożsamości);
- „unikalne w naszym biznesie" przestaje być unikalne przy wejściu na nowy rynek.

Rozwiązanie: **jedna, własna warstwa identyfikacji**, niezależna od logiki biznesowej
i zewnętrznych numerów. W Party identyfikator jest **jeden**: `PartyId` — nie ma `PersonId`,
`CompanyId`, `OrganizationUnitId`. Powód: większość elementów świata Party (role,
identyfikatory, relacje) jest **typowo agnostyczna** — nie wie i nie musi wiedzieć, czy
dotyczy osoby, czy organizacji; wspólna przestrzeń identyfikatorów daje uniwersalny kod,
identyfikator „wędrujący" przez systemy bez dodatkowej logiki i łatwiejsze modelowanie
relacji. (Analogiczny problem rozwiązuje archetyp Product — archetypy to sposób myślenia,
nie gotowiec.)

Generowanie: po stronie **aplikacji** (pełna kontrola semantyki, testowalność jednostkowa,
warianty per środowisko, prefiksy/namespace'y/kontrola kolizji); najczęściej wystarczy losowy
UUID.

### RegisteredIdentifiers — identyfikatory z semantyką

`PartyId` rozwiązuje identyfikację techniczną, ale „świat nie pyta o PartyId — pyta o NIP,
paszport, PESEL". **RegisteredIdentifier** to interfejs każdej formy identyfikatora
przypinanej do dowolnego Party. Każdy identyfikator ma:

- **typ** (czym jest: TaxNumber, PESEL, Passport),
- **wartość** (zapis tekstowy),
- **ważność** (czy jeszcze obowiązuje).

Dzięki temu różne identyfikatory żyją w jednej kolekcji, serializują się zunifikowanie (np.
JSON) i są traktowane spójnie. Przykładowe implementacje:

- `PersonalIdentificationNumber` (PESEL) — samowystarczalny rekord z walidacją poprawności;
  **nigdy nie traci ważności**;
- NIP — ta sama zasada (prostota, samowystarczalność, przewidywalność), inny kontekst:
  organizacje i przedsiębiorcy; wspólny interfejs pozwala użyć tej samej logiki dla osoby
  z JDG i dla firmy;
- Paszport — dane żyjące w czasie: ma okres ważności (**Validity**), może wygasnąć, zostać
  odnowiony, zablokowany; model o tym wie i odpowiada na pytanie „czy dokument obowiązuje?".

Po co ważność: dane nie są wieczne (paszport, prawo jazdy, licencja zawodowa); bez
świadomości czasu model jest „papierowy". Validity umożliwia: filtrowanie
aktualne/wygasłe, archiwizację historii, automatyczne blokowanie operacji na nieaktualnych
danych, compliance i audyt.

### Polityki przydzielania identyfikatorów

W dobrym modelu **za każdym polem stoi semantyka, często reguła**. Pytania testowe: czy mogę
przypisać PESEL firmie? Nie. NIP osobie prywatnej? Tak. Numer klienta osobie i firmie? Tak,
pod warunkiem roli `customer`. Model bez reguł tego nie rozróżnia → potrzebne **polityki
przydzielania identyfikatorów**: „ten typ identyfikatora może być przypisany tylko temu
Party", gdzie „temu" znaczy: wg **typu** (najczęściej), wg **roli**, wg **innych
identyfikatorów** (np. „masz PESEL → nie możesz mieć NIP-u").

Gdzie umieścić reguły (celowo pomijamy if-y w fasadzie serwisu aplikacyjnego):

1. **Logika w samym RegisteredIdentifier** — metoda `canAssignTo`; „PESEL z natury wie, że
   nie pasuje do organizacji". Zalety: logika przy danych, jedno miejsce, bez dodatkowych
   klas/konfiguracji; dobre dla małych systemów o małej dynamice reguł, operujących tylko na
   typach podmiotów. Wady: zmiana zasad wymaga zmiany kodu (np. brak wariantów per tenant);
   reguły krzyżowe („ma PESEL → bez NIP-u") wymuszają wzajemne sprawdzanie implementacji →
   **cykl zależności**.
2. **Polityki** — oddzielenie danych od reguł: „dane są głupie, ale stabilne; reguły mądre,
   ale zmienne". Jedna polityka z switch/case lub kaskadą if-else działa, ale nie jest
   elastyczna — każda zmiana to ingerencja w ten kod.
3. **Kompozyt małych polityk** — wiele małych polityk (np. identyfikatory personalne tylko
   dla osób; REGON i KRS tylko dla organizacji) składanych wzorcem kompozytu; do tego metody
   kreacyjne (`personalIdentifiersOnlyForPersons`,
   `organizationalIdentifiersOnlyForOrganizations`), kompozycje wybranych polityk albo
   komplet.

**Gdzie walidować?** Sprawdzenie aplikowalności jest **stałym elementem** procedury
przypinania identyfikatora (nie szczególnym scenariuszem), więc musi być **wymuszone przez
model** — przez Party. Umieszczenie go w serwisie aplikacyjnym: (a) sugeruje, że to coś
specyficznego dla przypadku użycia (utrata czytelności), (b) grozi pominięciem w innym
serwisie. Mechanika: metoda `add` Party przyjmuje politykę z zewnątrz (i analogicznie
konstruktor przy tworzeniu podmiotu z identyfikatorami). Jeśli wybór polityk jest dynamiczny
(tenant, region, parametry) — w serwisie aplikacyjnym działa **fabryka polityk**.
Terminologia: implementacje polityk to **domknięcie logiki**, a źródło tych implementacji to
**wybór domknięcia** (fabryka lub serwis aplikacyjny). Alternatywa: konfiguracja polityk
zaszyta na stałe — prostsza, gdy konfigurowalność nie jest oczekiwana, a nowa reguła „od
czasu do czasu" nie boli.

### Role globalne vs role w relacji

Role nie są złe — są **niezbędne**; tylko nie mogą być centrum modelu. Są jego dynamiką:
atrybutem tożsamości. Dwie fundamentalne formy roli:

- **Rola w relacji** — jak podmiot zachowuje się **wobec drugiego** (pracownik–pracodawca
  w relacji „zatrudnienie"); temat L06–L07.
- **Rola własna / globalna** — kim podmiot jest **sam z siebie** (klient, partner
  strategiczny), niezależnie od relacji.

Po co globalne: firma z 1000 pracowników, 30 partnerami, 18 dostawcami modelowana w pełni
relacyjnie wymagałaby relacji z każdym podmiotem — formalnie poprawne, biznesowo „zakładanie
gaci przez głowę". Często wystarczy **klasyfikacja** („ta firma jest dostawcą"), prostsza,
szybsza i wystarczająco precyzyjna; dla wielu biznesów jedyne istotne relacje to te od samej
firmy, a relacje między klientami/użytkownikami/partnerami nie są istotne.

### Trzy strategie implementacji ról

Wspólna idea: zamiast mnożyć klasy (Customer, Supplier, Partner), **przypisujemy rolę do
istniejącego Party** — jeden byt pełni wiele ról dynamicznie, bez dziedziczenia po Party, bez
migracji, bez duplikacji danych; łatwe filtrowanie i klasyfikacja. Dodawanie roli to
przypisanie do kolekcji — z zastrzeżeniem reguł (rola „B2B Customer" nie dla osoby; dział
w firmie nie może mieć roli „Employee") → **polityki ról**, analogicznie do identyfikatorów:
polityka definiowana np. przy tworzeniu obiektu, sprawdzana w metodzie dodającej rolę; tu
dynamika zmian jest zwykle większa, więc dobrą opcją jest fabryka polityk albo fabryka ról
uwzględniających polityki. Rola ≠ flaga (`isCustomer`, `isVendor`): flaga pada, gdy ktoś jest
jednocześnie klientem i dostawcą albo zmienia rolę w czasie; rola to **cecha przypisana do
bytu w danym momencie** — dodawana, usuwana, zmieniana, odzwierciedlana w zdarzeniach.

| Strategia | Opis | Zalety | Wady / kiedy boli | Kiedy stosować |
|---|---|---|---|---|
| **1. Rola jako tekst (obiekt wartości)** | Niemutowalny rekord opakowujący nazwę roli; dodanie = dopisanie do zbioru po sprawdzeniu polityki | Minimalna liczba klas, brak katalogów, błyskawiczne wdrożenie | Zero walidacji nazw („klient", „Klient", „klient przez k") → po kwartale trzy zapisy tej samej roli i pytanie, który prawidłowy; trudne raportowanie; brak metadanych (opisów, ograniczeń, odpowiedzialności); „żyj szybko, zgiń młodo"; jak produkcja w Excelu | MVP, proste aplikacje, start |
| **2. Hierarchia typów (rola = klasa)** | `PartyRole` abstrakcyjny, podklasy Employee, Employer, Customer, Supplier…; w duchu Role Object Pattern, ale tu o cechach, nie zachowaniach | Każda decyzja jawna, kontrakt semantyczny audytowalny, bezpieczeństwo kompilacji; podtyp sam wie, które Party może obsłużyć (polityka jest elementem roli); do klasy roli można dodać cechy/zachowania wspólne dla wszystkich posiadaczy | Nowa rola = klasa + testy + deploy; zwinność znika, „zostaje beton"; koszmar przy rolach dynamicznie pojawiających się i znikających | Bank/compliance: błędy mają konsekwencje finansowe lub prawne (literówka w roli = raport do KNF), role stabilne (LoanOfficer, SeniorLoanOfficer, ComplianceOfficer), kod samoopisujący, formalna kontrola; OK też przy 2–3 rolach |
| **3. PartyRoleType (wzorzec Type/Instance, Role Catalog)** | Katalog typów ról (`PartyRoleType` = szablon: nazwa, opis, **constraints**) + instancje (`PartyRole` = kto pełni); analogia do ProductType/ProductInstance z archetypu Product | Rola dodawana/zmieniana/wyłączana **bez deployu**; constraints (np. lekarz = osoba min. 35 lat); **rozszerzenia przypinane do typu** (np. obowiązek raportowania grypy dla wszystkich lekarzy naraz, nie per instancja) | Centralizacja: zmiana w typie wpływa na wszystkie instancje — wymaga ostrożności | Duże, dynamiczne środowiska: platformy SaaS, multitenant, role żyjące jak organizacja |

W materiałach używana jest strategia 1 (dydaktyczna prostota), z zapowiedzianym powrotem do
strategii 3, bo to ona **otwiera drzwi do rozszerzeń modelu** (RoleRequirements +
Capabilities, L08).

### Party jako atomowy kontekst transakcyjny + optimistic locking

Party = trzy składniki razem: `PartyId` (trwały punkt odniesienia), `RegisteredIdentifiers`
(semantyczne identyfikatory), `Roles` (klasyfikacje). To **nie przypadkowa agregacja**, lecz
atomowy kontekst transakcyjny — najmniejsza spójna jednostka zmian: zmiana roli, dodanie
identyfikatora i aktualizacja danych rejestracyjnych dzieją się w jednej transakcji, bez
ryzyka zapisania połowy stanu. Powód praktyczny: role i identyfikatory są krytyczne
operacyjnie i **autoryzacyjnie** (kto ma dostęp, co może zrobić, jak system interpretuje
tożsamość) — ich spójność i niepodzielność zmian jest kluczowa; „muszą zmieniać się razem
albo wcale".

Pole **version** = **optimistic locking**: przy równoległym zapisie system porównuje wersję
obiektu z bazą; różnica → ktoś już zmienił → operacja odrzucona lub ponowiona. Lekki
mechanizm bez blokad, chroni przed przypadkowym nadpisaniem, nie blokując pracy innym.
Nie wszystkie informacje wymagają takiej precyzji — część może być spójna końcowo,
przechowywana osobno, aktualizowana asynchronicznie (→ sekcja 3, granice).

### Builder — język domenowy tworzenia podmiotów

Builder sprawdza się, gdy kształt obiektu różni się między wywołaniami; zamiast złożonych
konstruktorów i kaskad setterów podmiot „opowiada się": kto to jest, jakie ma dane, jaką
rolę, czym się identyfikuje. Przykłady:

- **Anna Nowak, klient indywidualny**: nowy podmiot z losowym identyfikatorem, rolą
  Customer, numerem PESEL, będący osobą z danymi personalnymi — jeden ciąg tworzy kompletny,
  spójny obiekt zgodny z politykami typów.
- **ACME sp. z o.o.**: jednocześnie dostawca i partner biznesowy, z NIP-em, reprezentowana
  jako Company.

W obu przypadkach zero powielonej logiki: tożsamość (`PartyId`) wspólna, **role
i identyfikatory to dane, nie typy** — jeden rdzeń opisuje człowieka, firmę i departament bez
rozbijania świata na osobne tabele, klasy i flagi. W środowisku wielodomenowym (bank:
klienci indywidualni + firmy) konstrukcja daje błyskawiczne rozróżnienie i rozszerzanie
zachowań bez duplikacji.

### Rozszerzenie: model adresów (szczegóły z L05)

Adres to **nie pole, lecz osobny byt z tożsamością, logiką i regułami** — i nie tylko
lokalizacja: to dowolny punkt kontaktu lub identyfikacji przestrzennej, „brama komunikacji
z fizycznym lub cyfrowym światem", nośnik relacji nadawca–odbiorca. Formy: adres pocztowy,
e-mail (punkt, do którego można wysłać wiadomość), telefon (adres komunikacyjny), URL (adres
cyfrowy), współrzędne GPS (adres przestrzenny). Model:

- `Address` (abstrakcyjna): **AddressId** (tożsamość), **PartyId** (do kogo należy),
  **useTypes** (przeznaczenia), **validity** (okres obowiązywania), **AddressDetails**
  (szczegóły).
- **AddressDetails** — lekki interfejs na dane kontekstowe; implementacje: GeoAddress
  (ulica, numer, miasto, kod), EmailAddress, PhoneAddress (cyfry + kierunkowy), WebAddress.
  Nowy typ adresu = nowa implementacja, bez dotykania istniejącego kodu (**OCP**: otwarte na
  rozszerzenia, zamknięte na modyfikacje). Reguły per typ (np. billing tylko dla
  organizacji, zamieszkania tylko dla osób).
- **AddressLifecycle** — kontrakt semantyczny cyklu życia: zdefiniowanie, aktualizacja,
  usunięcie (rozszerzalne o zmianę ważności, dezaktualizację, blokowanie; złożone procesy
  zarządzania adresami — poza modelem). Model zdarzeń **celowo nie jest uwspólniony**: każdy
  typ adresu ma inne dane, a zdarzenia niosą deltę zmiany (GeoAddress emituje własne
  zdarzenia). Daje: reaktywność (inne części systemu słuchają), pełny audyt (każda zmiana
  zostawia ślad), integracje, wymogi regulacyjne.
- **AddressUseType** — znaczenie biznesowe: korespondencyjny, billingowy, wysyłkowy,
  kontaktowy; adres może mieć kilka useType (siedziba = billing + mailing; e-mail = kontakt
  + billing dla e-faktur PDF). Oddziela **znaczenie od struktury** (typ danych mówi „co to
  jest", useType „do czego służy"), zapobiega mnożeniu klas (BillingAddress,
  ShippingAddress…) i eksplozji kombinatorycznej typ×zastosowanie; jest punktem zaczepienia
  reguł („dokładnie jeden aktywny adres billingowy", „Residential tylko dla osoby
  fizycznej"); nowy kontekst użycia (Legal, Support) dodaje się bez zmiany logiki.
- **Sekcja krytyczna = kolekcja adresów podmiotu**, nie pojedynczy adres — bo reguły (jeden
  aktywny kontaktowy; billing tylko firmy; zmiana wysyłkowego max raz na kwartał) dotyczą
  zbioru. Dwa warianty umiejscowienia:
  - kolekcja w Party: intuicyjne, dla małych systemów wystarczające; ale granice transakcji
    szerokie (do pamięci wciągane adresy, identyfikatory, role, potem preferencje, zgody,
    hasła…) → ograniczona dostępność (długa operacja, np. weryfikacja adresu, blokuje
    niezależne, np. zmianę zgód), spadek elastyczności (techniczne wymuszenie kolejności
    biznesowo niezależnych operacji), nieoptymalne zasoby (rosnące sekcje krytyczne, dłuższe
    transakcje, trudniejsze skalowanie);
  - **osobny agregat `Addresses`**: identyfikowany przez PartyId, zawiera wszystkie adresy
    podmiotu i **samodzielnie egzekwuje reguły spójności** — to tu (nie w Party, nie
    w pojedynczym Address) żyją polityki, bo tylko ten obiekt zna cały kontekst. Po
    wydzieleniu Party „nie wie nic o adresach"; powstaje dedykowany stos (model +
    repozytorium + fasada) → łatwa droga do modułu „książka adresowa", a nawet mikroserwisu;
    skalowalność horyzontalna; operacje na adresach nie blokują reszty; klarowny podział
    odpowiedzialności. Koszt: dwa repozytoria, dwa konteksty transakcyjne, synchronizacja
    zdarzeń.
- **AddressDefiningPolicy** — „czy zdefiniowanie/dodanie/aktualizacja adresu jest
  dozwolona?": brak duplikatów (dwa identyczne adresy tego samego typu), brak nakładających
  się okresów ważności (jeden aktywny kontaktowy w danym czasie), ograniczenia useType
  (billing tylko organizacje), limity ilościowe (max 5 aktywnych), reguły kontekstowe
  (Residential tylko dla Person). Polityki komponowalne.

---

## 7. Relacje między podmiotami

### 7.1 Typowe błędy i poziomy złożoności (L06)

Rzeczywisty świat się splata — **relacje są krwiobiegiem systemu**: dzięki nim podmioty
współdziałają, wymieniają informacje, zawierają umowy, tworzą hierarchie, rodziny,
organizacje. I właśnie w relacjach powstaje najwięcej błędów projektowych — coś, co na
diagramie jest prostym połączeniem dwóch klas, okazuje się siecią zależności. Cztery poziomy
oczekiwań wobec modelu relacji:

1. **Semantyka.** Relacja musi mieć znaczenie — nie może być „linkiem między rekordami". Co
   znaczy, że dwie osoby są powiązane: współpracownicy, partnerzy, małżonkowie,
   pacjent–lekarz? Każda z tych relacji niesie inne znaczenie, inne reguły autoryzacji, inne
   konsekwencje biznesowe. Relacja zawsze ma **nazwę** oddającą sens: nie „A–B", lecz
   zatrudnienie, opieka, kontrakt, członkostwo. Bez semantyki system nie wie, jak się
   zachować.
2. **Kierunek.** Relacje symetryczne (rodzina, przyjaźń, partnerstwo) vs asymetryczne
   (ojciec–syn, pracodawca–pracownik, klient–dostawca). Symetria = strony równorzędne;
   asymetria = relacja kierunkowa, w której ma znaczenie, kto po której stronie stoi.
   Symetryczne są bardzo abstrakcyjne — dobre na papierze, słabe operacyjnie (trudno
   wywnioskować, kto co może). W praktyce niemal zawsze przechodzi się na **asymetryczne**:
   **każdą relację symetryczną da się zbudować z dwóch asymetrycznych; w drugą stronę to nie
   działa.**
3. **Role stron.** Każda relacja składa się ze stron, każda strona pełni rolę: w zatrudnieniu
   firma = zatrudniający, osoba = zatrudniany; w zarządzaniu kierownik/podwładny;
   w kontrakcie klient/dostawca. Role definiują uprawnienia, kontekst i logikę: kto jest
   stroną aktywną/pasywną, kto inicjuje, kto wykonuje, kto podlega skutkom.
4. **Reguły** — to one czynią relację mechanizmem kontroli biznesowej, a nie strukturą
   danych. Trzy klasy (jak przy adresach):
   - **ilościowe**: kierownik max 10 podwładnych; osoba pracuje dla max 3 organizacji;
   - **jakościowe**: tylko firma może zatrudniać; relacja lekarz–pacjent tylko przy
     odpowiednich rolach obu stron;
   - **czasowe**: kontraktu nie można zerwać przed 3 miesiącami; mentor–uczeń max rok od
     startu.
   Bez reguł zostaje „graf połączeń bez znaczenia, kontroli i logiki".

Przed implementacją klasy `PartyRelationship` trzeba odpowiedzieć na pytania o **granicę
i spójność**: czy relacje są częścią Party, czy oddzielnym bytem? Czy reguły między
relacjami a Party wymagają spójności natychmiastowej? Czy zmiana w Party wpływa na relacje
(można dodać relację do zablokowanego Party?) i odwrotnie (można zablokować menedżera
z aktywnymi podwładnymi?)?

**Błąd klasyczny: relacje osadzone w Party** (Party właścicielem wszystkich relacji
wychodzących, jedna transakcja, Party „źródłem prawdy o swoich związkach"). Zalety
(rzeczywiste, ale ograniczone): bezpośrednia dostępność relacji (jedno zapytanie o relacje
strony), zgodność z intuicją świata (to podmiot nawiązuje relacje — „choć to kwestia punktu
siedzenia"), prostota dla małych zbiorów danych, natychmiastowa spójność reguł dotyczących
relacji **jednego** podmiotu. Dobre na start, przy małej liczbie relacji, dla szybkiego
wdrożenia. Problemy wraz ze skalą:

- duża liczba relacji **przeciąża** model Party (szczególnie z ograniczeniami ilościowymi) —
  spadek wydajności dla podmiotów o wielu powiązaniach;
- Party staje się **obiektem Boga**: role + identyfikatory + adresy + relacje = zbyt wiele
  aspektów naraz; trudno rozwijać i utrzymywać;
- trudne filtrowanie i wydajność zapytań: „wszyscy klienci, których dostawcy mają aktywny
  kontrakt" = przetwarzanie dużych struktur w pamięci lub kosztowne JOIN-y;
- brak separacji odpowiedzialności: dane podmiotu i logika relacji w jednym miejscu —
  trudniejsze testowanie i refaktoryzacja;
- **reguły jakościowe i blokady**: reguła wymagająca znajomości obu stron („firma zatrudnia
  tylko osoby z rolą pracownik") wymusza odczyt i potencjalne blokowanie **dwóch Party
  w jednej transakcji** → obniżona dostępność.

### 7.2 Poprawne modelowanie: PartyRelationship jako autonomiczny agregat (L07)

W systemie z tysiącami powiązanych podmiotów (firmy z setkami pracowników, menedżerowie
z zespołami, klienci z wieloma dostawcami, ubezpieczyciel z dziesiątkami agencji i setkami
agentów) każda operacja na relacji w modelu „relacje w Party" wymaga kontekstu obu stron —
`fromParty` i `toParty` zablokowanych w tej samej transakcji; jeśli jedna z nich jest już
w innej transakcji (np. przypisywanie roli/identyfikatora), mamy klasyczny konflikt.

Kluczowa decyzja: **poluzować spójność natychmiastową na rzecz skalowalności, elastyczności
i dostępności.** Co jeśli menedżer będzie miał 11 zamiast 10 podwładnych? Albo relacja
„manager of" trafi do kogoś, kto jest już partnerem, nie pracownikiem? Takie sytuacje są
rzadkie i naprawialne **asynchronicznie**: rekoncyliacja danych, cykliczna automatyczna
walidacja — „napisać joba, który to wyczyści". Doświadczenia dużych organizacji i badania
(raporty State of DevOps) wskazują, że skalowalność i dostępność są w praktyce ważniejsze niż
ścisła spójność natychmiastowa.

Model (analogiczny do wydzielonych `Addresses` — **byt autonomiczny transakcyjnie**):

- **PartyRelationship** — pełnoprawny obiekt domenowy, nie link:
  - **name** — semantyka (zatrudnienie, zarządzanie, członkostwo, kontrakt, delegacja);
  - **validFrom / validTo (Validity)** — okres obowiązywania; relacja może automatycznie
    wygasać, być historyczna;
  - **PartyRelationshipIdentifier** — własna tożsamość: relacja jest jednoznacznie
    identyfikowalna i „żyje w oderwaniu od obu podmiotów" — może być niezależnie śledzona,
    archiwizowana, analizowana;
  - strony **from** i **to** jako **PartyRole** — prosta struktura: identyfikator podmiotu +
    jego rola w relacji. To dzięki rolom system wie, kim jest PartyId=123 w tym kontekście:
    pracodawcą, lekarzem czy klientem.
- **PartyRole jako brama kontroli**: rola nie może być przypisana dowolnie — tylko
  organizacje mogą być pracodawcą lub dostawcą; tylko osoby fizyczne pracownikami, pacjentami
  lub konsumentami; klientami mogą być firmy i osoby, ale działy/departamenty/zespoły już
  nie. Reguły aplikowalności definiuje **PartyRoleDefiningPolicy**, której wywołanie jest
  **wymuszone w fabryce PartyRole** — rola zawsze ma sens dla typu podmiotu.
- **Reguły na kilku poziomach**: ograniczenia roli (względem typu Party) + ograniczenia samej
  relacji: **czasowe** zapewnia rekord relacji (Validity), **ilościowe i jakościowe**
  egzekwuje **polityka definiowania relacji** (np. menedżer max 10 podwładnych; klient ma
  dokładnie jednego key account managera). Model staje się mechanizmem egzekwowania reguł
  świata rzeczywistego, nie odwzorowaniem struktury danych.

Rezultat: model, który **zachowuje semantykę** (nazwa i znaczenie), **rozróżnia kierunek**
(strona aktywna/pasywna), **uwzględnia role** (kontekst każdej strony) i **respektuje
reguły** (ilościowe, jakościowe, czasowe). Odpowiada nie tylko „kto z kim jest powiązany",
ale „w jakim kontekście, jak długo i na jakich zasadach".

Przykłady (ten sam wzorzec, różne światy):

- **Bankowość**: John Smith (Person, PESEL, wygenerowany PartyId) ↔ Some Bank Corp
  (Organization): relacja „account holder" z kierunkiem Customer→Bank, `Validity.from()` =
  aktywne od dziś bez końca. Oddział ↔ centrala: ta sama mechanika, inna semantyka ról —
  hierarchie i sieci współpracy „wychodzą z modelu naturalnie". Jane Doe: Person, relacja
  zatrudnienia z bankiem **oraz** relacja opiekuna klienta z Johnem — jedna osoba, wiele ról
  i relacji, bez dodatkowych klas i haków.
- **Telekomunikacja**: abonent ↔ operator — umowa abonamentowa jako relacja z Validity 24
  miesiące (wygasa automatycznie, bez ręcznej ingerencji); operator ↔ dealer/reseller —
  partnerstwo aktywne od 6 miesięcy bez daty końca (ten sam schemat: sieci sprzedaży,
  franchising, dostawca–hurtownik); klient korporacyjny — inny kontekst, zasady, role, SLA;
  przypisany account manager.
- Ten sam model działa w logistyce, administracji publicznej — wszędzie, gdzie ktoś kogoś
  reprezentuje, zatrudnia, obsługuje, rozlicza lub nadzoruje.

Obserwacje przekrojowe: **uniwersalność** (Person i Organization zawsze takie same — kontekst
nadają role i relacje; ten sam podmiot bywa klientem banku, abonentem, kontrahentem,
pacjentem); **role definiują znaczenie** (CUSTOMER/BANK, SUBSCRIBER/SERVICE_PROVIDER,
EMPLOYEE/EMPLOYER — język domeny, nie implementacji); **czas ma znaczenie** (Validity:
relacja istnieje, wygasa, jest historyczna); **kierunek niesie semantykę** (FROM→TO wskazuje
inicjatora, nadrzędność, zależność); **kod bliski językowi biznesu** (builder
`newRelationship().from().to().named().build()` czyta się jak zdanie; builder jako
przystępna alternatywa fabryk ról i relacji). PartyRelationship to nie wzorzec techniczny,
lecz **język opisu rzeczywistości organizacyjnej wspólny dla branż**.

### 7.3 Uprawnienia z relacji (rozszerzenie Kuby, nie z transkrypcji M07)

Częste rozwinięcie Party: prosty model uprawnień, którego **nie wyliczamy, tylko konfigurujemy**.
Uprawnienie to zawsze uprawnienie podmiotu **w kontekście innego podmiotu**.

- **Reguła z konfiguracji:** „jeśli A jest w relacji R z B, to A zyskuje (albo traci) uprawnienie
  U wobec B” albo odwrotnie: B wobec A. Dowolnie, także po ścieżce: „wszyscy dostawcy MOJEGO
  dostawcy zyskują U wobec mnie”. Ktoś stał się kimś dla mnie, więc automatycznie coś zyskał
  (zgodnie z konfiguracją).
- **Ważność** uprawnienia wynika z ważności relacji: relacja wygasa, uprawnienie też.
- **Nadanie wprost (CRUD)**, opcja dodatkowa i rzadka: uprawnienie bez relacji, z własną
  ważnością. Tylko gdy uprawnienia nie da się wyjaśnić językiem relacji.
- **Karta uprawnień podmiotu:** jeden widok wszystkiego, co podmiot może wobec innych
  podmiotów, ze źródłem (która relacja, ścieżka albo nadanie) i ważnością.
- **To nie jest autoryzacja w rozumieniu Spring Security.** Decyzja („czy może teraz?”) może
  potrzebować uprawnienia z Party i innych danych, więc żyje w procesie, który pyta Party
  (por. Auth Workflows w §9). Uprawnienie definiujemy jako fakt o dwóch podmiotach, nie jako
  gotową decyzję.

---

## 8. Zastosowania i rozszerzenia w różnych branżach (L08)

### Responsibilities — idea z literatury i czemu zwykle zostaje w książkach

Literatura archetypów opisuje **responsibilities/accountability**: rolom przypisuje się
obowiązki (Team Leader: motywować, przydzielać zadania, prowadzić oceny; doradca kredytowy:
poprawność oceny zdolności i kompletność dokumentacji; lekarz prowadzący: decyzja o terapii
i akceptacja planu leczenia; Account Manager: utrzymanie klienta i KPI kontraktowe)
z **conditions of satisfaction** (kierownik magazynu: min. 95% pozycji dostępnych w 30 dni;
radiolog: opis badania do 24 h od zdjęcia). W prawdziwych projektach prawie nikt tego nie
modeluje — te elementy sprowadzają się do kontraktów i umów zarządzanych w dedykowanych
modułach; w systemach zostaje „pusta struktura roli". Idea nie jest zła — jest trudna do
zastosowania w dynamicznym świecie operacyjnym.

### Capability — od „za co odpowiadasz" do „co potrafisz"

Przejście subtelne, ale zmieniające wszystko: **responsibility to obowiązek narzucony
z zewnątrz; capability to możliwość** — dynamiczna, wynikająca z tego, kim jesteś i co możesz
w danym kontekście. Capability ożywia Party: z kartoteki ludzi i organizacji robi **sieć
jednostek zdolnych do działania**. Capability to deklaracja kompetencji, zasobów, zasięgu
i dostępności — nie obowiązek i **nie deklaracja dostępności/rezerwacja** (o wolnym terminie
decyduje inny moduł).

Model: każde Party ma 0..* capabilities. Umiejscowienie — analogicznie do relacji i adresów:
teoretycznie zarządzane z poziomu Party (jak role; bywają ścisłe zależności między rolami
a capabilities), ale mogą mieć **dedykowany agregat** (jak Addresses), gdy pojawią się reguły
wymagające natychmiastowej spójności w obrębie wszystkich capabilities podmiotu.

- **CapabilityType** — definiuje typ zdolności (analogia do PartyRoleType). Sam string
  (`skillName = "Programming"`) to worek bez dna: dla jednego Python/Data Science, dla
  innego Java/backend, dla trzeciego sterowniki PLC. CapabilityType to nie etykieta, lecz
  **definicja znaczenia**: mówi, jakie dane są niezbędne, by powiedzieć, że ktoś zdolność
  naprawdę posiada — określa **obowiązkowe OperatingScopes** (Medical Imaging: lokalizacja,
  czas, protokół; Electrical Installation: lokalizacja, poziom kompetencji, certyfikat;
  Software Development: produkty, zasoby, liczba projektów/mies.). Efekt: każda nowa
  Capability podlega **walidacji semantycznej** względem definicji typu — „model
  samoweryfikujący się": obiekt niespełniający wymagań typu nawet nie powstanie; nie trzeba
  pilnować poprawności w serwisach, bazie, testach ani UI. Różnica między systemem, który
  **sprawdza dane**, a takim, który **rozumie, co dane znaczą**.
- **OperatingScope** — wymiary działania; każda implementacja to prosty, niemutowalny obiekt
  wartości; razem dają pełny obraz kontekstu („zdolność bez kontekstu to pusta obietnica"):
  - **LocationScope** — gdzie; **TemporalScope** — kiedy; **QuantityScope** — ile;
    **SkillLevelScope** — jak dobrze; **ProtocolScope** — według jakich zasad;
    **ProductScope** i **ResourceScope** — z czym i na czym.
  - Plus **Validity** — okres obowiązywania capability.
  - To nie pola danych, lecz wiedza domenowa: można ją analizować, filtrować, porównywać,
    weryfikować; model „sam pilnuje sensu" zamiast setek walidacji w serwisach.

### Trzy przykłady Capability

1. **Maria Nowak — technik USG (Medicoders Warszawa Mokotów)**. Party typu Person
   z capability **Medical Imaging** wymagającą 4 scope'ów: ProtocolScope = Ultrasound
   Imaging, procedury abdominal/cardiac/prenatal/thyroid; LocationScope = Medicoders
   Warszawa Mokotów; TemporalScope = pn–pt 8:00–16:00; QuantityScope = max 15 pacjentów
   dziennie; Validity 2024–2026. Pytania wynikające wprost z modelu (w klasycznym systemie:
   osobne pola, walidacje, ręczny kod): badanie prenatalne w środę 10:00? **Tak** (protokół
   zawiera prenatal, środa 10:00 w zakresie czasowym). USG w klinice Medicomp Ursynów?
   **Nie** (LocationScope ściśle określony). 18 pacjentów w czwartek? **Nie** (limit 15 —
   odmowa dla 16., 17., 18. pacjenta, choć reszta warunków spełniona). Uwaga: to określenie
   **możliwości**, nie system rezerwacyjny.
2. **Piotr Wiśniewski — kierowca dostaw**. Person z capability **Goods Delivery** — nie
   „Piotr to kierowca", lecz: realizuje dostawy określonych towarów w konkretnym zasięgu,
   czasie i zakresie. LocationScope = Warszawa + 50 km; ProductScope = Electronics,
   Furniture, Food, max 500 kg; QuantityScope = max 25 dostaw dziennie; ResourceScope = „Van
   3.5t", 15 m³; TemporalScope = 6:00–22:00, pn–nd; Validity 2024–2025. Pytania: meble do
   Pruszkowa? **Tak** (Furniture + Pruszków w promieniu 50 km — model „rozumie przestrzeń"
   bez tabel regionów i ręcznych filtrów). Elektronika do Radomia (100 km)? **Nie** (produkt
   zgodny, zasięg przekroczony). Zamówienie spożywcze w niedzielę 20:30? **Tak** (Food,
   7 dni, 6–22). AGD 650 kg? **Nie** (limit 500 kg — odmowa mimo zgodności czasu i miejsca).
3. **Backend Team Alpha (DevPro Software)** — capabilities mają nie tylko ludzie, ale
   organizacje i jednostki organizacyjne. Capability **Backend Development** = zdolność
   **zespołowa**, operacyjna (nie indywidualna umiejętność): SkillLevelScope = Microservices
   Architecture 9/10, certyfikaty AWS Certified i Kubernetes Certified; ProtocolScope =
   Agile/Scrum Development (Sprint Planning, Code Review, CI/CD, Pair Programming);
   ProductScope = REST API, Event-Driven Systems, Database Design; ResourceScope = 6 backend
   developerów + Tech Lead + DevOps (8 osób); TemporalScope = pn–pt 9–17; Validity
   2024–2025. Pytania: projekt event-driven? **Tak** (zakres produktowy — system nie pyta
   „czy ktoś tak robił", sprawdza scope). Scrum? **Tak**. Projekt na 10 backendowców?
   **Nie** (twardy limit 8 — dostępna moc przerobowa). Mikroserwisy w AWS/K8s? **Tak**
   (poziom 9/10 + certyfikaty; bez tagów i pól tekstowych).

Podsumowanie: Capability zmienia sposób, w jaki system myśli o ludziach i organizacjach —
zamiast stanowisk i nazw ról opisuje **zdolności działania w kontekście** (gdzie, kiedy, jak,
w jakim zakresie). Staje się „semantycznym interfejsem między światem podmiotów a światem
systemu".

### RoleRequirements — połączenie ról (PartyRoleType) z Capabilities

Tu następuje zapowiadany powrót do **PartyRoleType** (strategia 3 ról). Organizacja chce
wiedzieć nie tylko, co zespół potrafi, ale **czy może pełnić rolę operacyjną**. Rola
**Backend Delivery Team** to nie etykieta/tag w tabelce, lecz formalna deklaracja: „zespół,
który musi posiadać capability Backend Development z umiejętnościami na poziomie min. 8,
z certyfikatami AWS i Kubernetes, działający wg protokołu Agile/Scrum". Czysta deklaracja
domenowa — bez YAML-a, walidatorów i serwisów sprawdzających warunki. Cztery elementy:

1. **PartyRoleType** — definicja roli w katalogu ról organizacji (typ, nie przypisanie);
   wszystkie role tego typu dzielą te same wymagania — dlatego wymagania żyją przy typie,
   nie przy każdej instancji PartyRole; „wzorzec kontraktu".
2. **RoleRequirements** — serce konstrukcji: nie klasa walidująca, lecz **semantyczna
   definicja warunków**; czysta logika spełnialności — model sprawdza, czy istnieje zestaw
   Capabilities w pełni pokrywający wymagania roli.
3. **CapabilityRequirement** — rola może wymagać różnych Capabilities i dla każdej definiować
   własne kryteria; odpowiada na pytanie „czy podmiot posiada aktywną Capability danego typu
   spełniającą wymagania poziomu, certyfikatów, protokołu i przepustowości?".
4. **ScopeRequirement** — każdy warunek graniczny Capability to osobny obiekt: „mini reguły
   semantyczne", nie if-y (minimalny poziom kompetencji, wymagany certyfikat, wymagany
   protokół); mikro-wyrażenia logiki domenowej — nie weryfikują danych, lecz interpretują
   ich znaczenie.

Działanie: **Backend Team Alpha** (poziom 9/10, pełne certyfikaty, Scrum) — spełnia wszystkie
wymagania → system odpowiada „tak". **Backend Team Beta** (poziom 6 < 8, brak certyfikatów
AWS/K8s, Kanban Workflow zamiast Agile/Scrum) → „nie". Nic nie jest blokowane ręcznie — nie
ma if-ów w serwisie ani walidacji w UI; formuła RoleRequirements po prostu nie jest
spełniona.

### Ewolucja możliwości modelu (narracja L08)

1. **Identyfikacja podmiotów + role** → autoryzacja i kontrola dostępu po roli, wyszukiwanie
   („znajdź wszystkich lekarzy", „wszyscy kontrahenci typu dostawca"), raportowanie
   odpowiedzialności, przypisywanie uprawnień; system rozumie strukturę, ale nie wie,
   **gdzie** role są pełnione.
2. **+ adresy i lokalizacje (PartyPlace)** → nowa klasa pytań: kto jest lekarzem
   w Warszawie? który oddział działa na Dolnym Śląsku? gdzie są dostawcy partnera
   logistycznego?
3. **+ relacje** → tryb katalogowy przechodzi w **sieciowy**: kto z kim współpracuje, kto
   kogo zatrudnia, kto komu zleca; „znajdź pracowników naszego dostawcy", „kto jest
   partnerem naszego partnera?", „które organizacje współpracują z nami pośrednio przez
   podwykonawców?" — system przestaje być zbiorem tabel, staje się grafem powiązań.
4. **+ Capabilities** → rzeczywistość operacyjna: „znajdź lekarza w placówce Medicode
   Mokotów z umiejętnością USG i certyfikatami", „hydraulik od studni głębinowych
   w promieniu 30 km od Płocka" — nie tylko kto kim jest, ale co może zrobić, gdzie i kiedy.

### Party jako graf semantyczny organizacji

Model **już jest** grafem: Party = wierzchołek, relacja (zatrudnienie, współpraca,
zlecenie) = krawędź, Capability = cecha wierzchołka. „W grafie nie pytamy czy, tylko jak; nie
szukamy wierszy, tylko ścieżek znaczeniowych." Przykłady: sieć TransPol Logistics
z podwykonawcami FastTrack, EcoFleet, CargoMate — zamiast JOIN-ów przez pół ekranu:
„znajdź kierowcę naszego podwykonawcy dostarczającego meble w promieniu 70 km od Warszawy"
→ Piotr Lewandowski; bankowość: „czy mamy partnera obsługującego transakcje PSD2
i audytującego kontrakty Ethereum?" → PayNova i SafeLedger. Co rozwiązuje podejście grafowe:

1. **Wykrywanie cykli i powiązań zwrotnych** — A zleca B, które współpracuje z A; błędy
   w danych, konflikty interesów, nielegalne łańcuchy podzleceń.
2. **Analiza zależności pośrednich** — skutki zmian: „jeśli ten oddział przestanie działać,
   które zespoły stracą dostęp do zasobów?" — jedno zapytanie zamiast serii JOIN-ów.
3. **Ścieżki kompetencji** — droga rozwoju Junior Developer → Tech Lead: system odkrywa
   brakujące Capabilities i certyfikaty, analizując ścieżki.
4. **Analiza zasięgu i grup operacyjnych** — skupiska kompetencji i luki („które zespoły
   w regionie Mazowsze mają uzupełniające się Capabilities"); naturalne klastry współpracy.
5. **Anomalie i ryzyka** — węzły bez relacji, role bez spełnionych wymagań, zespoły-wąskie
   gardła (analiza stopnia i gęstości połączeń).
6. **Punkty artykulacji** — wierzchołki, po których usunięciu graf się rozpada: „pozbycie się
   której osoby sprawi, że stracimy relacje z kluczowymi klientami?", „gdzie brakuje
   redundancji kompetencji?".
7. **Spójne składowe** — grupy połączone wewnętrznie, odcięte od reszty: „czy mamy silosy
   lub obszary bez przepływu informacji?".

W skrócie: graf pozwala widzieć pośrednie zależności, wykrywać cykle, analizować wpływ zmian
i rozumieć organizację jako **żywą sieć kompetencji i relacji**, a nie zbiór tabelek
z JOIN-ami.

---

## 9. Rola Party w architekturze organizacji (L09)

### Pozycja strategiczna: upstream + Open-Host Service

Party to **generyczny** model ludzi i organizacji (role, relacje, capabilities) używalny
w każdej branży: e-commerce, bankowość, ubezpieczenia, windykacja, telekomunikacja,
energetyka. Generyczność sugeruje usytuowanie jako **moduł upstream'owy** (strategiczny DDD)
oferujący wspólny zestaw funkcji dla otaczających procesów; wzorzec map kontekstów:
**Open-Host Service**.

### Kto korzysta z Party (integracje z innymi archetypami i modułami)

- **CRM** — rozumie przez Party, kim jest klient i partner, kto reprezentuje kogo, kto może
  podpisać umowę, a kto tylko negocjuje; chcąc spójnie zarządzać podmiotami, **deleguje
  zapis do Party**. Party nie przejmuje procesów CRM — wspiera je.
- **Ordering / platformy zamówień** — każdy proces biznesowy zaczyna się od pytania „kto?",
  a na nie odpowiada Party. Przypadek szczególny: zamówienie bez rejestracji — nie powstaje
  żaden podmiot; dane zamawiającego to po prostu **migawka (snapshot)** danych istotnych dla
  realizacji. Nawet przy zarejestrowanym podmiocie dane mogą się zmienić między złożeniem
  a realizacją (np. adres korespondencyjny) i zwykle **nie powinno** to wpływać na
  zamówienie → Ordering potrzebuje danych podmiotu **aktualnych w punkcie czasu**.
- **Systemy logistyczne** — Party jako katalog operacyjny jednostek zdolnych wykonać zadanie
  w fizycznym świecie: kurierzy, kierowcy, oddziały, partnerzy transportowi; z Capabilities
  system przestaje działać na etykietach („kurier", „sortownia"), a zaczyna rozumieć, kto
  potrafi dostarczyć, przewieźć, zaplanować, nadać priorytet.
- **Procesy operacyjne / Auth Workflows** — Party jako **warstwa autoryzacyjna**: zamiast
  własnych tabel użytkowników i ról w każdej aplikacji — pytanie „czy podmiot X ma rolę Y?".
  Czasem autoryzacja to proces: transakcja > 10 000 zł wymaga zatwierdzenia kierownika
  oddziału (wnioskowane z **relacji** w Party); > 500 000 zł — szereg zgód od kierownika po
  podpisy zarządu (również relacje z Party).
- **Product i Pricing** (inne archetypy) — kto oferuje produkt, kto jest producentem, kto
  resellerem, czy partner ma prawo sprzedawać daną kategorię.

Zmiana perspektywy: zamiast użytkowników rozsianych po bazach („użytkownik CRM",
„użytkownik logistyczny") — **jedno Party z wieloma rolami**; koniec niekończącego się
mapowania encji między modułami.

### Jak to wdrożyć — opcje i pułapki

- **Opcja 1: Party jako biblioteka** (definicje Party/Role/Relationship/Capability
  współdzielone przez zespoły; „stare dobre DRY"). Złudzenie: każda zmiana modelu (nowe typy
  ról, relacje, scope'y) = nowa wersja biblioteki + fala aktualizacji wszystkich systemów —
  **sprzężenie binarne**. Dalej: niejasne właścicielstwo (kto odpowiada za zmiany), chaos
  wersji (każdy system na innej), brak niezależności wdrożeniowej. Kluczowe: **Party to model
  stanowy** — potrzebuje historii, wersjonowania, audytu, trwałości relacji, wymagań
  regulacyjnych retencji i **prawa do zapomnienia**; biblioteka niczego nie zapisuje, więc
  każdy system miałby własne tabele i synchronizację → nie jedno Party, lecz 12 podobnych,
  różniących się implementacji. Strategicznie: z upstream–downstream przechodzimy w **Shared
  Kernel** — wzorzec, „chciałoby się rzec, antywzorzec".
- **Opcja 2: Party jako moduł / usługa domenowa** — własna baza, API, odpowiedzialny zespół;
  „produkt architektoniczny", np. oddzielna usługa; upstream w sensie strategicznego DDD.
  Inne systemy pytają przez **kontrakt** („podaj dane podmiotu X", „zarejestruj relację",
  „czy podmiot Y ma Capability Z?"). Zyski: jedno źródło prawdy, pełna audytowalność,
  niezależny rozwój i skalowanie, luźne sprzężenie (kontrakt zamiast kodu). Wady: koszt
  organizacyjny — pełnoprawny produkt z zespołem, utrzymaniem API, wersjonowaniem,
  zgodnością i bezpieczeństwem. „Ten koszt odróżnia organizację, która się skaluje, od tej,
  która cierpi od integracji."
- **Opcja 3: różne wymagania niefunkcjonalne klientów** (firma logistyczna: CRM — rzadkie
  odczyty, precyzja, spójność i historia; core logistyki — bardzo dużo zapytań, intensywne
  operacje na relacjach; HR — poufność, bezpieczeństwo, długie cykle życia danych; Partner
  Portal — duży ruch publiczny, wysoka dostępność, luźniejsze SLA spójności):
  - **3A: jedna instancja, różne interfejsy** (API transakcyjne dla CRM, operacyjne dla
    logistyki, publiczne dla partnerów) — częsty błąd: przejście z Open-Host Service na
    **Customer–Supplier**, a przy wielu klientach pułapka **Serial-Supplier** („seryjny
    dostawca"): zespół zamiast rozwijać model pisze endpointy dla kilkunastu zespołów
    i „betonuje sobie wdrożenie", bo zmiana dla jednego klienta psuje innego.
  - **3B: Single-tenant Party** — kilka fizycznych instancji, wspólny archetyp, semantyka
    i kod; jeśli kodem zarządza jeden zespół, specyfika tenantów szybko prowadzi do
    efektywnego utrzymywania kilku codebase'ów (problemy jak w 3A).
  - **3C: Fork** — zespół-autor oferuje funkcje do powszechnego użytku; kto chce po swojemu,
    robi forka i **przejmuje cały cykl życia aplikacji**. Ten sam kod tylko w momencie
    forka — potem ścieżki się rozchodzą, każdy odpowiada za swój kawałek. Odpowiedź na
    problemy 3A i 3B.
  - **3D: rozwiązania czysto techniczne** — skalowanie horyzontalne (więcej instancji);
    wzorzec **grodzi (bulkhead)** — oddzielne pule wątków dla oddzielnych strumieni;
    partycjonowanie danych na poziomie infrastruktury (MongoDB, Cassandra…); **bazy
    grafowe** zoptymalizowane pod typowe zapytania Party (wyszukiwanie węzłów i ścieżek).
    Często te proste zabiegi rozwiązują problem zróżnicowanych NFR-ów.

### Party jako produkt (Team Topologies)

Party to nie biblioteka, nie fragment kodu, nie schema w bazie — to **biznesowe capability
organizacji**, fundament większości procesów. Powinno być zarządzane jak regularny produkt
IT: w nomenklaturze Team Topologies — **value stream**, samodzielny strumień wartości z:
dedykowanym zespołem produktowym (rozwój), backlogiem priorytetyzowanym wg potrzeb klientów
wewnętrznych, budżetem i roadmapą odzwierciedlającą kierunek organizacji, metrykami
biznesowymi i technicznymi (czas rejestracji podmiotu, przepływ informacji, jakość danych
relacyjnych). Tylko wtedy Party utrzyma spójność semantyczną w skali organizacji,
dostarczając wartość w rytmie, który nie dławi innych zespołów. Zespół Party to nie „dostawca
tabel", lecz **kurator tożsamości organizacyjnej**. Efekty:

1. wysoka **wydajność wytwórcza** — inne zespoły nie rozwiązują problemów tożsamości, ról
   i relacji u siebie;
2. wysoka **wydajność operacyjna** — jedno kontrolowane miejsce z powiązaniami,
   zależnościami i kompetencjami;
3. łatwiejsza **niezawodność i stabilność** w skali organizacji;
4. **spójność semantyczna** — wszyscy mówią językiem: podmiot, rola, relacja;
5. łatwiejsze **zarządzanie zgodnością i bezpieczeństwem** — jedno źródło z audytem,
   retencją i politykami prywatności.

Traktując Party jak produkt, inwestujemy nie w kod, lecz w **zdolność organizacji do
rozumienia samej siebie** — stąd większa wydajność organizacji, które potraktowały archetypy
(Accounting, Product, Party) jako produkty. Test dojrzałości: każdy nowy proces/moduł/projekt
zamiast „zróbmy nową tabelę Userów" zaczyna od pytania **„czy to nie jest przypadkiem
Party?"** — „to moment, w którym architektura zaczyna naprawdę żyć".

### Elastyczność na nowe rynki (esencja scenki zamykającej)

Wejście na nowy rynek z odmiennymi regułami kulturowo-biznesowymi (np. decyzje zakupowe
podejmuje inny członek rodziny niż adresat oferty — targetowanie przez relację rodzinną) nie
wymaga przebudowy kodu ani sztuczek typu visitor/double dispatch: wystarczy **dodać
relacje i role jako dane**. To praktyczny dowód, że model oparty na tożsamości + rolach +
relacjach absorbuje egzotyczne wymagania konfiguracją modelu, nie zmianą struktury klas.

---

## 10. Cztery perspektywy (L10)

Kiedy Party jest właściwym archetypem? Gdy w systemie pojawiają się różne podmioty, które
wchodzą ze sobą w relacje i zmieniają rolę w zależności od kontekstu (słowa-mosty — sekcja
2). Próba implementacji bez Party kończy się utonięciem „w duplikatach danych, integracjach
i rozjazdach semantycznych". Cztery spojrzenia na ten sam porządek:

| Perspektywa | Bez Party | Z Party |
|---|---|---|
| **Analityczna** | Modele poszatkowane: tu użytkownik, tam klient, gdzie indziej kontrahent — każdy z własnymi polami, relacjami i znaczeniami; semantyczny chaos | Jeden spójny język modelowania podmiotów i ról; nie zgadujemy, czy klient to osoba, czy organizacja — to Party z odpowiednią rolą; czytelniejsza analiza procesów, głębsze rozumienie domeny; zamiast 12 diagramów dla 12 typów podmiotów — jeden model opisujący wszystkie |
| **Programistyczna** | Nieustanna walka z duplikacją: każdy mikroserwis ze swoimi tabelami User/Customer/Partner, każde API z własnym formatem, każdy system z własną walidacją; nigdzie nie widać relacji między bytami | Model gotowy do ponownego użycia; role przypisywane dynamicznie; relacje odkrywane zapytaniami grafowymi; Capability weryfikowane bez setek if-ów; wspólne API zarządzania podmiotami → mniej błędów, łatwiejsze testowanie, „kod, który zaczyna rozumieć świat" |
| **Architektoniczna** | Modele rozproszone po dziesiątkach systemów; synchronizacja to koszmar; spójność danych to złudzenie; każdy moduł ma własną prawdę o kliencie/użytkowniku/partnerze | Centralny punkt odniesienia dla organizacji (moduł, serwis, najlepiej produkt upstream'owy); wiadomo, gdzie jest źródło prawdy o relacjach, rolach, zdolnościach; łatwiejsze integracje — wspólny semantyczny fundament |
| **Biznesowa** | Brak odpowiedzi na: kto jest naszym klientem? z kim mamy umowę? kto jest partnerem/podwykonawcą? kto właściwie jest kim w sieci powiązań? | System jako „organizacyjny graf rzeczywistości": „znajdź dostawców z aktywnym Capability Express Delivery działających w Warszawie", „kto z partnerów może podpisać umowę w imieniu tej spółki" — nie raporty, lecz naturalny dialog z modelem; większa elastyczność, mniejsze koszty zmian, szybsza reakcja na nowe procesy |

Synteza: Party to nie tylko model danych — to **sposób myślenia o tożsamości w systemie**,
warstwa semantyczna łącząca ludzi, procesy i organizacje w spójną sieć zależności. Bez niego
system działa, ale „nie rozumie, kto w nim naprawdę gra". Party to nie tabela
z użytkownikami — to **zdolność organizacji do rozumienia, kim są jej uczestnicy**;
zdolność, która raz zbudowana staje się fundamentem każdej przyszłej zmiany.

---

## 11. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie domenowe / sygnał | Element archetypu Party |
|---|---|
| Użytkownik, klient, lead, kontrahent (osoba) | `Party` → `Person` + odpowiednia rola |
| Firma, spółka, instytucja | `Party` → `Organization` → `Company` (ew. podtyp: `JointStock`, `LimitedLiability`, `LimitedPartnership`) |
| Dział, departament, oddział, zespół, placówka | `Party` → `Organization` → `OrganizationUnit` |
| Partner (firma współpracująca) | Party typu Organization z relacją `Collaboration`/`SupplierOf` lub rolą globalną Partner |
| Dostawca / podwykonawca | Party z rolą `Supplier`/`Contractor` + ew. relacja z firmą nadrzędną |
| JDG („i osoba, i firma") | `Person` z identyfikatorem NIP i stosownymi rolami (wspólny interfejs identyfikatorów) |
| „może X wobec Y”, „ma dostęp do klientów swojego partnera” | uprawnienie z relacji (reguła z konfiguracji, ścieżka, ważność z relacji; §7.3) |
| Flaga `isCustomer`/`isPartner`/`isVendor`/`isLead` | `Role` jako dane Party (wiele ról naraz, zmienne w czasie) |
| „Klient", „partner strategiczny" sam z siebie | **rola globalna** (klasyfikacja bez kontekstu relacyjnego) |
| „Pracodawca–pracownik", „lekarz–pacjent", „opiekun klienta" | **rola w relacji** — `PartyRole` jako strona `PartyRelationship` |
| Katalog ról, rola z warunkami (lekarz ≥ 35 lat) | `PartyRoleType` + constraints (wzorzec Type/Instance) |
| Obowiązki przypinane wszystkim pełniącym rolę | rozszerzenie przypięte do `PartyRoleType` (nie do instancji) |
| PESEL, NIP, REGON, KRS, paszport, numer klienta | `RegisteredIdentifier` (typ + wartość + ważność) |
| Okres ważności dokumentu / umowy / zdolności | `Validity` |
| „PESEL tylko dla osób", „REGON/KRS tylko dla firm", „masz PESEL → bez NIP-u" | polityka przydzielania identyfikatorów (kompozyt małych polityk, wymuszona w `Party.add`) |
| Techniczny, uniwersalny klucz podmiotu | `PartyId` (jeden dla wszystkich typów; UUID generowany w aplikacji) |
| Zatrudnienie, kontrakt, członkostwo, delegacja, opieka | `PartyRelationship` (name, from/to jako PartyRole, Validity, własny `PartyRelationshipIdentifier`) |
| „Kierownik max 10 podwładnych", „jeden key account manager" | polityka definiowania relacji (reguły ilościowe/jakościowe); czasowe — Validity rekordu |
| „Tylko firma może zatrudniać", „pacjentem tylko osoba" | `PartyRoleDefiningPolicy` wymuszona w fabryce `PartyRole` |
| Adres pocztowy, e-mail, telefon, URL, GPS | `Address` + implementacje `AddressDetails` (GeoAddress, EmailAddress, PhoneAddress, WebAddress) |
| Adres billingowy / wysyłkowy / kontaktowy | `AddressUseType` (znaczenie oddzielone od struktury) |
| „Jeden aktywny adres billingowy", „max 5 adresów" | `AddressDefiningPolicy` w agregacie `Addresses` (sekcja krytyczna = zbiór adresów podmiotu, osobny agregat per PartyId) |
| Zmiany adresu w czasie, audyt, powiadomienia | `AddressLifecycle` + zdarzenia per typ adresu |
| „Co ktoś potrafi, gdzie, kiedy, ile, jak dobrze" | `Capability` + `CapabilityType` + `OperatingScope` (Location/Temporal/Quantity/SkillLevel/Protocol/Product/Resource) + Validity |
| „Czy zespół może pełnić rolę X?" | `RoleRequirements` przy `PartyRoleType` (+ `CapabilityRequirement`, `ScopeRequirement`) |
| Obowiązki roli z warunkami spełnienia | responsibilities / conditions of satisfaction — zwykle poza modelem (moduły kontraktów) |
| „Kto jest partnerem naszego partnera?", punkty artykulacji, silosy | perspektywa grafowa: Party = wierzchołek, relacja = krawędź, capability = cecha |
| Dane zamawiającego w zamówieniu | snapshot danych Party w punkcie czasu (Ordering), nie referencja do żywego modelu |
| Równoległe zmiany tego samego podmiotu | pole `version` + optimistic locking |
| Rejestracja podmiotu (różna per typ) | abstrakcyjna metoda `toPartyRegisteredEvent` w podklasie |

---

## 12. Pytania do biznesu przy odkrywaniu archetypu

### Tożsamość vs role

- Czy klient zawsze jest użytkownikiem? Czy każdy klient ma konto? Czy klient może istnieć
  przed kontem (import z CRM) albo nigdy go nie dostać (B2B przez API)?
- Czy ten sam podmiot bywa jednocześnie klientem, dostawcą, partnerem? Czy role zmieniają
  się w czasie (lead → klient; dostawca → partner; partner → kupujący)?
- Kim bywa klient: osobą fizyczną, firmą, JDG? Czy rozróżniacie osoby od organizacji?
- Ile definicji „klienta"/„partnera" funkcjonuje w organizacji i w ilu systemach żyją kopie
  danych tej samej osoby/firmy? Kto wie, „ilu mamy klientów"?

### Identyfikatory

- Po czym rozpoznajecie podmiot: PESEL, NIP, e-mail, telefon, numer klienta? Które z tych
  identyfikatorów bywają współdzielone, ponownie przydzielane, nieweryfikowane?
- Które identyfikatory mają okres ważności (paszport, licencja)? Co się dzieje po wygaśnięciu?
- Jakie reguły przydziału obowiązują (PESEL nie dla firmy; numer klienta tylko przy roli
  customer; „ma PESEL → bez NIP-u")? Czy reguły różnią się per tenant/region/rynek?

### Role

- Jakie role istnieją? Jak często pojawiają się nowe / znikają stare? (stabilne → hierarchia
  typów; dynamiczne → katalog PartyRoleType; MVP → tekst)
- Czy błędna rola ma konsekwencje prawne/finansowe (audyt, regulator)?
- Czy rola ma warunki przypisania (typ podmiotu, wiek, certyfikaty, inne role)? Czy role
  niosą wspólne cechy/obowiązki dla wszystkich posiadaczy?
- Czy wystarczy klasyfikacja (role globalne), czy istotne są relacje między podmiotami?

### Relacje

- Kto z kim wchodzi w relacje i **jak ta relacja się nazywa** (zatrudnienie, kontrakt,
  opieka, członkostwo)? Co z niej wynika (uprawnienia, odpowiedzialność, skutki)?
- Czy relacja jest kierunkowa — kto jest stroną aktywną, a kto pasywną?
- Jakie reguły: ilościowe (max podwładnych), jakościowe (kto może być którą stroną),
  czasowe (minimalny/maksymalny czas trwania)?
- Czy naruszenie reguły musi być zablokowane natychmiast, czy wystarczy wykryć i naprawić
  później (rekoncyliacja)? Co się realnie stanie przy 11 podwładnych zamiast 10?
- Czy zmiana stanu podmiotu wpływa na relacje i odwrotnie (blokada menedżera z aktywnymi
  podwładnymi)?
- Gdy ktoś staje się dla mnie X, czy automatycznie coś zyskuje (albo traci) wobec mnie albo
  moich podmiotów? Czy zdarza się nadać uprawnienie bez żadnej relacji i dlaczego?

### Granice spójności

- Które dane muszą zmieniać się atomowo z tożsamością (role, identyfikatory), a które mogą
  być spójne końcowo (adresy, preferencje, zgody, ustawienia bezpieczeństwa)?
- Jak często i w jakim rytmie zmieniają się poszczególne grupy danych? Czy operacje na nich
  mogą biec równolegle?
- Jakie reguły dotyczą **kolekcji** (jeden aktywny adres billingowy, limit adresów), a jakie
  pojedynczego elementu?

### Zdolności (Capabilities)

- Czy pytacie „kto potrafi X w miejscu Y, w czasie Z, w ilości N"? (dobór wykonawcy,
  planowanie, matchmaking)
- Co dokładnie znaczy dana umiejętność — jakie wymiary ją definiują (lokalizacja, czas,
  ilość, poziom, protokół, produkty, zasoby)?
- Czy przypisanie roli operacyjnej powinno zależeć od posiadanych, zweryfikowanych zdolności
  (RoleRequirements)?
- Czy pytania mają charakter grafowy: zależności pośrednie, cykle, wąskie gardła, kluczowe
  osoby, silosy?

### Architektura i organizacja

- Kto będzie konsumentem modelu podmiotów (CRM, ordering, logistyka, auth, pricing) i jakie
  mają wymagania niefunkcjonalne (spójność vs dostępność vs poufność vs ruch)?
- Które procesy potrzebują danych „na punkt w czasie" (snapshot), a które żywego podmiotu?
- Kto będzie właścicielem Party jako produktu (zespół, backlog, roadmapa, metryki)? Jakie są
  wymagania audytu, retencji i prawa do zapomnienia?
- Pytanie-refleks przy każdym nowym module: **„czy to nie jest przypadkiem Party?"**
