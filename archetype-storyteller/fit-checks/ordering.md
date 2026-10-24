# Fit-check: Ordering

Zamówienie jako identyfikowalne **zlecenie realizacji**: utrwalona intencja jednej strony,
którą druga strona przyjmuje i prowadzi przez cykl życia aż do realizacji lub anulowania.
Zamówienie wie „czy, kiedy i dlaczego", nie wie „jak".

## Pytanie główne

> Czy jest tu identyfikowalna intencja (zlecenie), którą ktoś składa, a ktoś inny realizuje,
> i która ma własny cykl życia od złożenia do realizacji albo anulowania?

## Elementy obowiązkowe (wymagane wszystkie cztery)

1. **Zlecenie jako byt** z tożsamością (numer, dokument, wniosek, zgłoszenie do realizacji):
   coś, do czego inne rzeczy się podpinają i co da się odnaleźć nawet po latach.
2. **Zlecający i realizujący to różne strony** (nawet jeśli obie są w tej samej firmie).
3. **Cykl życia**: co najmniej stan „przyjęte/potwierdzone" odróżnialny od złożenia oraz
   stan końcowy (zrealizowane lub anulowane).
4. **Przedmiot zlecenia**: co ma zostać zrealizowane (pozycje, zakres, parametry wykonania).

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „klient składa zamówienie, potwierdzamy, realizujemy, może anulować" | ✅ |
| „wniosek przechodzi: złożony → zaakceptowany → w realizacji → zamknięty" i coś jest w wyniku dostarczane | ✅ |
| „zamawia jedna osoba, płaci inna, odbiera trzecia" | ✅ |
| „zamówienie ma pozycje, każda może być realizowana osobno / częściowo" | ✅ |
| „jak się nie da, to czeka w kolejce; jak się rozmyśli, anulujemy" | ✅ |
| kod: `isConfirmed/isActive/isCancelled` rozjeżdżające się ze statusem, pojedynczy `userId`, `totalAmount=null` | ✅ |
| „użytkownik klika i od razu dostaje dostęp" | ❌ brak cyklu życia |
| „zgłoszenie błędu: otwarte → przypisane → zamknięte" | ❌ obsługa sprawy, nic nie jest zamawiane |
| „dokument: szkic → opublikowany → zarchiwizowany" | ❌ cykl życia treści |
| „katalog, cennik, stan magazynu, saldo" | ❌ fakty, nie zlecenie |
| „rezerwujemy termin wizyty" i nic więcej | ❌ sama rezerwacja zasobu |

## Fałszywi przyjaciele

- **„zamówienie", „zlecenie", „wniosek", „zgłoszenie"**: słowo bez cyklu życia i bez dwóch stron.
- **Dowolna encja ze statusem**: status nie czyni z niej zlecenia.
- **Koszyk** bez etapu złożenia i realizacji.
- **Zakup natychmiastowy** (płacę i mam) bez żadnego odstępu między intencją a wykonaniem.
  Zwykły zakup w sklepie, po którym coś jest jeszcze kompletowane lub wysyłane, jest zleceniem.

## Wykluczające anty-sygnały

- Nie ma odstępu między intencją a realizacją (wszystko dzieje się w jednym kroku).
- Sednem fragmentu jest wyłącznie przydział ograniczonego zasobu albo wyłącznie przepływ
  akceptacji dokumentu, bez niczego do zrealizowania.
- Jeden typ produktu, jeden prosty przebieg i wejście stwierdza, że to się nie zmieni.

## Przypadki graniczne

- **Zlecenia wewnętrzne** (zlecenie produkcyjne, zlecenie transportowe, zlecenie przelewu):
  pasują na tych samych zasadach, o ile jest zlecający, realizujący i cykl życia.
- **Wniosek kredytowy / reklamacja**: pasuje, jeśli po akceptacji coś jest realizowane
  (uruchomienie kredytu, wymiana towaru); sama decyzja tak/nie to NIE PASUJE.
- **Dokument ze statusami** („obieg dokumentów"): to częste przebranie zamówienia. Pasuje,
  jeśli dokument wyraża czyjąś intencję, a po jego akceptacji coś jest realizowane; czysta
  ścieżka akceptacji, po której nic nie jest wykonywane, to NIE PASUJE. Tropy, że to zamówienie
  bez nazwy: produkt, wartość, ograniczona pojemność, czekanie, strona formalnie wykonująca,
  płatnik inny niż zlecający.
- **Encja nazwana od rzeczy** (konto, przesyłka, wizyta), która nosi statusy i flagi „co
  wybrano": zwykle zamówienie ukryte za tym, co jest zamawiane. Sprawdź cztery elementy
  obowiązkowe.
- **Kilka różnych „zamówień"** w jednym biznesie (zamówienie klienta, zamówienie do dostawcy)
  to osobne wystąpienia. Gdy procesy są zasadniczo różne, nie ma jednego modelu zamówienia
  pokrywającego wszystkie.

## Pytania rozstrzygające

- Czy między złożeniem a wykonaniem mija czas, w którym zlecenie ma status i można je
  zmienić lub anulować? (TAK → PASUJE)
- Czy po przyjęciu zlecenia coś musi zostać faktycznie wykonane lub dostarczone przez
  kogoś innego niż zlecający? (TAK → PASUJE)
