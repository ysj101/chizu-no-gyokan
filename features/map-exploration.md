# CG-01 地図探索

## Sub-features

local Natural Earth背景、国名/海域名、条件に応じた航路モデル、海峡/関連地点、単一選択と最小説明、凡例、出典・限界・未収録、読込と再試行。ズーム/地域復帰と「タッチで地図を動かす」は操作ボタンであり、レイヤーを切り替えない。条件実験は[CG-05](scenario-switch.md)を参照。

## How to get to it (user POV)

トップページを開くとマラッカ海峡周辺の地図が現れる。破線の航路は著者モデル、◇は海峡、●は地点。地図をドラッグ、ズームボタン、地域復帰で移動する。モバイルは地図が画面上部に留まり、説明はその下をスクロールする（UX-08）。ページスクロールを優先し、地図右上の「タッチで地図を動かす」をオンにすると地図をドラッグできる。指でなぞると何が起きるかは、ボタン直下の短い案内に示す。地図の対象または説明欄の一覧を選ぶと名称・短文・区分・根拠を確認できる。選択説明は通常フローに置き、モバイルでは選択時に固定地図の直下へスクロールする。初期画面は地図・条件ボタン・短い注意（仮定／概略モデル）・凡例に絞り、操作方法と長い読み方・注意は折りたたみ（「地図の操作方法」「この地図の読み方と注意」）から開く。レイヤー切替は凡例の下の「表示レイヤー」行に置き、説明はいずれかが非表示のときだけ出す。資料欄を開くと対象時点と利用条件を読める。地図が失敗したら「地理データを再読み込み」を押す。

## Driving it with Playwright

`npm run build`後に`npm run verify`。PCとPixel 7/Chromiumの2 projectsを実行。詳細は[verify skill](../.cursor/skills/verify-chizu-no-gyokan/SKILL.md)。

```ts
await page.getByRole('button', { name: '地図上のマラッカ海峡を選択', exact: true }).click();
await expect(page.getByRole('heading', { name: 'マラッカ海峡', exact: true })).toBeVisible();
await page.getByRole('button', { name: '通常主要航路を選択', exact: true }).click();
await expect(page.locator('#selected-kind')).toHaveText('航路 / モデル上の説明');
await page.getByRole('button', { name: '対象地域に戻す', exact: true }).click();
```

キーボードは地図regionへTab移動し矢印/＋/−。ボタンはEnter。ドラッグはmouse入力、モバイルはChromiumの実touch入力。内部map APIは使わない。HTTP route interceptは失敗を生成する境界に限定する。固定保存先`artifacts/map-exploration/`。

## Gotchas

- 世界全体の精密地図ではない。zoom 4〜7、移動範囲制限あり。小縮尺de facto境界と代表点を使う。
- 初期は全レイヤーを表示。[CG-03](layer-toggles.md)で独立に表示・非表示、[CG-02](detail-evidence.md)で詳細項目を追加。メモ等は範囲外。条件変更・代替航路はCG-05で追加。
- 運航量/所要時間/船舶条件は未収録。航路はAISでも検証済み航行線でもない。
- 外部タイルなし。資料リンクの利用者による遷移を除きruntimeは同一origin内だけ。
- 最新実走の結果と画像確認状況はCIとPR本文を参照。変更後はbuild/verify/auditと画像確認を再実行する。リモートCI、人間自由探索、実screenreader音声は未実施。MVP全体・§17の受入完了を意味しない。

- Natural Earth/EIAの権利と著者作成物を区分する。航路・代表点・ラベル配置の再利用ライセンスは未設定／別途確認。LeafletのBSD-2-Clause全文は公開NOTICEとfooterリンクで配布する。

## CG-05による追加

[条件実験](scenario-switch.md)で通常時⇄通行不可（仮定）を往復できる。読込statusは`#load-status`、条件差分のlive statusは`#scenario-summary`なので、status全体の曖昧なselectorを使わない。初期表示・地域復帰は両候補海峡と候補線全体を含む。条件切替で位置・倍率は変えない。再実行手順はREADMEを参照。最新の実走結果はCIとPR本文を参照。
