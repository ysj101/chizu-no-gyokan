# CG-01 地図探索

## Sub-features

local Natural Earth背景、国名/海域名、通常時固定の航路モデル、海峡/関連地点、単一選択と最小説明、凡例、出典・限界・未収録、読込と再試行。ズーム/地域復帰とタッチ移動開始/終了は操作ボタンであり、レイヤーや条件を切り替えない。

## How to get to it (user POV)

トップページを開くとマラッカ海峡周辺の地図が現れる。破線の航路は著者モデル、◇は海峡、●は地点。地図をドラッグ、ズームボタン、地域復帰で移動する。モバイルはページスクロールを優先し、タッチ移動を開始すると地図をドラッグできる。地図の対象または説明欄の一覧を選ぶと名称・短文・区分・根拠を確認できる。選択説明は通常フローに置き、モバイルでは選択時に説明へスクロールする。資料欄を開くと対象時点と利用条件を読める。地図が失敗したら「地理データを再読み込み」を押す。

## Driving it with Playwright

`npm run build`後に`npm run verify`。PCとPixel 7/Chromiumの2 projectsを実行。詳細は[verify skill](../.cursor/skills/verify-chizu-no-gyokan/SKILL.md)。

```ts
await page.getByRole('button', { name: '地図上のマラッカ海峡を選択', exact: true }).click();
await expect(page.getByRole('heading', { name: 'マラッカ海峡', exact: true })).toBeVisible();
await page.getByRole('button', { name: '通常主要航路を選択', exact: true }).click();
await expect(page.locator('#selected-kind')).toHaveText('航路 / モデル上の説明');
await page.getByRole('button', { name: '対象地域に戻る', exact: true }).click();
```

キーボードは地図regionへTab移動し矢印/＋/−。ボタンはEnter。ドラッグはmouse入力、モバイルはChromiumの実touch入力。内部map APIは使わない。HTTP route interceptは失敗を生成する境界に限定する。固定保存先`artifacts/map-exploration/`。

## Gotchas

- 世界全体の精密地図ではない。zoom 4〜7、移動範囲制限あり。小縮尺de facto境界と代表点を使う。
- 初期3レイヤーは常時表示。独立ON/OFF、条件変更、代替航路、詳細全項目、メモ等は範囲外。
- 運航量/所要時間/船舶条件は未収録。航路はAISでも検証済み航行線でもない。
- 外部タイルなし。資料リンクの利用者による遷移を除きruntimeは同一origin内だけ。
- 依存導入済み。coordinatorのNode 24実走でprivacy/CI fixture 11件・unit 13件・typecheck/build・geometryが合格、最終auditは0件。最新E2Eは14/16件合格。最終修正後の一括実走・実画面確認、リモートCI、人間自由探索、実screenreader音声は未実施。CG-01の受入、MVP全体、§17の合格を意味しない。

- Natural Earth/EIAの権利と著者作成物を区分する。航路・代表点・ラベル配置の再利用ライセンスは未設定／別途確認。LeafletのBSD-2-Clause全文は公開NOTICEとfooterリンクで配布する。
