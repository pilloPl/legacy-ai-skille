"""HISTORICAL COMPATIBILITY TOOL. New legacy-init uses calibrate.mjs (Node); graph lifecycle uses code-evidence-graph.

Bounded screening aids for legacy-init (Step 4). Read-only; no domain verdicts.

They aggregate evidence the agent then reads selectively. Nothing here nominates a candidate:
a high count is a reason to open a file, never a reason in screening.json by itself.

  churn   <repo> --out churn.json [--since 2024-10-01] [--max-files 15] [--ext .java] [--path src/main]
          [--message-regex '(?i)fix|bug|błąd|popraw']
          Commits per file (merges skipped; commits touching more than --max-files files are skipped
          as bulk/formatting changes). With --message-regex only matching commits count (fix churn).
          Register the output as an Evidence Plan aggregate.
  docs    <repo> [--json]
          In-repo documentation inventory (README/ADR/*.md/*.adoc/docs/), outside build and vendor dirs.
          Register what exists as Evidence Plan artifacts before screening.
  signals <repo> --config <entry-flows config.json> [--min 14] [--exclude REGEX ...]
          Decision-signal density per production file (guards, error returns, throws, status
          comparisons). Production = config extensions minus test_markers.
  units   <bundle> [--match REGEX] [--churn churn.json] [--json]
          Discovery rows (overlay.discovery.units) with distinct entries, channels, methods,
          outgoing/caller units, local entries, source files and summed churn of those files.
  pool    <bundle> [--churn churn.json] [--fix-churn fix.json] [--technical REGEX] [--sort behaviour|decision|state|entries|churn]
          [--min-entries 0] [--top 150] [--hide-technical] [--json]
          The whole discovery pool. Default order: entries reaching a state-changing or deciding method
          (behaviour), then fix churn, churn, number of deciding methods. Flags: T technical name,
          R reference pattern (read by many entries, changed/decided by ≤10% of them) — a reference
          unit is context to read, not a top candidate by reach. Record the denominator.

<bundle> is an entry-flows workdir holding overlay.json and graph.db.
"""
import argparse
import collections
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

# Default Java/Spring heuristics; override per project with --technical / --pattern.
TECHNICAL = (r'(Logger|logging|Config|Configuration|Properties|Exception|Mapper|Dto\b|DTO|Util|Utils|Helper|Converter|'
             r'Builder|Response|Request|[Ss]ecurity|Metric|Jdbc|SpringData|JPARepository|Repository$|Dao\b|DAO|commons\.|'
             r'Clock|Fixture|SpecificationGenerator|Filter|Controller|Serwer|Wrapper|ObjectFactory|Serializer|\.model(::|\.)|Id$|Command$|Event$|Query$)')
SIGNALS = r'if \(|if\(|Either\.left|\bleft\(|throw new|Status\w*\.[A-Z_]+\)|== Status|\.equals\(Status|switch \('


def churn(repo, since, max_files, exts, path, message_regex=None):
    cmd = ['git', '-C', str(repo), 'log', '--no-merges', '--name-only', '--format=@@%h %s']
    if since: cmd.append('--since=' + since)
    if path: cmd += ['--', path]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    counts, commit, commits, keep = collections.Counter(), [], 0, True
    rx = re.compile(message_regex) if message_regex else None

    def flush():
        if keep and 0 < len(commit) <= max_files:
            counts.update(commit)
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('@@'):
            flush(); commit = []; commits += 1
            keep = rx is None or bool(rx.search(line.split(' ', 1)[1] if ' ' in line else ''))
        elif line.endswith(tuple(exts)):
            commit.append(line)
    flush()
    return dict(counts), commits


DOC_NAMES = re.compile(r'(?i)(^|/)(readme|adr[-_ ]?\d*|architecture|design|changelog|todo)[^/]*$|\.(md|adoc|rst)$|(^|/)(docs?|adr)/')
SKIP_DIRS = re.compile(r'(^|/)(\.git|\.codegraph|node_modules|target|build|dist|out|vendor|\.idea|\.claude|\.agents)(/|$)')


def docs(repo):
    rows = []
    for path in Path(repo).rglob('*'):
        rel = path.relative_to(repo).as_posix()
        if not path.is_file() or SKIP_DIRS.search(rel) or not DOC_NAMES.search(rel): continue
        if path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.xsd', '.wsdl', '.xml', '.java', '.class', '.jar'): continue
        rows.append(dict(file=rel, bytes=path.stat().st_size))
    return sorted(rows, key=lambda r: (r['file'].count('/'), r['file']))


def production_files(repo, config):
    exts, markers = config.get('extensions', ['.java']), config.get('test_markers', ['/test/'])
    for path in Path(repo).rglob('*'):
        rel = path.relative_to(repo).as_posix()
        if path.is_file() and rel.endswith(tuple(exts)) and not any(m in '/' + rel for m in markers) \
                and not rel.startswith(('.', 'target/')):
            yield rel


def signals(repo, config, minimum, excludes, pattern=SIGNALS):
    rx, ex = re.compile(pattern), [re.compile(e) for e in excludes]
    rows = []
    for rel in production_files(repo, config):
        if any(e.search(rel) for e in ex): continue
        text = (Path(repo) / rel).read_text(encoding='utf-8', errors='replace')
        n = sum(1 for line in text.splitlines() if rx.search(line))
        if n >= minimum: rows.append(dict(file=rel, signals=n, lines=text.count('\n') + 1))
    return sorted(rows, key=lambda r: (-r['signals'], r['file']))


def load_bundle(bundle):
    overlay = json.loads((Path(bundle) / 'overlay.json').read_text(encoding='utf-8'))
    if not overlay.get('discovery'):
        raise SystemExit('overlay.json has no discovery section; run entry-flows export with "discovery": true')
    return overlay['discovery']['units']


def unit_files(bundle, rows):
    db = sqlite3.connect(f'{(Path(bundle) / "graph.db").as_uri()}?mode=ro', uri=True)
    files = {}
    for row in rows:
        ids = [i for i in row['method_ids'] if not i.startswith(('syn:', 'init:'))]
        found = set()
        for start in range(0, len(ids), 500):
            chunk = ids[start:start + 500]
            found |= {r[0] for r in db.execute(
                f'select file_path from nodes where id in ({",".join("?" * len(chunk))})', chunk)}
        files[row['unit']] = sorted(found)
    return files


def describe(rows, files, churn_counts, technical=None, fix_counts=None):
    tech = re.compile(technical) if technical else None
    out = []
    for row in rows:
        fs = files.get(row['unit'], [])
        beh = row.get('behaviour_entries')
        out.append(dict(
            state_change_entries=row.get('state_change_entries'), decision_entries=row.get('decision_entries'),
            behaviour_entries=beh, deciding_methods=len(row.get('decision_method_ids', [])),
            changing_methods=len(row.get('state_change_method_ids', [])),
            fix_churn=sum(fix_counts.get(f, 0) for f in fs) if fix_counts is not None else None,
            reference=bool(beh is not None and row['entries'] >= 20 and beh <= 0.1 * row['entries']),
            unit=row['unit'], entries=row['entries'], channels=row['by_channel'],
            methods=len(row['method_ids']), outgoing=len(row['outgoing_units']),
            callers=len(row['direct_caller_units']), local_entries=len(row['local_entry_ids']),
            files=fs, churn=sum(churn_counts.get(f, 0) for f in fs) if churn_counts is not None else None,
            technical=bool(row.get('technical_name_match') or (tech and tech.search(row['unit'])))))
    return out


def show(items, as_json):
    if as_json:
        print(json.dumps(items, ensure_ascii=False, indent=1)); return
    for x in items:
        ch = ', '.join(f'{k}: {v}' for k, v in sorted(x['channels'].items(), key=lambda kv: -kv[1]))
        flags = ('T' if x['technical'] else ' ') + ('R' if x['reference'] else ' ')
        beh = '-' if x['behaviour_entries'] is None else f"{x['behaviour_entries']} (zm {x['state_change_entries']}, dec {x['decision_entries']})"
        print(f"{x['entries']:4} {flags} behaviour={beh} m={x['methods']} dec_m={x['deciding_methods']} out={x['outgoing']} "
              f"callers={x['callers']} local={x['local_entries']} churn={x['churn'] if x['churn'] is not None else '-'}"
              f" fix={x['fix_churn'] if x['fix_churn'] is not None else '-'}  {x['unit']}\n      {ch}\n      {' '.join(x['files'])}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('churn'); a.add_argument('repo'); a.add_argument('--out', required=True)
    a.add_argument('--since'); a.add_argument('--max-files', type=int, default=15)
    a.add_argument('--ext', action='append', default=None); a.add_argument('--path'); a.add_argument('--message-regex')
    d = sub.add_parser('docs'); d.add_argument('repo'); d.add_argument('--json', action='store_true')
    b = sub.add_parser('signals'); b.add_argument('repo'); b.add_argument('--config', required=True)
    b.add_argument('--min', type=int, default=14); b.add_argument('--exclude', action='append', default=[])
    b.add_argument('--pattern', default=SIGNALS); b.add_argument('--json', action='store_true')
    for name in ('units', 'pool'):
        c = sub.add_parser(name); c.add_argument('bundle'); c.add_argument('--churn'); c.add_argument('--fix-churn')
        c.add_argument('--technical', default=TECHNICAL); c.add_argument('--json', action='store_true')
        if name == 'units': c.add_argument('--match', default='.')
        else:
            c.add_argument('--min-entries', type=int, default=0); c.add_argument('--top', type=int, default=150)
            c.add_argument('--hide-technical', action='store_true')
            c.add_argument('--sort', choices=['behaviour', 'decision', 'state', 'entries', 'churn'], default='behaviour')
    args = p.parse_args(argv)

    if args.cmd == 'churn':
        counts, commits = churn(args.repo, args.since, args.max_files, args.ext or ['.java'], args.path, args.message_regex)
        Path(args.out).write_text(json.dumps(counts, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
        print(f'{commits} commits read, {len(counts)} files counted -> {args.out}', file=sys.stderr)
        return
    if args.cmd == 'docs':
        rows = docs(args.repo)
        if args.json: print(json.dumps(rows, ensure_ascii=False, indent=1))
        else:
            for r in rows: print(f"{r['bytes']:8} {r['file']}")
        return
    if args.cmd == 'signals':
        rows = signals(args.repo, json.loads(Path(args.config).read_text()), args.min, args.exclude, args.pattern)
        if args.json: print(json.dumps(rows, ensure_ascii=False, indent=1))
        else:
            for r in rows: print(f"{r['signals']:5} {r['lines']:6}L {r['file']}")
        return
    churn_counts = json.loads(Path(args.churn).read_text()) if args.churn else None
    fix_counts = json.loads(Path(args.fix_churn).read_text()) if args.fix_churn else None
    rows = sorted(load_bundle(args.bundle), key=lambda r: (-r['entries'], r['unit']))
    if args.cmd == 'units':
        rx = re.compile(args.match)
        rows = [r for r in rows if rx.search(r['unit'])]
    else:
        total = len(rows)
        rows = [r for r in rows if r['entries'] >= args.min_entries]
    items = describe(rows, unit_files(args.bundle, rows), churn_counts, args.technical, fix_counts)
    if args.cmd == 'pool':
        if args.hide_technical: items = [x for x in items if not x['technical']]
        n = lambda v: -1 if v is None else v
        keys = dict(
            behaviour=lambda x: (-n(x['behaviour_entries']), -n(x['fix_churn']), -n(x['churn']), -x['deciding_methods'], -x['entries'], x['unit']),
            decision=lambda x: (-n(x['decision_entries']), -x['deciding_methods'], -n(x['churn']), x['unit']),
            state=lambda x: (-n(x['state_change_entries']), -x['changing_methods'], -n(x['churn']), x['unit']),
            entries=lambda x: (-x['entries'], x['unit']),
            churn=lambda x: (-n(x['churn']), -x['entries'], x['unit']))
        mode = args.sort
        if mode == 'behaviour' and all(x['behaviour_entries'] is None for x in items):
            mode = 'entries'   # bundle from before behaviour signals: keep the old order and say so
            print('# no behaviour signals in this bundle (older entry-flows export); sorted by entries', file=sys.stderr)
        items.sort(key=keys[mode])
        print(f'# pool: {total} units, shown {min(args.top, len(items))} of {len(items)} after filters', file=sys.stderr)
        items = items[:args.top]
    show(items, args.json)


if __name__ == '__main__':
    main()
