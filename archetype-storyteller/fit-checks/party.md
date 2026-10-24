# Fit-check: Party

Stabilnym centrum modelu podmiotów jest tożsamość (jedna osoba/organizacja = jeden byt),
a role, identyfikatory i relacje między podmiotami są danymi do niej przypiętymi, nie typami
ani flagami.

## Pytanie główne

> Czy ten sam podmiot (osoba lub organizacja) występuje w tym biznesie w więcej niż jednej
> roli albo czy logika zależy od relacji między podmiotami?

To, że system ma użytkowników i klientów, niczego nie dowodzi: ma ich każdy system.

## Elementy obowiązkowe (wymagany element 1 oraz co najmniej jeden z 2–5)

1. **Podmioty z tożsamością**, o których system pamięta coś więcej niż login.
2. **Wielorolowość**: dowód, że jeden podmiot bywa naraz lub kolejno w różnych rolach
   (klient i dostawca, lead → klient, pracownik i pacjent).
3. **Relacje między podmiotami z semantyką**, od których zależy logika (zatrudnia,
   reprezentuje, działa w imieniu, jest oddziałem, jest opiekunem).
4. **Osoby i organizacje traktowane wymiennie** w tej samej roli (klientem bywa firma
   albo osoba) lub duplikacja danych tego samego podmiotu w kilku miejscach.

5. **Zdolności podmiotów**, o które system pyta: kto potrafi lub ma prawo zrobić X,
   w miejscu Y, w czasie Z („znajdź lekarza z uprawnieniami do USG w Warszawie").

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „klient czasem jest też partnerem/dostawcą" | ✅ |
| „kto może podpisać w imieniu spółki", „pełnomocnik", „opiekun prawny" | ✅ |
| „lead staje się klientem, a potem polecającym", „partner sam zaczyna od nas kupować" (rola migruje w czasie) | ✅ |
| „klientem może być osoba albo firma" (także JDG) z logiką zależną od tego | ✅ |
| „klient nie zawsze jest użytkownikiem" (klient bez konta: zaimportowany, tylko przez API) | ✅ |
| kod: `isCustomer/isPartner/isVendor`, `firstName` vs `companyName` z null-checkami | ✅ |
| „ta sama osoba ma trzy konta w trzech modułach i dane się rozjeżdżają" | ✅ |
| słowa: oddział, placówka, filia, zespół, spółka córka, podwykonawca + czasowniki: zatrudnia, zleca, reprezentuje, nadzoruje, działa w imieniu | trop elementu 3; ✅ dopiero, gdy od tej relacji zależy logika |
| „użytkownik loguje się i składa zamówienie" | ❌ zwykły użytkownik |
| „dostawca widzi zamówienia mojego oddziału, odkąd z nim współpracuje”, „pełnomocnik może za mnie podpisać, dopóki trwa pełnomocnictwo”: co ktoś może wobec konkretnego podmiotu, wynika z relacji z nim | ✅ uprawnienia z relacji |
| „admin, moderator, user" | ❌ uprawnienia |
| „klient ma adres dostawy i zgody marketingowe" | ❌ dane orbitujące |
| „firma ma pracowników" jako prosta lista bez logiki | ❌ |

## Fałszywi przyjaciele

- **„klient", „użytkownik", „pracownik", „partner", „dostawca"**: nazwy aktorów są w każdym
  opisie. Dowodem jest dopiero wielorolowość, relacje sterujące logiką albo wymienność
  osoby i organizacji w tej samej roli.
- **Role w sensie uprawnień** (RBAC).
- **`parentId`/hierarchia** użyta tylko do wyświetlenia drzewka.
- **Dane kontaktowe, adresy, zgody, preferencje**.

## Wykluczające anty-sygnały

- Każdy podmiot ma dokładnie jedną, stałą rolę, a relacji między podmiotami nie ma lub nie
  wpływają na logikę.
- Mały system z banalną listą klientów i wejście to stwierdza.

## Przypadki graniczne

- **B2B z osobami kontaktowymi**: pasuje, jeśli od relacji osoba–firma zależy, kto może
  co zrobić; sama książka adresowa to NIE PASUJE.
- **Marketplace** (kupujący i sprzedający): pasuje, jeśli ten sam podmiot bywa obydwoma
  i wejście to pokazuje; inaczej NIEROZSTRZYGNIĘTE z pytaniem.

- **Jedyne relacje to „nasza firma ↔ kontrahent"**: relacji między podmiotami nie modeluje
  się wtedy wcale, wystarczają role globalne. To nie wyklucza archetypu, ale element 3 nie
  jest spełniony; dopasowanie zależy od elementów 2, 4 lub 5.
- **Role a uprawnienia**: sama lista „admin, moderator, user" to NIE PASUJE. Jeżeli jednak
  o tym, co komu wolno, decydują role i powiązania podmiotów (np. łańcuch zgód wynikający
  z tego, kto kogo reprezentuje), to jest dowód elementu 3. To samo, gdy **złożone uprawnienia
  do konkretnej rzeczy, osoby albo organizacji wynikają z różnych opisanych sytuacji i relacji,
  w które wchodzę z tym podmiotem** (ktoś stał się moim dostawcą, pełnomocnikiem, opiekunem,
  więc zyskał albo stracił coś wobec mnie). Uprawnienie wobec konkretnego podmiotu to PASUJE;
  globalny poziom dostępu, taki sam wobec wszystkich, to NIE PASUJE.

## Pytania rozstrzygające

- Czy ta sama osoba lub firma występuje u was w kilku rolach naraz (np. jest klientem
  i dostawcą)? (TAK → PASUJE)
- Czy od powiązań między osobami/firmami (kto kogo reprezentuje, zatrudnia, komu podlega)
  zależy to, co system pozwala zrobić? (TAK → PASUJE)
