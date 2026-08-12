import '@picocss/pico/css/pico.min.css'
import './styles/app.css'
import Alpine from 'alpinejs'
import { registerSW } from 'virtual:pwa-register'
import { biancoApp } from './app.js'
import { initI18n } from './i18n/index.js'

const savedLanguage = (() => {
  try {
    const value = window.localStorage.getItem('bianco-language')
    return ['auto', 'en', 'it', 'de', 'es', 'fr'].includes(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
})()

await initI18n({ preference: savedLanguage })

const serviceWorkerUpdateIntervalMs = 5 * 60 * 1000
let registeredServiceWorker = null
let registeredServiceWorkerUrl = ''

function announceServiceWorkerUpdate() {
  window.biancoUpdateAvailable = true
  window.dispatchEvent(new CustomEvent('bianco-update'))
}

async function checkForServiceWorkerUpdate(swUrl, registration) {
  if (!registration || !navigator.onLine) return
  if (registration.waiting) {
    announceServiceWorkerUpdate()
    return
  }
  if (registration.installing) return
  try {
    const response = await fetch(swUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' }
    })
    const expectedUrl = new URL(swUrl, window.location.href)
    const responseUrl = new URL(response.url)
    if (
      response.status === 200
      && responseUrl.origin === expectedUrl.origin
      && responseUrl.pathname === expectedUrl.pathname
    ) await registration.update()
  } catch {
    // Updates are opportunistic: offline and transient server failures are harmless.
  }
}

let updateServiceWorker = null
updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    announceServiceWorkerUpdate()
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('bianco-offline-ready'))
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    registeredServiceWorker = registration
    registeredServiceWorkerUrl = swUrl
    void checkForServiceWorkerUpdate(swUrl, registration)
    window.setInterval(() => {
      void checkForServiceWorkerUpdate(swUrl, registration)
    }, serviceWorkerUpdateIntervalMs)
  }
})

function checkRegisteredServiceWorker() {
  if (!registeredServiceWorker || !registeredServiceWorkerUrl) return
  void checkForServiceWorkerUpdate(registeredServiceWorkerUrl, registeredServiceWorker)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkRegisteredServiceWorker()
})
window.addEventListener('pageshow', checkRegisteredServiceWorker)
window.addEventListener('online', checkRegisteredServiceWorker)
window.addEventListener('focus', checkRegisteredServiceWorker)

window.biancoApplyUpdate = () => {
  window.biancoUpdateAvailable = false
  return updateServiceWorker?.(true)
}
window.Alpine = Alpine
Alpine.data('biancoApp', biancoApp)
Alpine.start()
