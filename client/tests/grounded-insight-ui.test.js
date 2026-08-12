import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('grounded AI insight UI', () => {
  it('renders server-grounded prose verbatim without client substitutions', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')

    expect(html).toContain('<li x-text="observation"></li>')
    expect(html).toContain('x-text="settings.aiSummary?.suggestion"')
    expect(html).not.toContain('localizedAiText')
    expect(app).not.toContain('localizedAiText')
  })
})
