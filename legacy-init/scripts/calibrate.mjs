// Save lightweight analysis calibration without importing or building a graph.
// Usage: node calibrate.mjs <repo> --workspace <workspace> --input <input.json>   (Node 22, standard library only)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { read, write, sourceState, newRun, register, resolvePath } from '../../_shared/analysis_artifacts.mjs';
import { render, validateAssessments } from './calibration_html.mjs';

export function calibrate(repo, workspace, specification) {
  repo = resolvePath(repo); workspace = resolvePath(workspace);
  const data = read(specification);
  if (!data.goal || !data.scope || !data.heuristics?.length)
    throw new Error('Calibration requires goal, working scope and explicit heuristics.');
  const planPath = path.join(workspace, 'evidence-plan.json');
  const plan = fs.existsSync(planPath) ? read(planPath) : { artifacts: [] };
  const artifacts = Object.fromEntries((plan.artifacts || []).map(a => [a.id, a]));
  for (const reference of data.evidence || []) {
    if (!(reference.artifact_id in artifacts)) throw new Error('Register evidence in Evidence Plan first: ' + reference.artifact_id);
    if (!reference.freshness || !reference.limitations) throw new Error('Each evidence reference needs freshness and limitations.');
  }
  for (const h of data.heuristics)
    if (!h.reason || !h.check) throw new Error('Each heuristic needs a reason and a concrete check.');
  for (const c of data.candidates || []) {
    if (!c.reason || !c.evidence_ids?.length || !c.locations?.length)
      throw new Error('Candidates need locations, evidence IDs and a reason.');
    if (c.evidence_ids.some(i => !(i in artifacts))) throw new Error('Unknown candidate evidence ID.');
  }
  validateAssessments(data, artifacts);
  const run = newRun(workspace, 'calibrations', repo);
  // System-owned fields cannot be overridden by supplied calibration content.
  const result = { ...data, schema: 'legacy-calibration/1.0', source: sourceState(repo), evidence_plan: 'evidence-plan.json' };
  write(path.join(run, 'calibration.json'), result);
  write(path.join(run, 'evidence-plan-input.json'), plan);
  write(path.join(workspace, 'calibration.json'), result);
  const html = render(result);
  fs.writeFileSync(path.join(run, 'calibration.html'), html, 'utf8');
  fs.writeFileSync(path.join(workspace, 'calibration.html'), html, 'utf8');
  register(workspace, 'calibration-' + path.basename(run), 'analysis-calibration', path.join(run, 'calibration.json'), 'legacy-init');
  return run;
}

if (process.argv[1] && resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url))) {
  const { values, positionals } = parseArgs({ allowPositionals: true,
    options: { workspace: { type: 'string' }, input: { type: 'string' } } });
  if (positionals.length !== 1 || !values.workspace || !values.input) {
    console.error('Usage: node calibrate.mjs <repo> --workspace <workspace> --input <input.json>');
    process.exit(2);
  }
  try {
    console.log(calibrate(positionals[0], values.workspace, values.input));
  } catch (e) {
    console.error('Error: ' + e.message);
    process.exit(1);
  }
}
