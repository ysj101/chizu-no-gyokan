import { describe, expect, it } from 'vitest';
import { addDiscovery, chainDiscovery, discoveries, discoveriesKey, discoveryNodes, loadDiscoveries, parseDiscoveries, removeDiscovery } from '../src/discoveries';
import { notesKey } from '../src/notes';
import { sourceRegistry } from '../src/domain';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const normal = { kind: 'normal' } as const; const closed = { kind: 'malacca-closed-assumption' } as const;

describe('GP-05 discovery map', () => {
  it('maps each state of the chain to one sourced relation between known places', () => {
    expect(chainDiscovery(normal, null)).toBe('malacca-japan'); expect(chainDiscovery(normal, 'sunda')).toBe('malacca-japan');
    expect(chainDiscovery(closed, null)).toBe('malacca-alternatives');
    expect(chainDiscovery(closed, 'sunda')).toBe('sunda-japan'); expect(chainDiscovery(closed, 'lombok')).toBe('lombok-japan');
    for (const discovery of Object.values(discoveries)) {
      for (const [from, to] of discovery.edges) { expect(discoveryNodes[from]).toBeDefined(); expect(discoveryNodes[to]).toBeDefined(); }
      for (const source of discovery.sources) expect(sourceRegistry[source]).toBeDefined();
      expect(discovery.text).not.toMatch(/[0-9]|％|%|上がる|通航可能|迂回した/);
    }
    expect(discoveries['malacca-alternatives'].classification).toBe('assumption');
  });
  it('adds once, keeps the order found, removes, and never touches the notes', () => {
    const storage = memory({ [notesKey]: '{"version":1,"notes":[]}' });
    const first = addDiscovery(storage, 'malacca-japan', new Date('2026-11-11T00:00:00Z'));
    const again = addDiscovery(storage, 'malacca-japan', new Date('2026-11-12T00:00:00Z'));
    addDiscovery(storage, 'malacca-alternatives', new Date('2026-11-13T00:00:00Z'));
    expect(first.ok && again.ok && again.value.found).toEqual([{ id: 'malacca-japan', addedAt: '2026-11-11T00:00:00.000Z' }]);
    const loaded = loadDiscoveries(storage);
    expect(loaded.ok && loaded.value.found.map(entry => entry.id)).toEqual(['malacca-japan', 'malacca-alternatives']);
    const removed = removeDiscovery(storage, 'malacca-japan');
    expect(removed.ok && removed.value.found.map(entry => entry.id)).toEqual(['malacca-alternatives']);
    expect(storage.data.get(notesKey)).toBe('{"version":1,"notes":[]}');
  });
  it('counts unknown or repeated records and refuses unreadable data without overwriting it', () => {
    const parsed = parseDiscoveries(JSON.stringify({ version: 1, discoveries: [
      { id: 'malacca-japan', addedAt: '2026-11-11T00:00:00.000Z' }, { id: 'malacca-japan', addedAt: '2026-11-12T00:00:00.000Z' },
      { id: 'click-on-penang', addedAt: '2026-11-11T00:00:00.000Z' }, { id: 'sunda-japan', addedAt: 'later' }] }));
    expect(parsed.ok && parsed.value).toEqual({ found: [{ id: 'malacca-japan', addedAt: '2026-11-11T00:00:00.000Z' }], unreadable: 3 });
    expect(parseDiscoveries('{').ok).toBe(false); expect(parseDiscoveries('{"version":2,"discoveries":[]}').ok).toBe(false);
    const storage = memory({ [discoveriesKey]: '{' });
    expect(addDiscovery(storage, 'malacca-japan', new Date()).ok).toBe(false);
    expect(storage.data.get(discoveriesKey)).toBe('{');
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadDiscoveries(denied).ok).toBe(false);
  });
});
