# CG-01 最終修正の原因・観測・残ゲート

2026-11-09。実装・静的検証のみ。spec本文・元clone・Git indexは変更していない。

修正前に置いた共通前提：選択やzoom往復の前後で、地図内部のスクロール位置が変わらず、同じ実座標を画面上の同じ基準で比較できること。

## 既存証拠での検証

証拠root：`/Users/ysj/orca/tmp/chizu-map-exploration/second-browser-run/`。`test-results/`以下のdesktop keyboardとmobile selectionの`trace.zip`内`0-trace.trace`、両方の`test-failed-1.png`を確認。再実走ログは`/Users/ysj/terminals/343030.txt`。最新結果は14/16、desktopの復帰差2.197906494140625pxとmobileのtoolbar遮断が失敗。

- desktop：ArrowRight後のmap paneに`leaflet-pan-anim`があり、xが-80 → -79.7879 → -79.43 → -78.8896 → -78.62pxと変化している。非同期の境界戻り中にzoom前のbboxを保存していた。`panBy(..., {animate:false})`自体とは別に、LeafletのmaxBounds moveend処理が既定のanimated panを開始する。修正は公開APIの`panTo`で移動先を事前に境界内に制限すること。復帰判定の閾値は変更しない。
- mobile：航路tapのcall@390は4632.836ms、シンガポールtapのcall@398は4686.115ms。その直後のafter@call@398で、ペナン島markerのtransformが(156,229)から(79,3)へ変化し、-60px offsetの選択ボタンは地図上端の外へ出る。単なるtoolbarのpointer設定の問題ではない。Leaflet 1.9.4の`DomEvent.DoubleTap.js`は200ms以内のtouch clickを位置の比較なしにdblclickへ合成し、`Map.DoubleClickZoom.js`がzoomを行う。ボタンclickがmapへ伝播していた実装と、直後の描画拡大が一致する。
- その後のcall@406（ペナン島tap）では`#map`に`__playwright_scroll_left_: 21`が繰り返し記録され、0へ戻る状態と交互になる。Leafletの`Map._onScroll`もコンテナscrollTop/scrollLeftを0へ戻す実装。スクロール競合は観測できたが、選択ボタンが上端の外に出た上流原因は連続tapのzoom。scrollTopが恒常的にずれていたという証拠はない。

地図内ボタンはclick/dblclick/touchstartの伝播を止め、選択を地図操作と混同しない。航路hit pathもbubblingMouseEventsをfalseにする。地図は`overflow: clip`で描画を切り取り、ブラウザによる内部スクロールの対象から外す。ページの説明へのスクロールは維持する。

## 観測と回帰検査

Singapore海岸はtrace上で幅7px程度の小さなpathであり、巨大な国全体bboxではない。航路pathはzoomでrenderer境界にclipされ、SVGのviewBoxとtransformも移動するため、内部原点や航路全体bboxの比率を倍率と解釈できない。既存の画面相対bboxによる移動・復帰検査は維持し、実座標に固定した2つのcoordinate-dot間隔でzoom倍率を追加検査する。両端の整数pixelへの丸めを考慮し、倍増時の各軸誤差上限を3pxとする（新倍率の両端で最大1px、元倍率の両端差の2倍で最大2px）。zoom往復の位置・サイズは既存の2px未満の判定を維持する。

連続実tapを間のassertion/sleepなしで行い、代表座標点の画面位置・Singapore海岸のサイズが変わらず、map自身のscrollLeft/scrollTopが0であることを検査する。初期／最小zoom、全対象の実選択、44px・非重複検査も維持する。強制tap・JS click・テストからのLeaflet呼出しは追加していない。

## 権利と静的確認

著者作成の航路・代表点・ラベル配置の再利用ライセンスは未設定／別途確認とアプリの出典欄・READMEに明記。Natural Earth/EIAのpublic domainとは区分し、新たなライセンスは付与していない。

修正前dist JSにはLeaflet LICENSEの著作権・再配布条件・免責全文がなかった。`public/NOTICE.txt`に導入済み`node_modules/leaflet/LICENSE`の実バイト列を保持し、footerからリンクした。build後の`dist/NOTICE.txt`と公開NOTICEの一致、LICENSE全文の包含、`dist/index.html`の`/NOTICE.txt`リンクを静的に確認済み。

今回Node 24.19.0でtypecheck/build成功、Playwright `--list`で16件の定義読込み成功。ブラウザは起動していない。最初の静的buildはlogin shellのNode 26で実行されたため、外側PATHを保持する非login shellのNode 24でやり直している。auditは提供された最終JSONの0件を確認した。

残ゲート：coordinator shellによるprivacy/geometry/unit/build/verifyの一括再実走、修正後スクリーンショット・traceによる可読性と位置・倍率・選択の確認、リモートCI、人間自由探索、実screenreader音声。E2E解消・CG-01受入完了とはまだ判定しない。
