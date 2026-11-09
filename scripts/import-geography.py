#!/usr/bin/env python3
"""Retain original Natural Earth coordinates and only required country metadata."""
import argparse
import hashlib
import json
from pathlib import Path

SHA = '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb'
COUNTRIES = {
    'IDN': 'インドネシア', 'MYS': 'マレーシア', 'THA': 'タイ', 'MMR': 'ミャンマー',
    'SGP': 'シンガポール', 'VNM': 'ベトナム', 'KHM': 'カンボジア', 'LAO': 'ラオス',
    'BRN': 'ブルネイ', 'PHL': 'フィリピン', 'IND': 'インド', 'LKA': 'スリランカ',
    'BGD': 'バングラデシュ', 'CHN': '中国',
}
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('input', type=Path)
p.add_argument('--output', type=Path, default=Path('public/data/countries.json'))
args = p.parse_args()
raw = args.input.read_bytes()
if hashlib.sha256(raw).hexdigest() != SHA:
    raise SystemExit('Natural Earth input SHA256 mismatch')
data = json.loads(raw)
features = []
for feature in data['features']:
    code = feature['properties']['ADM0_A3']
    if code in COUNTRIES:
        features.append({'type': 'Feature', 'properties': {'code': code, 'name': COUNTRIES[code]},
                         'geometry': feature['geometry']})
if {f['properties']['code'] for f in features} != set(COUNTRIES):
    raise SystemExit('Required countries missing')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'type': 'FeatureCollection', 'features': features},
                                 ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Imported {len(features)} countries, {args.output.stat().st_size} bytes; original coordinates retained')
