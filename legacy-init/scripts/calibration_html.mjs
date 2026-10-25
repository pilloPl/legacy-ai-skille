// Offline presentation of calibration; ratings come from evidence, never an inferred score.
// Port of calibration_html.py (Node 22, standard library only).

export function text(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export function heuristicId(heuristic) {
  return heuristic.id || heuristic.name;
}

const isLevel = level => Number.isInteger(level);

export function validateAssessments(data, artifacts) {
  const ids = data.heuristics.map(heuristicId);
  if (ids.some(i => !i) || new Set(ids).size !== ids.length) throw new Error('Heuristics need unique IDs or names.');
  for (const candidate of data.candidates || []) {
    for (const [key, assessment] of Object.entries(candidate.assessments || {})) {
      if (!ids.includes(key)) throw new Error('Assessment references an unknown heuristic: ' + key);
      const level = assessment.level;
      if (!isLevel(level) && level !== 'unknown' && level !== 'n/a') throw new Error('Assessment level must be 0..3, unknown or n/a.');
      if (isLevel(level) && (level < 0 || level > 3)) throw new Error('Assessment level must be 0..3, unknown or n/a.');
      if (!assessment.reason) throw new Error('Assessment needs a reason.');
      const references = assessment.evidence_ids || [];
      if (isLevel(level) && !references.length) throw new Error('An assessed signal needs evidence IDs, including level zero.');
      if (references.some(i => !(i in artifacts) || !candidate.evidence_ids.includes(i)))
        throw new Error('Assessment evidence must be registered and listed on the candidate.');
    }
  }
}

export function render(data) {
  const heuristics = data.heuristics;
  const labels = { 0: '0 · Nie rozpoznano', 1: '1 · Słaba', 2: '2 · Umiarkowana', 3: '3 · Silna',
    unknown: '? · Brak danych', 'n/a': '— · Nie dotyczy' };
  const hues = [215, 165, 275, 35, 335, 190];
  const rows = (data.candidates || []).map((candidate, i) => {
    const index = i + 1;
    const locations = candidate.locations.map(loc => '<code>' + text(loc) + '</code>').join('');
    const evidence = candidate.evidence_ids.map(text).join(' · ');
    const cells = heuristics.map((heuristic, col) => {
      const rating = (candidate.assessments || {})[heuristicId(heuristic)] || {};
      const level = rating.level ?? 'unknown';
      const reason = rating.reason ?? 'Nie oceniono tej heurystyki dla tego miejsca.';
      const references = (rating.evidence_ids || []).map(text).join(' · ');
      const lightness = { 0: 97, 1: 91, 2: 80, 3: 65 }[level] ?? 97;
      const style = isLevel(level) ? `background:hsl(${hues[col % hues.length]} 64% ${lightness}%)` : '';
      return `<td class="signal ${!isLevel(level) ? 'unknown' : 'measured'}" style="${style}">`
        + `<details><summary>${labels[level]}</summary><p>${text(reason)}</p>`
        + `<small>${references}</small></details></td>`;
    });
    return `<tr><td class="place"><span class="number">${String(index).padStart(2, '0')}</span>`
      + `<strong>${text(candidate.name || candidate.id || candidate.locations[0])}</strong>`
      + `${locations}</td><td class="reason">${text(candidate.reason)}<small>${evidence}</small></td>`
      + cells.join('') + '</tr>';
  });
  const headers = heuristics.map((h, i) => `<th style="border-top:4px solid hsl(${hues[i % hues.length]} 55% 48%)">`
    + `${text(h.name || heuristicId(h))}<small>${text(h.reason)}</small></th>`).join('');
  const checks = heuristics.map(h => `<li><strong>${text(h.name || heuristicId(h))}</strong> — ${text(h.check)}</li>`).join('');
  const unknowns = (data.unknowns || []).map(u => '<li>' + text(u) + '</li>').join('') || '<li>Nie zapisano niewiadomych.</li>';
  const empty = `<tr><td colspan="${heuristics.length + 2}" class="empty">Nie wskazano jeszcze miejsc. Kalibracja pozostaje użyteczna bez kandydatur.</td></tr>`;
  return STATIC + `
<p class="goal">${text(data.goal)}</p><div class="context"><div><div class="eyebrow">Roboczy zakres</div>${text(data.scope)}</div>
<div><div class="eyebrow">Punkt wyjścia</div>${(data.candidates || []).length} miejsc · ${heuristics.length} heurystyk<small>Kolejność z kalibracji. Bez sumowania ocen i automatycznego rankingu.</small></div></div>
<div class="toolbar"><h2>Przesłanki wyboru miejsc</h2><input id="filter" type="search" aria-label="Filtruj miejsca" placeholder="Szukaj miejsca, powodu lub dowodu…"></div>
<div class="table-wrap"><table><thead><tr><th>Miejsce / lokalizacja</th><th>Dlaczego warto sprawdzić</th>${headers}</tr></thead><tbody>${rows.join('') || empty}</tbody></table></div>
<div class="legend"><span>0 · Nie rozpoznano sygnału</span><span>1 · Słaba</span><span>2 · Umiarkowana</span><span>3 · Silna</span><span class="missing">? · Brak danych</span><span class="missing">— · Nie dotyczy</span></div>
<p class="note">Intensywność koloru oznacza siłę konkretnej przesłanki w świetle wskazanych dowodów. Kliknij ocenę, aby zobaczyć uzasadnienie.
Kolor identyfikuje heurystykę, nie wartość domenową miejsca. Oceny są jawne i wymagają odczytania dowodów.
Brak danych różni się od oceny 0; nie rozpoznano sygnału nie znaczy, że zachowanie nie istnieje. Oceny różnych heurystyk nie tworzą wspólnej skali.</p>
<div class="lower"><section><h2>Co sprawdzić dalej</h2><ul>${checks}</ul></section><section><h2>Niewiadome i ograniczenia</h2><ul>${unknowns}</ul></section></div>
<footer>Źródło: calibration.json · Evidence Plan: ${text(data.evidence_plan ?? 'evidence-plan.json')} · Wersja kodu: ${text((data.source || {}).revision || 'nieznana')}<br>Statyczny raport offline. Graf nie jest wymagany. Aktualność należy sprawdzić przed ponownym użyciem.</footer>
</main><script>document.getElementById('filter').addEventListener('input',function(){const q=this.value.toLocaleLowerCase();document.querySelectorAll('tbody tr').forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase().includes(q)})});</script></html>`;
}

const STATIC = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kalibracja analizy · miejsca do sprawdzenia</title><style>h1,h2{font-family:"Fraunces",Georgia,serif;font-weight:560}code{font-family:"IBM Plex Mono",ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:#f4efe6;color:#201a16;font:15px/1.55 "IBM Plex Sans","Segoe UI",system-ui,sans-serif}
main{max-width:1600px;margin:auto;padding:44px 32px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#b5632b;font-size:11px;font-weight:750}
h1{font-size:clamp(28px,4vw,44px);letter-spacing:-.04em;line-height:1.15;margin:12px 0 18px}h2{font-size:18px;margin:0 0 12px}
.goal{max-width:950px;font-size:19px}.muted,small{color:#6b5f54}small{display:block;font-size:12px;margin-top:8px;font-weight:400}
.context{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0}.context>div{flex:1;min-width:240px;background:#fbf8f2;border:1px solid #d8cdbb;border-radius:14px;padding:20px}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:34px 0 14px;flex-wrap:wrap}
input{font:inherit;border:1px solid #d8cdbb;border-radius:9px;padding:10px 14px;min-width:260px;background:#fbf8f2}
.table-wrap{overflow:auto;border:1px solid #d8cdbb;border-radius:14px;background:#fbf8f2;box-shadow:0 6px 26px #3c281408;max-height:75vh}
table{border-collapse:separate;border-spacing:0;width:100%;min-width:900px}th{text-align:left;background:#fbf8f2;position:sticky;top:0;z-index:1;padding:18px 16px;min-width:175px;border-bottom:1px solid #d8cdbb;font-size:13px;vertical-align:top}
th small{max-width:240px}td{padding:18px 16px;border-bottom:1px solid #e6dccb;vertical-align:top}tr:last-child td{border-bottom:0}
.place{min-width:230px;max-width:340px}.place strong{display:block;font-size:16px}.number{font-size:11px;color:#7a6d60;font-variant-numeric:tabular-nums}
code{display:block;overflow-wrap:anywhere;font-size:11px;margin-top:7px;color:#5a4d42}.reason{min-width:260px;max-width:420px}.signal{min-width:175px;border-left:4px solid #fbf8f2}.signal p{font-size:13px;margin:12px 0 4px}
summary{cursor:pointer;font-size:13px;font-weight:650}.unknown{background:repeating-linear-gradient(135deg,#efe7da,#efe7da 7px,#e6dccb 7px,#e6dccb 8px);color:#6b5f54}
.legend{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.legend span{border-radius:6px;padding:5px 10px;font-size:12px;background:#efe7da}.legend .missing{border:1px dashed #a89884;background:#efe7da}
.note{max-width:1100px;font-size:13px;color:#6b5f54}.lower{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin-top:30px}.lower section{padding:24px;background:#fbf8f2;border:1px solid #d8cdbb;border-radius:14px}li{margin:10px 0}ul{padding-left:20px}.empty{padding:40px;color:#6b5f54}footer{margin-top:28px;font-size:11px;color:#7a6d60;overflow-wrap:anywhere}
@media(max-width:700px){main{padding:24px 16px}.lower{grid-template-columns:1fr}input{width:100%}}@media print{input{display:none}.table-wrap{overflow:visible;max-height:none}th{position:static}details>p{display:block}.signal{print-color-adjust:exact}}
</style><main><div class="eyebrow">Legacy init / kalibracja analizy</div><h1>Miejsca do sprawdzenia</h1>`;
