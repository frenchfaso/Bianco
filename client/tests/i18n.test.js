import { describe, expect, it } from 'vitest'
import {
  AUTO_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  localeForLanguage,
  normalizeLanguage,
  resolveLanguage,
  resolveLocale,
  resources
} from '../src/i18n/index.js'

function flattenKeys(value, prefix = '', result = []) {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (item && typeof item === 'object') flattenKeys(item, path, result)
    else result.push(path)
  }
  return result.sort()
}

describe('i18n language resolution', () => {
  it('normalizes supported regional and underscore language tags', () => {
    expect(normalizeLanguage('it-IT')).toBe('it')
    expect(normalizeLanguage('FR_ca')).toBe('fr')
    expect(normalizeLanguage('de-DE')).toBe('de')
    expect(normalizeLanguage(AUTO_LANGUAGE)).toBeNull()
  })

  it('automatically picks the first supported browser language', () => {
    expect(detectBrowserLanguage(['pt-BR', 'fr-CA', 'it-IT'])).toBe('fr')
    expect(resolveLanguage('auto', ['es-MX', 'de-DE'])).toBe('es')
  })

  it('falls back to English when no browser language is supported', () => {
    expect(detectBrowserLanguage(['pt-BR', 'ja-JP'])).toBe('en')
    expect(resolveLanguage('auto', ['zh-Hant'])).toBe('en')
    expect(resolveLanguage('unsupported', ['it-IT'])).toBe('en')
  })

  it('honours an explicit supported preference over browser detection', () => {
    expect(resolveLanguage('de', ['fr-FR', 'it-IT'])).toBe('de')
    expect(resolveLanguage('en-GB', ['it-IT'])).toBe('en')
  })

  it('maps every supported language to its formatting locale', () => {
    expect(Object.fromEntries(SUPPORTED_LANGUAGES.map((language) => [
      language,
      localeForLanguage(language)
    ]))).toEqual({
      en: 'en-GB',
      it: 'it-IT',
      de: 'de-DE',
      es: 'es-ES',
      fr: 'fr-FR'
    })
    expect(resolveLocale('auto', ['fr-CA'])).toBe('fr-FR')
    expect(resolveLocale('xx', ['it-IT'])).toBe('en-GB')
  })
})

describe('i18n bundled resources', () => {
  it('contains exactly one catalogue for every supported language', () => {
    expect(Object.keys(resources)).toEqual(SUPPORTED_LANGUAGES)
  })

  it('keeps every translated catalogue in parity with English', () => {
    const reference = flattenKeys(resources.en.translation)
    expect(reference.length).toBeGreaterThan(0)

    for (const language of SUPPORTED_LANGUAGES) {
      const translations = resources[language].translation
      expect(flattenKeys(translations), language).toEqual(reference)
      expect(
        Object.values(translations).every((value) => value !== ''),
        `${language} must not contain empty top-level values`
      ).toBe(true)
    }
  })
})
