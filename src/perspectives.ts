import type { Classification, SelectedFeatureId, SourceId } from './domain';

// A country's view is a teaching example: a few sourced statements about what the same strait means
// from that place, plus the map features worth looking at. Facts carry their data period (or fall back
// to the source's update date); readings are the author's reading of positions on the map and never
// claim what a state intends to do. Statements are never scenario assumptions.
export type PerspectiveId = 'japan' | 'singapore' | 'china' | 'indonesia';
export interface PerspectiveStatement {
  text: string;
  classification: Exclude<Classification, 'assumption'>;
  sources: readonly [SourceId, ...SourceId[]];
  period?: string;
}
export interface Perspective {
  name: string;
  meaning: PerspectiveStatement;
  statements: readonly PerspectiveStatement[];
  focus: readonly SelectedFeatureId[];
}
const fact = (text: string, sources: PerspectiveStatement['sources'], period?: string): PerspectiveStatement => ({ text, classification: 'fact', sources, period });
const reading = (text: string): PerspectiveStatement => ({ text, classification: 'explanation', sources: ['author'] });
export const perspectiveIds: readonly PerspectiveId[] = ['japan', 'singapore', 'china', 'indonesia'];
export const perspectiveTitle = (view: Perspective): string => `${view.name}から見たマラッカ海峡`;
export const perspectives: Record<PerspectiveId, Perspective> = {
  japan: {
    name: '日本',
    meaning: reading('中東から日本へ向かう原油・LNGのタンカーが通る最短の海路の上にあります。'),
    statements: [
      fact('日本は2022年に石油需要の97%を輸入に頼り、原油輸入の93%が中東からでした。', ['eiaJapan'], '2022年のデータ'),
      fact('日本はLNGと原油の供給をタンカー輸送に頼っています。', ['eiaJapan']),
      fact('ホルムズ海峡を通る原油の主な仕向け先は中国・インド・日本・韓国で、合計74%でした。', ['eia'], '2025年上半期'),
      fact('マラッカ海峡はインド洋と太平洋を結び、中東の産油国とアジアの主要市場を結ぶ最短の海路です。', ['eia']),
      reading('中東→ホルムズ海峡→インド洋→マラッカ海峡→南シナ海→日本、という位置関係を地図で辿れます。実際の航跡や代替経路の可否、費用は収録していません。'),
    ],
    focus: ['malacca', 'normal-route', 'singapore'],
  },
  singapore: {
    name: 'シンガポール',
    meaning: reading('海峡の東側の出口にあり、海峡を通る船が目の前を通過する位置にあります。'),
    statements: [
      fact('シンガポールはマレー半島の南端に位置します。', ['naturalEarth']),
      reading('この教材の通常主要航路は、マラッカ海峡から南シナ海側へ抜ける出口付近でシンガポールの近くを通る位置関係にあります。'),
      fact('EIAは国際海事局の報告を引き、2023年以降シンガポール周辺で船舶への攻撃が増えたとしています。', ['eia'], '2023年〜2025年上半期'),
      fact('インドネシアは南シナ海の西ナトゥナ・ガス田からシンガポールへ天然ガスを供給しています。', ['eiaIndonesia'], '2024年のデータ'),
      reading('海峡の通航に変化があれば影響を受けやすい位置にあることは地図から読めます。影響の大きさや対応は収録していません。'),
    ],
    focus: ['singapore', 'malacca', 'normal-route'],
  },
  china: {
    name: '中国',
    meaning: fact('2025年上半期にマラッカ海峡を通った原油輸入量の48%は中国向けでした。', ['eia'], '2025年上半期'),
    statements: [
      fact('中国の原油輸入は2024年に日量1,110万バレルで、92%が海上輸送でした。主な輸入元はロシア（20%）とサウジアラビア（14%）です。', ['eiaChina'], '2024年のデータ'),
      fact('ミャンマーから中国南西部へ中東産の原油を運ぶパイプラインがあります。', ['eia', 'eiaChina']),
      fact('カタールから中国へのLNGは2020年以降2倍超に増えました。', ['eia'], '2020年〜2025年上半期'),
      reading('海上輸送の比率が高いことと、パイプラインという別の経路があることを、地図上の位置関係として比べられます。政策の評価は行いません。'),
    ],
    focus: ['malacca', 'normal-route'],
  },
  indonesia: {
    name: 'インドネシア',
    meaning: fact('代替候補とされるスンダ海峡・ロンボク海峡は、いずれもインドネシア多島海の中にあります。', ['eia']),
    statements: [
      fact('EIAは、マラッカ海峡を避ける経路として両海峡のほか、多島海全体を回る長い経路も挙げています。', ['eia']),
      fact('インドネシアは2024年に世界6位のLNG輸出国（世界貿易の4.3%）で、2023年には世界3位の石炭生産国でした。', ['eiaIndonesia'], '2023年・2024年のデータ'),
      fact('インドネシアは南シナ海の西ナトゥナ・ガス田からシンガポールへ天然ガスを供給しています。', ['eiaIndonesia'], '2024年のデータ'),
      reading('仮定時の候補線はいずれもインドネシアの海域を通る位置関係にあります。通航の条件や影響は収録していません。'),
    ],
    focus: ['sunda', 'lombok', 'sunda-route', 'lombok-route', 'malacca'],
  },
};
