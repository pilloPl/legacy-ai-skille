# Fit-check: Pricing

Cena (albo inna wyliczana wartość: stawka, składka, prowizja, liczba punktów do przyznania)
jako wersjonowana w czasie funkcja kontekstu, złożona z nazwanych składników, którą trzeba
umieć policzyć, wyjaśnić i odtworzyć.

## Pytanie główne

> Czy mogę zapytać „ile wynosi X dla klienta Y w chwili T w kontekście C?" i czy odpowiedź
> jest **wyliczana** z reguł, a nie odczytywana z jednego pola?

Odpowiedź ma być powtarzalna i audytowalna, z pełnym rozbiciem na składniki. Jeśli naturalne
pytanie brzmi „ile X ma Y?", to saldo (Accounting); jeśli „w jakim stanie jest X?", to maszyna
stanów (nie mapujemy).

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Wartość wyliczana**: wejście opisuje, z czego wynik powstaje (formuła, stawki, progi).
2. **Co najmniej dwa wymiary kontekstu** wpływające na wynik (np. segment i pora dnia, ilość
   i kanał) ALBO **co najmniej dwa nazwane składniki** (netto + dopłata + rabat + podatek).
3. **Jedno z**: zmienność w czasie („obowiązuje od…", cennik sezonowy), potrzeba wyjaśnienia
   wyniku („dlaczego wyszło 3,27?"), potrzeba odtworzenia wyniku z przeszłości.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „cena zależy od ilości / pory / segmentu / kanału" | ✅ |
| „netto + marża + VAT + rabat", „prowizja 2% powyżej progu" | ✅ |
| „pierwsze 10 minut gratis, potem stawka za minutę" | ✅ |
| „jaka była cena w momencie zakupu?", „cennik obowiązuje od 1 marca" | ✅ |
| kod: if-y na segment/godzinę w kalkulacji, `promo_price`, magiczne stawki | ✅ |
| „produkt kosztuje 49 zł" i nic więcej | ❌ pole `price` |
| „wycenę robi ekspert ręcznie" | ❌ brak reguł |
| „klient zużył 3 GB z pakietu" | ❌ ruch wartości, nie wyliczenie |
| „pakiet zawiera internet i telefon" | ❌ definicja oferty |
| „faktura wystawiana 1. dnia miesiąca" | ❌ proces rozliczeniowy |
| „użytkownik zdobywa / wydaje / przekazuje N jednostek" | ❌ ruch wartości (Accounting); samo wyliczenie, ile przyznać, może być Pricingiem |
| „zadanie przechodzi z otwartego do zamkniętego" | ❌ maszyna stanów |

## Fałszywi przyjaciele

- **„cena", „koszt", „opłata", „rabat"** wspomniane jako atrybut bez opisu, jak powstają.
- **„promocja"** jako nazwa oferty/wariantu, a nie modyfikator wyliczenia.
- **Sumowanie pozycji** (ilość × cena jednostkowa) to arytmetyka, nie archetyp.

## Wykluczające anty-sygnały

- Jedna stała kwota, zmieniana rzadko, bez składników, bez segmentacji, bez pytań „dlaczego".
- Kwoty ustalane ręcznie lub negocjowane bez formuły.
- Logika wymaga znajomości stanu procesu (statusu zamówienia, etapu obsługi), a nie kontekstu
  wyceny.

## Przypadki graniczne

- **Jeden prosty rabat** („10% dla stałych klientów") przy stałej cenie: NIE PASUJE, chyba że
  wejście zapowiada kolejne i ich kombinacje.
- **Wartości niepieniężne** (punkty za zakup, scoring kwotowy) pasują na tych samych zasadach:
  muszą być wyliczane z kontekstu i wymagać wyjaśnienia.

## Pytania rozstrzygające

- Czy ktoś musi umieć wyjaśnić, z czego dokładnie złożyła się ta kwota w konkretnym
  przypadku? (TAK → PASUJE)
- Czy stawki/zasady wyliczenia zmieniają się w czasie i trzeba umieć policzyć „po staremu"
  dla dawnych przypadków? (TAK → PASUJE)
