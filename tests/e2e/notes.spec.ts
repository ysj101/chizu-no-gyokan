import { test, expect } from './panels';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const key = 'chizu-no-gyokan.notes.v1';
const notes = (page: Page) => page.getByRole('region', { name: '発見メモ', exact: true });
const items = (page: Page) => notes(page).getByRole('listitem');
const input = (page: Page) => page.getByRole('textbox', { name: 'この発見にひとこと添える', exact: true });
// The input lives in a drawer beside the selected place; open it when it is closed.
async function openDrawer(page: Page) { if (await input(page).isHidden()) await page.getByRole('button', { name: /^この発見をメモする/ }).click(); }
const saveButton = (page: Page) => page.getByRole('button', { name: 'メモを保存', exact: true });
async function ready(page: Page) {
  await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます');
}
async function save(page: Page, body: string) {
  await openDrawer(page); await input(page).fill(body); await saveButton(page).click();
  await expect(page.locator('#note-save-status')).toHaveText('メモを保存しました。');
  await expect(input(page)).toHaveValue('');
}
async function screenshot(page: Page, project: string, state: string) {
  await mkdir('artifacts/map-exploration', { recursive: true });
  await notes(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/map-exploration/notes-${project}-${state}.png`, fullPage: true });
}
async function stored(page: Page) {
  return page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!), key);
}

test('snapshots keep scenario, all layers, selection and viewport through changes, deletion and reload without sending notes', async ({ page }, info) => {
  const requests: { url: string; body: string | null; method: string }[] = [];
  page.on('request', request => requests.push({ url: request.url(), body: request.postData(), method: request.method() }));
  await ready(page);
  await expect(page.locator('#notes-empty')).toBeVisible();
  await expect(notes(page)).toContainText('このブラウザ内だけに保存。別端末へ自動同期されず、アカウント不要、外部へ送信しない。');
  await screenshot(page, info.project.name, 'empty');
  await save(page, '通信に含めない固有の気づき CG04一');
  const first = (await stored(page)).notes[0];
  expect(first.mapState).toMatchObject({ scenarioId: 'normal', layers: { borders: true, routes: true, points: true }, selectedFeatureId: 'malacca' });
  expect(first.mapState.viewport).toEqual({ longitude: expect.any(Number), latitude: expect.any(Number), zoom: expect.any(Number) });
  await expect(items(page).first()).toContainText('保存時の条件：通常時');
  await expect(items(page).first()).toContainText('国境：表示中 / 主要航路：表示中 / 注目地点：表示中');
  await expect(items(page).first()).toContainText('選択地点：マラッカ海峡');
  await expect(items(page).first().locator('time')).toHaveAttribute('datetime', first.createdAt);
  await expect(items(page).first().locator('time')).toContainText('JST');
  const firstDisplay = await items(page).first().textContent();
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await page.locator('#layer-routes').click(); await page.locator('#layer-points').click();
  await page.getByRole('button', { name: 'ロンボク海峡を選択', exact: true }).click();
  const map = page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
  await map.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('+');
  await expect(items(page).first()).toHaveText(firstDisplay!);
  await save(page, '通信に含めない固有の気づき CG04二');
  const second = (await stored(page)).notes[1];
  expect(second.mapState).toMatchObject({ scenarioId: 'malacca-closed-assumption', layers: { borders: true, routes: false, points: false }, selectedFeatureId: 'lombok' });
  expect(second.mapState.viewport).not.toEqual(first.mapState.viewport);
  await expect(items(page).first()).toContainText('CG04二');
  await expect(items(page).first()).toContainText('保存時の条件：通行不可（仮定）');
  await expect(items(page).first()).toContainText('国境：表示中 / 主要航路：非表示 / 注目地点：非表示');
  await expect(items(page).first()).toContainText('選択地点：ロンボク海峡');
  const snapshot = await stored(page);
  await screenshot(page, info.project.name, 'multiple');
  await page.reload(); await expect(items(page)).toHaveCount(2); expect(await stored(page)).toEqual(snapshot);
  // Loading notes only displays the saved conditions; the current map starts with its existing defaults.
  await expect(page.locator('#scenario-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#layer-routes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  // CG-06 adds only these restoration actions; keep excluding any other restoration UI.
  await expect(notes(page).getByRole('button', { name: /このメモの地図状態に戻す$/ })).toHaveCount(2);
  await expect(notes(page).getByRole('button', { name: /復元|戻す/ })).toHaveCount(2);
  const deleteSecond = notes(page).getByRole('button', { name: /CG04二.*のメモを削除/ });
  await deleteSecond.click();
  await expect(page.locator('#notes-status')).toHaveText('メモを削除しました。');
  await expect(notes(page).getByRole('button', { name: /CG04一.*のメモを削除/ })).toBeFocused();
  await page.reload(); await expect(items(page)).toHaveCount(1);
  expect((await stored(page)).notes).toEqual([first]);
  await expect(items(page).first()).toContainText('CG04一');
  // The drawer is closed after the reload, so focus falls back to its opener.
  await notes(page).getByRole('button', { name: /のメモを削除/ }).click(); await expect(page.getByRole('button', { name: /^この発見をメモする/ })).toBeFocused();
  await page.reload(); await expect(items(page)).toHaveCount(0); await expect(page.locator('#notes-empty')).toBeVisible();
  const origin = new URL(page.url()).origin;
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(origin); expect(request.method).toBe('GET');
    expect(url.pathname).toMatch(/^\/(?:assets\/[^/]+\.(?:js|css|png)|data\/countries\.json|favicon\.ico)?$/);
    expect(url.search).toBe(''); expect(request.body).toBeNull();
    expect(request.url + (request.body ?? '')).not.toMatch(/CG04|通信に含めない|scenarioId|selectedFeatureId/);
  }
});

test('whitespace and write failures leave text in place, with no successful entry; failed deletion keeps its entry', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chizu-no-gyokan.notes.v1' && sessionStorage.getItem('notes-fail') !== 'off') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await ready(page);
  await openDrawer(page); await input(page).fill('　 \n'); await saveButton(page).click();
  await expect(page.locator('#note-save-status')).toContainText('空白だけ'); await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
  await input(page).fill('失敗しても残す本文'); await saveButton(page).click();
  await expect(page.locator('#note-save-status')).toContainText('保存できませんでした');
  await expect(input(page)).toHaveValue('失敗しても残す本文'); await expect(items(page)).toHaveCount(0);
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBeNull();
  await screenshot(page, info.project.name, 'save-failure');
  await page.evaluate(() => sessionStorage.setItem('notes-fail', 'off'));
  await saveButton(page).click(); await expect(items(page)).toHaveCount(1);
  await page.evaluate(() => sessionStorage.removeItem('notes-fail'));
  const remove = notes(page).getByRole('button', { name: /のメモを削除/ }); await remove.click();
  await expect(page.locator('#notes-status')).toContainText('削除できませんでした'); await expect(remove).toBeFocused();
  await page.reload(); await expect(items(page)).toHaveCount(1);
});

test('HTML remains literal text after save and reload; keyboard flow and reduced motion keep focus', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let dialogs = 0; page.on('dialog', dialog => { dialogs++; void dialog.dismiss(); });
  await ready(page);
  const html = '<img src=x onerror="window.notesExecuted=true;alert(1)"><script>window.notesExecuted=true</script>';
  await openDrawer(page); await input(page).focus(); await page.keyboard.insertText(html);
  await page.keyboard.press('Tab'); await expect(saveButton(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(input(page)).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(items(page).first().locator('.note-body')).toHaveText(html);
  await expect(page.locator('#note-save-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#note-save-status')).toHaveText('メモを保存しました。');
  await screenshot(page, info.project.name, 'html');
  await page.reload(); await expect(items(page).first().locator('.note-body')).toHaveText(html);
  await expect(notes(page).locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => 'notesExecuted' in window)).toBe(false); expect(dialogs).toBe(0);
  // From the drawer: save, close, then the list's restore and delete actions.
  await openDrawer(page); await input(page).focus(); await page.keyboard.press('Tab'); await expect(saveButton(page)).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'メモ欄を閉じる', exact: true })).toBeFocused();
  await notes(page).getByRole('button', { name: /このメモの地図状態に戻す$/ }).focus(); await page.keyboard.press('Tab');
  const remove = notes(page).getByRole('button', { name: /のメモを削除/ }); await expect(remove).toBeFocused();
  expect(await remove.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await screenshot(page, info.project.name, 'keyboard');
  await page.keyboard.press('Space'); await expect(input(page)).toBeFocused();
  await expect(page.locator('#notes-status')).toHaveText('メモを削除しました。');
  await expect(page.locator('#notes-empty')).toBeVisible();
  await page.reload(); await expect(items(page)).toHaveCount(0);
});

test('invalid records are counted, complete null selection is explicit, and denied storage is reported', async ({ page }) => {
  await page.addInitScript(storageKey => {
    if (localStorage.getItem(storageKey)) return;
    const mapState = { scenarioId: 'normal', layers: { borders: false, routes: false, points: false }, selectedFeatureId: null, viewport: { longitude: 106, latitude: 2, zoom: 4 } };
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, notes: [
      { id: 'valid', body: '選択なしの記録', createdAt: '2026-11-09T00:00:00.000Z', mapState },
      { id: 'missing', body: '状態の欠落', createdAt: '2026-11-09T00:00:00.000Z', mapState: { ...mapState, selectedFeatureId: undefined } },
      { broken: true },
    ] }));
  }, key);
  await ready(page); await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('選択地点：選択なし');
  await expect(page.locator('#notes-warning')).toHaveText('読み込めない記録が2件あります。');
  await save(page, '正常な追加'); await page.reload(); await expect(items(page)).toHaveCount(2);
  await expect(page.locator('#notes-warning')).toHaveText('読み込めない記録が2件あります。');
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }); });
  await page.reload(); await expect(page.locator('#notes-warning')).toContainText('読み込めませんでした');
  await openDrawer(page); await input(page).fill('保存領域が使えなくても残す'); await saveButton(page).click();
  await expect(page.locator('#note-save-status')).toContainText('保存できませんでした');
  await expect(input(page)).toHaveValue('保存領域が使えなくても残す'); await expect(items(page)).toHaveCount(0);
});

test('both scenarios and every layer combination save complete state through the actual controls', async ({ page }) => {
  test.setTimeout(60_000);
  await ready(page);
  const expected: { scenarioId: string; layers: { borders: boolean; routes: boolean; points: boolean }; selectedFeatureId: string }[] = [];
  for (const scenarioId of ['normal', 'malacca-closed-assumption']) {
    await page.locator(scenarioId === 'normal' ? '#scenario-normal' : '#scenario-closed').click();
    for (let bits = 0; bits < 8; bits++) {
      const layers = { borders: Boolean(bits & 4), routes: Boolean(bits & 2), points: Boolean(bits & 1) };
      for (const id of ['borders', 'routes', 'points'] as const) {
        const button = page.locator(`#layer-${id}`);
        if ((await button.getAttribute('aria-pressed') === 'true') !== layers[id]) await button.click();
      }
      const selectedFeatureId = scenarioId === 'normal' ? (bits % 2 ? 'normal-route' : 'singapore') : (bits % 2 ? 'sunda-route' : 'lombok');
      await page.locator(`#feature-list [data-feature-id="${selectedFeatureId}"]`).click();
      await save(page, `条件比較 ${scenarioId} ${bits}`);
      expected.push({ scenarioId, layers, selectedFeatureId });
    }
  }
  const before = await stored(page);
  expect(before.notes.map((note: { mapState: unknown }) => note.mapState)).toEqual(expected.map(state => ({ ...state, viewport: before.notes[0].mapState.viewport })));
  await page.reload(); await expect(items(page)).toHaveCount(expected.length);
  expect(await stored(page)).toEqual(before);
  for (const [index, state] of [...expected].reverse().entries()) {
    const item = items(page).nth(index);
    await expect(item).toContainText(`保存時の条件：${state.scenarioId === 'normal' ? '通常時' : '通行不可（仮定）'}`);
    for (const [id, name] of [['borders', '国境'], ['routes', '主要航路'], ['points', '注目地点']] as const) {
      await expect(item).toContainText(`${name}：${state.layers[id] ? '表示中' : '非表示'}`);
    }
    const name = { 'normal-route': '通常主要航路', singapore: 'シンガポール', 'sunda-route': 'スンダ経由候補', lombok: 'ロンボク海峡' }[state.selectedFeatureId];
    await expect(item).toContainText(`選択地点：${name}`);
  }
});
