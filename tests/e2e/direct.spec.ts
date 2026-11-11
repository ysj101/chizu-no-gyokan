import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// GP-02: the experiment runs on the map itself. Normal → assumption → choose a candidate → restore,
// without the scenario buttons, the menu or the explanation text.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const strait = (page: Page) => page.locator('#strait-action');
const ship = (page: Page) => page.locator('#map .ship');
const chosen = (page: Page) => page.locator('#map [data-candidate-chosen]');
const dimmed = (page: Page) => page.locator('#map [data-candidate-dimmed]');
const tryButton = (page: Page, name: string) => page.getByRole('button', { name: `${name}経由を試す`, exact: true });

test('on the map alone: close the strait, try each candidate, restore', async ({ page }, info) => {
  let documents = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documents++; });
  await ready(page);
  const mobile = info.project.name === 'mobile';
  // Normal: the ship is a labelled model, the strait offers the experiment, no candidates yet.
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船（教材モデル）'); await expect(ship(page)).toBeInViewport();
  await expect(page.getByRole('button', { name: '通れなくしてみる：マラッカ海峡（仮定）', exact: true })).toBeInViewport();
  await expect(strait(page)).toHaveText('通れなくしてみる');
  await expect(page.getByRole('group', { name: '候補を試す', exact: true })).toBeHidden();
  const box = (await strait(page).boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(36);
  await strait(page).click();
  // Assumption: stated on the map, the normal line is the unused comparison, the ship cannot go on.
  await expect(page.locator('#map-condition')).toHaveText('現在の条件：通行不可（仮定）');
  await expect(page.locator('#scenario-closed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.callout-malacca .feature-name')).toHaveText('マラッカ海峡（通行不可）');
  await expect(page.locator('path.route-unavailable')).toHaveCount(1); await expect(page.locator('path.route-candidate')).toHaveCount(2);
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船：この先へ進めない（仮定）');
  await expect(strait(page)).toHaveText('元に戻す'); await expect(strait(page)).toBeFocused();
  await expect(page.locator('#intro')).toBeHidden();
  await expect(chosen(page)).toHaveCount(0); await expect(dimmed(page)).toHaveCount(0);
  // Choosing a candidate on the map: its line, tag and strait are emphasised, the other recedes.
  await page.getByRole('button', { name: '地図上のスンダ海峡を選択', exact: true }).click();
  await expect(chosen(page)).toHaveCount(3); await expect(dimmed(page)).toHaveCount(3);
  await expect(page.locator('path.sunda-route')).toHaveAttribute('data-candidate-chosen', '');
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-dimmed', '');
  // Not colour alone: the chosen line is heavier and the other is fainter (once the brief change mark has gone).
  await expect(page.locator('#map [data-just-changed]')).toHaveCount(0, { timeout: 5000 });
  expect(await page.locator('path.sunda-route').evaluate(el => parseFloat(getComputedStyle(el).strokeWidth))).toBeGreaterThan(await page.locator('path.lombok-route').evaluate(el => parseFloat(getComputedStyle(el).strokeWidth)));
  expect(await page.locator('path.lombok-route').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await expect(tryButton(page, 'スンダ')).toHaveAttribute('aria-pressed', 'true'); await expect(tryButton(page, 'ロンボク')).toHaveAttribute('aria-pressed', 'false');
  // The ship is not said to have been rerouted, and the model's limits are stated with the choice.
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船：スンダ経由を検討中（教材モデル）');
  await expect(page.locator('#scenario-summary')).toContainText('スンダ経由候補を強調しています。');
  await expect(page.locator('#card-toggle')).toHaveText('スンダ海峡（候補）：なぜ重要？');
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/direct-${info.project.name}-sunda.png`, fullPage: false });
  // Try the other one, on the map again (its strait this time).
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '地図上のロンボク海峡を選択', exact: true }).click();
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-chosen', '');
  await expect(page.locator('path.sunda-route')).toHaveAttribute('data-candidate-dimmed', '');
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船：ロンボク経由を検討中（教材モデル）');
  // Looking at another place keeps the comparison.
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-chosen', '');
  // Restore on the strait: candidates leave, nothing stays emphasised, the experiment can start again.
  if (mobile) await page.evaluate(() => window.scrollTo(0, 0));
  await strait(page).click();
  await expect(page.locator('#map-condition')).toHaveText('現在の条件：通常時');
  await expect(page.locator('path.route-candidate')).toHaveCount(0); await expect(chosen(page)).toHaveCount(0); await expect(dimmed(page)).toHaveCount(0);
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船（教材モデル）'); await expect(strait(page)).toHaveText('通れなくしてみる');
  await strait(page).click();
  await expect(chosen(page)).toHaveCount(0); await expect(tryButton(page, 'ロンボク')).toHaveAttribute('aria-pressed', 'false');
  expect(documents).toBe(1);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('keyboard and the try buttons: same experiment, pressed states, release and restore', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await strait(page).focus();
  expect(await strait(page).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(strait(page)).toBeFocused(); await expect(strait(page)).toHaveText('元に戻す');
  await expect(page.getByRole('group', { name: '候補を試す', exact: true })).toBeVisible();
  await tryButton(page, 'ロンボク').focus(); await page.keyboard.press('Space');
  await expect(tryButton(page, 'ロンボク')).toHaveAttribute('aria-pressed', 'true'); await expect(tryButton(page, 'ロンボク')).toBeFocused();
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-candidate-chosen', '');
  // The try buttons do not open the explanation; reading stays optional.
  await expect(page.locator('#card-body')).toBeHidden();
  await tryButton(page, 'スンダ').focus(); await page.keyboard.press('Enter');
  await expect(tryButton(page, 'スンダ')).toHaveAttribute('aria-pressed', 'true'); await expect(tryButton(page, 'ロンボク')).toHaveAttribute('aria-pressed', 'false');
  // Pressing the chosen candidate again releases it.
  await page.keyboard.press('Enter');
  await expect(chosen(page)).toHaveCount(0); await expect(dimmed(page)).toHaveCount(0);
  await expect(page.locator('#scenario-summary')).not.toContainText('強調しています');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '通常時に戻す', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(strait(page)).toBeFocused(); await expect(strait(page)).toHaveText('通れなくしてみる');
  await expect(page.locator('path.route-candidate')).toHaveCount(0);
});

test('with the routes layer hidden the ship leaves with the lines; the choice returns with them', async ({ page }) => {
  await ready(page);
  await strait(page).click(); await tryButton(page, 'スンダ').click();
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.locator('#layer-routes').click();
  await expect(ship(page)).toHaveCount(0); await expect(page.locator('path.sunda-route')).toHaveCount(0);
  await expect(page.locator('.callout-sunda').locator('xpath=ancestor::*[contains(@class,"feature-icon")]')).toHaveAttribute('data-candidate-chosen', '');
  await page.locator('#layer-routes').click();
  await expect(page.locator('path.sunda-route')).toHaveAttribute('data-candidate-chosen', '');
  await expect(ship(page)).toHaveAttribute('aria-label', '仮想船：スンダ経由を検討中（教材モデル）');
});
