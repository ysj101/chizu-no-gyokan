import { test, expect } from './panels';
import { mkdir } from 'node:fs/promises';
import { scenarios, scenarioExplanation } from '../../src/domain';
import type { Scenario } from '../../src/domain';

// Kept local (content.ts pulls in JSON that Node cannot import without attributes); `kind` feeds scenarioExplanation.
const features = [
  { id: 'malacca', name: 'マラッカ海峡', kind: 'strait' }, { id: 'normal-route', name: '通常主要航路', kind: 'route' },
  { id: 'singapore', name: 'シンガポール', kind: 'place' }, { id: 'penang', name: 'ペナン島', kind: 'place' },
  { id: 'sunda', name: 'スンダ海峡', kind: 'strait' }, { id: 'lombok', name: 'ロンボク海峡', kind: 'strait' },
  { id: 'sunda-route', name: 'スンダ経由候補', kind: 'route' }, { id: 'lombok-route', name: 'ロンボク経由候補', kind: 'route' },
] as const;
const unrecorded = '未収録：距離・所要時間・船舶条件・輸送能力・運航量・費用。この教材に対象別の根拠データを収録していません。ゼロや無影響を意味しません。';

for (const scenario of [{ kind: 'normal' }, { kind: 'malacca-closed-assumption' }] satisfies Scenario[]) {
  test(`three tiers, evidence and missing data: ${scenario.kind}`, async ({ page }, info) => {
    await page.goto('/');
    const panel = page.getByRole('region', { name: '選択対象の詳細', exact: true });
    if (scenario.kind !== 'normal') await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
    // Tiers two and three open once and stay open across selections.
    await page.getByText('詳しい情報', { exact: true }).click();
    await page.getByText('選択対象の根拠・日付・権利', { exact: true }).click();
    for (const id of scenarios[scenario.kind].featureIds) {
      const feature = features.find(feature => feature.id === id)!;
      await page.getByRole('button', { name: `${feature.name}を選択`, exact: true }).click();
      const selection = page.getByRole('region', { name: feature.name, exact: true });
      await expect(page.getByRole('heading', { name: feature.name, exact: true })).toBeVisible();
      if (info.project.name === 'mobile') await expect(selection).toBeInViewport();
      // Tier one: name, overview, why it matters, current condition and related places, with a short tag each.
      await expect(selection.locator('#selected-why')).toContainText('なぜ重要か：');
      await expect(selection.locator('#selected-why .tag')).toHaveText(['malacca', 'sunda', 'lombok'].includes(id) ? '事実' : 'モデル');
      await expect(selection.locator('#selected-related .related-title')).toHaveText('関連する場所');
      await expect(selection.locator('#selected-scenario')).toContainText(scenarioExplanation(feature, scenario));
      await expect(selection.locator('#selected-scenario .tag')).toHaveText(scenario.kind === 'normal' ? 'モデル' : '仮定');
      await expect(selection.locator('#selected-scenario .tag')).toHaveAttribute('title', scenario.kind === 'normal' ? '説明・推論（モデル上の説明）' : '仮定（シナリオ上の仮定）');
      // Tier two: location, cautions, glossary where the term is used, and one grouped missing-data item.
      for (const label of ['位置（地域）', '注意事項', 'この教材では扱わないデータ']) await expect(panel.getByText(label, { exact: true })).toBeVisible();
      await expect(panel.getByText('用語', { exact: true })).toHaveCount(['malacca', 'sunda', 'lombok'].includes(id) ? 1 : 0);
      await expect(panel.getByText(unrecorded, { exact: true })).toHaveCount(1);
      await expect(panel.getByText(/^(距離|所要時間|船舶条件|輸送能力|運航量|費用)$/)).toHaveCount(0);
      // Tier three: one entry per source, naming the items it supports.
      await expect(panel.getByRole('link', { name: 'Natural Earth Admin 0 Countries v5.1.2', exact: true })).toHaveCount(1);
      await expect(panel.getByRole('link', { name: 'Natural Earth Admin 0 Countries v5.1.2', exact: true })).toHaveAttribute('href', /^https:\/\/raw.githubusercontent.com\/nvkelso\/natural-earth-vector\/v5.1.2\//);
      await expect(panel.getByText(/^対応する項目：.*位置（地域）/).first()).toBeVisible();
      await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeVisible();
      await expect(panel.getByText(/対象時点：v5.1.2/)).toBeVisible();
      await expect(panel.getByText('確認日（資料参照）：2026-11-09 JST（利用条件を再確認。データ抽出はcoordinator確認）', { exact: true })).toBeVisible();
      await expect(panel.getByText(/利用条件・権利：全vector\/rasterはpublic domain/)).toBeVisible();
      await expect(panel.getByText(/再利用ライセンスは未設定/)).toBeVisible();
      if (['malacca', 'sunda', 'lombok', 'sunda-route', 'lombok-route'].includes(id)) {
        await expect(panel.getByRole('link', { name: 'EIA World Oil Transit Chokepoints', exact: true })).toHaveCount(1);
        await expect(panel.getByRole('link', { name: 'EIA World Oil Transit Chokepoints', exact: true })).toHaveAttribute('href', /eia.gov.*World_Oil_Transit_Chokepoints/);
        await expect(panel.getByText('更新日：2026-03-03', { exact: true })).toBeVisible();
        await expect(panel.getByText(/使用範囲：Strait of Malacca節/)).toContainText('日本語翻訳・要約：地図の行間');
      }
      // Tiers two and three hold no controls; related places are buttons in tier one.
      await expect(panel.getByRole('button')).toHaveCount(0);
      await expect(selection.locator('#selected-related button').first()).toBeVisible();
      await expect(page.locator('#detail-more')).toHaveAttribute('open', '');
      await expect(page.locator('#detail-sources')).toHaveAttribute('open', '');
    }
    await mkdir('artifacts/map-exploration', { recursive: true });
    await page.screenshot({ path: `artifacts/map-exploration/detail-${info.project.name}-${scenario.kind}.png`, fullPage: true });
  });
}

test('first view of a selection stays short; tiers two and three are collapsed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#selected-why')).toBeVisible();
  await expect(page.locator('#selected-related')).toBeVisible();
  await expect(page.locator('#detail-fields')).toBeHidden();
  await expect(page.locator('#detail-evidence')).toBeHidden();
  await expect(page.locator('#detail-fields')).toContainText('位置（地域）');
  await expect(page.locator('#detail-evidence')).toContainText('対応する項目：');
});

test('detail round trips retain selection and synchronize text, legend and keyboard focus with reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const panel = page.getByRole('region', { name: '選択対象の詳細', exact: true });
  const normal = page.getByRole('button', { name: '通常時', exact: true });
  const closed = page.getByRole('button', { name: '通行不可（仮定）', exact: true });
  for (const id of scenarios.normal.featureIds) {
    const feature = features.find(feature => feature.id === id)!;
    const selection = page.getByRole('button', { name: `${feature.name}を選択`, exact: true });
    await selection.focus(); await page.keyboard.press('Enter');
    const before = await panel.textContent();
    const summaryBefore = await page.getByRole('region', { name: feature.name, exact: true }).textContent();
    for (let cycle = 0; cycle < 2; cycle++) {
      await closed.focus(); await page.keyboard.press('Space');
      await expect(closed).toBeFocused(); await expect(closed).toHaveAttribute('aria-pressed', 'true');
      await expect(selection).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: feature.name, exact: true })).toHaveAttribute('aria-live', 'polite');
      await expect(page.getByRole('region', { name: feature.name, exact: true }).locator('#selected-scenario')).toContainText(scenarioExplanation(feature, { kind: 'malacca-closed-assumption' }));
      await expect(page.locator('#selected-scenario .tag')).toHaveText('仮定');
      await expect(panel.getByText(/通行不可は現実の航行規制・出来事を示しません/)).toBeAttached();
      await expect(page.getByText('現在の条件：通行不可（仮定）', { exact: true })).toHaveCount(2);
      await expect(page.getByText(/通常主要航路：使用しない比較線（点線/, { exact: false })).toBeVisible();
      await page.keyboard.press('Shift+Tab'); await expect(normal).toBeFocused(); await page.keyboard.press('Enter');
      await expect(normal).toBeFocused(); await expect(normal).toHaveAttribute('aria-pressed', 'true');
      await expect(selection).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toHaveText(before!);
      await expect(page.getByRole('region', { name: feature.name, exact: true })).toHaveText(summaryBefore!);
    }
  }
  const toggle = panel.getByText('選択対象の根拠・日付・権利', { exact: true });
  await toggle.focus(); await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeVisible();
  await closed.focus(); await page.keyboard.press('Enter');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeVisible();
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeHidden();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(panel.locator('#detail-evidence a').first()).toBeFocused();
  expect(await panel.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/detail-${info.project.name}-keyboard.png`, fullPage: true });
});

test('detail content displays hostile strings as text through scenario round trips', async ({ page }) => {
  const payload = '<img src=x onerror=document.body.dataset.injected=1>';
  // Substitute static editorial input at the built JS HTTP boundary, before app initialization.
  await page.route('**/assets/*.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('この教材に対象別の根拠データを収録していません。', payload);
    await route.fulfill({ response, body });
  });
  await page.goto('/');
  const panel = page.getByRole('region', { name: '選択対象の詳細', exact: true });
  await page.getByText('詳しい情報', { exact: true }).click();
  for (const name of ['通行不可（仮定）', '通常時']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(panel.getByText(`未収録：距離・所要時間・船舶条件・輸送能力・運航量・費用。${payload}ゼロや無影響を意味しません。`, { exact: true })).toHaveCount(1);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-injected');
  }
});
