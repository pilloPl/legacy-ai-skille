# Miejsca: <obszar>

Kontrakt miejsc. Od kroku 3 workflow `parallel-models` pracuje tylko na tych miejscach: nie wraca do kandydatów ani do
źródła (crossing, mapper). 3 miejsca w kodzie (wołający) łatwe do przepięcia na nowe API + 1 zapas, tylko spośród
żywych wołających. Miejsce = jedno pytanie (CO) u jednego wołającego; wołający, który zadaje dwa pytania, daje dwa
miejsca, ale do minimum 3 liczysz różnych wołających. To samo wyrażenie w kodzie opisane dwoma sformułowaniami CO =
jedno miejsce. Wołający = metoda produkcyjna, która zadaje pytanie (nie helper, który liczy odpowiedź);
`plik:linia` = linia, w której pyta (nie deklaracja metody).

| # | CO (pytanie wołającego) | Wołający (plik:linia) | JAK stare | JAK w nowym rozwiązaniu | Odpowiedź | Skąd | Dlaczego łatwe | Wejście do porównania | Miejsca na ścieżce okienka | Czego wejście wymaga poza światem | Przygotowanie wejścia (dane / atrapa / jednorazowe) | Pytania mimochodem | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | <np. czy umowa wydawcy karty obejmuje kemping słupka> | <np. `ValidationService.validateFor` (…:329) — linia, w której pyta> | <jak kod robi to dziś, skrótem> | <jak to robi nowe rozwiązanie> | <tak/nie, jedna rzecz, lista; podtypy osiągalne z ekranu i nieosiągalne> | <bolączka B1 / wiersz źródła> | <wołający w kontenerze, pytanie w jednym miejscu, typy wartości; jednoznaczność encji: indeks unikalny z migracji> | <akcja: co człowiek robi na ekranie, żeby padło pytanie (np. „Import” w konsoli) / odpowiedź: gdzie ją widać — na ekranie (toast, licznik), w API (endpoint) albo w pliku (eksport); odczyt zawężony do identyfikatorów seedu> | <inne miejsca (M#), przez które przechodzi to samo okienko, albo „—”> | <np. użytkownik konsoli z zakresem, właściciel kempingu, włączona lista> | <np. dane: gniazdo słupka; atrapa: partner HTTP (protokół sprawdzony w kodzie: pliki czy HTTP); jednorazowe: plik importu — zapas na oba modele> | <pytania, które okienko zadaje przy okazji, np. ekran ładuje listę kart dla domyślnego słupka spoza seedu; albo „—”> | wybrane |

Odpowiedź: podtypy, które legacy zwraca, a CO o nich nie mówi — osobno osiągalne z ekranu wejścia i nieosiągalne.
Usługa zewnętrzna na wejściu: protokół (np. wymiana plików czy HTTP) sprawdzasz w kodzie, zanim opiszesz wejście.
Wejście do porównania: **akcja na ekranie** (co uruchamia pytanie) i **odpowiedź** (gdzie ją odczytasz: na ekranie,
w API, w pliku) to dwie rzeczy — akcja bywa na ekranie, a odpowiedź tylko w API albo w pliku (wtedy krok 6 łączy
nagranie z odczytem `api-`/`plik-`).
Pytania mimochodem: okienko zadaje pytanie portu także dla danych spoza seedu (domyślny obiekt na liście, odświeżenie
widoku, eksport wszystkiego). Wypisujesz je w kroku 2, gdy widać w kodzie, i uzupełniasz w kroku 6 po nagraniu; ich
różnice w katalogu różnic routera to „poza seedem” (wynik „Wymaga migracji danych”, nie stop).

Status: `wybrane` → `wpięte` (krok 5) albo `nieudane` (z powodem w specyfikacji, sekcja „Nieudane miejsca”);
`zapas` → `wybrane`, gdy któreś miejsce jest nieudane. Krok 5, który zmienia sposób wejścia (inna akcja, odpowiedź
z pliku zamiast z ekranu), poprawia kolumny wejścia i przygotowania tego miejsca.

## Odrzuceni kandydaci
Lista, nie tabela (widok czyta jako miejsca każdą tabelę w tym pliku).
- <CO, wołający> — <dlaczego nie: np. nikt nie woła, pytanie w kilku miejscach metody, odpowiedź z id bazy legacy, brak wejścia>
