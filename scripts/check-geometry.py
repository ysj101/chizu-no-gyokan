#!/usr/bin/env python3
"""Check authored route against distributed generalized land; no navigational claim."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

def intersects(a, b, c, d):
    return cross(a, b, c)*cross(a, b, d) < 0 and cross(c, d, a)*cross(c, d, b) < 0

def inside(point, ring):
    x, y = point
    odd = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            odd = not odd
    return odd

def check():
    route = json.loads((ROOT/'src/route.json').read_text())
    countries = json.loads((ROOT/'public/data/countries.json').read_text())
    errors = []
    for feature in countries['features']:
        g = feature['geometry']
        polygons = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for polygon in polygons:
            for i, (a, b) in enumerate(zip(route, route[1:])):
                if any(inside(p, polygon[0]) and not any(inside(p, hole) for hole in polygon[1:]) for p in [a, b]):
                    errors.append(f"segment {i}: point on {feature['properties']['code']} land")
                if any(intersects(a, b, c, d) for ring in polygon for c, d in zip(ring, ring[1:])):
                    errors.append(f"segment {i}: crosses {feature['properties']['code']} coastline")
    if errors:
        raise SystemExit('\n'.join(sorted(set(errors))))
    print('Route: no land intersections in distributed Natural Earth geometry. Visual and human checks remain pending.')

if __name__ == '__main__':
    check()
