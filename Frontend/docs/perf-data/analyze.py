"""사용: python3 analyze.py runs.csv sentry1.csv [sentry2.csv ...]
runs.csv의 실행 시각과 Sentry app.startup 행을 시간으로 짝지어 커밋·시나리오별 p50/p75를 낸다."""
import csv, sys, math, statistics as st
from datetime import datetime, timezone, timedelta

def ts(s):
    s = s.replace('Z', '+00:00')
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)

runs = [r for r in csv.DictReader(open(sys.argv[1]))]
for r in runs: r['t'] = ts(r['launched_at_utc'])
rows = []
for f in sys.argv[2:]:
    for r in csv.DictReader(open(f)):
        if r.get('span.name', 'app.startup').startswith('app.startup'):
            r['t'] = ts(r['timestamp']); rows.append(r)

def col(r, *names):
    for n in names:
        for k in r:
            if k.endswith(n) and r[k] not in ('', None):
                return r[k]
    return None

def p75(v):
    v = sorted(v); return v[math.ceil(0.75 * len(v)) - 1]

groups, unmatched = {}, 0
for r in rows:
    best = min(runs, key=lambda x: abs((x['t'] - r['t']).total_seconds()))
    if abs((best['t'] - r['t']).total_seconds()) > 6: unmatched += 1; continue
    name = r.get('span.name', 'app.startup')
    key = (best['scenario'], best['commit'] + ('' if name == 'app.startup' else ' ' + name.replace('app.startup.', '')))
    g = groups.setdefault(key, {'ttid': [], 'ttfd': [], 'dur': [], 'outcome': []})
    g['dur'].append(float(r['span.duration']))
    v = col(r, 'time_to_initial_display');  v and g['ttid'].append(float(v))
    v = col(r, 'time_to_full_display');     v and g['ttfd'].append(float(v))
    g['outcome'].append(col(r, 'startup.outcome') or '?')

order = sorted({k[1] for k in groups}, key=lambda c: (['ee3d2fc4','d71ac660','110c1a13','8adbba5b','4947c0fb','2644a433-nocache','2644a433'].index(c.split()[0]) if c.split()[0] in ['ee3d2fc4','d71ac660','110c1a13','8adbba5b','4947c0fb','2644a433-nocache','2644a433'] else 99, c))
for sc in sorted({k[0] for k in groups}):
    print(f'## {sc}')
    print('commit    n  TTID p50  p75 | TTFD p50  p75 | dur p50  p75 | outcomes')
    for c in order:
        g = groups.get((sc, c))
        if not g: print(c, '-'); continue
        f = lambda v: (f'{round(st.median(v)):>6} {round(p75(v)):>5}' if v else '     -     -')
        oc = {o: g['outcome'].count(o) for o in set(g['outcome'])}
        print(f"{c:<34} {len(g['dur']):>2} {f(g['ttid'])} | {f(g['ttfd'])} | {f(g['dur'])} | {oc}")
print('unmatched rows', unmatched)
