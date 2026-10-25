# Minimalny rdzeń archetypu Party (wzorzec domyślny kroku 4)

Wzięte z przebiegu na campsite-power (23.10.2026) — minimalny zestaw z `archetypes-final/party` potrzebny
pytaniom „kto może ładować gdzie”: identyfikator podmiotu, podmiot z rolami, nazwana relacja między podmiotami,
rejestr w pamięci z chodzeniem „w górę” po jednej relacji (np. podgrupa → wydawca nad nią). Bez `Result`,
zdarzeń, wersji, polityk i adresów — to dochodzi, gdy hipoteza się obroni.

Pliki to Java (pakiet `io.pillopl.party` — zmień na swój). W innym języku przepisz te pojęcia 1:1.
**Nazwy ról (`Role`) i relacji (`RelationshipName`) to przykład z jednego przebiegu** — podmieniasz je na te ze słownika
mapowania; atrybutów relacji z jednej decyzji biznesu (np. „obejmuje przyszłe”) tu nie ma i nie dodajesz ich bez
pytania z `miejsca.md`.
Gdy masz referencję Party, bierz z niej zawsze także `Validity` i `RegisteredIdentifier` (`../../szczegoly.md`, „Krok 4”).
Reguły domenowe i uprawnienia z relacji (np. „umowy wydawcy i organizacji nad nim się sumują”) piszesz sam obok,
w klasie odpowiadającej na pytanie portu (w przebiegu: `ChargingRights`), słownikiem z mapowania mappera.

`CLAUDE.md.example` — przykład pliku modułu: czym jest, skąd, jakim językiem mówi, jakim nie mówi.
