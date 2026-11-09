import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export interface Source {
  title: string;
  url: string;
  consulted: string;
  period: string;
  usage: string;
  rights: string;
  rightsUrl: string;
}
export const sourceRegistry = {
  naturalEarth: {
    title: 'Natural Earth Admin 0 Countries v5.1.2',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson',
    consulted: '2026-11-09 JST（coordinator確認）', period: 'v5.1.2の小縮尺地理データ。現況の保証なし',
    usage: '14か国の国境・海岸。geometryと国コード・日本語名だけを抽出。国名は地図の行間による表記。',
    rights: '全vector/rasterはpublic domain。変更・配布・商用利用可。Made with Natural Earth。de facto境界。',
    rightsUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  },
  eia: {
    title: 'EIA World Oil Transit Chokepoints',
    url: 'https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/',
    consulted: '2026-11-09 JST（coordinator確認）', period: '公開・更新 2026-03-03。原資料の表は2020〜1H25（本アプリでは不使用）',
    usage: 'Strait of Malacca節：インド洋と太平洋の接続、スンダ・ロンボク両海峡が代替経路に挙がることと、それらも狭窄部であること。日本語翻訳・要約：地図の行間。画像・図・AIS・統計は転載しない。',
    rights: 'EIA政府出版物はpublic domain。第三者資料・ロゴ・写真は別権利のため不使用。',
    rightsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  author: {
    title: '地図の行間：通常航路・候補航路・代表点の教材モデル', url: '#sources',
    consulted: '2026-11-09', period: '2026-11-09作成。通常時・仮定時の位置関係の説明用',
    usage: '航路の点列と海峡・関連地点の代表座標、ラベル配置は著者作成。Natural EarthとEIAで地理的位置関係を参照。',
    rights: '著者作成の航路・代表点・ラベル配置の再利用ライセンスは未設定。再利用は別途確認が必要。参照資料のpublic domainはこれら自作物には適用されない。実際の船舶航跡・検証済み航行線ではない。航行案内には使えない。',
    rightsUrl: '#sources',
  },
} satisfies Record<string, Source>;
export type SourceRegistry = typeof sourceRegistry;
export type SourceId = keyof SourceRegistry;
export type SelectedFeatureId = 'malacca' | 'normal-route' | 'singapore' | 'penang' | 'sunda' | 'lombok' | 'sunda-route' | 'lombok-route';
interface FeatureBase {
  id: SelectedFeatureId;
  name: string;
  description: string;
  sources: readonly SourceId[];
  limitation: string;
}
export type ExplorationFeature =
  | (FeatureBase & { classification: 'geographic-fact'; kind: 'strait' | 'place'; coordinate: [number, number] })
  | (FeatureBase & { classification: 'teaching-model'; kind: 'route'; coordinates: [number, number][] });
export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error' };
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
export type RouteRole = 'normal' | 'unavailable' | 'candidate';
export interface ScenarioDefinition {
  name: string;
  summary: string;
  featureIds: readonly SelectedFeatureId[];
  routeRole: Readonly<Partial<Record<SelectedFeatureId, RouteRole>>>;
}
export const scenarios = {
  normal: {
    name: '通常時',
    summary: '通常時：通常主要航路を破線で表示。仮定時に加わるスンダ・ロンボクの候補と代表点は非表示です。',
    featureIds: ['malacca', 'normal-route', 'singapore', 'penang'],
    routeRole: { 'normal-route': 'normal' },
  },
  'malacca-closed-assumption': {
    name: '通行不可（仮定）',
    summary: '通常時との差分：通常主要航路を使用しない比較線（点線）に変更。スンダ・ロンボク経由候補（長短破線）と両海峡の代表点（＋◇）を追加します。',
    featureIds: ['malacca', 'normal-route', 'singapore', 'penang', 'sunda-route', 'lombok-route', 'sunda', 'lombok'],
    routeRole: { 'normal-route': 'unavailable', 'sunda-route': 'candidate', 'lombok-route': 'candidate' },
  },
} as const satisfies Record<ScenarioId, ScenarioDefinition>;
export const routeStyles: Record<RouteRole, { dashArray: string; color: string; label: string }> = {
  normal: { dashArray: '9 7', color: '#885229', label: '通常主要航路（破線・概略モデル）' },
  unavailable: { dashArray: '2 7', color: '#697277', label: '通常主要航路：使用しない比較線（点線・仮定）' },
  candidate: { dashArray: '14 5 3 5', color: '#844a72', label: '追加：スンダ・ロンボク経由候補（長短破線・概略モデル）' },
};
export function scenarioDefinition(scenario: Scenario): ScenarioDefinition { return scenarios[scenario.kind]; }
export function selectionForScenario(id: SelectedFeatureId, scenario: Scenario): SelectedFeatureId {
  return scenarioDefinition(scenario).featureIds.includes(id) ? id : 'malacca';
}
export function scenarioExplanation(id: SelectedFeatureId, scenario: Scenario): string {
  if (scenario.kind === 'normal') return '現在は通常時の表示です。';
  if (id === 'malacca') return '仮定：この海峡を使えない条件です。＋追加した両候補との位置関係を比較できます。';
  if (id === 'normal-route') return '仮定：この通常主要航路は使用しません。点線は通常時との比較のために残しています。';
  if (['sunda', 'lombok', 'sunda-route', 'lombok-route'].includes(id)) return '＋仮定時に追加：EIAが挙げる代替経路の検討対象です。運航可能性を保証しません。';
  return '仮定時も地理的位置は変わりません。この地点への影響や輸送量は未収録です。';
}
