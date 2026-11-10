import { test as base, expect } from '@playwright/test';

// GP-01 folds the settings menu and the explanation card away on first view. The specs written before
// that exercise what lives inside them, on every load, reload and failed load. This fixture puts each
// page in the state of a reader who has opened both and gone back to the top: it presses the two real
// buttons once the page's own script has attached its handlers. The folded first view and the opening
// and closing themselves are covered by first-view.spec.ts and intro.spec.ts, which use the plain test.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('menu-open')?.click();
        document.getElementById('card-toggle')?.click();
        // Tab starts again from the top of the page, not from the menu that just took focus.
        const top = document.querySelector<HTMLElement>('.skip'); top?.focus(); top?.blur();
        window.scrollTo(0, 0);
      });
    });
    await use(page);
  },
});
export { expect };
