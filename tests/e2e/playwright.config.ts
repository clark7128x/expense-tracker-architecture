import { defineConfig } from '../../src/expense-tracker-web/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1,
  outputDir: '../../test-results', reporter: 'list',
  use: { baseURL: 'http://localhost:5080', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 }, browserName: 'chromium', channel: 'msedge' } },
    { name: 'mobile', use: { viewport: { width: 360, height: 800 }, browserName: 'chromium', channel: 'msedge' } },
  ],
  webServer: { command: 'node tests/e2e/server.mjs', cwd: resolve(import.meta.dirname, '../..'), url: 'http://localhost:5080/api/v1/categories', reuseExistingServer: false, timeout: 60000 },
});
