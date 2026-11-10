import { test, expect } from './panels';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { perspectives } from '../../src/perspectives';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const pick = (page: Page, name: string) => page.getByRole('group', { name: '国ごとの視点（教材の例）', exact: true }).getByRole('button', { name, exact: true });
const panel = (page: Page) => page.locator('#perspective-view');
const focused = (page: Page) => page.locator('#map [data-perspective-focus]');

test('switching the country changes the panel and the map focus together; facts carry sources and periods', async ({ page }, info) => {
  let documents = 0; let data = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
    if (new URL(request.url()).pathname.endsWith('/data/countries.json')) data++;
  });
  await ready(page);
  await expect(panel(page)).toBeHidden(); await expect(focused(page)).toHaveCount(0);
  await expect(pick(page, 'なし')).toHaveAttribute('aria-pressed', 'true');
  await pick(page, '日本').click();
  await expect(pick(page, '日本')).toHaveAttribute('aria-pressed', 'true'); await expect(pick(page, 'なし')).toHaveAttribute('aria-pressed', 'false');
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: '日本から見たマラッカ海峡', exact: true })).toBeVisible();
  await expect(panel(page).locator('#perspective-statements li')).toHaveCount(perspectives.japan.statements.length);
  // Each fact names its source and the data period; readings are tagged as the author's model.
  await expect(panel(page).locator('#perspective-statements li').first().locator('.tag')).toHaveText('事実');
  await expect(panel(page).locator('#perspective-statements li').first()).toContainText('2022年のデータ');
  await expect(panel(page).locator('#perspective-statements li').first().getByRole('link', { name: 'EIA Country Analysis Brief: Japan', exact: true })).toHaveAttribute('href', /eia.gov.*countries_long\/Japan/);
  await expect(panel(page).locator('#perspective-statements li').last().locator('.tag')).toHaveText('モデル');
  await expect(panel(page).locator('.note')).toContainText('国家の意図や行動を地理だけで断定しません');
  // Focus marks: Malacca, the normal route and Singapore on the map; the list says so too.
  await expect(focused(page)).toHaveCount(3);
  await expect(page.locator('#feature-list .focus-note')).toHaveCount(3);
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/perspective-${info.project.name}-japan.png`, fullPage: false });
  // Another country: the same strait, a different meaning line and different focus.
  await pick(page, 'インドネシア').click();
  await expect(page.getByRole('heading', { name: 'インドネシアから見たマラッカ海峡', exact: true })).toBeVisible();
  await expect(panel(page).locator('#perspective-meaning')).toContainText('スンダ海峡・ロンボク海峡');
  // In the normal condition only Malacca of its focus is drawn; the candidate straits are listed as shown in the assumption.
  await expect(focused(page)).toHaveCount(1);
  await expect(panel(page).locator('#perspective-focus button.unavailable')).toHaveCount(4);
  await panel(page).locator('#perspective-focus').getByRole('button', { name: 'スンダ海峡', exact: true }).click();
  await expect(page.locator('#perspective-focus-status')).toContainText('スンダ海峡は「通行不可（仮定）」で表示されます');
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  // Combining with the condition: switching to the assumption keeps the view and marks every focus feature.
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'インドネシアから見たマラッカ海峡', exact: true })).toBeVisible();
  await expect(focused(page)).toHaveCount(5);
  await expect(panel(page).locator('#perspective-focus button.unavailable')).toHaveCount(0);
  await panel(page).locator('#perspective-focus').getByRole('button', { name: 'ロンボク海峡', exact: true }).click();
  await expect(page.locator('#selected-name')).toHaveText('ロンボク海峡');
  await page.screenshot({ path: `artifacts/map-exploration/perspective-${info.project.name}-indonesia-closed.png`, fullPage: false });
  await page.getByRole('button', { name: '通常時', exact: true }).click();
  await expect(focused(page)).toHaveCount(1);
  // Re-adding a layer recreates its map elements; the focus marks must survive that.
  await page.locator('#layer-points').click(); await page.locator('#layer-points').click();
  await expect(focused(page)).toHaveCount(1);
  await pick(page, 'なし').click();
  await expect(panel(page)).toBeHidden(); await expect(focused(page)).toHaveCount(0); await expect(page.locator('#feature-list .focus-note')).toHaveCount(0);
  expect(documents).toBe(1); expect(data).toBe(1);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('every country view renders, is keyboard operable, and the restore of a note does not change the view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await pick(page, '中国').focus(); await page.keyboard.press('Enter');
  await expect(pick(page, '中国')).toBeFocused(); await expect(pick(page, '中国')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '中国から見たマラッカ海峡', exact: true })).toBeVisible();
  // A fact without its own data period falls back to the source's update date.
  await expect(panel(page).locator('#perspective-statements li', { hasText: 'ミャンマーから' }).locator('.statement-source')).toContainText('更新 2026-03-03');
  // A saved note records condition, layers, selection and viewport, not the country view.
  await page.getByRole('button', { name: /^この発見をメモする/ }).click();
  await page.getByRole('textbox', { name: 'メモ本文', exact: true }).fill('視点は保存対象外');
  await page.getByRole('button', { name: 'メモを保存', exact: true }).click();
  await expect(page.locator('#note-save-status')).toHaveText('メモを保存しました。');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chizu-no-gyokan.notes.v1')!).notes[0].mapState);
  expect(Object.keys(saved).sort()).toEqual(['layers', 'scenarioId', 'selectedFeatureId', 'viewport']);
  await pick(page, '日本').click();
  await page.getByRole('region', { name: '発見メモ', exact: true }).getByRole('button', { name: /このメモの地図状態に戻す$/ }).click();
  await expect(page.getByRole('heading', { name: '日本から見たマラッカ海峡', exact: true })).toBeVisible();
  await expect(focused(page)).toHaveCount(3);
});
