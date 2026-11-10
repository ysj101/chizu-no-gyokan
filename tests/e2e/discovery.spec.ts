import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// GP-05: relations found through the chain are kept as lines on a small discovery map. Clicking places
// adds nothing; only "発見マップに追加" on the chain card does, once per relation.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const add = (page: Page) => page.locator('#discovery-add');
const items = (page: Page) => page.getByRole('list', { name: '見つけたつながり', exact: true }).getByRole('listitem');
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('chizu-no-gyokan.discoveries.v1') ?? 'null'));

test('relations found along the chain build up the discovery map; clicks on places add nothing', async ({ page }, info) => {
  await ready(page);
  const mobile = info.project.name === 'mobile';
  // Exploring places alone records nothing.
  for (const name of ['地図上のシンガポールを選択', '地図上のペナン島を選択']) {
    if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name, exact: true }).click();
  }
  expect(await stored(page)).toBeNull();
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  await expect(add(page)).toHaveText('発見マップに追加'); await expect(add(page)).toHaveAccessibleDescription('マラッカ海峡 → 日本');
  await add(page).click();
  await expect(add(page)).toBeDisabled(); await expect(add(page)).toHaveText('発見マップに追加済み');
  await expect(page.locator('#discovery-add-status')).toHaveText('「マラッカ海峡 → 日本」を発見マップに追加しました。メニューの「発見マップ」で見返せます。');
  // Assumed, then one candidate: each state offers its own relation.
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#strait-action').click();
  await expect(add(page)).toBeEnabled(); await expect(add(page)).toHaveAccessibleDescription('マラッカ海峡 → スンダ海峡・ロンボク海峡');
  await add(page).click();
  await page.getByRole('button', { name: 'スンダ経由を試す', exact: true }).click();
  await expect(add(page)).toHaveAccessibleDescription('スンダ海峡 → 日本'); await add(page).click();
  expect((await stored(page)).discoveries.map((entry: { id: string }) => entry.id)).toEqual(['malacca-japan', 'malacca-alternatives', 'sunda-japan']);
  // The map: three relations listed in the order found, with tags and sources, drawn as four lines.
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(page.getByRole('heading', { name: '発見マップ', exact: true })).toBeVisible();
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).locator('.discovery-title')).toHaveText(['マラッカ海峡 → 日本', 'マラッカ海峡 → スンダ海峡・ロンボク海峡', 'スンダ海峡 → 日本']);
  await expect(items(page).nth(1).locator('.tag')).toHaveText('仮定');
  await expect(items(page).first().locator('a[href*="countries_long/Japan"]')).toHaveCount(1);
  await expect(page.locator('.discovery-edge')).toHaveCount(4);
  await expect(page.locator('.discovery-node.reached')).toHaveCount(4);
  await expect(page.locator('#discovery-empty')).toBeHidden();
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.locator('#discovery-map').screenshot({ path: `artifacts/map-exploration/discovery-${info.project.name}.png` });
  // It survives a reload, and the notes are untouched.
  await page.reload(); await expect(page.locator('#load-status')).toContainText('探索できます');
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(items(page)).toHaveCount(3);
  expect(await page.evaluate(() => localStorage.getItem('chizu-no-gyokan.notes.v1'))).toBeNull();
  // Removing one keeps the others and moves focus to the next control.
  await page.getByRole('button', { name: 'スンダ海峡 → 日本を発見マップから外す', exact: true }).click();
  await expect(items(page)).toHaveCount(2); await expect(page.locator('#discovery-status')).toHaveText('スンダ海峡 → 日本を外しました。');
  await expect(page.locator('#discovery-list button').first()).toBeFocused();
  await expect(page.locator('.discovery-edge')).toHaveCount(3);
});

test('an empty map says so, and unreadable saved data is reported without being replaced', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(page.locator('#discovery-empty')).toBeVisible(); await expect(items(page)).toHaveCount(0);
  await expect(page.locator('.discovery-node.reached')).toHaveCount(0); await expect(page.locator('.discovery-node')).toHaveCount(4);
  await page.evaluate(() => localStorage.setItem('chizu-no-gyokan.discoveries.v1', '{broken'));
  await page.reload(); await expect(page.locator('#load-status')).toContainText('探索できます');
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(page.locator('#discovery-status')).toHaveText('発見マップの保存データを読み込めませんでした。');
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  await page.locator('#discovery-add').click();
  await expect(page.locator('#discovery-add-status')).toHaveText('発見マップの保存データを読み込めませんでした。');
  expect(await page.evaluate(() => localStorage.getItem('chizu-no-gyokan.discoveries.v1'))).toBe('{broken');
});
