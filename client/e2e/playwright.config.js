import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  globalSetup: './global-setup.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    browserName: 'chromium',
    locale: 'it-IT',
    storageState: '/tmp/bianco-e2e-auth.json',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure'
  },
  reporter: [['list']]
})
