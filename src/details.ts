import { features } from './content';
import { scenarioExplanation } from './domain';
import type { Scenario, SelectedFeatureId, SourceId } from './domain';

export type Classification = 'fact' | 'assumption' | 'explanation';
export const classificationLabels: Record<Classification, string> = {
  fact: '事実（地理的事実）', assumption: '仮定（シナリオ上の仮定）', explanation: '説明・推論（モデル上の説明）',
};
interface Evidence { classification: Classification; sources: readonly [SourceId, ...SourceId[]] }
export type DetailItem = Evidence & { label: string } & (
  | { status: 'recorded'; text: string }
  | { status: 'unrecorded'; reason: string }
);
const item = (label: string, text: string, classification: Classification = 'explanation', sources: Evidence['sources'] = ['author']): DetailItem =>
  ({ label, status: 'recorded', text, classification, sources });
interface DetailDefinition { region: string; related: string; summary: DetailItem }
// Regions describe the authored map's placement, not surveyed boundaries.
const definitions: Record<SelectedFeatureId, DetailDefinition> = {
  malacca: { region: 'マレー半島とスマトラ島の間に置いた代表点。', related: '通常主要航路、シンガポール、ペナン島。仮定時の比較対象：スンダ海峡、ロンボク海峡。',
    summary: item('短い解説', 'インド洋と太平洋を結ぶ海峡です。', 'fact', ['eia']) },
  'normal-route': { region: 'インド洋側からマラッカ海峡・シンガポール海峡を経て南シナ海側へ描いた概略線。', related: 'マラッカ海峡、シンガポール、ペナン島。',
    summary: item('短い解説', '通常時の位置関係を比較する著者作成の航路モデルです。実際の船舶航跡ではありません。') },
  singapore: { region: 'マレー半島南端付近に置いたシンガポールの代表点。', related: '通常主要航路、マラッカ海峡。',
    summary: item('短い解説', '通常航路と海峡の東側との位置関係を見るための関連地点です。港湾施設を示しません。') },
  penang: { region: 'マレー半島西岸付近に置いたペナン島の代表点。', related: 'マラッカ海峡、通常主要航路。',
    summary: item('短い解説', '海峡と沿岸の位置関係を見るための関連地点です。港湾施設を示しません。') },
  sunda: { region: 'インドネシア多島海のスンダ海峡に置いた代表点。', related: 'スンダ経由候補、マラッカ海峡。',
    summary: item('短い解説', 'EIAがマラッカ海峡の代替経路として挙げる海峡で、代替先も狭窄部です。', 'fact', ['eia']) },
  lombok: { region: 'インドネシア多島海のロンボク海峡に置いた代表点。', related: 'ロンボク経由候補、マラッカ海峡。',
    summary: item('短い解説', 'EIAがマラッカ海峡の代替経路として挙げる海峡で、代替先も狭窄部です。', 'fact', ['eia']) },
  'sunda-route': { region: 'インド洋側からスンダ海峡を経て東側へ描いた概略線。', related: 'スンダ海峡、マラッカ海峡、通常主要航路。',
    summary: item('短い解説', 'EIAが挙げる代替海峡を通る位置関係を著者が長短破線にした候補モデルです。点列の運航可否をEIAが裏付けるものではありません。', 'explanation', ['author', 'eia']) },
  'lombok-route': { region: 'インド洋側からロンボク海峡を経て東側へ描いた概略線。', related: 'ロンボク海峡、マラッカ海峡、通常主要航路。',
    summary: item('短い解説', 'EIAが挙げる代替海峡を通る位置関係を著者が長短破線にした候補モデルです。点列の運航可否をEIAが裏付けるものではありません。', 'explanation', ['author', 'eia']) },
};
export function detailItems(id: SelectedFeatureId, scenario: Scenario): readonly DetailItem[] {
  const definition = definitions[id];
  const feature = features.find(feature => feature.id === id);
  if (!feature) throw new Error('Missing detail feature');
  const closed = scenario.kind === 'malacca-closed-assumption';
  return [
    item('名称', feature.name, 'explanation', ['author']),
    item('位置（地域）', `${definition.region}位置表現は地図の行間の教材モデル。海岸・国境の参照はNatural Earth v5.1.2です。`, 'explanation', ['author', 'naturalEarth']),
    definition.summary,
    item('関連航路・関連地点', `教材での関連：${definition.related}`),
    item('現在シナリオでの意味', scenarioExplanation(id, scenario), closed ? 'assumption' : 'explanation'),
    item('注意事項', `${closed ? '通行不可は現実の航行規制・出来事を示しません。候補の運航可能性や輸送能力は未検証です。' : '通常時は教材の比較基準であり、現実の運航状況を保証しません。'}${feature.limitation}`),
    ...['距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用'].map((label): DetailItem => ({
      label, classification: 'explanation', sources: ['author'], status: 'unrecorded',
      reason: 'この教材に対象別の根拠データを収録していません。ゼロや無影響を意味しません。',
    })),
  ];
}
