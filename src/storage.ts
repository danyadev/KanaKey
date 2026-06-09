import type { PracticeSettings, ProgressState } from './types'
import { DEFAULT_SETTINGS, ensureProgress, normalizeSettings, STORAGE_VERSION } from './trainer'

const SETTINGS_KEY = `kanakey:v${STORAGE_VERSION}:settings`
const PROGRESS_KEY = `kanakey:v${STORAGE_VERSION}:progress`

export function loadSettings(): PracticeSettings {
  return normalizeSettings(readJson<Partial<PracticeSettings>>(SETTINGS_KEY) ?? DEFAULT_SETTINGS)
}

export function saveSettings(settings: PracticeSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
}

export function loadProgress(settings: PracticeSettings): ProgressState {
  return ensureProgress(readJson<ProgressState>(PROGRESS_KEY), settings)
}

export function saveProgress(progress: ProgressState): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

export function clearProgress(): void {
  localStorage.removeItem(PROGRESS_KEY)
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}
