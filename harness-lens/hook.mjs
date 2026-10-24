#!/usr/bin/env node
// Hook dla harness-lens: przekazuje zdarzenie (stdin) do lensa. Niczego nie blokuje i nic nie wypisuje.
import http from "node:http";

const baza = /^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.ANTHROPIC_BASE_URL || "")
  ? process.env.ANTHROPIC_BASE_URL : `http://127.0.0.1:${process.env.LENS_PORT || 7777}`;
const kawalki = [];
process.stdin.on("data", c => kawalki.push(c));
process.stdin.on("end", () => {
  const req = http.request(new URL("/_lens/hook", baza), { method: "POST", timeout: 1000,
    headers: { "content-type": "application/json" } }, res => { res.resume(); res.on("end", () => process.exit(0)); });
  req.on("error", () => process.exit(0));
  req.on("timeout", () => { req.destroy(); process.exit(0); });
  req.end(Buffer.concat(kawalki));
});
