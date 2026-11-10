import { test, expect } from './panels';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const map = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
const touch = (page: Page) => page.getByRole('button', { name: 'タッチで地図を動かす', exact: true });

test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name !== 'mobile', 'phone layout only'); });

test('phone: the map stays pinned while the explanation scrolls, and selection lands right below it', async ({ page }, info) => {
  await ready(page);
  const viewport = page.viewportSize()!;
  // Scroll far down: the map is still on screen, taking at most half the height.
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  const box = await map(page).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y).toBeLessThan(2);
  expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.5);
  expect(box!.height).toBeGreaterThanOrEqual(300);
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: 'artifacts/map-exploration/mobile-pinned-map.png', fullPage: false });
  // Selecting from the list puts the explanation directly under the pinned map, not behind it.
  await page.getByRole('button', { name: 'ペナン島を選択', exact: true }).click();
  const selection = await page.locator('#selection-card').boundingBox();
  const mapBox = await map(page).boundingBox();
  expect(selection!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height - 1);
  expect(selection!.y).toBeLessThan(mapBox!.y + mapBox!.height + 40);
  await expect(page.getByRole('heading', { name: 'ペナン島', exact: true })).toBeInViewport();
  // The map marker for the selection is visible at the same time as its explanation.
  await expect(page.getByRole('button', { name: '地図上のペナン島を選択', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'artifacts/map-exploration/mobile-selection-below-map.png', fullPage: false });
});

test('phone: the touch toggle sits on the map, keeps its label, and the hint says what a finger does', async ({ page }) => {
  await ready(page);
  await expect(touch(page)).toBeInViewport();
  const mapBox = await map(page).boundingBox(); const toggle = await touch(page).boundingBox();
  expect(toggle!.x).toBeGreaterThan(mapBox!.x); expect(toggle!.y).toBeGreaterThan(mapBox!.y);
  expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width);
  await expect(touch(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#map-hint')).toBeVisible();
  await expect(page.locator('#map-hint')).toHaveText('指でなぞるとページがスクロールします。地図を動かすには「タッチで地図を動かす」をオンにします。');
  await touch(page).tap();
  await expect(touch(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map-hint')).toHaveText('指でなぞると地図が動きます。ページをスクロールするには地図の外をなぞります。');
  await expect(touch(page)).toHaveAccessibleDescription(/地図が動きます/);
  await touch(page).tap();
  await expect(touch(page)).toHaveAttribute('aria-pressed', 'false');
});

test('phone: landscape and a very small screen keep the map usable and the controls reachable', async ({ page }) => {
  for (const size of [{ width: 740, height: 360 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await ready(page);
    const box = await map(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(Math.min(300, size.height));
    expect(box!.width).toBeLessThanOrEqual(size.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(touch(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '通行不可（仮定）', exact: true })).toBeVisible();
  }
});
