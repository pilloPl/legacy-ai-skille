"""HISTORICAL COMPATIBILITY TOOL. New legacy-init uses calibrate.mjs (Node); graph lifecycle uses code-evidence-graph.

Create a reconnaissance run and publish its candidate index/standalone HTML.

No source-code analysis or domain verdicts are performed here. entry-flows owns graph
construction; the agent records bounded source screening in screening.json.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
from urllib.parse import quote
import uuid

SCHEMA = 'legacy-init/1.0'
SKILL_ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
        f.write(text)
        temporary = f.name
    os.replace(temporary, path)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True)
    if result.returncode:
        return None
    return result.stdout.decode('utf-8', errors='replace').strip('\n')


def snapshot(repo):
    head = git(repo, 'rev-parse', 'HEAD')
    if not head:
        return dict(revision=None, dirty={}, limitation='No Git revision; freshness must be checked against source artifacts.')
    paths = set((git(repo, 'diff', '--name-only', '-z', 'HEAD') or '').split('\0'))
    paths.update((git(repo, 'ls-files', '--others', '--exclude-standard', '-z') or '').split('\0'))
    dirty = {}
    for rel in sorted(paths - {''}):
        if rel.startswith('.codegraph/'):
            continue
        path = Path(repo) / rel
        dirty[rel] = digest(path) if path.is_file() else None
    return dict(revision=head, dirty=dirty)


def start(repo, workspace):
    repo, workspace = Path(repo).resolve(), Path(workspace).expanduser().resolve()
    if workspace == repo or repo in workspace.parents:
        raise ValueError('Use an audit workspace outside the inspected repository.')
    workspace.mkdir(parents=True, exist_ok=True)
    current = workspace / 'system-map.json'
    if current.exists() and Path(read(current)['repo']).resolve() != repo:
        raise ValueError('This workspace belongs to a different repository.')
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    run = workspace / 'runs' / run_id
    (run / 'entry-flows').mkdir(parents=True)
    write(run / 'run.json', dict(
        schema=SCHEMA, run_id=run_id, repo=str(repo), workspace=str(workspace),
        started_at=datetime.now(timezone.utc).isoformat(), source=snapshot(repo),
        skills_revision=git(SKILL_ROOT, 'rev-parse', 'HEAD'),
        skills_dirty=git(SKILL_ROOT, 'status', '--porcelain'),
    ))
    write(run / 'screening.json', dict(
        scope='Fill inspected, sampled and deferred scopes before publication.',
        inspected=[], sampled=[], deferred=[], limits=[], candidates=[],
    ))
    if not (workspace / 'project-context.md').exists():
        write(workspace / 'project-context.md', '# Project context\n\n'
              'Record the audit goal, constraints and attributed user explanations here.\n'
              'Domain purpose is unknown until supported by a source; do not infer it from class names.\n')
    return run


def inside(root, rel):
    path = (Path(root) / rel).resolve()
    if path != Path(root).resolve() and Path(root).resolve() not in path.parents:
        raise ValueError(f'Path escapes its declared root: {rel}')
    return path


def validate_evidence(evidence, repo, workspace):
    if not isinstance(evidence, dict) or evidence.get('root') not in ('repo', 'workspace'):
        raise ValueError('Evidence needs root=repo|workspace, path and locator.')
    base = repo if evidence['root'] == 'repo' else workspace
    path = inside(base, evidence.get('path', ''))
    if not path.is_file() or not evidence.get('locator'):
        raise ValueError(f'Unresolvable evidence: {evidence}')


def verification(bundle):
    check = bundle / 'verify-overlay.json'
    review = bundle / 'overlay-review.json'
    result = dict(source_check='missing', independent_review='missing')
    if check.exists():
        data = read(check)
        result['source_check'] = 'failed' if data.get('fails') else 'completed'
        result['pending_review_items'] = len(data.get('review_queue', []))
        result['sample_for_review'] = len(data.get('review_sample_of_ok', []))
    if (bundle / 'verify.json').exists():
        paths = read(bundle / 'verify.json')
        if paths.get('witness_bad') or paths.get('sample_bad'):
            result['source_check'] = 'failed'
    if review.exists():
        # No common reviewer schema yet: presence is never upgraded to acceptance.
        result['independent_review'] = 'recorded; inspect verdicts'
    return result


def publish(workspace, run):
    workspace, run = Path(workspace).expanduser().resolve(), Path(run).expanduser().resolve()
    if workspace not in run.parents:
        raise ValueError('Run must be inside its workspace.')
    if (run / 'system-map.json').exists():
        raise ValueError('Published run is immutable; start a new run.')
    meta = read(run / 'run.json')
    if Path(meta['workspace']).resolve() != workspace:
        raise ValueError('Run/workspace mismatch.')
    repo = Path(meta['repo']).resolve()
    if snapshot(repo) != meta['source']:
        raise ValueError('Repository changed during reconnaissance; start a new run.')
    plan = read(workspace / 'evidence-plan.json')
    if Path(plan['system']['root']).expanduser().resolve() != repo:
        raise ValueError('Evidence Plan belongs to a different repository.')
    bundle = run / 'entry-flows'
    overlay = read(bundle / 'overlay.json')
    config = read(bundle / 'config.json')
    if Path(overlay['repo']).expanduser().resolve() != repo or Path(config['repo']).expanduser().resolve() != repo:
        raise ValueError('Graph/config belongs to a different repository.')
    if not overlay.get('discovery'):
        raise ValueError('Run entry-flows export with discovery=true; top N is not a discovery pool.')
    if overlay.get('unit') not in ('class', 'file', 'package', 'module'):
        raise ValueError('Record the resolved unit before publishing.')
    indexed = overlay.get('graph_db_metadata', {}).get('indexed_at_commit')
    if indexed and meta['source']['revision'] and indexed != meta['source']['revision']:
        raise ValueError('Graph index is for a different commit.')
    screening = read(run / 'screening.json')
    if not screening.get('scope') or screening['scope'].startswith('Fill inspected'):
        raise ValueError('Describe the actual reconnaissance scope.')

    with sqlite3.connect(f'{(bundle / "graph.db").as_uri()}?mode=ro', uri=True) as db:
        nodes = {r[0]: dict(id=r[0], file=r[1], line=r[2], name=r[3]) for r in db.execute(
            'select id,file_path,start_line,qualified_name from nodes')}
    synthetic = {x['id'] for x in overlay.get('synthetic_nodes', [])}
    all_ids = set(nodes) | synthetic
    entry_ids = {e['id'] for e in overlay['entries']}
    pool = {row['unit']: row for row in overlay['discovery']['units']}
    for row in pool.values():
        if set(row['method_ids']) - all_ids or set(row['entry_ids']) - entry_ids:
            raise ValueError(f'Broken graph references in {row["unit"]}')
        if row['entries'] != len(set(row['entry_ids'])):
            raise ValueError('Entry count must count distinct node IDs.')
        for witness in row.get('witnesses', []):
            if (not witness['method_path'] or witness['method_path'][0] != witness['entry_id']
                    or witness['entry_id'] not in row['entry_ids']
                    or witness['method_path'][-1] not in row['method_ids']
                    or set(witness['method_path']) - all_ids):
                raise ValueError('Broken witness references.')

    previous = read(workspace / 'system-map.json') if (workspace / 'system-map.json').exists() else {}
    previous_by_id = {x['id']: x for x in previous.get('candidates', [])}
    candidates, seen = [], set()
    for item in screening.get('candidates', []):
        key = item['key']
        if key in seen:
            raise ValueError(f'Duplicate candidate key: {key}')
        seen.add(key)
        decision = item.get('decision')
        if decision not in ('candidate', 'navigation', 'deferred'):
            raise ValueError('Decision must be candidate, navigation or deferred.')
        if item.get('kind') not in ('unit', 'table', 'fragment', 'group'):
            raise ValueError('Candidate kind must be unit, table, fragment or group.')
        if item['kind'] == 'unit' and key not in pool:
            raise ValueError(f'Unknown discovery unit: {key}')
        reasons = item.get('reasons', [])
        if not reasons or not all(r.get('observation') and r.get('evidence') for r in reasons):
            raise ValueError('Every screening decision requires observations and evidence.')
        for reason in reasons:
            for evidence in reason['evidence']:
                validate_evidence(evidence, repo, workspace)
        qualifying = {'state', 'decision', 'data-carrier', 'incident', 'change-goal', 'user'}
        if decision == 'candidate' and not any(r.get('kind') in qualifying for r in reasons):
            raise ValueError('Size, churn, fan-in or a name alone cannot nominate a candidate.')
        cid = 'candidate-' + hashlib.sha256((item['kind'] + ':' + key).encode()).hexdigest()[:16]
        row = pool.get(key)
        locations = []
        if row:
            locations = [nodes[mid] for mid in row['method_ids'] if mid in nodes]
        priority = item.get('priority')
        if priority is not None and not isinstance(priority, int):
            raise ValueError('priority must be an integer (1 = read first).')
        candidates.append(dict(
            id=cid, key=key, kind=item['kind'], label=item.get('label', key), decision=decision, priority=priority,
            reasons=reasons, limits=item.get('limits', []), metrics=row,
            locations=locations, exploration=('see-linked-results' if previous_by_id.get(cid, {}).get('analysis_links') else 'not-explored'),
            analysis_links=previous_by_id.get(cid, {}).get('analysis_links', []),
        ))
    # Analyst priority first; then entries reaching changing/deciding methods. Plain reach would rank
    # widely read reference data (periods, dictionaries) above the units where behaviour happens.
    order = {'candidate': 0, 'navigation': 1, 'deferred': 2}
    candidates.sort(key=lambda x: (order[x['decision']], x['priority'] if x['priority'] is not None else 10 ** 6,
                                   -((x['metrics'] or {}).get('behaviour_entries') or -1),
                                   -(x['metrics'] or {}).get('entries', -1), x['key']))
    # Previously nominated areas stay visible if this pass did not revisit them.
    for cid, old in previous_by_id.items():
        if cid not in {c['id'] for c in candidates}:
            candidates.append(dict(old, decision='deferred', metrics=None,
                                   limits=old.get('limits', []) + ['Not revisited in this run; see previous snapshot.']))

    prefix = run.relative_to(workspace).as_posix()
    write(run / 'evidence-plan-input.json', plan)
    write(run / 'project-context-input.md', (workspace / 'project-context.md').read_text(encoding='utf-8'))
    files = {}
    for path in sorted(run.rglob('*')):
        if path.is_file() and path.suffix not in ('.pkl', '.pyc'):
            rel = path.relative_to(workspace).as_posix()
            files[rel] = digest(path)
    data = dict(
        schema=SCHEMA, run_id=meta['run_id'], repo=str(repo), source=meta['source'],
        skills_revision=meta['skills_revision'], generated_at=datetime.now(timezone.utc).isoformat(),
        scope=screening['scope'], coverage={k: screening.get(k, []) for k in ('inspected', 'sampled', 'deferred', 'limits')},
        evidence_plan=prefix + '/evidence-plan-input.json', project_context=prefix + '/project-context-input.md',
        graph_bundle=prefix + '/entry-flows', provenance=files, verification=verification(bundle),
        unit=overlay['unit'], entries_observed=len(entry_ids),
        pool_count=len(pool), screened_units=len(seen & set(pool)), candidates=candidates,
        previous_run=previous.get('run_id'),
        history=[*previous.get('history', []), dict(run_id=meta['run_id'], report=prefix + '/init.html')],
        limits=[
            'Counts describe detected static entry nodes, not independent business processes or runtime frequency.',
            'Target-free discovery does not establish SQL reach or whole-repository completeness.',
            'Witnesses are bounded method-level samples. Missing edges can undercount; speculative edges can overcount.',
            'Screening nominates locations only; domain meaning, homonyms and island boundaries are unexplored.',
        ],
    )
    template = (SKILL_ROOT / 'assets' / 'dashboard.html').read_text(encoding='utf-8')
    def render(base):
        payload = dict(data, link_base=base)
        safe = json.dumps(payload, ensure_ascii=False).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
        return template.replace('__INIT_DATA__', safe)
    index = '# Legacy reconnaissance\n\n'
    index += f'Run: `{meta["run_id"]}`. Revision: `{meta["source"]["revision"] or "unknown"}`.\n\n'
    index += '[Candidate map (HTML)](init.html) · [Structured map](system-map.json)\n\n'
    index += '[Project context](project-context.md) · [Evidence Plan](evidence-plan.json)\n\n'
    index += 'Read source limitations and check freshness before reuse. Candidates are not domain islands.\n\n'
    index += f'[{prefix}/screening.json]({quote(prefix)}/screening.json) records all inspected nominations and reasons.\n\n'
    for candidate in candidates:
        index += f'- `{candidate["id"]}` — {candidate["label"]} ({candidate["decision"]})\n'
    artifact_id = 'legacy-init-' + meta['run_id']
    plan.setdefault('artifacts', []).append(dict(
        id=artifact_id, kind='legacy-reconnaissance', status='found', location=str(run),
        treatment='sample', closes_gaps=[], notes='Derived reconnaissance, not independent domain evidence.',
        added_by='legacy-init', added_on=data['generated_at'][:10],
    ))
    plan.setdefault('log', []).append(dict(date=data['generated_at'], by='legacy-init', change='Registered ' + artifact_id))
    write(run / 'system-map.json', data)
    write(run / 'init.html', render('../../'))
    write(workspace / 'evidence-plan.json', plan)
    write(workspace / 'system-map.json', data)
    write(workspace / 'init.html', render(''))
    write(workspace / 'INDEX.md', index)
    return workspace / 'init.html'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    begin = sub.add_parser('start')
    begin.add_argument('repo')
    begin.add_argument('--workspace', required=True)
    finish = sub.add_parser('publish')
    finish.add_argument('--workspace', required=True)
    finish.add_argument('--run', required=True)
    args = parser.parse_args()
    try:
        print(start(args.repo, args.workspace) if args.command == 'start' else publish(args.workspace, args.run))
    except (ValueError, KeyError, OSError) as exc:
        parser.exit(1, f'legacy-init: {exc}\n')


if __name__ == '__main__':
    main()
