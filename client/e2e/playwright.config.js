import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  globalSetup: './global-setup.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    locale: 'it-IT',
    storageState: '/tmp/bianco-e2e-auth.json',
    ignoreHTTPSErrors: true,
    proxy: process.env.PLAYWRIGHT_PROXY
      ? { server: process.env.PLAYWRIGHT_PROXY }
      : undefined,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/webkit-smoke.spec.js',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
        }
      }
    },
    {
      name: 'webkit',
      testMatch: '**/webkit-smoke.spec.js',
      use: { browserName: 'webkit' }
    }
  ],
  reporter: [['list']]
})
