# 地図の行間 — CG-01 地図探索

マラッカ海峡周辺を実座標で動かし、海峡・通常主要航路・少数の関連地点を選んで最小説明と根拠を読む独立成果。**通常時だけ**。条件切替・代替航路・比較・独立レイヤーON/OFF・詳細全項目・メモ・ログイン・予測計算は含まない。MVP全体・spec §17の完成ではない。

plain TypeScript（strict）＋Leaflet＋Vite。[構成比較とdecision trail](docs/architecture.md)。外部タイル・runtime外部通信・契約・API keyなし。背景JSONは同一originからfetchする。出典リンクは利用者の操作で外部へ開く。

## Run / build / test / verify

Node 22以上、Python 3。依存導入・ブラウザ実走はcoordinator担当。

```sh
npm ci
npm run dev
# http://127.0.0.1:5173 （readyはViteのLocal URL）
npm run typecheck
npm test
npm run test:privacy
npm run test:geometry
npm run build
npm run preview
# http://127.0.0.1:4173
```

previewを手動で起動した場合はそのterminalで終了してから一括verifyを実行する。

```sh
npx playwright install chromium
npm run verify
```

verifyはbuild済みpreviewを起動、HTTP/portのDoctor、実UIのPlaywright操作、証拠保存、所有PIDのみCleanupまで行う。単独Doctorは`npm run verify -- --doctor`、手動起動保持は`npm run verify -- --serve`。Driveのみは`npm run test:e2e`。[verify skill](.cursor/skills/verify-chizu-no-gyokan/SKILL.md)と[feature map](features/map-exploration.md)を参照。証拠は`artifacts/map-exploration/`（Git対象外）に保持する。

依存導入済み。`package-lock.json`を保全し、CIは`npm ci --ignore-scripts`で固定依存を導入する。

coordinatorがNode 24.19.0でVite 6.4.5 / Vitest 4.1.12を導入済み。2026-11-09の最終audit（`/Users/ysj/orca/tmp/chizu-map-exploration/npm-audit-final.json`）は脆弱性0件。lockと導入済み依存も4.1.12で一致する。このaudit時点の結果であり、将来の脆弱性不存在を保証するものではない。override / forceは使用していない。

## 出典・権利

- [Natural Earth countries v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson)。[全vector/raster public domain](https://www.naturalearthdata.com/about/terms-of-use/)。Made with Natural Earth。国境/海岸は一般化された小縮尺・de facto境界。高ズーム精度や政治的承認を表さない。
- [EIA World Oil Transit Chokepoints](https://www.eia.gov/international/content/analysis/special_topics/world_oil_transit_chokepoints/)、公開・更新2026-03-03。原資料の表は2020〜1H25だが不使用。インド洋と太平洋を結ぶ基本論点のみ、翻訳・日本語要約：**地図の行間**。[EIA reuse](https://www.eia.gov/about/copyrights_reuse.php)：政府出版物public domain、第三者資料・ロゴ・写真は別権利。本アプリでは画像・図・AIS・統計は転載しない。
- 著者作成の通常航路は実座標による概略モデル。実際の船舶航跡・検証済み航行線ではない。出典は地理的位置関係の根拠であり各waypointの運航検証ではない。海峡/地点は代表点。航行案内に使用しない。運航量・所要時間・船舶条件は**未収録**で、0/無影響ではない。

資料の権利ページとEIA本文はcoordinatorが2026-11-09 JST確認済み。詳細registryは[src/domain.ts](src/domain.ts)。日本語国名・ラベル位置・代表点は著者表記。著者作成の航路・代表点・ラベル配置およびコード全体の再利用ライセンスは未設定で、再利用は別途確認が必要。Natural Earth/EIAのpublic domainはこれら自作物には適用されない。Leaflet 1.9.4はBSD-2-Clause。配布物の[NOTICE](public/NOTICE.txt)に導入済み`node_modules/leaflet/LICENSE`の著作権・条件・免責全文を保持し、アプリfooterからリンクする。

原データは配布せず14か国・必要属性だけを配布。指定SHA256と一致した入力から再生成する。

```sh
python3 scripts/import-geography.py /path/to/ne_50m_admin_0_countries-v5.1.2.geojson
npm run test:geometry
```

入力SHA256: `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`。座標の変更/丸めなし。抽出JSONは約288KB。線分と陸地の検査は一般化された原形状に対する検査であり、画面や海図精度の保証ではない。

## CIとメール保護

`CI` workflowは全branch pushとPRで起動し、通常quality jobでcheckout（fetch-depth 0）直後にprivacyを実行。author/committer/message全文（Co-authored-byを含む）/env経由PR title・bodyを検査する。通常pushはbefore..head（squash messageを含む）、PRはbase..head。beforeがzeroのbranch初回pushはorigin/mainとのmerge-base..headで新規commitを検査する。main自体の初回pushのみ--all。分岐点取得を含めGit失敗はfail closed。検出出力は全アドレスをmaskする。

```sh
sh scripts/check-email-privacy.sh BASE..HEAD
sh scripts/check-email-privacy.sh --commit-msg /path/to/message
```

既定許可は`@users.noreply.github.com`末尾、および`noreply@github.com` / `noreply@anthropic.com`の完全一致。`EMAIL_ALLOWLIST`で空白区切りのsuffix（@始まり）/完全一致へ差替可能。空文字は全拒否。実際の個人メールをコマンドやPR本文に入れない。commit-msgは拒否だけで本文を変更しない。

prepareはCIでは何もしない。ローカルhelperはcoordinatorが有効化した`extensions.worktreeConfig=true`が前提。既存core.hooksPathがあれば上書きせず、未設定時のみ`git config --worktree core.hooksPath .githooks`を設定する。共有Git設定は変更しない。fixtureは実在のidentityを読まずexample.testのsyntheticとfake Gitだけを使う。

## 検証状況と残るゲート

実施済み: Natural Earth指定SHA256照合・再生成。Node 24.19.0でTypeScript typecheck・production build・unit 13件、配布陸地と航路線分の交差検査が合格。Pythonメール保護fixture 6件とCI検査範囲fixture 5件も合格。航路の不正入力はobject tableで1件ずつ全体を渡し、可変長配列のtuple推論エラーを解消した。

coordinatorの最新Chromium再実走はdesktop/mobile計16件中14件合格。残る2件はdesktopのkeyboard zoom往復（2.197906px差）とmobileのペナン島tap遮断。初期viewport・タッチボタン・引出線・PC地図の可読性と巨大余白の解消はcoordinatorが実画面で確認済み。

今回の最終修正は、矢印移動後のmaxBounds戻りアニメーションを避ける移動先の事前制限、地図上ボタンのtouch clickが連続選択をdouble tap zoomに変えていた伝播の遮断、地図内部のブラウザスクロールを防ぐ`overflow: clip`。既存の2px未満の復帰判定を維持し、画面上の代表座標点の間隔による倍率検査と連続実タップ時の位置・海岸サイズ不変／内部scroll 0の回帰検査を追加した。[原因と証拠](docs/map-exploration-final-review.md)。SVG内部原点の一致や巨大な国全体bboxは倍率の根拠にしない。

**未完了**: 今回の最終修正後の一括実走と実画面確認、verify全工程の成功確認、リモートCI実行。外側coordinator shellがprivacy・geometry・unit・build・verifyを一括実行する。実スクリーンリーダーの音声確認も未実施であり、自動キーボード操作・ARIA検査とは区別する。

**人間自由探索も未実施で、PRのゲートは未通過**。誘導を抑えた探索で、移動・選択・説明と事実/モデルの理解を観察し、問題を修正することがCG-01の受入ゲート。自動テストだけで完了にしない。coordinatorへdiffを返す段階であり、commit/push/PR/Issue操作・マージは行っていない。
