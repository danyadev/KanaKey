import type { PracticeSettings, ProgressState } from './types'
import { DEFAULT_SETTINGS, ensureProgress, normalizeSettings, STORAGE_VERSION } from './trainer'

const SETTINGS_KEY = `kanakey:v${STORAGE_VERSION}:settings`
const PROGRESS_KEY = `kanakey:v${STORAGE_VERSION}:progress`
const LEGACY_SETTINGS_KEYS = ['kanakey:v1:settings']
const LEGACY_PROGRESS_KEYS = ['kanakey:v1:progress']

export function loadSettings(): PracticeSettings {
  return normalizeSettings(readFirstJson<Partial<PracticeSettings>>([SETTINGS_KEY, ...LEGACY_SETTINGS_KEYS]) ?? DEFAULT_SETTINGS)
}

export function saveSettings(settings: PracticeSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
}

export function loadProgress(settings: PracticeSettings): ProgressState {
  return ensureProgress(readFirstJson<ProgressState>([PROGRESS_KEY, ...LEGACY_PROGRESS_KEYS]), settings)
}

export function saveProgress(progress: ProgressState): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

export function clearProgress(): void {
  localStorage.removeItem(PROGRESS_KEY)
  for (const key of LEGACY_PROGRESS_KEYS) localStorage.removeItem(key)
}

function readFirstJson<T>(keys: string[]): T | null {
  for (const key of keys) {
    const value = readJson<T>(key)
    if (value) return value
  }
  return null
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}
