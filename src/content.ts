import routeData from './route.json';
import candidateRoutes from './candidate-routes.json';
import { parseRoute } from './domain';
import type { ExplorationFeature } from './domain';

export const features: readonly ExplorationFeature[] = [
  { id: 'malacca', name: 'マラッカ海峡', classification: 'geographic-fact', kind: 'strait',
    coordinate: [100.1, 3.5], sources: ['eia', 'naturalEarth', 'author'],
    description: 'マレー半島とスマトラ島の間にある海峡。インド洋と太平洋を結ぶ海上交通の接点です。',
    limitation: '◇は海峡の代表点です。海峡全域の境界や航行可能な範囲を示しません。' },
  { id: 'normal-route', name: '通常主要航路', classification: 'teaching-model', kind: 'route',
    coordinates: parseRoute(routeData), sources: ['author', 'eia', 'naturalEarth'],
    description: 'インド洋側からマラッカ海峡・シンガポール海峡を通り、南シナ海へ向かう位置関係を破線で示す概略モデルです。',
    limitation: '著者作成。実際の船舶航跡・検証済み航行線ではありません。出典は各waypointの運航検証を意味しません。航行案内には使えません。' },
  { id: 'singapore', name: 'シンガポール', classification: 'geographic-fact', kind: 'place',
    coordinate: [103.82, 1.35], sources: ['naturalEarth', 'author'],
    description: 'マレー半島南端の島国。マラッカ海峡から東側の海へ抜ける位置関係を確かめられます。',
    limitation: '●は国の代表点です。港湾施設や個別の航路位置を示しません。' },
  { id: 'penang', name: 'ペナン島', classification: 'geographic-fact', kind: 'place',
    coordinate: [100.25, 5.4], sources: ['naturalEarth', 'author'],
    description: 'マレー半島西岸、マラッカ海峡に面する島です。海峡と沿岸の位置関係を見るための関連地点です。',
    limitation: '●は島の代表点です。港湾施設や個別の航路位置を示しません。' },
  ...(['sunda', 'lombok'] as const).flatMap(id => {
    const name = id === 'sunda' ? 'スンダ' : 'ロンボク';
    return [
      { id, name: `${name}海峡`, classification: 'geographic-fact', kind: 'strait',
        coordinate: id === 'sunda' ? [105.7, -5.9] : [115.85, -8.3],
        sources: ['eia', 'naturalEarth', 'author'],
        description: `EIAがマラッカ海峡の代替経路として挙げる${name}海峡です。代替先も狭窄部である点に注意が必要です。`,
        limitation: '＋◇は仮定時に追加する代表点。海峡の境界や航行可能範囲ではありません。' },
      { id: `${id}-route`, name: `${name}経由候補`, classification: 'teaching-model', kind: 'route',
        coordinates: parseRoute(candidateRoutes[id]), sources: ['eia', 'author', 'naturalEarth'],
        description: `EIAが挙げる${name}海峡経由の代替経路を、著者作成の長短破線で示す事前定義モデルです。`,
        limitation: 'EIAの記述は候補海峡の根拠です。点列・接続海域は著者の概略表現で、実際の自動迂回や航行可能性を示しません。船舶条件・輸送能力・距離・所要時間・費用は未収録。航行案内には使えません。' },
    ] satisfies ExplorationFeature[];
  }),
];
export const labels: readonly { name: string; coordinate: [number, number]; code?: string; sea?: boolean }[] = [
  { name: 'インド', code: 'IND', coordinate: [86, 21.5] },
  { name: 'ミャンマー', code: 'MMR', coordinate: [95.6, 17.7] },
  { name: 'タイ', code: 'THA', coordinate: [101, 15.4] },
  { name: 'ラオス', code: 'LAO', coordinate: [103, 18.5] },
  { name: 'カンボジア', code: 'KHM', coordinate: [104.8, 12.5] },
  { name: 'ベトナム', code: 'VNM', coordinate: [108.2, 15.8] },
  { name: 'マレーシア', code: 'MYS', coordinate: [102.4, 4.5] },
  { name: 'インドネシア', code: 'IDN', coordinate: [101, -0.7] },
  { name: 'フィリピン', code: 'PHL', coordinate: [121, 13] },
  { name: 'ブルネイ', code: 'BRN', coordinate: [114.8, 4.9] },
  { name: '中国', code: 'CHN', coordinate: [111, 24] },
  { name: 'バングラデシュ', code: 'BGD', coordinate: [90.3, 24] },
  { name: 'スリランカ', code: 'LKA', coordinate: [80.7, 7.8] },
  { name: 'インド洋', coordinate: [92.8, 1.3], sea: true },
  { name: 'アンダマン海', coordinate: [95.7, 10.2], sea: true },
  { name: '南シナ海', coordinate: [110, 7.8], sea: true },
  { name: 'スマトラ島', coordinate: [99, 0.5] },
];
