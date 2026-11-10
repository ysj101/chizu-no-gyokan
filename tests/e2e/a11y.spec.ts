import { test, expect } from './panels';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Accessibility regression checks that need no extra dependency: keyboard reachability without traps,
// visible focus, accessible names and states, live regions, text zoom and target sizes on phones.
// Colour-independent marks, the failure state and reduced motion are covered where the feature lives
// (map.spec, diff.spec, layers.spec). Human screen-reader checks are recorded in docs/qa-log.md.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
// One round-trip per step: which control has focus (id, else its name), its position among the
// page's focusable elements (two source links may share a name), and whether its focus ring is drawn.
const describeActive = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return { key: 'body', position: -1, outline: '' };
  const key = el.id || (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
  const position = [...document.querySelectorAll('a[href], button, summary, textarea, [tabindex]')].indexOf(el);
  return { key, position, outline: getComputedStyle(el).outlineStyle };
});

test('Tab visits every control once in document order, with visible focus, and never traps', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click(); // more controls on screen
  await page.getByRole('group', { name: '国ごとの視点（教材の例）', exact: true }).getByRole('button', { name: '日本', exact: true }).click();
  await page.getByRole('button', { name: /^この発見をメモする/ }).click();
  // Start from the first control so the walk covers the whole page regardless of what was clicked.
  await page.locator('.skip').focus();
  const first = await describeActive(page);
  const visited = [first.key]; const positions = new Set([first.position]);
  let current = first.key;
  do {
    await page.keyboard.press('Tab');
    const active = await describeActive(page);
    current = active.key;
    if (current === 'body') break; // wrapped around: no trap
    expect(active.outline, `focus not visible on ${current}`).toBe('solid');
    expect(positions.has(active.position), `focus revisited ${current}`).toBe(false);
    visited.push(current); positions.add(active.position);
  } while (visited.length < 200);
  expect(current, 'the walk never wrapped back to the document').toBe('body');
  // Order follows the page: condition → map → explanation and note → menu (view, layers).
  const keys = ['scenario-normal', 'map', 'note-body', 'メモを保存', 'perspective-japan', 'layer-borders'];
  expect(visited).toEqual(expect.arrayContaining(keys));
  const order = keys.map(key => visited.indexOf(key));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await mkdir('artifacts/map-exploration', { recursive: true });
  await writeFile(`artifacts/map-exploration/a11y-tab-order-${info.project.name}.txt`, visited.join('\n'));
});

test('names, states, landmarks and live regions are in place; the skip link lands on the explanation', async ({ page }) => {
  await ready(page);
  // A single read of the static attributes; the per-feature specs cover how they change.
  const inventory = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
    unnamed: [...document.querySelectorAll('button')].filter(b => !(b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/[\s☑☐]/g, '')).map(b => b.outerHTML.slice(0, 80)),
    pressed: Object.fromEntries(['scenario-normal', 'scenario-closed', 'layer-borders', 'layer-routes', 'layer-points', 'perspective-none', 'perspective-japan']
      .map(id => [id, document.getElementById(id)?.getAttribute('aria-pressed')])),
    expanded: document.getElementById('note-open')?.getAttribute('aria-expanded'),
    // A regression list to extend when a new live region is added, not a rule about which exist.
    statuses: Object.fromEntries(['load-status', 'scenario-summary', 'visible-layers', 'related-status', 'note-save-status', 'notes-status']
      .map(id => [id, document.getElementById(id)?.getAttribute('role')])),
    mains: document.querySelectorAll('main').length,
  }));
  expect(inventory.lang).toBe('ja'); expect(inventory.h1).toBe(1); expect(inventory.unnamed).toEqual([]); expect(inventory.mains).toBe(1);
  for (const value of Object.values(inventory.pressed)) expect(value).toMatch(/^(true|false)$/);
  expect(inventory.expanded).toBe('false');
  for (const value of Object.values(inventory.statuses)) expect(value).toBe('status');
  await expect(page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true })).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: '設定と資料', exact: true })).toHaveCount(1);
  await expect(page.getByRole('group', { name: '条件を選ぶ', exact: true })).toHaveCount(1);
  await expect(page.getByRole('group', { name: '表示レイヤー', exact: true })).toHaveCount(1);
  // The skip link is first in the Tab order and following it moves focus to the explanation.
  expect(await page.evaluate(() => document.querySelector('a[href], button, [tabindex]')?.className)).toBe('skip');
  await page.getByRole('link', { name: '選択した対象の説明へ', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#selection-card')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'マラッカ海峡', exact: true })).toBeInViewport();
});

test('text zoom to 200% keeps the page usable: no horizontal overflow, controls still reachable', async ({ page }) => {
  await ready(page);
  // Root font-size is a proxy for browser text zoom; device-level zoom is part of the human test.
  for (const size of ['150%', '200%']) {
    await page.addStyleTag({ content: `html { font-size: ${size} !important; }` });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: '通行不可（仮定）', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'シンガポールを選択', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'シンガポール', exact: true })).toBeVisible();
  }
});

test('phone: every visible control meets the 36px minimum and the map targets 44px', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
  await ready(page);
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  const small = await page.locator('button:visible, summary:visible').evaluateAll(els => els
    .map(el => {
      const rect = el.getBoundingClientRect();
      const minimum = el.matches('#map button[data-feature-id]') ? 44 : 36;
      return { name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20), width: rect.width, height: rect.height, minimum };
    })
    .filter(box => box.height < box.minimum || box.width < box.minimum));
  expect(small).toEqual([]);
  await expect(page.locator('#map button[data-feature-id]')).not.toHaveCount(0);
});
