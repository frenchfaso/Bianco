import { describe, expect, it } from 'vitest'
import { isSummaryCurrent, summaryDatasetHash } from '../src/insights/summary-cache.js'

describe('AI summary cache', () => {
  it('is tied to the current dataset, language and prompt version', async () => {
    const snapshot = { total: 1234, period: { start: '2026-07-01', end: '2026-07-31' } }
    const hash = await summaryDatasetHash(snapshot, 'it', 'v2')
    expect(isSummaryCurrent({ promptVersion: 'v2', datasetHash: hash }, hash, 'v2')).toBe(true)
    expect(await summaryDatasetHash({ ...snapshot, total: 1235 }, 'it', 'v2')).not.toBe(hash)
    expect(await summaryDatasetHash(snapshot, 'en', 'v2')).not.toBe(hash)
  })

  it('canonicalizes object keys before hashing', async () => {
    expect(await summaryDatasetHash({ a: 1, b: 2 }, 'en', 'v2'))
      .toBe(await summaryDatasetHash({ b: 2, a: 1 }, 'en', 'v2'))
  })
})
