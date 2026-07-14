import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import de from './resources/de.js'
import en from './resources/en.js'
import es from './resources/es.js'
import fr from './resources/fr.js'
import it from './resources/it.js'

export const AUTO_LANGUAGE = 'auto'
export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'it', 'de', 'es', 'fr'])

const supportedLanguageSet = new Set(SUPPORTED_LANGUAGES)
const localeByLanguage = Object.freeze({
  en: 'en-GB',
  it: 'it-IT',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR'
})

export const resources = Object.freeze({
  en: { translation: en },
  it: { translation: it },
  de: { translation: de },
  es: { translation: es },
  fr: { translation: fr }
})

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (!normalized || normalized === AUTO_LANGUAGE) return null
  const [language] = normalized.split('-')
  return supportedLanguageSet.has(language) ? language : null
}

export function detectBrowserLanguage(browserLanguages) {
  const candidates = browserLanguages ?? (
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
  )
  for (const candidate of candidates || []) {
    const language = normalizeLanguage(candidate)
    if (language) return language
  }
  return 'en'
}

export function resolveLanguage(preference = AUTO_LANGUAGE, browserLanguages) {
  if (preference === AUTO_LANGUAGE || preference == null || preference === '') {
    return detectBrowserLanguage(browserLanguages)
  }
  return normalizeLanguage(preference) || 'en'
}

export function localeForLanguage(language) {
  return localeByLanguage[normalizeLanguage(language) || 'en']
}

export function resolveLocale(preference = AUTO_LANGUAGE, browserLanguages) {
  return localeForLanguage(resolveLanguage(preference, browserLanguages))
}

export function updateDocumentMetadata(language = i18next.resolvedLanguage || i18next.language) {
  if (typeof document === 'undefined') return
  const resolved = normalizeLanguage(language) || 'en'
  document.documentElement.lang = resolved
  document.documentElement.dir = 'ltr'
  document.title = i18next.t('meta.title', { lng: resolved })
  const description = document.querySelector('meta[name="description"]')
  if (description) description.content = i18next.t('meta.description', { lng: resolved })
}

export async function setLanguage(preference = AUTO_LANGUAGE, browserLanguages) {
  const language = resolveLanguage(preference, browserLanguages)
  if (!i18next.isInitialized) return initI18n({ preference, browserLanguages })
  await i18next.changeLanguage(language)
  updateDocumentMetadata(language)
  return { language, locale: localeForLanguage(language) }
}

export async function initI18n(options = {}) {
  const configuration = typeof options === 'string' ? { preference: options } : options
  const preference = configuration.preference ?? AUTO_LANGUAGE
  const browserLanguages = configuration.browserLanguages
  const language = resolveLanguage(preference, browserLanguages)

  if (!i18next.isInitialized) {
    await i18next.use(LanguageDetector).init({
      resources,
      supportedLngs: SUPPORTED_LANGUAGES,
      fallbackLng: 'en',
      load: 'languageOnly',
      cleanCode: true,
      lowerCaseLng: true,
      nonExplicitSupportedLngs: true,
      returnNull: false,
      lng: language,
      detection: {
        order: ['navigator'],
        caches: []
      },
      interpolation: {
        // Every translated UI value is assigned as text, never injected as HTML.
        escapeValue: false
      }
    })
  } else if (normalizeLanguage(i18next.resolvedLanguage || i18next.language) !== language) {
    await i18next.changeLanguage(language)
  }

  updateDocumentMetadata(language)
  return { language, locale: localeForLanguage(language) }
}

export const t = (...arguments_) => i18next.t(...arguments_)
export { i18next }
