# CG-06 メモから保存時の地図状態へ戻る

発見メモ一覧の「このメモの地図状態に戻す」を押す。アクセシブル名には本文とJST日時を含む。保存時のシナリオ、国境・主要航路・注目地点のON/OFF、選択地点、viewportの中心とzoomを一度に適用する。仮定時だけの候補も選べる。選択なしなら最小説明・詳細・根拠・強調・ariaを解除する。非表示対象の選択は保持し、CG-03の非表示理由を読める。

地図・現在条件・visible-layers・トグル・凡例・最小説明・詳細が同期する。viewportは現在の画面サイズに応じた既存maxBoundsとzoom制限に収め、調整時は文字で知らせる。地理的に不正な座標、既存保存検証で拒否するzoom、欠けた状態を推測で直さない。

結果は`#notes-status`のlive regionで日時とシナリオ・全レイヤー・選択を伝える。フォーカスをボタン自身に保ち、狭い画面でも結果と次のメモをその場で読める。地図はアニメーションなしで移動し、reduced motionでも操作できる。入力中の本文は消えない。復元後は通常の地図操作で探索し、新しいメモを保存できる。元メモは変えず、新メモも再読込後に復元できる。

## 保存境界と失敗

CG-04の`DiscoveryNote`と`NoteMapState`をそのまま使う。クリック時にlocalStorageを読み直し、正常で一意な記録を検証してから適用する。消失・破損・必須項目欠落・重複ID・読込拒否では失敗を文字で伝え、地図を変えない。不正記録は正常な一覧に出さず、復元ボタンも作らない。新しい保存形式や補完は設けない。

復元では保存領域へ書き込まず、ページ再読込・データ再取得も行わない。保存・一覧・削除・失敗時入力保持と、端末内保存・自動同期なし・外部送信なしの説明を維持する。編集・共有・エクスポート・URL反映・ログイン・同期は含まない。

## 検証

`npm run typecheck`、`npm test`、`npm run test:privacy`、`npm run test:geometry`、`npm run build`の後、`npm run verify`と`npm audit --json`。最新の実走結果はCIとPR本文を参照。

`tests/notes.test.ts`で両シナリオ×全レイヤー組合せ×選択あり／なしの完全置換とコピー、viewport制約、不正・欠落状態の拒否を確認する。`tests/e2e/restore.spec.ts`はPC/mobileで実UI保存→再読込→別状態→連続復元を行い、描画・aria・凡例・説明・詳細を照合する。探索継続・新規保存・再訪、元メモ不変、選択なし、非表示候補、storageの後発破損、通信、キーボード、reduced motionも確認する。

CG-04 E2Eの「復元系ボタンがない」は、本Issueのボタンだけを認める検査へ更新した。追加ボタン分のTab順も更新し、削除先フォーカスとほかの期待値・対象外機能の除外は維持する。

画像は`artifacts/map-exploration/restore-{desktop|mobile}-{before|assumption-hidden-selection|no-selection|new-note|failure-*|keyboard}.png`。[verify手順](../.cursor/skills/verify-chizu-no-gyokan/SKILL.md)で画像を開き、PC/mobileの文字・選択・詳細・操作を確認する。最新の実走結果はCIとPR本文を参照。人間の自由探索と実際のスクリーンリーダー確認は未実施。自動操作だけで人間テストやMVP全体の完成を判定しない。
