---
name: verify-chizu-no-gyokan
description: CG-01の通常時地図探索をbuild済みpreviewで起動確認し、PC・モバイルの操作とHTTP失敗をPlaywrightで検証して証拠を保存する。
---

# Verify CG-01 map exploration

実施担当はcoordinator。これは実行可能な手順であり、このファイルの存在を実施済みの証拠にしない。依存導入・Chromium導入の権限は担当者が確認する。人間の自由探索を自動検証で代用しない。

2026-11-09の直近結果: Node 24.19.0、privacy/CI fixture 11件・unit 13件・geometry・typecheck/build合格、audit 0件。E2E 14/16件。最終修正後の再実走は未実施でcoordinator担当。リモートCI・人間自由探索・実screenreader音声も未実施。

## Launch

リポジトリroot、Node 22以上、Python 3を使う。

```sh
# 依存・Chromiumは導入済み。再導入が必要な環境では担当者の許可範囲で別途準備する。
npm run test:privacy
npm run test:geometry
npm test
npm run build
npm run verify
```

`verify`は`node scripts/verify.mjs`。distが必要。実コマンドは`node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort`。4173が使用中なら拒否し、既存serverに流用しない。stdoutの`http://127.0.0.1:4173`とHTTP 200を最大12秒で検出する。Viteのdev serverは検証対象にしない。

個別に観察する場合、build後に`npm run verify -- --serve`。ready後に止めず、別terminalからDoctorとDriveを行う。--serveではCtrl-Cまで起動を保持する。

## Doctor

```sh
npm run verify -- --doctor
```

port 4173のHTTPを読み取り、`/`のタイトル文字列と`/data/countries.json`のFeatureCollection/14か国を確認する。ファイル・地図状態を変更しない。verify.logへ確認結果のみ追記する。readyの推測や固定sleepだけで開始しない。

## Drive

一括verifyは`node node_modules/@playwright/test/cli.js test`を起動する。既に--serve中なら`npm run test:e2e`。ARIA selectorsは実装と同じものを使う。

- `getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true })`をTabでフォーカス。矢印/＋/−でパン・ズーム。
- `getByRole('button', { name: '地図を拡大', exact: true })`、`地図を縮小`、`対象地域に戻る`。
- `getByRole('button', { name: '地図上のマラッカ海峡を選択', exact: true })`。海峡/航路/関連地点それぞれを選択しheadingと一覧のaria-pressedを確認。
- `getByRole('button', { name: '通常主要航路を選択', exact: true })`をEnter操作。選択は単一、再fetch/ページ遷移なし。
- モバイルでは`タッチ移動を開始`→実タッチドラッグ→`タッチ移動を終了`。終了後のページスクロール、通常フローの説明と選択時の説明へのスクロールを確かめる。
- `getByText('出典・対象時点・利用条件', { exact: true })`で資料を展開。Natural Earth/EIAのpublic domain、更新日、翻訳主体、原文、モデル・代表点・未収録を確認。著者作成の航路・代表点・ラベル配置は再利用ライセンス未設定／別途確認であること、footerのNOTICEにLeafletのBSD-2-Clause全文があることも確認。
- `**/data/countries.json`をHTTP 503 / 不正JSON / 不正geometryへ差し替えて、statusの案内と`地理データを再読み込み`による回復を検証。

テストからLeafletの内部map/setView/fitBoundsは呼ばない。位置追従は実ドラッグ、キーボードとボタン操作後の画面上の代表座標点・小さなSingapore海岸・航路で確認する。倍率は代表座標点間隔で確認し、SVG内部原点や巨大な国全体bboxを根拠にしない。zoom往復の復帰は既存の2px未満、点間隔の倍増は両端の整数pixel丸めに由来する各軸最大3pxを用いる。連続実タップ後も位置・海岸サイズが変わらず、地図自身のscrollLeft/scrollTopが0であることを確認する。reduced motionはブラウザ設定を変更して操作する。外部HTMLの非実行、対象外UIの不在、外部通信なしも検査する。

## Evidence

固定保存先は`artifacts/map-exploration/`。PlaywrightのPC/mobileスクリーンショット、report、失敗時trace/video、preview.log、drive.log、verify.log、server.jsonを保持する。実走後のログで成否を判断する。画像を開いて、国名・海域名の可読性、海峡付近で破線が陸を貫かないこと、選択説明、狭い画面のスクロールと操作の競合を確認する。証拠のない項目を合格にしない。

人間ゲート（未実施）: 誘導を抑えた自由探索で移動・選択の発見と地理的事実/教材モデル/欠損の理解を観察し、問題を修正する。実施者・日時・環境・観察結果・修正を別記する。MVP全体や§17完了とは記録しない。

## Cleanup

一括verifyはfinallyで、自分がspawnしたpreviewのChildProcessだけにSIGTERMを送り、必要時だけ同じchildへSIGKILLする。--serveはそのterminalでCtrl-C。同じwrapperが所有PIDのみ停止しcleanupを記録する。Doctorはserverを作らない。`pkill`、portから特定した無関係PIDのkill、証拠削除をしない。異常終了後に残ったPIDをファイルの数値だけでkillしない。
