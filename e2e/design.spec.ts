// Visual design checks (v1.4): layout at three widths, sidebar collapse, both themes,
// WCAG AA contrast measured in the browser, keyboard focus, tap targets, reduced motion, fonts.
import { expect, test, type Page } from '@playwright/test';
import { openSavedExample } from './fixtures';

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** A saved example with every collapsible part opened, so all of its text is on screen. */
async function showEverything(page: Page, demo = 'sandbox') {
  await page.goto(`./?demo=${demo}`);
  await expect(page.getByTestId('sentence-reworkRate')).toBeVisible();
  await page.locator('details.deployments summary').click();
  await page.getByTestId('settings').locator('summary').click();
  await page.locator('details.help summary').click();
}

test.describe('layout', () => {
  for (const w of WIDTHS) {
    test(`no horizontal scrolling at ${w.name} width (${w.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w.width, height: w.height });
      for (const demo of ['sandbox', 'angular']) {
        await showEverything(page, demo);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${demo} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('metric cards: five across on desktop, two on tablet, one on phone', async ({ page }) => {
    for (const [width, columns] of [[1440, 5], [820, 2], [390, 1]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./?demo=sandbox');
      const tops = await page.locator('.tile').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops.filter((t) => t === tops[0]).length, `${width}px`).toBe(columns);
    }
  });
});

test.describe('sidebar', () => {
  test('on desktop the navigation is always shown and there is no menu button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await expect(page.getByTestId('menu')).toBeHidden();
    await expect(page.getByTestId('demo')).toBeVisible();
    await expect(page.getByTestId('open-settings')).toBeVisible();
  });

  test('on phones it collapses to a top bar whose menu opens and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    const menu = page.getByTestId('menu');
    await expect(page.getByRole('heading', { name: 'DORA Dashboard' })).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('demo')).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('demo')).toBeVisible();
    await menu.click();
    await expect(page.getByTestId('demo')).toBeHidden();
    // Escape closes it and puts focus back on the menu button.
    await menu.click();
    await page.getByTestId('demo').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('demo')).toBeHidden();
    await expect(menu).toBeFocused();
    // Choosing an example closes the menu and shows the result.
    await openSavedExample(page, 'demo-angular');
    await expect(page.getByTestId('repo-link')).toHaveText('angular/angular');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('Settings in the sidebar opens the settings', async ({ page }) => {
    await page.goto('./');
    const menu = page.getByTestId('menu');
    if (await menu.isVisible()) await menu.click();
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings')).toHaveAttribute('open', '');
    await expect(page.getByTestId('rework-rule')).toBeVisible();
  });
});

test.describe('themes and contrast', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`${scheme} theme renders with the ${scheme} tokens`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('./?demo=sandbox');
      await expect(page.getByTestId('results')).toBeVisible();
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(scheme === 'dark' ? 'rgb(16, 16, 20)' : 'rgb(238, 238, 242)');
    });

    test(`all text meets WCAG AA contrast in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const demo of ['sandbox', 'angular']) {
        await showEverything(page, demo);
        const failures = await page.evaluate(lowContrastText);
        expect(failures, failures.join('\n')).toEqual([]);
      }
    });
  }
});

test.describe('controls', () => {
  test('every keyboard stop shows a visible focus ring', async ({ page }) => {
    await page.goto('./?demo=sandbox');
    await page.locator('details.deployments summary').click();
    const menu = page.getByTestId('menu');
    if (await menu.isVisible()) await menu.click(); // phones: include the navigation too
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { id: `${el.tagName}#${el.id}.${el.className}:${el.textContent?.slice(0, 20)}`, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
      });
      if (!f) continue;
      seen.add(f.id);
      expect(f.style, f.id).not.toBe('none');
      expect(f.width, f.id).toBeGreaterThanOrEqual(2);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  test('tap targets are at least 44px tall on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await showEverything(page);
    await page.getByTestId('menu').click();
    const small = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('button, select, summary, input:not([type="checkbox"]), label.check')];
      return els
        .filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => ({ what: `${e.tagName}#${e.id}.${e.className} "${(e.textContent ?? '').trim().slice(0, 30)}"`, h: e.getBoundingClientRect().height }))
        .filter((x) => x.h < 44)
        .map((x) => `${x.what}: ${Math.round(x.h)}px`);
    });
    expect(small, small.join('\n')).toEqual([]);
  });

  test('status is never shown by colour alone', async ({ page }) => {
    await page.goto('./?demo=sandbox&failed=v1.4.1');
    await page.locator('details.deployments summary').click();
    await expect(page.getByTestId('deployment-v1.2.0').locator('.tag.failed')).toContainText('Failed');
    await expect(page.getByTestId('deployment-v1.2.1').locator('.tag.rework')).toContainText('Rework');
    await expect(page.getByTestId('deployment-v1.4.1').locator('.tag.corrected')).toHaveText('manually corrected');
    for (const key of ['changeFailureRate', 'recoveryTime', 'reworkRate']) await expect(page.getByTestId(`proxy-${key}`)).toHaveText('Proxy');
  });
});

test.describe('motion and loading', () => {
  test('with "reduce motion" nothing animates', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('./?demo=sandbox');
    await expect(page.getByTestId('results')).toBeVisible();
    const motion = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pill, .tile, .item')]
      .map((e) => getComputedStyle(e))
      .filter((s) => s.transitionDuration.split(',').some((d) => parseFloat(d) > 0) || s.animationName !== 'none').length);
    expect(motion).toBe(0);
    await ctx.close();
  });

  test('a live analysis shows skeleton cards while it loads, not a spinner', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    await page.route('https://api.github.com/**', async (route) => {
      await gate;
      await route.fulfill({ status: 404, body: '{"message":"Not Found"}', headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto('./');
    await page.getByTestId('repo-input').fill('example/slow');
    await page.getByTestId('analyse').click();
    await expect(page.getByTestId('loading')).toBeVisible();
    await expect(page.getByTestId('loading').locator('.skeleton-tile')).toHaveCount(5);
    release();
    await expect(page.getByTestId('error')).toBeVisible();
    await expect(page.getByTestId('loading')).toBeHidden();
  });

  test('fonts stay small and self-hosted', async ({ page }) => {
    const fonts: { url: string; size: number }[] = [];
    const hosts = new Set<string>();
    page.on('response', async (res) => {
      hosts.add(new URL(res.url()).host);
      if (res.request().resourceType() === 'font') fonts.push({ url: res.url(), size: (await res.body()).length });
    });
    await page.goto('./?demo=sandbox');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('results')).toBeVisible();
    expect(fonts.length).toBe(1);
    expect(fonts[0]!.size).toBeLessThan(40_000);
    expect([...hosts]).toEqual(['localhost:4173']);
  });
});

test.describe('banner', () => {
  test('headline and description come first, with the repository field right under them', async ({ page }) => {
    await page.goto('./');
    const banner = page.getByTestId('banner');
    await expect(banner.getByRole('heading', { name: 'Performance metrics for engineering teams' })).toBeVisible();
    await expect(banner).toContainText(
      'Plug in any public GitHub repository and see how fast and how safely the teams behind it deliver, based on the DORA metrics.');
    const bannerBox = (await banner.boundingBox())!;
    const fieldBox = (await page.getByTestId('repo-input').boundingBox())!;
    expect(fieldBox.y).toBeGreaterThan(bannerBox.y + bannerBox.height);
    // Nothing else sits between the banner and the form.
    expect(fieldBox.y - (bannerBox.y + bannerBox.height)).toBeLessThan(120);
  });

  test('the release rhythm is decoration only: hidden from screen readers, never behind text', async ({ page }) => {
    for (const width of [1440, 1300, 1100, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      const rhythm = page.locator('.rhythm');
      await expect(rhythm).toHaveAttribute('aria-hidden', 'true');
      const r = (await rhythm.boundingBox())!;
      for (const sel of ['.app-title', '.app-lede']) {
        const t = (await page.locator(sel).boundingBox())!;
        const overlaps = r.x < t.x + t.width && t.x < r.x + r.width && r.y < t.y + t.height && t.y < r.y + r.height;
        expect(overlaps, `${sel} at ${width}px`).toBe(false);
      }
    }
  });

  test('opening a saved example scrolls down to its result', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await openSavedExample(page, 'demo');
    await expect(page.getByTestId('repo-link')).toHaveText('GonzaSSH/dora-sandbox');
    await expect.poll(async () => (await page.getByTestId('results').boundingBox())!.y).toBeLessThan(120);
  });

  test('changing a correction does not jump the page back to the top of the results', async ({ page }) => {
    await page.goto('./?demo=sandbox');
    await page.locator('details.deployments summary').click();
    const row = page.getByTestId('correct-v1.4.1');
    const settled = async () => {
      let last = -1;
      await expect.poll(async () => { const y = await page.evaluate(() => window.scrollY); const same = y === last; last = y; return same; }, { intervals: [200] }).toBe(true);
      return last;
    };
    await settled(); // the scroll to the result after loading has finished
    await row.scrollIntoViewIfNeeded();
    const before = await settled();
    await row.focus(); // as a keyboard user who tabbed to it
    await row.selectOption('failed');
    await expect(page.getByTestId('corrections-summary')).toBeVisible();
    expect(Math.abs((await settled()) - before)).toBeLessThan(400);
    // Keyboard users stay on the control they just changed.
    await expect(page.getByTestId('correct-v1.4.1')).toBeFocused();
  });
});

test('every fold-out looks like a button, with an icon and an arrow that flips when open', async ({ page }) => {
  await page.goto('./?demo=sandbox');
  await expect(page.getByTestId('results')).toBeVisible();
  const summaries = page.locator('summary');
  const n = await summaries.count();
  expect(n).toBeGreaterThanOrEqual(8); // why a token, settings, 5 cards, the release list
  for (let i = 0; i < n; i++) {
    const s = summaries.nth(i);
    if (!(await s.isVisible())) continue;
    await expect(s).toHaveClass(/disclosure/);
    await expect(s.locator('svg.ico')).toHaveCount(1);
    await expect(s.locator('svg.chev')).toHaveCount(1);
    // A visible edge or fill, so it reads as something to press.
    const look = await s.evaluate((el) => { const c = getComputedStyle(el); return { shadow: c.boxShadow, bg: c.backgroundColor }; });
    expect(look.shadow !== 'none' || look.bg !== 'rgba(0, 0, 0, 0)').toBe(true);
  }
  const settings = page.getByTestId('settings').locator('summary');
  const angle = () => settings.locator('svg.chev').evaluate((el) => getComputedStyle(el).transform);
  expect(await angle()).toBe('none');
  await settings.click();
  expect(await angle()).not.toBe('none');
});

test.describe('charts on the cards', () => {
  const KEYS = ['deploymentFrequency', 'leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'];

  test('every card has a weekly chart with the hand-worked values (EXPECTED.md)', async ({ page }) => {
    await page.goto('./?demo=sandbox');
    for (const key of KEYS) await expect(page.getByTestId(`chart-${key}`)).toBeVisible();
    await expect(page.getByTestId('chart-deploymentFrequency').locator('svg'))
      .toHaveAttribute('aria-label', 'Releases per week: 1, 0, 1, 0, 2, 0, 2, 0, 0, 1, 0, 3, 0.');
    // 6 weeks with releases, one bar each; 4 of them have an urgent-fix part.
    await expect(page.getByTestId('chart-deploymentFrequency').locator('rect.bar')).toHaveCount(6);
    await expect(page.getByTestId('chart-changeFailureRate').locator('rect.bar.bad')).toHaveCount(3);
    await expect(page.getByTestId('chart-recoveryTime').locator('rect.bar.bad')).toHaveCount(3);
  });

  test('numbers, charts and sentences line up across the cards in a row', async ({ page }) => {
    for (const [width, perRow] of [[1440, 5], [820, 2]] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const demo of ['sandbox', 'angular', 'dashboard']) {
        await page.goto(`./?demo=${demo}`);
        await expect(page.getByTestId('chart-reworkRate')).toBeVisible();
        for (const prefix of ['value', 'chart', 'sentence', 'trend']) {
          const tops = await page.evaluate(([p, keys]) => keys.map((k) => Math.round(document.querySelector(`[data-testid="${p}-${k}"]`)!.getBoundingClientRect().top)),
            [prefix, KEYS] as const);
          for (let i = 0; i < tops.length; i += perRow) {
            const row = tops.slice(i, i + perRow);
            expect(new Set(row).size, `${demo} ${prefix} at ${width}px: ${row.join(', ')}`).toBe(1);
          }
        }
      }
    }
  });

  test('hovering a bar shows that week inside the card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./?demo=sandbox');
    const chart = page.getByTestId('chart-changeFailureRate');
    const svg = chart.locator('svg');
    const box = (await svg.boundingBox())!;
    await svg.hover({ position: { x: box.width * (11.5 / 13), y: box.height - 4 } });
    const tip = chart.locator('.chart-tip');
    await expect(tip).toHaveText('Week of 19 Mar: 3 releases, 2 needed an urgent fix');
    const t = (await tip.boundingBox())!, card = (await page.getByTestId('metric-changeFailureRate').boundingBox())!;
    expect(t.x).toBeGreaterThanOrEqual(card.x);
    expect(t.x + t.width).toBeLessThanOrEqual(card.x + card.width);
  });

  test('marking a release failed by hand updates the chart straight away', async ({ page }) => {
    await page.goto('./?demo=sandbox');
    const bad = page.getByTestId('chart-changeFailureRate').locator('rect.bar.bad');
    await expect(bad).toHaveCount(3);
    await page.goto('./?demo=sandbox&failed=v1.4.1');
    await expect(bad).toHaveCount(4);
  });
});

test('Share copies the page address', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./?demo=sandbox&failed=v1.4.1');
  await page.getByTestId('share').click();
  await expect(page.getByTestId('share-status')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  expect(copied).toContain('failed=v1.4.1');
});

/**
 * Runs in the page: every visible element with its own text, checked against the colour
 * behind it (WCAG 2 contrast ≥ 4.5). Over the accent gradients (banner, results header) the
 * tint end is used, which is the lower-contrast end in both themes.
 */
function lowContrastText(): string[] {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const behind = (el: Element): number[] => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage.includes('gradient') && (e.classList.contains('summary') || e.classList.contains('banner'))) {
        const probe = document.createElement('span');
        probe.style.color = s.getPropertyValue('--header-tint');
        document.body.append(probe);
        const c = parse(getComputedStyle(probe).color);
        probe.remove();
        return c;
      }
      const c = parse(s.backgroundColor);
      if (c.length >= 3 && (c.length === 3 || c[3]! > 0)) return c.slice(0, 3);
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (!own || el.getClientRects().length === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || (el as HTMLButtonElement).disabled || el.closest('.skip')) continue;
    const r = ratio(parse(s.color).slice(0, 3), behind(el));
    if (r < 4.5) out.push(`${r.toFixed(2)} ${el.tagName}.${el.className} "${el.textContent!.trim().slice(0, 40)}"`);
  }
  return out;
}
