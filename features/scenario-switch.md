# CG-05 条件実験

## 利用者の導線

初回は地図の上に「もしマラッカ海峡を通れなくなったら？」の問いと主ボタン「通行不可にして変化を見る」を出す（`#intro`）。押すと仮定へ切り替わり、フォーカスは「通行不可（仮定）」ボタンへ移り、案内は閉じて「はじめ方を見る」で再表示できる。条件ボタンで仮定にした場合も案内は閉じる。案内は地図や注記を覆わず、閉じた状態はページ内だけで保持し、storageに書かない。案内を使わず地図を直接操作してもよい。

基本の流れ: 地図を開く→マラッカ海峡を選ぶ→「通行不可（仮定）」→候補と差分・限界を確認→「通常時」で戻す。同じ画面に双方の条件ボタンがあり、現在条件は地図内のラベルにも表示する。切替では地図の位置・倍率を保持する。

通常の破線を、仮定時は「使用しない比較線」の点線として残す。スンダ・ロンボク経由候補の長短破線と両海峡の＋◇を追加し、マラッカは×◇になる。凡例・表示対象・差分要約・選択説明は同時に更新する。差分要約（`#scenario-summary`）は「何が変わった？」の見出しと、仮定／変更／追加（通常時は表示／非表示）のタグ付き2〜3項目で、直前の状態を覚えていなくても読める。切替直後は、役割（`roles`：通常／使用しない／候補）が変わった対象（`changedFeatureIds`。出現・消失を含む）を約2.5秒だけ`data-just-changed`属性で強調する。`prefers-reduced-motion`では動きを止めて静的な輪郭だけ残す。色を使わなくても意味を読める。左右2地図の比較は、固定の探索範囲・キーボード操作・モバイル負担を考えて採用せず、点線の比較線を重ねる単一地図の差分表示にしている。

初期表示と「対象地域に戻す」は両候補海峡と候補線全体が入る範囲。通常時は候補を描画せず、条件切替でも地図を自動移動しない。地図上のマラッカ海峡の「通れなくしてみる」／「元に戻す」でも条件を切り替えられる（GP-02）。仮定時は地図上で候補の線・海峡を選ぶか「スンダ経由を試す」「ロンボク経由を試す」を押すと、その候補が強調され、もう一方が控えめになる。試した候補が画面外なら地図が最小限だけ寄る。mobileでは対象選択後に説明へスクロールする。共通対象の選択は往復で保持し、候補を選んで通常時に戻すとマラッカ海峡の説明に戻る。

## 根拠と限界

[EIA World Oil Transit Chokepoints](https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/)、更新2026-03-03、参照2026-11-09。Strait of Malacca節を実際に開いて確認した。採用する記述範囲はインド洋・太平洋の接続、スンダ・ロンボク両海峡が代替経路に挙がり、それらも狭窄部であることだけ。短い日本語要約は地図の行間が作成。図・統計・AISの転載なし。本文public domain、第三者資料は不使用。著者作成の点列・代表点の再利用ライセンスは未設定。

候補線のwaypoint・接続海域は著者の概略モデルで、EIAが運航を検証した線ではない。船舶条件・輸送能力は検証せず、距離・日数・輸送量・費用は作らない。未収録は0や無影響を意味しない。通行不可は演習上の仮定で現実の規制・出来事ではない。自動迂回・予測・航行案内として使わない。

## 自動検証

`npm run test:privacy` / `npm run test:geometry` / `npm test` / `npm run build` / `npm run verify` / `npm audit --json`。Node 24を使用する。新依存は追加しない。

Playwrightは既存PC/mobile両projectで、初期の位置・倍率のまま仮定へ切り替え、ユーザーに見える海峡ボタン・名称と候補線のbounding boxが地図内に収まること、地域復帰後も同じ範囲に戻ることを確認する。往復・共通選択の同期・候補選択後の復帰・凡例と実SVGのdash・追加記号・出典・仮定と限界・request数・URL/storage非保存を確認する。往復後も実ドラッグ・zoom・選択を操作。キーボードはTabから条件ボタンへ移動してSpace/Enter、aria-pressedとフォーカスを検査。reduced motionを設定する。読込中・HTTP/JSON/geometry失敗時に切り替え、再試行の成功後に条件を反映。外部文字列の非実行も往復後に検査する。

主なselector:

- `getByRole('button', { name: '通行不可にして変化を見る', exact: true })`／`はじめ方を見る`／`閉じる`（初回案内、`tests/e2e/intro.spec.ts`）
- `getByRole('button', { name: '通常時', exact: true })`
- `getByRole('button', { name: '通行不可（仮定）', exact: true })`
- `getByRole('button', { name: 'スンダ経由候補を選択', exact: true })`（ロンボクも同様）
- `getByRole('button', { name: 'スンダ経由を試す', exact: true })`
- `#scenario-summary`は差分のlive status（`.summary-title`／`li .tag`／`.summary-note`）、`#load-status`は読込状態。強調は`#map [data-just-changed]`（`tests/e2e/diff.spec.ts`）。

内部Leaflet呼出し・force click・DOMイベントのJS dispatch・既存検査の削除は使わない。geometryは通常線・両候補のすべてを配布Natural Earthに対して検査し、陸地内部・海岸との交差/接触を拒否する。

## 証拠と残ゲート

画像保存先は`artifacts/map-exploration/scenario-{desktop|mobile}-{closed|sunda-selected|lombok-selected|restored-exploration|keyboard-reduced-motion|retry-*}.png`。両候補の局所表示だけでなく、パン・縮小して全線を追い、陸地との見た目を確認する。取得した画像を実際に開いて可読性・差分・地形を確認し、結果を記録する。

最新実走の結果と画像確認状況はCIとPR本文を参照。対象地域の範囲・E2E更新後は、上記コマンドと画像確認を再実行する。所有previewのみ停止する。

人間の自由探索と実スクリーンリーダー音声、リモートCIは未実施。人間探索で変更点・候補の制約・仮定/モデル/欠損の理解を観察する。自動検証だけで§17やMVP全体の完了としない。PR #7既知のmobileラベル近接は変更していない。
