// Wstrzykiwanie logu diagnostycznego do kopii aplikacji Java (worktree). Deterministycznie, bez parsera z zewnątrz:
// prosty tokenizer (napisy, znaki, komentarze, text blocki) → maska kodu → deklaracje metod z mapy w ciele klasy →
//   ciało { in(); try { …stare ciało… } catch (Throwable t) { blad(t); throw t; } finally { out(); } }
// (precise rethrow z Javy 7: kompilator przepuszcza tylko wyjątki, które ciało i tak mogło rzucić).
// Pomijamy konstruktory (super()/this() musi być pierwsze), metody abstrakcyjne i natywne.
// Do tego: pomocnik flowlens/* do src/main/java modułu i owinięcie DataSource (Spring: autokonfiguracja; Jakarta EE:
// <data-source> z web.xml i @DataSourceDefinition przez flowlens.DiagDataSource).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const RYSOWANE = new Set(["wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"]);

// Tekst → maska: znaki poza kodem (napisy, komentarze) zamienione na spacje, długość bez zmian.
export function maska(t) {
  const m = t.split("");
  let i = 0;
  const zatrzyj = (od, do_) => { for (let k = od; k < do_; k++) if (m[k] !== "\n") m[k] = " "; };
  while (i < t.length) {
    const c = t[i], d = t[i + 1];
    if (c === "/" && d === "/") { const k = t.indexOf("\n", i); const e = k < 0 ? t.length : k; zatrzyj(i, e); i = e; }
    else if (c === "/" && d === "*") { const k = t.indexOf("*/", i + 2); const e = k < 0 ? t.length : k + 2; zatrzyj(i, e); i = e; }
    else if (c === '"' && t.startsWith('"""', i)) { const k = t.indexOf('"""', i + 3); const e = k < 0 ? t.length : k + 3; zatrzyj(i + 1, e - 1); i = e; }
    else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < t.length && t[k] !== c && t[k] !== "\n") k += t[k] === "\\" ? 2 : 1;
      zatrzyj(i + 1, k); i = k + 1;
    } else i++;
  }
  return m.join("");
}

// pary nawiasów klamrowych: otwarcie → zamknięcie
function klamry(kod) {
  const para = new Map(), stos = [];
  for (let i = 0; i < kod.length; i++) {
    if (kod[i] === "{") stos.push(i);
    else if (kod[i] === "}") { const o = stos.pop(); if (o != null) para.set(o, i); }
  }
  return para;
}
function zamykajacyNawias(kod, i) {          // kod[i] === "("
  let g = 0;
  for (let k = i; k < kod.length; k++) {
    if (kod[k] === "(") g++;
    else if (kod[k] === ")" && --g === 0) return k;
  }
  return -1;
}

// Ciało klasy o prostej nazwie (także zagnieżdżonej): [otwarcie, zamknięcie]
function cialoKlasy(kod, para, nazwa) {
  const re = new RegExp(`\\b(?:class|interface|enum|record)\\s+${nazwa}\\b`, "g");
  const m = re.exec(kod);
  if (!m) return null;
  const o = kod.indexOf("{", m.index);
  return o < 0 ? null : [o, para.get(o)];
}

// Metody o danych nazwach zadeklarowane bezpośrednio w ciele klasy → [{nazwa, otwarcie, zamkniecie}]
export function metodyKlasy(kod, nazwaKlasy, nazwy) {
  const para = klamry(kod), cialo = cialoKlasy(kod, para, nazwaKlasy);
  if (!cialo) return [];
  const [od, do_] = cialo, wynik = [];
  // bezpośrednio w ciele = nie wewnątrz zagnieżdżonych klamer (pomijamy ciała metod, klas wewnętrznych, inicjalizatorów)
  const zajete = [];
  for (const [o, z] of para) if (o > od && z < do_) zajete.push([o, z]);
  const wSrodku = i => zajete.some(([o, z]) => i > o && i < z);
  // C#: metoda generyczna Nazwa<T>(…) — w Javie parametry typu stoją przed typem zwracanym, więc nic nie psuje
  const re = new RegExp(`\\b(${nazwy.map(n => n.replace(/\$/g, "\\$")).join("|")})\\s*(?:<[^()]*?>)?\\s*\\(`, "g");
  re.lastIndex = od;
  let m;
  while ((m = re.exec(kod)) && m.index < do_) {
    if (wSrodku(m.index)) continue;
    const przed = kod.slice(Math.max(od, m.index - 40), m.index).trimEnd();
    if (/(\bnew|\.|=|\breturn|,|\()$/.test(przed)) continue;                 // wywołanie, nie deklaracja
    if (/\b(abstract|native)\b[^;{}]*$/.test(kod.slice(od, m.index).split(/[;{}]/).pop())) continue;
    const zam = zamykajacyNawias(kod, kod.indexOf("(", m.index));
    if (zam < 0) continue;
    // po nawiasie: throws (Java) albo ograniczenia „where T : class, new()” (C#) przed ciałem
    const reszta = /^\s*(?:throws\s+[\w.$<>,\s]+?)?(?:\s*where\s+[^{;=]+?)*\s*([{;]|->)/.exec(kod.slice(zam + 1));
    if (!reszta || reszta[1] !== "{") continue;
    const otw = zam + 1 + reszta[0].length - 1;
    if (!para.has(otw)) continue;
    wynik.push({ nazwa: m[1], otwarcie: otw, zamkniecie: para.get(otw) });
    re.lastIndex = para.get(otw);
  }
  return wynik;
}

const j = s => JSON.stringify(s);

// Wstrzyknięcie w tekst jednego pliku: klasy [{fqn, nazwa, metody, wejscie: {metoda → {rodzaj, http, sciezka}}}]
export function wstrzyknijPlik(tekst, klasy) {
  const kod = maska(tekst), wstawki = [], raport = [];
  for (const k of klasy) {
    const ms = metodyKlasy(kod, k.nazwa, k.metody.filter(n => n !== k.nazwa));
    for (const m of ms) {
      const w = k.wejscie?.[m.nazwa];
      const argi = w ? `${j(k.fqn)}, ${j(m.nazwa)}, ${j(w.rodzaj)}, ${w.http ? j(w.http) : "null"}, ${w.sciezka != null ? j(w.sciezka) : "null"}` : `${j(k.fqn)}, ${j(m.nazwa)}`;
      wstawki.push([m.otwarcie + 1, ` flowlens.Diag.in(${argi}); try {`, 0]);
      wstawki.push([m.zamkniecie, `} catch (Throwable flowlensT) { flowlens.Diag.blad(${j(k.fqn)}, ${j(m.nazwa)}, flowlensT); throw flowlensT; } finally { flowlens.Diag.out(${j(k.fqn)}, ${j(m.nazwa)}); } `, 1]);
      raport.push(`${k.fqn}.${m.nazwa}`);
    }
    const brak = k.metody.filter(n => n !== k.nazwa && !ms.some(m => m.nazwa === n));
    if (brak.length && !k.interfejs) raport.push(...brak.map(n => `! ${k.fqn}.${n} (nie znaleziono deklaracji z ciałem)`));
  }
  // od końca; puste ciało „{}” ma otwarcie i zamknięcie pod tym samym indeksem — najpierw zamknięcie (każda wstawka
  // ląduje przed poprzednią), inaczej „} catch … finally …” stanie przed „in(); try {”
  wstawki.sort((a, b) => b[0] - a[0] || b[2] - a[2]);
  let wynik = tekst;
  for (const [i, s] of wstawki) wynik = wynik.slice(0, i) + s + wynik.slice(i);
  return { tekst: wynik, raport };
}

// Wywołania klientów innych systemów w kodzie (pola tych typów): przed instrukcją wstawiamy Diag.zew(system, cel) —
// cel to pierwszy literał tekstowy instrukcji (topik, kolejka, URL). Klienta (np. KafkaTemplate) nie da się owinąć proxy.
const KLIENCI = { KafkaTemplate: "KAFKA", ReactiveKafkaProducerTemplate: "KAFKA", RabbitTemplate: "RABBITMQ", AmqpTemplate: "RABBITMQ",
  JmsTemplate: "JMS", StreamBridge: "KOLEJKA", SqsTemplate: "SQS", RestTemplate: "HTTP", RestClient: "HTTP", WebClient: "HTTP" };
export function wstrzyknijWywolaniaKlientow(tekst) {
  const kod = maska(tekst);
  const pola = new Map();
  for (const m of kod.matchAll(/\b(\w+)\s*(?:<[^>;()]*>)?\s+(\w+)\s*[;=,)]/g)) if (KLIENCI[m[1]]) pola.set(m[2], KLIENCI[m[1]]);
  if (!pola.size) return { tekst, ile: 0 };
  const wstawki = [];
  const re = new RegExp(`\\b(?:this\\s*\\.\\s*)?(${[...pola.keys()].join("|")})\\s*\\.\\s*(send|sendDefault|convertAndSend|convertSendAndReceive|exchange|getForObject|getForEntity|postForObject|postForEntity|put|delete|execute|get|post|patch|method|publish)\\s*\\(`, "g");
  for (const m of kod.matchAll(re)) {
    // początek instrukcji: po ostatnim ; { } na tej samej głębokości (w masce — napisy nie przeszkadzają)
    let i = m.index, g = 0;
    for (; i > 0; i--) { const c = kod[i - 1]; if (c === ")" || c === "]") g++; else if (c === "(" || c === "[") { if (g === 0) break; g--; } else if (g === 0 && (c === ";" || c === "{" || c === "}")) break; }
    if (kod[i - 1] === "(") continue;                                                     // w środku wyrażenia (argument) — pomijamy
    const koniec = kod.indexOf(";", m.index);
    const instr = tekst.slice(m.index, koniec > 0 ? koniec : m.index + 200);
    const cel = /"((?:[^"\\]|\\.)*)"/.exec(instr)?.[1] ?? m[1];
    if (wstawki.some(w => w[0] === i)) continue;
    wstawki.push([i, ` flowlens.Diag.zew(${JSON.stringify(pola.get(m[1]))}, ${JSON.stringify(cel)});`]);
  }
  let wynik = tekst;
  for (const [i, s] of wstawki.sort((a, b) => b[0] - a[0])) wynik = wynik.slice(0, i) + s + wynik.slice(i);
  return { tekst: wynik, ile: wstawki.length };
}

// Rodzaj wejścia z adnotacji nad metodą (i @RequestMapping klasy)
const MAPOWANIE = /@(Get|Post|Put|Delete|Patch|Request)Mapping\b(?:\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?"?([^")]*)"?)?/;
function wejscieMetody(tekst, kod, nazwaKlasy, metoda) {
  const i = new RegExp(`\\b${metoda}\\s*\\(`).exec(kod)?.index;
  if (i == null) return null;
  // początek „nad metodą” liczony na masce: „}” w napisie (@GetMapping("/x/{id}")) nie jest końcem poprzedniej deklaracji
  const nad = tekst.slice(Math.max(0, kod.lastIndexOf(";", i), kod.lastIndexOf("}", i), kod.lastIndexOf("{", i)) + 1, i);
  const kl = new RegExp(`\\b(?:class|interface)\\s+${nazwaKlasy}\\b`).exec(kod);
  const nadKlasa = kl ? tekst.slice(0, kl.index).split(/\n\s*\n/).pop() : "";
  const m = MAPOWANIE.exec(nad);
  if (m) {
    const baza = MAPOWANIE.exec(nadKlasa)?.[2] || "";
    const http = { Get: "GET", Post: "POST", Put: "PUT", Delete: "DELETE", Patch: "PATCH", Request: "" }[m[1]];
    return { rodzaj: "http", http: http || null, sciezka: (baza + (m[2] || "")) || "/" };
  }
  if (/@Scheduled\b/.test(nad)) return { rodzaj: "job" };
  if (/@(KafkaListener|RabbitListener|JmsListener|SqsListener|StreamListener)\b/.test(nad + nadKlasa)) return { rodzaj: "kolejka" };
  if (/@(EventListener|TransactionalEventListener)\b/.test(nad)) return { rodzaj: "zdarzenie" };
  if (/@(WebMethod|PayloadRoot|SoapAction)\b/.test(nad) || /@WebService\b/.test(nadKlasa)) return { rodzaj: "soap" };
  return null;
}

// Interfejsy implementowane wprost przez klasę (proste nazwy): class X extends Y implements A, B<T> {
export function implementowane(kod, nazwaKlasy) {
  const m = new RegExp(`\\bclass\\s+${nazwaKlasy}\\b[^{;]*?\\bimplements\\b([^{;]*)\\{`).exec(kod);
  if (!m) return [];
  let t = m[1], p;
  while ((p = t.replace(/<[^<>]*>/g, "")) !== t) t = p;                     // bez parametrów typów
  return t.split(",").map(x => x.trim().split(/[.\s]/).filter(Boolean).pop()).filter(Boolean);
}

// Całość: repo (worktree) + mapa → zmienione pliki, pomocnik, autokonfiguracja. Zwraca raport.
export function wstrzyknijJava(katalog, mapa, { katalogDiag } = {}) {
  const poPliku = new Map();
  for (const [fqn, k] of Object.entries(mapa.klasy || {})) {
    if (!RYSOWANE.has(k.rola) || !k.metody?.length || !k.plik) continue;
    const plik = k.plik.replace(/:\d+$/, "");
    if (!plik.endsWith(".java")) continue;
    if (!poPliku.has(plik)) poPliku.set(plik, []);
    poPliku.get(plik).push({ fqn, nazwa: k.nazwa || fqn.split(/[.$]/).pop(), metody: k.metody, rola: k.rola, interfejs: !!k.interfejs });
  }
  const raport = { pliki: 0, metody: [], ostrzezenia: [], moduly: new Set() };
  const zaimplementowane = new Set();         // interfejsy, których implementacja z mapy dostała in/out w źródle
  for (const [plik, klasy] of poPliku) {
    const p = path.join(katalog, plik);
    if (!fs.existsSync(p)) { raport.ostrzezenia.push(`brak pliku ${plik}`); continue; }
    const tekst = fs.readFileSync(p, "utf8"), kod = maska(tekst);
    for (const k of klasy) if (k.rola === "wejscie") {
      k.wejscie = {};
      for (const m of k.metody) { const w = wejscieMetody(tekst, kod, k.nazwa, m); if (w) k.wejscie[m] = w; }
    }
    const w = wstrzyknijPlik(tekst, klasy);
    for (const k of klasy) if (w.raport.some(r => r.startsWith(k.fqn + "."))) for (const i of implementowane(kod, k.nazwa)) zaimplementowane.add(i);
    const z = wstrzyknijWywolaniaKlientow(w.tekst);
    raport.klienci = (raport.klienci || 0) + z.ile;
    if (z.tekst !== tekst) { fs.writeFileSync(p, z.tekst); raport.pliki++; }
    for (const r of w.raport) (r.startsWith("!") ? raport.ostrzezenia : raport.metody).push(r);
    const mod = plik.match(/^(.*?)src\/main\/java\//);
    if (mod) raport.moduly.add(mod[1]);
  }
  // repozytoria-interfejsy (Spring Data i podobne): bez ciała w źródle → owija je DiagSpring w runtime.
  // Port z implementacją w mapie (OwnerRepository ← JpaOwnerRepositoryImpl) już ma in/out w implementacji — bez drugiego kroku.
  const repoInterfejsy = [], repoMetody = [];
  raport.pominiete = [];
  for (const [fqn, k] of Object.entries(mapa.klasy || {})) {
    if (k.rola !== "repozytorium" || !k.plik?.includes(".java")) continue;
    const p = path.join(katalog, k.plik.replace(/:\d+$/, ""));
    if (!fs.existsSync(p)) continue;
    const nazwa = k.nazwa || fqn.split(".").pop();
    if (!new RegExp(`\\binterface\\s+${nazwa}\\b`).test(maska(fs.readFileSync(p, "utf8")))) continue;
    if (zaimplementowane.has(nazwa)) { raport.pominiete.push(fqn); continue; }
    repoInterfejsy.push(fqn);
    for (const m of k.metody || []) repoMetody.push(`${fqn}#${m}`);
    const mod = k.plik.match(/^(.*?)src\/main\/java\//);
    if (mod) raport.moduly.add(mod[1]);
  }
  raport.repozytoria = repoInterfejsy;
  // pomocnik + rejestracja w Springu w każdym module, do którego coś wstrzyknęliśmy
  const zrodla = path.join(TU, "java");
  for (const mod of raport.moduly) {
    const bud = budowanie(katalog, mod);
    const spring = /springframework/.test(bud.tekst), boot = uzywaBoota(bud.tekst);
    const servletApi = apiServletow(bud.tekst, zrodlaJava(path.join(katalog, mod, "src/main/java")));
    const cel = path.join(katalog, mod, "src/main/java/flowlens");
    fs.mkdirSync(cel, { recursive: true });
    for (const f of fs.readdirSync(path.join(zrodla, "flowlens"))) {
      let t = fs.readFileSync(path.join(zrodla, "flowlens", f), "utf8");
      if (f === "Diag.java") t = t.replace("@@KATALOG@@", (katalogDiag || ".flow-lens/diag").replace(/\\/g, "/"));
      if (f === "DiagSpring.java" && !spring) continue;
      fs.writeFileSync(path.join(cel, f), t);
    }
    fs.writeFileSync(path.join(cel, "DiagRepozytoria.java"), `package flowlens;\n\n/** flow-lens: repozytoria-interfejsy z mapy (wygenerowane przy wstrzyknięciu). */\nfinal class DiagRepozytoria {\n` +
      `    static final String[] KLASY = { ${repoInterfejsy.map(j).join(", ")} };\n    static final String[] METODY = { ${repoMetody.map(j).join(", ")} };\n    private DiagRepozytoria() {}\n}\n`);
    const diagWeb = () => fs.writeFileSync(path.join(cel, "DiagWeb.java"), szablonDiagWeb(fs.readFileSync(path.join(zrodla, "DiagWeb.java.szablon"), "utf8"), servletApi, spring));
    if (spring && !boot) {
      // Spring bez Boota (XML): jeden bean DiagSpring — w pliku, który definiuje DataSource (inne go importują)
      const xml = plikiXml(path.join(katalog, mod, "src/main")).map(f => ({ f, tx: fs.readFileSync(f, "utf8") })).filter(x => /<beans[\s>]/.test(bezKomentarzyXml(x.tx)));
      if (!xml.some(x => x.tx.includes("flowlens.DiagSpring"))) {
        const definiuja = xml.filter(x => definiujeDataSource(x.tx));
        for (const x of definiuja.length ? definiuja : xml.filter(x => /DataSource/.test(bezKomentarzyXml(x.tx)))) {
          fs.writeFileSync(x.f, dopiszBeanXml(x.tx)); raport.xml = [...(raport.xml || []), path.relative(katalog, x.f)];
        }
      }
    }
    const webXml = path.join(katalog, mod, "src/main/webapp/WEB-INF/web.xml");
    if (!spring) {
      // bez Springa (Jakarta EE): DataSource aplikacji z web.xml / @DataSourceDefinition → flowlens.DiagDataSource
      const zmien = (f, fn) => { const tx = fs.readFileSync(f, "utf8"), w = fn(tx); if (w.tekst !== tx) fs.writeFileSync(f, w.tekst);
        raport.dataSource = [...(raport.dataSource || []), ...w.owiniete.map(n => `${path.relative(katalog, f)}: ${n}`)];
        raport.ostrzezenia.push(...w.pominiete.map(n => `! DataSource ${n} w ${path.relative(katalog, f)} bez owinięcia`)); };
      if (fs.existsSync(webXml)) zmien(webXml, owinDataSourceWebXml);
      for (const f of plikiJava(path.join(katalog, mod, "src/main/java"))) if (/@DataSourceDefinition\b/.test(fs.readFileSync(f, "utf8"))) zmien(f, owinDataSourceDefinition);
    }
    if (servletApi && !boot && fs.existsSync(webXml)) {
      diagWeb();
      const tx = fs.readFileSync(webXml, "utf8");
      if (!tx.includes("flowlens.DiagWeb")) { fs.writeFileSync(webXml, dopiszFiltrWebXml(tx)); raport.web = servletApi; }
    } else if (servletApi && !boot && aplikacjaWebowa(katalog, mod, bud.tekst)) {
      // Servlet 3+ bez web.xml (WebApplicationInitializer / adnotacje): filtr rejestruje ServletContainerInitializer
      diagWeb();
      fs.writeFileSync(path.join(cel, "DiagWebInit.java"), szablonDiagWebInit(servletApi, /spring-web(?:mvc)?\b/.test(bud.tekst)));
      dopiszLinie(path.join(katalog, mod, `src/main/resources/META-INF/services/${servletApi}.ServletContainerInitializer`), "flowlens.DiagWebInit");
      raport.web = servletApi;
    }
    if (spring && boot) {
      const zasoby = path.join(katalog, mod, "src/main/resources/META-INF");
      dopiszLinie(path.join(zasoby, "spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports"), "flowlens.DiagSpring");
      dopiszSpringFactories(path.join(zasoby, "spring.factories"), "flowlens.DiagSpring");
      // aplikacja webowa (serwlety): filtr z granicami requestu — jakarta (Boot 3) albo javax (Boot 1/2)
      if (servletApi) {
        diagWeb();
        dopiszLinie(path.join(zasoby, "spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports"), "flowlens.DiagWeb");
        dopiszSpringFactories(path.join(zasoby, "spring.factories"), "flowlens.DiagWeb");
        raport.web = servletApi;
      }
    }
  }
  raport.moduly = [...raport.moduly];
  return raport;
}

// Pliki budowania: korzeń + moduł (Maven/Gradle), bez komentarzy — adres w komentarzu („…/spring-boot/…”) to nie zależność
function budowanie(katalog, mod = "") {
  const pliki = [...new Set(["", mod].map(m => path.join(katalog, m)))].flatMap(d => ["pom.xml", "build.gradle", "build.gradle.kts"].map(f => path.join(d, f))).filter(fs.existsSync);
  return { tekst: pliki.map(f => f.endsWith(".xml") ? bezKomentarzyXml(fs.readFileSync(f, "utf8")) : bezKomentarzyGradle(fs.readFileSync(f, "utf8"))).join("\n") };
}
export const bezKomentarzyXml = t => t.replace(/<!--[\s\S]*?(?:-->|$)/g, m => m.replace(/[^\n]/g, " "));
const bezKomentarzyGradle = t => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

// Spring Boot = zależność/wtyczka Boota (starter, autokonfiguracja, spring-boot-maven-plugin, plugin gradle), nie sam BOM
export function uzywaBoota(bud) {
  return /spring-boot-starter|spring-boot-autoconfigure|spring-boot-maven-plugin|['"]org\.springframework\.boot['"]|plugin:\s*['"]spring-boot['"]/.test(bud);
}

// API serwletów (javax | jakarta) albo null, gdy aplikacja nie jest webowa (serwletowa). Źródła: importy w kodzie,
// wersja Boota (>= 3 → jakarta), wersja artefaktu API (jakarta.servlet-api 4.x ma jeszcze pakiet javax), Spring 6+.
// Platforma Jakarta EE / Java EE (jakartaee-api, javaee-api, profil web) zawiera serwlety, choć kod ich nie importuje (JSF,
// JAX-RS); profil core (jakartaee-core-api) — nie. Samo <packaging>war nie wystarcza: API serwletów może nie być na
// ścieżce kompilacji, a DiagWeb musi się skompilować.
const PLATFORMA_EE = /jakarta\.jakartaee-(?:web-)?api\b|\bjavaee-(?:web-)?api\b/;
export function apiServletow(bud, zrodla = "") {
  const webowy = /spring-boot-starter-(?:web|webmvc|hateoas|data-rest|jersey|tomcat|jetty|undertow|web-services)\b|<artifactId>spring-webmvc<|spring-webmvc['":]|tomcat-embed-core|servlet-api|jakarta\.servlet|javax\.servlet|jersey-container-servlet/.test(bud)
    || PLATFORMA_EE.test(bud) || /^\s*import\s+(?:javax|jakarta)\.servlet\./m.test(zrodla);
  if (!webowy) return null;
  const jakarta = (zrodla.match(/^\s*import\s+jakarta\.servlet\./gm) || []).length, javax = (zrodla.match(/^\s*import\s+javax\.servlet\./gm) || []).length;
  if (jakarta !== javax) return jakarta > javax ? "jakarta.servlet" : "javax.servlet";
  const boot = wersja(bud, /spring-boot-(?:starter-parent|dependencies)<\/artifactId>\s*<version>([^<]+)/) || /org\.springframework\.boot['"]?\)?\s*version\s*['"](\d+)/.exec(bud)?.[1] || wersja(bud, /<spring-boot\.version>([^<]+)/);
  if (boot) return boot >= 3 ? "jakarta.servlet" : "javax.servlet";
  const api = wersja(bud, /<artifactId>jakarta\.servlet-api<\/artifactId>\s*<version>([^<]+)/) || Number(/jakarta\.servlet:jakarta\.servlet-api:(\d+)/.exec(bud)?.[1]) || null;
  if (api) return api >= 5 ? "jakarta.servlet" : "javax.servlet";
  if (/javax\.servlet-api|<artifactId>servlet-api</.test(bud)) return "javax.servlet";
  // Jakarta EE 9+ → jakarta (EE 8 to jeszcze javax, choć już pod nazwą jakarta.jakartaee-api); Java EE → javax
  const ee = wersja(bud, /<artifactId>jakarta\.jakartaee-(?:web-)?api<\/artifactId>\s*<version>([^<]+)/) || Number(/jakarta\.jakartaee-(?:web-)?api:(\d+)/.exec(bud)?.[1]) || null;
  if (ee) return ee >= 9 ? "jakarta.servlet" : "javax.servlet";
  if (/\bjavaee-(?:web-)?api\b/.test(bud)) return "javax.servlet";
  const spring = wersja(bud, /<artifactId>spring-(?:webmvc|web|context|framework-bom)<\/artifactId>\s*<version>([^<]+)/) || wersja(bud, /<spring(?:-framework|framework)?\.version>([^<]+)/);
  if (spring) return spring >= 6 ? "jakarta.servlet" : "javax.servlet";
  // bez wersji (BOM): pakiety EE w importach kodu (CDI, EJB, JPA, JAX-RS, JSF…)
  const EE = "(?:ejb|inject|persistence|faces|ws\\.rs|enterprise|transaction|jms|batch|json|websocket|security\\.enterprise)\\.";
  const eeJakarta = (zrodla.match(new RegExp(`^\\s*import\\s+jakarta\\.${EE}`, "gm")) || []).length, eeJavax = (zrodla.match(new RegExp(`^\\s*import\\s+javax\\.${EE}`, "gm")) || []).length;
  if (eeJakarta !== eeJavax) return eeJakarta > eeJavax ? "jakarta.servlet" : "javax.servlet";
  return /jakarta\.servlet|jakarta\.jakartaee/.test(bud) ? "jakarta.servlet" : "javax.servlet";
}
// wersja główna z dopasowania, także z właściwości ${…} w <properties>
function wersja(bud, re) {
  let v = re.exec(bud)?.[1]?.trim();
  for (let i = 0; v && i < 3 && /^\$\{(.+)\}$/.test(v); i++) { const k = v.slice(2, -1); v = new RegExp(`<${k.replace(/\./g, "\\.")}>([^<]+)</`).exec(bud)?.[1]?.trim(); }
  const n = Number(/^(\d+)/.exec(v || "")?.[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function zrodlaJava(kat) {
  const wynik = [];
  (function chodz(d) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== "flowlens") chodz(p); } else if (f.name.endsWith(".java")) wynik.push(...(fs.readFileSync(p, "utf8").match(/^\s*import\s+[\w.*]+\s*;/gm) || [])); } })(kat);
  return wynik.join("\n");
}
function aplikacjaWebowa(katalog, mod, bud) {
  return /<packaging>\s*war\s*</.test(bud) || /\bid\s*\(?\s*['"]war['"]|apply\s+plugin:\s*['"]war['"]|^\s*war\b/m.test(bud) || fs.existsSync(path.join(katalog, mod, "src/main/webapp"));
}

function szablonDiagWeb(t, servlet, spring) {
  t = t.replaceAll("@@SERVLET@@", servlet);
  // bez Springa: bez Ordered (kolejność i tak daje web.xml / inicjalizator)
  if (!spring) t = t.replace(/^import org\.springframework\.core\.Ordered;\n/m, "").replace(/, Ordered \{/, " {").replace(/^\s*@Override public int getOrder\(\).*\n/m, "");
  return t;
}
// Servlet 3+ bez web.xml: ServletContainerInitializer z META-INF/services, a ze spring-web także WebApplicationInitializer
// (pierwszy w kolejności, wykrywany przez SpringServletContainerInitializer). Co zadziała drugie, dostaje null z addFilter.
function szablonDiagWebInit(servlet, springWeb) {
  return `package flowlens;

import java.util.EnumSet;
import java.util.Set;
import ${servlet}.DispatcherType;
import ${servlet}.FilterRegistration;
import ${servlet}.ServletContainerInitializer;
import ${servlet}.ServletContext;

/** flow-lens: filtr DiagWeb bez web.xml (Servlet 3+) — przed filtrami aplikacji. */
public class DiagWebInit implements ServletContainerInitializer${springWeb ? ", org.springframework.web.WebApplicationInitializer, org.springframework.core.Ordered" : ""} {
    @Override public void onStartup(Set<Class<?>> klasy, ServletContext ctx) { onStartup(ctx); }
${springWeb ? "    @Override public int getOrder() { return org.springframework.core.Ordered.HIGHEST_PRECEDENCE; }\n    @Override\n" : ""}    public void onStartup(ServletContext ctx) {
        if (ctx.getFilterRegistration("flowlens") != null) return;
        FilterRegistration.Dynamic f = ctx.addFilter("flowlens", new DiagWeb());
        if (f != null) f.addMappingForUrlPatterns(EnumSet.of(DispatcherType.REQUEST), false, "/*");
    }
}
`;
}

// <data-source> w web.xml (Jakarta EE, bez Springa): class-name → flowlens.DiagDataSource, oryginał we właściwości
// flowlensKlasa (także „${db.driverClass}” — Maven podstawi go w obu miejscach). Pomijamy XA / ConnectionPool (inny typ
// zasobu) i definicje z <property>: DiagDataSource ma settery tylko standardowych właściwości, reszta by przepadła.
const NIE_OWIJAJ_DS = /XADataSource$|ConnectionPoolDataSource$/;
export function owinDataSourceWebXml(tx) {
  const t = bezKomentarzyXml(tx), owiniete = [], pominiete = [], zmiany = [];
  for (const m of t.matchAll(/<data-source\b[^>]*>([\s\S]*?)<\/data-source>/g)) {
    const nazwa = /<name>\s*([^<]*?)\s*<\/name>/.exec(m[1])?.[1] || "?";
    const k = /<class-name>\s*([^<]*?)\s*<\/class-name>/.exec(m[1]);
    if (!k || k[1] === "flowlens.DiagDataSource") continue;
    if (NIE_OWIJAJ_DS.test(k[1]) || /<property\b/.test(m[1])) { pominiete.push(nazwa); continue; }
    const od = m.index + m[0].indexOf(m[1]) + k.index, kl = k[0];
    zmiany.push([od, od + kl.length, `<class-name>flowlens.DiagDataSource</class-name>`]);
    // <property> po password (kolejność z XSD: … url, user, password, property*, login-timeout, pule …)
    const przed = [...m[1].matchAll(/<\/(?:description|name|class-name|server-name|port-number|database-name|url|user|password)>/g)].at(-1);
    const kon = m.index + m[0].indexOf(m[1]) + przed.index + przed[0].length;
    zmiany.push([kon, kon, `<property><name>flowlensKlasa</name><value>${k[1]}</value></property><!-- flow-lens -->`]);
    owiniete.push(nazwa);
  }
  let wynik = tx;
  for (const [a, b, s] of zmiany.sort((x, y) => y[0] - x[0])) wynik = wynik.slice(0, a) + s + wynik.slice(b);
  return { tekst: wynik, owiniete, pominiete };
}
// @DataSourceDefinition(name = "…", className = "…", url = "…") w kodzie — to samo przez className i properties
export function owinDataSourceDefinition(tekst) {
  const kod = maska(tekst), owiniete = [], pominiete = [], zmiany = [];
  for (const m of kod.matchAll(/@(?:[\w.]+\.)?DataSourceDefinition\s*\(/g)) {
    const o = m.index + m[0].length - 1, z = zamykajacyNawias(kod, o);
    if (z < 0) continue;
    const wn = tekst.slice(o, z + 1), nazwa = /\bname\s*=\s*"([^"]*)"/.exec(wn)?.[1] || "?";
    const k = /\bclassName\s*=\s*"([^"]*)"/.exec(wn);
    if (!k || k[1] === "flowlens.DiagDataSource") continue;
    if (NIE_OWIJAJ_DS.test(k[1]) || /\bproperties\s*=/.test(kod.slice(o, z + 1))) { pominiete.push(nazwa); continue; }
    zmiany.push([o + k.index, o + k.index + k[0].length, `className = "flowlens.DiagDataSource"`]);
    zmiany.push([z, z, `, properties = { ${j("flowlensKlasa=" + k[1])} }`]);
    owiniete.push(nazwa);
  }
  let wynik = tekst;
  for (const [a, b, s] of zmiany.sort((x, y) => y[0] - x[0])) wynik = wynik.slice(0, a) + s + wynik.slice(b);
  return { tekst: wynik, owiniete, pominiete };
}
function plikiJava(kat) {
  const wynik = [];
  (function chodz(d) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== "flowlens") chodz(p); } else if (f.name.endsWith(".java")) wynik.push(p); } })(kat);
  return wynik;
}

// Kontekst Springa (XML) definiuje DataSource: <bean class="…DataSource">, <jdbc:embedded-database>, <jee:jndi-lookup id="dataSource">
export function definiujeDataSource(tx) {
  const t = bezKomentarzyXml(tx);
  return /<bean\b[^>]*\bclass\s*=\s*"[^"]*DataSource"/.test(t) || /<[\w-]+:embedded-database\b/.test(t) || /<[\w-]+:jndi-lookup\b[^>]*(?:ata[sS]ource|DataSource)/.test(t);
}
// <bean> zaraz po otwarciu głównego <beans> (po <description>) — XSD nie pozwala na <bean> po zagnieżdżonych <beans profile>
export function dopiszBeanXml(tx) {
  const t = bezKomentarzyXml(tx);
  const m = /<beans\b[^>]*>/.exec(t);
  if (!m) return tx;
  let i = m.index + m[0].length;
  const opis = /^\s*<description\b[\s\S]*?<\/description>/.exec(t.slice(i));
  if (opis) i += opis[0].length;
  return tx.slice(0, i) + `\n    <!-- flow-lens: log diagnostyczny (DataSource, repozytoria) -->\n    <bean class="flowlens.DiagSpring"/>` + tx.slice(i);
}
// filtr jako pierwszy w <web-app> — szukanym poza komentarzami (zakomentowany wariant nagłówka)
export function dopiszFiltrWebXml(tx) {
  const m = /<web-app\b[^>]*>/.exec(bezKomentarzyXml(tx));
  if (!m) return tx;
  const i = m.index + m[0].length;
  return tx.slice(0, i) + `\n    <!-- flow-lens: granice requestu (pierwszy filtr) -->\n    <filter><filter-name>flowlens</filter-name><filter-class>flowlens.DiagWeb</filter-class></filter>\n    <filter-mapping><filter-name>flowlens</filter-name><url-pattern>/*</url-pattern></filter-mapping>` + tx.slice(i);
}

function dopiszLinie(plik, linia) {
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  const t = fs.existsSync(plik) ? fs.readFileSync(plik, "utf8") : "";
  if (!t.split(/\r?\n/).includes(linia)) fs.writeFileSync(plik, (t && !t.endsWith("\n") ? t + "\n" : t) + linia + "\n");
}
function plikiXml(kat) {
  const wynik = [];
  (function chodz(d) { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) chodz(p); else if (f.name.endsWith(".xml") && f.name !== "web.xml") wynik.push(p); } })(kat);
  return wynik;
}
function dopiszSpringFactories(plik, klasa) {
  const klucz = "org.springframework.boot.autoconfigure.EnableAutoConfiguration";
  let t = fs.existsSync(plik) ? fs.readFileSync(plik, "utf8") : "";
  if (t.includes(klasa)) return;
  if (new RegExp(`^${klucz.replace(/\./g, "\\.")}=`, "m").test(t)) t = t.replace(new RegExp(`^(${klucz.replace(/\./g, "\\.")}=)`, "m"), `$1${klasa},\\\n`);
  else t = (t && !t.endsWith("\n") ? t + "\n" : t) + `${klucz}=${klasa}\n`;
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(plik, t);
}
