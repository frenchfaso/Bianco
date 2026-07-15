export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const response = await fetch(path, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'same-origin'
  })
  if (response.status === 401 && window.location.pathname !== '/auth/login') {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`)
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}))
    const error = new Error(problem.detail || `HTTP ${response.status}`)
    error.code = String(response.status)
    throw error
  }
  return response
}
