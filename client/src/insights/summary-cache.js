function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export async function summaryDatasetHash(snapshot, language, promptVersion) {
  const bytes = new TextEncoder().encode(canonicalJson({ snapshot, language, promptVersion }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isSummaryCurrent(summary, expectedHash, promptVersion) {
  return Boolean(
    summary &&
    summary.promptVersion === promptVersion &&
    summary.datasetHash &&
    summary.datasetHash === expectedHash
  )
}
