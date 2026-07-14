import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    browserName: 'chromium',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure'
  },
  reporter: [['list']]
})
