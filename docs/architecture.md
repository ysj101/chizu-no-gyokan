# CG-01 architecture / decision trail

2026-11-09。固定spec `250af65d856b3473fac78c2634f48fabeaeaae86` と提供されたIssue1写しを読み、縮小scopeを優先。spec本文は変更しない。通常時の地図→選択→最小説明だけを1人で所有する。MVP全体・§17の完成ではない。

## 構成の比較と選択

| 候補 | 利点 | この範囲での費用 |
| --- | --- | --- |
| React + TypeScript + Leaflet | 宣言的な説明描画、状態とUIの同期 | React本体・統合境界・ライフサイクルが追加される |
| plain TypeScript + Leaflet | 小さい依存、単一選択と読込状態を直接表現 | DOM更新の責務を手動で限定する必要がある |

後者を採用。Viteで配信し、Leafletの地図は一度だけ生成。選択説明はtextContent、地図マーカーもDOM要素で作る。外部JSONはunknownからPolygon/MultiPolygonと必要属性を検証する。strictとnoUncheckedIndexedAccessを有効にする。将来のシナリオや汎用レイヤー管理は作らない。

## 先に定義するドメイン

- `SourceRegistry`: 静的な資料名・URL・参照日・対象時点・使用範囲・利用条件。
- `ExplorationFeature`: `geographic-fact`（海峡/地点、代表点）と `teaching-model`（通常航路、概略線）の判別可能なunion。出典は座標の運航検証を意味しない。
- `SelectedFeatureId`: 単一のID。地図とテキスト選択一覧は同じ選択関数を使う。
- `LoadState`: `loading | ready | error`。取得・JSON解釈・境界検証が成功してからready。errorから再試行でき、選択による再fetchはない。

## Blockingとデータ判断

Issue/spec確認、geometryとrightsがblocking。Independentはn/a、Sharedはこの専用worktreeのみ。Smallestは地図・選択・最小説明の1縦断成果。Natural Earth v5.1.2の指定SHA256を照合して必要な14か国のgeometryと識別子・名称のみ抽出。座標は丸めも補間もせず保持。小縮尺・de facto境界である旨を初回に表示。外部タイル・フォント・API・実行時外部通信は使わない（出典リンクを利用者が開く場合を除く）。local JSONをHTTP fetchし、失敗/不正JSON/再試行を実際の境界として検証する。

航路は著者の概略モデル。マラッカ海峡からシンガポール海峡を通り南シナ海に向かう点列で、AISでも航行案内でもない。Natural Earthの陸地との線分交差を標準ライブラリの検査で確認する。海岸線自体の精度や専門的航行検証を保証しない。高ズームを制限し、実画面で陸地を貫いて見えないかはcoordinatorの検証ゲートに残す。

## 画面方針と見直し

海 `#dcecf0`、陸 `#edf0e5`、墨 `#203c45`、航路 `#885229`、選択 `#146d78`、紙 `#fafcfa`。見出しは游明朝/ヒラギノ明朝、操作はシステム日本語sans。左揃え、PCは地図:説明がおよそ3:1。モバイルは地図→stickyな選択要約→資料。地図の曲線・地理そのものを主役にし、装飾カードやゲームの進行表示は置かない。

PC: `[ 大きな地図 / 操作 / 凡例 ][ 選択 / 短い説明 / 資料 ]`

Mobile: `[ 地図 ][ 選択要約 ][ 対象一覧 / 資料 ]`

初案をbriefと照合し、モバイルのドラッグとページスクロールの競合を避けるため、初期はタッチドラッグOFF、明示ボタンで開始/終了する方式にした。ピンチズームとズームボタン、キーボードは利用できる。モーションはすべて無効化する。Leaflet既定のキーボードpanアニメーションを避け、地図regionのキー入力でanimate:falseのpan/zoomを呼ぶ。

## 検証の境界

依存導入とブラウザ実走はcoordinator担当。Playwrightはbuild済みpreviewを実UIから操作し、内部map APIを呼ばない。固定artifactsへ証拠を保存する。人間自由探索は未実施で、合格扱いにしない。メール保護は提供shellを参考にPython stdlibで実装し、Git失敗時の終了値を握りつぶさない。identityは読取結果を表示しない。フック設定helperはworktree設定だけを使用し、既存設定を上書きしない。
