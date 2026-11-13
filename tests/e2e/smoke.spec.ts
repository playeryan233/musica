import { expect, test, type Page } from '@playwright/test';

/**
 * 生产构建冒烟测试：覆盖路由、深链刷新、字体与静态资源加载。
 * 任何 4xx/5xx 响应或页面运行时报错都会让用例失败。
 */
function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !url.endsWith('/favicon.ico')) {
      problems.push(`${response.status()} ${url}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

const routes = [
  { path: '/', text: '跟随乐谱练琴，跟着节拍前进' },
  { path: '/songs', text: '搜索歌曲' },
  { path: '/metronome', text: '独立节拍器' },
  { path: '/nope', text: '页面不存在' },
];

for (const route of routes) {
  test(`路由 ${route.path} 可访问且无资源错误`, async ({ page }) => {
    const problems = trackProblems(page);

    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(route.text);
    expect(problems).toEqual([]);
  });
}

test('曲谱深链直接打开并在刷新后正常渲染', async ({ page }) => {
  const problems = trackProblems(page);

  await page.goto('/songs/practice-001');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('C 大调音阶练习');

  // 音乐字体来自 /font/，加载失败时谱面无法渲染。
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('C 大调音阶练习');

  expect(problems).toEqual([]);
});

test('节拍器可以开始播放', async ({ page }) => {
  const problems = trackProblems(page);

  await page.goto('/metronome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('独立节拍器');

  await page.getByRole('button', { name: /开始/ }).first().click();
  await expect(page.getByRole('button', { name: /停止/ }).first()).toBeVisible();

  expect(problems).toEqual([]);
});

test('空格键只在没有聚焦控件时切换播放', async ({ page }) => {
  await page.goto('/songs/practice-001');

  const play = page.getByRole('button', { name: '开始练习' });
  await expect(play).toBeEnabled();

  // A focused button owns the space key: it activates that button instead of
  // toggling playback (the "回到开头" button is a harmless no-op here).
  await page.getByRole('button', { name: '回到开头' }).focus();
  await page.keyboard.press('Space');
  await expect(play).toBeVisible();

  // With focus outside any control, the global shortcut still works.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
});

test('每个页面使用同一个顶栏并高亮当前页', async ({ page }) => {
  const pages = [
    { path: '/', active: '首页' },
    { path: '/songs', active: '歌曲' },
    { path: '/songs/practice-001', active: '歌曲' },
    { path: '/metronome', active: '节拍器' },
  ];

  for (const { path, active } of pages) {
    await page.goto(path);
    const header = page.locator('header.site-header');
    await expect(header).toBeVisible();
    await expect(header.locator('.site-brand')).toHaveAttribute('href', '/');
    await expect(header.locator('nav a')).toHaveText(['首页', '歌曲', '节拍器']);
    // Exactly one link carries the current-page marker, whatever the route.
    await expect(header.locator('[aria-current="page"]')).toHaveText(active);
  }
});

test('导航栏居中且悬停会放大对应选项', async ({ page }) => {
  await page.goto('/');

  const offset = await page.evaluate(() => {
    const header = document.querySelector('header.site-header');
    const nav = header?.querySelector('nav');
    if (!header || !nav) return 999;
    const h = header.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return Math.abs(n.left + n.width / 2 - (h.left + h.width / 2));
  });
  expect(offset).toBeLessThan(2);

  const link = page.getByRole('link', { name: '歌曲', exact: true });
  await link.hover();
  await expect
    .poll(async () => {
      const transform = await link.evaluate((el) => getComputedStyle(el).transform);
      if (transform === 'none') return 1;
      return Number(/matrix\(([^,]+)/.exec(transform)?.[1] ?? 1);
    })
    .toBeGreaterThan(1.1);
});

test('点击页面会飘出随机音符并淡出', async ({ page }) => {
  await page.goto('/');
  // Wait until the click layer is mounted (its effect attaches the listener).
  await expect(page.locator('.click-note-preload')).toBeAttached();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(200);

  await page.mouse.click(200, 170);

  const note = page.locator('.click-note');
  await expect(note.first()).toBeVisible();
  await expect(note).toHaveCount(0, { timeout: 3000 });
});

test('首页有持续滚动的随机乐谱', async ({ page }) => {
  await page.goto('/');

  const staff = page.locator('.home-staff');
  await expect(staff).toBeVisible();
  await expect(staff.locator('.home-staff-head').first()).toBeVisible();

  const track = page.locator('.home-staff-track');
  const started = await track.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(async () => track.evaluate((el) => getComputedStyle(el).transform), { timeout: 4000 })
    .not.toBe(started);
});

test('D 大调卡农出现在曲库且可以直接打开', async ({ page }) => {
  const problems = trackProblems(page);

  await page.goto('/songs');
  await expect(page.locator('.song-list')).toContainText('D 大调卡农');

  await page.goto('/songs/practice-004');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('D 大调卡农');
  await expect(page.getByRole('button', { name: '开始练习' })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Bravura'))).toBe(true);

  expect(problems).toEqual([]);
});
