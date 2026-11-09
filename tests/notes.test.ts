import { describe, expect, it } from 'vitest';
import { deleteNote, loadNotes, newestFirst, notePresentation, notesKey, parseNotes, saveNote, serializeNotes, validateMapState, validateNote } from '../src/notes';
import type { DiscoveryNote, NoteMapState, NoteStorage } from '../src/notes';
import type { ScenarioId } from '../src/domain';

function memory(initial: string | null = null): NoteStorage {
  let raw = initial;
  return { getItem: key => { expect(key).toBe(notesKey); return raw; }, setItem: (key, value) => { expect(key).toBe(notesKey); raw = value; } };
}
function state(scenarioId: ScenarioId = 'normal'): NoteMapState {
  return { scenarioId, layers: { borders: true, routes: true, points: true }, selectedFeatureId: 'malacca', viewport: { longitude: 106, latitude: 2, zoom: 4 } };
}
function note(id = 'note-1', mapState = state()): DiscoveryNote {
  return { id, body: ' 気づき\n比較 <img src=x onerror=alert(1)> ', createdAt: '2026-11-09T00:00:00.000Z', mapState };
}
function values(storage: NoteStorage) {
  const loaded = loadNotes(storage); if (!loaded.ok) throw new Error(loaded.error); return loaded.value;
}
describe('complete snapshots at the storage boundary', () => {
  for (const scenario of ['normal', 'malacca-closed-assumption'] as const) for (let bits = 0; bits < 8; bits++) {
    for (const selected of [null, scenario === 'normal' ? 'singapore' : 'lombok-route'] as const) {
      it(`${scenario}, layers ${bits}, selection ${selected}`, () => {
        const storage = memory();
        const snapshot: NoteMapState = { ...state(scenario), layers: { borders: Boolean(bits & 4), routes: Boolean(bits & 2), points: Boolean(bits & 1) }, selectedFeatureId: selected };
        const original = note('matrix', snapshot);
        expect(saveNote(storage, original).ok).toBe(true);
        expect(values(storage).notes).toEqual([original]);
        const display = notePresentation(original);
        expect(display.selection).toBe(selected === null ? '選択地点：選択なし' : scenario === 'normal' ? '選択地点：シンガポール' : '選択地点：ロンボク経由候補');
        for (const [id, name] of [['borders', '国境'], ['routes', '主要航路'], ['points', '注目地点']] as const) {
          expect(display.layers).toContain(`${name}：${snapshot.layers[id] ? '表示' : '非表示'}`);
        }
        expect(display.scenario).toBe(`保存時シナリオ：${scenario === 'normal' ? '通常時' : '通行不可（仮定）'}`);
        expect(display.date).toBe('2026/11/09 09:00:00 JST');
        const saved = values(storage).notes[0]!;
        snapshot.layers.routes = !snapshot.layers.routes; snapshot.viewport.zoom = 6;
        expect(values(storage).notes[0]).toEqual(saved);
      });
    }
  }
  it('clones validated snapshots and sorts by actual instant without mutating the input', () => {
    const raw = note(); const validated = validateNote(raw);
    expect(validated.ok).toBe(true);
    raw.mapState.layers.points = false; raw.mapState.viewport.longitude = 100;
    if (validated.ok) { expect(validated.value.mapState.layers.points).toBe(true); expect(validated.value.mapState.viewport.longitude).toBe(106); }
    const first = { ...note('first'), createdAt: '2026-11-09T09:00:00+09:00' };
    const later = { ...note('later'), createdAt: '2026-11-09T01:00:00.000Z' };
    const input = [first, later]; expect(newestFirst(input)).toEqual([later, first]); expect(input).toEqual([first, later]);
  });
});

describe('reject incomplete and damaged data without guessing', () => {
  const invalidStates: unknown[] = [undefined, null, {}, { ...state(), scenarioId: 'unknown' }, { ...state(), selectedFeatureId: undefined },
    { ...state(), selectedFeatureId: 'sunda' }, { ...state(), selectedFeatureId: 'unknown' },
    { ...state(), layers: ['borders'] }, { ...state(), layers: { borders: true, routes: true } },
    { ...state(), layers: { borders: 1, routes: true, points: true } },
    { ...state(), viewport: { longitude: 100, latitude: 1 } },
    ...[NaN, Infinity, -181, 181].map(longitude => ({ ...state(), viewport: { ...state().viewport, longitude } })),
    ...[NaN, -91, 91].map(latitude => ({ ...state(), viewport: { ...state().viewport, latitude } })),
    ...[NaN, 3, 8, '4'].map(zoom => ({ ...state(), viewport: { ...state().viewport, zoom } })),
  ];
  for (const key of ['scenarioId', 'layers', 'selectedFeatureId', 'viewport']) {
    const partial: Record<string, unknown> = { ...state() }; delete partial[key]; invalidStates.push(partial);
  }
  it.each(invalidStates.map((value, index) => ({ value, index })))('refuses invalid state $index before writing and on reload', ({ value }) => {
    const storage = memory(); const invalid = { ...note(), mapState: value };
    expect(validateMapState(value).ok).toBe(false); expect(saveNote(storage, invalid).ok).toBe(false);
    expect(storage.getItem(notesKey)).toBeNull();
    const parsed = parseNotes(serializeNotes([invalid, note('valid')]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) { expect(parsed.value.unreadable).toBe(1); expect(parsed.value.notes.map(n => n.id)).toEqual(['valid']); }
  });
  it.each([null, {}, { ...note(), id: '' }, { ...note(), body: '\n　 ' }, { ...note(), createdAt: 'not-a-date' }, { ...note(), createdAt: '2026-11-09' }, { ...note(), createdAt: '2026-02-30T00:00:00.000Z' }, { ...note(), createdAt: '2026-11-09T24:00:00.000Z' }])('rejects invalid note metadata', value => {
    expect(validateNote(value).ok).toBe(false);
  });
  it.each(['{', 'null', '[]', '{"version":2,"notes":[]}', '{"version":1}', '{"notes":[]}'])('refuses broken JSON or an unsupported envelope: %s', raw => {
    expect(parseNotes(raw).ok).toBe(false);
    const storage = memory(raw); expect(saveNote(storage, note()).ok).toBe(false); expect(storage.getItem(notesKey)).toBe(raw);
  });
  it('counts all bad records including duplicate identifiers, and preserves rejected records through mutations', () => {
    const bad = { body: 'missing state' };
    const storage = memory(serializeNotes([bad, note('duplicate'), note('duplicate'), note('valid')]));
    expect(values(storage).unreadable).toBe(3); expect(values(storage).notes.map(n => n.id)).toEqual(['valid']);
    expect(saveNote(storage, note('new')).ok).toBe(true);
    expect(deleteNote(storage, 'valid').ok).toBe(true);
    expect(values(storage).unreadable).toBe(3); expect(values(storage).records).toContainEqual(bad);
    expect(values(storage).notes.map(n => n.id)).toEqual(['new']);
  });
});

describe('storage failures and deletion', () => {
  it('returns read errors, write exceptions and quota failures without a successful note', () => {
    const denied: NoteStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadNotes(denied).ok).toBe(false); expect(saveNote(denied, note()).ok).toBe(false); expect(deleteNote(denied, 'note-1').ok).toBe(false);
    const storage = memory(serializeNotes([note('kept')]));
    const full: NoteStorage = { getItem: storage.getItem, setItem() { throw new Error('QuotaExceededError'); } };
    expect(saveNote(full, note('failed')).ok).toBe(false); expect(deleteNote(full, 'kept').ok).toBe(false);
    expect(values(storage).notes).toEqual([note('kept')]);
  });
  it('deletes just one, persists the rest and handles empty storage and absent IDs', () => {
    const storage = memory(); expect(values(storage).notes).toEqual([]);
    expect(saveNote(storage, note('one')).ok).toBe(true); expect(saveNote(storage, note('two')).ok).toBe(true);
    expect(saveNote(storage, note('one')).ok).toBe(false);
    expect(deleteNote(storage, 'missing').ok).toBe(false);
    expect(deleteNote(storage, 'one').ok).toBe(true); expect(values(storage).notes).toEqual([note('two')]);
    expect(deleteNote(storage, 'two').ok).toBe(true); expect(values(storage).notes).toEqual([]);
  });
});
