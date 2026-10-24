// Serwer MCP „baza”: tylko odczyt z prawdziwej bazy sqlite (dane/magazyn.db).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serwer } from "./wspolne.mjs";
const DB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dane", "magazyn.db");
const sql = q => execFileSync("sqlite3", ["-readonly", "-header", "-column", DB, q], { encoding: "utf8" });
serwer("baza", [
  { name: "lista_tabel", description: "Zwraca listę tabel w bazie magazynu.", inputSchema: { type: "object", properties: {} },
    wykonaj: () => sql("select name from sqlite_master where type='table'") },
  { name: "opis_tabeli", description: "Zwraca kolumny tabeli z typami.", inputSchema: { type: "object", properties: { tabela: { type: "string" } }, required: ["tabela"] },
    wykonaj: ({ tabela }) => sql(`pragma table_info(${String(tabela).replace(/\W/g, "")})`) },
  { name: "zapytanie_sql", description: "Wykonuje zapytanie SELECT na bazie magazynu. Tylko odczyt.", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
    wykonaj: ({ sql: q }) => { if (!/^\s*select\b/i.test(q)) throw new Error("dozwolony tylko SELECT"); return sql(q); } },
]);
