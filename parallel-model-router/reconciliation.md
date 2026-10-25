# Rekonsyliator: porównanie starego i nowego modelu do pliku

Wzorzec: `Reconciliation` / `Diff` / `Reaction` z `pilloPl/bigballofmud` (`acl/reconciliation`). Tam różnice szły
na `System.out`; tu idą do pliku, żeby porównać je offline.

## Co porównujemy
- **Wyniki portu**, nie struktury legacy. Równość definiuje port (sekcja „Port i świat” specyfikacji): dwa wyniki są
  równe, jeśli port ich nie rozróżnia (np. 403 i 404 sklejone w „odmowa” są równe).
- Kolekcje bez kolejności porównuj jako zbiory: „tylko w starym”, „tylko w nowym”.
- Wyjątek po jednej stronie to różnica (`legacy: CardNotAccepted`, `new: ok`). Ten sam typ wyjątku po obu stronach
  = zgodne. Wyjątek modelu, który nie odpowiada, nie wychodzi do wołającego — tylko do pliku; wyjątek modelu, który
  odpowiada — wpis do pliku i wyjątek idzie dalej.
- Tylko pytania (odczyty, decyzje). Komendy porównujemy dopiero przy dual write — osobna decyzja.
- Porównujemy przypadki z seedu; katalog różnic ma być **pusty dla seedu** w kroku 5 routera. Wpis jest „seed”, gdy
  identyfikator z `seed-identyfikatory.txt` (krok 5 `swappable-dsl`) jest wśród wartości `input` — dlatego `input`
  niesie identyfikatory nadane przez świat (UID, kod), nie id bazy. Różnice spoza seedu (dane, których nowe
  rozwiązanie nie ma) nie są błędem routera: to wynik „Wymaga migracji danych” w specyfikacji.

## Wpis w pliku (JSON Lines, jeden wiersz na różnicę)
```json
{"at":"2026-10-24T02:13:05Z","question":"isCardAcceptedAt","routingKey":"campsite:KAMP-17","answering":"legacy",
 "input":{"card":"…","pedestal":"…"},"legacy":{"accepted":true},"new":{"accepted":false,"reason":"NO_AGREEMENT"},
 "diff":"accepted: true → false"}
```
- `question` = pytanie portu; `routingKey` tylko przy regule innej niż sama wajcha; `new` = odpowiedź nowego rozwiązania.
- `input` w kolejności parametrów portu (mapa uporządkowana), tylko w pojęciach DSL; bez danych osobowych ponad
  potrzebę (identyfikatory zamiast nazwisk).
- Odpowiedź-lista: różnica jako zbiory, np. `"legacy":{"only in legacy":["…"]},"new":{"only in new":["…"]}`.
- Wyjątek: `{"error":"Typ: komunikat"}` po stronie, która rzuciła, np.
  `"legacy":{"error":"CardNotAccepted: …"},"new":{"accepted":true}`.
- Zgodne wywołania: tylko licznik (opcjonalnie wpis próbkowany), żeby plik pokazywał różnice, a nie ruch.

## Katalog różnic
Klucz konfiguracji `<obszar>.reconciliation.dir`; domyślnie katalog zapisywalny bez uprawnień (tymczasowy), tworzony
leniwie przy pierwszej różnicy (bez różnic katalogu może nie być). Plik na dzień. Testy podają własny katalog.

## Reakcja na różnicę (decyzja na bramce router.1, domyślnie `log`)
- `log` (domyślnie) — tylko wpis;
- `disable` — przełącz klucz routingu z powrotem na `LEGACY` (jeśli mechanizm flag pozwala zapisać z kodu);
- `alert` — przez istniejący w projekcie mechanizm alertów / powiadomień.
Reakcje składalne (log + alert).

## Kod
- `Reconciliation`: czysta funkcja porównania (dwa wyniki → brak różnicy albo różnica) + stanowy licznik zgodnych
  i różnych (zakres: węzeł od startu); `summary()`, `recent(n)`, `directory()` są na tym stanowym obiekcie.
  `ReconciliationLog` (zapis wiersza do katalogu różnic, plik na dzień, zapis z blokadą przy wielu procesach);
  `Reaction` tylko, gdy bramka router.1 wybrała reakcję inną niż `log`. W stosach asynchronicznych drugi model nie może opóźniać odpowiedzi. Nowy pakiet, konwencje nowego kodu.
- `ReconciliationTest`: różnica w obie strony, brak różnicy, warianty sklejone przez DSL są równe, wyjątek po
  jednej stronie, ten sam typ wyjątku po obu stronach równy, kolekcje w innej kolejności równe.

## Przegląd
Podział seed / poza seedem robi bramka: `bramka.mjs … --roznice "<katalog>" --seed "<seed-identyfikatory.txt>"` (liczby per
pytanie, pierwsze przykłady, czerwone tylko przy różnicach seedu). Głębszy przegląd: skrypt Node (bez zależności)
w `ekran/` albo w odpowiedzi — zlicza różnice per czasownik i klucz, pokazuje pierwsze przykłady per rodzaj `diff`.
Różnica dla seedu to kandydat na nowy scenariusz w `swappable-dsl` (rozbieżność, której scenariusze nie pokryły) —
nowy scenariusz to powrót do kroku 3 `swappable-dsl` z bramką.
