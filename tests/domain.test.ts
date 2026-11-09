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
