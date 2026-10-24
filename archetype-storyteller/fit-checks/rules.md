# Fit-check: Rules & Scoring

Oddzielenie stabilnej mechaniki składania i ewaluacji reguł od ich treści, którą ktoś
konfiguruje w działającym systemie: nowa reguła to zmiana danych, nie deploy.

## Pytanie główne

> Czy treść reguł (warunki, progi, punkty, to, które reguły obowiązują) jest zmieniana
> przez kogoś spoza zespołu programistów albo tak często, że musi być daną, a nie kodem?

Samo istnienie reguł biznesowych niczego nie dowodzi: każdy system je ma.

## Elementy obowiązkowe (wymagane wszystkie trzy)

1. **Zbiór reguł tego samego rodzaju**, który rośnie lub się zmienia (nie pojedynczy warunek).
2. **Kompozycja**: reguły są łączone (AND/OR/NOT, priorytety, sumowanie punktów, reguły
   decydujące o innych regułach).
3. **Dynamika albo eksplozja**: dowód, że reguły zmienia użytkownik/administrator/tenant
   bez programisty, ALBO że zmieniają się tak często, że deploy jest problemem, ALBO że
   różnią się per kraj/klient/tenant jako konfiguracja, ALBO że system sam w trakcie
   działania wylicza, które reguły obowiązują (ze stanu, ruchu, obciążenia), ALBO że
   kombinacji warunków jest tyle, iż wejście wprost opisuje to jako problem (nie da się
   tego przetestować, nikt nie wie, co wyjdzie).

## Tabela sygnałów

| Sygnał w wejściu | Dopasowanie? |
|---|---|
| „dział marketingu sam definiuje warunki promocji", kreator warunków na GUI | ✅ |
| „scoring: +10 za…, −5 za…, progi konfigurowalne" | ✅ |
| „każdy kraj/tenant ma własne zasady opłat, ustawiane w panelu" | ✅ |
| „statusy i słowniki definiuje administrator" razem z warunkami na nich | ✅ |
| „musimy pokazać, za co te punkty / która reguła zadziałała" przy wielu regułach | ✅ |
| kod: kaskady if/switch stale dopisywane | ✅ |
| „zamówienie powyżej 500 zł ma darmową dostawę" | ❌ jeden stały warunek |
| „walidujemy, że pole nie jest puste" | ❌ walidacja wejścia |
| „proces ma kroki: A, potem B, potem C" | ❌ przepływ |
| „reguły zmieniają się raz na rok, wdrażamy wtedy nową wersję" | ❌ kod wystarczy |

## Fałszywi przyjaciele

- **„reguła", „warunek", „polityka", „zasada", „if"**: obecne w każdym opisie biznesu.
- **„konfigurowalne"** w znaczeniu parametru (próg, stawka) bez komponowania warunków.
- **Uprawnienia/role** („admin może, user nie może").

## Wykluczające anty-sygnały

- Reguły zmieniają się rzadko albo zespół wdraża zmiany w godziny i wejście to stwierdza.
- Warunki są pojedyncze, o stałym kształcie, bez kombinowania.
- Wejście nie mówi nic o tym, kto i jak często zmienia reguły, a liczba reguł jest mała.

## Przypadki graniczne

- **Ocena ryzyka / zdolność kredytowa** z wieloma warunkami: pasuje, gdy warunki są
  zmieniane, muszą być wyjaśnialne albo ich kombinacje są opisane jako nie do opanowania;
  setki if-ów stabilnych od lat, na które nikt nie narzeka, to NIEROZSTRZYGNIĘTE z pytaniem
  o częstotliwość zmian lub o to, czy kombinacje da się jeszcze przetestować.
- **Legacy z kaskadą if-ów**: sama kaskada to trop; dowodem jest historia jej ciągłego
  dopisywania (komentarze, daty, nazwy typu `newRule2024`) albo wymaganie zmian bez deployu.
- **Reguły w statycznej mapie**: jeśli konfiguracja nigdy nie zmienia się w trakcie działania,
  a zespół wdraża w godziny, przeniesienie if-ów do mapy prawie nic nie daje (wystarczą małe,
  osobno testowane funkcje). Zysk pojawia się dopiero przy konfiguracji dynamicznej.
- **Jedna sparametryzowana strategia**: kilka „strategii", z których każda obniża cenę o jakiś
  procent, to jedna strategia z parametrami (procent, nazwa), czyli parametr, a nie zbiór reguł.

## Pytania rozstrzygające

- Czy kombinacji tych warunków jest już tyle, że nie da się ich wszystkich sprawdzić ani
  przewidzieć wyniku? (TAK → PASUJE)

- Kto zmienia te reguły i jak często: programista przy wdrożeniu czy ktoś z biznesu na bieżąco?
  (biznes na bieżąco → PASUJE; programista, rzadko → NIE PASUJE)
- Czy warunki są ze sobą łączone w dowolne kombinacje, czy to kilka stałych przypadków?
  (dowolne kombinacje → PASUJE)
