import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const summary = (page: Page) => page.locator('#scenario-summary');
const changed = (page: Page) => page.locator('#map [data-just-changed]');

for (const reduced of [false, true]) {
  test(`the difference is listed and the changed features are marked briefly (reduced motion: ${reduced})`, async ({ page }, info) => {
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    // Initial render marks nothing: there is no previous condition to differ from.
    await expect(changed(page)).toHaveCount(0);
    await expect(summary(page).locator('.summary-title')).toHaveText('通常時：地図に出ているもの');
    await expect(summary(page).locator('li .tag')).toHaveText(['表示', '非表示']);
    await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
    await expect(summary(page).locator('.summary-title')).toHaveText('通常時との差分：何が変わった？');
    await expect(summary(page).locator('li .tag')).toHaveText(['仮定', '変更', '追加']);
    await expect(summary(page)).toContainText('×◇'); await expect(summary(page)).toContainText('点線'); await expect(summary(page)).toContainText('長短破線');
    await expect(summary(page)).toContainText('運航の可否は示しません');
    // Exactly the features that appear or change their mark: three paths and three strait callouts.
    await expect(changed(page)).toHaveCount(6);
    await expect(page.locator('#map path[data-just-changed]')).toHaveCount(3);
    await expect(page.locator('#map .feature-icon[data-just-changed] .feature-symbol')).toHaveText(['×◇', '＋◇', '＋◇']);
    const symbol = page.locator('.callout-malacca .feature-symbol');
    expect(await symbol.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await symbol.evaluate(el => getComputedStyle(el).animationName)).toBe(reduced ? 'none' : 'just-changed-pulse');
    await mkdir('artifacts/map-exploration', { recursive: true });
    await page.screenshot({ path: `artifacts/map-exploration/diff-${info.project.name}-${reduced ? 'reduced' : 'motion'}.png`, fullPage: false });
    await expect(changed(page)).toHaveCount(0, { timeout: 5000 });
    // Returning marks what still exists and changed back (Malacca and the normal route); candidates are gone.
    await page.getByRole('button', { name: '通常時', exact: true }).click();
    await expect(changed(page)).toHaveCount(2);
    await expect(page.locator('#map .feature-icon[data-just-changed] .feature-symbol')).toHaveText(['◇']);
    await expect(page.locator('path.route-candidate')).toHaveCount(0);
    await expect(summary(page).locator('li .tag')).toHaveText(['表示', '非表示']);
    await expect(changed(page)).toHaveCount(0, { timeout: 5000 });
    // Pressing the current condition again changes nothing and marks nothing.
    await page.getByRole('button', { name: '通常時', exact: true }).click();
    await expect(changed(page)).toHaveCount(0);
  });
}

test('with the routes layer off, only the visible marks are highlighted and the summary says why', async ({ page }) => {
  await ready(page);
  await page.locator('#layer-routes').click();
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(page.locator('#map path[data-just-changed]')).toHaveCount(0);
  await expect(page.locator('#map .feature-icon[data-just-changed]')).toHaveCount(3);
  await expect(summary(page).locator('.summary-note')).toContainText('主要航路レイヤーが非表示');
  await expect(summary(page).locator('li')).toHaveCount(3);
});
