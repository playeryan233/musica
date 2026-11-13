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
