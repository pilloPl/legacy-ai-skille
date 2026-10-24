# Fit-check: Matching / Optymalizacja dopasowania

Optymalne dopasowanie jednego zbioru do drugiego (zasoby → projekty, ludzie → zadania,
ładunki → pojazdy) przy ograniczonej puli i zdefiniowanej wartości, którą wybór maksymalizuje.

## Pytanie główne

> Czy jest ograniczona pula, o którą konkuruje wielu biorców, i czy biznes chce wybrać
> **najlepszy** przydział według nazwanej miary, a nie jakikolwiek poprawny?

## Elementy obowiązkowe (wymagane wszystkie cztery)

1. **Dwa zbiory** do skojarzenia (co przydzielamy i czemu).
2. **Ograniczenie**: puli nie starcza dla wszystkich albo biorca ma wymagania, które muszą
   być spełnione łącznie.
3. **Funkcja wartości**: wejście nazywa, co znaczy „lepiej" (zysk, koszt, czas, wykorzystanie).
4. **Wybór spośród wielu możliwych przydziałów**: przydział nie wynika jednoznacznie z reguły.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „które projekty wziąć, żeby zmaksymalizować zysk przy tych ludziach" | ✅ |
| „optymalnie rozłożyć kierowców na trasy / ładunki na pojazdy" | ✅ |
| „projekt ruszy tylko, gdy dostanie wszystkie wymagane kompetencje naraz" | ✅ |
| „czy opłaca się dokupić/wyszkolić zasób, co by to zmieniło" | ✅ |
| „co by było, gdyby zamknąć projekt?" | ✅ |
| „mam ludzi na ławeczce — automatycznie dopasujcie ich do projektów" | ✅ |
| kod: pętle po kombinacjach, symulacje mutujące prawdziwe encje i wycofujące zmiany | ✅ |
| „fakturę klienta X zawsze obsługuje księgowa Y" | ❌ reguła |
| „przydzielamy pierwszego wolnego konsultanta" | ❌ kolejka, brak optymalizacji |
| „zadanie B dopiero po zadaniu A" | ❌ zależności kolejności |
| „kupujący szuka sprzedającego" (wyszukiwarka, filtr) | ❌ wyszukiwanie |
| „chcemy dobrze dobierać, ale nie wiemy, co to znaczy dobrze" | ❌ brak funkcji wartości |

## Fałszywi przyjaciele

- **„dopasowanie", „przypisanie", „alokacja", „matching", „optymalnie"**: słowo „optymalnie"
  w języku potocznym znaczy często „rozsądnie". Samo słowo nie jest dowodem; dowodem są
  cztery elementy obowiązkowe.
- **Rekomendacje i wyszukiwanie** („dopasuj oferty do profilu").
- **Uzgadnianie/parowanie rekordów** (płatność ↔ faktura).

## Wykluczające anty-sygnały

- Zasobów starcza dla wszystkich albo przydział jest jednoznaczny.
- Nikt nie umie powiedzieć, co maksymalizujemy.
- Zbiory są małe i stałe (kilka–kilkanaście elementów), wejście to stwierdza i nikt nie
  zadaje pytań „co by było, gdyby". (Sam mały rozmiar nie wyklucza: decyduje tylko o tym,
  że wystarczy prosty algorytm.)
- Sednem jest kolejność zadań, nie wybór podzbioru.

## Przypadki graniczne

- **Grafik pracy**: pasuje, gdy jest miara jakości grafiku i wiele możliwych układów;
  ręczne układanie przez kierownika bez miary to NIE PASUJE.
- **Brak miary, ale wyraźna konkurencja o pulę**: NIEROZSTRZYGNIĘTE z pytaniem o miarę.
- **Małe zbiory, ale pytania „co by było, gdyby" albo zapowiedź wzrostu** (tysiące biorców,
  setki tysięcy elementów puli): PASUJE; rozmiar decyduje wtedy tylko o wyborze optymalizatora.
  Bez tego, przy małych stałych zbiorach, wystarczy ręczna pętla „sprawdź każdą kombinację".

## Pytania rozstrzygające

- Czy umiecie nazwać, co jest lepszym przydziałem (więcej zysku, mniej kosztu, krótszy
  czas), tak żeby dało się porównać dwa warianty liczbą? (TAK → PASUJE; nikt nie umie →
  NIE PASUJE: to luka w wymaganiach, nie problem optymalizacji)
- Czy zdarza się, że nie da się obsłużyć wszystkich i trzeba wybrać, kogo/co pominąć?
  (TAK → PASUJE; nigdy → NIE PASUJE)
