import { request } from '@playwright/test'

const authStatePath = '/tmp/bianco-e2e-auth.json'

export default async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost'
  const username = process.env.BIANCO_TEST_AUTH_USER || 'test-user'
  const password = process.env.BIANCO_TEST_AUTH_PASSWORD || 'test-password'
  const context = await request.newContext({ baseURL })
  try {
    const page = await context.get('/auth/login')
    if (!page.ok()) throw new Error(`Login page returned HTTP ${page.status()}`)
    const html = await page.text()
    const csrf = html.match(/name="csrf_token" value="([^"]+)"/)?.[1]
    if (!csrf) throw new Error('Login CSRF token was not found')

    const response = await context.post('/auth/login', {
      form: { username, password, csrf_token: csrf, next: '/' },
      maxRedirects: 0
    })
    if (response.status() !== 303) {
      throw new Error(`Login returned HTTP ${response.status()}`)
    }
    await context.storageState({ path: authStatePath })
  } finally {
    await context.dispose()
  }
}
