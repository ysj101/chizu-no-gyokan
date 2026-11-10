import { featureById } from './content';
import { candidateOf, featureRole, scenarioExplanation, scenarios } from './domain';
import type { Classification, Scenario, SelectedFeatureId, SourceId } from './domain';
interface Evidence { classification: Classification; sources: readonly [SourceId, ...SourceId[]] }
export type DetailItem = Evidence & { label: string } & (
  | { status: 'recorded'; text: string }
  | { status: 'unrecorded'; fields: readonly string[]; reason: string }
);
// Three tiers: `overview`/`why`/`related`/`scenario` stay visible, `more` opens on demand,
// and `evidence` lists each source once with the items it supports.
// A related place carries the reason for the link and whether the current condition shows it.
// When it is not shown, `hint` and `note` name the condition that does, so the UI can explain instead of switching.
// `hint` is appended to the reason when the current condition hides the target; `note` is the status
// message shown when the reader presses it anyway. Both are worded here so the renderer stays dumb.
export interface RelatedLink { id: SelectedFeatureId; name: string; reason: string; available: boolean; hint: string; note: string }
// A term the reader can open in place, next to the sentence that uses it.
export interface Term { name: string; text: string }
// GP-04: the first view of a card is three short lines — what is true now, one finding, what to try
// next — and everything else waits behind "詳しく知る" and the sources.
export interface DetailView {
  finding: DetailItem;
  term: Term | null;
  next: string;
  overview: DetailItem;
  why: DetailItem;
  related: DetailItem;
  relatedLinks: readonly RelatedLink[];
  scenario: DetailItem;
  more: readonly DetailItem[];
  evidence: readonly { source: SourceId; items: readonly string[] }[];
}
const item = (label: string, text: string, classification: Classification = 'explanation', sources: Evidence['sources'] = ['author']): DetailItem =>
  ({ label, status: 'recorded', text, classification, sources });
interface Relation { id: SelectedFeatureId; reason: string }
interface DetailDefinition { region: string; related: readonly Relation[]; why: DetailItem; finding: DetailItem; glossary?: Term }
const alternativeStrait = item('なぜ重要か', 'EIAがマラッカ海峡の代替経路として挙げる海峡で、代替先も狭窄部です。位置を比べると、通常航路からどの方向へ外れるかが分かります。', 'fact', ['eia']);
const candidateRoute = item('なぜ重要か', 'EIAが挙げる代替海峡を経由する位置関係を著者が概略線にしたものです。通常航路との向きの違いを見るための比較用で、運航の可否は示しません。', 'explanation', ['author', 'eia']);
const chokepointTerm: Term = { name: '狭窄部', text: '狭窄部（チョークポイント）：多くの船舶が集中して通る狭い海域。EIAはマラッカ海峡を世界の主要なチョークポイントの一つに挙げています。' };
// One sentence each: the finding shown first. The longer `why` stays behind 「詳しく知る」.
const alternativeFinding = item('発見', 'EIAが代替経路に挙げる海峡で、ここも狭窄部です。', 'fact', ['eia']);
const candidateFinding = item('発見', 'EIAが挙げる代替海峡を通る位置関係の概略線です。運航の可否は示しません。', 'explanation', ['author', 'eia']);
// Regions describe the authored map's placement, not surveyed boundaries.
const definitions: Record<SelectedFeatureId, DetailDefinition> = {
  malacca: { region: 'マレー半島とスマトラ島の間に置いた代表点。',
    related: [{ id: 'normal-route', reason: '通常時にこの海峡を通る航路' }, { id: 'singapore', reason: '海峡の東側、出口付近の目印' }, { id: 'penang', reason: '海峡の北西側、入口付近の目印' },
      { id: 'sunda', reason: '仮定時の比較対象。EIAが挙げる代替海峡' }, { id: 'lombok', reason: '仮定時の比較対象。EIAが挙げる代替海峡' }],
    finding: item('発見', 'インド洋と太平洋を結ぶ狭窄部で、中東とアジアの市場を結ぶ最短の海路です。', 'fact', ['eia']),
    why: item('なぜ重要か', 'インド洋と太平洋を結ぶ接点で、EIAは主要なチョークポイント（狭窄部）の一つに挙げています。使えないと仮定すると、別の狭窄部を通る候補との位置関係を比べる起点になります。', 'fact', ['eia']),
    glossary: chokepointTerm },
  'normal-route': { region: 'インド洋側からマラッカ海峡・シンガポール海峡を経て南シナ海側へ描いた概略線。',
    related: [{ id: 'malacca', reason: 'この航路が通る海峡' }, { id: 'singapore', reason: '出口側の目印' }, { id: 'penang', reason: '入口側の目印' }],
    finding: item('発見', '通常時の比較の基準になる概略線です。実際の船舶航跡ではありません。'),
    why: item('なぜ重要か', '通常時にどこを通る位置関係なのかを示す比較の基準です。仮定時には点線で残し、候補との向きの違いを見比べます。実際の船舶航跡ではありません。') },
  singapore: { region: 'マレー半島南端付近に置いたシンガポールの代表点。',
    related: [{ id: 'normal-route', reason: '出口付近を通る航路' }, { id: 'malacca', reason: '西側へ続く海峡' }],
    finding: item('発見', '海峡を抜けて南シナ海へ向かう出口付近の目印です。'),
    why: item('なぜ重要か', '通常航路が海峡を抜けて南シナ海側へ向かう出口付近にあり、海峡と東側の海のつながりを見る目印です。港湾施設は示しません。') },
  penang: { region: 'マレー半島西岸付近に置いたペナン島の代表点。',
    related: [{ id: 'malacca', reason: '島が面する海峡' }, { id: 'normal-route', reason: '海峡へ向かう航路' }],
    finding: item('発見', '海峡の北西側、インド洋側の入口付近の目印です。'),
    why: item('なぜ重要か', '海峡の北西側、インド洋側の入口付近にあり、海峡の長さと沿岸の位置関係を見る目印です。港湾施設は示しません。') },
  sunda: { region: 'インドネシア多島海のスンダ海峡に置いた代表点。', related: [{ id: 'sunda-route', reason: 'この海峡を経由する候補線' }, { id: 'malacca', reason: '使えないと仮定した海峡' }], why: alternativeStrait, finding: alternativeFinding, glossary: chokepointTerm },
  lombok: { region: 'インドネシア多島海のロンボク海峡に置いた代表点。', related: [{ id: 'lombok-route', reason: 'この海峡を経由する候補線' }, { id: 'malacca', reason: '使えないと仮定した海峡' }], why: alternativeStrait, finding: alternativeFinding, glossary: chokepointTerm },
  'sunda-route': { region: 'インド洋側からスンダ海峡を経て東側へ描いた概略線。', related: [{ id: 'sunda', reason: '経由する海峡' }, { id: 'malacca', reason: '使えないと仮定した海峡' }, { id: 'normal-route', reason: '比較対象の通常航路' }], why: candidateRoute, finding: candidateFinding },
  'lombok-route': { region: 'インド洋側からロンボク海峡を経て東側へ描いた概略線。', related: [{ id: 'lombok', reason: '経由する海峡' }, { id: 'malacca', reason: '使えないと仮定した海峡' }, { id: 'normal-route', reason: '比較対象の通常航路' }], why: candidateRoute, finding: candidateFinding },
};
export const unrecordedFields = ['距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用'] as const;
// A link to another feature, with the wording shown when the current condition hides it.
export function relatedLink(targetId: SelectedFeatureId, reason: string, scenario: Scenario): RelatedLink {
  const name = featureById(targetId).name; const available = featureRole(targetId, scenario) !== undefined;
  // Names of the conditions that show the target (two scenarios, eight features: no cache needed).
  const where = Object.values(scenarios).filter(definition => definition.featureIds.some(id => id === targetId)).map(definition => definition.name).join('・');
  return { id: targetId, name, reason, available,
    hint: available ? '' : `（${where}で表示）`, note: available ? '' : `${name}は「${where}」で表示されます。条件を切り替えると選べます。` };
}
// What the reader can try next from this card: always an action on the map, never a quiz.
export function nextStep(id: SelectedFeatureId, scenario: Scenario): string {
  if (scenario.kind === 'normal') {
    return id === 'malacca' ? '次に：地図上の「通れなくしてみる」で、ここが使えないと何が変わるか見る。'
      : '次に：マラッカ海峡を通れなくして、この場所の見え方を比べる。';
  }
  if (id === 'malacca') return '次に：ほかの道を探す（スンダ経由・ロンボク経由の候補を選ぶ）。';
  if (candidateOf(id)) return '次に：もう一方の候補と比べる。';
  if (id === 'normal-route') return '次に：候補の線と向きを比べる。';
  return '次に：「日本から見ると？」で、航路の先とのつながりを見る。';
}
export function detailView(id: SelectedFeatureId, scenario: Scenario): DetailView {
  const definition = definitions[id];
  const feature = featureById(id);
  const closed = scenario.kind === 'malacca-closed-assumption';
  const overview = item('概要', feature.description, feature.classification === 'geographic-fact' ? 'fact' : 'explanation', feature.sources);
  const relatedLinks = definition.related.map(({ id: targetId, reason }) => relatedLink(targetId, reason, scenario));
  const related = item('関連する場所', relatedLinks.map(link => `${link.name}（${link.reason}）`).join('、'));
  const current = item('現在の条件での意味', scenarioExplanation(feature, scenario), closed ? 'assumption' : 'explanation');
  const more: DetailItem[] = [
    item('位置（地域）', `${definition.region}位置表現は地図の行間の教材モデル。海岸・国境の参照はNatural Earth v5.1.2です。`, 'explanation', ['author', 'naturalEarth']),
    item('注意事項', `${closed ? '通行不可は現実の航行規制・出来事を示しません。候補の運航可能性や輸送能力は未検証です。' : '通常時は教材の比較基準であり、現実の運航状況を保証しません。'}${feature.limitation}`),
  ];
  // The term also opens in place on the card; here it sits with the other reference items and their sources.
  if (definition.glossary) more.push(item('用語', definition.glossary.text, 'fact', ['eia']));
  more.push({ label: 'この教材では扱わないデータ', classification: 'explanation', sources: ['author'], status: 'unrecorded', fields: unrecordedFields,
    reason: 'この教材に対象別の根拠データを収録していません。ゼロや無影響を意味しません。' });
  const supported = new Map<SourceId, string[]>();
  for (const entry of [definition.finding, overview, definition.why, related, current, ...more]) {
    for (const source of entry.sources) {
      let items = supported.get(source);
      if (!items) supported.set(source, items = []);
      items.push(entry.label);
    }
  }
  return { finding: definition.finding, term: definition.glossary ?? null, next: nextStep(id, scenario), overview, why: definition.why, related, relatedLinks, scenario: current, more,
    evidence: [...supported].map(([source, items]) => ({ source, items })) };
}
