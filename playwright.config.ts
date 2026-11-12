import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端测试跑在生产构建上（`vite preview`），因此能覆盖打包、SPA 回退、
 * 字体与 Worker 的真实加载路径。跑之前需要先 `npm run build`（npm script 已包含）。
 *
 * 首次使用需安装浏览器：npx playwright install chromium
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
