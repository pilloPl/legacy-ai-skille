// Minimalny serwer MCP (stdio, JSON-RPC 2.0): initialize, tools/list, tools/call.
import readline from "node:readline";
export function serwer(nazwa, narzedzia) {
  const wyslij = o => process.stdout.write(JSON.stringify(o) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", async l => {
    const m = JSON.parse(l);
    if (m.method === "initialize") wyslij({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: nazwa, version: "1.0" } } });
    else if (m.method === "tools/list") wyslij({ jsonrpc: "2.0", id: m.id, result: { tools: narzedzia.map(({ wykonaj, ...t }) => t) } });
    else if (m.method === "tools/call") {
      const t = narzedzia.find(x => x.name === m.params.name);
      let text;
      try { text = await t.wykonaj(m.params.arguments || {}); } catch (e) { text = `Błąd: ${e.message}`; }
      wyslij({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text }] } });
    } else if (m.id !== undefined) wyslij({ jsonrpc: "2.0", id: m.id, result: {} });
  });
}
