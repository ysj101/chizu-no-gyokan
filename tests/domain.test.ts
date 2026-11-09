import { describe, expect, it } from 'vitest';
import countries from '../public/data/countries.json';
import { parseCountries, parseRoute } from '../src/domain';

function fixture(): unknown { return structuredClone(countries); }
describe('geographic JSON trust boundary', () => {
  it('keeps the original positions but drops unconsumed attributes', () => {
    const parsed = parseCountries(fixture());
    expect(parsed.features).toHaveLength(14);
    expect(parsed.features.map(feature => feature.geometry)).toEqual(countries.features.map(feature => feature.geometry));
    expect(Object.keys(parsed.features[0]?.properties ?? {}).sort()).toEqual(['code', 'name']);
  });
  it.each([null, {}, { type: 'FeatureCollection', features: [] }, '<img src=x onerror=alert(1)>'])(
    'rejects invalid collection %j', value => expect(() => parseCountries(value)).toThrow());
  it('rejects missing countries, invalid coordinates and unclosed polygons', () => {
    for (const mutation of ['country', 'coordinate', 'ring']) {
      const value = structuredClone(countries);
      const first = value.features[0];
      if (!first) throw new Error('Fixture missing');
      if (mutation === 'country') first.properties.code = 'XXX';
      else {
        // Replacing geometry avoids depending on which country is first in the upstream file.
        first.geometry = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], mutation === 'coordinate' ? [181, 0] : [0, 1]]]] };
      }
      expect(() => parseCountries(value)).toThrow();
    }
  });
});
describe('route model boundary', () => {
  it('preserves explicit longitude / latitude order', () => expect(parseRoute([[100, 3], [104, 1]])).toEqual([[100, 3], [104, 1]]));
  it.each<{ value: unknown }>([
    { value: [] },
    { value: [[100, 3]] },
    { value: [[NaN, 2], [104, 1]] },
    { value: [[100, 91], [104, 1]] },
    { value: [[100, 1, 0], [104, 1]] },
    { value: [['100', 1], [104, 1]] },
  ])('rejects malformed model $value', ({ value }) => expect(() => parseRoute(value)).toThrow());
});

import { scenarios, scenarioDefinition, selectionForScenario, scenarioExplanation, routeStyles, sourceRegistry } from '../src/domain';
import { features } from '../src/content';
import type { Scenario } from '../src/domain';
const normal: Scenario = { kind: 'normal' };
const closed: Scenario = { kind: 'malacca-closed-assumption' };
describe('scenario projection', () => {
  it('defines only sourced candidates, with model geometry and distinct line types', () => {
    expect(Object.keys(scenarios)).toEqual(['normal', 'malacca-closed-assumption']);
    expect(new Set(Object.values(routeStyles).map(style => style.dashArray)).size).toBe(3);
    for (const scenario of [normal, closed]) {
      const definition = scenarioDefinition(scenario);
      for (const id of definition.featureIds) {
        const feature = features.find(item => item.id === id);
        expect(feature).toBeDefined();
        for (const source of feature!.sources) expect(sourceRegistry[source].usage).toBeTruthy();
        if (feature!.kind === 'route') expect(definition.routeRole[id]).toBeDefined();
      }
    }
    for (const id of ['sunda-route', 'lombok-route'] as const) {
      const candidate = features.find(feature => feature.id === id)!;
      expect(candidate.classification).toBe('teaching-model');
      expect(candidate.sources).toContain('eia');
      expect(candidate.limitation).toContain('未収録');
      expect(candidate.kind === 'route' && candidate.coordinates.length > 2).toBe(true);
    }
  });
  it('restores normal projection without mutating definitions or common selection', () => {
    const before = structuredClone(scenarios.normal);
    for (const id of scenarios.normal.featureIds) {
      expect(selectionForScenario(id, closed)).toBe(id);
      expect(selectionForScenario(id, normal)).toBe(id);
      expect(scenarioExplanation(id, closed)).not.toBe(scenarioExplanation(id, normal));
    }
    for (const id of ['sunda', 'lombok', 'sunda-route', 'lombok-route'] as const) {
      expect(selectionForScenario(id, closed)).toBe(id);
      expect(selectionForScenario(id, normal)).toBe('malacca');
    }
    expect(scenarios.normal).toEqual(before);
    expect(scenarioDefinition(normal).routeRole['normal-route']).toBe('normal');
    expect(scenarioDefinition(closed).routeRole['normal-route']).toBe('unavailable');
  });
});

import { detailItems, classificationLabels } from '../src/details';
describe('selected detail evidence', () => {
  it('covers every visible target with classified, sourced fields and explicit missing values', () => {
    for (const scenario of [normal, closed]) for (const id of scenarioDefinition(scenario).featureIds) {
      const items = detailItems(id, scenario);
      expect(items.map(item => item.label)).toEqual(['名称', '位置（地域）', '短い解説', '関連航路・関連地点', '現在シナリオでの意味', '注意事項', '距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用']);
      expect(items.find(item => item.label === '名称')).toMatchObject({ text: features.find(feature => feature.id === id)!.name });
      for (const item of items) {
        expect(classificationLabels[item.classification]).toBeTruthy();
        expect(item.sources.length).toBeGreaterThan(0);
        for (const sourceId of item.sources) {
          const source = sourceRegistry[sourceId];
          for (const key of ['title', 'url', 'consulted', 'updated', 'period', 'usage', 'rights', 'rightsUrl'] as const) expect(source[key]).toBeTruthy();
        }
        if (item.status === 'unrecorded') {
          expect(item.reason).toContain('ゼロや無影響を意味しません');
          expect('text' in item).toBe(false);
        }
      }
      expect(items.filter(item => item.status === 'unrecorded').map(item => item.label)).toEqual(['距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用']);
    }
    expect(sourceRegistry.naturalEarth.updated).toContain('不明');
    expect(sourceRegistry.eia.updated).toBe('2026-03-03');
  });
  it('derives round trips from the same selection and shared scenario explanation without mutating data', () => {
    for (const id of scenarios.normal.featureIds) {
      const before = detailItems(id, normal);
      const changed = detailItems(id, closed);
      expect(changed.find(item => item.label === '現在シナリオでの意味')).toMatchObject({ classification: 'assumption', text: scenarioExplanation(id, closed) });
      expect(before.find(item => item.label === '現在シナリオでの意味')).toMatchObject({ classification: 'explanation', text: scenarioExplanation(id, normal) });
      expect(changed.find(item => item.label === '注意事項')).not.toEqual(before.find(item => item.label === '注意事項'));
      expect(detailItems(id, normal)).toEqual(before);
    }
    for (const id of ['malacca', 'sunda', 'lombok'] as const) expect(detailItems(id, closed).find(item => item.label === '短い解説')).toMatchObject({ classification: 'fact', sources: ['eia'] });
    for (const feature of features.filter(feature => feature.kind === 'route')) expect(detailItems(feature.id, closed).find(item => item.label === '短い解説')?.classification).toBe('explanation');
  });
});
