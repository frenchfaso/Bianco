import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    browserName: 'chromium',
    locale: 'it-IT',
    httpCredentials: {
      username: process.env.BIANCO_TEST_AUTH_USER || 'test-user',
      password: process.env.BIANCO_TEST_AUTH_PASSWORD || 'test-password'
    },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure'
  },
  reporter: [['list']]
})
