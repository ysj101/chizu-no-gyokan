import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// GP-06: from the chain card, at most two side trips; any can be ignored, and the last one taken can be undone.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const branches = (page: Page) => page.getByRole('group', { name: '寄り道（どれでも、無視しても構いません）', exact: true }).getByRole('button');
const back = (page: Page) => page.getByRole('button', { name: '寄り道の前に戻る', exact: true });

test('side trips follow the chain, at most two at a time, and each can be undone in turn', async ({ page }, info) => {
  await ready(page);
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  await expect(branches(page)).toHaveText(['通れなくしてみる', '日本以外では？（中国から見る）']);
  await expect(back(page)).toBeHidden();
  // Trip 1: close the strait. The card stays, the trips change, and focus stays in the card.
  await branches(page).first().click();
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await expect(branches(page)).toHaveText(['スンダ海峡は？', 'ロンボク海峡は？']);
  await expect(branches(page).first()).toBeFocused(); await expect(back(page)).toBeVisible();
  // Trip 2: one candidate; then the other is offered, with the country the candidates lie in.
  await branches(page).nth(1).click();
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-chosen', '');
  await expect(branches(page)).toHaveText(['スンダ海峡は？', '候補の海峡がある国は？（インドネシアから見る）']);
  // Trip 3: a country view opens in the menu, with content.
  await branches(page).nth(1).click();
  await expect(page.getByRole('heading', { name: 'インドネシアから見たマラッカ海峡', exact: true })).toBeVisible();
  await expect(page.locator('#perspective-indonesia')).toHaveAttribute('aria-pressed', 'true');
  // Back, one trip at a time: the view, then the candidate, then the condition.
  if (info.project.name === 'mobile') await back(page).scrollIntoViewIfNeeded();
  await back(page).click();
  await expect(page.locator('#perspective-none')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-chosen', '');
  await back(page).click();
  await expect(page.locator('#map [data-candidate-chosen]')).toHaveCount(0);
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await back(page).click();
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(back(page)).toBeHidden(); await expect(branches(page).first()).toBeFocused();
  await expect(branches(page)).toHaveText(['通れなくしてみる', '日本以外では？（中国から見る）']);
});

test('the trips are optional: exploring elsewhere works as before and keeps the offer current', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  // Ignore the offer and use the map directly.
  await page.locator('#strait-action').click();
  await page.getByRole('button', { name: 'スンダ経由を試す', exact: true }).click();
  await expect(branches(page)).toHaveText(['ロンボク海峡は？', '候補の海峡がある国は？（インドネシアから見る）']);
  await expect(back(page)).toBeHidden();
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  await expect(branches(page)).toHaveCount(2);
});
