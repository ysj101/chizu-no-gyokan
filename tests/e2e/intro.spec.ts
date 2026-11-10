import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const intro = (page: Page) => page.locator('#intro');
const tryClosed = (page: Page) => page.getByRole('button', { name: '通行不可にして変化を見る', exact: true });
const reopen = (page: Page) => page.getByRole('button', { name: 'はじめ方を見る', exact: true });
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }

test('first visit offers a question and one action; it switches the scenario, then steps aside', async ({ page }, info) => {
  let documents = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documents++; });
  await ready(page);
  await expect(page.getByRole('heading', { name: 'もしマラッカ海峡を通れなくなったら？', exact: true })).toBeInViewport();
  await expect(tryClosed(page)).toBeInViewport();
  await expect(page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true })).toBeInViewport();
  await expect(reopen(page)).toBeHidden();
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/intro-${info.project.name}-initial.png`, fullPage: false });
  await tryClosed(page).click();
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scenario-closed')).toBeFocused();
  await expect(page.locator('path.route-candidate')).toHaveCount(2);
  await expect(page.locator('#scenario-summary')).toContainText('通常時との差分');
  await expect(intro(page)).toBeHidden(); await expect(reopen(page)).toBeVisible();
  await page.screenshot({ path: `artifacts/map-exploration/intro-${info.project.name}-after.png`, fullPage: false });
  // Free exploration continues: back to normal, select, and the guide does not return by itself.
  await page.getByRole('button', { name: '通常時', exact: true }).click();
  await expect(page.locator('path.route-candidate')).toHaveCount(0);
  await expect(intro(page)).toBeHidden();
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  await reopen(page).click();
  await expect(intro(page)).toBeVisible(); await expect(tryClosed(page)).toBeFocused();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(intro(page)).toBeHidden(); await expect(reopen(page)).toBeFocused();
  expect(documents).toBe(1);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('the guide can be skipped: the scenario buttons hide it too, and keyboard reaches the action first', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(intro(page)).toBeHidden(); await expect(reopen(page)).toBeVisible();
  await page.reload(); await expect(page.locator('#load-status')).toContainText('探索できます');
  await expect(intro(page)).toBeVisible();
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    if (await tryClosed(page).evaluate(el => el === document.activeElement)) break;
  }
  await expect(tryClosed(page)).toBeFocused();
  expect(await tryClosed(page).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#scenario-closed')).toBeFocused();
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.callout-sunda .feature-symbol')).toHaveText('＋◇');
});
