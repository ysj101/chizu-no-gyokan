import { features } from './content';
import { layerIds, layerNames, scenarios } from './domain';
import type { LayerVisibility, ScenarioId, SelectedFeatureId } from './domain';

export interface NoteMapState {
  scenarioId: ScenarioId;
  layers: LayerVisibility;
  selectedFeatureId: SelectedFeatureId | null;
  viewport: { longitude: number; latitude: number; zoom: number };
}
export interface DiscoveryNote { id: string; body: string; createdAt: string; mapState: NoteMapState }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface NoteStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const notesKey = 'chizu-no-gyokan.notes.v1';
interface NoteCollection { notes: DiscoveryNote[]; unreadable: number; records: unknown[] }
const failure = (error: string): { ok: false; error: string } => ({ ok: false, error });
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export function validateMapState(value: unknown): Result<NoteMapState> {
  if (!record(value) || (value.scenarioId !== 'normal' && value.scenarioId !== 'malacca-closed-assumption') ||
      !record(value.layers) || !layerIds.every(id => typeof (value.layers as Record<string, unknown>)[id] === 'boolean') ||
      !record(value.viewport)) return failure('地図状態が完全ではありません。');
  const { longitude, latitude, zoom } = value.viewport;
  const selected = value.selectedFeatureId;
  if (!finite(longitude) || longitude < -180 || longitude > 180 || !finite(latitude) || latitude < -90 || latitude > 90 ||
      !finite(zoom) || zoom < 4 || zoom > 7 ||
      !(selected === null || (typeof selected === 'string' && scenarios[value.scenarioId].featureIds.some(id => id === selected)))) {
    return failure('地図状態が完全ではありません。');
  }
  return { ok: true, value: {
    scenarioId: value.scenarioId, selectedFeatureId: selected as SelectedFeatureId | null,
    layers: { borders: value.layers.borders as boolean, routes: value.layers.routes as boolean, points: value.layers.points as boolean },
    viewport: { longitude, latitude, zoom },
  } };
}
function isoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const local = new Date(`${value.slice(0, 19)}.000Z`);
  return Number.isFinite(local.getTime()) && local.toISOString().slice(0, 19) === value.slice(0, 19) && Number.isFinite(Date.parse(value));
}
export function validateNote(value: unknown): Result<DiscoveryNote> {
  if (!record(value) || typeof value.id !== 'string' || !value.id.trim() || typeof value.body !== 'string' || !value.body.trim() ||
      !isoTimestamp(value.createdAt)) return failure('メモの形式が正しくありません。');
  const state = validateMapState(value.mapState);
  return state.ok ? { ok: true, value: { id: value.id, body: value.body, createdAt: value.createdAt, mapState: state.value } } : state;
}
export function newestFirst(notes: readonly DiscoveryNote[]): DiscoveryNote[] {
  return [...notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function parseNotes(raw: string | null): Result<NoteCollection> {
  if (raw === null) return { ok: true, value: { notes: [], unreadable: 0, records: [] } };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return failure('読み込めない記録が1件あります。保存データの形式が正しくありません。'); }
  if (!record(value) || value.version !== 1 || !Array.isArray(value.notes)) {
    const count = record(value) && Array.isArray(value.notes) ? value.notes.length : 1;
    return failure(`読み込めない記録が${count}件あります。保存データのバージョンまたは形式に対応していません。`);
  }
  const records: unknown[] = value.notes;
  const parsed = records.map(validateNote);
  const counts = new Map<string, number>();
  for (const note of parsed) if (note.ok) counts.set(note.value.id, (counts.get(note.value.id) ?? 0) + 1);
  const notes = parsed.flatMap(note => note.ok && counts.get(note.value.id) === 1 ? [note.value] : []);
  return { ok: true, value: { records, notes: newestFirst(notes), unreadable: records.length - notes.length } };
}
// Keep rejected records unchanged, without presenting them as valid or guessing missing state.
export function serializeNotes(records: readonly unknown[]): string { return JSON.stringify({ version: 1, notes: records }); }
export function loadNotes(storage: NoteStorage): Result<NoteCollection> {
  try { return parseNotes(storage.getItem(notesKey)); } catch { return failure('メモを読み込めませんでした。このブラウザの保存領域を利用できません。'); }
}
function writeNotes(storage: NoteStorage, records: unknown[]): Result<NoteCollection> {
  try {
    const raw = serializeNotes(records);
    storage.setItem(notesKey, raw);
    return parseNotes(raw);
  } catch { return failure('保存領域に書き込めませんでした。'); }
}
export function saveNote(storage: NoteStorage, value: unknown): Result<NoteCollection> {
  const note = validateNote(value);
  if (!note.ok) return note;
  const loaded = loadNotes(storage);
  if (!loaded.ok) return loaded;
  if (loaded.value.records.some(item => record(item) && item.id === note.value.id)) return failure('メモの識別子が重複しています。');
  return writeNotes(storage, [...loaded.value.records, note.value]);
}
export function deleteNote(storage: NoteStorage, id: string): Result<NoteCollection> {
  const loaded = loadNotes(storage);
  if (!loaded.ok) return loaded;
  if (!loaded.value.notes.some(note => note.id === id)) return failure('削除するメモを確認できませんでした。');
  return writeNotes(storage, loaded.value.records.filter(item => !(record(item) && item.id === id)));
}
export function notePresentation(note: DiscoveryNote) {
  const state = note.mapState;
  const date = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(note.createdAt));
  return {
    date: `${date} JST`, scenario: `保存時シナリオ：${scenarios[state.scenarioId].name}`,
    layers: layerIds.map(id => `${layerNames[id]}：${state.layers[id] ? '表示' : '非表示'}`).join(' / '),
    selection: `選択地点：${state.selectedFeatureId === null ? '選択なし' : features.find(feature => feature.id === state.selectedFeatureId)?.name}`,
  };
}
