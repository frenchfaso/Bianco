const nullableString = { type: ['string', 'null'] }
const nullableInteger = { type: ['integer', 'null'], minimum: 0 }
const nullableNumber = { type: ['number', 'null'], minimum: 0 }

export const receiptSchema = {
  title: 'receipt',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    status: {
      type: 'string',
      enum: ['captured', 'queued', 'processing', 'needs_review', 'confirmed', 'failed', 'manual']
    },
    capturedAt: { type: 'string' },
    transactionDate: nullableString,
    merchantRaw: nullableString,
    merchantNormalized: nullableString,
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    subtotalMinor: nullableInteger,
    taxMinor: nullableInteger,
    discountMinor: nullableInteger,
    totalMinor: nullableInteger,
    categoryId: { type: 'string' },
    imageHash: nullableString,
    overallConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    warnings: { type: 'array', items: { type: 'string' } },
    userConfirmed: { type: 'boolean' },
    ai: {
      type: 'object',
      additionalProperties: false,
      properties: {
        providerId: nullableString,
        modelId: nullableString,
        promptVersion: nullableString,
        schemaVersion: { type: ['integer', 'null'] }
      },
      required: ['providerId', 'modelId', 'promptVersion', 'schemaVersion']
    },
    updatedAt: { type: 'string' },
    updatedByDevice: { type: 'string' }
  },
  required: [
    'id', 'status', 'capturedAt', 'transactionDate', 'merchantRaw', 'merchantNormalized',
    'currency', 'subtotalMinor', 'taxMinor', 'discountMinor', 'totalMinor', 'categoryId',
    'imageHash', 'overallConfidence', 'warnings', 'userConfirmed', 'ai', 'updatedAt',
    'updatedByDevice'
  ],
  indexes: ['updatedAt', 'status', 'categoryId']
}

export const receiptItemSchema = {
  title: 'receipt item',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    receiptId: { type: 'string', maxLength: 64 },
    rawName: { type: 'string' },
    normalizedName: { type: 'string' },
    quantity: nullableNumber,
    unitPriceMinor: nullableInteger,
    totalPriceMinor: nullableInteger,
    categoryId: { type: 'string' },
    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    position: { type: 'integer', minimum: 0 },
    userEdited: { type: 'boolean' },
    updatedAt: { type: 'string' },
    updatedByDevice: { type: 'string' }
  },
  required: [
    'id', 'receiptId', 'rawName', 'normalizedName', 'quantity', 'unitPriceMinor',
    'totalPriceMinor', 'categoryId', 'confidence', 'position', 'userEdited', 'updatedAt',
    'updatedByDevice'
  ],
  indexes: ['receiptId', 'updatedAt', 'categoryId']
}

export const imageSchema = {
  title: 'receipt image',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  attachments: { encrypted: false },
  properties: {
    id: { type: 'string', maxLength: 64 },
    receiptId: { type: 'string', maxLength: 64 },
    mimeType: { type: 'string' },
    width: { type: 'integer', minimum: 0 },
    height: { type: 'integer', minimum: 0 },
    sizeBytes: { type: 'integer', minimum: 0 },
    remoteStatus: { type: 'string', enum: ['pending', 'uploading', 'uploaded', 'failed', 'remote'] },
    remoteFileId: nullableString,
    createdAt: { type: 'string' }
  },
  required: [
    'id', 'receiptId', 'mimeType', 'width', 'height', 'sizeBytes', 'remoteStatus',
    'remoteFileId', 'createdAt'
  ],
  indexes: ['receiptId', 'remoteStatus']
}

export const jobSchema = {
  title: 'local job',
  version: 2,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    type: { type: 'string', enum: ['image-upload', 'image-download', 'ai-insight'] },
    receiptId: nullableString,
    status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
    attempts: { type: 'integer', minimum: 0 },
    nextAttemptAt: nullableString,
    lastErrorCode: nullableString,
    lastErrorMessage: nullableString,
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  },
  required: [
    'id', 'type', 'receiptId', 'status', 'attempts', 'nextAttemptAt', 'lastErrorCode',
    'lastErrorMessage', 'createdAt', 'updatedAt'
  ],
  indexes: ['status', 'type', 'updatedAt']
}

export const settingSchema = {
  title: 'local settings',
  version: 4,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 20 },
    locale: { type: 'string' },
    languagePreference: { type: 'string', enum: ['auto', 'en', 'it', 'de', 'es', 'fr'] },
    themePreference: { type: 'string', enum: ['auto', 'light', 'dark'] },
    defaultCurrency: { type: 'string', minLength: 3, maxLength: 3 },
    selectedAiProvider: nullableString,
    insightMinimumPercent: { type: 'number', minimum: 0 },
    insightMinimumMinor: { type: 'integer', minimum: 0 },
    aiSummary: { type: ['object', 'null'] }
  },
  required: [
    'id', 'locale', 'languagePreference', 'themePreference', 'defaultCurrency', 'selectedAiProvider',
    'insightMinimumPercent', 'insightMinimumMinor', 'aiSummary'
  ]
}

export const auditEventSchema = {
  title: 'local audit event',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    type: { type: 'string', enum: ['sync-conflict'] },
    collection: { type: 'string' },
    documentId: { type: 'string' },
    resolvedAt: { type: 'string' },
    winnerDevice: { type: 'string' }
  },
  required: ['id', 'type', 'collection', 'documentId', 'resolvedAt', 'winnerDevice'],
  indexes: ['resolvedAt']
}

const migrate = (document) => document
const migrateSettingsV2 = (document) => {
  const migrated = { ...document }
  delete migrated.syncEnabled
  return migrated
}
const migrateSettingsV3 = (document) => {
  const migrated = { ...document }
  delete migrated.syncToken
  return migrated
}
const migrateSettingsV4 = (document) => ({
  ...document,
  languagePreference: 'auto',
  themePreference: 'auto'
})
const migrateJobV2 = (document) => document.type === 'ai-extraction' ? null : document

export const collections = {
  receipts: { schema: receiptSchema, migrationStrategies: { 1: migrate } },
  receipt_items: { schema: receiptItemSchema, migrationStrategies: { 1: migrate } },
  images: { schema: imageSchema, migrationStrategies: { 1: migrate } },
  jobs: { schema: jobSchema, migrationStrategies: { 1: migrate, 2: migrateJobV2 } },
  settings: {
    schema: settingSchema,
    migrationStrategies: { 1: migrate, 2: migrateSettingsV2, 3: migrateSettingsV3, 4: migrateSettingsV4 }
  },
  audit_events: { schema: auditEventSchema, migrationStrategies: { 1: migrate } }
}
