// Hook PreToolUse: blokuje zmiany w katalogu zamrozone/ (deterministycznie, bez pytania modelu).
let s = "";
process.stdin.on("data", c => (s += c));
process.stdin.on("end", () => {
  const p = (JSON.parse(s).tool_input || {}).file_path || "";
  if (/[\\/]zamrozone[\\/]/.test(p)) {
    console.error("Hook: katalog zamrozone/ jest pod audytem — zmiana zablokowana.");
    process.exit(2);
  }
});
