#!/usr/bin/env node
// Nagrywa film MP4 z jednego przebiegu demo: tura 2 („przeczytaj README i obrazek”) od promptu do końca tury,
// z otwieraniem szczegółów i rozwinięciem „dlaczego”. Uruchamia własny lens na wolnym porcie.
//   node ~/.claude/skills/harness-lens/nagraj-film.mjs [plik.mp4]
//   node ~/.claude/skills/harness-lens/nagraj-film.mjs plik.mp4 --przyklad campsite-co-robi.jsonl
//     inne nagranie z przyklady/: tura 1 od promptu do końca (najwyżej 3 obiegi pętli), na końcu plansza „…”
// Wymaga: ffmpeg i pakietu playwright (raz: npm i --prefix ~/.harness-lens/film playwright && npx --prefix ~/.harness-lens/film playwright install chromium).
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const argi = process.argv.slice(2), iP = argi.indexOf("--przyklad");
const PRZYKLAD = iP >= 0 ? argi[iP + 1] : "";
const WYJSCIE = path.resolve(argi.filter((a, i) => !a.startsWith("--") && (iP < 0 || i !== iP + 1))[0] || "harness-lens.mp4");
const PREFIX = path.join(os.homedir(), ".harness-lens", "film");
let chromium;
try { ({ chromium } = createRequire(path.join(PREFIX, "package.json"))("playwright")); }
catch { console.error(`Brak playwright. Zainstaluj raz:\n  npm i --prefix ${PREFIX} playwright && npx --prefix ${PREFIX} playwright install chromium`); process.exit(1); }

const wolnyPort = () => new Promise(r => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const czekaj = ms => new Promise(r => setTimeout(r, ms));

const port = await wolnyPort();
const lens = spawn(process.execPath, [path.join(TU, "lens.mjs")], { env: { ...process.env, LENS_PORT: String(port), LENS_NO_BROWSER: "1", ...(PRZYKLAD ? { LENS_PRZYKLAD: PRZYKLAD } : {}) }, stdio: "ignore" });
await czekaj(1200);

const W = 1600, H = 900;
const katalogWideo = fs.mkdtempSync(path.join(os.tmpdir(), "lens-film-"));
const przegladarka = await chromium.launch();
const kontekst = await przegladarka.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: katalogWideo, size: { width: W, height: H } } });
const strona = await kontekst.newPage();
try {
  await strona.goto(`http://localhost:${port}/_lens/`);
  await strona.waitForSelector(".tura .krok-os");
  await czekaj(800);

  const etap = async (pauza = 2300) => { await strona.click("#etap-dalej"); await czekaj(pauza); };
  const doEtapu = async (fraza, pauza) => {
    for (let n = 0; n < 40; n++) {
      if ((await strona.textContent(".linia-logu.biezaca .tytul").catch(() => "")).includes(fraza)) return;
      await etap(pauza);
    }
  };
  const szczegoly = async (selektor, czas = 3200) => {
    await strona.click(selektor, { force: true });
    await czekaj(czas);
    await strona.keyboard.press("Escape");
    await czekaj(700);
  };

  if (PRZYKLAD) {
    // tura 1 z innego nagrania: prompt → koperta → odpowiedź modelu → narzędzie → … najwyżej 3 obiegi, potem „…”
    await strona.click(".tura:nth-of-type(1) .krok-os:nth-of-type(1)");
    await czekaj(2000);
    for (let obieg = 1; obieg <= 3; obieg++) {
      await doEtapu("SKŁADAM KOPERTĘ");
      if (obieg === 1) { await czekaj(1000); await szczegoly("#s-stos .arkusz:last-of-type", 3800); }   // prompt człowieka
      await doEtapu("WRACA ODPOWIEDŹ");
      await czekaj(800);
      await szczegoly("#s-zwrotna");
      const tytul = await strona.textContent(".linia-logu.biezaca .tytul").catch(() => "");
      await etap(2300);
      if ((await strona.textContent(".linia-logu.biezaca .tytul").catch(() => "")).includes("KONIEC TURY") || /TEKST|ODPOWIADA/.test(tytul)) break;
    }
    await doEtapu("KONIEC TURY", 2100);
    await czekaj(1500);
    await strona.evaluate(() => {
      const d = document.createElement("div");
      d.textContent = "…";
      d.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,8,6,.78);color:#f1e9dd;font:600 160px/1 Fraunces,Georgia,serif;z-index:99999";
      document.body.appendChild(d);
    });
    await czekaj(2500);
  } else {
  // tura 2: „Przeczytaj README.md i docs/schemat.png…”
  await strona.click(".tura:nth-of-type(2) .krok-os:nth-of-type(1)");
  await czekaj(2000);
  await doEtapu("SKŁADAM KOPERTĘ");
  await czekaj(1200);
  await szczegoly("#s-koperta");                          // co jest w kopercie
  await doEtapu("WRACA ODPOWIEDŹ");
  await czekaj(800);
  await szczegoly("#s-zwrotna");                          // odpowiedź modelu: TOOL_USE
  await doEtapu("SPRAWDZAM");
  await strona.click(".linia-logu.biezaca button");       // rozwiń „dlaczego”
  await czekaj(3500);
  await doEtapu("WYNIK READ");
  await czekaj(1200);
  await szczegoly("#s-stos .arkusz:first-of-type", 3500); // pierwsza kartka: doklejki harnessu + prompt człowieka
  await doEtapu("KONIEC TURY", 2100);
  await czekaj(3000);
  }
} finally {
  await kontekst.close();
  await przegladarka.close();
  lens.kill();
}

const webm = fs.readdirSync(katalogWideo).find(f => f.endsWith(".webm"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(katalogWideo, webm), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", WYJSCIE]);
fs.rmSync(katalogWideo, { recursive: true, force: true });
console.log(`Film: ${WYJSCIE}`);
