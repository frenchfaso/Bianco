import { describe, expect, it } from 'vitest'
import { collections, jobSchema, settingSchema } from '../src/db/schemas.js'

describe('settings schema v4', () => {
  it('requires constrained language and theme preferences', () => {
    expect(settingSchema.version).toBe(4)
    expect(settingSchema.properties.languagePreference).toEqual({
      type: 'string',
      enum: ['auto', 'en', 'it', 'de', 'es', 'fr']
    })
    expect(settingSchema.properties.themePreference).toEqual({
      type: 'string',
      enum: ['auto', 'light', 'dark']
    })
    expect(settingSchema.required).toEqual(expect.arrayContaining([
      'locale',
      'languagePreference',
      'themePreference'
    ]))
  })

  it('registers every settings migration through version 4', () => {
    expect(collections.settings.schema).toBe(settingSchema)
    expect(Object.keys(collections.settings.migrationStrategies)).toEqual(['1', '2', '3', '4'])
  })

  it('migrates existing settings to automatic language and theme without mutation', async () => {
    const previous = {
      id: 'singleton',
      locale: 'it-IT',
      defaultCurrency: 'EUR',
      selectedAiProvider: null,
      insightMinimumPercent: 20,
      insightMinimumMinor: 1000,
      aiSummary: null
    }

    const migrated = await collections.settings.migrationStrategies[4](previous)

    expect(migrated).toEqual({
      ...previous,
      languagePreference: 'auto',
      themePreference: 'auto'
    })
    expect(migrated).not.toBe(previous)
    expect(previous).not.toHaveProperty('languagePreference')
    expect(previous).not.toHaveProperty('themePreference')
  })
})

describe('local upload job schema v2', () => {
  it('removes legacy client-side AI extraction jobs during migration', async () => {
    expect(jobSchema.version).toBe(2)
    expect(jobSchema.properties.type.enum).not.toContain('ai-extraction')
    expect(await collections.jobs.migrationStrategies[2]({
      id: 'legacy-ai-job',
      type: 'ai-extraction'
    })).toBeNull()
  })

  it('keeps pending image uploads for offline-first delivery', async () => {
    const upload = { id: 'upload-job', type: 'image-upload' }
    expect(await collections.jobs.migrationStrategies[2](upload)).toBe(upload)
  })
})
