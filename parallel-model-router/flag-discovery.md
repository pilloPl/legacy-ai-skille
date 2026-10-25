# Jak dobrać mechanizm flagi

Cel: flaga zmieniana **bez redeployu**, czytana przy każdym wywołaniu (albo z krótkim, znanym cache), z domyślną
wartością „stary model”. Najpierw to, co projekt już ma — nowa biblioteka w legacy to koszt i ryzyko.

## Kolejność szukania
1. **Biblioteka flag w zależnościach** (`pom.xml`, `build.gradle`, `package.json`, `composer.json`, `*.csproj`,
   `pyproject.toml`, `requirements.txt`): Togglz, FF4J, Unleash, LaunchDarkly, Flagsmith, OpenFeature, Spring Cloud
   Config + `@RefreshScope`, `Microsoft.FeatureManagement`, django-waffle, django-constance, Laravel Pennant. Jest → używaj jej; sprawdź, skąd bierze stan (pamięć = gubi się po restarcie).
2. **Tabela ustawień w bazie** z odczytem w kodzie i ekranem albo endpointem do zmiany (szukaj: `property`,
   `setting`, `parameter`, `config` w encjach, SQL, migracjach; serwis z cache i metodą `reload`). Zwykle zmiana
   bez redeployu, ale sprawdź: nowy klucz wymaga deployu (enum)? cache per węzeł albo per proces (FPM, gunicorn,
   cluster Node — inne widzą zmianę po przeładowaniu)? audyt zmian?
3. **Wybór implementacji w danych** — strategia wskazana w rekordzie (nazwa beana, kod algorytmu). To gotowy
   precedens routingu per obiekt; router może się na nim wzorować.
4. **Konfiguracja przeładowywana** (pliki obserwowane, JMX, admin endpoint) — działa, ale zwykle per węzeł.
5. **Konfiguracja czytana przy starcie** (`@Profile`, `@ConditionalOnProperty`, `application.yml`, `.env`,
   `settings.py`, `parameters.yaml`, `appsettings.json`, zmienne środowiskowe) — wymagają restartu. Dopuszczalne tylko, jeśli nic wyżej nie ma i restart jest tani;
   powiedz to wprost.

## Jeśli nic nie ma — propozycje sprawdzone
- **Java / Spring**: flaga w istniejącej tabeli ustawień (jeśli jest) albo Togglz z `JDBCStateRepository` na
  bazie projektu + konsola Togglz (zmiana bez redeployu, audyt przez własny `ActivationStrategy`); reguły
  „lista kluczy”, „pora dnia”, „procent” to strategie aktywacji.
- **.NET**: `Microsoft.FeatureManagement` z dostawcą konfiguracji z bazy lub Azure App Configuration.
- **Python / Django**: django-constance (wartości w bazie, admin) albo django-waffle (flagi, procent, użytkownicy).
- **PHP**: Laravel Pennant; Symfony — tabela w bazie projektu z cache (APCu per proces).
- **Node / inne**: OpenFeature z dostawcą flagd albo Unleash (self-hosted), albo tabela w bazie projektu.

## Pułapki
- Jak ekran zapisuje „domyślne”: pusty napis czy brak wiersza — `getProperty(klucz, domyślne)` przy pustym napisie
  zwraca pusty napis; traktuj go jak domyślne. Wajcha czyta surowy tekst i parsuje sama (np. `getPropertyBoolean` na
  pustym napisie loguje błąd przy każdym pytaniu).
- Nowy klucz: czy wymaga migracji (zwykle nie, gdy ekran pokazuje każdy klucz enumu) i czy testy liczą klucze
  (`values().length`).
- Konwencja projektu „każdy klucz ma nazwany getter” — nie rozszerzasz jej (flaga zniknie po migracji); uzasadnienie
  zapisz w sekcji „Flaga”.

## Co zapisać w kontrakcie routera
Mechanizm, klucze, wartości (tryby z `SKILL.md`), domyślne (klucz pusty = przełącznik startowy), reakcja na różnicę
(domyślnie `log`), kto i jak zmienia (dokładna droga: ekran, endpoint,
SQL), czas propagacji zmiany na wszystkie węzły, ograniczenia.

## Przykład (ogólny)
Brak bibliotek flag. Projekt ma tabelę ustawień z cache w pamięci procesu, ekran ustawień w konsoli administracyjnej
i audyt zmian. Nowy klucz = nowa wartość w liście kluczy (jeden deploy), potem zmiany bez redeployu; cache per węzeł.
Precedens routingu per obiekt: kolumna z nazwą algorytmu/beana, po której serwis wybiera implementację.
