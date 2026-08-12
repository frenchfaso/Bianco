function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const CONFIGURATION_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/

export function normalizeInsightConfigurationFingerprint(value) {
  return typeof value === 'string' && CONFIGURATION_FINGERPRINT_PATTERN.test(value)
    ? value
    : null
}

export function activeInsightConfigurationFingerprint(providers) {
  const active = providers.find((provider) => provider.active && provider.configured)
  return normalizeInsightConfigurationFingerprint(active?.insightConfigurationFingerprint)
}

export function sameSummaryIdentity(left, right) {
  if (!left || !right) return false
  return left.datasetHash === right.datasetHash &&
    left.promptVersion === right.promptVersion &&
    left.generatedAt === right.generatedAt &&
    left.generatedBy?.configurationFingerprint ===
      right.generatedBy?.configurationFingerprint
}

export async function summaryDatasetHash(snapshot, language, promptVersion) {
  const bytes = new TextEncoder().encode(canonicalJson({ snapshot, language, promptVersion }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isSummaryCurrent(
  summary,
  expectedHash,
  promptVersion,
  expectedConfigurationFingerprint = undefined
) {
  const configurationMatches = expectedConfigurationFingerprint === undefined || (
    expectedConfigurationFingerprint !== null &&
    normalizeInsightConfigurationFingerprint(
      summary?.generatedBy?.configurationFingerprint
    ) === expectedConfigurationFingerprint
  )
  return Boolean(
    summary &&
    summary.promptVersion === promptVersion &&
    summary.datasetHash &&
    summary.datasetHash === expectedHash &&
    configurationMatches
  )
}
