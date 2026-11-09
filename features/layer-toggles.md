# CG-03 レイヤー独立切替

地図下の「表示レイヤー」行にある「国境」「主要航路」「注目地点」のトグルで個別に切り替える。ボタンの文字は変えず、状態は☑／☐とaria-pressedで示す。初期はすべて表示中。各ボタンのaria-pressed、`#visible-layers`のlive status、凡例で現在の状態が分かる。

- 国境が非表示：国境・海岸線と国名ラベルを隠す。位置を把握するため陸地の塗りと海域名は残す。
- 主要航路が非表示：通常線・比較線・候補線・選択用の線・航路ラベルを隠す。
- 注目地点が非表示：海峡・関連地点の代表点・引出線・コールアウトを隠す。

通常時→通行不可（仮定）→通常時を往復しても表示設定を保つ。全レイヤーが非表示でも条件、仮定、注意、差分、出典は読める。航路を再表示すると現在条件の線と候補が現れる。パン・ズーム・表示中の対象の選択を継続できる。トグルでページ再読込やデータ再取得は行わない。保存・URL反映、新レイヤーは追加しない。

## 選択と詳細

レイヤーを隠しても選択は解除せず、説明一覧からの選択も続けられる。詳細パネルの`#selected-visibility`は「この対象は現在地図上で非表示（主要航路レイヤーが非表示）」等と表示する。一覧にも非表示理由を文字で付け、aria-describedbyで伝える。根拠・帰属・区分・未収録は変更しない。トグル時は詳細項目や根拠のDOMを作り直さず、根拠の開閉を保持する。シナリオを通常時へ戻して候補自体が対象外になった場合は、CG-05の規則どおりマラッカ海峡へ戻る。

## 自動検証と操作

`npm run typecheck`、`npm test`、`npm run test:privacy`、`npm run test:geometry`、`npm run build`の後に`npm run verify`、`npm audit --json`。最新の実走結果はCIとPR本文を参照。

unitは全表示組合せと両シナリオの表示文・凡例状態・非表示理由を検査する。`tests/e2e/layers.spec.ts`はPC/mobileで各組合せの通常→仮定→通常、他レイヤー不変、全レイヤー非表示、仮定と注意の保持、候補再表示、非表示対象の選択・詳細保持、パン・ズーム継続、再読込・再取得なしを検査する。読込中・取得失敗からの回復も対象。

```ts
const routes = page.getByRole('button', { name: '主要航路', exact: true });
await routes.click();
await expect(routes).toHaveAttribute('aria-pressed', 'false');
await expect(page.locator('#visible-layers')).toContainText('主要航路：非表示');
```

Tab/Shift+Tabでトグル間を移動し、Enter/Spaceで操作する。フォーカスは操作したボタンに残る。状態は色以外に文字・aria-pressed・live statusで伝え、reduced motionでも操作する。Leaflet内部APIや強制クリックで検証しない。

証拠は`artifacts/map-exploration/layers-{desktop|mobile}-*.png`。全レイヤー表示中、全レイヤー非表示、航路のみ非表示の仮定時、非表示対象選択時、キーボード操作の画像を保存する。coordinator runnerで実走し、画像を開いて文字・凡例・注意・狭い画面の操作とスクロールを確認する。[verify手順](../.cursor/skills/verify-chizu-no-gyokan/SKILL.md)を参照。

人間の自由探索と実際のスクリーンリーダー確認は未実施。自動操作で代替せず、表示状態と選択理由が分かるかを観察して記録する。MVP全体や§17の受入完了とは扱わない。
