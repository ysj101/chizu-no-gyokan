# CG-02 詳細・関連・根拠

海峡・航路・関連地点を一覧または地図で選ぶと、地図の横（スマートフォンでは下）の説明カードが開き、「選択対象の詳細」を表示する（GP-01。一覧はメニューの中）。通常時の対象と仮定時の追加対象を含む。関連する場所は対象IDと一文の理由を持ち、ボタンで次の対象を選べる（UX-06）。現在の条件で表示されない対象は条件を勝手に切り替えず、`#related-status`に「〜は「通行不可（仮定）」で表示されます」と案内する。選んだ対象が画面外なら最小限だけ地図を移動する（`panInside`、倍率は変えない。一覧・地図からの選択では動かさない）。フォーカス／ホバー中は地図上の対象に`data-related-preview`の破線輪郭を出す。国別切替、レイヤー操作、メモ、予測、F-10は範囲外。

`src/details.ts`は対象IDとScenarioから3段階の`DetailView`を導出する静的表。第1段（常時表示、`#selection`内）：区分・名称・概要・「なぜ重要か」・現在の条件での意味・関連する場所（`RelatedLink[]`、`tests/e2e/related.spec.ts`）。第2段（`#detail-more`、閉じた状態で開始）：位置（地域）・注意事項・用語（狭窄部／チョークポイントを使う対象のみ）・「この教材では扱わないデータ」（距離・所要時間・船舶条件・輸送能力・運航量・費用を1項目にまとめ、ゼロや無影響ではないと説明）。第3段（`#detail-sources`、閉じた状態で開始）：資料ごとに1件、対応する項目名・原文URL・確認日・更新日・対象時点・使用範囲・利用条件・権利。各項目は区分（事実／仮定／モデルの短いタグ。title属性で正式名）と出典IDを持つ。`src/detail-panel.ts`はtextContentで描画する。2・3段の開閉は選択・条件変更で維持し、キーボード操作時のフォーカスを奪わない。モバイル選択時は従来どおり最小説明へスクロールする。

## 資料と記述の対応

参照日は2026-11-09 JST。新しい外部資料・統計は追加しない。

- [EIA World Oil Transit Chokepoints](https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/)、Last Updated March 3, 2026。Strait of Malacca節の冒頭のIndian/Pacificの接続をマラッカの事実説明に使用。同節のAlternative routes段落のSunda/Lombokとsmaller chokepointsを両海峡の事実説明に使用。候補航路はその海峡を選ぶ根拠だけをEIAに帰属させ、点列・接続海域・関連づけ・シナリオは著者モデルとする。距離・時間・容量等の数値、最短経路、海賊、パイプラインについての新しい説明は加えない。日本語翻訳・要約：地図の行間。原資料の表の対象期間は2020〜1H25だが、統計は不使用。2026-03-03は資料更新日であり現況の保証ではない。
- [EIA Copyrights and Reuse](https://www.eia.gov/about/copyrights_reuse.php)のPublic domain / translations / Protected materialsを実際に開いて確認。政府本文はpublic domain。翻訳主体・原文リンクを示す。第三者画像・ロゴ・写真は使わない。
- [Natural Earth Admin 0 Countries v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson)と[Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)を実際に開いて確認。既存の国境・海岸geometryと国コードの参照を継続。代表点・地域表現・関連づけは著者の位置関係モデルとして区分し、Natural Earthに個別海峡・港湾の運航検証を帰属させない。全vector/rasterはpublic domain。版番号と更新日は別とし、確定できない更新日は「不明」と表示。
- 地図の行間の教材モデル：既存の代表点・航路・シナリオを説明。対象時点は作成日であり地理の更新日ではない。自作物の再利用ライセンスは未設定。距離・時間・船舶条件・輸送能力・運航量・費用は未収録。

## 検証

最新実走はCIとPR本文参照。`npm test`、`npm run typecheck`、`npm run test:privacy`、`npm run test:geometry`、`npm run build`、`npm run verify`、`npm audit --json`。実走を伴う項目はcoordinator runnerで同じコマンドを使う。安全機構・検査・閾値は変更しない。

`tests/e2e/detail.spec.ts`はPC/mobile双方で以下を検証する。

- 第1段の`#selected-why`/`#selected-scenario`/`#selected-related`とタグ、第2段（「詳しい情報」を開く）の項目・用語・未収録1件、第3段（「選択対象の根拠・日付・権利」を開く）の資料1件ずつと対応項目・日付不明・対象時点・権利を確認する。関連する場所のボタンは第1段にあり、第2・3段に操作要素はない。初期状態で2・3段が閉じていることも確認する。
- 同じ通常対象を選択したまま通常時→仮定時→通常時を繰り返す。詳細・注意事項・最小説明・凡例・現在条件・aria-pressedが同期し、通常内容へ戻る。仮定時の追加対象は既存の復帰規則に従う。
- Enter/Spaceで条件と根拠開閉を操作。Tab/Shift+Tab、フォーカス表示・保持、regionの名前、既存live要約、色に依存しない区分と線種、reduced motionを確認。
- ビルド済みJSのHTTP境界で静的編集入力をHTML風文字列へ置換し、詳細の未収録欄がtextのまま、条件往復後も画像やイベントを実行しないことを確認する。
- `artifacts/map-exploration/detail-*.png`を保存する。coordinatorが実際に開き、PC/mobileの文字・根拠・スクロール・フォーカスを目視する。スクリーンショット生成もブラウザ実走ゲートの一部。

ブラウザ実走・画像確認・audit・リモートCIはcoordinator runnerとCIで実行し、結果はPR本文に記録する。人間の自由探索・実スクリーンリーダーは未実施。自動検証で人間ゲートを代用せず、MVP全体や§17の完了としない。
