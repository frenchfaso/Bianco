import { generatedInsightsSchema } from './ai/schemas.js'
import { downloadRemoteImage, recoverInterruptedJobs, retryReceiptJobs, runPendingJobs } from './ai/jobs.js'
import { getDatabase, deleteLocalDatabase } from './db/index.js'
import { processReceiptImage } from './images/process.js'
import { getImageUrl } from './images/repository.js'
import { computeInsights, insightSnapshot } from './insights/compute.js'
import { categories, categoryLabel, categoryMap } from './stores/categories.js'
import {
  createCapturedReceipt,
  createManualReceipt,
  deleteReceipt,
  getReceiptDetail,
  observeItems,
  observeReceipts,
  replaceReceiptItems,
  updateReceipt
} from './stores/receipts.js'
import { apiFetch } from './sync/api.js'
import { resyncNow, startReplication } from './sync/replication.js'
import { downloadBackup } from './utils/backup.js'
import { createId } from './utils/ids.js'

const emptyInsights = computeInsights([], [])
let database = null
let chartConstructorPromise = null

function getChartConstructor() {
  chartConstructorPromise ||= import('chart.js/auto').then((module) => module.default)
  return chartConstructorPromise
}

function toMinor(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : null
}

function toEuro(value) {
  return value == null ? '' : (value / 100).toFixed(2)
}

async function datasetHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function biancoApp() {
  return {
    loading: true,
    busy: false,
    view: 'dashboard',
    online: navigator.onLine,
    syncStatus: 'disabled',
    receipts: [],
    items: [],
    jobs: [],
    insights: emptyInsights,
    categories,
    providers: [],
    chart: null,
    settings: {
      syncEnabled: false,
      syncToken: null,
      selectedAiProvider: null,
      locale: 'it-IT',
      defaultCurrency: 'EUR',
      insightMinimumPercent: 20,
      insightMinimumMinor: 1000,
      aiSummary: null
    },
    settingsForm: {
      syncEnabled: false,
      syncToken: '',
      selectedAiProvider: '',
      insightMinimumPercent: 20,
      insightMinimumEuro: 10
    },
    filters: { search: '', category: '', period: 'all' },
    capture: { file: null, previewUrl: null, processing: false },
    detail: { open: false, id: null, form: {}, items: [], imageUrl: null, fullLoaded: false },
    toast: { message: '', type: 'success' },
    toastTimer: null,
    includeImagesInBackup: false,
    storageUsage: '—',
    installPrompt: null,
    updateAvailable: false,

    async init() {
      try {
        database = await getDatabase()
        const settingsDocument = await database.settings.findOne('singleton').exec()
        this.setSettings(settingsDocument.toJSON())
        observeReceipts(database, (receipts) => {
          this.receipts = receipts
          this.recompute()
        })
        observeItems(database, (items) => {
          this.items = items
          this.recompute()
        })
        database.jobs.find().$.subscribe((documents) => {
          this.jobs = documents.map((document) => document.toJSON())
        })
        database.settings.findOne('singleton').$.subscribe((document) => {
          if (document) this.setSettings(document.toJSON())
        })
        await recoverInterruptedJobs(database)
        await startReplication(database, this.settings, (status) => { this.syncStatus = status })
        await this.refreshProviders(false)
        void this.runJobs()
        void this.updateStorageUsage()
      } catch (error) {
        this.notify(`Apertura database non riuscita: ${error.message}`, 'error')
      } finally {
        this.loading = false
      }
      window.addEventListener('online', () => {
        this.online = true
        void this.runJobs()
      })
      window.addEventListener('offline', () => { this.online = false })
      window.addEventListener('bianco-update', () => { this.updateAvailable = true })
      window.addEventListener('bianco-offline-ready', () => this.notify('Bianco è pronto per l’uso offline.'))
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        this.installPrompt = event
      })
      window.setInterval(() => void this.runJobs(), 30_000)
    },

    setSettings(settings) {
      this.settings = settings
      this.settingsForm = {
        syncEnabled: settings.syncEnabled,
        syncToken: settings.syncToken || '',
        selectedAiProvider: settings.selectedAiProvider || '',
        insightMinimumPercent: settings.insightMinimumPercent,
        insightMinimumEuro: settings.insightMinimumMinor / 100
      }
      this.recompute()
    },

    recompute() {
      this.insights = computeInsights(this.receipts, this.items, {
        minimumMinor: this.settings.insightMinimumMinor,
        minimumPercent: this.settings.insightMinimumPercent
      })
      this.$nextTick?.(() => this.renderChart())
    },

    async renderChart() {
      const canvas = this.$refs?.categoryChart
      if (!canvas || this.view !== 'dashboard') return
      this.chart?.destroy()
      const entries = this.insights.categories.filter((entry) => entry.total > 0)
      if (!entries.length) return
      const Chart = await getChartConstructor()
      this.chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: entries.map((entry) => categoryLabel(entry.id)),
          datasets: [{
            data: entries.map((entry) => entry.total / 100),
            backgroundColor: entries.map((entry) => categoryMap[entry.id]?.color || '#64748b'),
            borderWidth: 0,
            spacing: 2
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => this.money(context.raw * 100) } } }
        }
      })
    },

    get syncLabel() {
      return { syncing: 'Sincronizzo', idle: 'Online', error: 'Sync sospesa', disabled: 'Solo locale' }[this.syncStatus] || 'Online'
    },

    get pendingCount() {
      return this.jobs.filter((job) => job.status === 'pending' || job.status === 'processing' || job.status === 'failed').length
    },

    get filteredReceipts() {
      const query = this.filters.search.trim().toLocaleLowerCase('it')
      const matchingReceiptIds = new Set(this.items.filter((item) =>
        `${item.normalizedName} ${item.rawName}`.toLocaleLowerCase('it').includes(query)
      ).map((item) => item.receiptId))
      const now = new Date()
      return this.receipts.filter((receipt) => {
        if (this.filters.category && receipt.categoryId !== this.filters.category) return false
        if (query) {
          const merchant = `${receipt.merchantNormalized || ''} ${receipt.merchantRaw || ''}`.toLocaleLowerCase('it')
          if (!merchant.includes(query) && !matchingReceiptIds.has(receipt.id)) return false
        }
        if (this.filters.period !== 'all' && receipt.transactionDate) {
          const date = new Date(`${receipt.transactionDate}T12:00:00`)
          if (this.filters.period === 'month' && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false
          const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          if (this.filters.period === 'previous' && (date.getMonth() !== previous.getMonth() || date.getFullYear() !== previous.getFullYear())) return false
          if (this.filters.period === 'year' && date.getFullYear() !== now.getFullYear()) return false
        }
        return true
      })
    },

    previewFile(event) {
      const [file] = event.target.files || []
      if (!file) return
      if (!file.type.startsWith('image/')) {
        this.notify('Scegli un file immagine.', 'error')
        return
      }
      this.resetCapture()
      this.capture.file = file
      this.capture.previewUrl = URL.createObjectURL(file)
      event.target.value = ''
    },

    resetCapture() {
      if (this.capture.previewUrl) URL.revokeObjectURL(this.capture.previewUrl)
      this.capture = { file: null, previewUrl: null, processing: false }
    },

    async saveCapture() {
      if (!this.capture.file || this.capture.processing) return
      this.capture.processing = true
      try {
        const processed = await processReceiptImage(this.capture.file)
        const receiptId = await createCapturedReceipt(database, processed, this.settings.defaultCurrency)
        this.resetCapture()
        this.notify('Scontrino salvato sul dispositivo.')
        this.view = 'archive'
        await this.openReceipt(receiptId)
        void this.runJobs()
      } catch (error) {
        this.capture.processing = false
        this.notify(`Salvataggio non riuscito: ${error.message}`, 'error')
      }
    },

    async newManual() {
      const receiptId = await createManualReceipt(database, this.settings.defaultCurrency)
      this.view = 'archive'
      await this.openReceipt(receiptId)
    },

    async openReceipt(receiptId) {
      const result = await getReceiptDetail(database, receiptId)
      if (!result) return
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      const receipt = result.receipt
      this.detail = {
        open: true,
        id: receiptId,
        form: {
          ...receipt,
          merchantNormalized: receipt.merchantNormalized || '',
          transactionDate: receipt.transactionDate || '',
          totalEuro: toEuro(receipt.totalMinor)
        },
        items: result.items.map((item) => ({
          ...item,
          quantity: item.quantity ?? '',
          unitPriceEuro: toEuro(item.unitPriceMinor),
          totalPriceEuro: toEuro(item.totalPriceMinor)
        })),
        imageUrl: await getImageUrl(database, receipt.imageHash, 'thumbnail'),
        fullLoaded: false
      }
      if (!this.detail.imageUrl && receipt.imageHash && this.settings.syncToken && this.online) {
        try {
          const blob = await downloadRemoteImage(database, receipt, this.settings.syncToken, 'thumbnail')
          this.detail.imageUrl = URL.createObjectURL(blob)
        } catch {
          // Remote image availability is optional while offline or before upload.
        }
      }
    },

    closeDetail() {
      if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
      this.detail.open = false
      this.detail.imageUrl = null
    },

    async loadFullImage() {
      if (this.detail.fullLoaded) return
      const receipt = this.detail.form
      let url = await getImageUrl(database, receipt.imageHash, 'full')
      if (!url && receipt.imageHash && this.settings.syncToken && this.online) {
        try {
          const blob = await downloadRemoteImage(database, receipt, this.settings.syncToken, 'full')
          url = URL.createObjectURL(blob)
        } catch (error) {
          this.notify(`Immagine non disponibile: ${error.message}`, 'error')
        }
      }
      if (url) {
        if (this.detail.imageUrl) URL.revokeObjectURL(this.detail.imageUrl)
        this.detail.imageUrl = url
        this.detail.fullLoaded = true
      }
    },

    addItem() {
      this.detail.items.push({
        id: createId(), rawName: '', normalizedName: '', quantity: '', unitPriceEuro: '',
        totalPriceEuro: '', categoryId: this.detail.form.categoryId || 'other', confidence: null,
        userEdited: true
      })
    },

    removeItem(index) {
      this.detail.items.splice(index, 1)
    },

    async saveDetail(confirm) {
      this.busy = true
      try {
        const form = this.detail.form
        await updateReceipt(database, this.detail.id, {
          merchantRaw: form.merchantNormalized || null,
          merchantNormalized: form.merchantNormalized || null,
          transactionDate: form.transactionDate || null,
          totalMinor: toMinor(form.totalEuro),
          currency: (form.currency || 'EUR').toUpperCase(),
          categoryId: form.categoryId || 'other'
        }, confirm)
        await replaceReceiptItems(database, this.detail.id, this.detail.items.map((item) => ({
          ...item,
          quantity: item.quantity === '' ? null : Number(item.quantity),
          unitPriceMinor: toMinor(item.unitPriceEuro),
          totalPriceMinor: toMinor(item.totalPriceEuro)
        })), true)
        this.notify(confirm ? 'Scontrino confermato.' : 'Modifiche salvate.')
        await this.openReceipt(this.detail.id)
      } catch (error) {
        this.notify(`Salvataggio non riuscito: ${error.message}`, 'error')
      } finally {
        this.busy = false
      }
    },

    async removeCurrentReceipt() {
      if (!window.confirm('Eliminare questo scontrino e la sua immagine locale?')) return
      await deleteReceipt(database, this.detail.id)
      this.closeDetail()
      this.notify('Scontrino eliminato.')
    },

    async retryAi() {
      await retryReceiptJobs(database, this.detail.id)
      this.notify('Elaborazione rimessa in coda.')
      this.closeDetail()
      void this.runJobs()
    },

    async runJobs() {
      await runPendingJobs(database, this.settings, (event) => {
        if (event.type === 'job-completed' && event.jobType === 'ai-extraction') this.notify('Analisi completata: controlla il risultato.')
      }, this.providers)
    },

    async saveSettings() {
      this.busy = true
      try {
        const document = await database.settings.findOne('singleton').exec()
        const updated = await document.incrementalPatch({
          syncEnabled: Boolean(this.settingsForm.syncEnabled),
          syncToken: this.settingsForm.syncToken.trim() || null,
          selectedAiProvider: this.settingsForm.selectedAiProvider || null,
          insightMinimumPercent: Number(this.settingsForm.insightMinimumPercent) || 0,
          insightMinimumMinor: Math.round((Number(this.settingsForm.insightMinimumEuro) || 0) * 100)
        })
        this.setSettings(updated.toJSON())
        await startReplication(database, this.settings, (status) => { this.syncStatus = status })
        await this.refreshProviders(false)
        void this.runJobs()
        this.notify('Impostazioni salvate sul dispositivo.')
      } catch (error) {
        this.notify(`Configurazione non valida: ${error.message}`, 'error')
      } finally {
        this.busy = false
      }
    },

    async refreshProviders(showErrors = true) {
      const token = this.settingsForm.syncToken || this.settings.syncToken
      if (!token || !this.online) return
      try {
        const response = await apiFetch('/api/ai/providers', token)
        this.providers = (await response.json()).providers
      } catch (error) {
        this.providers = []
        if (showErrors) this.notify(`Backend non raggiungibile: ${error.message}`, 'error')
      }
    },

    syncNow() {
      resyncNow()
      void this.runJobs()
      this.notify('Sincronizzazione richiesta.')
    },

    async generateAiSummary() {
      this.busy = true
      try {
        const snapshot = insightSnapshot(this.insights)
        const query = this.settings.selectedAiProvider ? `?provider_id=${encodeURIComponent(this.settings.selectedAiProvider)}` : ''
        const response = await apiFetch(`/api/ai/insights${query}`, this.settings.syncToken, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        })
        const generated = generatedInsightsSchema.parse(await response.json())
        const document = await database.settings.findOne('singleton').exec()
        await document.incrementalPatch({ aiSummary: {
          ...generated,
          datasetHash: await datasetHash(snapshot),
          generatedAt: new Date().toISOString()
        } })
        this.notify('Sintesi salvata localmente.')
      } catch (error) {
        this.notify(`Sintesi non disponibile: ${error.message}`, 'error')
      } finally {
        this.busy = false
      }
    },

    async exportBackup() {
      this.busy = true
      try {
        await downloadBackup(database, this.includeImagesInBackup)
        this.notify('Backup JSON creato.')
      } catch (error) {
        this.notify(`Backup non riuscito: ${error.message}`, 'error')
      } finally {
        this.busy = false
      }
    },

    async wipeLocalData() {
      if (!window.confirm('Eliminare definitivamente tutti i dati di Bianco da questo dispositivo?')) return
      await deleteLocalDatabase()
      window.location.reload()
    },

    async updateStorageUsage() {
      if (!navigator.storage?.estimate) return
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      this.storageUsage = `${(usage / 1024 / 1024).toFixed(1)} MB di ${(quota / 1024 / 1024).toFixed(0)} MB`
    },

    async installApp() {
      if (!this.installPrompt) return
      await this.installPrompt.prompt()
      this.installPrompt = null
    },

    applyUpdate() {
      window.biancoApplyUpdate?.()
    },

    notify(message, type = 'success') {
      window.clearTimeout(this.toastTimer)
      this.toast = { message, type }
      this.toastTimer = window.setTimeout(() => { this.toast.message = '' }, 4500)
    },

    money(value, currency = 'EUR') {
      return new Intl.NumberFormat(this.settings.locale || 'it-IT', { style: 'currency', currency }).format((value || 0) / 100)
    },
    signedMoney(value) { return `${value > 0 ? '+' : ''}${this.money(value)}` },
    signedPercent(value) { return value == null ? '—' : `${value > 0 ? '+' : ''}${this.number(value)}%` },
    number(value) { return new Intl.NumberFormat(this.settings.locale || 'it-IT', { maximumFractionDigits: 1 }).format(value || 0) },
    date(value) { return value ? new Intl.DateTimeFormat(this.settings.locale || 'it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : 'Data da verificare' },
    categoryLabel,
    categoryColor(id) { return categoryMap[id]?.color || '#64748b' },
    statusLabel(status) { return { captured: 'Acquisito', queued: 'In coda', processing: 'Analisi', needs_review: 'Da controllare', confirmed: 'Confermato', failed: 'Non riuscito', manual: 'Manuale' }[status] || status },
    insightText(entry) {
      if (entry.type === 'category') return `La spesa per ${categoryLabel(entry.id).toLocaleLowerCase('it')} è ${entry.difference > 0 ? 'aumentata' : 'diminuita'} del ${this.number(Math.abs(entry.changePercent))}%.`
      if (entry.type === 'merchant') return `Hai speso ${this.money(Math.abs(entry.difference))} ${entry.difference > 0 ? 'in più' : 'in meno'} da ${entry.id}.`
      if (entry.type === 'frequency') return `${entry.id} è stato acquistato ${entry.frequency} volte.`
      return `Il prezzo di ${entry.id} è ${entry.difference > 0 ? 'aumentato' : 'diminuito'} del ${this.number(Math.abs(entry.changePercent))}%.`
    }
  }
}
