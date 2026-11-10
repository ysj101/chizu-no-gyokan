import { describe, expect, it } from 'vitest';
import { chainLimit, destination, japanChain, japanDirection } from '../src/relations';
import routeData from '../src/route.json';
import candidateRoutes from '../src/candidate-routes.json';
import { sourceRegistry } from '../src/domain';

const normal = { kind: 'normal' } as const; const closed = { kind: 'malacca-closed-assumption' } as const;
const views = [japanChain(normal, null), japanChain(normal, 'sunda'), japanChain(closed, null), japanChain(closed, 'sunda'), japanChain(closed, 'lombok')];

describe('GP-03 the chain towards Japan', () => {
  it('starts where every authored route ends and leaves the map as a direction', () => {
    const end = japanDirection[0];
    expect(routeData[routeData.length - 1]).toEqual(end);
    for (const route of Object.values(candidateRoutes)) expect(route[route.length - 1]).toEqual(end);
    expect(destination.coordinate).toEqual(japanDirection[japanDirection.length - 1]);
    expect(destination.name).toContain('地図の外'); expect(chainLimit).toContain('示しません');
  });
  it('follows the condition and the candidate along the map', () => {
    expect(japanChain(normal, null).features).toEqual(['malacca', 'normal-route']);
    expect(japanChain(normal, 'sunda')).toEqual(japanChain(normal, null));
    expect(japanChain(closed, null).features).toEqual(['malacca', 'sunda-route', 'lombok-route', 'sunda', 'lombok']);
    expect(japanChain(closed, 'lombok').features).toEqual(['malacca', 'lombok-route', 'lombok']);
    expect(japanChain(closed, null).change.text).toContain('別の海峡を検討する必要がある');
    expect(japanChain(closed, 'sunda').change.text).toContain('スンダ海峡を経由する位置関係');
  });
  it('labels what is assumed, keeps sources real, and states no numbers or verdicts', () => {
    for (const view of views) {
      for (const statement of [view.change, view.finding]) {
        for (const source of statement.sources) expect(sourceRegistry[source]).toBeDefined();
        expect(statement.text).not.toMatch(/[0-9０-９]|％|%|日伸び|上がる|通航可能|迂回した/);
      }
      expect(view.next).toMatch(/^次に：/);
    }
    expect(japanChain(normal, null).change.classification).not.toBe('assumption');
    for (const view of views.slice(2)) expect(view.change.classification).toBe('assumption');
  });
});
