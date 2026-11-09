# CG-01 architecture / decision trail

2026-11-09。固定spec `250af65d856b3473fac78c2634f48fabeaeaae86` と提供されたIssue1写しを読み、縮小scopeを優先。spec本文は変更しない。通常時の地図→選択→最小説明だけを1人で所有する。MVP全体・§17の完成ではない。

## 構成の比較と選択

| 候補 | 利点 | この範囲での費用 |
| --- | --- | --- |
| React + TypeScript + Leaflet | 宣言的な説明描画、状態とUIの同期 | React本体・統合境界・ライフサイクルが追加される |
| plain TypeScript + Leaflet | 小さい依存、単一選択と読込状態を直接表現 | DOM更新の責務を手動で限定する必要がある |

後者を採用。Viteで配信し、Leafletの地図は一度だけ生成。選択説明はtextContent、地図マーカーもDOM要素で作る。外部JSONはunknownからPolygon/MultiPolygonと必要属性を検証する。strictとnoUncheckedIndexedAccessを有効にする。CG-05で以下の二値シナリオを追加。汎用レイヤー管理は作らない。

## 先に定義するドメイン

- `SourceRegistry`: 静的な資料名・URL・参照日・対象時点・使用範囲・利用条件。
- `ExplorationFeature`: `geographic-fact`（海峡/地点、代表点）と `teaching-model`（通常航路、概略線）の判別可能なunion。出典は座標の運航検証を意味しない。
- `SelectedFeatureId`: 単一のID。地図とテキスト選択一覧は同じ選択関数を使う。
- `LoadState`: `loading | ready | error`。取得・JSON解釈・境界検証が成功してからready。errorから再試行でき、選択による再fetchはない。

## Blockingとデータ判断

Issue/spec確認、geometryとrightsがblocking。Independentはn/a、Sharedはこの専用worktreeのみ。Smallestは地図・選択・最小説明の1縦断成果。Natural Earth v5.1.2の指定SHA256を照合して必要な14か国のgeometryと識別子・名称のみ抽出。座標は丸めも補間もせず保持。小縮尺・de facto境界である旨を初回に表示。外部タイル・フォント・API・実行時外部通信は使わない（出典リンクを利用者が開く場合を除く）。local JSONをHTTP fetchし、失敗/不正JSON/再試行を実際の境界として検証する。

航路は著者の概略モデル。マラッカ海峡からシンガポール海峡を通り南シナ海に向かう点列で、AISでも航行案内でもない。Natural Earthの陸地との線分交差を標準ライブラリの検査で確認する。海岸線自体の精度や専門的航行検証を保証しない。高ズームを制限し、実画面で陸地を貫いて見えないかはcoordinatorが実画面で確認する。

## 画面方針と見直し

海 `#dcecf0`、陸 `#edf0e5`、墨 `#203c45`、航路 `#885229`、選択 `#146d78`、紙 `#fafcfa`。見出しは游明朝/ヒラギノ明朝、操作はシステム日本語sans。左揃え、PCは地図:説明がおよそ3:1。モバイルは地図→stickyな選択要約→資料。地図の曲線・地理そのものを主役にし、装飾カードやゲームの進行表示は置かない。

PC: `[ 大きな地図 / 操作 / 凡例 ][ 選択 / 短い説明 / 資料 ]`

Mobile: `[ 地図 ][ 選択要約 ][ 対象一覧 / 資料 ]`

初案をbriefと照合し、モバイルのドラッグとページスクロールの競合を避けるため、初期はタッチドラッグOFF、明示ボタンで開始/終了する方式にした。ピンチズームとズームボタン、キーボードは利用できる。モーションはすべて無効化する。Leaflet既定のキーボードpanアニメーションを避け、地図regionのキー入力でanimate:falseのpan/zoomを呼ぶ。

## 検証の境界

依存導入とブラウザ実走はcoordinator担当。Playwrightはbuild済みpreviewを実UIから操作し、内部map APIを呼ばない。固定artifactsへ証拠を保存する。人間自由探索は未実施で、合格扱いにしない。メール保護は提供shellを参考にPython stdlibで実装し、Git失敗時の終了値を握りつぶさない。identityは読取結果を表示しない。フック設定helperはworktree設定だけを使用し、既存設定を上書きしない。

## CG-05 条件実験

`Scenario`は`normal | malacca-closed-assumption`の判別共用体。`scenarios`静的表が表示対象・通常航路の役割・条件名・要約を定義し、`routeStyles`で通常の破線／使用しない比較線の点線／候補の長短破線を対応させる。色以外に×／＋、凡例とテキストで差分を伝える。URL・保存・復元は実装しない。

Leafletインスタンスと地理背景groupは維持し、切替時はscenario用groupと対象一覧・説明を再描画する。fetchは初回と明示的な再試行だけ。通常時と共通の選択は維持し、通常時に存在しない候補を選んで戻した場合はマラッカ海峡を選択する。pan/zoomは切替で変更しない。初期表示と地域復帰は両候補海峡・候補線全体を含む共通のboundsを使い、移動範囲制限は探索中心の範囲に最小zoom時の画面半幅・半高を投影座標で加え、初期化とresize時に設定する。画面全体を収めるLeafletのmaxBoundsが、広い画面で中心移動を固定しないようにする。探索中に画面外となった候補は「スンダ海峡へ移動」「ロンボク海峡へ移動」で探索できる。読込中・失敗時も条件は選べるが地図対象は描画せず、成功後に選んだ条件を反映する。statusの失敗案内は切替で上書きしない。

著者作成の短い航路は表示線・選択線とも`noClip: true`で点列を保持し、パン・zoomによる端点の切詰めと破線開始位置の変化を避ける。海岸の描画最適化は維持し、航路の画面外描画はSVGと地図コンテナで切り取る。

EIA World Oil Transit Chokepointsの2026-03-03版、Strait of Malacca節を2026-11-09に実際に開いて確認。代替経路としてスンダ・ロンボク海峡が挙がること、両海峡も狭窄部であることだけを候補の根拠とする。点列・海域間の接続は著者作成の概略モデル（`src/candidate-routes.json`）。原文はwaypointや運航可否を検証する資料ではない。図・AIS・統計は使わず、距離・時間・容量・費用も作らない。船舶条件・輸送能力は未検証、数値は未収録。著者作成物のライセンスは未設定のまま。一次資料の短い日本語要約・原文・対象時点・帰属・利用条件は初期表示から案内する。

geometry検査は通常線と両候補すべてについて配布Natural Earthの14か国の陸地内部・海岸交差・接触を拒否する。小島の省略された一般化地形に対する検査であり、航海用の保証にはならない。最新の実走結果はCIとPR本文を参照。表示範囲の変更後はbuild/verify/auditと実画像確認を再実行する。所有previewのみ停止する。リモートCI・人間自由探索・実スクリーンリーダー音声は未実施。再実行手順はREADMEとfeature mapを参照。


## CG-02 詳細情報・関連・根拠

`src/details.ts`の静的表から対象IDとScenarioで詳細項目を導出する。各項目は区分と非空の出典ID配列を持ち、`recorded | unrecorded`の判別共用体で欠損を表す。位置の表現・関連づけは著者モデル、EIA本文の接続と代替海峡の記述は事実として項目単位で区分する。シナリオ意味は最小説明と共通の`scenarioExplanation`を使い、注意事項も条件と同時に再描画する。資料registryに更新日を追加し、不明と資料版番号を区別する。

`src/detail-panel.ts`が既存説明欄にテキストと出典リンクを生成する。詳細regionは見出しで命名し、短い既存live要約を維持。根拠は初回から展開するnative detailsで、開閉要素自体は再生成せず開閉状態とフォーカスを維持する。外部文章はtextContentで扱う。関連は文章のみで、ナビゲーションを作らない。レイアウトとモバイルの選択時スクロールは既存の方式を継続。

資料原文と採用記述の対応、PC/mobileの検証手順は[feature map](../features/detail-evidence.md)。最新の実走結果はCIとPR本文を参照。ブラウザ実走・画像確認・auditはcoordinator runnerで実行する。人間の自由探索と実スクリーンリーダー確認は未実施で、自動検証で置き換えない。


## CG-03 レイヤー独立切替

`LayerVisibility = Record<'borders' | 'routes' | 'points', boolean>`は初期すべてONのページ内状態。Scenarioと選択IDから独立し、条件往復でも変更しない。`layerPresentation`が有効表示・説明・条件差分への非表示理由・凡例を純粋に導出する。`featureLayer`と`hiddenFeatureMessage`で一覧と詳細の非表示理由を対応させる。unitは全組合せと両シナリオを網羅する。

背景groupには陸地の塗りと海域名を残す。国境線・国名、航路線・選択線・航路ラベル、代表点・引出線・コールアウトはそれぞれ別の`L.layerGroup`に置く。国境線は既存geometryの塗りなし描画で、外部データを追加しない。トグルではgroupを付け外しし、地図・対象一覧・詳細を再生成しない。再表示後に選択のaria-pressedと強調を同期する。シナリオ時の対象再描画と候補選択の復帰規則はCG-05を継続する。読込中・失敗中のトグルも保持し、成功後に反映する。fetchは初回と明示的再試行だけ。

選択は保持し、非表示対象も一覧から選べる。詳細パネルに非表示理由を追加し、既存の詳細項目・根拠・区分・欠損は維持する。一覧の非表示理由は文字とaria-describedbyで伝える。全OFFでも現在条件、仮定、差分、注意、出典は残る。native buttonの文字とaria-pressed、live statusで状態を伝え、フォーカスと既存のモーション削減を維持する。

PC/mobileの実UI検査・画像・キーボード操作は[CG-03 feature map](../features/layer-toggles.md)と`tests/e2e/layers.spec.ts`を参照。最新の実走結果はCIとPR本文を参照。人間の自由探索と実スクリーンリーダー確認は未実施。

## CG-04 地図状態付き発見メモ

`src/notes.ts`はDOMに依存しない`DiscoveryNote`／`NoteMapState`、unknownからResultへの検証、parse／serialize、新しい順の並べ替え、JST日時と関連状態の表示文を持つ。選択なしはnull、全レイヤーは明示的boolean。viewportの中心・zoomも必須とし、現在の地図から保存直前に採取する。保存用の検証結果は入れ子もコピーし、現在の状態とは共有しない。

注入可能な`NoteStorage`境界でlocalStorageの読込・書込例外をResultにする。バージョン付きキー`chizu-no-gyokan.notes.v1`へ`{version: 1, notes: [...]}`を書き込む。保存直前と読込時の双方で完全な状態を検証し、欠落・不正値を推測で埋めない。不正記録・重複IDは一覧から除外して件数を文字で伝え、正常メモへの操作でも不正記録の元データは保持する。不正JSON・対応外バージョン・読込不能では上書きしない。各保存・削除の前に保存領域を読み、書込成功後だけ一覧を更新する。同時の別タブ操作を原子的に調停する仕組みは設けない。

`src/notes-panel.ts`がラベル付きtextarea、一覧、個別削除、空状態、live regionを接続する。localStorage getterへのアクセスも遅延して例外境界内で行う。HTML解釈を使わずtextContentで本文を描画し、保存失敗時は本文を維持する。削除後は次／前の削除ボタン、空なら入力欄へフォーカスを移す。保存された本文・日時・状態は一覧で常時読める。現在の地図を変更する処理は持たず、既存のシナリオ・レイヤー・選択・読込の挙動は維持する。探索だけでは保存領域へ書き込まない。

保存は同じブラウザ内のみ。アカウント・外部送信・同期・エクスポートは追加しない。unitで状態の組合せと拒否・失敗・削除を検査し、PlaywrightはPC/mobileで再読込保持、HTML非実行、通信、キーボード、フォーカス、モーション削減を実UIから確認する。証拠・操作手順は[CG-04 feature map](../features/map-notes.md)。最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。F-07全体・AC-10の完成はCG-06の範囲を含む。
