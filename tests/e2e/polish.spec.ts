import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// GP-07: the direct-manipulation experience on small screens, without colour, without motion, and with
// state that assistive technology can read.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
// The control is the topmost element at its own centre: nothing laid over the map hides it.
const reachable = (page: Page, selector: string) => page.locator(selector).first().evaluate(el => {
  const rect = el.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return hit !== null && (hit === el || el.contains(hit));
});

test('route states differ in line pattern and words, not colour alone', async ({ page }) => {
  await ready(page);
  await page.locator('#strait-action').click();
  await page.getByRole('button', { name: 'スンダ経由を試す', exact: true }).click();
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  const dash = (selector: string) => page.locator(selector).first().evaluate(el => getComputedStyle(el).strokeDasharray);
  const patterns = await Promise.all(['path.route-unavailable', 'path.sunda-route', 'path.chain-link'].map(dash));
  expect(new Set(patterns).size).toBe(3);
  // The chosen candidate is heavier than the other, which is fainter: two cues besides colour (measured once
  // the brief change marks have gone).
  await expect(page.locator('#map [data-just-changed]')).toHaveCount(0, { timeout: 5000 });
  const width = (selector: string) => page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).strokeWidth));
  expect(await width('path.sunda-route')).toBeGreaterThan(await width('path.lombok-route'));
  // Each state is also written: symbols on the map, the legend, the ship and the condition label.
  await expect(page.locator('.callout-malacca .feature-symbol')).toHaveText('×◇');
  await expect(page.locator('.callout-sunda .feature-symbol')).toHaveText('＋◇');
  await expect(page.locator('#normal-legend')).toContainText('点線'); await expect(page.locator('#candidate-legend')).toContainText('長短破線');
  await expect(page.locator('#map .ship')).toHaveAttribute('aria-label', '仮想船：スンダ経由を検討中（教材モデル）');
  await expect(page.locator('#map-condition')).toHaveText('現在の条件：通行不可（仮定）');
});

test('reduced motion: no animation anywhere in the experiment, and every state still reads the same', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#strait-action').click();
  await page.getByRole('button', { name: 'ロンボク経由を試す', exact: true }).click();
  await page.getByRole('button', { name: '日本から見ると？', exact: true }).click();
  const animated = await page.locator('#map *, .map-card *').evaluateAll(els => els.filter(el => getComputedStyle(el).animationName !== 'none').length);
  expect(animated).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator('path.lombok-route')).toHaveAttribute('data-chain', '');
  await expect(page.locator('#chain-change')).toContainText('ロンボク海峡を経由する位置関係');
});

test('with motion, the ship marks its change of state once and briefly', async ({ page }) => {
  await ready(page);
  const shipAnimations = () => page.locator('#map .ship-label').evaluate(el => el.getAnimations().map(animation => {
    const timing = animation.effect!.getTiming(); return [timing.duration, timing.iterations];
  }));
  expect(await shipAnimations()).toEqual([]);
  await page.locator('#strait-action').click();
  expect(await shipAnimations()).toEqual([[900, 1]]);
});

test('phone: the whole experiment is reachable by touch, with nothing laid over its controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  await ready(page);
  const viewport = page.viewportSize()!;
  for (const step of ['#strait-action', '#try-sunda', '#chain-open', '#branches button', '#strait-action'] as const) {
    // Opening the chain scrolls its card just under the pinned map; the trips are used from there.
    if (step !== '#branches button') await page.evaluate(() => window.scrollTo(0, 0));
    const target = page.locator(step).first();
    await expect(target).toBeVisible();
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await reachable(page, `${step}`), `${step} is covered`).toBe(true);
    await target.tap();
  }
  // Ending where it began: normal, no candidate, nothing marked.
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map [data-candidate-chosen]')).toHaveCount(0);
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: 'artifacts/map-exploration/polish-mobile-end.png', fullPage: false });
});

test('keyboard and screen reader: state changes land in named live regions and focus never drops to the page', async ({ page }) => {
  await ready(page);
  const live = await page.evaluate(() => ['scenario-summary', 'chain-change', 'discovery-add-status', 'related-status'].map(id => document.getElementById(id)?.getAttribute('aria-live') ?? document.getElementById(id)?.getAttribute('role')));
  expect(live.every(value => value === 'polite' || value === 'status')).toBe(true);
  const steps: [string, string][] = [['#strait-action', 'strait-action'], ['#try-lombok', 'try-lombok'], ['#chain-open', 'chain-open']];
  for (const [selector, id] of steps) {
    await page.locator(selector).focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)).toBe(id);
  }
  await expect(page.locator('#map .ship')).toHaveAttribute('role', 'img');
  await expect(page.locator('#map .ship')).toHaveAttribute('aria-label', /教材モデル/);
  await expect(page.locator('#scenario-summary')).toContainText('ロンボク経由候補を強調しています');
});
