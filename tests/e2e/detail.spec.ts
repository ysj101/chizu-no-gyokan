import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { scenarios, scenarioExplanation } from '../../src/domain';
import type { Scenario } from '../../src/domain';

const features = [
  { id: 'malacca', name: 'マラッカ海峡' }, { id: 'normal-route', name: '通常主要航路' },
  { id: 'singapore', name: 'シンガポール' }, { id: 'penang', name: 'ペナン島' },
  { id: 'sunda', name: 'スンダ海峡' }, { id: 'lombok', name: 'ロンボク海峡' },
  { id: 'sunda-route', name: 'スンダ経由候補' }, { id: 'lombok-route', name: 'ロンボク経由候補' },
];

for (const scenario of [{ kind: 'normal' }, { kind: 'malacca-closed-assumption' }] satisfies Scenario[]) {
  test(`all details and evidence: ${scenario.kind}`, async ({ page }, info) => {
    await page.goto('/');
    const panel = page.getByRole('region', { name: '選択対象の詳細', exact: true });
    if (scenario.kind !== 'normal') await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
    for (const id of scenarios[scenario.kind].featureIds) {
      const feature = features.find(feature => feature.id === id)!;
      await page.getByRole('button', { name: `${feature.name}を選択`, exact: true }).click();
      await expect(page.getByRole('heading', { name: feature.name, exact: true })).toBeVisible();
      if (info.project.name === 'mobile') await expect(page.getByRole('region', { name: feature.name, exact: true })).toBeInViewport();
      for (const label of ['名称', '位置（地域）', '短い解説', '関連航路・関連地点', '現在シナリオでの意味', '注意事項', '距離', '所要時間', '船舶条件', '輸送能力', '運航量', '費用']) {
        await expect(panel.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(panel.getByText(`[説明・推論（モデル上の説明）] ${feature.name}`, { exact: true })).toBeVisible();
      const classification = scenario.kind === 'normal' ? '説明・推論（モデル上の説明）' : '仮定（シナリオ上の仮定）';
      await expect(panel.getByText(`[${classification}] ${scenarioExplanation(id, scenario)}`, { exact: true })).toBeVisible();
      await expect(panel.getByText('[説明・推論（モデル上の説明）] 未収録：この教材に対象別の根拠データを収録していません。ゼロや無影響を意味しません。', { exact: true })).toHaveCount(6);
      if (['malacca', 'sunda', 'lombok'].includes(id)) await expect(panel.getByText(/^\[事実（地理的事実）\]/)).toBeVisible();
      else await expect(panel.getByText(/^\[事実（地理的事実）\]/)).toHaveCount(0);
      await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Natural Earth Admin 0 Countries v5.1.2', exact: true }).first()).toHaveAttribute('href', /^https:\/\/raw.githubusercontent.com\/nvkelso\/natural-earth-vector\/v5.1.2\//);
      await expect(panel.getByText(/対象時点：v5.1.2/)).toBeVisible();
      await expect(panel.getByText('確認日（資料参照）：2026-11-09 JST（利用条件を再確認。データ抽出はcoordinator確認）', { exact: true })).toBeVisible();
      await expect(panel.getByText(/利用条件・権利：全vector\/rasterはpublic domain/)).toBeVisible();
      await expect(panel.getByText(/再利用ライセンスは未設定/)).toBeVisible();
      if (['malacca', 'sunda', 'lombok', 'sunda-route', 'lombok-route'].includes(id)) {
        await expect(panel.getByRole('link', { name: 'EIA World Oil Transit Chokepoints', exact: true }).first()).toHaveAttribute('href', /eia.gov.*World_Oil_Transit_Chokepoints/);
        await expect(panel.getByText('更新日：2026-03-03', { exact: true })).toBeVisible();
        await expect(panel.getByText(/使用範囲：Strait of Malacca節/)).toContainText('日本語翻訳・要約：地図の行間');
      }
      // Related targets are plain text; only evidence links appear in the panel.
      await expect(panel.getByRole('button')).toHaveCount(0);
    }
    await mkdir('artifacts/map-exploration', { recursive: true });
    await page.screenshot({ path: `artifacts/map-exploration/detail-${info.project.name}-${scenario.kind}.png`, fullPage: true });
  });
}

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
    for (let cycle = 0; cycle < 2; cycle++) {
      await closed.focus(); await page.keyboard.press('Space');
      await expect(closed).toBeFocused(); await expect(closed).toHaveAttribute('aria-pressed', 'true');
      await expect(selection).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: feature.name, exact: true })).toHaveAttribute('aria-live', 'polite');
      await expect(page.getByRole('region', { name: feature.name, exact: true }).getByText(scenarioExplanation(id, { kind: 'malacca-closed-assumption' }), { exact: true })).toBeVisible();
      await expect(panel.getByText(`[仮定（シナリオ上の仮定）] ${scenarioExplanation(id, { kind: 'malacca-closed-assumption' })}`, { exact: true })).toBeVisible();
      await expect(panel.getByText(/通行不可は現実の航行規制・出来事を示しません/)).toBeVisible();
      await expect(page.getByText('現在：通行不可（仮定）', { exact: true })).toHaveCount(2);
      await expect(page.getByText(/通常主要航路：使用しない比較線（点線/, { exact: false })).toBeVisible();
      await page.keyboard.press('Shift+Tab'); await expect(normal).toBeFocused(); await page.keyboard.press('Enter');
      await expect(normal).toBeFocused(); await expect(normal).toHaveAttribute('aria-pressed', 'true');
      await expect(selection).toHaveAttribute('aria-pressed', 'true');
      await expect(panel).toHaveText(before!);
    }
  }
  const toggle = panel.getByText('選択対象の根拠・日付・権利', { exact: true });
  await toggle.focus(); await expect(toggle).toBeFocused();
  expect(await toggle.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeHidden();
  await closed.focus(); await page.keyboard.press('Enter');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeHidden();
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(panel.getByText('更新日：不明（版番号はv5.1.2）', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('link', { name: '地図の行間：通常航路・候補航路・代表点の教材モデル', exact: true }).last()).toBeFocused();
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
  for (const name of ['通行不可（仮定）', '通常時']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(panel.getByText(`[説明・推論（モデル上の説明）] 未収録：${payload}ゼロや無影響を意味しません。`, { exact: true })).toHaveCount(6);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-injected');
  }
});
