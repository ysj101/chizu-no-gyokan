import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// GP-07: measure how long the main experiment takes to answer on screen, from the input to the next
// painted frame. Measured in this browser only (no CPU throttling unless stated); the numbers are
// written to artifacts and summarised in docs/qa-log.md. The bound is loose: it catches regressions
// of an order of magnitude, not differences between machines.
async function ready(page: Page) { await page.goto('/'); await expect(page.locator('#load-status')).toContainText('探索できます'); }
// Time from a click dispatched in the page to the frame after the handler's work.
const timed = (page: Page, selector: string) => page.evaluate(selector => new Promise<number>(resolve => {
  const target = document.querySelector<HTMLElement>(selector)!;
  const start = performance.now();
  target.click();
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
}), selector);

for (const throttle of [1, 4]) {
  test(`the experiment answers within one interaction budget (CPU ×${throttle})`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'CPU throttling uses the Chromium DevTools protocol');
    if (throttle > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
    await ready(page);
    const samples: Record<string, number[]> = { '通れなくしてみる': [], '候補を試す': [], '日本から見ると？': [], '元に戻す': [] };
    for (let round = 0; round < 5; round++) {
      samples['通れなくしてみる']!.push(await timed(page, '#strait-action'));
      samples['候補を試す']!.push(await timed(page, '#try-sunda'));
      samples['日本から見ると？']!.push(await timed(page, '#chain-open'));
      await page.evaluate(() => document.querySelector<HTMLElement>('#chain-close')!.click());
      samples['元に戻す']!.push(await timed(page, '#strait-action'));
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const summary = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { median: Math.round(median(values)), max: Math.round(Math.max(...values)) }]));
    await mkdir('artifacts/map-exploration', { recursive: true });
    await writeFile(`artifacts/map-exploration/responsiveness-${info.project.name}-cpu${throttle}.json`, JSON.stringify(summary, null, 2));
    console.log(`responsiveness ${info.project.name} cpu×${throttle}`, JSON.stringify(summary));
    for (const { median: value } of Object.values(summary)) expect(value).toBeLessThan(throttle > 1 ? 1000 : 400);
  });
}
