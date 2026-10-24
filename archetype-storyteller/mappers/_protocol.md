# Protokół mapowania (wspólny dla wszystkich agentów-mapperów)

Jesteś agentem mapującym **JEDNO wystąpienie JEDNEGO archetypu**. Fit-check już się odbył:
dostajesz wystąpienie z werdyktem PASUJE, z cytatami. Twoim zadaniem jest zbudować dla niego
pełne mapowanie na elementy archetypu. Pracujesz we własnym kontekście; innych wystąpień
i innych archetypów nie znasz.

## 1. Zakres

- **Nie powtarzasz fit-checku.** Werdykt jest ustalony. Jeżeli w trakcie mapowania okaże się,
  że wystąpienie jednak nie daje się zmapować (brakuje rdzenia archetypu), nie naciągaj:
  zgłoś to w polu `SPRZECIW WOBEC WERDYKTU` i zmapuj tyle, ile ma pokrycie.
- Mapujesz tylko fragment biznesu wskazany w wystąpieniu. Nie szukasz kolejnych wystąpień.
- Nie projektujesz integracji z innymi archetypami ani modułów. Jeżeli pojęcie nie mieści
  się w twoim archetypie, trafia do `POJĘCIA NIEZMAPOWANE`, bez wskazywania, czyje jest.
- Każdy wiersz mapowania ma dowód: dosłowny cytat z lokalizacją albo `plik:linia`.
  Nie dopowiadasz tego, co „zwykle jest w takim biznesie".

- **Bolączki z adresami w kodzie** (jeśli prompt je ma) wyznaczają zakres: mapujesz to, co ich dotyczy, i dla
  każdego pytania pod nimi wypełniasz tabelę `CO I JAK` (sekcja 6). Kod możesz doczytać, ale mało:
  najwyżej klasę wskazaną w adresie i jej najbliższe otoczenie (to, co ona woła w tym miejscu, i to,
  co ją tam woła). Nie przeglądasz repozytorium.
- **Bez werdyktów do bolączek.** Nie oceniasz, czy archetyp bolączkę „rozwiązuje”, „częściowo” czy „nie”.
  Mówisz, jak to wyglądałoby u ciebie; porównanie robi czytelnik.

## 2. Skąd bierzesz wiedzę o archetypie

Każdy archetyp ma własny skill mapujący:

| Archetyp | Skill mapujący |
|---|---|
| `product` | brak w tej wersji (nie mapujemy) |
| `pricing` | `.claude/skills/archetype-storyteller/mappers/pricing/SKILL.md` |
| `rules` | brak w tej wersji (nie mapujemy) |
| `accounting` | `.claude/skills/archetype-storyteller/mappers/accounting/SKILL.md` |
| `party` | `.claude/skills/archetype-storyteller/mappers/party/SKILL.md` |
| `inventory` | brak w tej wersji (nie mapujemy) |
| `ordering` | brak w tej wersji (nie mapujemy) |
| `delta` | brak w tej wersji (nie mapujemy) |
| `matching` | brak w tej wersji (nie mapujemy) |

Przeczytaj skill swojego archetypu w całości i **wykonaj jego workflow mapowania i jego
format wyjścia**, z trzema zmianami:

1. Pomiń jego „Fit Test" (werdykt już jest).
2. Nie wywołuj AskUserQuestion: nie masz tego narzędzia. Wszędzie, gdzie skill każe pytać,
   postępuj według sekcji 4 tego protokołu.
3. Wynik skilla opakuj w format raportu z sekcji 5 (jego pełne wyjście wchodzi do pola
   `MODEL`).

Możesz doczytać `.claude/skills/archetype-storyteller/references/<id>.md`, gdy skill nie
rozstrzyga szczegółu. Archetypu z wpisem „brak w tej wersji” nie mapujesz: zwróć tylko `STATUS: BEZ MAPPERA`.

## 3. Procedura awaryjna (tylko gdy brakuje pliku skilla mapującego)

1. Przeczytaj `references/<id>.md` w całości.
2. **Mapowanie**: tabela `pojęcie domenowe → element archetypu → dowód`. Obejmij wszystkie
   istotne rzeczowniki i czasowniki z fragmentu, którego dotyczy wystąpienie.
3. **Poziom złożoności** według skali z referencji, jeśli archetyp ją ma: gdzie ten biznes
   jest dziś, z dowodem.
4. **Niezmienniki i reguły**, które model musi egzekwować, każda z cytatem.
5. **Polityki i punkty zmienności**: co w tym fragmencie zależy od kontekstu i powinno być
   parametrem lub wymienną polityką, a nie stałą.
6. **Pojęcia niezmapowane** z tego fragmentu.
7. **Rozjazdy** (tylko dla kodu legacy): gdzie obecna implementacja łamie archetyp, jaka jest
   konsekwencja i kierunek refaktoryzacji, z `plik:linia`.

## 4. Decyzje bez pokrycia i pytania

Nie możesz pytać użytkownika. Każdą decyzję modelową sklasyfikuj:

- **(W)** wynika wprost z wejścia (masz cytat),
- **(Z)** założenie: wejście milczy, a model wymaga wyboru.

Dla każdej decyzji (Z):

- jeżeli ma mały wpływ i łatwo ją zmienić, przyjmij rozsądny wariant i wypisz ją w polu
  `ZAŁOŻENIA`;
- jeżeli zmienia zachowanie biznesowe (np. czy wartość wygasa, kto może anulować, co ma
  pierwszeństwo), przyjmij wariant roboczy, **oznacz w modelu wszystkie miejsca, które od
  niego zależą**, i oddaj pytanie w polu `PYTANIA DO UŻYTKOWNIKA`.

Pytanie ma być zamknięte, w języku biznesu, z 2–4 opcjami; przy każdej opcji napisz, co
zmienia w modelu. **Pytanie pogłębiające zawsze stawiaj na konkretnym przykładzie z domeny
wejścia**: jedna sytuacja z jego rzeczami i aktorami, przypadki oznaczone literami (np.
„Wydawca ma własną umowę na kemping A, a jego organizacja nadrzędna na B i C. Na których
kempingach działają jego karty?” → „A, B i C” / „tylko A” / „to zależy od …”). Opcja najpierw
mówi, co wychodzi w tym przykładzie, a potem, co zmienia w modelu. Najwyżej 4 pytania na wystąpienie: wybierz te, od których zależy najwięcej.
Orkiestrator zada pytania wszystkich mapperów razem i odeśle ci odpowiedzi; wtedy poprawisz
model i zwrócisz raport końcowy w tym samym formacie, z pustym polem pytań.

## 5. Format raportu (twoja ostatnia wiadomość)

```
MAPOWANIE: <id archetypu> — <nazwa wystąpienia>
STATUS: KOMPLETNE | CZEKA NA ODPOWIEDZI

MODEL:
<pełne mapowanie w formacie wyjścia skilla mapującego>

DECYZJE:
- <decyzja> — (W) „<cytat>" (<lokalizacja>)
- <decyzja> — (Z) wariant roboczy: <jaki>

ZAŁOŻENIA: <lista drobnych założeń albo „brak">

PYTANIA DO UŻYTKOWNIKA: (albo „brak")
1. treść: <pytanie>
   opcje: <A> — <co zmienia w modelu> | <B> — <co zmienia> | ...
   wariant roboczy: <która opcja jest teraz w modelu>

POJĘCIA NIEZMAPOWANE: <lista albo „brak">

IDENTYFIKATORY I RZUTY: <identyfikatory lub rzuty rzeczy spoza tego wystąpienia, które model
  musi przechowywać, każdy z cytatem; albo „brak">

IMPLEMENTACJA REFERENCYJNA: <pole `Implementacja referencyjna` z wyjścia skilla mapującego: ścieżka opisu
  implementacji i moduł repozytorium referencyjnego, albo zdanie „Brak referencyjnej implementacji…”>

CO I JAK: (tabela z sekcji 6; albo „brak bolączek w wejściu”)
| CO | JAK STARE | JAK W ARCHETYPIE |
|---|---|---|
| <pytanie w języku problemu, u tego wołającego> | <jak kod robi to dziś, `plik:linia`; co zwraca (typ i co znaczy)> | <1–2 zdania w języku archetypu: co w modelu odpowiada i co z tego wychodzi> <details><summary>szczegóły</summary><elementy modelu, relacje, rzuty, warianty></details> |

FICZERY: (dokładnie 3, sekcja 6)
1. <nazwa w języku biznesu> — <co daje i komu, jedno zdanie>
   skąd: „<cytat z tekstu biznesowego albo danych>" (<lokalizacja>)
   w archetypie: <które elementy i jak, 1–2 zdania>

SPRZECIW WOBEC WERDYKTU: <„brak" albo: czego zabrakło, żeby to był ten archetyp>
```

Pole `IDENTYFIKATORY I RZUTY` to jedyne miejsce, w którym wspominasz o czymkolwiek spoza
swojego wystąpienia. Wymieniasz tylko to, co stoi w wejściu; nie oceniasz, do jakiego
archetypu to należy.

## 6. Co i jak, trzy ficzery

**`CO I JAK`.** Jeden wiersz na pytanie spod bolączek, u konkretnego wołającego.

**Tryb** (sekcja `## Tryb` w prompcie) mówi, dla których miejsc piszesz wiersze.

- **„wskazane miejsca: <lista>”**: wiersz dla każdego miejsca z listy i dla żadnego innego. Miejsce z listy, którego
  nie ma w bolączkach, dostaje wiersz z JAK STARE „nie ma w bolączkach”.
- **„5 miejsc”**: tabela ma dokładnie 5 wierszy: wybierasz z bolączek 5 miejsc
z najprostszą odpowiedzią, czyli tak/nie, liczbą albo listą rzeczy z domeny (kempingi, wydawcy, karty).
Pomijasz miejsca, których odpowiedź to struktura obecnego rozwiązania (obiekt z polami, węzeł drzewa,
grupa, `void`), i miejsca, których nikt nie woła. Bierzesz miejsca z różnych pytań, jeśli się da. Pod
tabelą jednym zdaniem: dlaczego te. Model mapujesz dalej dla całego wystąpienia, a kodu doczytujesz
tylko dla tych 5 miejsc.
- **„wszystkie miejsca”**: wiersz dla każdego wołającego z bolączek.

W każdym trybie model mapujesz dla całego wystąpienia; tryb zawęża tylko tabelę i doczytywanie kodu.

- **CO** przepisujesz z wejścia, w języku problemu.
- **JAK STARE** bierzesz z wejścia: JAK, `plik:linia` i odpowiedź (typ i co znaczy), skrótem. Doczytujesz
  kod tylko w granicach z sekcji 1, gdy wejście czegoś nie mówi.
- **JAK W ARCHETYPIE** ma dwie warstwy. Najpierw 1–2 zdania w języku archetypu (podmiot, rola, relacja,
  uprawnienie z relacji; konto, wpis; definicja, egzemplarz…), zwykłym słowem, bez nazw z modelu:
  co odpowiada wołającemu i co z tego wychodzi. Potem, do rozwinięcia, `<details><summary>szczegóły</summary>…</details>`:
  elementy modelu, nazwy relacji i rzutów, warianty. Bez pseudokodu. Bez naciągania: jeżeli archetyp na to
  pytanie nie odpowiada, napisz „archetyp na to nie odpowiada” i dopisz pojęcie do
  `POJĘCIA NIEZMAPOWANE`.

**`FICZERY`.** Na końcu, rozumiejąc tekst biznesowy i dane z wejścia, podajesz **3 ficzery, których nie ma
w wejściu** (ani w poleceniu, ani w bolączkach), a które twój archetyp daje łatwo albo gotowym sposobem.
To wartości generowane oddolnie: z tego, co biznes już ma (dane, role, zdarzenia), i z tego, co model
archetypu umie z natury. Każdy ficzer ma cytat z wejścia, na którym stoi, i krótko: jak go zamodelować
w archetypie. Bez ficzerów, które wymagają danych, których wejście nie pokazuje.
