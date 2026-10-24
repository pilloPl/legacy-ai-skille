# Fit-check: Inventory / Availability

Zarządzanie ograniczonym zasobem (sztuki, sloty czasu, miejsca, pule, limity), o który
konkuruje wielu aktorów: dostępność jako decyzja systemu, rezerwacje z czasem życia,
rozstrzyganie, kto dostaje, a kto czeka.

## Pytanie główne

> Czy jest tu zasób, którego jest skończenie wiele, o który ubiega się więcej niż jeden
> aktor naraz, i system musi rozstrzygać, kto go dostaje?

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Zasób ograniczony**: wejście mówi o skończonej liczbie/pojemności/wyłączności.
2. **Konkurencja**: więcej niż jeden aktor może chcieć tego samego zasobu w tym samym czasie
   i nie wszystkich da się obsłużyć naraz.
3. **Co najmniej jeden mechanizm**: rezerwacja/blokada (zwłaszcza czasowa), kolejka
   oczekujących, priorytety, „wszystko albo nic" dla zestawu, overbooking, zwalnianie.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „rezerwacja ważna 15 minut, potem miejsce wraca do puli" | ✅ |
| „kto pierwszy, ten lepszy", „dwie osoby kliknęły naraz" | ✅ |
| „zwolniło się miejsce, wpuszczamy pierwszego z listy oczekujących" | ✅ |
| „limit 20 wizyt dziennie", „sala na 10 osób" wraz z zapisami | ✅ |
| „termin u lekarza / slot dostawy / grafik sprzętu" | ✅ |
| „pakiet: telewizor + montaż + kod do streamingu, wszystko albo nic" | ✅ |
| kod: `isAvailable`, statusy znaczące „zajęte", ręczne sprawdzanie kolizji terminów, retry przy wyścigu | ✅ |
| „klient kupuje subskrypcję / polisę / kurs online" | ❌ brak ograniczenia |
| „mamy 630 sztuk, skąd się wzięły i ile są warte" | ❌ historia wartości |
| „jak nie ma towaru, proponujemy zamiennik" | ❌ decyzja procesu sprzedaży |
| „stan magazynu wyświetlany na stronie" bez rezerwacji i wyścigu | ❌ pole z liczbą |

## Fałszywi przyjaciele

- **„magazyn", „stan", „dostępny", „ilość"** bez konkurencji i rezerwacji.
- **„rezerwacja"** jako nazwa zamówienia/umowy, gdy zasobu jest nieskończenie wiele.
- **„limit"** jako ograniczenie na jednego klienta (limit kredytowy, limit transakcji),
  o które nikt z nikim nie konkuruje.
- **„kolejka"** techniczna (kolejka komunikatów, zadań w tle).

## Wykluczające anty-sygnały

- Produktu chcemy sprzedać nieskończenie wiele (umowy, licencje, treści cyfrowe).
- Nie ma jednoczesnych chętnych: jeden właściciel, jeden użytkownik zasobu.

## Przypadki graniczne

- **Produkt nieograniczony, ale coś za nim jest ograniczone** (umowa telekomunikacyjna,
  sesja masażu, kredyt: chętnie sprzedamy dziś tysiąc). W samym produkcie nie ma wyścigu;
  wyścig jest gdzie indziej: czas konsultantów, grafiki pracowników, przepustowość analityków.
  Domyślnie NIE PASUJE: gdy jest tylko coś nieograniczonego, Inventory zwykle nie jest
  potrzebne. Wyjątek tylko wtedy, gdy wejście samo pokazuje cytatem skończoną rzecz za
  produktem, o którą konkurują inni; wtedy zasobem jest ta rzecz, nie produkt. Nie szukasz
  takiego zasobu na zapas.
- **Ludzie jako zasób** (konsultant, kurier, serwisant): pasuje, gdy ich czas jest
  rezerwowany i o ten czas konkurują zlecenia. Osoba tylko przypisana jako właściciel zadania,
  bez spornej przepustowości, nie wystarcza.
- **Sklep z towarem na półce**: pasuje dopiero przy rezerwacji w koszyku, wyprzedawaniu
  się albo sprzedaży wielokanałowej z jednego stanu.

- **Pojedyncza zdolność bez pełnego zestawu**: sama lista oczekujących na coś (kolejka
  chętnych z regułą „kto następny", np. zapisy na bilety, zgłoszenia) albo sama czasowa
  blokada prawa do działania (także miękka blokada rzeczy logicznej, np. edytowanego
  wniosku), bez liczonej puli. To wystąpienie częściowe: zgłoś je z nazwą
  wskazującą zdolność („tylko lista oczekujących", „tylko blokada") i w polu `zastrzeżenia`
  napisz, których elementów obowiązkowych brakuje. Wymagane są wtedy: konkurencja (element 2)
  i ten jeden mechanizm (element 3), każdy z cytatem.
- **Tani, nic nieznaczący zasób, którego pomyłka nikogo nie boli** (i wejście to mówi):
  nie pasuje; koszt modelu przewyższa koszt błędów.

## Pytania rozstrzygające

- Czy zdarza się, że dwóch chętnych chce tego samego (miejsca, terminu, sztuki) i ktoś musi
  zostać odprawiony lub poczekać? (TAK → PASUJE)
- Czy rezerwacja może wygasnąć lub zostać zwolniona, tak że zasób wraca do puli? (TAK → PASUJE)
