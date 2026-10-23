#!/usr/bin/env node
// Rozpoznanie przed uruchomieniem: co jest w repo (języki, frameworki, dostęp do danych, logowanie, OTel, baza,
// sposób uruchomienia) i które tryby flow-lens da się tu sensownie użyć — z doświadczeniem z podobnych stosów.
//
//   node rozpoznaj.mjs [repo]            raport na stdout + <repo>/.flow-lens/rozpoznanie.json
//   node rozpoznaj.mjs [repo] --json     sam JSON
//
// Wiedza: wiedza/skladniki.json (jak rozpoznać składnik i czego nauczył korpus), doświadczenia:
// wiedza/doswiadczenia.json (publiczne repo, zmierzone względem wyroczni OTel) i ~/.flow-lens/doswiadczenia.json
// (potwierdzenia człowieka: potwierdz.mjs). Bez zależności, Node 18+.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
export const KATALOG = JSON.parse(fs.readFileSync(path.join(TU, "wiedza", "skladniki.json"), "utf8")).skladniki;
export const PLIK_DOSWIADCZEN = path.join(TU, "wiedza", "doswiadczenia.json");
export const PLIK_POTWIERDZEN = path.join(os.homedir(), ".flow-lens", "doswiadczenia.json");

const POMIN = new Set(["node_modules", ".git", "target", "build", "bin", "obj", "vendor", ".venv", "venv", "dist", ".flow-lens",
  ".codegraph", ".idea", ".gradle", "__pycache__", ".next", "coverage", "out"]);
const ROZSZERZENIA = { ".java": "java", ".kt": "java", ".cs": "csharp", ".ts": "node", ".tsx": "node", ".js": "node",
  ".mjs": "node", ".cjs": "node", ".py": "python", ".php": "php" };
// Pliki, które flow-lens/runda kładzie na wierzch klonu — nie są częścią aplikacji.
const NASZE = /flowlens|flow-lens/i;

function przejdz(repo, naPlik, max = 20000, pomijaj = new Set()) {
  let n = 0;
  const stos = [repo];
  while (stos.length && n < max) {
    const d = stos.pop();
    let wpisy;
    try { wpisy = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const w of wpisy) {
      if (NASZE.test(w.name)) continue;
      const p = path.join(d, w.name);
      if (pomijaj.has(path.relative(repo, p))) continue;
      if (w.isDirectory()) { if (!POMIN.has(w.name) && !w.name.startsWith(".")) stos.push(p); }
      else if (w.isFile()) { n++; naPlik(p, w.name); }
    }
  }
}

const czytaj = (p, limit = 400000) => { try { const s = fs.statSync(p); return s.size > limit ? "" : fs.readFileSync(p, "utf8"); } catch { return ""; } };

// Zależności z manifestów wszystkich technologii; nazwy małymi literami.
export function zaleznosciZPliku(nazwa, tekst) {
  const z = [];
  if (nazwa === "package.json") {
    try { const j = JSON.parse(tekst); for (const k of ["dependencies", "devDependencies", "peerDependencies"]) z.push(...Object.keys(j[k] || {})); } catch {}
  } else if (nazwa === "composer.json") {
    try { const j = JSON.parse(tekst); for (const k of ["require", "require-dev"]) z.push(...Object.keys(j[k] || {})); } catch {}
  } else if (nazwa === "pom.xml") {
    for (const m of tekst.matchAll(/<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g)) z.push(`${m[1]}:${m[2]}`, m[2]);
    for (const m of tekst.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) z.push(m[1]);
  } else if (/^build\.gradle(\.kts)?$/.test(nazwa)) {
    for (const m of tekst.matchAll(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)) z.push(`${m[1]}:${m[2]}`, m[2]);
  } else if (/^requirements.*\.txt$|\.in$/.test(nazwa) || nazwa === "Pipfile" || (nazwa.endsWith(".txt") && !/^(LICENSE|README|CHANGELOG)/i.test(nazwa))) {
    for (const l of tekst.split("\n")) { const m = l.trim().match(/^([A-Za-z0-9_.\-\[\]]+)\s*(?:[=<>~!]|$)/); if (m && !l.trim().startsWith("#")) z.push(m[1].replace(/\[.*\]/, "")); }
  } else if (nazwa === "pyproject.toml" || nazwa === "setup.py" || nazwa === "setup.cfg") {
    for (const m of tekst.matchAll(/["']([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?\s*(?:[=<>~!^][^"']*)?["']/g)) z.push(m[1]);
    for (const m of tekst.matchAll(/^([A-Za-z0-9_.\-]+)\s*=\s*["{]/gm)) z.push(m[1]);
  } else if (/\.(cs|fs|vb)proj$|^Directory\.Packages\.props$|^packages\.config$/.test(nazwa)) {
    for (const m of tekst.matchAll(/<Package(?:Reference|Version)\s+Include="([^"]+)"/g)) z.push(m[1]);
    for (const m of tekst.matchAll(/<package\s+id="([^"]+)"/g)) z.push(m[1]);
    const sdk = tekst.match(/<Project\s+Sdk="([^"]+)"/); if (sdk) z.push(`sdk:${sdk[1]}`);
  }
  return z.map(s => s.toLowerCase());
}

const MANIFEST = /^(package\.json|composer\.json|pom\.xml|build\.gradle(\.kts)?|requirements.*\.txt|Pipfile|pyproject\.toml|setup\.py|setup\.cfg|.*\.(cs|fs|vb)proj|Directory\.Packages\.props|packages\.config)$/;
const URUCHOMIENIE = /^(Dockerfile.*|.*\.dockerfile|(docker-)?compose.*\.ya?ml|Procfile|Makefile|.*\.sh|manage\.py|artisan|Program\.cs|launchSettings\.json)$/i;
const KONFIG_LOGOW = /^(logback.*\.xml|log4j2?.*\.(xml|properties)|logging\.properties|application.*\.(properties|ya?ml)|appsettings.*\.json|settings\.py|.*logging.*\.(ya?ml|json|ini|conf))$/i;

// Zbiera fakty o repo. Bez sieci, bez uruchamiania czegokolwiek.
// pomijaj: ścieżki względne, których nie liczymy (np. pliki, które runda treningowa kładzie na wierzch klonu).
export function zbierz(repo, pomijaj = new Set()) {
  const f = { repo, jezyki: {}, zaleznosci: new Set(), manifesty: [], uruchomienie: [], konfigLogow: [], obrazy: new Set(), kod: "", tekstUruchomienia: "", pliki: new Set() };
  let kodLimit = 3_000_000;
  przejdz(repo, (p, nazwa) => {
    const wzgl = path.relative(repo, p);
    f.pliki.add(nazwa);
    const roz = path.extname(nazwa).toLowerCase();
    const j = ROZSZERZENIA[roz];
    if (j && !/\.(min|d)\.[cm]?[jt]s$/.test(nazwa)) {
      f.jezyki[j] = (f.jezyki[j] || 0) + 1;
      if (kodLimit > 0) { const t = czytaj(p, 200000); kodLimit -= t.length; f.kod += "\n" + t; }
    }
    if (MANIFEST.test(nazwa) || (/\.(txt|in)$/.test(nazwa) && /(^|\/)requirements\//.test(wzgl))) { f.manifesty.push(wzgl); for (const z of zaleznosciZPliku(nazwa, czytaj(p))) f.zaleznosci.add(z); }
    if (URUCHOMIENIE.test(nazwa) && !/test/i.test(wzgl)) {
      f.uruchomienie.push(wzgl);
      const t = czytaj(p, 200000);
      f.tekstUruchomienia += "\n" + t;
      for (const m of t.matchAll(/^\s*(?:image:|FROM)\s+([^\s#]+)/gim)) f.obrazy.add(m[1].toLowerCase());
    }
    if (KONFIG_LOGOW.test(nazwa)) { f.konfigLogow.push(wzgl); f.tekstUruchomienia += "\n" + czytaj(p, 200000); }
    if (["web.xml", "persistence.xml", "domain.xml", "schema.prisma", ".env.example"].includes(nazwa)) f.tekstUruchomienia += "\n" + czytaj(p, 200000);
  }, 20000, pomijaj);
  // .NET: Microsoft.NET.Sdk.Web = ASP.NET Core bez jawnej paczki.
  f.git = fs.existsSync(path.join(repo, ".git"));
  f.codegraph = fs.existsSync(path.join(repo, ".codegraph"));
  f.mapa = fs.existsSync(path.join(repo, ".flow-lens", "mapa.json"));
  return f;
}

const rx = s => new RegExp(s, "i");

export function rozpoznajSkladniki(f) {
  const jezyki = new Set(Object.keys(f.jezyki));
  const zal = [...f.zaleznosci];
  const znalezione = [];
  for (const s of KATALOG) {
    if (s.bez) continue;
    if (s.jezyk && !jezyki.has(s.jezyk)) continue;
    const dowody = [];
    for (const r of s.zal || []) { const z = zal.find(x => rx(r).test(x)); if (z) { dowody.push(`zależność ${z}`); break; } }
    for (const nazwa of s.pliki || []) if (f.pliki.has(nazwa)) { dowody.push(`plik ${nazwa}`); break; }
    for (const r of s.obraz || []) { const o = [...f.obrazy].find(x => rx(r).test(x)); if (o) { dowody.push(`obraz ${o}`); break; } }
    if (!dowody.length) for (const r of s.kod || []) { const m = (f.kod + f.tekstUruchomienia).match(rx(r)); if (m) { dowody.push(`kod „${m[0].slice(0, 40)}”`); break; } }
    if (dowody.length) znalezione.push({ id: s.id, nazwa: s.nazwa, rodzaj: s.rodzaj, jezyk: s.jezyk, dowody });
  }
  // Składniki „z braku” (np. PHP bez dużego frameworka).
  for (const s of KATALOG.filter(s => s.bez)) {
    if (s.jezyk && !jezyki.has(s.jezyk)) continue;
    if (!s.bez.some(id => znalezione.some(z => z.id === id))) znalezione.push({ id: s.id, nazwa: s.nazwa, rodzaj: s.rodzaj, jezyk: s.jezyk, dowody: ["brak znanego frameworka"] });
  }
  // Składnik wykluczony przez inny (Spring bez Boota, gdy jest Boot).
  return znalezione.filter(z => !(opisSkl(z.id).nie_gdy || []).some(id => znalezione.some(x => x.id === id)));
}

const jest = (sk, id) => sk.some(s => s.id === id);
const opisSkl = id => KATALOG.find(s => s.id === id) || {};

// Który tryb flow-lens da się tu użyć i czego wymaga. status: tak | wymaga | czesciowo | nie.
export function planTrybow(f, sk) {
  const jezyki = Object.entries(f.jezyki).sort((a, b) => b[1] - a[1]).filter(([, n], i, t) => n >= Math.max(3, t[0][1] * 0.1)).map(([j]) => j);
  const glowny = jezyki[0];
  const otelWKodzie = sk.some(s => s.rodzaj === "otel") || /OTEL_EXPORTER|opentelemetry-javaagent|-javaagent:\S*opentelemetry/i.test(f.tekstUruchomienia);
  const tryby = [];
  const dodaj = (id, nazwa, status, co, wymaga = []) => tryby.push({ id, nazwa, status, co, wymaga });

  // OTel
  if (glowny === "java") dodaj("otel", "OTel", "tak", "agent Javy pobierany sam; metody klas z mapy, SQL, HTTP, transakcje",
    jest(sk, "payara") ? ["serwer z własnym OTel: flow.mjs sam wyłącza most opentelemetry-api"] : []);
  else if (glowny === "python" || glowny === "node") dodaj("otel", "OTel", otelWKodzie ? "tak" : "wymaga",
    "metody klas daje flow-lens, SQL i HTTP auto-instrumentacja", otelWKodzie ? [] : [`pakiety OTel w środowisku aplikacji (${glowny === "python" ? "opentelemetry-distro + bootstrap" : "@opentelemetry/auto-instrumentations-node"})`]);
  else if (glowny === "csharp") dodaj("otel", "OTel", "czesciowo", "auto-instrumentacja .NET: wejście, SQL, HTTP — bez metod klas; pełny obraz z kopią (OTel + metody z kopii)",
    ["auto-instrumentacja .NET (OTEL_DOTNET_AUTO_*)"]);
  else if (glowny === "php") dodaj("otel", "OTel", otelWKodzie ? "tak" : "wymaga", "hak flow-lens daje metody klas, PDO/mysqli, HTTP",
    otelWKodzie ? [] : ["rozszerzenie PECL opentelemetry"]);

  // Log diagnostyczny
  if (glowny === "java" || glowny === "csharp") dodaj("diag", "wstrzyknięty log diagnostyczny", f.git ? "tak" : "wymaga",
    "kopia w git worktree z in/out metod klas z mapy, SQL i transakcjami; build i testy kopii jako bramka",
    [...(f.git ? [] : ["repozytorium git (kopia to worktree)"]), "polecenie budowania"]);
  else if (glowny === "python" || glowny === "node") dodaj("diag", "log diagnostyczny w runtime", "tak", "bez zmian w kodzie: flow.mjs --bez-otel -- <start>",
    glowny === "node" && jest(sk, "fastify") ? ["Fastify: klasy-dekoratory tylko z polem „dekorator” w mapie"] : []);
  else if (glowny === "php") dodaj("diag", "hak PHP (auto_prepend_file)", "wymaga", "bez zmian w kodzie; metody z mapy, PDO, mysqli, Guzzle, curl",
    ["rozszerzenie PECL opentelemetry", "wpisy w php.ini (auto_prepend_file, FLOWLENS_MAPA, FLOWLENS_DIAG)"]);

  // Logi frameworka
  const zLogami = sk.map(s => opisSkl(s.id)).filter(s => s.log_app);
  const bezGranic = jest(sk, "nest");
  dodaj("log_app", "logi frameworka (+ szkielet)", zLogami.length ? (bezGranic ? "czesciowo" : "tak") : "nie",
    zLogami.length ? "wejście, SQL, transakcje z logów, które aplikacja już pisze; klasy tylko ze szkieletu" : "nie znamy formatu logów tego stosu",
    zLogami.map(s => `${s.nazwa}: ${s.log_app}`).concat(bezGranic ? ["Nest nie loguje granic requestów — potrzebny access log albo middleware"] : []));

  // Log bazy
  const bazy = sk.filter(s => s.rodzaj === "baza");
  const serwer = bazy.filter(s => s.id !== "w-pamieci");
  if (serwer.length) dodaj("log_bazy", "log bazy", serwer.some(s => s.id === "sqlserver") && serwer.length === 1 ? "czesciowo" : "tak",
    "SQL, który baza naprawdę wykonała, z parametrami; działa dla każdej technologii", serwer.map(s => `${s.nazwa}: ${opisSkl(s.id).log_bazy}`));
  else dodaj("log_bazy", "log bazy", "nie", bazy.length ? "baza w pamięci albo plikowa — nie ma logu serwera" : "nie wykryto bazy (może to aplikacja bez bazy)", []);

  // Szkielet i hybryda
  dodaj("szkielet", "szkielet CodeGraph", f.codegraph ? "tak" : "wymaga", "którędy możliwie (ścieżki wywołań z kodu)", f.codegraph ? [] : ["indeks CodeGraph (codegraph init — decyzja użytkownika)"]);
  const logBazy = tryby.find(t => t.id === "log_bazy").status !== "nie";
  dodaj("hybryda", "hybryda: log bazy + granice + szkielet", logBazy && f.codegraph ? "tak" : logBazy ? "wymaga" : "nie",
    "„którędy prawdopodobnie, co na pewno w bazie” — bez żadnej zmiany w aplikacji",
    [...(logBazy ? [] : ["log bazy"]), ...(f.codegraph ? [] : ["indeks CodeGraph"]), "granice requestów: access log (--dostep-log) albo logi frameworka"]);
  return { jezyki, glowny, otelWKodzie, tryby };
}

// Doświadczenia z podobnych stosów. Liczą się tylko zmierzone względem niezależnej wyroczni OTel albo potwierdzone
// przez człowieka; reszta (np. przypadki napisane przez agenta) nie wchodzi do rekomendacji.
export function wczytajDoswiadczenia() {
  const wynik = [];
  for (const plik of [PLIK_DOSWIADCZEN, PLIK_POTWIERDZEN]) {
    try { wynik.push(...JSON.parse(fs.readFileSync(plik, "utf8")).doswiadczenia); } catch {}
  }
  return wynik.filter(d => d.zrodlo === "czlowiek" || (d.zrodlo === "otel" && d.wyrocznia_niezalezna !== false));
}

export function podobne(sk, doswiadczenia, ile = 3) {
  const ja = new Set(sk.filter(s => !["otel", "baza"].includes(s.rodzaj)).map(s => s.id));
  if (!ja.size) return [];
  return doswiadczenia.map(d => {
    const on = new Set(d.skladniki.filter(id => !["otel", "baza"].includes(opisSkl(id).rodzaj)));
    const wspolne = [...ja].filter(x => on.has(x)).length;
    return { ...d, podobienstwo: wspolne / new Set([...ja, ...on]).size };
  }).filter(d => d.podobienstwo > 0).sort((a, b) => b.podobienstwo - a.podobienstwo || (b.zrodlo === "czlowiek") - (a.zrodlo === "czlowiek")).slice(0, ile);
}

// Kolejność: tryb z pełnym śladem wykonania, który tu działa, potem coraz mniej inwazyjne i coraz mniej pewne.
export function rekomendacja(plan) {
  const t = Object.fromEntries(plan.tryby.map(x => [x.id, x]));
  const kolejka = [];
  if (t.otel?.status === "tak") kolejka.push(["otel", "pełny ślad wykonania; ten sam przebieg posłuży potem jako wyrocznia dla trybów bez OTel"]);
  if (t.diag && t.diag.status !== "nie") kolejka.push(["diag", "gdy OTel nie wchodzi w grę: ślad wykonania bez agenta"]);
  if (t.otel?.status === "wymaga") kolejka.push(["otel", `po doinstalowaniu (${t.otel.wymaga.join("; ")}): pełny ślad i wyrocznia dla pozostałych trybów`]);
  if (t.otel?.status === "czesciowo") kolejka.push(["otel", "bez metod klas; jako wyrocznia dla SQL i wejść"]);
  if (t.hybryda?.status !== "nie") kolejka.push(["hybryda", "bez zmian w aplikacji, gdy wystarczy „co poszło do bazy”"]);
  if (t.log_app?.status !== "nie") kolejka.push(["log_app", "gdy są tylko logi produkcyjne; klasy będą zgadywane ze szkieletu"]);
  return kolejka;
}

export function rozpoznaj(repo) {
  const f = zbierz(repo);
  const skladniki = rozpoznajSkladniki(f);
  const plan = planTrybow(f, skladniki);
  const doswiadczenia = podobne(skladniki, wczytajDoswiadczenia());
  const uwagi = skladniki.flatMap(s => (opisSkl(s.id).uwagi || []).map(u => `${s.nazwa}: ${u}`));
  return {
    repo: path.resolve(repo), data: new Date().toISOString().slice(0, 10),
    jezyki: f.jezyki, glowny: plan.glowny, skladniki, otel_w_aplikacji: plan.otelWKodzie,
    uruchomienie: f.uruchomienie.slice(0, 15), konfig_logow: f.konfigLogow.slice(0, 15), manifesty: f.manifesty.slice(0, 15),
    git: f.git, codegraph: f.codegraph, mapa: f.mapa,
    tryby: plan.tryby, rekomendacja: rekomendacja(plan), uwagi, doswiadczenia,
  };
}

const ZNAK = { tak: "✓", wymaga: "…", czesciowo: "½", nie: "✗" };
const pr = x => x == null ? "—" : Math.round(x * 100) + "%";

export function raport(r) {
  const o = [];
  o.push(`# Rozpoznanie: ${path.basename(r.repo)}`, "");
  const kodu = Object.values(r.jezyki).reduce((a, b) => a + b, 0);
  if (kodu < 20) o.push(`> Tylko ${kodu} plików kodu — to raczej nie katalog aplikacji (sprawdź ścieżkę).`, "");
  o.push(`Języki (pliki): ${Object.entries(r.jezyki).sort((a, b) => b[1] - a[1]).map(([j, n]) => `${j} ${n}`).join(", ") || "—"}`);
  for (const rodz of ["framework", "serwer", "orm", "sterownik", "kolejka", "log", "otel", "baza"]) {
    const s = r.skladniki.filter(x => x.rodzaj === rodz);
    if (s.length) o.push(`- ${rodz}: ${s.map(x => `${x.nazwa} (${x.dowody[0]})`).join("; ")}`);
  }
  o.push(`- OTel w aplikacji: ${r.otel_w_aplikacji ? "tak" : "nie"}; git: ${r.git ? "tak" : "nie"}; CodeGraph: ${r.codegraph ? "tak" : "nie"}; mapa: ${r.mapa ? "jest" : "brak"}`);
  if (r.uruchomienie.length) o.push(`- uruchomienie: ${r.uruchomienie.slice(0, 6).join(", ")}`);
  if (r.konfig_logow.length) o.push(`- konfiguracja logów: ${r.konfig_logow.slice(0, 6).join(", ")}`);
  o.push("", "## Tryby", "");
  for (const t of r.tryby) {
    o.push(`${ZNAK[t.status]} **${t.nazwa}** — ${t.co}`);
    for (const w of t.wymaga) o.push(`    - ${w}`);
  }
  if (r.uwagi.length) { o.push("", "## Na co uważać (z korpusu)", ""); for (const u of r.uwagi) o.push(`- ${u}`); }
  o.push("", "## Podobne stosy", "");
  if (!r.doswiadczenia.length) o.push("Brak sprawdzonych doświadczeń z podobnym stosem — po uruchomieniu zapytaj, czy przebieg ma sens, i zapisz (potwierdz.mjs).");
  for (const d of r.doswiadczenia) {
    o.push(`- ${d.repo} (${d.skladniki.map(id => opisSkl(id).nazwa || id).join(", ")}; ${d.zrodlo === "czlowiek" ? "potwierdził człowiek" : "zmierzone względem OTel"}, ${d.data}):`);
    for (const [tryb, m] of Object.entries(d.tryby || {})) {
      if (d.zrodlo === "czlowiek") o.push(`    - ${tryb}: ${m.ocena}${m.uwaga ? ` — ${m.uwaga}` : ""}`);
      else o.push(`    - ${tryb}: ścieżka ${pr(m.sciezka)}, klasy ${pr(m.klasyRecall)}, SQL ${pr(m.sqlRecall)}, transakcje ${pr(m.txLiczba)} (${m.pary} par, ${m.brak} brak)`);
    }
  }
  o.push("", "## Proponowana kolejność", "");
  r.rekomendacja.forEach(([id, dlaczego], i) => o.push(`${i + 1}. ${r.tryby.find(t => t.id === id).nazwa} — ${dlaczego}`));
  return o.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = process.argv.slice(2);
  const repo = path.resolve(arg.find(a => !a.startsWith("--")) || ".");
  const r = rozpoznaj(repo);
  try { fs.mkdirSync(path.join(repo, ".flow-lens"), { recursive: true }); fs.writeFileSync(path.join(repo, ".flow-lens", "rozpoznanie.json"), JSON.stringify(r, null, 1)); } catch {}
  console.log(arg.includes("--json") ? JSON.stringify(r, null, 1) : raport(r));
}
