# Parallel Models wg Legacy Fighter (protokół źródłowy)

Wyciąg z transkrypcji Legacy Fighter: M04 L2.1–L2.4 (raport kierowcy), M09 L8.1 (zapisy), M09 L9.4 (UserRight),
M07 L2.3 (Parallel Model + ACL), M10 L2.1 (Strangler). Pliki: `transkrypcje-szkolen/Legacy Fighter/`.

1. **Decyzja: nowy model obok starego**, gdy wiesz, na jakie pytanie odpowiada zawiły kod, a boisz się go zmieniać,
   albo model ma być odwrócony „o 180 stopni”. Koszt: nowe funkcje w dwóch miejscach, chwilowo więcej kodu.
2. **Gdzie odcinasz się od starego** — część starej struktury zostaje; jej zdarzenia tłumaczy ACL.
3. **Czy da się podpiąć** — jeśli szczegóły implementacji wyciekły do klientów, najpierw API w języku problemu i
   przepięcie klientów („czar pryska” bez abstrakcji). Nowe dane → znajdź wszystkie komendy, które je zmieniają.
4. **Nowy model najpierw jako skrypt** (jeden plik), polerowanie po zielonych testach.
5. **Abstrakcja** (Extract Method Object → Extract Delegate → druga implementacja), implementacje ukryte w pakiecie;
   „żaden komponent nie wie o dwóch modelach”.
6. **Router** — jedna metoda decyzji (`shouldUseNewReport`): flaga, strategiczny klient, kraj, procent, pora, próg
   czasu odpowiedzi.
7. **Dwie flagi, cztery stany**: która odpowiedź (stary/nowy) × czy porównywać. Cykl: stary → stary + porównanie
   → nowy + porównanie → tylko nowy; przejście z dowolnego w dowolny, bez wdrożenia („piątek 17:00 — przełączasz”).
8. **Rekoncyliacja** porównuje wyniki odczytów; to uzupełnienie testów, nie zamiennik. Różnice: najczęściej osobny
   plik logów z danymi zapytania i różnicami; czasem e-mail, Slack.
9. **Wydajność**: drugie odpytanie zwykle tanie, przy SLA ważne; można asynchronicznie (osobna transakcja → możliwe
   różnice spójności); wyjątek nowego modelu nie może dotknąć klienta.
10. **Testy routera i porównywarki** (autor: na mockach — testuje algorytm wyboru; warunki czasu/klienta
    komplikują, ale nie utrudniają).
11. **Zapisy**: router wysyła komendę do obu, porównuje wyjątki; stany porównuje przy odczycie, nie zaraz po zapisie.
    Wspólna baza → jedna transakcja, ale błąd nowego nie cofa starego; inna baza → spójność końcowa.
12. **Rollout per strategiczny klient** — „może tu już wystarczy”.
13. **Migracja danych** do nowego modelu (czerwony test łapie zapomnianą migrację); w strangler: zasilenie,
    odwrócenie synchronizacji, stary moduł jako koło ratunkowe; deployment ≠ release.
14. **Usunięcie starego**, gdy porównywarka milczy — przez abstrakcję to zmiana w jednym miejscu.

Pułapki: rozróżnienie stary/nowy rozlane po klientach; brak testów routera; proxy bez abstrakcji; inne wyjątki w
nowym modelu; porównanie asynchroniczne a transakcje; przy zapisach metoda droga; system chwilowo wygląda gorzej.

**Różnice w naszym skillu:** abstrakcja to port w języku CO z `swappable-dsl` (kroki 3–5 LF robi tamten skill); testy
routera bez mocków, na dwóch prawdziwych modelach w pamięci; dochodzi test **zgodności modeli** przy przełączeniu
wajchy: scenariusze i wszystkie kombinacje pytań na świecie z seedem, puszczone przez oba modele, mają dać to samo —
nowe rozwiązanie ma stare zachowanie, a różnice ze źródła potwierdza człowiek w specyfikacji.
