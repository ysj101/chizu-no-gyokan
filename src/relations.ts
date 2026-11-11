import directionData from './japan-direction.json';
import { candidateForScenario, candidateIds, candidates, parseRoute } from './domain';
import type { CandidateId, Classification, Scenario, SelectedFeatureId, SourceId } from './domain';
import type { PerspectiveId } from './perspectives';

// GP-03: the "so what?" chain. A change at the strait is followed along the routes to a place it matters
// to — here Japan, which lies off this map to the north-east. The chain says what changed, what that
// connects to, and what can be checked next. It states relations only within its sources: no distances,
// days, prices or damage are computed, and the off-map arrow is a direction, not a route.
export interface ChainStatement { classification: Classification; text: string; sources: readonly [SourceId, ...SourceId[]] }
export interface ChainView {
  change: ChainStatement;
  finding: ChainStatement;
  next: string;
  // The map features on the chain, from the strait to the end of the routes.
  features: readonly SelectedFeatureId[];
}
// From the common end of the authored routes towards Japan, drawn to the edge of the map.
export const japanDirection: [number, number][] = parseRoute(directionData);
export const destination = { name: '日本方面（地図の外）', coordinate: japanDirection[japanDirection.length - 1]! };
const connection: ChainStatement = {
  classification: 'explanation', sources: ['author', 'eia', 'eiaJapan'],
  text: '遠くの海峡の条件は、日本のエネルギー輸入の経路ともつながっている。',
};
export function japanChain(scenario: Scenario, candidate: CandidateId | null): ChainView {
  if (scenario.kind === 'normal') {
    return {
      change: { classification: 'explanation', sources: ['author'], text: 'いま：日本方面へ向かう航路の概略モデルは、マラッカ海峡を通ります。' },
      finding: { classification: 'fact', sources: ['eia', 'eiaJapan'], text: 'マラッカ海峡は中東の産油国とアジアの市場を結ぶ最短の海路で、日本は原油・LNGをタンカー輸送に頼っています。' },
      next: '次に：海峡を通れなくすると、このつながりはどう変わる？',
      features: ['malacca', 'normal-route'],
    };
  }
  const chosen = candidateForScenario(candidate, scenario);
  if (chosen === null) {
    return {
      change: { classification: 'assumption', sources: ['author'], text: '通れないと仮定すると、日本方面への輸送経路にも別の海峡を検討する必要がある。' },
      finding: connection,
      next: '次に：候補の線を選んで、どの海峡を経由する位置関係か比べる。',
      features: ['malacca', 'sunda-route', 'lombok-route', 'sunda', 'lombok'],
    };
  }
  const { name, strait, features } = candidates[chosen];
  return {
    change: { classification: 'assumption', sources: ['author', 'eia'], text: `${name}候補を検討中：日本方面へは${strait}を経由する位置関係になる（概略モデル）。` },
    finding: connection,
    next: '次に：もう一方の候補と比べる。',
    features: ['malacca', ...features],
  };
}

// GP-06: at most two side trips from where the chain stands, each to something this atlas has content
// for (a condition, a candidate, or a country view). They are suggestions, not stages: ignoring them is
// fine, and "寄り道の前に戻る" returns to the state before the last one taken.
export type Branch =
  | { label: string; kind: 'scenario'; to: Scenario['kind'] }
  | { label: string; kind: 'candidate'; to: CandidateId }
  | { label: string; kind: 'perspective'; to: PerspectiveId };
export function nextBranches(scenario: Scenario, candidate: CandidateId | null): readonly Branch[] {
  if (scenario.kind === 'normal') {
    return [{ label: '通れなくしてみる', kind: 'scenario', to: 'malacca-closed-assumption' }, { label: '日本以外では？（中国から見る）', kind: 'perspective', to: 'china' }];
  }
  const chosen = candidateForScenario(candidate, scenario);
  if (chosen === null) return candidateIds.map(id => ({ label: `${candidates[id].strait}は？`, kind: 'candidate', to: id }));
  const other = candidateIds.find(id => id !== chosen)!;
  return [{ label: `${candidates[other].strait}は？`, kind: 'candidate', to: other }, { label: '候補の海峡がある国は？（インドネシアから見る）', kind: 'perspective', to: 'indonesia' }];
}
