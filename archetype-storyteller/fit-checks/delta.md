# Fit-check: Plan vs Wykonanie (Delta)

Pod jednym rzeczownikiem (rata, dostawa, budżet, harmonogram) kryją się dwa światy:
oczekiwanie i rzeczywistość. Biznes pyta, o ile wyszło inaczej, niż miało wyjść, a odpowiedź
jest interpretacją zależną od polityk, nie zwykłym odejmowaniem.

## Pytanie główne

> Czy biznes zestawia zapisany plan z tym, co faktycznie się wydarzyło, i pyta
> „o ile i jak to się rozjechało"?

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Plan utrwalony** z góry (harmonogram, budżet, zobowiązanie, obietnica terminu, norma,
   oczekiwana ścieżka).
2. **Wykonanie rejestrowane osobno** (faktyczne wpłaty, dostawy, godziny, zdarzenia).
3. **Pytanie o odchylenie**, którego wynik podlega interpretacji: tolerancje, karencje,
   częściowa realizacja, inna kolejność, kompensowanie nadwyżką, różne zasady per dział
   lub segment.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „miało być / oczekiwaliśmy / zakładaliśmy / powinno" razem z „faktycznie / ostatecznie / w praktyce / wyszło" | ✅ |
| „harmonogram spłat zestawiamy z faktycznymi wpłatami" | ✅ |
| „spóźnione o 3 dni robocze, ale poniżej progu tolerancji" | ✅ |
| „częściowo zrealizowane", „zrealizowane inaczej", „dostarczone w innej kolejności niż plan" | ✅ |
| „windykacja liczy opóźnienie inaczej niż księgowość" | ✅ |
| „spóźnił się, ale wcześniej nadpłacał, więc nie naliczamy" | ✅ |
| „policz mi odchylenie", „o ile to się rozjechało", „co tu nie gra względem tego, co miało być" | ✅ |
| kod: `isPremiumLateAllowed`, encja z rosnącą listą wyjątków od terminu | ✅ |
| „termin realizacji: 3 dni" i nic więcej | ❌ sam plan |
| „status: opłacone / nieopłacone" | ❌ fakt, nie odchylenie |
| „liczymy ratę / cenę / podatek" | ❌ wyliczenie bez porównania |
| „raport: sprzedaż w tym miesiącu vs w zeszłym" | ❌ dwa wykonania |
| „symulujemy różne warianty cennika" | ❌ symulacja bez pary plan–wykonanie |

## Fałszywi przyjaciele

- **„plan", „harmonogram", „termin", „budżet", „opóźnienie"**: sam plan albo sam termin.
- **„plan"** jako nazwa oferty („plan Premium").
- **KPI i raporty porównawcze** bez utrwalonego planu, z którego wynikają skutki.
- **Flaga „po terminie"** bez pytania „o ile" i bez polityk.

## Wykluczające anty-sygnały

- Wartości są tylko liczone, nikt ich nie porównuje z planem.
- Pytania dotyczą wyłącznie faktu („czy zapłacił"), nie skali ani charakteru odchylenia.
- Odchylenie to jedno proste odejmowanie bez wyjątków i wejście to stwierdza.

## Przypadki graniczne

- **Plan i wykonanie w jednej encji** (pole `dueDate` i `paidDate`): pasuje dopiero, gdy
  z różnicy wynikają skutki zależne od reguł (odsetki, eskalacja, premie, kary). Dwie daty,
  które są tylko wyświetlane, to NIE PASUJE.
- **Projekty** (estymata vs czas faktyczny): pasuje, jeśli odchylenie jest rozliczane lub
  interpretowane; sam wykres burn-down to NIE PASUJE.

- **Plan wyliczany w locie** (nie ma encji planu, harmonogram powstaje z danych przy każdym
  zapytaniu): pasuje, jeśli wynik jest punktem odniesienia, z którym zestawia się wykonanie.
  Brak jawnego planu to wtedy wada obecnego modelu, a nie brak archetypu. Element 1 uznaj
  za spełniony cytatem pokazującym, że taki plan jest wyliczany i używany do porównania.
  Samo wyliczanie (ceny, podatki, rabaty, limity) to jeszcze nie plan. Zapewnienie z wejścia,
  że „dziś nikt tego nie porównuje", to słaby dowód: odnotuj je w `zastrzeżenia`, nie spieraj
  się z nim.

## Pytania rozstrzygające

- Czy zapisujecie z góry, jak miało być, i potem rozliczacie z tego, jak faktycznie wyszło?
  (TAK → PASUJE)
- Czy „spóźnienie/niedobór" liczy się u was różnie w zależności od sytuacji (tolerancje,
  wyjątki, typ klienta, dział)? (TAK → PASUJE)
