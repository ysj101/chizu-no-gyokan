import { test, expect } from './panels';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
const opener = (page: Page) => page.getByRole('button', { name: /^この発見をメモする/ });
const form = (page: Page) => page.locator('#note-form');
const input = (page: Page) => page.getByRole('textbox', { name: 'メモ本文', exact: true });
const context = (page: Page) => page.locator('#note-context');

test('a note opens beside the selected place, shows the state it will save, keeps drafts, and saves', async ({ page }, info) => {
  await ready(page);
  await expect(form(page)).toBeHidden(); await expect(opener(page)).toHaveAttribute('aria-expanded', 'false');
  // Select from the map; the opener is next to the explanation, no long scroll needed.
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  if (info.project.name === 'mobile') await expect(opener(page)).toBeInViewport();
  await opener(page).click();
  await expect(form(page)).toBeVisible(); await expect(opener(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(input(page)).toBeFocused();
  await expect(context(page)).toHaveText('保存する状態：通常時 / 国境：表示中 / 主要航路：表示中 / 注目地点：表示中 / 選択：シンガポール');
  if (info.project.name === 'mobile') await expect(input(page)).toBeInViewport();
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/note-drawer-${info.project.name}-open.png`, fullPage: false });
  // The context follows the condition, the layers and the selection while the drawer stays open.
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await page.locator('#layer-points').click();
  await page.getByRole('button', { name: 'ロンボク海峡を選択', exact: true }).click();
  await expect(context(page)).toHaveText('保存する状態：通行不可（仮定） / 国境：表示中 / 主要航路：表示中 / 注目地点：非表示 / 選択：ロンボク海峡');
  // Closing keeps the draft and says so; reopening restores it.
  await input(page).fill('ロンボクは東に大きく外れる');
  await page.getByRole('button', { name: 'メモ欄を閉じる', exact: true }).click();
  await expect(form(page)).toBeHidden(); await expect(opener(page)).toHaveText('この発見をメモする（下書きあり）'); await expect(opener(page)).toBeFocused();
  await opener(page).click();
  await expect(input(page)).toHaveValue('ロンボクは東に大きく外れる');
  await page.getByRole('button', { name: 'メモを保存', exact: true }).click();
  await expect(page.locator('#note-save-status')).toHaveText('メモを保存しました。');
  await expect(input(page)).toHaveValue(''); await expect(form(page)).toBeVisible();
  const saved = page.getByRole('region', { name: '発見メモ', exact: true }).getByRole('listitem').first();
  await expect(saved).toContainText('ロンボクは東に大きく外れる');
  await expect(saved).toContainText('保存時の条件：通行不可（仮定）'); await expect(saved).toContainText('注目地点：非表示'); await expect(saved).toContainText('選択地点：ロンボク海峡');
  await page.getByRole('button', { name: 'メモ欄を閉じる', exact: true }).click();
  await expect(opener(page)).toHaveText('この発見をメモする');
});

test('keyboard: Enter on the opener focuses the field, Tab reaches save then close, close returns focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await opener(page).focus(); await page.keyboard.press('Enter');
  await expect(input(page)).toBeFocused();
  await page.keyboard.insertText('下書き');
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'メモを保存', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'メモ欄を閉じる', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(opener(page)).toBeFocused(); await expect(opener(page)).toHaveText('この発見をメモする（下書きあり）');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
