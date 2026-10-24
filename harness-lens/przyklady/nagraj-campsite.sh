#!/usr/bin/env bash
# Nagrywa przyklady/campsite.jsonl od nowa: pytanie z zadania szkolenia na świeżym klonie campsite-power,
# przez lens na porcie 7799 (tool search i hooki jak w `lens.mjs claude`). Wymaga: node, git, zalogowanego `claude`.
#   bash nagraj-campsite.sh [url-repo]   (domyślnie https://github.com/pilloPl/campsite-power-acc.git)
set -euo pipefail
TU="$(cd "$(dirname "$0")" && pwd)"; LENS="$TU/.."
REPO="${1:-https://github.com/pilloPl/campsite-power-acc.git}"
PRACA="$(cd "$(mktemp -d)" && pwd -P)"; cd "$PRACA"
git clone -q "$REPO" campsite-power && cd campsite-power
git clone -q -b czysto https://github.com/pilloPl/legacy-ai-skille .claude/skills
# bez prywatnych konektorów claude.ai i serwerów MCP nagrywającego (--strict-mcp-config bez --mcp-config = zero MCP)
ENABLE_CLAUDEAI_MCP_SERVERS=false LENS_PORT=7799 LENS_NO_BROWSER=1 node "$LENS/lens.mjs" claude \
  -p "Ile modułów Maven ma ten projekt? Odpowiedz jednym zdaniem." --setting-sources project,local --strict-mcp-config \
  | tee "$PRACA/lens.log"
PLIK=$(sed -n 's/^Nagranie: \(.*\.jsonl\).*/\1/p' "$PRACA/lens.log" | tail -1)
node "$LENS/oczysc.mjs" "$PLIK" "$LENS/przyklady/campsite.jsonl" --zamien "$PRACA/campsite-power=>~/projekty/campsite-power" \
  --zamien "$(echo "$PRACA/campsite-power" | sed 's#[/.]#-#g')=>-projekty-campsite-power"
rm -f "$PLIK"
echo "Gotowe: $LENS/przyklady/campsite.jsonl"
