// Metafory dla ludzi nietechnicznych: to samo nagranie i ta sama scena, inne postaci, słowa, ikony i kolory.
// Metafora ma stały zestaw warstw (nigdy hooków). Każdy typ etapu dostaje własny tytuł i „dlaczego”;
// typ, dla którego metafora nie ma odpowiednika (null), jest sklejany: nie ma go w logu, strzałki i auto go
// przeskakują, a jego skutek na scenie widać razem z najbliższym widocznym etapem.
// Po każdej odpowiedzi modelu metafora dokłada etap „zapomnienie”: model niczego nie pamięta między requestami.
import { serwerMcp, podsumowanieWyniku, arg, skrot } from "./etapy.js";

const nazwa = c => (c?.nazwa || "").replace(/^mcp__\w+?__/, "");
const zArg = c => { const a = skrot(arg(c), 24); return a ? `${nazwa(c)}(${a})` : nazwa(c); };

// Wspólny szkielet: metafora podaje zdania, szkielet wybiera wariant etapu (rodzaj wykonania, status uprawnień…).
function etapyMetafory(z) {
  const wyk = (e, x) => {
    const c = e.c, czeka = c?.czeka ? " — CZEKAM" : "";
    if (e.aktor === "czlowiek") return [z.wykCzlowiek + czeka, z.wykCzlowiekD];
    if (e.aktor?.startsWith("mcp:")) return [`${z.wykMcp(serwerMcp(c.nazwa))} · ${zArg(c)}${czeka}`, z.wykMcpD];
    if (e.aktor === "internet") return [`${z.wykInternet} · ${zArg(c)}${czeka}`, z.wykInternetD];
    if (e.aktor === "skill") return [`${z.wykSkill} „${c.wejscie?.skill}”`, z.wykSkillD];
    return [`${z.wyk} · ${zArg(c)}${czeka}`, z.wykD];
  };
  return {
    reset: (e, x) => [z.reset[x.w.reset] || z.reset.nowa, z.resetD],
    "kompakcja-start": () => [z.kompStart, z.kompStartD],
    prompt: (e, x) => x.w.kompakcja ? [z.kompReczna, z.kompStartD] : [z.prompt(x.prompt), z.promptD],
    doklejki: (e, x) => [`${z.doklejki} ${(z.kat[e.kat] || e.kat || "").toUpperCase()}`, z.doklejkiD],
    stos: () => [z.stos, z.stosD],
    "k-system": () => [z.kSystem, z.kSystemD],
    "k-narzedzia": z.kNarzedzia ? (e, x) => [`${z.kNarzedzia} (${x.w.req.tools.length})`, z.kNarzedziaD] : null,
    koperta: (e, x) => {
      const pierwsza = /^KOPERTA 3\/3/.test(e.tytul);
      const d = (pierwsza ? z.kopertaD : z.kopertaDalejD) + (x.cache != null && z.cacheD ? ` ${z.cacheD(x.cache)}` : "");
      return [`${pierwsza ? z.koperta : z.kopertaDalej} (${x.w.req.messages.length})`, d];
    },
    polecenie: () => [z.polecenie, z.polecenieD],
    wysylka: null,
    model: (e, x) => [z.model + (x.cache != null && z.cacheModel ? ` ${z.cacheModel(x.cache)}` : ""), z.modelD],
    powrot: (e, x) => x.w.kompakcja ? [z.powrotKomp, z.powrotD]
      : (x.w.wywolania || []).length ? [`${z.powrotProsba} · ${(x.w.wywolania).map(nazwa).join(", ")}`, z.powrotD]
      : [z.powrotTekst, z.powrotD],
    analiza: null,
    "stos-odp": () => [z.stosOdp, z.stosOdpD],
    uprawnienia: z.upOk ? (e, x) => {
      const c = e.c, zgoda = c.pytanie && c.status !== "ok";
      if (c.status === "ok") return [`${z.upOk} · ${zArg(c)}`, z.upOkD];
      if (zgoda) return [`${z.upZgoda} · ${zArg(c)}`, z.upNieD];
      return [`${z.upNie} · ${zArg(c)}`, z.upNieD];
    } : null,
    pytanie: z.pytanie ? e => [`${z.pytanie} · ${zArg(e.c)}${e.c?.status === "brak" ? " — CZEKAM" : ""}`, z.pytanieD] : null,
    wykonanie: wyk,
    wynik: e => e.c.status === "ok" ? [`${z.wynik}: ${podsumowanieWyniku(e.c)}`, z.wynikD] : [z.wynikNie, z.wynikD],
    petla: () => [z.petla, z.petlaD],
    kompakcja: () => [z.kompakcja, z.kompakcjaD],
    koniec: (e, x) => x.w.kompakcja ? [z.koniecKomp, z.koniecKompD] : [z.koniec, z.koniecD],
  };
}

export const METAFORY = [
  {
    id: "lekarz", nazwa: "Lekarz na dyżurze",
    podpis: "Lekarz, który przy każdej konsultacji jest inny, i pielęgniarka z kartą pacjenta",
    opowiesc: "Lekarz dyżurny siedzi w innym mieście i widzi tylko kartę pacjenta. Przy łóżku jest pielęgniarka: robi badania, pyta pacjenta o zgodę i wysyła kartę. Za każdym razem odbiera inny lekarz, więc karta musi mieć wszystko od przyjęcia.",
    warstwy: ["prompt", "narzedzia", "uprawnienia", "stos", "skille", "mcp"],
    legenda: [["pielęgniarka", "harness"], ["lekarz", "model"], ["pacjent", "człowiek"], ["karta pacjenta", "historia wiadomości"],
      ["standardy szpitala", "prompt systemowy"], ["lista badań", "narzędzia"], ["zgoda", "uprawnienia"], ["protokoły", "skille"], ["laboratorium", "serwer MCP"]],
    scena: {
      harness: "PIELĘGNIARKA", harnessPod: "przy łóżku pacjenta", prompt: "STANDARDY", promptPod: "→ na wierzch",
      kontekst: "DOPISKI", kontekstPola: ["alergie", "oddział", "protokoły"], kontekstPod: "→ do karty", kontekstPod2: "(dopiski)",
      katalog: "BADANIA", szuflady: { wbudowane: "na miejscu", skille: "protokoły (spis)", mcp: "laboratorium" },
      stos: "KARTA PACJENTA", bramka: "ZGODA", wykonanie: "BADANIE", model: "LEKARZ", modelPod: ["zna medycynę, ale o pacjencie", "wie tylko to, co jest w karcie"],
      odpowiedz: "OSTATNIE ZLECENIE", mcp: "LABORATORIA · poza oddziałem", zwrotnaProsba: "ZLECENIE", zwrotnaTekst: "ZALECENIA",
      koperta: { system: "standardy", tools: "badania", messages: "karta" }, nastepny: "następna konsultacja",
      rola: { "człowiek": "pacjent", model: "lekarz", harness: "pielęgn." },
      typ: { prompt: "objawy", tekst: "zalecenie", "wywołanie": "zlecenie", wynik: "wynik", doklejki: "dopisek", "treść skilla": "protokół", streszczenie: "wypis" },
      bramkaOk: "wolno", bramkaNie: "nie wolno", bramkaPyta: "pyta pacjenta…", nicNieWrocilo: "lekarz jeszcze nie odpisał",
      kto: nr => `lekarz z dyżuru nr ${nr}`, pusto: "zmiana dyżuru: przyjdzie inny lekarz",
    },
    zapomnienie: ["ZMIANA DYŻURU: PRZYJDZIE INNY LEKARZ, Z TĄ SAMĄ WIEDZĄ",
      "Następny lekarz skończył te same studia i zna te same podręczniki, ale o tym pacjencie nie wie nic. Wszystko, co wie o pacjencie, przeczyta w karcie."],
    etapy: etapyMetafory({
      reset: { kompakcja: "NOWA KARTA: NA POCZĄTKU WYPIS ZE STAREJ", clear: "NOWY PACJENT, NOWA KARTA", nowa: "NOWA KARTA: LEKARZ NIE WIE, CO BYŁO WCZEŚNIEJ", wznowienie: "PIELĘGNIARKA WYJMUJE KARTĘ Z ARCHIWUM" },
      resetD: "Lekarz niczego nie pamięta, więc liczy się tylko to, co jest w karcie.",
      kompStart: "KARTA ZA GRUBA: PIELĘGNIARKA PROSI O WYPIS", kompReczna: "PACJENT PROSI O WYPIS",
      kompStartD: "Karta przestaje się mieścić. Lekarz ma ją streścić, a streszczenie zastąpi całą kartę.",
      prompt: p => `PACJENT MÓWI: „${p}”`, promptD: "Wizyta zaczyna się od pacjenta. Pielęgniarka zapisuje to w karcie, zanim cokolwiek pójdzie do lekarza.",
      doklejki: "PIELĘGNIARKA DOPISUJE:", doklejkiD: "Pacjent tego nie mówił, ale lekarz przeczyta to tak samo jak jego słowa.",
      kat: { "zasady projektu": "zalecenia oddziału", "środowisko": "sala i oddział", "indeks skilli": "spis protokołów", "kontekst użytkownika": "dane pacjenta",
        "stan gita": "stan po ostatnim obchodzie", "treść skilla": "pełny protokół", "streszczenie historii": "wypis", "zasady commitów": "jak podpisywać dokumenty" },
      stos: "WPISUJĘ SŁOWA PACJENTA DO KARTY", stosD: "Lekarz nie pamięta poprzednich konsultacji. Wszystko, co ma wiedzieć, musi być w karcie.",
      kSystem: "KARTA: NA WIERZCH STANDARDY SZPITALA", kSystemD: "Te same zasady leżą na wierzchu każdej karty, przy każdej konsultacji.",
      kNarzedzia: "KARTA: LISTA BADAŃ DO ZLECENIA", kNarzedziaD: "Lekarz może zlecić tylko badania z tej listy.",
      koperta: "WYSYŁAM LEKARZOWI CAŁĄ KARTĘ", kopertaD: "Standardy, lista badań i cały przebieg wizyty. Lekarz dostaje komplet.",
      kopertaDalej: "TA SAMA KARTA, DŁUŻSZA O NOWE WPISY", kopertaDalejD: "Standardy i lista badań bez zmian. Lekarz i tak dostaje całą kartę od przyjęcia.",
      polecenie: "DOPISUJĘ NA TEN RAZ: PROSZĘ O WYPIS", polecenieD: "Prośba idzie tylko z tą jedną kartą i nie zostaje w historii.",
      model: "LEKARZ DYŻURNY CZYTA KARTĘ I DECYDUJE", modelD: "Lekarz widzi tylko kartę. Pacjenta, sali ani wyników spoza karty nie zna.",
      powrotKomp: "LEKARZ ODSYŁA WYPIS", powrotProsba: "LEKARZ ODSYŁA ZLECENIE", powrotTekst: "LEKARZ ODSYŁA ZALECENIA",
      powrotD: "Lekarz niczego sam nie robi. Odsyła zlecenie albo zalecenia, a resztę robi pielęgniarka.",
      stosOdp: "WPINAM ODPOWIEDŹ LEKARZA DO KARTY", stosOdpD: "Przy następnej konsultacji lekarz zobaczy własne zlecenie tylko dlatego, że jest w karcie.",
      upOk: "PROCEDURA: WOLNO BEZ PYTANIA", upOkD: "Zanim pielęgniarka cokolwiek zrobi, sprawdza procedury: wolno, zapytać pacjenta albo nie wolno.",
      upZgoda: "WYMAGA ZGODY PACJENTA: BRAK ZGODY", upNie: "PROCEDURA ZABRANIA",
      upNieD: "Pielęgniarka tego nie robi, a odmowę wpisuje do karty. Lekarz przeczyta ją jak zwykły wynik i poszuka innej drogi.",
      pytanie: "PYTAM PACJENTA O ZGODĘ", pytanieD: "Pielęgniarka pyta pacjenta i czeka. Lekarz o tym pytaniu nic nie wie.",
      wyk: "PIELĘGNIARKA WYKONUJE ZLECENIE", wykD: "Badanie robi pielęgniarka, nie lekarz.",
      wykCzlowiek: "LEKARZ PYTA PACJENTA (PRZEZ PIELĘGNIARKĘ)", wykCzlowiekD: "Dla lekarza pacjent jest jeszcze jednym badaniem: pielęgniarka zadaje pytanie i wpisuje odpowiedź.",
      wykMcp: s => `LABORATORIUM „${s}” ROBI BADANIE`, wykMcpD: "Pielęgniarka nie robi tego na oddziale. Wysyła zlecenie do laboratorium i czeka na wynik.",
      wykInternet: "PIELĘGNIARKA SZUKA W LITERATURZE", wykInternetD: "Pielęgniarka sprawdza w źródłach poza szpitalem i wpisuje, co znalazła.",
      wykSkill: "PIELĘGNIARKA PRZYNOSI PROTOKÓŁ", wykSkillD: "Do tej pory w karcie był tylko spis protokołów. Pełny protokół trafia do karty dopiero teraz.",
      wynik: "WYNIK DO KARTY", wynikNie: "ODMOWA DO KARTY JAKO WYNIK", wynikD: "Wynik nie idzie do lekarza od razu. Trafia do karty i pójdzie przy następnej konsultacji.",
      petla: "ZNOWU DO LEKARZA, Z CAŁĄ KARTĄ", petlaD: "Lekarz zlecił badanie, więc wizyta trwa. Pielęgniarka wysyła kartę jeszcze raz, dłuższą o wynik.",
      kompakcja: "KARTA ZASTĄPIONA WYPISEM", kompakcjaD: "Od teraz lekarz dostaje wypis zamiast pełnej karty. Jest cieniej, ale szczegóły przepadają.",
      koniec: "ZALECENIA DLA PACJENTA", koniecD: "Lekarz niczego więcej nie zlecił. Pielęgniarka kończy i przekazuje zalecenia pacjentowi.",
      koniecKomp: "WYPIS GOTOWY", koniecKompD: "Pacjent widzi, że karta została skrócona. Następna wizyta zacznie się od wypisu.",
    }),
    rozdzialy: {
      model: "Pielęgniarka wysyła kartę, lekarz odsyła zalecenia. Lekarz niczego nie robi sam i niczego nie pamięta.",
      wywolanie: "Zamiast zaleceń lekarz może odesłać zlecenie: „zrób badanie”. Zrobić je musi pielęgniarka.",
      uprawnienia: "Zanim pielęgniarka cokolwiek zrobi, sprawdza procedury. Odmowa wraca do lekarza jako zwykły wpis w karcie.",
      petla: "Wynik badania trafia do karty, a karta znów do lekarza. Tak w kółko, aż lekarz odpisze zaleceniami bez zlecenia.",
      stos: "Każdą konsultację prowadzi inny lekarz, więc każda niesie całą kartę od przyjęcia.",
      prompt: "Zanim pacjent coś powie, na karcie leżą standardy szpitala, a pielęgniarka dopisuje alergie i oddział.",
      skille: "Na karcie jest tylko spis protokołów. Pełny protokół pielęgniarka przynosi dopiero, gdy lekarz o niego poprosi.",
      mcp: "Dla lekarza laboratorium to zwykłe badanie z listy. Pielęgniarka wysyła próbkę na zewnątrz i czeka na wynik.",
      kompakcja: "Karta robi się za gruba. Lekarz pisze wypis i od tej chwili zamiast karty krąży sam wypis.",
      swobodny: "Wszystko naraz. Chodź po etapach i klikaj elementy sceny: pod spodem są prawdziwe dane.",
    },
  },
  {
    id: "prezes", nazwa: "Prezes i asystentka",
    podpis: "Prezes, który po każdym spotkaniu wszystko zapomina, i jego asystentka z teczką",
    opowiesc: "Prezes decyduje, ale po każdym spotkaniu wszystko zapomina. Asystentka prowadzi teczkę sprawy, załatwia, co prezes poleci, i na każde spotkanie wnosi całą teczkę od pierwszej strony.",
    warstwy: ["prompt", "narzedzia", "uprawnienia", "stos", "skille", "mcp"],
    legenda: [["asystentka", "harness"], ["prezes", "model"], ["właściciel", "człowiek"], ["teczka", "historia wiadomości"],
      ["statut", "prompt systemowy"], ["co asystentka załatwia", "narzędzia"], ["drugi podpis", "uprawnienia"], ["procedury", "skille"], ["kancelaria", "serwer MCP"]],
    scena: {
      harness: "ASYSTENTKA", harnessPod: "sekretariat prezesa", prompt: "STATUT", promptPod: "→ na wierzch",
      kontekst: "KARTECZKI", kontekstPola: ["klient", "dział", "procedury"], kontekstPod: "→ do teczki", kontekstPod2: "(karteczki)",
      katalog: "SPRAWY DO ZAŁATWIENIA", szuflady: { wbudowane: "w biurze", skille: "procedury (spis)", mcp: "na zewnątrz" },
      stos: "TECZKA SPRAWY", bramka: "PODPISY", wykonanie: "ZAŁATWIANIE", model: "PREZES", modelPod: ["zna firmę, ale o tej sprawie", "wie tylko to, co jest w teczce"],
      odpowiedz: "OSTATNIE POLECENIE", mcp: "KANCELARIE · poza firmą", zwrotnaProsba: "POLECENIE", zwrotnaTekst: "DECYZJA",
      koperta: { system: "statut", tools: "sprawy", messages: "teczka" }, nastepny: "następne spotkanie",
      rola: { "człowiek": "właśc.", model: "prezes", harness: "asyst." },
      typ: { prompt: "zlecenie", tekst: "decyzja", "wywołanie": "polecenie", wynik: "dokument", doklejki: "karteczka", "treść skilla": "procedura", streszczenie: "notatka" },
      bramkaOk: "można", bramkaNie: "nie można", bramkaPyta: "czeka na podpis…", nicNieWrocilo: "prezes jeszcze nie zdecydował",
      kto: () => "prezes na spotkaniu", pusto: "wyszedł i nic nie pamięta",
    },
    zapomnienie: ["PREZES WYCHODZI ZE SPOTKANIA I WSZYSTKO ZAPOMINA",
      "Zna firmę i branżę tak samo dobrze jak rano, ale o tej sprawie nie pamięta nic. Na następnym spotkaniu dowie się wszystkiego z teczki."],
    etapy: etapyMetafory({
      reset: { kompakcja: "NOWA TECZKA: NA POCZĄTKU NOTATKA ZE STAREJ", clear: "NOWA SPRAWA, PUSTA TECZKA", nowa: "NOWA TECZKA: PREZES NIE WIE, CO BYŁO WCZEŚNIEJ", wznowienie: "ASYSTENTKA WYJMUJE TECZKĘ Z ARCHIWUM" },
      resetD: "Prezes niczego nie pamięta, więc liczy się tylko to, co leży w teczce.",
      kompStart: "TECZKA ZA GRUBA: ASYSTENTKA PROSI O NOTATKĘ", kompReczna: "WŁAŚCICIEL PROSI O NOTATKĘ PODSUMOWUJĄCĄ",
      kompStartD: "Teczka przestaje się mieścić. Prezes ma ją streścić, a notatka zastąpi całą teczkę.",
      prompt: p => `WŁAŚCICIEL ZLECA: „${p}”`, promptD: "Sprawa zaczyna się od właściciela. Asystentka wkłada zlecenie do teczki, zanim cokolwiek trafi do prezesa.",
      doklejki: "ASYSTENTKA DOKŁADA KARTECZKĘ:", doklejkiD: "Właściciel tego nie pisał, ale prezes przeczyta to tak samo jak jego zlecenie.",
      kat: { "zasady projektu": "zasady działu", "środowisko": "biuro i systemy", "indeks skilli": "spis procedur", "kontekst użytkownika": "kim jest właściciel",
        "stan gita": "stan spraw", "treść skilla": "pełna procedura", "streszczenie historii": "notatka podsumowująca", "zasady commitów": "jak podpisywać pisma" },
      stos: "WKŁADAM ZLECENIE DO TECZKI", stosD: "Prezes nie pamięta wcześniejszych spotkań. Co ma wiedzieć, musi leżeć w teczce.",
      kSystem: "TECZKA: NA WIERZCH STATUT FIRMY", kSystemD: "Statut leży na wierzchu każdej teczki, na każdym spotkaniu ten sam.",
      kNarzedzia: "TECZKA: CO ASYSTENTKA UMIE ZAŁATWIĆ", kNarzedziaD: "Prezes może polecić tylko sprawy z tej listy.",
      koperta: "NIOSĘ PREZESOWI CAŁĄ TECZKĘ", kopertaD: "Statut, lista spraw i wszystko, co do tej pory się wydarzyło.",
      kopertaDalej: "TA SAMA TECZKA, GRUBSZA O NOWE DOKUMENTY", kopertaDalejD: "Statut i lista bez zmian. Prezes i tak dostaje całą teczkę od pierwszej strony.",
      polecenie: "DOKŁADAM NA TEN RAZ: PROŚBA O NOTATKĘ", polecenieD: "Prośba idzie tylko na to jedno spotkanie i nie zostaje w teczce.",
      model: "PREZES CZYTA TECZKĘ I DECYDUJE", modelD: "Prezes widzi tylko teczkę. Nie dzwoni, nie sprawdza systemów, niczego nie pamięta.",
      powrotKomp: "PREZES ODDAJE NOTATKĘ PODSUMOWUJĄCĄ", powrotProsba: "PREZES ODDAJE POLECENIE", powrotTekst: "PREZES ODDAJE DECYZJĘ",
      powrotD: "Prezes niczego sam nie załatwia. Oddaje polecenie albo decyzję, resztę robi asystentka.",
      stosOdp: "WKŁADAM POLECENIE PREZESA DO TECZKI", stosOdpD: "Na następnym spotkaniu prezes zobaczy własne polecenie tylko dlatego, że leży w teczce.",
      upOk: "REGULAMIN: MOGĘ ZAŁATWIĆ SAMA", upOkD: "Zanim asystentka coś załatwi, sprawdza regulamin: może sama, potrzebny podpis albo nie wolno.",
      upZgoda: "POTRZEBNY DRUGI PODPIS: BRAK PODPISU", upNie: "REGULAMIN ZABRANIA",
      upNieD: "Asystentka tego nie załatwia, a odmowę wkłada do teczki. Prezes przeczyta ją jak zwykły dokument i poszuka innej drogi.",
      pytanie: "PROSZĘ WŁAŚCICIELA O PODPIS", pytanieD: "Asystentka czeka na podpis właściciela. Prezes o tym nic nie wie.",
      wyk: "ASYSTENTKA ZAŁATWIA", wykD: "Załatwia asystentka, nie prezes.",
      wykCzlowiek: "PREZES PYTA WŁAŚCICIELA (PRZEZ ASYSTENTKĘ)", wykCzlowiekD: "Dla prezesa właściciel to jeszcze jedna sprawa do załatwienia: asystentka pyta i wkłada odpowiedź do teczki.",
      wykMcp: s => `KANCELARIA „${s}” ZAŁATWIA`, wykMcpD: "Tego asystentka nie załatwi w biurze. Przekazuje sprawę firmie z zewnątrz i czeka na odpowiedź.",
      wykInternet: "ASYSTENTKA SZUKA W INTERNECIE", wykInternetD: "Asystentka sprawdza w źródłach poza firmą i wkłada wydruk do teczki.",
      wykSkill: "ASYSTENTKA WYJMUJE PROCEDURĘ", wykSkillD: "Do tej pory w teczce był tylko spis procedur. Pełna procedura trafia do teczki dopiero teraz.",
      wynik: "DOKUMENT DO TECZKI", wynikNie: "ODMOWA DO TECZKI JAKO DOKUMENT", wynikD: "Wynik nie idzie do prezesa od razu. Trafia do teczki i pójdzie na następne spotkanie.",
      petla: "ZNOWU DO PREZESA, Z CAŁĄ TECZKĄ", petlaD: "Prezes wydał polecenie, więc sprawa trwa. Asystentka wnosi teczkę jeszcze raz, grubszą o wynik.",
      kompakcja: "TECZKA ZASTĄPIONA NOTATKĄ", kompakcjaD: "Od teraz prezes dostaje notatkę zamiast teczki. Jest lżej, ale szczegóły przepadają.",
      koniec: "DECYZJA DLA WŁAŚCICIELA", koniecD: "Prezes niczego więcej nie polecił. Asystentka kończy i przekazuje decyzję właścicielowi.",
      koniecKomp: "NOTATKA GOTOWA", koniecKompD: "Właściciel widzi, że teczka została skrócona. Następne spotkanie zacznie się od notatki.",
    }),
    rozdzialy: {
      model: "Asystentka przynosi teczkę, prezes oddaje decyzję. Prezes niczego nie załatwia sam i niczego nie pamięta.",
      wywolanie: "Zamiast decyzji prezes może oddać polecenie: „zadzwoń”, „sprawdź”. Załatwić je musi asystentka.",
      uprawnienia: "Zanim asystentka coś załatwi, sprawdza regulamin. Odmowa wraca do prezesa jako zwykły dokument w teczce.",
      petla: "Wynik trafia do teczki, a teczka znów do prezesa. Aż prezes odda decyzję bez nowego polecenia.",
      stos: "Prezes po każdym spotkaniu zapomina sprawę, więc każde spotkanie zaczyna się od całej teczki.",
      prompt: "Zanim właściciel coś zleci, w teczce leży statut, a asystentka dokłada karteczki o kliencie i dziale.",
      skille: "Na grzbiecie segregatora jest tylko spis procedur. Treść asystentka wyjmuje dopiero, gdy prezes o nią poprosi.",
      mcp: "Dla prezesa kancelaria to jeszcze jedna sprawa do załatwienia. Asystentka przekazuje ją na zewnątrz i czeka.",
      kompakcja: "Teczka robi się za gruba. Prezes pisze notatkę podsumowującą i od tej chwili krąży sama notatka.",
      swobodny: "Wszystko naraz. Chodź po etapach i klikaj elementy sceny: pod spodem są prawdziwe dane.",
    },
  },
  {
    id: "szachy", nazwa: "Szachy przez telefon",
    podpis: "Szachista, który gra przez telefon i po każdej rozmowie zapomina partię, i asystent przy planszy",
    opowiesc: "Arcymistrz gra przez telefon, nie widzi planszy i po każdej rozmowie zapomina partię. Asystent przy szachownicy przesuwa figury i przy każdym telefonie dyktuje cały zapis od pierwszego ruchu.",
    warstwy: ["prompt", "narzedzia", "uprawnienia", "stos", "cache"],
    legenda: [["asystent", "harness"], ["arcymistrz", "model"], ["przeciwnik", "człowiek"], ["zapis partii", "historia wiadomości"],
      ["regulamin turnieju", "prompt systemowy"], ["co asystent robi przy planszy", "narzędzia"], ["sędzia", "uprawnienia"], ["debiut z pamięci", "cache"]],
    scena: {
      harness: "ASYSTENT", harnessPod: "przy szachownicy", prompt: "REGULAMIN", promptPod: "→ na początek",
      kontekst: "DOPOWIEDZENIA", kontekstPola: ["kolor", "zegar", "turniej"], kontekstPod: "→ do zapisu", kontekstPod2: "(dopiski)",
      katalog: "PRZY PLANSZY", szuflady: { wbudowane: "ruchy", skille: "debiuty", mcp: "z zewnątrz" },
      stos: "ZAPIS PARTII", bramka: "SĘDZIA", wykonanie: "PRZY PLANSZY", model: "ARCYMISTRZ", modelPod: ["zna szachy, ale tę partię", "zna tylko z zapisu"],
      odpowiedz: "OSTATNIA PROŚBA", mcp: "Z ZEWNĄTRZ", zwrotnaProsba: "PROŚBA", zwrotnaTekst: "RUCH",
      koperta: { system: "regulamin", tools: "plansza", messages: "zapis" }, nastepny: "następny telefon",
      rola: { "człowiek": "przeciw.", model: "arcym.", harness: "asyst." },
      typ: { prompt: "ruch", tekst: "ruch", "wywołanie": "prośba", wynik: "na planszy", doklejki: "dopowiedz.", streszczenie: "diagram" },
      bramkaOk: "dozwolone", bramkaNie: "niedozwolone", bramkaPyta: "pyta przeciwnika…", nicNieWrocilo: "arcymistrz jeszcze myśli",
      kto: () => "arcymistrz przy telefonie", pusto: "partia wypadła mu z głowy",
    },
    zapomnienie: ["ARCYMISTRZ ODKŁADA SŁUCHAWKĘ: PARTIA WYPADA MU Z GŁOWY",
      "Szachy zna tak samo dobrze jak przed chwilą, ale tej partii nie pamięta wcale. Przy następnym telefonie usłyszy cały zapis od nowa."],
    etapy: etapyMetafory({
      reset: { kompakcja: "NOWY ZAPIS: ZACZYNA SIĘ OD DIAGRAMU", clear: "NOWA PARTIA", nowa: "NOWA PARTIA: ARCYMISTRZ NIE ZNA POPRZEDNIEJ", wznowienie: "ASYSTENT ODCZYTUJE ZAPIS STAREJ PARTII" },
      resetD: "Arcymistrz niczego nie pamięta, więc liczy się tylko to, co jest w zapisie.",
      kompStart: "ZAPIS ZA DŁUGI: ASYSTENT PROSI O DIAGRAM POZYCJI", kompReczna: "PRZECIWNIK PROSI O DIAGRAM ZAMIAST ZAPISU",
      kompStartD: "Zapis robi się za długi do dyktowania. Arcymistrz ma narysować pozycję, a diagram zastąpi cały zapis.",
      prompt: p => `RUCH PRZECIWNIKA: „${p}”`, promptD: "Tura zaczyna się od przeciwnika. Asystent zapisuje jego ruch, zanim zadzwoni do arcymistrza.",
      doklejki: "ASYSTENT DOPOWIADA:", doklejkiD: "Przeciwnik tego nie mówił, ale arcymistrz usłyszy to tak samo jak jego ruch.",
      kat: { "zasady projektu": "warunki partii", "środowisko": "stół i zegar", "kontekst użytkownika": "kim jest przeciwnik", "stan gita": "stan planszy",
        "streszczenie historii": "diagram pozycji", "zasady commitów": "jak zapisywać ruchy" },
      stos: "DOPISUJĘ RUCH PRZECIWNIKA DO ZAPISU", stosD: "Arcymistrz po każdej rozmowie zapomina partię. Wszystko, co ma wiedzieć, musi być w zapisie.",
      kSystem: "DYKTUJĘ: REGULAMIN TURNIEJU", kSystemD: "Regulamin idzie na początek każdej rozmowy, zawsze ten sam.",
      kNarzedzia: "DYKTUJĘ: CO MOGĘ ZROBIĆ PRZY PLANSZY", kNarzedziaD: "Arcymistrz może prosić tylko o rzeczy z tej listy.",
      koperta: "DYKTUJĘ CAŁY ZAPIS OD PIERWSZEGO RUCHU", kopertaD: "Regulamin, lista i cała partia. Arcymistrz dostaje komplet.",
      kopertaDalej: "TEN SAM REGULAMIN, DŁUŻSZY ZAPIS", kopertaDalejD: "Regulamin i lista bez zmian. Arcymistrz i tak słyszy całą partię od pierwszego ruchu.",
      cacheD: p => `Początek zawsze jest ten sam, więc arcymistrz zna go jak debiut: ${p}% rozmowy przeleciał z pamięci, taniej i szybciej.`,
      cacheModel: p => `(DEBIUT Z PAMIĘCI: ${p}%)`,
      polecenie: "NA TEN RAZ: „NARYSUJ POZYCJĘ”", polecenieD: "Prośba idzie tylko w tej jednej rozmowie i nie zostaje w zapisie.",
      model: "ARCYMISTRZ SŁUCHA I MYŚLI", modelD: "Arcymistrz nie widzi planszy. Zna tylko to, co mu podyktowano.",
      powrotKomp: "ARCYMISTRZ PODAJE DIAGRAM POZYCJI", powrotProsba: "ARCYMISTRZ PROSI", powrotTekst: "ARCYMISTRZ PODAJE RUCH",
      powrotD: "Arcymistrz niczego nie rusza. Prosi asystenta albo podaje ruch.",
      stosOdp: "DOPISUJĘ JEGO SŁOWA DO ZAPISU", stosOdpD: "Przy następnym telefonie arcymistrz usłyszy własną prośbę tylko dlatego, że jest w zapisie.",
      upOk: "SĘDZIA: DOZWOLONE", upOkD: "Zanim asystent coś zrobi przy planszy, patrzy sędzia: dozwolone, zapytać przeciwnika albo niedozwolone.",
      upZgoda: "SĘDZIA: POTRZEBNA ZGODA PRZECIWNIKA, BRAK", upNie: "SĘDZIA: NIEDOZWOLONE",
      upNieD: "Asystent tego nie robi. Arcymistrz dostaje „niedozwolone” jak każdą inną informację i szuka innego ruchu.",
      pytanie: "PYTAM PRZECIWNIKA O ZGODĘ", pytanieD: "Asystent pyta przeciwnika i czeka. Arcymistrz o tym nic nie wie.",
      wyk: "ASYSTENT PRZY PLANSZY", wykD: "Przy planszy działa asystent, nie arcymistrz.",
      wykCzlowiek: "ARCYMISTRZ PYTA PRZECIWNIKA (PRZEZ ASYSTENTA)", wykCzlowiekD: "Dla arcymistrza przeciwnik to jeszcze jedno źródło informacji: asystent pyta i dopisuje odpowiedź.",
      wykMcp: s => `„${s}” SPRAWDZA`, wykMcpD: "Asystent przekazuje prośbę komuś spoza sali i czeka na odpowiedź.",
      wykInternet: "ASYSTENT SPRAWDZA W BAZIE PARTII", wykInternetD: "Asystent szuka poza salą i dopisuje, co znalazł.",
      wykSkill: "ASYSTENT PRZYNOSI OPIS DEBIUTU", wykSkillD: "Pełny opis trafia do zapisu dopiero teraz.",
      wynik: "DO ZAPISU", wynikNie: "„NIEDOZWOLONE” DO ZAPISU", wynikD: "Wynik nie idzie do arcymistrza od razu. Trafia do zapisu i usłyszy go przy następnym telefonie.",
      petla: "DZWONIĘ ZNOWU I DYKTUJĘ CAŁY ZAPIS", petlaD: "Arcymistrz o coś poprosił, więc tura trwa. Asystent dzwoni jeszcze raz, zapis dłuższy o wynik.",
      kompakcja: "ZAPIS ZASTĄPIONY DIAGRAMEM POZYCJI", kompakcjaD: "Od teraz arcymistrz słyszy samą pozycję zamiast całej partii. Krócej, ale nie wie, jak do niej doszło.",
      koniec: "RUCH ARCYMISTRZA DLA PRZECIWNIKA", koniecD: "Arcymistrz o nic więcej nie prosi. Asystent wykonuje ruch i oddaje głos przeciwnikowi.",
      koniecKomp: "DIAGRAM GOTOWY", koniecKompD: "Przeciwnik widzi, że zapis został skrócony. Następny telefon zacznie się od diagramu.",
    }),
    rozdzialy: {
      model: "Asystent dyktuje zapis, arcymistrz podaje ruch. Arcymistrz nie widzi planszy i nie pamięta partii.",
      wywolanie: "Zamiast ruchu arcymistrz może poprosić: „sprawdź, co stoi na e4”. Sprawdzić musi asystent.",
      uprawnienia: "Zanim asystent coś zrobi przy planszy, patrzy sędzia. „Niedozwolone” wraca do arcymistrza jak każda inna informacja.",
      petla: "Wynik trafia do zapisu, a asystent znów dzwoni i dyktuje wszystko od początku. Aż arcymistrz poda ruch.",
      stos: "Arcymistrz po każdej rozmowie zapomina partię, więc każda rozmowa zaczyna się od 1. e4.",
      prompt: "Zanim przeciwnik ruszy, asystent czyta regulamin turnieju i mówi, kto gra białymi.",
      cache: "Początek zapisu jest zawsze ten sam, więc arcymistrz zna go jak debiut: taniej i szybciej. Liczby są w ostatniej odpowiedzi.",
      kompakcja: "Zapis robi się za długi. Arcymistrz rysuje diagram pozycji i od tej chwili asystent dyktuje sam diagram.",
      swobodny: "Wszystko naraz. Chodź po etapach i klikaj elementy sceny: pod spodem są prawdziwe dane.",
    },
  },
  {
    id: "memento", nazwa: "Memento", nagranie: "przyklad|kompakcja.jsonl",
    podpis: "Leonard, który nie pamięta niczego dłużej niż kilka minut, i recepcjonista z plikiem zdjęć",
    opowiesc: "Leonard nie pamięta niczego dłużej niż kilka minut. Ma tatuaże, które są z nim zawsze, i plik polaroidów, który rośnie. Recepcjonista motelu robi zdjęcia, chodzi, sprawdza i za każdym razem podaje mu cały plik.",
    warstwy: ["prompt", "narzedzia", "stos"],
    legenda: [["recepcjonista", "harness"], ["Leonard", "model"], ["ktoś, kto pyta", "człowiek"], ["polaroidy", "historia wiadomości"],
      ["tatuaże", "prompt systemowy"], ["co recepcjonista sprawdza", "narzędzia"], ["kartka ze streszczeniem", "kompakcja"]],
    scena: {
      harness: "RECEPCJONISTA", harnessPod: "motel, pokój 21", prompt: "TATUAŻE", promptPod: "→ zawsze na nim",
      kontekst: "KARTKI", kontekstPola: ["motel", "kto pyta", "adres"], kontekstPod: "→ do pliku", kontekstPod2: "(kartki)",
      katalog: "CO SPRAWDZIĆ", szuflady: { wbudowane: "na miejscu", skille: "notatki", mcp: "na mieście" },
      stos: "POLAROIDY", bramka: "ZGODA", wykonanie: "SPRAWDZANIE", model: "LEONARD", modelPod: ["umie myśleć, ale pamięta", "tylko tatuaże i zdjęcia"],
      odpowiedz: "OSTATNIA KARTECZKA", mcp: "NA MIEŚCIE", zwrotnaProsba: "KARTECZKA", zwrotnaTekst: "ODPOWIEDŹ",
      koperta: { system: "tatuaże", tools: "co sprawdzić", messages: "zdjęcia" }, nastepny: "znów do Leonarda",
      rola: { "człowiek": "pytający", model: "Leonard", harness: "recepcja" },
      typ: { prompt: "pytanie", tekst: "odpowiedź", "wywołanie": "karteczka", wynik: "zdjęcie", doklejki: "kartka", "treść skilla": "notatka", streszczenie: "streszczenie" },
      bramkaOk: "można", bramkaNie: "nie można", bramkaPyta: "pyta…", nicNieWrocilo: "Leonard jeszcze myśli",
      kto: () => "Leonard w pokoju 21", pusto: "wszystko wypadło mu z głowy",
    },
    zapomnienie: ["Z GŁOWY LEONARDA WSZYSTKO WYPADŁO",
      "Leonard wie, kim jest, i myśli tak samo sprawnie jak przed chwilą. Co się działo, nie pamięta. Zostają tatuaże i zdjęcia w pliku."],
    etapy: etapyMetafory({
      reset: { kompakcja: "NOWY PLIK: NA POCZĄTKU KARTKA ZE STRESZCZENIEM", clear: "NOWY DZIEŃ, PUSTA KIESZEŃ", nowa: "NOWY PLIK: LEONARD NIE WIE, CO BYŁO WCZEŚNIEJ", wznowienie: "RECEPCJONISTA WYCIĄGA STARY PLIK ZDJĘĆ" },
      resetD: "Leonard niczego nie pamięta, więc liczy się tylko to, co jest na zdjęciach.",
      kompStart: "ZDJĘĆ ZA DUŻO: TRZEBA JE STREŚCIĆ", kompReczna: "KTOŚ KAŻE STREŚCIĆ ZDJĘCIA NA JEDNEJ KARTCE",
      kompStartD: "Plik przestaje się mieścić. Leonard ma streścić wszystko na jednej kartce, a kartka zastąpi zdjęcia.",
      prompt: p => `KTOŚ PYTA LEONARDA: „${p}”`, promptD: "Pytanie trafia do recepcjonisty. Leonard zobaczy je dopiero jako nowe zdjęcie w pliku.",
      doklejki: "RECEPCJONISTA DOKŁADA KARTKĘ:", doklejkiD: "Nikt tego nie mówił, ale Leonard przeczyta to tak samo jak pytanie.",
      kat: { "zasady projektu": "zasady w tym motelu", "środowisko": "numer pokoju i adres", "kontekst użytkownika": "kto pyta", "stan gita": "co się zmieniło w pokoju",
        "zasady commitów": "jak podpisywać zdjęcia", "streszczenie historii": "kartka ze streszczeniem", "ponownie dołączone pliki": "zdjęcia najważniejszych rzeczy", "polecenie streszczenia": "„streść wszystko”" },
      stos: "ROBIĘ ZDJĘCIE PYTANIU I DOKŁADAM DO PLIKU", stosD: "Leonard nie pamięta niczego sprzed kilku minut. Co ma wiedzieć, musi być na zdjęciach.",
      kSystem: "LEONARD CZYTA TATUAŻE", kSystemD: "Tatuaże są zawsze te same i zawsze na nim. Czyta je przy każdej decyzji od nowa.",
      kNarzedzia: null,
      koperta: "PODAJĘ LEONARDOWI CAŁY PLIK ZDJĘĆ", kopertaD: "Tatuaże i wszystkie zdjęcia. Leonard dostaje komplet.",
      kopertaDalej: "TE SAME TATUAŻE, WIĘCEJ ZDJĘĆ", kopertaDalejD: "Tatuaże bez zmian. Leonard i tak przegląda wszystkie zdjęcia od pierwszego.",
      polecenie: "NA TEN RAZ: „STREŚĆ WSZYSTKO NA JEDNEJ KARTCE”", polecenieD: "Ta prośba idzie tylko raz i nie zostaje w pliku.",
      model: "LEONARD UKŁADA ZDJĘCIA I DECYDUJE", modelD: "Leonard zna tylko tatuaże i zdjęcia. Nic więcej nie pamięta.",
      powrotKomp: "LEONARD PISZE STRESZCZENIE", powrotProsba: "LEONARD PISZE KARTECZKĘ", powrotTekst: "LEONARD ODPOWIADA",
      powrotD: "Leonard nigdzie nie idzie. Pisze karteczkę z prośbą albo odpowiada.",
      stosOdp: "ZDJĘCIE JEGO KARTECZKI DO PLIKU", stosOdpD: "Za chwilę Leonard nie będzie pamiętał, że to napisał. Zobaczy to, bo jest zdjęcie.",
      upOk: null, pytanie: null,
      wyk: "RECEPCJONISTA SPRAWDZA", wykD: "Sprawdza recepcjonista, Leonard siedzi w pokoju.",
      wykCzlowiek: "RECEPCJONISTA PYTA TEGO, KTO PYTAŁ", wykCzlowiekD: "Leonard chce coś doprecyzować. Recepcjonista pyta i robi zdjęcie odpowiedzi.",
      wykMcp: s => `„${s}” SPRAWDZA NA MIEŚCIE`, wykMcpD: "Recepcjonista prosi kogoś z miasta i czeka na odpowiedź.",
      wykInternet: "RECEPCJONISTA SZUKA W GAZETACH", wykInternetD: "Recepcjonista szuka poza motelem i robi zdjęcie temu, co znalazł.",
      wykSkill: "RECEPCJONISTA PRZYNOSI NOTATKI", wykSkillD: "Pełne notatki trafiają do pliku dopiero teraz.",
      wynik: "NOWY POLAROID", wynikNie: "ZDJĘCIE ODMOWY DO PLIKU", wynikD: "Leonard nie zobaczy tego od razu. Zdjęcie trafia do pliku i pójdzie z całą resztą.",
      petla: "ZNÓW DO LEONARDA, Z CAŁYM PLIKIEM", petlaD: "Leonard o coś poprosił, więc sprawa trwa. Recepcjonista podaje mu plik jeszcze raz, grubszy o nowe zdjęcie.",
      kompakcja: "ZDJĘCIA ZASTĄPIONE JEDNĄ KARTKĄ", kompakcjaD: "Od teraz Leonard ma tylko kartkę ze streszczeniem. Jest lżej, ale jeśli streszczenie coś przekręciło, Leonard się nie zorientuje.",
      koniec: "LEONARD ODPOWIADA PYTAJĄCEMU", koniecD: "Leonard o nic więcej nie prosi. Recepcjonista przekazuje odpowiedź.",
      koniecKomp: "KARTKA GOTOWA", koniecKompD: "Zamiast stosu zdjęć jest jedna kartka. Następne pytanie zacznie się od niej.",
    }),
    rozdzialy: {
      model: "Recepcjonista podaje zdjęcia, Leonard odpowiada. Leonard niczego nie robi sam i nie pamięta niczego dłużej niż kilka minut.",
      wywolanie: "Zamiast odpowiedzi Leonard może napisać karteczkę: „sprawdź pokój 21”. Sprawdzić musi recepcjonista.",
      petla: "Nowe zdjęcie trafia do pliku, a plik znów do Leonarda. Aż Leonard odpowie bez karteczki.",
      stos: "Leonard nie pamięta, więc przy każdej decyzji dostaje cały plik zdjęć od pierwszego.",
      prompt: "Zanim ktoś zapyta, Leonard ma tatuaże. Recepcjonista dokłada kartki: gdzie jest i kto pyta.",
      kompakcja: "Zdjęć jest za dużo. Leonard streszcza je na jednej kartce i od tej pory ma tylko ją. Jeśli kartka kłamie, nie zorientuje się.",
      swobodny: "Wszystko naraz. Chodź po etapach i klikaj elementy sceny: pod spodem są prawdziwe dane.",
    },
  },
];

// Rozdział tylko dla metafor: kompakcja (każda metafora ma na nią obraz).
export const ROZDZIAL_KOMPAKCJA = { id: "kompakcja", tytul: "Kompakcja", stop: "koniec",
  wybierz: m => m.glowne.find(w => w.kompakcja), brak: "W tym nagraniu nie ma kompakcji. Wybierz nagranie „kompakcja”." };

// Etapy kroku w metaforze: nowe tytuły, sklejone etapy (ukryty) i „zapomnienie” po każdej odpowiedzi modelu.
export function etapyWMetaforze(E, w, model, m, W) {
  const tura = model.tury.find(t => t.nr === w.tura);
  const u = w.odp?.usage;
  const x = { w, prompt: skrot(tura?.prompt, 40), cache: W.has("cache") && u?.razem ? Math.round((100 * u.odczyt) / u.razem) : null };
  const wynik = [];
  for (const e of E) {
    const f = m.etapy[e.typ];
    const r = f ? f(e, x) : null;
    wynik.push(r ? { ...e, tytul: r[0], dlaczego: r[1], prawdziwy: e.tytul } : { ...e, ukryty: true, prawdziwy: e.tytul });
    if (e.typ === "powrot") wynik.push({ typ: "zapomnienie", tytul: m.zapomnienie[0], dlaczego: m.zapomnienie[1], ts: e.ts, id: `${e.id}:z`,
      prawdziwy: "MODEL JEST BEZSTANOWY: PO ODPOWIEDZI NICZEGO NIE PAMIĘTA" });
  }
  wynik.forEach((e, i) => (e.i = i));
  return wynik;
}

// Najbliższy widoczny etap od i w kierunku k (+1 / -1); -1, gdy takiego nie ma.
export function widoczny(E, i, k) {
  for (let j = i; j >= 0 && j < E.length; j += k) if (!E[j].ukryty) return j;
  return -1;
}
