import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import type { LayerId, LayerVisibility } from '../../src/domain';

const ids: LayerId[] = ['borders', 'routes', 'points'];
const names = { borders: '国境', routes: '主要航路', points: '注目地点' };
const combinations: LayerVisibility[] = Array.from({ length: 8 }, (_, bits) => ({
  borders: Boolean(bits & 4), routes: Boolean(bits & 2), points: Boolean(bits & 1),
}));
const scenarioButton = (page: Page, closed: boolean) => page.getByRole('button', { name: closed ? '通行不可（仮定）' : '通常時', exact: true });
const toggle = (page: Page, id: LayerId) => page.locator(`#layer-${id}`);
const map = (page: Page) => page.getByRole('region', { name: 'マラッカ海峡周辺の地図', exact: true });
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#load-status')).toContainText('探索できます');
}
async function screenshot(page: Page, project: string, state: string) {
  await mkdir('artifacts/map-exploration', { recursive: true });
  await page.screenshot({ path: `artifacts/map-exploration/layers-${project}-${state}.png`, fullPage: true });
}
const selectors = {
  borders: 'path[class^="border-country-"], .country-label',
  routes: 'path.normal-route, path.route-candidate, path.route-hit, .route-label',
  points: '.feature-callout',
};
async function drawing(page: Page, id: LayerId) {
  return page.locator(selectors[id]).evaluateAll(elements => elements.map(el => el.outerHTML));
}
async function mapPosition(page: Page) {
  const land = await page.locator('path.country-SGP').boundingBox();
  const region = await map(page).boundingBox();
  if (!land || !region) throw new Error('Map or land missing');
  return { x: land.x - region.x, y: land.y - region.y, width: land.width, height: land.height };
}
async function drag(page: Page, mobile: boolean) {
  await map(page).scrollIntoViewIfNeeded();
  const box = await map(page).boundingBox();
  if (!box) throw new Error('Map missing');
  const x = box.x + box.width * .65; const y = box.y + box.height * .6;
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 7, y: y + step * 3 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 70, y + 32, { steps: 10 }); await page.mouse.up();
  }
}
async function setVisibility(page: Page, visibility: LayerVisibility, mobile: boolean) {
  for (const id of ids) {
    if ((await toggle(page, id).getAttribute('aria-pressed') === 'true') === visibility[id]) continue;
    const position = await mapPosition(page);
    const others = ids.filter(other => other !== id);
    const before = await Promise.all(others.map(other => drawing(page, other)));
    if (mobile) await toggle(page, id).tap(); else await toggle(page, id).click();
    await expect(toggle(page, id)).toBeFocused();
    expect(await Promise.all(others.map(other => drawing(page, other)))).toEqual(before);
    expect(await mapPosition(page)).toEqual(position);
  }
}
async function assertState(page: Page, visibility: LayerVisibility, closed: boolean) {
  for (const id of ids) {
    await expect(toggle(page, id)).toHaveAttribute('aria-pressed', String(visibility[id]));
    await expect(toggle(page, id)).toHaveText(`${names[id]}：${visibility[id] ? '表示中' : '非表示'}`);
    await expect(page.locator('#visible-layers')).toContainText(`${names[id]}：${visibility[id] ? '表示中' : '非表示'}`);
  }
  await expect(page.locator('path[class^="border-country-"]')).toHaveCount(visibility.borders ? 14 : 0);
  await expect(page.locator('.country-label')).toHaveCount(visibility.borders ? 14 : 0);
  await expect(page.locator('path[class^="country-"]')).toHaveCount(14);
  await expect(page.locator('path.country-SGP')).toHaveAttribute('stroke', 'none');
  await expect(page.locator('.sea-label').first()).toBeAttached();
  await expect(page.locator('path.normal-route')).toHaveCount(visibility.routes ? 1 : 0);
  await expect(page.locator('path.route-candidate')).toHaveCount(visibility.routes && closed ? 2 : 0);
  await expect(page.locator('path.route-hit')).toHaveCount(visibility.routes ? (closed ? 3 : 1) : 0);
  await expect(page.locator('.route-label')).toHaveCount(visibility.routes ? (closed ? 3 : 1) : 0);
  await expect(page.locator('.feature-callout, .coordinate-dot, .feature-leader, .map-feature')).toHaveCount(visibility.points ? (closed ? 20 : 12) : 0);
  if (visibility.routes) await expect(page.locator('path.normal-route')).toHaveAttribute('stroke-dasharray', closed ? '2 7' : '9 7');
  for (const [id, layer] of [['border-legend', 'borders'], ['normal-legend', 'routes'], ['strait-legend', 'points'], ['place-legend', 'points']] as const) {
    await expect(page.locator(`#${id}`)).toContainText(visibility[layer] ? '表示中' : '非表示');
  }
  if (closed) await expect(page.locator('#candidate-legend')).toBeVisible();
  else await expect(page.locator('#candidate-legend')).toBeHidden();
  if (closed) {
    await expect(page.locator('#candidate-legend')).toContainText(visibility.routes ? '表示中' : '非表示');
    await expect(page.locator('#normal-legend')).toContainText('使用しない比較線（点線');
    await expect(page.locator('#scenario-summary')).toContainText('通常時との差分');
    await expect(page.locator('#point-diff')).toContainText('＋◇');
  } else await expect(page.locator('#scenario-summary')).toContainText('通常時：');
  await expect(page.locator('#current-condition')).toHaveText(`現在：${closed ? '通行不可（仮定）' : '通常時'}`);
  await expect(page.locator('#map-condition')).toHaveText(`現在：${closed ? '通行不可（仮定）' : '通常時'}`);
  await expect(page.locator('.assumption')).toContainText('現実の航行規制・出来事を示しません');
  await expect(page.locator('#scenario-limits')).toContainText('輸送能力を検証していません');
  if (ids.some(id => !visibility[id])) await expect(page.locator('#layer-help')).toContainText('陸地の塗りと海域名は残します');
  else await expect(page.locator('#layer-help')).toBeHidden();
  if (!visibility.routes) await expect(page.locator('#scenario-summary')).toContainText('主要航路レイヤーOFF');
  if (!visibility.points) await expect(page.locator('#scenario-summary')).toContainText('注目地点レイヤーOFF');
}
for (const [index, visibility] of combinations.entries()) {
  test(`independent combination ${index} round trips without navigation or fetching`, async ({ page }, info) => {
    let documents = 0; let data = 0;
    page.on('request', request => {
      if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
      if (new URL(request.url()).pathname.endsWith('/data/countries.json')) data++;
    });
    await ready(page);
    await setVisibility(page, visibility, info.project.name === 'mobile');
    for (const closed of [false, true, false]) {
      await scenarioButton(page, closed).click();
      await assertState(page, visibility, closed);
      if (closed && [0, 5, 7].includes(index)) await screenshot(page, info.project.name,
        index === 0 ? 'all-off' : index === 7 ? 'all-on' : 'routes-off-assumption');
    }
    await setVisibility(page, { borders: true, routes: true, points: true }, info.project.name === 'mobile');
    await assertState(page, { borders: true, routes: true, points: true }, false);
    expect(documents).toBe(1); expect(data).toBe(1);
    expect(new URL(page.url()).search).toBe(''); expect(new URL(page.url()).hash).toBe('');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}

test('hidden selections retain evidence and return as current candidates; exploration continues', async ({ page }, info) => {
  let documents = 0; let data = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++;
    if (new URL(request.url()).pathname.endsWith('/data/countries.json')) data++;
  });
  await ready(page);
  const panel = page.locator('#detail-panel');
  const evidence = page.locator('#detail-evidence');
  const fields = page.locator('#detail-fields');
  for (const [id, name] of [['points', 'マラッカ海峡'], ['routes', '通常主要航路']] as const) {
    await page.getByRole('button', { name: `${name}を選択`, exact: true }).click();
    const before = await panel.textContent();
    const evidenceNode = await evidence.locator('section').first().elementHandle();
    const fieldsNode = await fields.locator('dl').elementHandle();
    await page.locator('#detail-sources summary').click();
    await expect(page.locator('#detail-sources')).toHaveAttribute('open', '');
    await toggle(page, id).click();
    await expect(page.locator('#selected-name')).toHaveText(name);
    await expect(page.locator('#selected-visibility')).toHaveText(`この対象は現在地図上で非表示（${names[id]}レイヤーOFF）`);
    await expect(page.locator(`#feature-list [data-feature-id="${id === 'routes' ? 'normal-route' : 'malacca'}"]`)).toContainText('地図上で非表示');
    expect(await evidence.locator('section').first().evaluate((el, old) => el === old, evidenceNode)).toBe(true);
    expect(await fields.locator('dl').evaluate((el, old) => el === old, fieldsNode)).toBe(true);
    await expect(page.locator('#detail-sources')).toHaveAttribute('open', '');
    // Hiding changes only the visibility message within the detail panel.
    expect((await panel.textContent())!.replace((await page.locator('#selected-visibility').textContent())!, '')).toBe(before);
    const list = page.getByRole('button', { name: `${name}を選択`, exact: true });
    await list.click(); await expect(list).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#detail-sources summary').click();
    await expect(page.locator('#detail-sources')).not.toHaveAttribute('open', '');
    await screenshot(page, info.project.name, `hidden-selected-${id}`);
    await scenarioButton(page, true).click();
    await expect(page.locator('#selected-name')).toHaveText(name);
    await expect(page.locator('#selected-visibility')).toContainText('非表示');
    await expect(page.locator('#feature-list [aria-pressed="true"]')).toHaveAccessibleDescription(/地図上で非表示/);
    await expect(panel).toContainText('未収録'); await expect(evidence).toContainText('利用条件・権利');
    await toggle(page, id).click();
    await expect(page.locator('#selected-visibility')).toBeHidden();
    await expect(page.getByRole('button', { name: `地図上の${name}を選択`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (id === 'routes') {
      await expect(page.locator('path.route-candidate')).toHaveCount(2);
      await expect(page.locator('#candidate-legend')).toContainText('長短破線');
      await expect(page.locator('#selected-scenario')).toContainText('使用しません');
    }
    await scenarioButton(page, false).click();
  }
  // A candidate can also be selected from the list while its layer is OFF.
  await scenarioButton(page, true).click(); await toggle(page, 'routes').click();
  await page.getByRole('button', { name: 'スンダ経由候補を選択', exact: true }).click();
  await expect(page.locator('#selected-visibility')).toContainText('主要航路レイヤーOFF');
  await toggle(page, 'routes').click();
  await expect(page.getByRole('button', { name: '地図上のスンダ経由候補を選択', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await scenarioButton(page, false).click();
  await expect(page.locator('#selected-name')).toHaveText('マラッカ海峡');
  await expect(page.locator('#selected-visibility')).toBeHidden();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'タッチ移動を開始', exact: true }).tap();
  const position = await mapPosition(page);
  await drag(page, info.project.name === 'mobile');
  await expect.poll(async () => Math.abs((await mapPosition(page)).x - position.x)).toBeGreaterThan(20);
  const point = page.locator('.coordinate-dot').first();
  await map(page).focus(); const before = await point.boundingBox();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.abs((await point.boundingBox())!.x - before!.x)).toBeGreaterThan(20);
  const coast = page.locator('path.country-SGP'); const small = await coast.boundingBox();
  await page.keyboard.press('+');
  await expect.poll(async () => (await coast.boundingBox())!.width - small!.width).toBeGreaterThan(1);
  await page.getByRole('button', { name: '対象地域に戻る', exact: true }).click();
  await page.getByRole('button', { name: '地図上のシンガポールを選択', exact: true }).click();
  await expect(page.locator('#selected-name')).toHaveText('シンガポール');
  expect(documents).toBe(1); expect(data).toBe(1);
});

test('Tab, Shift+Tab, Enter and Space retain focus with reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page);
  for (let count = 0; count < 15; count++) {
    await page.keyboard.press('Tab');
    if (await toggle(page, 'borders').evaluate(el => el === document.activeElement)) break;
  }
  for (const id of ids) {
    await expect(toggle(page, id)).toBeFocused();
    expect(await toggle(page, id).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('Space');
    await expect(toggle(page, id)).toBeFocused(); await expect(toggle(page, id)).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(toggle(page, id)).toBeFocused(); await expect(toggle(page, id)).toHaveAttribute('aria-pressed', 'true');
    if (id !== 'points') await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Shift+Tab'); await expect(toggle(page, 'routes')).toBeFocused();
  await page.keyboard.press('Enter'); await scenarioButton(page, true).click();
  await expect(page.locator('#visible-layers')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#scenario-summary')).toContainText('主要航路レイヤーOFF');
  expect(await toggle(page, 'routes').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await map(page).evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await screenshot(page, info.project.name, 'keyboard-reduced-motion');
});

test('visibility chosen while loading or failed is kept on recovery', async ({ page }) => {
  const geography = await readFile('public/data/countries.json', 'utf8');
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/data/countries.json', async route => {
    requests++;
    if (requests === 1) { await waiting; await route.fulfill({ status: 503, body: '{}' }); }
    else await route.fulfill({ contentType: 'application/json', body: geography });
  });
  await page.goto('/'); await toggle(page, 'borders').click(); await toggle(page, 'routes').click();
  await scenarioButton(page, true).click();
  await expect(page.locator('#load-status')).toContainText('読み込んでいます');
  await expect(page.locator('#visible-layers')).toContainText('地理データ未表示');
  release(); await expect(page.locator('#load-status')).toContainText('読み込めませんでした');
  await toggle(page, 'points').click();
  await expect(page.locator('#load-status')).toContainText('読み込めませんでした');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: '地理データを再読み込み', exact: true }).click();
  await expect(page.locator('#load-status')).toContainText('探索できます');
  await assertState(page, { borders: false, routes: false, points: false }, true);
  await toggle(page, 'routes').click(); await expect(page.locator('path.route-candidate')).toHaveCount(2);
  expect(requests).toBe(2);
});
