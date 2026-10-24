# Fit-check: Product

Katalog oferty: rozdzielenie **definicji** (typ produktu z parametrami, wariantami, regułami
kompozycji i stosowalności) od **wystąpienia** (to, co konkretny klient ma lub kupił).

## Pytanie główne

> Czy biznes definiuje i zmienia ofertę (typy, warianty, pakiety, warunki, kto może co wziąć)
> jako coś osobnego od egzemplarzy posiadanych przez klientów?

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Definicja oferty** odróżnialna od egzemplarza (typ „Abonament M" vs umowa pani Kowalskiej;
   „Paczka 24h" vs przesyłka PKG-2024-123; oferta kredytu hipotecznego vs umowa kredytu Kowalskiego).
2. **Zmienność lub różnorodność oferty**: wiele typów/wariantów, parametry konfigurowalne
   albo oferta zmieniana przez biznes.
3. **Co najmniej jedna reguła oferty**: stosowalność („tylko dla…", „tylko w kanale…",
   „do końca marca"), zależność („nie można X bez Y"), wykluczenie/zastąpienie, upgrade,
   pakiet złożony z innych pozycji.

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „nowy wariant/pakiet wymaga deployu", „biznes chce sam dodawać oferty" | ✅ |
| „pakiet składa się z…, można dobrać dodatki", „coś z tej listy" | ✅ |
| „oferta tylko dla nowych klientów / tylko online / do 31.03" | ✅ |
| „nie można wziąć X bez Y", „Y zastępuje X", „upgrade z M do L", „pasuje do / kompatybilny z" | ✅ |
| rozmiar / waga / okres / kolor wybierany przez klienta i sterujący operacjami | ✅ |
| kod: klasa per oferta (`Goods`, `Mortgage`, `Parcel`, `Appointment`), tabela mieszająca definicję oferty z umową klienta (dane oferty obok `customerId`, `balance`) | ✅ |
| kod: centralna encja z doklejonymi polami (`creditCardNumber`, `loanId`, `insurancePolicyId`) i null-checkami sterującymi procesami | ✅ |
| „sprzedajemy książki", lista towarów z nazwą i opisem | ❌ zwykły asortyment |
| „produkt kosztuje…, rabat…, cennik" | ❌ cena |
| „zamówienie: nadane → w drodze → dostarczone", „zaplanowane / w trakcie / zakończone" | ❌ realizacja (cykl życia wykonania, nie definicji) |
| „zostało 5 sztuk, rezerwujemy" | ❌ stan i dostępność |
| biznes złożony wyłącznie z unikatów (każdy egzemplarz inny, np. dzieła sztuki) | ❌ brak typu |

## Fałszywi przyjaciele

- **„produkt", „pakiet", „plan", „abonament", „taryfa", „usługa"**: sama nazwa oferty nie
  dowodzi katalogu z regułami.
- **Tabela `products`** z nazwą i ceną.
- **„pakiet"** w znaczeniu przesyłki albo paczki danych do zużycia.

## Wykluczające anty-sygnały

- Biznes jednoproduktowy lub z ofertą stałą od lat i wejście to stwierdza.
- Brak rozróżnienia typ/egzemplarz: opis produktu jest tożsamy z egzemplarzem.
- Cała „logika produktu" w wejściu dotyczy ceny, realizacji albo stanów magazynowych.

## Przypadki graniczne

- **Produkty w przebraniu** (rata, ugoda, SLA, monit, polisa, opłata, taryfa, plan, limit, świadczenie): pasują, jeśli mają parametry
  i warunki stosowalności definiowane osobno od konkretnych spraw klientów. Dotyczy to też
  rzeczy, których klient sam nie wybiera (poziom obsługi przypisany przez system), i kosztów
  płynących w drugą stronę (opłata sądowa, monit). Test: ma reguły, parametry i skutki
  operacyjne lub finansowe. Jeśli każda sprawa jest negocjowana od zera (brak definicji
  wspólnej dla spraw) → NIE PASUJE.
- **Unikaty obok zwykłej oferty**: pojedyncze unikaty w katalogu, który ma też typy, nie
  wykluczają dopasowania; wyklucza je dopiero biznes złożony z samych unikatów. Unikat to
  wtedy strategia śledzenia `unique` (dokładnie jedna sztuka, numer seryjny obowiązkowy).
- **Kilka stałych planów** (Basic/Pro/Enterprise) bez reguł między nimi i bez zmian:
  NIE PASUJE. Jeśli plany mają „upgrade do", „wyklucza", „tylko dla" albo zmieniają się
  na tyle często, że zakodowanie ich na sztywno boli → PASUJE.
- **Mały, stabilny biznes jednej usługi** (ta sama usługa od 20 lat): NIE PASUJE (anty-sygnał).
  Rozdzielenie definicji od wystąpienia we własnym słowniku biznesu (`MassageType` /
  `MassageInstance`) nadal jest rozsądne, ale samo w sobie nie jest powodem dopasowania.

## Pytania rozstrzygające

- Czy oferta (warianty, pakiety, warunki) zmienia się na tyle często, że dopisywanie jej
  w kodzie jest problemem? (TAK → PASUJE)
- Czy między pozycjami oferty są reguły typu „wymaga / wyklucza / zastępuje / tylko dla"?
  (TAK → PASUJE)
