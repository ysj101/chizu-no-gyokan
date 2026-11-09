import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const related = (page: Page, name: string) => page.locator('#selected-related').getByRole('button', { name, exact: true });
const status = (page: Page) => page.locator('#related-status');
const map = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });

test('related places select the next target without the list; hidden-condition targets explain instead of switching', async ({ page }, info) => {
  let documents = 0; let data = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
    if (new URL(request.url()).pathname.endsWith('/data/countries.json')) data++;
  });
  await ready(page);
  // Each related entry names the place and gives a one-line reason.
  await expect(page.locator('#selected-related li')).toHaveCount(5);
  await expect(page.locator('#selected-related li').first().locator('.reason')).toHaveText('通常時にこの海峡を通る航路');
  // In the normal condition the candidate straits are listed but not selectable; the condition stays.
  await expect(related(page, 'スンダ海峡')).toHaveClass(/unavailable/);
  await expect(page.locator('#selected-related li', { hasText: 'スンダ海峡' }).locator('.reason')).toContainText('（通行不可（仮定）で表示）');
  await related(page, 'スンダ海峡').click();
  await expect(status(page)).toHaveText('スンダ海峡は「通行不可（仮定）」で表示されます。条件を切り替えると選べます。');
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/related-${info.project.name}-unavailable.png`, fullPage: false });
  // Switch, then walk Malacca → Sunda strait → Sunda candidate → Malacca through related links only.
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(related(page, 'スンダ海峡')).not.toHaveClass(/unavailable/);
  await related(page, 'スンダ海峡').click();
  await expect(status(page)).toBeEmpty();
  await expect(page.locator('#selected-name')).toHaveText('スンダ海峡');
  await expect(page.getByRole('button', { name: '地図上のスンダ海峡を選択', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#feature-list [data-feature-id="sunda"]')).toHaveAttribute('aria-pressed', 'true');
  if (info.project.name === 'mobile') await expect(page.locator('#selection')).toBeInViewport();
  await related(page, 'スンダ経由候補').click();
  await expect(page.locator('#selected-name')).toHaveText('スンダ経由候補');
  await expect(page.locator('#selected-related li .reason').first()).toHaveText('経由する海峡');
  await related(page, 'マラッカ海峡').click();
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `artifacts/map-exploration/related-${info.project.name}-chain.png`, fullPage: false });
  expect(documents).toBe(1); expect(data).toBe(1);
});

test('keyboard: Tab reaches related places, focus previews the target on the map, Enter selects it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const button = related(page, 'シンガポール');
  await button.focus();
  await expect(page.locator('#map [data-related-preview]')).toHaveCount(1);
  await expect(page.locator('.callout-singapore .feature-symbol')).toBeVisible();
  expect(await page.locator('.callout-singapore .feature-symbol').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('dashed');
  await page.keyboard.press('Enter');
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  await expect(page.locator('#map [data-related-preview]')).toHaveCount(0);
  // Unavailable targets are focusable and announce where they are shown, but do not preview anything.
  await page.getByRole('button', { name: 'マラッカ海峡を選択', exact: true }).click();
  await related(page, 'ロンボク海峡').focus();
  await expect(page.locator('#map [data-related-preview]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('ロンボク海峡は「通行不可（仮定）」で表示されます');
});

test('a related target off screen is panned into view; a target on a hidden layer is selected and explained', async ({ page }) => {
  await ready(page);
  const inView = async (selector: string) => {
    const box = await page.locator(selector).boundingBox(); const region = await map(page).boundingBox();
    if (!box || !region) return false;
    return box.x >= region.x && box.y >= region.y && box.x + box.width <= region.x + region.width && box.y + box.height <= region.y + region.height;
  };
  const pane = () => page.locator('.leaflet-map-pane').evaluate(el => el.style.transform);
  // Zoom in, then pan west until Singapore has left the view while Malacca is still selected.
  await map(page).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('+');
  for (let i = 0; i < 30 && await inView('.callout-singapore .map-feature'); i++) await page.keyboard.press('ArrowLeft');
  expect(await inView('.callout-singapore .map-feature')).toBe(false);
  const before = await pane();
  await related(page, 'シンガポール').click();
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  expect(await inView('.callout-singapore .map-feature')).toBe(true);
  expect(await pane()).not.toBe(before);
  // A target already in view (the route crosses the viewport) does not move the map.
  const still = await pane();
  await related(page, '通常主要航路').click();
  await expect(page.locator('#selected-name')).toHaveText('通常主要航路');
  expect(await pane()).toBe(still);
  // Routes layer hidden: the related route is still selectable and the hidden-layer note appears.
  await related(page, 'シンガポール').click();
  await page.locator('#layer-routes').click();
  await related(page, '通常主要航路').click();
  await expect(page.locator('#selected-name')).toHaveText('通常主要航路');
  await expect(page.locator('#selected-visibility')).toHaveText('この対象は現在地図上で非表示（主要航路レイヤーが非表示）');
  expect(await pane()).toBe(still);
});
