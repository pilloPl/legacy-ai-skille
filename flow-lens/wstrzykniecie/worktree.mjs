// Wstrzyknięcie w kopii: git worktree <repo>/.flow-lens/diag-worktree na gałęzi flowlens-diag (od HEAD). Katalog
// roboczy użytkownika zostaje nietknięty; niezacommitowane zmiany NIE trafiają do kopii (ostrzegamy).
//   node flow.mjs wstrzyknij            → worktree + log diagnostyczny + commit na flowlens-diag
//   node flow.mjs usun-wstrzykniecie    → usuwa worktree i gałąź
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { wstrzyknijJava } from "./java.mjs";
import { wstrzyknijCsharp } from "./csharp.mjs";

const git = (kat, ...a) => execFileSync("git", ["-C", kat, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export const GALAZ = "flowlens-diag";
export const katalogKopii = repo => path.join(repo, ".flow-lens", "diag-worktree");

export function wstrzyknij(start, mapa, { katalogDiag } = {}) {
  const repo = git(start, "rev-parse", "--show-toplevel");
  const kopia = katalogKopii(repo);
  if (fs.existsSync(kopia)) usunWstrzykniecie(repo, { cicho: true });
  const brudne = git(repo, "status", "--porcelain", "--untracked-files=no");
  git(repo, "worktree", "add", "-f", "-B", GALAZ, kopia, "HEAD");
  const jezyki = new Set(Object.values(mapa.klasy || {}).map(k => (k.plik || "").split(".").pop().replace(/:\d+$/, "")));
  let raport;
  if (jezyki.has("java")) raport = wstrzyknijJava(kopia, mapa, { katalogDiag: katalogDiag || path.join(repo, ".flow-lens", "diag") });
  else if (jezyki.has("cs")) raport = wstrzyknijCsharp(kopia, mapa);
  else throw new Error(`Wstrzykiwanie do kopii jest dla Javy i C# (mapa: ${[...jezyki].join(", ")}). Python i Node: flow.mjs --bez-otel (w runtime). Inaczej: --hybryda z logiem bazy.`);
  git(kopia, "add", "-A");
  git(kopia, "-c", "user.name=flow-lens", "-c", "user.email=flow-lens@localhost", "commit", "-q", "--no-verify", "-m", "flow-lens: log diagnostyczny (tylko kopia do analizy)");
  console.log(`Kopia z logiem diagnostycznym: ${kopia} (gałąź ${GALAZ})`);
  console.log(`  metody: ${raport.metody.length} w ${raport.pliki} plikach; repozytoria-interfejsy (owijane w runtime): ${raport.repozytoria?.length || 0}; moduły: ${raport.moduly.join(", ") || "."}`);
  for (const o of raport.ostrzezenia.slice(0, 20)) console.log(`  uwaga: ${o}`);
  if (raport.ostrzezenia.length > 20) console.log(`  … i ${raport.ostrzezenia.length - 20} innych uwag`);
  if (brudne) console.log("  UWAGA: masz niezacommitowane zmiany — kopia jest z HEAD, bez nich.");
  console.log(`Uruchom aplikację/testy w kopii, a flow-lens z --diag ${katalogDiag || ".flow-lens/diag"}. Diff: git -C ${kopia} show --stat`);
  return { repo, kopia, raport };
}

export function usunWstrzykniecie(start, { cicho = false } = {}) {
  const repo = git(start, "rev-parse", "--show-toplevel").replace(/\/\.flow-lens\/diag-worktree$/, "");
  const kopia = katalogKopii(repo);
  try { git(repo, "worktree", "remove", "--force", kopia); } catch { fs.rmSync(kopia, { recursive: true, force: true }); git(repo, "worktree", "prune"); }
  try { git(repo, "branch", "-D", GALAZ); } catch {}
  if (!cicho) console.log(`Usunięto ${kopia} i gałąź ${GALAZ}.`);
}
