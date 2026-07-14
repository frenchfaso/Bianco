(() => {
  const storageKey = 'bianco-theme'
  const allowedPreferences = new Set(['auto', 'light', 'dark'])
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const root = document.documentElement

  const normalize = (value) => allowedPreferences.has(value) ? value : 'auto'
  const currentPreference = () => normalize(root.getAttribute('data-theme'))
  const effectiveTheme = () => currentPreference() === 'auto'
    ? (systemTheme.matches ? 'dark' : 'light')
    : currentPreference()

  const updateThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#101816' : '#f7faf9')
  }

  const apply = (value) => {
    const preference = normalize(value)
    if (preference === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', preference)
    updateThemeColor()
    return preference
  }

  const setPreference = (value) => {
    const normalized = apply(value)
    try {
      localStorage.setItem(storageKey, normalized)
    } catch {
      // The visual preference still applies when storage is unavailable.
    }
    return normalized
  }

  try {
    apply(localStorage.getItem(storageKey))
  } catch {
    apply('auto')
  }

  const handleSystemThemeChange = () => {
    if (currentPreference() === 'auto') updateThemeColor()
  }
  if (typeof systemTheme.addEventListener === 'function') {
    systemTheme.addEventListener('change', handleSystemThemeChange)
  } else {
    systemTheme.addListener(handleSystemThemeChange)
  }

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) apply(event.newValue)
  })

  if (!document.querySelector('meta[name="theme-color"]')) {
    document.addEventListener('DOMContentLoaded', updateThemeColor, { once: true })
  }

  Object.defineProperty(window, 'biancoTheme', {
    configurable: false,
    writable: false,
    value: Object.freeze({
      apply,
      setPreference,
      storageKey,
      getPreference: currentPreference,
      getEffectiveTheme: effectiveTheme
    })
  })
})()
