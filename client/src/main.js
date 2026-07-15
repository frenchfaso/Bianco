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

const serviceWorkerUpdateIntervalMs = 60 * 60 * 1000

async function checkForServiceWorkerUpdate(swUrl, registration) {
  if (!registration || registration.installing || registration.waiting || !navigator.onLine) return
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
    window.dispatchEvent(new CustomEvent('bianco-update'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('bianco-offline-ready'))
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    window.setInterval(() => {
      void checkForServiceWorkerUpdate(swUrl, registration)
    }, serviceWorkerUpdateIntervalMs)
  }
})

window.biancoApplyUpdate = () => updateServiceWorker?.(true)
window.Alpine = Alpine
Alpine.data('biancoApp', biancoApp)
Alpine.start()
