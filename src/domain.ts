import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export interface Source {
  title: string;
  url: string;
  consulted: string;
  updated: string;
  period: string;
  usage: string;
  rights: string;
  rightsUrl: string;
}
export const sourceRegistry = {
  naturalEarth: {
    title: 'Natural Earth Admin 0 Countries v5.1.2',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson',
    updated: '不明（版番号はv5.1.2）',
    consulted: '2026-11-09 JST（利用条件を再確認。データ抽出はcoordinator確認）', period: 'v5.1.2の小縮尺地理データ。現況の保証なし',
    usage: '14か国の国境・海岸。geometryと国コード・日本語名だけを抽出。国名は地図の行間による表記。',
    rights: '全vector/rasterはpublic domain。変更・配布・商用利用可。Made with Natural Earth。de facto境界。',
    rightsUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  },
  eia: {
    title: 'EIA World Oil Transit Chokepoints',
    url: 'https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/',
    updated: '2026-03-03',
    consulted: '2026-11-10 JST（本文・利用条件を再確認）', period: '公開・更新 2026-03-03。本文の統計は2020〜1H25',
    usage: 'Strait of Malacca節：インド洋と太平洋の接続、中東とアジア市場を結ぶ最短海路であること、スンダ・ロンボク両海峡が代替経路に挙がることと、それらも狭窄部であること。国別視点では、中国向け比率（1H25）、ホルムズ通過原油の仕向け先（1H25）、ミャンマー経由パイプライン、カタール→中国LNG、シンガポール周辺の海賊報告の本文記述を引用。日本語翻訳・要約：地図の行間。画像・図・AIS・表は転載しない。',
    rights: 'EIA政府出版物はpublic domain。第三者資料・ロゴ・写真は別権利のため不使用。',
    rightsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  eiaJapan: {
    title: 'EIA Country Analysis Brief: Japan',
    url: 'https://www.eia.gov/international/content/analysis/countries_long/Japan/',
    updated: '2023-07-07',
    consulted: '2026-11-10 JST', period: '2022年のデータ',
    usage: '国別視点「日本」の事実。本文の記述だけを日本語要約し、図表は転載しない。日本語翻訳・要約：地図の行間。',
    rights: 'EIA政府出版物はpublic domain。第三者資料・ロゴ・写真は別権利のため不使用。',
    rightsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  eiaChina: {
    title: 'EIA Country Analysis Brief: China',
    url: 'https://www.eia.gov/international/content/analysis/countries_long/China/',
    updated: '2025-05-19',
    consulted: '2026-11-10 JST', period: '2024年のデータとパイプラインの記述',
    usage: '国別視点「中国」の事実。本文の記述だけを日本語要約し、図表は転載しない。日本語翻訳・要約：地図の行間。',
    rights: 'EIA政府出版物はpublic domain。第三者資料・ロゴ・写真は別権利のため不使用。',
    rightsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  eiaIndonesia: {
    title: 'EIA Country Analysis Brief: Indonesia',
    url: 'https://www.eia.gov/international/content/analysis/countries_long/Indonesia/',
    updated: '2025-08-25',
    consulted: '2026-11-10 JST', period: '2023〜2024年のデータ',
    usage: '国別視点「インドネシア」「シンガポール」の事実。本文の記述だけを日本語要約し、図表は転載しない。日本語翻訳・要約：地図の行間。',
    rights: 'EIA政府出版物はpublic domain。第三者資料・ロゴ・写真は別権利のため不使用。',
    rightsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  author: {
    title: '地図の行間：通常航路・候補航路・代表点の教材モデル', url: '#sources',
    updated: '2026-11-09（教材作成日。地理的事実の更新日ではない）',
    consulted: '2026-11-09', period: '2026-11-09作成。通常時・仮定時の位置関係の説明用',
    usage: '航路の点列と海峡・関連地点の代表座標、ラベル配置は著者作成。Natural EarthとEIAで地理的位置関係を参照。詳細の地域表現・関連づけ・条件ごとの意味・欠損の説明は地図の行間が作成。',
    rights: '著者作成の航路・代表点・ラベル配置の再利用ライセンスは未設定。再利用は別途確認が必要。参照資料のpublic domainはこれら自作物には適用されない。実際の船舶航跡・検証済み航行線ではない。航行案内には使えない。',
    rightsUrl: '#sources',
  },
} satisfies Record<string, Source>;
export type SourceId = keyof typeof sourceRegistry;

// How a statement is to be read: a geographic fact, a scenario assumption, or the author's model.
export type Classification = 'fact' | 'assumption' | 'explanation';
export const classificationLabels: Record<Classification, string> = {
  fact: '事実（地理的事実）', assumption: '仮定（シナリオ上の仮定）', explanation: '説明・推論（モデル上の説明）',
};
// Short tag shown next to each item; the full label stays available as its description.
export const classificationTags: Record<Classification, string> = { fact: '事実', assumption: '仮定', explanation: 'モデル' };
export type SelectedFeatureId = 'malacca' | 'normal-route' | 'singapore' | 'penang' | 'sunda' | 'lombok' | 'sunda-route' | 'lombok-route';
interface FeatureBase {
  id: SelectedFeatureId;
  name: string;
  description: string;
  sources: readonly [SourceId, ...SourceId[]];
  limitation: string;
}
export type ExplorationFeature =
  | (FeatureBase & { classification: 'geographic-fact'; kind: 'strait' | 'place'; coordinate: [number, number] })
  | (FeatureBase & { classification: 'teaching-model'; kind: 'route'; coordinates: [number, number][] });
export type LoadState = 'loading' | 'ready' | 'error';
export type CountryProperties = { code: string; name: string };
export type CountryCollection = FeatureCollection<Polygon | MultiPolygon, CountryProperties>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function position(value: unknown): Position {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Invalid position');
  const x: unknown = value[0];
  const y: unknown = value[1];
  if (typeof x !== 'number' || !Number.isFinite(x) || x < -180 || x > 180 ||
      typeof y !== 'number' || !Number.isFinite(y) || y < -90 || y > 90) throw new Error('Invalid coordinate');
  return [x, y];
}
function ring(value: unknown): Position[] {
  if (!Array.isArray(value) || value.length < 4) throw new Error('Invalid ring');
  const points = value.map((p: unknown) => position(p));
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) throw new Error('Unclosed ring');
  return points;
}
function polygon(value: unknown): Position[][] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Empty polygon');
  return value.map((r: unknown) => ring(r));
}
export function parseCountries(value: unknown): CountryCollection {
  if (!record(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features) ||
      value.features.length !== 14) throw new Error('Invalid collection');
  const codes = new Set<string>();
  const features = value.features.map((item: unknown) => {
    if (!record(item) || item.type !== 'Feature' || !record(item.properties) || !record(item.geometry)) throw new Error('Invalid feature');
    const { code, name } = item.properties;
    if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code) || codes.has(code) ||
        typeof name !== 'string' || name.length === 0 || name.length > 100) throw new Error('Invalid properties');
    codes.add(code);
    let geometry: Polygon | MultiPolygon;
    if (item.geometry.type === 'Polygon') {
      geometry = { type: 'Polygon', coordinates: polygon(item.geometry.coordinates) };
    } else if (item.geometry.type === 'MultiPolygon' && Array.isArray(item.geometry.coordinates) && item.geometry.coordinates.length > 0) {
      geometry = { type: 'MultiPolygon', coordinates: item.geometry.coordinates.map((p: unknown) => polygon(p)) };
    } else throw new Error('Invalid geometry');
    return { type: 'Feature' as const, properties: { code, name }, geometry };
  });
  const required = ['IDN', 'MYS', 'THA', 'MMR', 'SGP', 'VNM', 'KHM', 'LAO', 'BRN', 'PHL', 'IND', 'LKA', 'BGD', 'CHN'];
  if (required.some(code => !codes.has(code))) throw new Error('Missing country');
  return { type: 'FeatureCollection', features };
}
export function parseRoute(value: unknown): [number, number][] {
  if (!Array.isArray(value) || value.length < 2) throw new Error('Invalid route');
  return value.map((item: unknown) => {
    const parsed = position(item);
    const x = parsed[0]; const y = parsed[1];
    if (x === undefined || y === undefined) throw new Error('Invalid route point');
    return [x, y];
  });
}

// Page-local state only: no URL or persisted scenario state.
export type Scenario = { kind: 'normal' } | { kind: 'malacca-closed-assumption' };
export type ScenarioId = Scenario['kind'];
export type FeatureRole = 'normal' | 'unavailable' | 'candidate';
// Each change names what the map now shows, so the reader never has to remember the previous view.
type ChangeKind = 'assumption' | 'added' | 'changed' | 'shown' | 'hidden';
export const changeLabels: Record<ChangeKind, string> = { assumption: '仮定', added: '追加', changed: '変更', shown: '表示', hidden: '非表示' };
export interface ScenarioChange { kind: ChangeKind; text: string; features: readonly SelectedFeatureId[] }
export interface ScenarioDefinition {
  name: string;
  summaryTitle: string;
  changes: readonly ScenarioChange[];
  featureIds: readonly SelectedFeatureId[];
  // Role of any feature (route or strait) in this condition; absent means 'normal'.
  roles: Readonly<Partial<Record<SelectedFeatureId, FeatureRole>>>;
}
export const scenarios = {
  normal: {
    name: '通常時',
    summaryTitle: '通常時：地図に出ているもの',
    changes: [
      { kind: 'shown', text: '通常主要航路（破線・概略モデル）と、マラッカ海峡・シンガポール・ペナン島の代表点。', features: ['normal-route', 'malacca', 'singapore', 'penang'] },
      { kind: 'hidden', text: '仮定時に加わるスンダ・ロンボク経由の候補線と両海峡の代表点。', features: ['sunda-route', 'lombok-route', 'sunda', 'lombok'] },
    ],
    featureIds: ['malacca', 'normal-route', 'singapore', 'penang'],
    roles: {},
  },
  'malacca-closed-assumption': {
    name: '通行不可（仮定）',
    summaryTitle: '通常時との差分：何が変わった？',
    changes: [
      { kind: 'assumption', text: 'マラッカ海峡を通れない（×◇）。演習上の仮定で、現実の規制や出来事ではありません。', features: ['malacca'] },
      { kind: 'changed', text: '通常主要航路は使用しない比較線（点線）として残します。', features: ['normal-route'] },
      { kind: 'added', text: 'スンダ経由・ロンボク経由の候補線（長短破線）と両海峡の代表点（＋◇）。著者作成の概略モデルで、運航の可否は示しません。', features: ['sunda-route', 'lombok-route', 'sunda', 'lombok'] },
    ],
    featureIds: ['malacca', 'normal-route', 'singapore', 'penang', 'sunda-route', 'lombok-route', 'sunda', 'lombok'],
    roles: { malacca: 'unavailable', 'normal-route': 'unavailable', 'sunda-route': 'candidate', 'lombok-route': 'candidate', sunda: 'candidate', lombok: 'candidate' },
  },
} as const satisfies Record<ScenarioId, ScenarioDefinition>;
export const routeStyles: Record<FeatureRole, { dashArray: string; color: string; label: string }> = {
  normal: { dashArray: '9 7', color: '#885229', label: '通常主要航路（破線・概略モデル）' },
  unavailable: { dashArray: '2 7', color: '#697277', label: '通常主要航路：使用しない比較線（点線・仮定）' },
  candidate: { dashArray: '14 5 3 5', color: '#844a72', label: '追加：スンダ・ロンボク経由候補（長短破線・概略モデル）' },
};
export function scenarioDefinition(scenario: Scenario): ScenarioDefinition { return scenarios[scenario.kind]; }
// Role of a feature in a condition; features outside the condition have none.
export function featureRole(id: SelectedFeatureId, scenario: Scenario): FeatureRole | undefined {
  const definition = scenarioDefinition(scenario);
  return definition.featureIds.includes(id) ? definition.roles[id] ?? 'normal' : undefined;
}
const rolePrefix: Record<FeatureRole, string> = { normal: '', unavailable: '×', candidate: '＋' };
export const kindGlyph: Record<ExplorationFeature['kind'], string> = { route: '┄', strait: '◇', place: '●' };
// The symbol drawn on the map and in the list; it carries the role without relying on colour.
export function featureSymbol(feature: ExplorationFeature, scenario: Scenario): string {
  return `${rolePrefix[featureRole(feature.id, scenario) ?? 'normal']}${kindGlyph[feature.kind]}`;
}
// Features whose role differs between two conditions, including appearing or disappearing.
export function changedFeatureIds(from: Scenario, to: Scenario, features: readonly ExplorationFeature[]): SelectedFeatureId[] {
  return features.filter(feature => featureRole(feature.id, from) !== featureRole(feature.id, to)).map(feature => feature.id);
}
export function selectionForScenario(id: SelectedFeatureId, scenario: Scenario): SelectedFeatureId {
  return scenarioDefinition(scenario).featureIds.includes(id) ? id : 'malacca';
}
export function scenarioExplanation(feature: Pick<ExplorationFeature, 'id' | 'kind'>, scenario: Scenario): string {
  if (scenario.kind === 'normal') return '現在は通常時の表示です。';
  // Wording follows the feature's role in this condition and what kind of thing it is, not its id.
  const role = featureRole(feature.id, scenario);
  if (role === 'unavailable') {
    return feature.kind === 'route' ? '仮定：この通常主要航路は使用しません。点線は通常時との比較のために残しています。'
      : '仮定：この海峡を使えない条件です。＋追加した両候補との位置関係を比較できます。';
  }
  if (role === 'candidate') return '＋仮定時に追加：EIAが挙げる代替経路の検討対象です。運航可能性を保証しません。';
  return '仮定時も地理的位置は変わりません。この地点への影響や輸送量は未収録です。';
}

// Page-local visibility, independent of the scenario and selected feature.
export type LayerId = 'borders' | 'routes' | 'points';
export type LayerVisibility = Record<LayerId, boolean>;
const layerNames: Record<LayerId, string> = { borders: '国境', routes: '主要航路', points: '注目地点' };
export const layerIds: readonly LayerId[] = ['borders', 'routes', 'points'];
export function featureLayer(feature: ExplorationFeature): 'routes' | 'points' {
  return feature.kind === 'route' ? 'routes' : 'points';
}
// One vocabulary for layer state, shared by the status line, legend, notes and hidden-object notes.
const layerStateLabel = (visible: boolean): string => visible ? '表示中' : '非表示';
export const layerStatusLine = (visibility: LayerVisibility): string => layerIds.map(id => `${layerNames[id]}：${layerStateLabel(visibility[id])}`).join(' / ');
export const hiddenLayerReason = (layer: LayerId): string => `${layerNames[layer]}レイヤーが非表示`;
export function hiddenFeatureMessage(feature: ExplorationFeature, visibility: LayerVisibility): string {
  const layer = featureLayer(feature);
  return visibility[layer] ? '' : `この対象は現在地図上で非表示（${hiddenLayerReason(layer)}）`;
}
export function layerPresentation(visibility: LayerVisibility, scenario: Scenario) {
  const closed = scenario.kind !== 'normal';
  const definition = scenarioDefinition(scenario);
  const legendText = (id: LayerId, text: string) => `${text}（${layerStateLabel(visibility[id])}）`;
  return {
    status: layerStatusLine(visibility),
    // Empty while everything is visible: the initial view needs no layer explanation. Which layer is
    // hidden and what that removes is said once, in the scenario summary's notes below.
    explanation: layerIds.every(id => visibility[id]) ? ''
      : `${visibility.borders ? '' : '国境が非表示でも位置を把握するため陸地の塗りと海域名は残します。'}非表示の対象も一覧から選択でき、選択と詳細は保持します。`,
    scenarioSummary: {
      title: definition.summaryTitle,
      changes: definition.changes,
      notes: [
        ...(!visibility.routes ? [`${hiddenLayerReason('routes')}のため、航路線・候補線・航路ラベルは地図上で非表示です。再表示すると現在条件の航路が現れます。`] : []),
        ...(!visibility.points ? [`${hiddenLayerReason('points')}のため、代表点・引出線・コールアウトは地図上で非表示です。`] : []),
      ],
    },
    legends: {
      borders: { text: legendText('borders', '国境・海岸（地理）'), hidden: false, off: !visibility.borders },
      normal: { text: legendText('routes', routeStyles[closed ? 'unavailable' : 'normal'].label), hidden: false, off: !visibility.routes },
      candidate: { text: legendText('routes', routeStyles.candidate.label), hidden: !closed, off: !visibility.routes },
      strait: { text: legendText('points', '海峡の代表点'), hidden: false, off: !visibility.points },
      place: { text: legendText('points', '関連地点の代表点'), hidden: false, off: !visibility.points },
    },
  };
}
