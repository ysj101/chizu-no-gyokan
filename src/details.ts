import { features } from './content';
import { scenarioExplanation } from './domain';
import type { ExplorationFeature, Scenario, SelectedFeatureId, SourceId } from './domain';

export type Classification = 'fact' | 'assumption' | 'explanation';
export const classificationLabels: Record<Classification, string> = {
  fact: '事実（地理的事実）', assumption: '仮定（シナリオ上の仮定）', explanation: '説明・推論（モデル上の説明）',
};
// Short tag shown next to each item; the full label stays available as its description.
export const classificationTags: Record<Classification, string> = { fact: '事実', assumption: '仮定', explanation: 'モデル' };
interface Evidence { classification: Classification; sources: readonly [SourceId, ...SourceId[]] }
export type DetailItem = Evidence & { label: string } & (
  | { status: 'recorded'; text: string }
  | { status: 'unrecorded'; fields: readonly string[]; reason: string }
);
// Three tiers: `overview`/`why`/`related`/`scenario` stay visible, `more` opens on demand,
// and `evidence` lists each source once with the items it supports.
export interface DetailView {
  overview: DetailItem;
  why: DetailItem;
  related: DetailItem;
  scenario: DetailItem;
  more: readonly DetailItem[];
  evidence: readonly { source: SourceId; items: readonly string[] }[];
}
export function featureClassification(feature: ExplorationFeature): Classification {
  return feature.classification === 'geographic-fact' ? 'fact' : 'explanation';
}
const item = (label: string, text: string, classification: Classification = 'explanation', sources: Evidence['sources'] = ['author']): DetailItem =>
  ({ label, status: 'recorded', text, classification, sources });
interface DetailDefinition { region: string; related: string; why: DetailItem; glossary?: DetailItem }
const alternativeStrait = item('なぜ重要か', 'EIAがマラッカ海峡の代替経路として挙げる海峡で、代替先も狭窄部です。位置を比べると、通常航路からどの方向へ外れるかが分かります。', 'fact', ['eia']);
const candidateRoute = item('なぜ重要か', 'EIAが挙げる代替海峡を経由する位置関係を著者が概略線にしたものです。通常航路との向きの違いを見るための比較用で、運航の可否は示しません。', 'explanation', ['author', 'eia']);
const chokepoint = item('用語', '狭窄部（チョークポイント）：多くの船舶が集中して通る狭い海域。EIAはマラッカ海峡を世界の主要なチョークポイントの一つに挙げています。', 'fact', ['eia']);
// Regions describe the authored map's placement, not surveyed boundaries.
const definitions: Record<SelectedFeatureId, DetailDefinition> = {
  malacca: { region: 'マレー半島とスマトラ島の間に置いた代表点。', related: '通常主要航路、シンガポール、ペナン島。仮定時の比較対象：スンダ海峡、ロンボク海峡。',
    why: item('なぜ重要か', 'インド洋と太平洋を結ぶ接点で、EIAは主要なチョークポイント（狭窄部）の一つに挙げています。使えないと仮定すると、別の狭窄部を通る候補との位置関係を比べる起点になります。', 'fact', ['eia']),
    glossary: chokepoint },
  'normal-route': { region: 'インド洋側からマラッカ海峡・シンガポール海峡を経て南シナ海側へ描いた概略線。', related: 'マラッカ海峡、シンガポール、ペナン島。',
    why: item('なぜ重要か', '通常時にどこを通る位置関係なのかを示す比較の基準です。仮定時には点線で残し、候補との向きの違いを見比べます。実際の船舶航跡ではありません。') },
  singapore: { region: 'マレー半島南端付近に置いたシンガポールの代表点。', related: '通常主要航路、マラッカ海峡。',
    why: item('なぜ重要か', '通常航路が海峡を抜けて南シナ海側へ向かう出口付近にあり、海峡と東側の海のつながりを見る目印です。港湾施設は示しません。') },
  penang: { region: 'マレー半島西岸付近に置いたペナン島の代表点。', related: 'マラッカ海峡、通常主要航路。',
    why: item('なぜ重要か', '海峡の北西側、インド洋側の入口付近にあり、海峡の長さと沿岸の位置関係を見る目印です。港湾施設は示しません。') },
  sunda: { region: 'インドネシア多島海のスンダ海峡に置いた代表点。', related: 'スンダ経由候補、マラッカ海峡。', why: alternativeStrait, glossary: chokepoint },
  lombok: { region: 'インドネシア多島海のロンボク海峡に置いた代表点。', related: 'ロンボク経由候補、マラッカ海峡。', why: alternativeStrait, glossary: chokepoint },
  'sunda-route': { region: 'インド洋側からスンダ海峡を経て東側へ描いた概略線。', related: 'スンダ海峡、マラッカ海峡、通常主要航路。', why: candidateRoute },
  'lombok-route': { region: 'インド洋側からロンボク海峡を経て東側へ描いた概略線。', related: 'ロンボク海峡、マラッカ海峡、通常主要航路。', why: candidateRoute },
};
export const unrecordedFields = ['距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用'] as const;
export function detailView(id: SelectedFeatureId, scenario: Scenario): DetailView {
  const definition = definitions[id];
  const feature = features.find(feature => feature.id === id);
  if (!feature) throw new Error('Missing detail feature');
  const closed = scenario.kind === 'malacca-closed-assumption';
  const overview = item('概要', feature.description, featureClassification(feature), feature.sources);
  const related = item('関連する場所', definition.related);
  const current = item('現在の条件での意味', scenarioExplanation(id, scenario), closed ? 'assumption' : 'explanation');
  const more: DetailItem[] = [
    item('位置（地域）', `${definition.region}位置表現は地図の行間の教材モデル。海岸・国境の参照はNatural Earth v5.1.2です。`, 'explanation', ['author', 'naturalEarth']),
    item('注意事項', `${closed ? '通行不可は現実の航行規制・出来事を示しません。候補の運航可能性や輸送能力は未検証です。' : '通常時は教材の比較基準であり、現実の運航状況を保証しません。'}${feature.limitation}`),
  ];
  if (definition.glossary) more.push(definition.glossary);
  more.push({ label: 'この教材では扱わないデータ', classification: 'explanation', sources: ['author'], status: 'unrecorded', fields: unrecordedFields,
    reason: 'この教材に対象別の根拠データを収録していません。ゼロや無影響を意味しません。' });
  const supported = new Map<SourceId, string[]>();
  for (const entry of [overview, definition.why, related, current, ...more]) {
    for (const source of entry.sources) {
      let items = supported.get(source);
      if (!items) supported.set(source, items = []);
      items.push(entry.label);
    }
  }
  return { overview, why: definition.why, related, scenario: current, more,
    evidence: [...supported].map(([source, items]) => ({ source, items })) };
}
