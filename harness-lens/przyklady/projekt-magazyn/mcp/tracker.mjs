// Serwer MCP „tracker”: duże API jak w trackerze zadań (~40 narzędzi), żeby było widać koszt pełnych schematów.
// Działają: szukaj_zgloszen, pobierz_zgloszenie, lista_projektow. Reszta uczciwie odpowiada „nieobsługiwane w demo”.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serwer } from "./wspolne.mjs";
const PLIK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dane", "zgloszenia.json");
const zgl = () => JSON.parse(fs.readFileSync(PLIK, "utf8"));
const s = (props, req = []) => ({ type: "object", properties: props, required: req });
const str = d => ({ type: "string", description: d });
const num = d => ({ type: "number", description: d });
const arr = d => ({ type: "array", items: { type: "string" }, description: d });
const KLUCZ = str("Klucz zgłoszenia, np. MAG-101");
const nie = () => "Nieobsługiwane w demo (serwer pokazuje tylko rozmiar API).";

const narzedzia = [
  ["szukaj_zgloszen", "Wyszukuje zgłoszenia po towarze, statusie, projekcie lub tekście. Zwraca listę z kluczem, tytułem i statusem.",
    s({ towar: str("Kod towaru z magazynu"), status: str("Status: otwarte, w_toku, zamkniete"), projekt: str("Klucz projektu, np. MAG"), tekst: str("Fraza w tytule lub opisie"), limit: num("Maksymalna liczba wyników (domyślnie 50)") }),
    a => JSON.stringify(zgl().filter(z => (!a.towar || z.towar === a.towar) && (!a.status || z.status === a.status) && (!a.tekst || z.tytul.toLowerCase().includes(String(a.tekst).toLowerCase()))), null, 2)],
  ["pobierz_zgloszenie", "Zwraca pełne dane zgłoszenia: tytuł, opis, status, przypisaną osobę, priorytet, etykiety, daty i powiązania.", s({ klucz: KLUCZ }, ["klucz"]),
    a => JSON.stringify(zgl().find(z => z.id === a.klucz) || { blad: "nie ma takiego zgłoszenia" }, null, 2)],
  ["lista_projektow", "Zwraca listę projektów w trackerze z kluczem, nazwą i osobą prowadzącą.", s({}), () => JSON.stringify([{ klucz: "MAG", nazwa: "Magazyn" }])],
  ["utworz_zgloszenie", "Tworzy nowe zgłoszenie w projekcie. Wymaga typu, tytułu i opisu; opcjonalnie priorytet, etykiety, komponenty, wersja i osoba przypisana.",
    s({ projekt: str("Klucz projektu"), typ: str("Typ: blad, zadanie, historia, epik"), tytul: str("Tytuł zgłoszenia"), opis: str("Opis w formacie Markdown"), priorytet: str("Najwyższy, wysoki, średni, niski"), etykiety: arr("Lista etykiet"), komponenty: arr("Lista komponentów"), wersja: str("Wersja docelowa"), przypisz: str("Login osoby") }, ["projekt", "typ", "tytul"])],
  ["aktualizuj_zgloszenie", "Zmienia pola istniejącego zgłoszenia: tytuł, opis, priorytet, etykiety, komponenty, wersję docelową.", s({ klucz: KLUCZ, tytul: str("Nowy tytuł"), opis: str("Nowy opis"), priorytet: str("Priorytet"), etykiety: arr("Etykiety (zastępują obecne)"), komponenty: arr("Komponenty"), wersja: str("Wersja docelowa") }, ["klucz"])],
  ["usun_zgloszenie", "Trwale usuwa zgłoszenie razem z komentarzami i załącznikami. Operacja nieodwracalna.", s({ klucz: KLUCZ, potwierdz: { type: "boolean", description: "Musi być true" } }, ["klucz", "potwierdz"])],
  ["zmien_status", "Przenosi zgłoszenie do innego statusu przez dozwolone przejście w workflow projektu. Opcjonalnie z komentarzem i rozwiązaniem.", s({ klucz: KLUCZ, przejscie: str("Nazwa lub id przejścia"), komentarz: str("Komentarz do przejścia"), rozwiazanie: str("Rozwiązanie przy zamykaniu") }, ["klucz", "przejscie"])],
  ["lista_przejsc", "Zwraca przejścia dostępne dla zgłoszenia w jego obecnym statusie.", s({ klucz: KLUCZ }, ["klucz"])],
  ["przypisz", "Przypisuje zgłoszenie do osoby albo zdejmuje przypisanie.", s({ klucz: KLUCZ, login: str("Login osoby albo pusty, by zdjąć przypisanie") }, ["klucz"])],
  ["dodaj_komentarz", "Dodaje komentarz do zgłoszenia. Obsługuje wzmianki @login i widoczność ograniczoną do grupy.", s({ klucz: KLUCZ, tresc: str("Treść komentarza"), widocznosc: str("Grupa, która widzi komentarz") }, ["klucz", "tresc"])],
  ["lista_komentarzy", "Zwraca komentarze zgłoszenia od najnowszych, ze stronicowaniem.", s({ klucz: KLUCZ, start: num("Przesunięcie"), limit: num("Liczba komentarzy") }, ["klucz"])],
  ["edytuj_komentarz", "Zmienia treść istniejącego komentarza.", s({ klucz: KLUCZ, id: str("Id komentarza"), tresc: str("Nowa treść") }, ["klucz", "id", "tresc"])],
  ["usun_komentarz", "Usuwa komentarz ze zgłoszenia.", s({ klucz: KLUCZ, id: str("Id komentarza") }, ["klucz", "id"])],
  ["dodaj_zalacznik", "Dołącza plik do zgłoszenia (ścieżka lokalna albo URL).", s({ klucz: KLUCZ, plik: str("Ścieżka lub URL pliku"), nazwa: str("Nazwa wyświetlana") }, ["klucz", "plik"])],
  ["lista_zalacznikow", "Zwraca załączniki zgłoszenia z nazwą, rozmiarem i autorem.", s({ klucz: KLUCZ }, ["klucz"])],
  ["polacz_zgloszenia", "Tworzy powiązanie między zgłoszeniami: blokuje, jest blokowane przez, duplikuje, dotyczy.", s({ z: KLUCZ, do: KLUCZ, typ: str("blokuje, duplikuje, dotyczy") }, ["z", "do", "typ"])],
  ["historia_zmian", "Zwraca dziennik zmian zgłoszenia: kto, kiedy i które pole zmienił.", s({ klucz: KLUCZ, od: str("Data początkowa ISO"), do: str("Data końcowa ISO") }, ["klucz"])],
  ["dodaj_czas_pracy", "Rejestruje czas pracy przy zgłoszeniu z opisem i datą.", s({ klucz: KLUCZ, czas: str("Czas, np. 2h 30m"), opis: str("Co zrobiono"), data: str("Data ISO") }, ["klucz", "czas"])],
  ["lista_czasu_pracy", "Zwraca wpisy czasu pracy dla zgłoszenia.", s({ klucz: KLUCZ }, ["klucz"])],
  ["obserwuj", "Dodaje bieżącego użytkownika do obserwujących zgłoszenie.", s({ klucz: KLUCZ }, ["klucz"])],
  ["przestan_obserwowac", "Usuwa bieżącego użytkownika z obserwujących zgłoszenie.", s({ klucz: KLUCZ }, ["klucz"])],
  ["pobierz_projekt", "Zwraca szczegóły projektu: typy zgłoszeń, komponenty, wersje, workflow, role.", s({ projekt: str("Klucz projektu") }, ["projekt"])],
  ["lista_komponentow", "Zwraca komponenty projektu z osobami prowadzącymi.", s({ projekt: str("Klucz projektu") }, ["projekt"])],
  ["utworz_komponent", "Tworzy komponent w projekcie.", s({ projekt: str("Klucz projektu"), nazwa: str("Nazwa"), prowadzacy: str("Login prowadzącego") }, ["projekt", "nazwa"])],
  ["lista_wersji", "Zwraca wersje projektu z datami wydania i stanem.", s({ projekt: str("Klucz projektu"), wydane: { type: "boolean", description: "Tylko wydane" } }, ["projekt"])],
  ["utworz_wersje", "Tworzy wersję w projekcie z planowaną datą wydania.", s({ projekt: str("Klucz projektu"), nazwa: str("Nazwa wersji"), data_wydania: str("Data ISO") }, ["projekt", "nazwa"])],
  ["wydaj_wersje", "Oznacza wersję jako wydaną i opcjonalnie przenosi niezamknięte zgłoszenia do innej wersji.", s({ projekt: str("Klucz projektu"), wersja: str("Nazwa wersji"), przenies_do: str("Wersja docelowa dla otwartych") }, ["projekt", "wersja"])],
  ["lista_tablic", "Zwraca tablice Scrum i Kanban dostępne dla użytkownika.", s({ projekt: str("Filtr po projekcie") })],
  ["pobierz_tablice", "Zwraca konfigurację tablicy: kolumny, filtr, limity WIP.", s({ id: str("Id tablicy") }, ["id"])],
  ["lista_sprintow", "Zwraca sprinty tablicy: planowane, aktywne i zamknięte.", s({ tablica: str("Id tablicy"), stan: str("future, active, closed") }, ["tablica"])],
  ["utworz_sprint", "Tworzy sprint na tablicy z celem i datami.", s({ tablica: str("Id tablicy"), nazwa: str("Nazwa"), cel: str("Cel sprintu"), start: str("Data ISO"), koniec: str("Data ISO") }, ["tablica", "nazwa"])],
  ["rozpocznij_sprint", "Uruchamia zaplanowany sprint.", s({ sprint: str("Id sprintu") }, ["sprint"])],
  ["zamknij_sprint", "Zamyka aktywny sprint i przenosi niezakończone zgłoszenia.", s({ sprint: str("Id sprintu"), przenies_do: str("Id sprintu albo backlog") }, ["sprint"])],
  ["przenies_do_sprintu", "Przenosi zgłoszenia do sprintu.", s({ sprint: str("Id sprintu"), klucze: arr("Klucze zgłoszeń") }, ["sprint", "klucze"])],
  ["ustaw_kolejnosc", "Zmienia pozycję zgłoszenia w backlogu względem innego zgłoszenia.", s({ klucz: KLUCZ, przed: str("Klucz zgłoszenia, przed którym ma stanąć"), po: str("Klucz zgłoszenia, po którym ma stanąć") }, ["klucz"])],
  ["predkosc_zespolu", "Zwraca prędkość zespołu z ostatnich sprintów: zobowiązanie i wykonanie w punktach.", s({ tablica: str("Id tablicy"), sprintow: num("Ile ostatnich sprintów") }, ["tablica"])],
  ["lista_uzytkownikow", "Wyszukuje użytkowników po nazwie, loginie lub e-mailu.", s({ fraza: str("Fraza"), limit: num("Limit") })],
  ["pobierz_uzytkownika", "Zwraca profil użytkownika: login, nazwa, grupy, strefa czasowa.", s({ login: str("Login") }, ["login"])],
  ["lista_filtrow", "Zwraca zapisane filtry użytkownika i ulubione.", s({ ulubione: { type: "boolean", description: "Tylko ulubione" } })],
  ["utworz_filtr", "Zapisuje filtr wyszukiwania pod nazwą i opcjonalnie udostępnia go grupie.", s({ nazwa: str("Nazwa"), zapytanie: str("Zapytanie wyszukiwania"), udostepnij: str("Grupa") }, ["nazwa", "zapytanie"])],
  ["lista_priorytetow", "Zwraca dostępne priorytety z kolejnością i kolorem.", s({})],
  ["lista_statusow", "Zwraca statusy workflow z kategoriami (do zrobienia, w toku, gotowe).", s({ projekt: str("Klucz projektu") })],
  ["lista_typow", "Zwraca typy zgłoszeń dostępne w projekcie wraz z polami wymaganymi.", s({ projekt: str("Klucz projektu") }, ["projekt"])],
  ["masowa_zmiana", "Zmienia to samo pole w wielu zgłoszeniach naraz (status, przypisanie, etykiety, wersja).", s({ klucze: arr("Klucze zgłoszeń"), pole: str("Nazwa pola"), wartosc: str("Nowa wartość") }, ["klucze", "pole", "wartosc"])],
];
serwer("tracker", narzedzia.map(([name, description, inputSchema, wykonaj]) => ({ name, description, inputSchema, wykonaj: wykonaj || nie })));
