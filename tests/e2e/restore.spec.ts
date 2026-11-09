import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DiscoveryNote } from '../../src/notes';
import { mkdir } from 'node:fs/promises';

const key = 'chizu-no-gyokan.notes.v1';
const input = (page: Page) => page.getByRole('textbox', { name: 'メモ本文', exact: true });
const restore = (page: Page, body: string) => page.getByRole('button', { name: new RegExp(`^${body}（.*このメモの地図状態に戻す$`) });
const map = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
async function stored(page: Page): Promise<DiscoveryNote[]> {
  return page.evaluate(k => JSON.parse(localStorage.getItem(k)!).notes, key);
}
async function save(page: Page, body: string) {
  await input(page).fill(body); await page.getByRole('button', { name: 'メモを保存', exact: true }).click();
  await expect(page.locator('#notes-status')).toHaveText('メモを保存しました。');
}
async function shot(page: Page, project: string, state: string) {
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/restore-${project}-${state}.png`, fullPage: true });
}
// Compare rendered text, aria, actual layer attachment, line styles and selection highlight.
// Do not use Leaflet internals to inspect or drive state.
async function anchors(page: Page) {
  return page.locator('#map').evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll('.coordinate-dot')].map(dot => {
      const rect = dot.getBoundingClientRect();
      return { x: rect.x - bounds.x, y: rect.y - bounds.y };
    });
  });
}
async function presentation(page: Page) {
  return page.evaluate(() => ({
    text: ['current-condition', 'map-condition', 'visible-layers', 'scenario-summary', 'layer-help', 'selection', 'detail-panel', 'feature-list']
      .map(id => document.getElementById(id)!.textContent),
    controls: [...document.querySelectorAll('#scenario-normal, #scenario-closed, [id^=layer-][aria-pressed], [data-feature-id]')]
      .map(el => [el.id, el.getAttribute('data-feature-id'), el.getAttribute('aria-pressed')]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    legends: [...document.querySelectorAll('.legend li')].map(el => [el.textContent, (el as HTMLElement).hidden, el.className]),
    paths: [...document.querySelectorAll('#map path')].map(el => [el.getAttribute('class'), el.getAttribute('stroke'), el.getAttribute('stroke-width'), el.getAttribute('stroke-dasharray')]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    selected: [...document.querySelectorAll('#map .selected')].map(el => el.querySelector('[data-feature-id]')?.getAttribute('data-feature-id')),
  }));
}

test('restores real saved combinations after reload, then continues exploration and saves a new independent note', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: { url: string; method: string; body: string | null; document: boolean }[] = [];
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData(), document: r.isNavigationRequest() }));
  await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます');
  const expected: { body: string; ui: Awaited<ReturnType<typeof presentation>>; positions: Awaited<ReturnType<typeof anchors>> }[] = [];
  for (const scenario of ['normal', 'closed']) {
    await page.locator(`#scenario-${scenario}`).click();
    for (let bits = 0; bits < 8; bits++) {
      for (const [id, bit] of [['borders', 4], ['routes', 2], ['points', 1]] as const) {
        const button = page.locator(`#layer-${id}`);
        if ((await button.getAttribute('aria-pressed') === 'true') !== Boolean(bits & bit)) await button.click();
      }
      await page.locator(`#feature-list [data-feature-id="${scenario === 'normal' ? (bits % 2 ? 'normal-route' : 'singapore') : (bits % 2 ? 'lombok-route' : 'sunda')}"]`).click();
      await map(page).focus();
      await page.keyboard.press(bits % 2 ? '+' : '-');
      await page.keyboard.press(bits % 2 ? 'ArrowRight' : 'ArrowLeft');
      const body = `CG06探索 ${scenario} ${bits}`;
      await save(page, body); expected.push({ body, ui: await presentation(page), positions: await anchors(page) });
    }
  }
  const originals = await stored(page);
  await page.reload(); await expect(page.locator('#load-status')).toContainText('探索できます');
  // Explicitly change every category and viewport before restoring.
  await page.locator('#scenario-closed').click(); await page.locator('#layer-routes').click();
  await page.locator('#feature-list [data-feature-id="lombok"]').click();
  await map(page).focus(); await page.keyboard.press('+'); await page.keyboard.press('ArrowRight');
  await shot(page, info.project.name, 'before');
  await input(page).fill('復元で消さない下書き');
  const documents = requests.filter(r => r.document).length;
  const requestCount = requests.length;
  // Alternate scenarios and layer patterns, so a prior restoration cannot leak into the next.
  for (const index of [15, 0, 14, 1, 13, 2, 12, 3, 11, 4, 10, 5, 9, 6, 8, 7]) {
    const entry = expected[index]!;
    await restore(page, entry.body).click();
    await expect(page.locator('#notes-status')).toContainText('のメモの状態に戻しました：');
    await expect(restore(page, entry.body)).toBeFocused();
    expect(await presentation(page)).toEqual(entry.ui);
    const positions = await anchors(page);
    expect(positions).toHaveLength(entry.positions.length);
    positions.forEach((point, index) => {
      expect(Math.abs(point.x - entry.positions[index]!.x)).toBeLessThan(2);
      expect(Math.abs(point.y - entry.positions[index]!.y)).toBeLessThan(2);
    });
    await expect(input(page)).toHaveValue('復元で消さない下書き');
    if (index === 13) {
      await expect(page.locator('#selected-visibility')).toContainText('主要航路レイヤーOFF');
      await shot(page, info.project.name, 'assumption-hidden-selection');
    }
  }
  expect(requests.length).toBe(requestCount);
  // Saving immediately after restore independently checks restored viewport via the public storage boundary.
  await save(page, 'CG06復元範囲');
  const restored = (await stored(page)).at(-1)!;
  const source = originals[7]!;
  expect(restored.mapState).toMatchObject({ scenarioId: source.mapState.scenarioId, layers: source.mapState.layers, selectedFeatureId: source.mapState.selectedFeatureId });
  expect(restored.mapState.viewport.longitude).toBeCloseTo(source.mapState.viewport.longitude, 2);
  expect(restored.mapState.viewport.latitude).toBeCloseTo(source.mapState.viewport.latitude, 2);
  expect(restored.mapState.viewport.zoom).toBe(source.mapState.viewport.zoom);
  await map(page).focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('+');
  await page.locator('#scenario-closed').click(); await page.locator('#layer-points').click();
  await page.locator('#feature-list [data-feature-id="lombok"]').click();
  await page.locator('#scenario-normal').click(); await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await page.locator('#scenario-closed').click(); await page.locator('#feature-list [data-feature-id="sunda-route"]').click();
  await save(page, 'CG06続きの新規メモ');
  const after = await stored(page); expect(after.slice(0, originals.length)).toEqual(originals);
  const continued = after.at(-1)!; expect(continued.id).not.toBe(source.id);
  expect(continued.mapState.viewport).not.toEqual(source.mapState.viewport);
  const continuedUI = await presentation(page);
  await shot(page, info.project.name, 'new-note');
  expect(requests.filter(r => r.document)).toHaveLength(documents);
  await page.reload(); await expect(page.locator('#load-status')).toContainText('探索できます');
  await restore(page, continued.body).click(); expect(await presentation(page)).toEqual(continuedUI);
  expect(await stored(page)).toEqual(after);
  const origin = new URL(page.url()).origin;
  for (const r of requests) {
    const url = new URL(r.url); expect(url.origin).toBe(origin); expect(r.method).toBe('GET'); expect(r.body).toBeNull(); expect(url.search).toBe('');
    expect(url.pathname).toMatch(/^\/(?:assets\/[^/]+\.(?:js|css|png)|data\/countries\.json|favicon\.ico)?$/);
    expect(r.url).not.toMatch(/CG06|scenarioId|selectedFeatureId/);
  }
});

test('null selection clears all prior details; keyboard restore and stale invalid records preserve map and input', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(k => {
    if (localStorage.getItem(k)) return;
    const state = { scenarioId: 'normal', layers: { borders: false, routes: false, points: false }, selectedFeatureId: null, viewport: { longitude: 106, latitude: 2, zoom: 4 } };
    localStorage.setItem(k, JSON.stringify({ version: 1, notes: [
      { id: 'null', body: '選択なし再訪', createdAt: '2026-11-09T00:00:00.000Z', mapState: state },
      { id: 'broken', body: '欠けた記録', createdAt: '2026-11-09T00:00:00.000Z', mapState: { ...state, viewport: undefined } },
      { id: 'outside', body: '範囲外再訪', createdAt: '2026-11-09T00:01:00.000Z', mapState: { ...state, viewport: { longitude: 180, latitude: -80, zoom: 7 } } },
    ] }));
  }, key);
  await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます');
  await expect(page.locator('[data-action=restore]')).toHaveCount(2);
  await expect(page.locator('#notes-warning')).toContainText('読み込めない記録が1件');
  await restore(page, '範囲外再訪').click(); await expect(page.locator('#notes-status')).toContainText('制約内に調整');
  await save(page, 'CG06調整した範囲');
  const adjusted = (await stored(page)).at(-1)!.mapState.viewport;
  // Existing maxBounds expands by half the map size at minZoom=4. At
  // zoom=7, longitude 170 is inside it on desktop; 180 is outside on both
  // projects. Check the actual permitted center, with the whole view inside.
  const size = await page.locator('#map').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
  const projectedSouth = (1 - Math.asinh(Math.tan(-25 * Math.PI / 180)) / Math.PI) / 2;
  const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (projectedSouth + size.height / 2 * (1 / 4096 - 1 / 32768))))) * 180 / Math.PI;
  const east = 130 + size.width / 2 * (360 / 4096 - 360 / 32768);
  expect(adjusted.longitude).toBeCloseTo(east, 4);
  expect(adjusted.latitude).toBeCloseTo(south, 4);
  expect(adjusted.longitude).toBeLessThan(180); expect(adjusted.latitude).toBeGreaterThan(-80); expect(adjusted.zoom).toBe(7);
  await restore(page, '選択なし再訪').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#selected-name')).toHaveText('選択なし');
  await expect(page.locator('[data-feature-id][aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('#detail-fields')).toBeEmpty(); await expect(page.locator('#detail-evidence')).toBeEmpty();
  await expect(page.locator('#selected-description')).toBeEmpty(); await expect(page.locator('#map .selected')).toHaveCount(0);
  await expect(page.locator('#selected-visibility')).toBeHidden();
  await shot(page, info.project.name, 'no-selection');
  await save(page, 'CG06選択なし継続'); expect((await stored(page)).at(-1)!.mapState.selectedFeatureId).toBeNull();
  await restore(page, 'CG06選択なし継続').focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /CG06選択なし継続.*のメモを削除/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Space');
  await expect(restore(page, 'CG06選択なし継続')).toBeFocused();
  expect(await restore(page, 'CG06選択なし継続').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await shot(page, info.project.name, 'keyboard');
  await input(page).fill('失敗でも残す本文');
  const before = await presentation(page);
  const mapView = () => page.locator('#map').evaluate(el => ({
    pane: (el.querySelector('.leaflet-map-pane') as HTMLElement).style.transform,
    coast: (() => {
      const rect = el.querySelector('path.country-SGP')!.getBoundingClientRect();
      const map = el.getBoundingClientRect();
      return { x: rect.x - map.x, y: rect.y - map.y, width: rect.width, height: rect.height };
    })(),
  }));
  // Layers are all off here; inspect the unchanged background and pane too.
  const beforeView = await mapView();
  for (const mode of ['missing', 'broken', 'duplicate', 'json', 'denied']) {
    const raw = await page.evaluate(k => localStorage.getItem(k)!, key);
    if (mode === 'denied') {
      await page.evaluate(() => Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Denied', 'SecurityError'); } }));
    } else {
      await page.evaluate(({ k, mode }) => {
        const data = JSON.parse(localStorage.getItem(k)!);
        if (mode === 'missing') data.notes = data.notes.filter((n: { id: string }) => n.id !== 'null');
        if (mode === 'broken') data.notes.find((n: { id: string }) => n.id === 'null').mapState.layers = {};
        if (mode === 'duplicate') data.notes.push(data.notes.find((n: { id: string }) => n.id === 'null'));
        localStorage.setItem(k, mode === 'json' ? '{' : JSON.stringify(data));
      }, { k: key, mode });
    }
    const button = restore(page, '選択なし再訪');
    // Position the action before measuring: Playwright's click scrolls an
    // offscreen button into view. Only scrolling caused by restore is a failure.
    await button.scrollIntoViewIfNeeded();
    await button.focus();
    const beforeScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await button.click();
    await expect(page.locator('#notes-status')).toContainText('地図状態に戻せませんでした');
    expect(await presentation(page)).toEqual(before); expect(await mapView()).toEqual(beforeView); await expect(input(page)).toHaveValue('失敗でも残す本文');
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(beforeScroll);
    await shot(page, info.project.name, `failure-${mode}`);
    if (mode !== 'denied') await page.evaluate(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw });
  }
});
