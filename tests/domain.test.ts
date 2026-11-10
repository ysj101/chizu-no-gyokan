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

import { scenarios, scenarioDefinition, selectionForScenario, scenarioExplanation, routeStyles, sourceRegistry, featureSymbol, featureRole, changedFeatureIds } from '../src/domain';
import { features, featureById } from '../src/content';
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
        if (feature!.kind === 'route') expect(featureRole(id, scenario)).toBeDefined();
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
      expect(scenarioExplanation(featureById(id), closed)).not.toBe(scenarioExplanation(featureById(id), normal));
    }
    for (const id of ['sunda', 'lombok', 'sunda-route', 'lombok-route'] as const) {
      expect(selectionForScenario(id, closed)).toBe(id);
      expect(selectionForScenario(id, normal)).toBe('malacca');
    }
    expect(scenarios.normal).toEqual(before);
    expect(featureRole('normal-route', normal)).toBe('normal');
    expect(featureRole('normal-route', closed)).toBe('unavailable');
    expect(featureRole('malacca', closed)).toBe('unavailable'); expect(featureRole('sunda', normal)).toBeUndefined();
  });
  it('explains each condition as two or three labelled changes whose features match the derived diff', () => {
    expect(scenarios.normal.changes.map(change => change.kind)).toEqual(['shown', 'hidden']);
    expect(scenarios['malacca-closed-assumption'].changes.map(change => change.kind)).toEqual(['assumption', 'changed', 'added']);
    const text = scenarios['malacca-closed-assumption'].changes.map(change => change.text).join('');
    for (const mark of ['×◇', '＋◇', '点線', '長短破線', '運航の可否は示しません', '現実の規制や出来事ではありません']) expect(text).toContain(mark);
    // The prose and the highlighted set describe the same difference.
    const listed = scenarios['malacca-closed-assumption'].changes.flatMap(change => change.features);
    expect([...listed].sort()).toEqual([...changedFeatureIds(normal, closed, features)].sort());
    expect(scenarios.normal.changes.find(change => change.kind === 'shown')!.features.slice().sort()).toEqual([...scenarios.normal.featureIds].sort());
    expect(scenarios.normal.changes.find(change => change.kind === 'hidden')!.features.slice().sort()).toEqual(
      scenarios['malacca-closed-assumption'].featureIds.filter(id => !(scenarios.normal.featureIds as readonly string[]).includes(id)).sort());
  });
  it('derives the changed features symmetrically from roles', () => {
    const forward = changedFeatureIds(normal, closed, features); const back = changedFeatureIds(closed, normal, features);
    expect([...forward].sort()).toEqual(['lombok', 'lombok-route', 'malacca', 'normal-route', 'sunda', 'sunda-route']);
    expect([...back].sort()).toEqual([...forward].sort());
    expect(changedFeatureIds(normal, normal, features)).toEqual([]); expect(changedFeatureIds(closed, closed, features)).toEqual([]);
    const byId = (id: string) => features.find(feature => feature.id === id)!;
    expect(featureSymbol(byId('malacca'), normal)).toBe('◇'); expect(featureSymbol(byId('malacca'), closed)).toBe('×◇');
    expect(featureSymbol(byId('sunda'), closed)).toBe('＋◇'); expect(featureSymbol(byId('singapore'), closed)).toBe('●');
    expect(featureSymbol(byId('normal-route'), normal)).toBe('┄'); expect(featureSymbol(byId('normal-route'), closed)).toBe('×┄');
    expect(featureSymbol(byId('sunda-route'), closed)).toBe('＋┄');
  });
});

import { detailView, unrecordedFields } from '../src/details';
import { classificationLabels, classificationTags } from '../src/domain';
import type { DetailView } from '../src/details';
const detailItems = (view: DetailView) => [view.overview, view.why, view.related, view.scenario, ...view.more];
describe('selected detail evidence', () => {
  it('covers every visible target in three tiers with classified, sourced items and one explicit missing-data item', () => {
    for (const scenario of [normal, closed]) for (const id of scenarioDefinition(scenario).featureIds) {
      const view = detailView(id, scenario);
      const feature = features.find(feature => feature.id === id)!;
      expect(view.overview).toMatchObject({ label: '概要', text: feature.description, sources: feature.sources });
      expect(view.overview.classification).toBe(feature.classification === 'geographic-fact' ? 'fact' : 'explanation');
      expect(view.why.label).toBe('なぜ重要か'); expect(view.related.label).toBe('関連する場所'); expect(view.scenario.label).toBe('現在の条件での意味');
      // Related places are ids with a reason; availability follows the condition, never the other way round.
      expect(view.relatedLinks.length).toBeGreaterThan(0);
      for (const link of view.relatedLinks) {
        expect(link.id).not.toBe(id);
        expect(features.some(feature => feature.id === link.id)).toBe(true);
        expect(link.reason.length).toBeGreaterThan(0);
        expect(link.available).toBe(scenarioDefinition(scenario).featureIds.includes(link.id));
        expect(link.hint === '').toBe(link.available); if (!link.available) expect(link.note).toContain(link.name);
        expect(link.note === '').toBe(link.available);
        expect(view.related.status === 'recorded' && view.related.text).toContain(link.name);
      }
      expect(new Set(view.relatedLinks.map(link => link.id)).size).toBe(view.relatedLinks.length);
      const labels = view.more.map(item => item.label);
      expect(labels.slice(0, 2)).toEqual(['位置（地域）', '注意事項']);
      expect(labels.at(-1)).toBe('この教材では扱わないデータ');
      expect(labels.includes('用語')).toBe(['malacca', 'sunda', 'lombok'].includes(id));
      for (const item of detailItems(view)) {
        expect(classificationLabels[item.classification]).toBeTruthy();
        expect(classificationTags[item.classification]).toBeTruthy();
        expect(item.sources.length).toBeGreaterThan(0);
        for (const sourceId of item.sources) {
          const source = sourceRegistry[sourceId];
          for (const key of ['title', 'url', 'consulted', 'updated', 'period', 'usage', 'rights', 'rightsUrl'] as const) expect(source[key]).toBeTruthy();
        }
        if (item.status === 'unrecorded') {
          expect(item.fields).toEqual(unrecordedFields);
          expect(item.reason).toContain('ゼロや無影響を意味しません');
          expect('text' in item).toBe(false);
        }
      }
      expect(detailItems(view).filter(item => item.status === 'unrecorded')).toHaveLength(1);
      // Evidence lists each source once, with every item that cites it.
      expect(new Set(view.evidence.map(entry => entry.source)).size).toBe(view.evidence.length);
      for (const entry of view.evidence) expect(entry.items).toEqual(detailItems(view).filter(item => item.sources.includes(entry.source)).map(item => item.label));
      for (const item of detailItems(view)) for (const source of item.sources) expect(view.evidence.some(entry => entry.source === source)).toBe(true);
    }
    expect(sourceRegistry.naturalEarth.updated).toContain('不明');
    expect(sourceRegistry.eia.updated).toBe('2026-03-03');
  });
  it('derives round trips from the same selection and shared scenario explanation without mutating data', () => {
    for (const id of scenarios.normal.featureIds) {
      const before = detailView(id, normal);
      const changed = detailView(id, closed);
      expect(changed.scenario).toMatchObject({ classification: 'assumption', text: scenarioExplanation(featureById(id), closed) });
      expect(before.scenario).toMatchObject({ classification: 'explanation', text: scenarioExplanation(featureById(id), normal) });
      expect(changed.more.find(item => item.label === '注意事項')).not.toEqual(before.more.find(item => item.label === '注意事項'));
      expect(changed.why).toEqual(before.why); expect(changed.related).toEqual(before.related);
      expect(detailView(id, normal)).toEqual(before);
    }
    for (const id of ['malacca', 'sunda', 'lombok'] as const) expect(detailView(id, closed).why).toMatchObject({ classification: 'fact', sources: ['eia'] });
    for (const feature of features.filter(feature => feature.kind === 'route')) expect(detailView(feature.id, closed).why.classification).toBe('explanation');
  });
});

import { layerPresentation, hiddenFeatureMessage, featureLayer } from '../src/domain';
import type { LayerVisibility } from '../src/domain';
const combinations: LayerVisibility[] = Array.from({ length: 8 }, (_, bits) => ({
  borders: Boolean(bits & 4), routes: Boolean(bits & 2), points: Boolean(bits & 1),
}));
describe('independent layer presentation in both scenarios', () => {
  for (const scenario of [normal, closed]) {
    it.each(combinations)(`${scenario.kind}: %j`, visibility => {
      const original = structuredClone(visibility);
      const view = layerPresentation(visibility, scenario);
      const borders = visibility.borders ? '表示中' : '非表示';
      const routes = visibility.routes ? '表示中' : '非表示';
      const points = visibility.points ? '表示中' : '非表示';
      expect(view.status).toBe(`国境：${borders} / 主要航路：${routes} / 注目地点：${points}`);
      expect(view.legends).toEqual({
        borders: { text: `国境・海岸（地理）（${borders}）`, hidden: false, off: !visibility.borders },
        normal: { text: `${scenario.kind === 'normal' ? '通常主要航路（破線・概略モデル）' : '通常主要航路：使用しない比較線（点線・仮定）'}（${routes}）`, hidden: false, off: !visibility.routes },
        candidate: { text: `追加：スンダ・ロンボク経由候補（長短破線・概略モデル）（${routes}）`, hidden: scenario.kind === 'normal', off: !visibility.routes },
        strait: { text: `海峡の代表点（${points}）`, hidden: false, off: !visibility.points },
        place: { text: `関連地点の代表点（${points}）`, hidden: false, off: !visibility.points },
      });
      if (Object.values(visibility).every(Boolean)) expect(view.explanation).toBe('');
      else {
        // The land/sea reassurance is about borders; it is said only when borders are the hidden layer.
        expect(view.explanation.includes('陸地の塗りと海域名は残します')).toBe(!visibility.borders);
        expect(view.explanation).toContain('選択と詳細は保持します');
      }
      expect(view.scenarioSummary.title).toBe(scenarioDefinition(scenario).summaryTitle);
      expect(view.scenarioSummary.changes).toEqual(scenarioDefinition(scenario).changes);
      expect(view.scenarioSummary.notes.some(note => note.includes('主要航路レイヤーが非表示'))).toBe(!visibility.routes);
      expect(view.scenarioSummary.notes.some(note => note.includes('注目地点レイヤーが非表示'))).toBe(!visibility.points);
      for (const feature of features) {
        const layer = feature.kind === 'route' ? 'routes' : 'points';
        expect(featureLayer(feature)).toBe(layer);
        expect(hiddenFeatureMessage(feature, visibility)).toBe(visibility[layer] ? ''
          : `この対象は現在地図上で非表示（${layer === 'routes' ? '主要航路' : '注目地点'}レイヤーが非表示）`);
      }
      expect(visibility).toEqual(original);
    });
  }
});
