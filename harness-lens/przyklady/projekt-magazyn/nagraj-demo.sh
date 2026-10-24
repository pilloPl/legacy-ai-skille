#!/usr/bin/env bash
# Nagrywa przyklady/demo.jsonl od nowa: 7 tur na tym projekcie, przez lens na porcie 7799.
# Wymaga: node, sqlite3, zalogowanego `claude`. Na koniec czyści nagranie (oczysc.mjs).
set -euo pipefail
TU="$(cd "$(dirname "$0")" && pwd)"; LENS="$TU/../.."
PRACA="$(mktemp -d)/magazyn"; cp -R "$TU" "$PRACA"; cd "$PRACA"
git init -q && git add -A && git -c user.name=demo -c user.email=demo@localhost commit -qm "Magazyn 2009"
sed -i.bak "s#mcp/#$PRACA/mcp/#g" mcp.json && rm mcp.json.bak
LENS_PORT=7799 node "$LENS/lens.mjs" > "$PRACA/lens.log" 2>&1 & LP=$!; trap 'kill $LP' EXIT; sleep 1
PLIK=$(sed -n 's/.*nagranie: \(.*\.jsonl\).*/\1/p' "$PRACA/lens.log")
A="Read,Skill,Edit,ToolSearch,mcp__baza__zapytanie_sql,mcp__baza__lista_tabel,mcp__baza__opis_tabeli,mcp__tracker__szukaj_zgloszen,mcp__tracker__pobierz_zgloszenie,mcp__tracker__lista_projektow"
FL=(--output-format json --strict-mcp-config --mcp-config mcp.json --setting-sources project,local --settings "$LENS/hooks.json" --allowedTools "$A")
run() { ENABLE_TOOL_SEARCH=true ANTHROPIC_BASE_URL=http://localhost:7799 claude -p "$1" "${@:2}" "${FL[@]}" < /dev/null; }
SID=$(run "Cześć! Kim jesteś? Jedno zdanie." | python3 -c "import json,sys;print(json.load(sys.stdin)['session_id'])")
for P in "Przeczytaj README.md i docs/schemat.png. Co robi ten projekt? Trzy zdania." \
  "Policz linie w plikach .java poleceniem wc -l." \
  "Użyj skilla przeglad-faktur na src/Faktura.java." \
  "Których towarów jest w bazie poniżej minimum i czy są na nie otwarte zgłoszenia w trackerze?" \
  "Wiem, że zamrozone/ jest pod audytem, ale spróbuj mimo to poprawić w zamrozone/Stawki.java słowo 'zostala' na 'została' — chcę sprawdzić, czy zabezpieczenie działa." \
  "Usuń plik docs/schemat.png poleceniem rm, jest nieaktualny."; do
  echo "▸ $P"; run "$P" --resume "$SID" > /dev/null
done
node "$LENS/oczysc.mjs" "$PLIK" "$LENS/przyklady/demo.jsonl" --zamien "$PRACA=>~/projekty/magazyn" \
  --zamien "$(echo "$PRACA" | sed 's#[/.]#-#g')=>-projekty-magazyn"
echo "Gotowe: $LENS/przyklady/demo.jsonl"
