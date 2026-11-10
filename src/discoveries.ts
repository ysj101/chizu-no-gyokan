import { candidateForScenario } from './domain';
import type { CandidateId, Classification, Scenario, SourceId } from './domain';
import { failure } from './notes';
import type { NoteStorage, Result } from './notes';

// GP-05: the discovery map. What the reader keeps is a relation found through the chain ("so what?"),
// never a click on a place: each discovery is a fixed, sourced edge between places, and adding one only
// records that it was found and when. Saved apart from the notes, in this browser only.
export type DiscoveryNodeId = 'malacca' | 'sunda' | 'lombok' | 'japan';
export type DiscoveryId = 'malacca-japan' | 'malacca-alternatives' | 'sunda-japan' | 'lombok-japan';
export interface Discovery {
  title: string;
  edges: readonly (readonly [DiscoveryNodeId, DiscoveryNodeId])[];
  text: string;
  classification: Classification;
  sources: readonly [SourceId, ...SourceId[]];
}
// Positions in the small network view (viewBox 320 × 150), roughly as on the map.
export const discoveryNodes: Record<DiscoveryNodeId, { name: string; x: number; y: number }> = {
  malacca: { name: 'マラッカ海峡', x: 52, y: 52 },
  sunda: { name: 'スンダ海峡', x: 120, y: 122 },
  lombok: { name: 'ロンボク海峡', x: 205, y: 122 },
  japan: { name: '日本', x: 272, y: 30 },
};
export const discoveries: Record<DiscoveryId, Discovery> = {
  'malacca-japan': { title: 'マラッカ海峡 → 日本', edges: [['malacca', 'japan']], classification: 'fact', sources: ['eia', 'eiaJapan'],
    text: 'マラッカ海峡は中東とアジアの市場を結ぶ最短の海路で、日本は原油・LNGをタンカー輸送に頼っている。' },
  'malacca-alternatives': { title: 'マラッカ海峡 → スンダ海峡・ロンボク海峡', edges: [['malacca', 'sunda'], ['malacca', 'lombok']], classification: 'assumption', sources: ['eia', 'author'],
    text: '通れないと仮定すると、EIAが代替経路に挙げる別の海峡を検討する必要がある。' },
  'sunda-japan': { title: 'スンダ海峡 → 日本', edges: [['sunda', 'japan']], classification: 'explanation', sources: ['author', 'eia'],
    text: 'スンダ経由の候補でも、日本方面への輸送経路につながる位置関係（概略モデル）。' },
  'lombok-japan': { title: 'ロンボク海峡 → 日本', edges: [['lombok', 'japan']], classification: 'explanation', sources: ['author', 'eia'],
    text: 'ロンボク経由の候補でも、日本方面への輸送経路につながる位置関係（概略モデル）。' },
};
const discoveryIds = Object.keys(discoveries) as DiscoveryId[];
// The discovery the chain currently shows, one per state of the experiment.
export function chainDiscovery(scenario: Scenario, candidate: CandidateId | null): DiscoveryId {
  if (scenario.kind === 'normal') return 'malacca-japan';
  const chosen = candidateForScenario(candidate, scenario);
  return chosen === null ? 'malacca-alternatives' : `${chosen}-japan`;
}

export const discoveriesKey = 'chizu-no-gyokan.discoveries.v1';
export interface FoundDiscovery { id: DiscoveryId; addedAt: string }
export interface DiscoveryCollection { found: FoundDiscovery[]; unreadable: number }
function isFound(value: unknown): value is FoundDiscovery {
  if (typeof value !== 'object' || value === null) return false;
  const { id, addedAt } = value as Record<string, unknown>;
  return typeof id === 'string' && (discoveryIds as string[]).includes(id) && typeof addedAt === 'string' && Number.isFinite(Date.parse(addedAt));
}
// Records keep the order they were found in. Unknown or repeated records are counted, not guessed at.
export function parseDiscoveries(raw: string | null): Result<DiscoveryCollection> {
  if (raw === null) return { ok: true, value: { found: [], unreadable: 0 } };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return failure('発見マップの保存データを読み込めませんでした。'); }
  if (typeof value !== 'object' || value === null || (value as { version?: unknown }).version !== 1 || !Array.isArray((value as { discoveries?: unknown }).discoveries)) {
    return failure('発見マップの保存データのバージョンまたは形式に対応していません。');
  }
  const records: unknown[] = (value as { discoveries: unknown[] }).discoveries;
  const found: FoundDiscovery[] = [];
  for (const item of records) if (isFound(item) && !found.some(entry => entry.id === item.id)) found.push({ id: item.id, addedAt: item.addedAt });
  return { ok: true, value: { found, unreadable: records.length - found.length } };
}
export function loadDiscoveries(storage: NoteStorage): Result<DiscoveryCollection> {
  try { return parseDiscoveries(storage.getItem(discoveriesKey)); } catch { return failure('このブラウザの保存領域を利用できません。'); }
}
function write(storage: NoteStorage, found: readonly FoundDiscovery[]): Result<DiscoveryCollection> {
  try {
    const raw = JSON.stringify({ version: 1, discoveries: found });
    storage.setItem(discoveriesKey, raw);
    return parseDiscoveries(raw);
  } catch { return failure('保存領域に書き込めませんでした。'); }
}
// Adding twice keeps the first record: the map shows what was found, not how often.
export function addDiscovery(storage: NoteStorage, id: DiscoveryId, now: Date): Result<DiscoveryCollection> {
  const loaded = loadDiscoveries(storage);
  if (!loaded.ok) return loaded;
  if (loaded.value.found.some(entry => entry.id === id)) return loaded;
  return write(storage, [...loaded.value.found, { id, addedAt: now.toISOString() }]);
}
export function removeDiscovery(storage: NoteStorage, id: DiscoveryId): Result<DiscoveryCollection> {
  const loaded = loadDiscoveries(storage);
  if (!loaded.ok) return loaded;
  return write(storage, loaded.value.found.filter(entry => entry.id !== id));
}
