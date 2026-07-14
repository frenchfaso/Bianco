import { addRxPlugin, createRxDatabase } from 'rxdb'
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { collections } from './schemas.js'
import { createConflictHandler } from '../sync/conflicts.js'

addRxPlugin(RxDBAttachmentsPlugin)
addRxPlugin(RxDBMigrationSchemaPlugin)

let databasePromise

export function getDatabase() {
  if (!databasePromise) databasePromise = createDatabase()
  return databasePromise
}

async function createDatabase() {
  const db = await createRxDatabase({
    name: 'bianco',
    storage: getRxStorageDexie(),
    multiInstance: true,
    closeDuplicates: true
  })
  await db.addCollections({
    ...collections,
    receipts: {
      ...collections.receipts,
      conflictHandler: createConflictHandler('receipts', () => db.audit_events)
    },
    receipt_items: {
      ...collections.receipt_items,
      conflictHandler: createConflictHandler('receipt_items', () => db.audit_events)
    }
  })

  const existingSettings = await db.settings.findOne('singleton').exec()
  if (!existingSettings) {
    await db.settings.insert({
      id: 'singleton',
      locale: 'it-IT',
      defaultCurrency: 'EUR',
      syncEnabled: false,
      syncToken: null,
      selectedAiProvider: null,
      insightMinimumPercent: 20,
      insightMinimumMinor: 1000,
      aiSummary: null
    })
  }
  return db
}

export async function deleteLocalDatabase() {
  const db = await getDatabase()
  await db.remove()
  databasePromise = null
}
