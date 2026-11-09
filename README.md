# 地図の行間 — CG-01 地図探索 / CG-05 条件実験 / CG-02 詳細情報 / CG-03 レイヤー切替 / CG-04 発見メモ

マラッカ海峡周辺の地図で対象を選び、通常時⇄通行不可（仮定）を往復する教材。スンダ・ロンボク経由候補、通常航路を使用しない比較線、追加地点・凡例・差分要約・選択説明が同期する。条件はページ内のみ。候補の出典・仮定・限界は初回から読める。選択対象の詳細は項目ごとの区分・出典・日付・権利・未収録を表示する。関連はテキストのみ。国境・主要航路・注目地点を個別に切り替え、非表示の対象も選択と詳細を保持する。発見メモは本文と保存時のシナリオ・全レイヤー・選択・viewportを同じブラウザ内へ保存し、一覧表示・削除・再読込保持ができる。メモによる地図状態の変更、国別切替・予測計算は含まない。人間の自由探索は未実施で、MVP全体・spec §17の完成ではない。

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

監査は`npm audit --json`で再実行する。最新の実走結果はCIとPR本文を参照。

## 出典・権利

- [Natural Earth countries v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson)。[全vector/raster public domain](https://www.naturalearthdata.com/about/terms-of-use/)。Made with Natural Earth。国境/海岸は一般化された小縮尺・de facto境界。高ズーム精度や政治的承認を表さない。
- [EIA World Oil Transit Chokepoints](https://www.eia.gov/international/content/analysis/special_topics/world_oil_transit_chokepoints/)、公開・更新2026-03-03。原資料の表は2020〜1H25だが不使用。インド洋と太平洋の接続、およびStrait of Malacca節がスンダ・ロンボク両海峡を代替経路・狭窄部として挙げる記述だけを採用。翻訳・日本語要約：**地図の行間**。[EIA reuse](https://www.eia.gov/about/copyrights_reuse.php)：政府出版物public domain、第三者資料・ロゴ・写真は別権利。本アプリでは画像・図・AIS・統計は転載しない。
- 著者作成の通常航路・候補航路は実座標による概略モデル。実際の船舶航跡・検証済み航行線ではない。出典は地理的位置関係の根拠であり各waypointの運航検証ではない。海峡/地点は代表点。航行案内に使用しない。運航量・所要時間・船舶条件は**未収録**で、0/無影響ではない。

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

## 検証

最新の実走結果はCIとPR本文を参照。検証対象はPython、unit、通常・スンダ・ロンボクのgeometry、typecheck/build、audit、PC/mobile実ChromiumのE2Eとする。`npm run verify`は所有previewのみを停止する。

対象地域の範囲とE2E検査を更新した後は、上記コマンドで再build・verify・auditを行い、画像も開いて両候補海峡・候補線全体・可読性を確認する。[CG-02の詳細と資料対応](features/detail-evidence.md)、[CG-05の導線と検証手順](features/scenario-switch.md)、[verify skill](.cursor/skills/verify-chizu-no-gyokan/SKILL.md)を参照。

CG-02の証拠は`artifacts/map-exploration/detail-*.png`。ブラウザ実走・画像確認・auditはcoordinator runnerで実行する。

人間の自由探索と実スクリーンリーダー確認は未実施。自動検証・画像確認の合格だけで§17やMVP全体の受入完了とはしない。

[CG-03の操作と検証](features/layer-toggles.md)：全表示組合せで両条件を往復し、表示・凡例・非表示理由・選択保持を照合する。画像は`artifacts/map-exploration/layers-*.png`。ブラウザ実走・画像確認・auditはcoordinator runnerで実行する。最新の実走結果はCIとPR本文を参照。

[CG-04の操作と検証](features/map-notes.md)：地図と説明の下の「発見メモ」へ入力し保存すると、本文・JST日時・保存時条件を新しい順で読める。空白だけなら理由を示し、保存失敗なら本文を残す。不正な記録は正常な一覧に見せず件数を知らせる。削除は本文と日時を名前に含むボタンで行える。保存・削除の結果はlive regionで伝え、削除後のフォーカスを保つ。

このブラウザ内だけに保存し、別端末へ自動同期されず、アカウント不要、外部へ送信しない。保存先はバージョン付きlocalStorage。HTML文字列は文字として描画する。F-07全体・AC-10の完成はCG-06の範囲を含む。画像は`artifacts/map-exploration/notes-*.png`。最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。
