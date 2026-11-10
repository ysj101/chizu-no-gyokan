import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// GP-03: after a change, the map shows what it connects to. The chain runs strait → line(s) → the arrow
// towards Japan, and a short card says what changed, what that connects to and what to try next.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const open = (page: Page) => page.getByRole('button', { name: '日本から見ると？', exact: true });
const card = (page: Page) => page.getByRole('region', { name: '日本から見ると？', exact: true });
const marked = (page: Page) => page.locator('#map [data-chain]');

test('the chain follows the experiment: normal, assumed, one candidate; the card says change, finding, next', async ({ page }, info) => {
  await ready(page);
  const mobile = info.project.name === 'mobile';
  // The question waits at the edge of the map where the arrow leaves it; nothing is marked yet.
  await expect(open(page)).toBeInViewport(); await expect(open(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(open(page)).toHaveAccessibleDescription('↗ 日本方面（地図の外）');
  await expect(card(page)).toBeHidden(); await expect(marked(page)).toHaveCount(0);
  await open(page).click();
  await expect(open(page)).toHaveAttribute('aria-expanded', 'true'); await expect(card(page)).toBeVisible();
  // Normal: strait and the normal line, then the arrow and the question.
  await expect(page.locator('path.normal-route')).toHaveAttribute('data-chain', '');
  await expect(page.locator('path.chain-link')).toHaveAttribute('data-chain', '');
  await expect(page.locator('.callout-malacca').locator('xpath=ancestor::*[contains(@class,"feature-icon")]')).toHaveAttribute('data-chain', '');
  await expect(page.locator('#chain-change')).toHaveText('モデルいま：日本方面へ向かう航路の概略モデルは、マラッカ海峡を通ります。');
  await expect(page.locator('#chain-finding')).toContainText('タンカー輸送に頼っています');
  await expect(page.locator('#chain-next')).toHaveText('次に：海峡を通れなくすると、このつながりはどう変わる？');
  await expect(page.locator('#chain-limit')).toContainText('示しません');
  // Sources are one step away and closed at first.
  await expect(page.locator('#chain-statements')).toBeHidden();
  await page.locator('#chain-more summary').click();
  await expect(page.locator('#chain-statements a[href*="countries_long/Japan"]').first()).toBeVisible();
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/chain-${info.project.name}-normal.png`, fullPage: false });
  // Assumed: the chain moves to both candidates; the card says a different strait must be considered.
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#strait-action').click();
  await expect(page.locator('#chain-change')).toContainText('別の海峡を検討する必要がある');
  await expect(page.locator('#chain-change .tag')).toHaveText('仮定');
  await expect(page.locator('path.normal-route')).not.toHaveAttribute('data-chain', '');
  for (const route of ['sunda-route', 'lombok-route']) await expect(page.locator(`path.${route}`)).toHaveAttribute('data-chain', '');
  await expect(card(page)).toBeVisible();
  // One candidate: the chain narrows to it.
  await page.getByRole('button', { name: 'スンダ経由を試す', exact: true }).click();
  await expect(page.locator('path.sunda-route')).toHaveAttribute('data-chain', '');
  await expect(page.locator('path.lombok-route')).not.toHaveAttribute('data-chain', '');
  await expect(page.locator('#chain-change')).toContainText('スンダ海峡を経由する位置関係');
  await expect(page.locator('#chain-next')).toHaveText('次に：もう一方の候補と比べる。');
  // No invented numbers or verdicts anywhere in the card's short lines.
  for (const id of ['chain-change', 'chain-finding', 'chain-next']) await expect(page.locator(`#${id}`)).not.toHaveText(/[0-9]|％|%|上がる|通航可能/);
  await page.screenshot({ path: `artifacts/map-exploration/chain-${info.project.name}-sunda.png`, fullPage: false });
  // Back to normal keeps the card and returns the chain to the normal line.
  await page.getByRole('button', { name: '通常時に戻す', exact: true }).click();
  await expect(page.locator('path.normal-route')).toHaveAttribute('data-chain', '');
  await expect(page.locator('#chain-change')).toContainText('マラッカ海峡を通ります');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('keyboard opens and closes the chain; closing returns focus to the question and clears the marks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await open(page).focus();
  expect(await open(page).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(card(page)).toBeVisible();
  expect(await page.locator('path.normal-route').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.keyboard.press('Enter');
  await expect(card(page)).toBeHidden(); await expect(marked(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await card(page).getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(card(page)).toBeHidden(); await expect(open(page)).toBeFocused(); await expect(open(page)).toHaveAttribute('aria-expanded', 'false');
});

test('the arrow and the question belong to the routes layer; the card stays and the marks return with it', async ({ page }) => {
  await ready(page);
  await open(page).click();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.locator('#layer-routes').click();
  await expect(page.locator('path.chain-link')).toHaveCount(0); await expect(open(page)).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  await page.locator('#layer-routes').click();
  await expect(page.locator('path.chain-link')).toHaveAttribute('data-chain', '');
  await expect(open(page)).toHaveAttribute('aria-expanded', 'true');
});
