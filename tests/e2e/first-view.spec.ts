import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// GP-01: the first view is the map, one question and one action. Explanations, settings and sources are
// folded away but reachable. These run on the page as it loads, without the opened-panels fixture.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const map = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
const menuButton = (page: Page) => page.getByRole('button', { name: 'メニュー', exact: true });
const menu = (page: Page) => page.getByRole('complementary', { name: '設定と資料', exact: true });
const card = (page: Page) => page.locator('#card-toggle');

test('first view: the map leads, one action stands out, and long text is folded away', async ({ page }, info) => {
  await ready(page);
  const mobile = info.project.name === 'mobile';
  const viewport = page.viewportSize()!;
  const box = (await map(page).boundingBox())!;
  // The map is the largest thing on screen and fits without scrolling.
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.width * box.height).toBeGreaterThan(viewport.width * viewport.height * (mobile ? 0.4 : 0.8));
  if (!mobile) expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  // One question and exactly one primary action, both on screen.
  await expect(page.getByRole('heading', { name: 'もしマラッカ海峡を通れなくなったら？', exact: true })).toBeInViewport();
  await expect(page.locator('button.primary:visible')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '通行不可にして変化を見る', exact: true })).toBeInViewport();
  // Folded: the explanation, the menu and the normal-condition summary; no paragraph of prose is showing
  // except the one-line reminder of what is assumed and what is a model.
  await expect(menu(page)).toBeHidden(); await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#card-body')).toBeHidden(); await expect(card(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(card(page)).toHaveText('マラッカ海峡：なぜ重要？');
  for (const id of ['selected-description', 'feature-list', 'guide', 'sources', 'notes', 'perspective-view']) await expect(page.locator(`#${id}`)).toBeHidden();
  expect(await page.locator('#scenario-summary').evaluate(el => el.classList.contains('sr-only'))).toBe(true);
  expect(await page.locator('main p:visible:not(.sr-only)').evaluateAll(items => items.map(item => item.className))).toEqual(mobile ? ['map-hint', 'assumption note'] : ['assumption note']);
  await expect(page.locator('#map-condition')).toHaveText('現在の条件：通常時');
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/first-view-${info.project.name}.png`, fullPage: false });
});

test('the explanation opens on demand or with a selection, and closes without losing the selection', async ({ page }) => {
  await ready(page);
  await card(page).click();
  await expect(card(page)).toHaveAttribute('aria-expanded', 'true'); await expect(card(page)).toBeFocused();
  await expect(page.getByRole('heading', { name: 'マラッカ海峡', exact: true })).toBeVisible();
  // Long text stays folded inside the opened card.
  await expect(page.locator('#detail-fields')).toBeHidden(); await expect(page.locator('#detail-evidence')).toBeHidden();
  await card(page).click();
  await expect(page.locator('#card-body')).toBeHidden();
  // Selecting on the map opens it with the new target; the map keeps its condition.
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  await expect(card(page)).toHaveAttribute('aria-expanded', 'true'); await expect(card(page)).toHaveText('シンガポール：なぜ重要？');
  await expect(page.getByRole('heading', { name: 'シンガポール', exact: true })).toBeInViewport();
  await card(page).click();
  await expect(page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Changing the condition does not force the explanation open.
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(page.locator('#card-body')).toBeHidden();
  await expect(page.locator('#scenario-summary')).toBeVisible(); await expect(page.locator('#scenario-summary')).toContainText('何が変わった？');
});

test('the menu holds settings, the list, sources and notes; keyboard opens and closes it and the region stays in view', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await menuButton(page).focus(); await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible(); await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: '設定と資料', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: '設定と資料', exact: true })).toBeInViewport();
  for (const name of ['国ごとの視点（教材の例）', '表示レイヤー']) await expect(page.getByRole('group', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '探索する対象', exact: true }).getByRole('button')).toHaveCount(8);
  // Sources, the reading guide and the rights notice are one step away.
  await page.locator('#sources summary').click();
  await expect(page.locator('#source-list a[href="https://www.naturalearthdata.com/about/terms-of-use/"]')).toBeVisible();
  await page.locator('#guide summary').click();
  await expect(page.getByText('破線は著者作成の概略モデルです。', { exact: true })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: '第三者ソフトウェアの権利表示', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '発見メモ', exact: true })).toHaveCount(1);
  // The map narrows beside the menu on wide screens; the untouched region is fitted again, not cut off.
  const mapBox = (await map(page).boundingBox())!;
  for (const name of ['地図上のマラッカ海峡を選択', '地図上のロンボク海峡を選択', '地図上のスンダ海峡を選択']) {
    const target = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(target.x).toBeGreaterThanOrEqual(mapBox.x); expect(target.x + target.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
    expect(target.y).toBeGreaterThanOrEqual(mapBox.y); expect(target.y + target.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/map-exploration/menu-open-${info.project.name}.png`, fullPage: false });
  // Choosing from the list opens the explanation; Escape closes the menu and returns focus to its button.
  await page.getByRole('button', { name: 'ペナン島を選択', exact: true }).click();
  await expect(card(page)).toHaveText('ペナン島：なぜ重要？'); await expect(card(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden(); await expect(menuButton(page)).toBeFocused(); await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
  await menuButton(page).click();
  await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await expect(menu(page)).toBeHidden(); await expect(menuButton(page)).toBeFocused();
  // Nothing was stored and the condition chosen before opening the menu is still in effect.
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
