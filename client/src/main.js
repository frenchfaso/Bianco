import '@picocss/pico/css/pico.min.css'
import './styles/app.css'
import Alpine from 'alpinejs'
import { registerSW } from 'virtual:pwa-register'
import { biancoApp } from './app.js'

let updateServiceWorker = null
updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('bianco-update'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('bianco-offline-ready'))
  }
})

window.biancoApplyUpdate = () => updateServiceWorker?.(true)
window.Alpine = Alpine
Alpine.data('biancoApp', biancoApp)
Alpine.start()
