import { describe, expect, it } from 'vitest';
import { perspectiveIds, perspectiveTitle, perspectives } from '../src/perspectives';
import { scenarios, sourceRegistry } from '../src/domain';

const statementsOf = (id: typeof perspectiveIds[number]) => [perspectives[id].meaning, ...perspectives[id].statements];

describe('country perspectives (teaching examples)', () => {
  it('lists the four example countries, each with 2-5 statements and a focus that includes Malacca', () => {
    expect(perspectiveIds).toEqual(['japan', 'singapore', 'china', 'indonesia']);
    const shown = new Set<string>([...scenarios.normal.featureIds, ...scenarios['malacca-closed-assumption'].featureIds]);
    for (const id of perspectiveIds) {
      const view = perspectives[id];
      expect(perspectiveTitle(view)).toBe(`${view.name}から見たマラッカ海峡`);
      expect(view.statements.length).toBeGreaterThanOrEqual(2); expect(view.statements.length).toBeLessThanOrEqual(5);
      expect(new Set(view.focus).size).toBe(view.focus.length);
      for (const featureId of view.focus) expect(shown.has(featureId)).toBe(true);
      // Every country includes Malacca, so the same strait can be compared across views.
      expect(view.focus).toContain('malacca');
    }
  });
  it('keeps facts and readings apart: numbers only in facts from a non-author public-domain source with a data period', () => {
    for (const id of perspectiveIds) for (const statement of statementsOf(id)) {
      if (statement.classification === 'fact') {
        const external = statement.sources.filter(source => source !== 'author');
        expect(external.length).toBeGreaterThan(0);
        for (const source of external) expect(sourceRegistry[source].rights).toContain('public domain');
        if (/\d/.test(statement.text)) expect(statement.period).toMatch(/20\d\d/);
      } else {
        expect(statement.text).not.toMatch(/\d/);
        expect(statement.sources).toEqual(['author']);
        expect(statement.period).toBeUndefined();
      }
    }
  });
  it('avoids wording that asserts a state\'s intent (a quick lexical check; the human test decides)', () => {
    const banned = /意図|狙い|野心|脅威|支配|企て/;
    for (const id of perspectiveIds) for (const statement of statementsOf(id)) expect(statement.text).not.toMatch(banned);
  });
});
