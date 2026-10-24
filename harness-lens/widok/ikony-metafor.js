// Ikony i sceneria metafor: człowiek (rekwizyt pod postacią), harness (znaczek przy nazwie), model (zamiast sieci
// neuronowej), wzór tła modelu i „okruchy” wypadające z głowy przy zapomnieniu. Linie jak w reszcie sceny.
import { el } from "./scena.js";

const L = (kolor = "var(--fg2)", gr = 1.8) => ({ fill: "none", stroke: kolor, "stroke-width": gr, "stroke-linecap": "round", "stroke-linejoin": "round" });
const p = (d, a = L()) => el("path", { d, ...a });
const postac = (cx, cy, kolor, ubranie) => [
  el("circle", { cx, cy: cy - 30, r: 15, fill: "var(--bg)", ...L(kolor, 2) }),
  p(`M${cx - 32} ${cy + 40} v-20 c0 -22 14 -32 32 -32 c18 0 32 10 32 32 v20 z`, { ...L(kolor, 2), fill: "var(--bg)" }),
  ...ubranie];

export const IKONY = {
  lekarz: {
    czlowiek: (cx, y) => el("g", {}, [ // łóżko szpitalne
      p(`M${cx - 44} ${y + 4} v46 M${cx + 44} ${y + 22} v28 M${cx - 44} ${y + 34} h88`),
      el("rect", { x: cx - 38, y: y + 14, width: 22, height: 10, rx: 3, ...L("var(--fg2)", 1.4) }),
      p(`M${cx - 14} ${y + 24} h56 v10 h-56 z`, { ...L("var(--accent)", 1.4), fill: "color-mix(in srgb, var(--accent) 18%, transparent)" })]),
    model: (cx, cy) => el("g", {}, postac(cx, cy, "var(--fg)", [
      p(`M${cx - 10} ${cy - 12} l10 24 l10 -24`, L("var(--fg2)", 1.6)), // klapy kitla
      p(`M${cx - 16} ${cy - 10} c-6 22, 6 34, 18 28 c8 -4, 8 -16, 6 -22`, L("var(--accent)", 2)), // stetoskop
      el("circle", { cx: cx + 8, cy: cy - 6, r: 4, ...L("var(--accent)", 2) }),
      p(`M${cx + 18} ${cy + 14} h10 M${cx + 23} ${cy + 9} v10`, L("var(--c-deny)", 2.4))])),
    harness: (cx, cy) => el("g", {}, [ // czepek pielęgniarki
      p(`M${cx - 16} ${cy + 8} l5 -16 h22 l5 16 z`, { ...L("var(--fg)", 1.6), fill: "var(--bg)" }),
      p(`M${cx} ${cy - 4} v8 M${cx - 4} ${cy} h8`, L("var(--c-deny)", 2))]),
    wzor: `<pattern id="wzor-metafory" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M12 8 h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 v-4 h4 z" fill="var(--line)" opacity=".7"/></pattern>`,
    okruch: null, // lekarz nie zapomina na scenie: przychodzi inny
  },
  prezes: {
    czlowiek: (cx, y) => el("g", {}, [ // budynek firmy
      el("rect", { x: cx - 28, y: y + 2, width: 56, height: 50, ...L() }),
      ...[0, 1, 2].flatMap(r => [0, 1, 2].map(k => el("rect", { x: cx - 20 + k * 15, y: y + 9 + r * 12, width: 9, height: 7, fill: "var(--accent)", opacity: .55 }))),
      p(`M${cx - 5} ${y + 52} v-10 h10 v10`)]),
    model: (cx, cy) => el("g", {}, postac(cx, cy, "var(--fg)", [
      p(`M${cx - 13} ${cy - 18} l13 9 l13 -9`, L("var(--fg2)", 1.6)), // kołnierzyk
      p(`M${cx} ${cy - 9} l-6 7 l6 30 l6 -30 z`, { ...L("var(--accent)", 1.6), fill: "color-mix(in srgb, var(--accent) 45%, transparent)" }), // krawat
      p(`M${cx - 70} ${cy + 44} h140`, L("var(--fg2)", 3))])), // blat biurka
    harness: (cx, cy) => el("g", {}, [ // notes z długopisem
      el("rect", { x: cx - 12, y: cy - 13, width: 20, height: 26, ...L("var(--fg)", 1.5), fill: "var(--bg)" }),
      p(`M${cx - 8} ${cy - 6} h12 M${cx - 8} ${cy} h12 M${cx - 8} ${cy + 6} h8`, L("var(--fg2)", 1.2)),
      p(`M${cx + 6} ${cy + 12} l10 -20`, L("var(--accent)", 2.2))]),
    wzor: `<pattern id="wzor-metafory" width="14" height="14" patternUnits="userSpaceOnUse">
      <line x1="7" y1="0" x2="7" y2="14" stroke="var(--line)" stroke-width="1" opacity=".8"/></pattern>`,
    okruch: (x, y) => el("g", {}, [el("rect", { x: x - 6, y: y - 8, width: 12, height: 16, fill: "var(--bg)", ...L("var(--fg2)", 1.2) }),
      p(`M${x - 3} ${y - 3} h6 M${x - 3} ${y + 1} h6`, L("var(--muted)", 1))]),
  },
  szachy: {
    czlowiek: (cx, y) => pionek(cx, y + 4, 1),
    model: (cx, cy) => el("g", {}, [ // król
      p(`M${cx} ${cy - 62} v16 M${cx - 8} ${cy - 54} h16`, L("var(--accent)", 2.4)),
      el("circle", { cx, cy: cy - 36, r: 10, ...L("var(--fg)", 2), fill: "var(--bg)" }),
      p(`M${cx - 18} ${cy - 22} h36 l-8 44 h-20 z`, { ...L("var(--fg)", 2), fill: "var(--bg)" }),
      p(`M${cx - 14} ${cy - 14} h28`, L("var(--fg2)", 1.4)),
      el("rect", { x: cx - 28, y: cy + 22, width: 56, height: 12, rx: 2, ...L("var(--fg)", 2), fill: "var(--bg)" })]),
    harness: (cx, cy) => el("g", {}, [0, 1, 2, 3].flatMap(r => [0, 1, 2, 3].map(k =>
      el("rect", { x: cx - 14 + k * 7, y: cy - 14 + r * 7, width: 7, height: 7, fill: (r + k) % 2 ? "var(--fg2)" : "var(--bg)", stroke: "var(--fg2)", "stroke-width": .6 })))),
    wzor: `<pattern id="wzor-metafory" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="var(--line)" opacity=".55"/><rect x="20" y="20" width="20" height="20" fill="var(--line)" opacity=".55"/></pattern>`,
    okruch: (x, y) => pionek(x, y - 10, .45),
  },
  memento: {
    czlowiek: (cx, y) => el("g", {}, [ // dymek z pytaniem
      p(`M${cx - 26} ${y + 2} h52 v32 h-30 l-10 10 v-10 h-12 z`, { ...L(), fill: "var(--bg)" }),
      el("text", { x: cx, y: y + 26, "text-anchor": "middle", class: "maly", fill: "var(--accent)", "font-weight": 700 }, "?")]),
    model: (cx, cy) => el("g", {}, [ // polaroid z Leonardem
      el("rect", { x: cx - 40, y: cy - 58, width: 80, height: 98, fill: "color-mix(in srgb, var(--fg) 88%, var(--bg))", stroke: "var(--fg2)", "stroke-width": 1 }),
      el("rect", { x: cx - 32, y: cy - 50, width: 64, height: 62, fill: "var(--bg3)" }),
      el("circle", { cx, cy: cy - 26, r: 11, fill: "var(--bg)", ...L("var(--fg2)", 1.6) }),
      p(`M${cx - 22} ${cy + 12} c0 -14 10 -20 22 -20 c12 0 22 6 22 20`, { ...L("var(--fg2)", 1.6), fill: "var(--bg)" }),
      el("text", { x: cx, y: cy + 30, "text-anchor": "middle", class: "bardzo-maly", fill: "var(--bg)", "font-style": "italic" }, "Leonard")]),
    harness: (cx, cy) => el("g", {}, [ // dzwonek recepcyjny
      p(`M${cx - 12} ${cy + 6} a12 12 0 0 1 24 0 z`, { ...L("var(--fg)", 1.6), fill: "var(--bg)" }),
      p(`M${cx - 16} ${cy + 9} h32`, L("var(--fg2)", 2.2)), el("circle", { cx, cy: cy - 9, r: 2.4, fill: "var(--accent)" })]),
    wzor: `<pattern id="wzor-metafory" width="46" height="52" patternUnits="userSpaceOnUse">
      <rect x="8" y="8" width="28" height="34" fill="none" stroke="var(--line)" stroke-width="1" opacity=".8" transform="rotate(-6 22 25)"/>
      <rect x="12" y="12" width="20" height="20" fill="var(--line)" opacity=".35" transform="rotate(-6 22 25)"/></pattern>`,
    okruch: (x, y) => el("g", {}, [el("rect", { x: x - 8, y: y - 10, width: 16, height: 19, fill: "color-mix(in srgb, var(--fg) 85%, var(--bg))" }),
      el("rect", { x: x - 6, y: y - 8, width: 12, height: 11, fill: "var(--bg3)" })]),
  },
};

function pionek(cx, y, s) {
  const g = el("g", { transform: `translate(${cx},${y}) scale(${s})` });
  g.append(el("circle", { cx: 0, cy: 8, r: 7, ...L("var(--fg)", 1.8), fill: "var(--bg)" }),
    p("M-6 16 h12 l4 22 h-20 z", { ...L("var(--fg)", 1.8), fill: "var(--bg)" }),
    el("rect", { x: -14, y: 38, width: 28, height: 7, rx: 2, ...L("var(--fg)", 1.8), fill: "var(--bg)" }));
  return g;
}
