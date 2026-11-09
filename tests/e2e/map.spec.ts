import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const geography = await readFile(new URL('../../public/data/countries.json', import.meta.url), 'utf8');
const mapRegion = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
const point = (page: Page) => page.getByRole('button', { name: '地図上のマラッカ海峡を選択', exact: true });
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#load-status')).toHaveText('地図を読み込みました。通常時の地図を探索できます。');
}
// Read only rendered DOM geometry, relative to the visible map (independent of page scroll).
async function renderedBox(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const map = await mapRegion(page).boundingBox();
  if (!box || !map) throw new Error('Rendered feature or map missing');
  return { x: box.x - map.x, y: box.y - map.y, width: box.width, height: box.height };
}
async function center(page: Page) {
  const box = await renderedBox(page, point(page));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function expectRestored(page: Page, locator: Locator, before: Awaited<ReturnType<typeof renderedBox>>) {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    await expect.poll(async () => Math.abs((await renderedBox(page, locator))[key] - before[key])).toBeLessThan(2);
  }
}
// Check visible targets and names, not Leaflet's internal bounds or marker origins.
async function expectCandidateOverview(page: Page) {
  const map = await mapRegion(page).boundingBox();
  if (!map) throw new Error('Map missing');
  for (const id of ['sunda', 'lombok']) {
    for (const locator of [
      page.locator(`.callout-${id} .map-feature`),
      page.locator(`.callout-${id} .feature-name`),
      page.locator(`path.${id}-route`),
    ]) {
      await expect(locator).toBeVisible();
      const box = await renderedBox(page, locator);
      expect(box.x).toBeGreaterThanOrEqual(4);
      expect(box.y).toBeGreaterThanOrEqual(4);
      expect(box.x + box.width).toBeLessThanOrEqual(map.width - 4);
      expect(box.y + box.height).toBeLessThanOrEqual(map.height - 4);
    }
  }
}
// Coordinate dots stay at the authored geographic anchors, unlike offset callouts
// or SVG origins. Their separation measures the visible map scale.
async function anchorSeparation(page: Page) {
  const dots = page.locator('.coordinate-dot');
  const a = await renderedBox(page, dots.nth(0));
  const b = await renderedBox(page, dots.nth(1));
  return { x: b.x - a.x, y: b.y - a.y };
}
async function expectScaleDoubled(page: Page, before: { x: number; y: number }) {
  // Each projected endpoint rounds to a CSS pixel: two endpoints at the new
  // scale plus twice the old rounding give a maximum 3px per-axis error.
  for (const axis of ['x', 'y'] as const) {
    await expect.poll(async () => Math.abs((await anchorSeparation(page))[axis] - before[axis] * 2)).toBeLessThanOrEqual(3);
  }
}
async function expectMapNotScrolled(page: Page) {
  expect(await mapRegion(page).evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }))).toEqual({ x: 0, y: 0 });
}
async function screenshot(page: Page, label: string, project: string) {
  await mkdir('artifacts/map-exploration', { recursive: true });
  const filename = label.startsWith('scenario-') ? `scenario-${project}-${label.slice(9)}` : `${project}-${label}`;
  await page.screenshot({ path: `artifacts/map-exploration/${filename}.png`, fullPage: true });
}
async function activate(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap();
  else await locator.click();
}
async function drag(page: Page, mobile: boolean) {
  await mapRegion(page).scrollIntoViewIfNeeded();
  const box = await mapRegion(page).boundingBox();
  if (!box) throw new Error('Map not visible');
  const x = box.x + box.width * 0.65;
  const y = box.y + box.height * 0.60;
  if (mobile) {
    // Real browser input events, without invoking any Leaflet methods.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 7, y: y + i * 3 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 70, y + 32, { steps: 10 }); await page.mouse.up();
  }
}

test('initial atlas, sources, missing data and narrow scope', async ({ page }, info) => {
  const external: string[] = [];
  page.on('request', req => { if (new URL(req.url()).origin !== 'http://127.0.0.1:4173') external.push(req.url()); });
  await ready(page);
  await mkdir('artifacts/map-exploration', { recursive: true });
  // Capture the actual initial viewport before scrolling to sources or other assertions.
  await page.screenshot({ path: `artifacts/map-exploration/${info.project.name}-initial-viewport.png`, fullPage: false });
  await expect(mapRegion(page)).toBeInViewport();
  if (info.project.name === 'mobile') {
    await expect(page.getByRole('button', { name: 'タッチ移動を開始', exact: true })).toBeInViewport();
  }
  await expect(page.getByText('通常時', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '凡例' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'マラッカ海峡', exact: true })).toBeVisible();
  await expect(page.getByText('南シナ海', { exact: true })).toBeAttached();
  await expect(page.getByText('マレーシア', { exact: true })).toBeAttached();
  // The first view keeps only the short assumption/model notice; the long guide is collapsed.
  await expect(page.locator('.assumption')).toBeVisible();
  await expect(page.locator('.assumption')).toContainText('演習上の仮定');
  await expect(page.locator('.assumption')).toContainText('著者作成の概略モデル');
  await expect(page.locator('#map-help')).toBeHidden();
  await expect(page.locator('#guide p').first()).toBeHidden();
  await expect(page.locator('#layer-help')).toBeHidden();
  await page.getByText('この地図の読み方と注意', { exact: true }).click();
  await expect(page.getByText('未収録', { exact: true })).toBeVisible();
  await expect(page.getByText('破線は著者作成の概略モデルです。', { exact: true })).toBeVisible();
  await page.getByText('地図の操作方法', { exact: true }).click();
  await expect(page.locator('#map-help')).toBeVisible();
  await page.getByText('出典・対象時点・利用条件', { exact: true }).click();
  await expect(page.locator('#source-list')).toContainText('2026-03-03');
  await expect(page.locator('#source-list')).toContainText('public domain');
  await expect(page.locator('#source-list')).toContainText('地図の行間');
  await expect(page.locator('#source-list')).toContainText('再利用ライセンスは未設定');
  await expect(page.locator('#source-list a[href="https://www.naturalearthdata.com/about/terms-of-use/"]')).toBeVisible();
  // CG-04 adds exactly its labelled textarea and save button; keep every other scope exclusion.
  await expect(page.locator('input, textarea:not(#note-body), select, button:disabled')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'メモ本文', exact: true })).toHaveCount(1);
  await expect(page.locator('#notes textarea')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /条件切替|代替|差分|メモ|ログイン|レイヤー/ })).toHaveText(['メモを保存']);
  await expect(page.locator('#notes button')).toHaveCount(1);
  expect(external).toEqual([]);
  await screenshot(page, 'initial-and-sources', info.project.name);
});

test('drag, zoom, reset and geographic overlays follow the map', async ({ page }, info) => {
  await ready(page);
  const mobile = info.project.name === 'mobile';
  if (mobile) await page.getByRole('button', { name: 'タッチ移動を開始', exact: true }).tap();
  const before = await center(page);
  const land = page.locator('path.country-SGP');
  const landBefore = await renderedBox(page, land);
  const route = page.locator('path.normal-route');
  const routeBefore = await renderedBox(page, route);
  await drag(page, mobile);
  await expect.poll(async () => Math.abs((await center(page)).x - before.x)).toBeGreaterThan(20);
  await expect.poll(async () => (await renderedBox(page, land)).x - landBefore.x).toBeGreaterThan(20);
  await expect.poll(async () => (await renderedBox(page, route)).x - routeBefore.x).toBeGreaterThan(20);
  const after = await center(page);
  expect(after.y - before.y).toBeGreaterThan(5);
  const pannedLand = await renderedBox(page, land);
  const scaleBefore = await anchorSeparation(page);
  await activate(page.getByRole('button', { name: '地図を拡大', exact: true }), mobile);
  await expectScaleDoubled(page, scaleBefore);
  // Singapore stays inside the viewport; its small coastline allows pixel rounding.
  await expect.poll(async () => (await renderedBox(page, land)).width - pannedLand.width).toBeGreaterThan(1);
  await expect.poll(async () => Math.abs((await renderedBox(page, land)).width - pannedLand.width * 2)).toBeLessThan(3);
  // The long route is clipped at the viewport edge when zoomed.
  await expect.poll(async () => (await renderedBox(page, route)).width - routeBefore.width).toBeGreaterThan(20);
  await screenshot(page, 'drag-zoom', info.project.name);
  await page.getByRole('button', { name: '地図を縮小', exact: true }).click();
  await page.getByRole('button', { name: '対象地域に戻る', exact: true }).click();
  await expect.poll(async () => Math.abs((await center(page)).x - before.x)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await center(page)).y - before.y)).toBeLessThan(2);
  await expectRestored(page, land, landBefore);
  await expectRestored(page, route, routeBefore);
  if (mobile) {
    await page.getByRole('button', { name: 'タッチ移動を終了', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'タッチ移動を開始', exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
  await screenshot(page, 'restored', info.project.name);
  if (mobile) {
    await mapRegion(page).scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const box = await mapRegion(page).boundingBox();
    if (!box) throw new Error('Map missing');
    const cdp = await page.context().newCDPSession(page);
    const x = box.x + box.width * 0.5; const y = box.y + box.height * 0.8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y-i*12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore + 15);
    await page.getByRole('button', { name: 'シンガポールを選択', exact: true }).tap();
    await expect(page.locator('#selection')).toBeInViewport();
    await screenshot(page, 'mobile-scroll-selection', info.project.name);
  }
});

test('select features on map and list without reload or refetch', async ({ page }, info) => {
  let dataRequests = 0; let documents = 0;
  page.on('request', request => {
    if (request.url().includes('/data/countries.json')) dataRequests++;
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
  });
  await ready(page);
  const mobile = info.project.name === 'mobile';
  // Keep initial-view selection coverage, then repeat at the minimum zoom.
  for (const minimumZoom of [false, true]) {
    if (minimumZoom) {
      for (let i = 0; i < 2; i++) {
        await activate(page.getByRole('button', { name: '地図を縮小', exact: true }), mobile);
      }
    }
    // Consecutive selections must not become Leaflet's synthesized double tap.
    // Keep these actual taps adjacent, without assertions or sleeps between them.
    const anchorBefore = await renderedBox(page, page.locator('.coordinate-dot').first());
    const coastBefore = await renderedBox(page, page.locator('path.country-SGP'));
    await activate(page.getByRole('button', { name: '地図上の通常主要航路を選択', exact: true }), mobile);
    await activate(page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }), mobile);
    await expectRestored(page, page.locator('.coordinate-dot').first(), anchorBefore);
    await expectRestored(page, page.locator('path.country-SGP'), coastBefore);
    await expectMapNotScrolled(page);
    const targets = page.locator('#map button');
    const boxes = await targets.all();
    for (let i = 0; i < boxes.length; i++) {
      const a = await boxes[i]!.boundingBox();
      expect(a).not.toBeNull();
      expect(a!.width).toBeGreaterThanOrEqual(44);
      expect(a!.height).toBeGreaterThanOrEqual(44);
      for (const target of boxes.slice(i + 1)) {
        const b = await target.boundingBox();
        if (!b) throw new Error('Map target missing');
        expect(a!.x + a!.width <= b.x || b.x + b.width <= a!.x || a!.y + a!.height <= b.y || b.y + b.height <= a!.y).toBe(true);
      }
    }
    await activate(page.getByRole('button', { name: '地図上の通常主要航路を選択', exact: true }), mobile);
    await expect(page.getByRole('heading', { name: '通常主要航路', exact: true })).toBeVisible();
    await expect(page.locator('#selected-kind')).toHaveText('航路 / モデル上の説明');
    await expect(page.getByRole('button', { name: '通常主要航路を選択', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['シンガポール', 'ペナン島', 'マラッカ海峡']) {
      await activate(page.getByRole('button', { name: `地図上の${name}を選択`, exact: true }), mobile);
      await expectRestored(page, page.locator('.coordinate-dot').first(), anchorBefore);
      await expectRestored(page, page.locator('path.country-SGP'), coastBefore);
      await expectMapNotScrolled(page);
      if (mobile) await expect(page.locator('#selection')).toBeInViewport();
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: `${name}を選択`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await page.getByRole('button', { name: 'シンガポールを選択', exact: true }).click();
  await expect(page.locator('#selected-limit')).toContainText('代表点');
  expect(dataRequests).toBe(1); expect(documents).toBe(1);
  await screenshot(page, 'selection', info.project.name);
});

test('keyboard focus, pan, zoom, target selection, reset and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  // Tab from the document start to the actual map region.
  await page.keyboard.press('Control+Home');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    if (await mapRegion(page).evaluate(el => el === document.activeElement)) break;
  }
  await expect(mapRegion(page)).toBeFocused();
  expect(await mapRegion(page).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  const before = await center(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.abs((await center(page)).x - before.x)).toBeGreaterThan(20);
  const land = page.locator('path.country-SGP');
  const beforeZoom = await renderedBox(page, land);
  const route = page.locator('path.normal-route');
  const routeBeforeZoom = await renderedBox(page, route);
  const pointBeforeZoom = await renderedBox(page, point(page));
  const scaleBefore = await anchorSeparation(page);
  await page.keyboard.press('+');
  await expectScaleDoubled(page, scaleBefore);
  await expect.poll(async () => (await renderedBox(page, land)).width - beforeZoom.width).toBeGreaterThan(1);
  await expect.poll(async () => Math.abs((await renderedBox(page, land)).width - beforeZoom.width * 2)).toBeLessThan(3);
  await expect.poll(async () => (await renderedBox(page, route)).width - routeBeforeZoom.width).toBeGreaterThan(20);
  await page.keyboard.press('-');
  await expectRestored(page, land, beforeZoom);
  await expectRestored(page, route, routeBeforeZoom);
  await expectRestored(page, point(page), pointBeforeZoom);
  const target = page.getByRole('button', { name: '通常主要航路を選択', exact: true });
  await target.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#selected-name')).toHaveText('通常主要航路');
  const reset = page.getByRole('button', { name: '対象地域に戻る', exact: true });
  await reset.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => Math.abs((await center(page)).x - before.x)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await center(page)).y - before.y)).toBeLessThan(2);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await mapRegion(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await screenshot(page, 'keyboard-reduced-motion', info.project.name);
});

for (const failure of ['http', 'json', 'geometry']) {
  test(`${failure} failure and retry recover through HTTP boundary`, async ({ page }, info) => {
    let count = 0;
    await page.route('**/data/countries.json', route => {
      count++;
      if (count > 1) return route.fulfill({ status: 200, contentType: 'application/json', body: geography });
      return route.fulfill({ status: failure === 'http' ? 503 : 200, contentType: 'application/json',
        body: failure === 'json' ? '{broken' : failure === 'geometry' ? '{"type":"FeatureCollection","features":[]}' : '{}' });
    });
    await page.goto('/');
    await expect(page.locator('#load-status')).toContainText('読み込めませんでした');
    await expect(page.locator('.map-feature')).toHaveCount(0);
    await screenshot(page, `${failure}-error`, info.project.name);
    await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
    await expect(page.locator('#load-status')).toContainText('読み込めませんでした');
    await expect(page.locator('path.route-candidate')).toHaveCount(0);
    await page.getByRole('button', { name: '通常時', exact: true }).click();
    await expect(page.locator('#load-status')).toContainText('読み込めませんでした');
    await expect(page.locator('.map-feature')).toHaveCount(0);
    await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
    expect(count).toBe(1);
    await page.getByRole('button', { name: '地理データを再読み込み', exact: true }).click();
    await expect(page.locator('#load-status')).toContainText('探索できます');
    await expect(point(page)).toBeVisible(); expect(count).toBe(2);
    await expect(page.locator('path.route-candidate')).toHaveCount(2);
  // No pan or zoom since initial load: both straits and complete lines fit.
  await expectCandidateOverview(page);
    await expect(page.locator('#load-status')).toContainText('通行不可（仮定）');
    await screenshot(page, 'scenario-retry-' + failure, info.project.name);
    await expect(page.getByRole('button', { name: '地理データを再読み込み', exact: true })).toBeHidden();
  });
}

test('external strings cannot create executable HTML', async ({ page }) => {
  const raw: unknown = JSON.parse(geography);
  if (typeof raw !== 'object' || raw === null || !('features' in raw) || !Array.isArray(raw.features)) throw new Error('Bad fixture');
  const first: unknown = raw.features[0];
  if (typeof first !== 'object' || first === null || !('properties' in first) || typeof first.properties !== 'object' || first.properties === null) throw new Error('Bad fixture');
  const payload = '<img src=x onerror="document.body.dataset.injected=1">';
  Object.assign(first.properties, { name: payload });
  await page.route('**/data/countries.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(raw) }));
  await ready(page);
  await expect(page.getByText(payload, { exact: true })).toBeAttached();
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await page.getByRole('button', { name: '通常時', exact: true }).click();
  await expect(page.getByText(payload, { exact: true })).toBeAttached();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-injected');
});

test('scenario round trip synchronizes differences, selected explanations and sources without fetching or navigation', async ({ page }, info) => {
  let dataRequests = 0; let documents = 0;
  page.on('request', request => {
    if (request.url().includes('/data/countries.json')) dataRequests++;
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
  });
  await ready(page);
  const mobile = info.project.name === 'mobile';
  const normal = page.getByRole('button', { name: '通常時', exact: true });
  const closed = page.getByRole('button', { name: '通行不可（仮定）', exact: true });
  await activate(point(page), mobile);
  const anchorBefore = await renderedBox(page, page.locator('.coordinate-dot').first());
  await activate(closed, mobile);
  await expect(closed).toHaveAttribute('aria-pressed', 'true');
  await expect(normal).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#current-condition')).toHaveText('現在：通行不可（仮定）');
  await expect(page.locator('#map-condition')).toHaveText('現在：通行不可（仮定）');
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await expect(page.locator('#selected-scenario')).toContainText('この海峡を使えない');
  await expectRestored(page, page.locator('.coordinate-dot').first(), anchorBefore);
  await expect(page.locator('#scenario-summary')).toContainText('通常時との差分');
  await expect(page.locator('#normal-legend')).toContainText('使用しない比較線（点線');
  await expect(page.locator('#candidate-legend')).toContainText('長短破線');
  await expect(page.locator('path.normal-route')).toHaveAttribute('stroke-dasharray', '2 7');
  await expect(page.locator('path.route-candidate')).toHaveCount(2);
  // No pan or zoom since initial load: both straits and complete lines fit.
  await expectCandidateOverview(page);
  for (const route of await page.locator('path.route-candidate').all()) await expect(route).toHaveAttribute('stroke-dasharray', '14 5 3 5');
  await expect(page.locator('.callout-malacca .feature-symbol')).toHaveText('×◇');
  await expect(page.locator('.callout-sunda .feature-symbol')).toHaveText('＋◇');
  await expect(page.locator('.assumption')).toContainText('現実の航行規制・出来事を示しません');
  await expect(page.locator('#scenario-limits')).toContainText('輸送能力を検証していません');
  await expect(page.locator('.scenario-source')).toContainText('2026-03-03');
  await expect(page.locator('.scenario-source')).toContainText('参照日2026-11-09');
  await expect(page.locator('.scenario-source')).toContainText('public domain');
  await expect(page.locator('.scenario-source')).toContainText('再利用ライセンス未設定');
  await expect(page.locator('.scenario-source a').first()).toHaveAttribute('href', /eia.gov.*World_Oil_Transit_Chokepoints/);
  await screenshot(page, 'scenario-closed', info.project.name);
  for (const name of ['通常主要航路', 'シンガポール', 'ペナン島']) {
    await activate(page.getByRole('button', { name: `${name}を選択`, exact: true }), mobile);
    await expect(page.locator('#selected-scenario')).toContainText(name === '通常主要航路' ? '使用しません' : '位置は変わりません');
  }
  for (const id of ['sunda', 'lombok']) {
    const name = id === 'sunda' ? 'スンダ' : 'ロンボク';
    await activate(page.getByRole('button', { name: `${name}経由候補を選択`, exact: true }), mobile);
    await expect(page.locator('#selected-description')).toContainText('EIA');
    await expect(page.locator('#selected-limit')).toContainText('未収録');
    await expect(page.locator('#selected-scenario')).toContainText('＋仮定時に追加');
    await activate(page.getByRole('button', { name: `${name}海峡へ移動`, exact: true }), mobile);
    await activate(page.getByRole('button', { name: `地図上の${name}海峡を選択`, exact: true }), mobile);
    await expect(page.locator('#selected-name')).toHaveText(`${name}海峡`);
    await screenshot(page, `scenario-${id}-selected`, info.project.name);
  }
  // A candidate disappears on return; selection explicitly falls back to Malacca.
  await activate(normal, mobile);
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await expect(page.locator('#selected-scenario')).toHaveText('現在は通常時の表示です。');
  await expect(page.locator('#map-condition')).toHaveText('現在：通常時');
  await expect(page.locator('path.route-candidate')).toHaveCount(0);
  await expect(page.locator('.callout-sunda, .callout-lombok')).toHaveCount(0);
  await expect(page.locator('#candidate-legend')).toBeHidden();
  await expect(page.locator('path.normal-route')).toHaveAttribute('stroke-dasharray', '9 7');
  // Round trip with the normal route selected keeps the same selection and updates it.
  await activate(page.getByRole('button', { name: '通常主要航路を選択', exact: true }), mobile);
  await activate(closed, mobile);
  await expect(page.locator('#selected-scenario')).toContainText('使用しません');
  await activate(normal, mobile);
  await expect(page.locator('#selected-name')).toHaveText('通常主要航路');
  await expect(page.locator('#selected-scenario')).toContainText('通常時');
  await activate(page.getByRole('button', { name: '対象地域に戻る', exact: true }), mobile);
  if (mobile) await page.getByRole('button', { name: 'タッチ移動を開始', exact: true }).tap();
  const before = await center(page);
  await drag(page, mobile);
  await expect.poll(async () => Math.abs((await center(page)).x - before.x)).toBeGreaterThan(20);
  const scale = await anchorSeparation(page);
  await activate(page.getByRole('button', { name: '地図を拡大', exact: true }), mobile);
  await expectScaleDoubled(page, scale);
  await activate(page.getByRole('button', { name: 'シンガポールを選択', exact: true }), mobile);
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  // Reset after actual exploration, keeping the current condition and its extent.
  await activate(closed, mobile);
  await activate(page.getByRole('button', { name: '対象地域に戻る', exact: true }), mobile);
  await expectCandidateOverview(page);
  await expectRestored(page, page.locator('.coordinate-dot').first(), anchorBefore);
  await activate(normal, mobile);
  await expectRestored(page, page.locator('.coordinate-dot').first(), anchorBefore);
  expect(dataRequests).toBe(1); expect(documents).toBe(1);
  expect(new URL(page.url()).search).toBe(''); expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await screenshot(page, 'scenario-restored-exploration', info.project.name);
});

test('scenario keyboard round trip respects focus, pressed state and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const normal = page.getByRole('button', { name: '通常時', exact: true });
  const closed = page.getByRole('button', { name: '通行不可（仮定）', exact: true });
  // Reach the control by Tab, then keep native keyboard activation throughout.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    if (await normal.evaluate(el => document.activeElement === el)) break;
  }
  await expect(normal).toBeFocused();
  await page.keyboard.press('Tab'); await expect(closed).toBeFocused();
  await page.keyboard.press('Space');
  await expect(closed).toBeFocused(); await expect(closed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scenario-summary')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#scenario-summary')).toContainText('長短破線');
  expect(await closed.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await closed.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
  await expect(normal).toBeFocused(); await expect(normal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('path.route-candidate')).toHaveCount(0);
  await screenshot(page, 'scenario-keyboard-reduced-motion', info.project.name);
});

test('scenario chosen during loading survives the initial response', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let count = 0;
  await page.route('**/data/countries.json', async route => {
    count++; await waiting;
    await route.fulfill({ contentType: 'application/json', body: geography });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '通行不可（仮定）', exact: true }).click();
  await expect(page.locator('#load-status')).toContainText('読み込んでいます');
  await expect(page.locator('path.route-candidate')).toHaveCount(0);
  release();
  await expect(page.locator('#load-status')).toContainText('通行不可（仮定）の地図を探索できます');
  await expect(page.locator('path.route-candidate')).toHaveCount(2);
  // No pan or zoom since initial load: both straits and complete lines fit.
  await expectCandidateOverview(page);
  expect(count).toBe(1);
});
