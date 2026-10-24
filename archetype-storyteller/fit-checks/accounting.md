# Fit-check: Accounting

Śledzenie ruchu wartości dowolnego rodzaju (pieniądze, GB, punkty, dni, kg) przez konta,
niemutowalne wpisy i bilansowane transakcje, z historią i korektą przez storno.

## Pytanie główne

> Czy mogę zapytać „ile X ma podmiot S?" i dostać liczbę, a biznes potrzebuje też wiedzieć,
> z jakich operacji ta liczba powstała?

Jeżeli naturalne pytanie brzmi „w jakim stanie jest X?", to nie jest ten archetyp.

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Wartość ilościowa**, która rośnie i maleje (da się ją dodawać i odejmować, ma jednostkę).
2. **Co najmniej dwa rodzaje operacji** zmieniających tę wartość (np. przyznanie i zużycie,
   wpłata i wypłata, transfer).
3. **Potrzeba historii**: wejście pokazuje co najmniej jedno z: pytanie „skąd się wzięło",
   korekta/anulowanie/zwrot, wygasanie/ważność, audyt, zamknięcie okresu, wiele źródeł tej
   samej wartości z kolejnością zużycia.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „przyznane / zużyte / pozostałe / zablokowane N jednostek" | ✅ |
| „doładowanie, transfer, przeksięgowanie, zwrot, korekta" | ✅ |
| „ważne do…, przepada, wygasa z końcem okresu" | ✅ |
| „saldo nie może spaść poniżej zera" | ✅ |
| „najpierw schodzi promocyjne, potem kupione" | ✅ |
| kod: `remainingX` aktualizowane w miejscu ORAZ osobne zdarzenia korekt/anulowań | ✅ |
| „zgłoszenie przechodzi: otwarte → przypisane → zamknięte" | ❌ stan, nie wartość |
| „slot jest wolny / zajęty" | ❌ binarny stan zasobu |
| „dokument ma wersje / różnice / gałęzie" | ❌ graf wersji |
| „użytkownik obserwuje / przestaje obserwować innego" | ❌ graf relacji |
| „musi być obsłużone w ciągu 1 h" (SLA) | ❌ ograniczenie czasowe na zdarzeniu, nie wartość |
| „cena zależy od segmentu i pory dnia" | ❌ wyliczanie wartości, nie jej ruch |
| „klient ma limit 3 urządzeń" bez operacji i historii | ❌ pojedyncza liczba-ograniczenie |
| licznik (liczba logowań, wyświetleń) tylko rosnący, nikt go nie koryguje | ❌ |

## Fałszywi przyjaciele

- **„saldo", „konto", „bilans"** użyte potocznie („konto użytkownika" = login).
- **Pole z liczbą** (`amount`, `quantity`, `points`) bez opisanych operacji i bez potrzeby historii.
- **Faktura/płatność jako dokument ze statusem**: to obieg dokumentu, nie ruch wartości.
- **Taryfy, rabaty, naliczenia**: liczenie kwoty nie jest księgowaniem.

## Wykluczające anty-sygnały

- Wartość nigdy nie jest korygowana, nikt nie pyta o jej pochodzenie i wejście mówi to wprost.
- „Wartość" jest w istocie statusem albo flagą (włączone/wyłączone, wolne/zajęte).

## Przypadki graniczne

- **Pojemność**: „sala na 10 osób, 7 zajętych" bywa wartością, ale jeśli chodzi tylko o to,
  czy jeszcze jest miejsce, bez historii i korekt, to NIE PASUJE. Test pomocniczy: czy ten sam
  slot da się zużyć częściowo? Jeśli jest tylko wolny/zajęty, to stan.
- **Punkty lojalnościowe** pasują tylko wtedy, gdy są zdobywane i wydawane/wygasają; sam
  ranking punktowy to nie rejestr wartości.
- **Pozycja w kolejce**: porządek, nie saldo; nie kumuluje się i nie wygasa jako wartość, to NIE PASUJE.

## Pytania rozstrzygające

- Czy ktoś kiedykolwiek pyta „skąd się wzięła ta liczba / gdzie się podziały te jednostki"
  i trzeba odpowiedzieć co do pojedynczej operacji? (TAK → PASUJE)
- Czy operację na tej wartości da się cofnąć lub skorygować, tak żeby został po tym ślad?
  (TAK → PASUJE)
