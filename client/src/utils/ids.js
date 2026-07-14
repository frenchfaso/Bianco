const DEVICE_KEY = 'bianco-device-id'

export function createId() {
  return crypto.randomUUID()
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = createId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function nowIso() {
  return new Date().toISOString()
}

export function todayLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}
