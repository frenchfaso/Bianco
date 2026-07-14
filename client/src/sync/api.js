export async function apiFetch(path, token, options = {}) {
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...options, headers, cache: 'no-store' })
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}))
    const error = new Error(problem.detail || `HTTP ${response.status}`)
    error.code = String(response.status)
    throw error
  }
  return response
}
