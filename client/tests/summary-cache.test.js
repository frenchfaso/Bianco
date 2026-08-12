import { describe, expect, it } from 'vitest'
import {
  activeInsightConfigurationFingerprint,
  isSummaryCurrent,
  normalizeInsightConfigurationFingerprint,
  sameSummaryIdentity,
  summaryDatasetHash
} from '../src/insights/summary-cache.js'

const fingerprint = 'a'.repeat(64)

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

  it('invalidates legacy and mismatched summaries once backend configuration is known', () => {
    const summary = { promptVersion: 'v2', datasetHash: 'dataset' }

    // Before the first remote connection the backend configuration is
    // intentionally unknown, so offline-first startup can reuse the cache.
    expect(isSummaryCurrent(summary, 'dataset', 'v2')).toBe(true)
    expect(isSummaryCurrent(summary, 'dataset', 'v2', fingerprint)).toBe(false)
    expect(isSummaryCurrent(summary, 'dataset', 'v2', null)).toBe(false)

    const current = {
      ...summary,
      generatedBy: { configurationFingerprint: fingerprint }
    }
    expect(isSummaryCurrent(current, 'dataset', 'v2', fingerprint)).toBe(true)
    expect(isSummaryCurrent(current, 'dataset', 'v2', 'b'.repeat(64))).toBe(false)
  })

  it('accepts only opaque SHA-256 fingerprints from the provider status', () => {
    expect(normalizeInsightConfigurationFingerprint(fingerprint)).toBe(fingerprint)
    expect(normalizeInsightConfigurationFingerprint('gpt-5.6-sol')).toBeNull()
    expect(normalizeInsightConfigurationFingerprint('A'.repeat(64))).toBeNull()

    expect(activeInsightConfigurationFingerprint([
      { active: false, configured: true, insightConfigurationFingerprint: 'b'.repeat(64) },
      { active: true, configured: true, insightConfigurationFingerprint: fingerprint }
    ])).toBe(fingerprint)
    expect(activeInsightConfigurationFingerprint([
      { active: true, configured: false, insightConfigurationFingerprint: fingerprint }
    ])).toBeNull()
  })

  it('does not clear a newer summary that races with stale-cache validation', () => {
    const stale = {
      datasetHash: 'same-dataset',
      promptVersion: 'v2',
      generatedAt: '2026-08-12T10:00:00Z',
      generatedBy: { configurationFingerprint: fingerprint }
    }
    const refreshed = {
      ...stale,
      generatedAt: '2026-08-12T10:00:01Z',
      generatedBy: { configurationFingerprint: 'b'.repeat(64) }
    }

    expect(sameSummaryIdentity(stale, { ...stale })).toBe(true)
    expect(sameSummaryIdentity(refreshed, stale)).toBe(false)
  })
})
