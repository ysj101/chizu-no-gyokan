---
name: verify-chizu-no-gyokan
description: CG-01地図探索・CG-05条件実験・CG-02詳細・CG-03レイヤー切替・CG-04発見メモ・CG-06復元をbuild済みpreviewで起動確認し、PC・モバイルの操作とHTTP失敗をPlaywrightで検証して証拠を保存する。
---

# Verify CG-01 map exploration / CG-05 scenario switch

実施担当はcoordinator。これは実行可能な手順であり、このファイルの存在を実施済みの証拠にしない。依存導入・Chromium導入の権限は担当者が確認する。人間の自由探索を自動検証で代用しない。

最新の実走結果はCIとPR本文を参照。変更後は以下を再実行し、画像を開いて確認する。所有previewのみ停止する。人間自由探索と実screenreader音声は未実施。

## Accessibility regression (UX-10)

`tests/e2e/a11y.spec.ts` が Tab 到達性（罠なし・順序・フォーカス可視）、アクセシブル名と aria-pressed／aria-expanded、ランドマークと live region、スキップリンク、文字拡大 150／200%、モバイルのターゲット寸法を検査する。色に依存しない記号・線種、読込失敗時の案内と復帰、reduced motion は `map.spec.ts`／`diff.spec.ts`／`layers.spec.ts` に含む。人間のスクリーンリーダー確認とユーザーテストは `docs/qa-log.md` と `docs/user-test-log.md` に記録し、自動検証で代用しない。

## Launch

リポジトリroot、Node 22以上、Python 3を使う。

```sh
# 依存・Chromiumは導入済み。再導入が必要な環境では担当者の許可範囲で別途準備する。
npm run test:privacy
npm run test:geometry
npm test
npm run build
npm run verify
npm audit --json
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
- `getByRole('button', { name: '＋ 拡大', exact: true })`、`− 縮小`、`対象地域に戻す`。
- `getByRole('button', { name: '地図上のマラッカ海峡を選択', exact: true })`。海峡/航路/関連地点それぞれを選択しheadingと一覧のaria-pressedを確認。
- `getByRole('button', { name: '通常主要航路を選択', exact: true })`をEnter操作。選択は単一、再fetch/ページ遷移なし。
- モバイルでは`タッチで地図を動かす`（aria-pressed）をオン→実タッチドラッグ→オフ。オフ後のページスクロール、固定地図の直下へ選択説明がスクロールすること、`#map-hint`の文言を確かめる。
- `getByText('出典・対象時点・利用条件', { exact: true })`で資料を展開。Natural Earth/EIAのpublic domain、更新日、翻訳主体、原文、モデル・代表点・未収録を確認。著者作成の航路・代表点・ラベル配置は再利用ライセンス未設定／別途確認であること、footerのNOTICEにLeafletのBSD-2-Clause全文があることも確認。
- `**/data/countries.json`をHTTP 503 / 不正JSON / 不正geometryへ差し替えて、statusの案内と`地理データを再読み込み`による回復を検証。

テストからLeafletの内部map/setView/fitBoundsは呼ばない。位置追従は実ドラッグ、キーボードとボタン操作後の画面上の代表座標点・小さなSingapore海岸・航路で確認する。倍率は代表座標点間隔で確認し、SVG内部原点や巨大な国全体bboxを根拠にしない。zoom往復の復帰は既存の2px未満、点間隔の倍増は両端の整数pixel丸めに由来する各軸最大3pxを用いる。連続実タップ後も位置・海岸サイズが変わらず、地図自身のscrollLeft/scrollTopが0であることを確認する。reduced motionはブラウザ設定を変更して操作する。外部HTMLの非実行、対象外UIの不在、外部通信なしも検査する。

## Evidence

固定保存先は`artifacts/map-exploration/`。PlaywrightのPC/mobileスクリーンショット、report、失敗時trace/video、preview.log、drive.log、verify.log、server.jsonを保持する。実走後のログで成否を判断する。画像を開いて、国名・海域名の可読性、海峡付近で破線が陸を貫かないこと、選択説明、狭い画面のスクロールと操作の競合を確認する。証拠のない項目を合格にしない。

人間ゲート（未実施）: 誘導を抑えた自由探索で移動・選択の発見と地理的事実/教材モデル/欠損の理解を観察し、問題を修正する。実施者・日時・環境・観察結果・修正を別記する。MVP全体や§17完了とは記録しない。

## Cleanup

一括verifyはfinallyで、自分がspawnしたpreviewのChildProcessだけにSIGTERMを送り、必要時だけ同じchildへSIGKILLする。--serveはそのterminalでCtrl-C。同じwrapperが所有PIDのみ停止しcleanupを記録する。Doctorはserverを作らない。`pkill`、portから特定した無関係PIDのkill、証拠削除をしない。異常終了後に残ったPIDをファイルの数値だけでkillしない。

## CG-05 条件実験のDrive

詳細は[feature map](../../../features/scenario-switch.md)。次をPCとmobile双方で検証する。証拠名は既存と区別し`scenario-desktop-*` / `scenario-mobile-*`。

1. 初期の位置・倍率のまま仮定へ切り替え、両候補海峡のボタン・名称と候補線全体のbounding boxが地図内に収まることをPC/mobileで確認する。パン・zoom後の「対象地域に戻す」でも同じ範囲を確認する。`マラッカ海峡`を選択し、`getByRole('button', { name: '通行不可（仮定）', exact: true })`で切替。`通常時`ボタンも同画面に残り、aria-pressedが逆転、`#current-condition`と`#scenario-summary`が更新される。
2. 通常線が点線、候補2本が長短破線、マラッカは×◇、追加海峡は＋◇。凡例・差分要約・選択説明が同じ条件を示す。通常線は「使用しない比較線」である。
3. 通常航路・既存地点を選択したまま往復し、説明と選択状態の同期を確認。候補を選んで戻した場合はマラッカへ復帰し、候補線・代表点・一覧項目が消える。
4. 両候補海域への移動ボタンと実地図の海峡ボタンを操作。出典（EIA 2026-03-03/参照2026-11-09）、日本語要約主体、原文、public domain、著者ライセンス未設定、仮定、狭窄部・未検証・未収録を初回から確認する。
5. Tab/Shift+Tab、Enter/Spaceで往復。フォーカス・aria-pressed・live statusを照合し、reduced motion設定でも確認する。往復後に実ドラッグ・zoom・選択を継続。documentとcountriesのrequestは各1回、URL・storageへ状態を保存しない。
6. 初回HTTPを遅延し読込中に切替。HTTP 503/不正JSON/不正geometryでも切替を往復し、失敗案内と再試行を維持。回復時に選択条件の候補を描画する。外部HTML文字列は往復後もtextのままで実行されない。
7. `scenario-*.png`を実際に開き、PC/mobileの文字・凡例・差分・選択説明、候補の陸地交差を確認する。geometry合格で画像確認を代用しない。人間自由探索と実screenreader音声を別に記録する。


## CG-02 詳細情報のDrive

[詳細のfeature map](../../../features/detail-evidence.md)と`tests/e2e/detail.spec.ts`を参照。既存の一括`npm run verify`に含む。最新実走はCIとPR本文参照。

PC/mobileで通常対象と仮定時の追加対象を選択し、`getByRole('region', { name: '選択対象の詳細', exact: true })`内の全項目・区分・資料名/URL・確認日/更新日不明・対象時点・使用範囲・権利・未収録を確認する。関連は文章のみ。同じ通常対象を選択したまま両条件を往復し、詳細意味・注意事項・最小説明・凡例を照合する。Enter/Spaceで根拠を開閉し、Tab/Shift+Tab・フォーカス・aria・reduced motionを確認する。HTML風の編集入力をビルド済みJSのHTTP境界で置換し、テキストのままで実行されないことを検証する。

`artifacts/map-exploration/detail-*.png`を保存して実際に開き、狭い画面の可読性、根拠の初回表示とスクロール、地図選択後の説明を目視する。待受・registryがsandboxで拒否される場合は回避せず、coordinator runnerで同じverify/auditを実行する。人間自由探索と実スクリーンリーダーは未実施として残し、ブラウザや画像の未実走を合格にしない。


## CG-03 レイヤー独立切替のDrive

[CG-03 feature map](../../../features/layer-toggles.md)と`tests/e2e/layers.spec.ts`を参照。既存の一括`npm run verify`に含む。実行前に`npm run typecheck`、`npm test`、`npm run test:privacy`、`npm run test:geometry`、`npm run build`を実行する。最新の実走結果はCIとPR本文を参照。

1. PC/mobileで「国境」「主要航路」「注目地点」のトグルを個別操作し、全組合せで他レイヤーが不変、実描画と文字・aria-pressed・`#visible-layers`・凡例が一致することを確認する。国境が非表示でも陸地の塗りと海域名は残す。
2. 各組合せで通常→仮定→通常を往復。設定保持、現在条件、候補と点の線種・記号、差分・注意の同期を確認する。全レイヤーが非表示でも非表示理由を読め、航路が非表示でも仮定・注意が残ること、再表示で現在条件の候補と説明が現れることを確認する。
3. 海峡と航路を選んでから隠す。選択・詳細・根拠・区分・未収録・根拠の開閉を保持し、詳細と一覧が非表示理由を文字で伝えることを確認する。隠したまま一覧から通常対象と候補を選ぶ。候補を選んで通常へ戻した場合は従来のマラッカ復帰規則を確認する。
4. 切替後に地図regionの矢印・＋/−、地域復帰、地図上の選択を続ける。documentとcountriesの不要なrequestなし、URL/storage保存なし。読込中・取得失敗中にも設定し、再試行成功後に反映することを確認する。
5. Tab/Shift+Tabでトグルを辿りEnter/Spaceで切り替える。フォーカス表示と保持、live status、reduced motion設定下の操作を確認する。
6. `artifacts/map-exploration/layers-{desktop|mobile}-*.png`に全レイヤー表示中・全レイヤー非表示・航路のみ非表示の仮定時・非表示対象選択時・キーボード操作を保存し、実際に開いて文字と凡例、注意、狭い画面の操作・スクロールを確認する。

待受がEPERM、registryがENOTFOUNDの環境では回避せず、coordinator runnerでverifyとauditを実行する。最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。自動操作で代用せず、表示状態と非表示理由の理解を観察して別に記録する。

## CG-04 地図状態付き発見メモのDrive

[CG-04 feature map](../../../features/map-notes.md)と`tests/e2e/notes.spec.ts`を参照。既存の一括`npm run verify`に含む。実行前に`npm run typecheck`、`npm test`、`npm run test:privacy`、`npm run test:geometry`、`npm run build`を実行する。最新の実走結果はCIとPR本文を参照。

1. PC/mobileで`getByRole('region', { name: '発見メモ', exact: true })`へ移動。空状態と、このブラウザ内のみ・自動同期なし・アカウント不要・外部送信なしの説明を読む。`getByRole('textbox', { name: 'メモ本文', exact: true })`へ入力し、「メモを保存」を操作する。
2. 異なるシナリオ・レイヤー・選択で複数件保存し、新しい順で本文・JST日時・条件・全レイヤー・選択が対応することを読む。保存後に地図を変更しても一覧は不変。保存されたviewportも記録する。選択なしと必須状態の欠落はfixtureとunitで区別し、不完全な記録は正常扱いにしない。CG-06の「このメモの地図状態に戻す」だけを意図的に追加し、ほかの対象外UIの除外条件を維持する。
3. 再読込して全内容が保持されることを確認。本文と日時で識別できる削除ボタンで対象を削除し、次／前の削除ボタン、空なら入力欄へフォーカスが移ることを確認する。再読込して削除したものだけが消えていることを確かめる。
4. 空白だけの本文で理由と入力欄へのフォーカスを確認。`page.addInitScript`で`Storage.prototype.setItem`を例外にし、保存失敗・入力保持・一覧不追加を検査する。削除失敗時は既存メモを保持する。localStorageアクセス拒否と不正記録の件数も検査する。
5. HTML文字列を入力・保存・再読込。本文がtextのままで、dialog・onerror実行・img/script生成がないことを確認する。全操作中のネットワーク要求を記録し、同一originの静的アセットと既存データだけで、メモ本文・関連状態をURLや要求本文に含めないことを確認する。
6. Tab/Shift+Tab、Enter/Spaceで保存・一覧閲覧・削除を操作し、ラベル、フォーカス表示と移動、`#notes-status`のlive regionを照合する。reduced motionで同じ操作を行う。
7. `artifacts/map-exploration/notes-{desktop|mobile}-{empty|multiple|save-failure|html|keyboard}.png`を保存して実際に開き、本文と条件の対応、文字の折返し、狭い画面のスクロール、キーボードフォーカスを確認する。

待受がEPERM、registryがENOTFOUNDの環境では回避せず、coordinator runnerでverifyとauditを実行する。最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。自動操作で代用せず、保存内容と当時の条件を一覧から理解できるかを別に観察して記録する。


## CG-06 メモからの地図状態復元のDrive

[CG-06 feature map](../../../features/note-restore.md)と`tests/e2e/restore.spec.ts`を参照。既存の一括verifyに含む。typecheck、unit、privacy、geometry、buildの後、PC/mobileで以下を実行する。最新の実走結果はCIとPR本文を参照。

1. 実UIで両シナリオ・全レイヤー組合せ・異なる選択のメモを保存し、再読込する。地図を別条件・別レイヤー・別選択・別viewportへ動かす。各件の本文と日時を名前に含む「このメモの地図状態に戻す」を順次押し、前の復元が混在しないことを確認する。
2. 現在条件、レイヤートグルのaria-pressed、visible-layers、凡例、地図の線種・強調、選択aria、最小説明、全詳細・根拠・欠損を保存時と照合する。仮定時だけの候補、非表示対象の選択と非表示理由、null選択時の説明・詳細・強調解除を確認する。
3. 保存時の中心・zoomへ戻ることと、範囲外の有効な中心が既存制約内へ調整され文字で案内されることを確認する。欠けた記録・不正zoomは推測補完せず一覧と復元ボタンから除外する。
4. 復元後にパン・zoom・選択・条件往復・レイヤー切替を行い新しいメモを保存。元メモの全内容が不変、新メモの状態が探索内容に対応し、再読込後も新メモを復元できることを確認する。入力中本文は復元でも保持する。
5. 表示後にstorageの記録を削除・破損・重複化、不正JSONまたはアクセス拒否にし、押した際の失敗表示と地図不変を確認する。ネットワーク記録は同一originの静的アセットと既存データのGETだけで、本文・関連状態を含めない。復元による再読込・再fetchがないことを確認する。
6. Tab／Shift+TabとEnter／Space、reduced motionで復元する。ボタンの名前・フォーカス表示と保持、live regionの日時・シナリオ・全レイヤー・選択の通知を照合する。削除後の次／前の削除ボタン、空なら本文欄へのフォーカスも回帰確認する。
7. `restore-{desktop|mobile}-{before|assumption-hidden-selection|no-selection|new-note|failure-*|keyboard}.png`を`artifacts/map-exploration/`へ保存して開く。PC/mobileの可読性、凡例と選択・詳細の一致、スクロールとキーボードフォーカスを確認する。

最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。自動操作で代用せず、保存から再訪・探索継続・新規保存までの理解と操作を別に観察して記録する。
