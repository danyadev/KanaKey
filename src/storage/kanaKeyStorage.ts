import { ensureProgress } from '../model/progress'
import type { ProgressState } from '../model/progress'
import {
  DEFAULT_SETTINGS,
  STORAGE_VERSION,
  normalizeSettings,
} from '../model/settings'
import type { PracticeSettings } from '../model/settings'

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const SETTINGS_KEY = `kanakey:v${STORAGE_VERSION}:settings`
const PROGRESS_KEY = `kanakey:v${STORAGE_VERSION}:progress`

export function createKanaKeyStorage(storage: KeyValueStorage) {
  return {
    loadSettings(): PracticeSettings {
      return normalizeSettings(readJson<Partial<PracticeSettings>>(storage, SETTINGS_KEY) ?? DEFAULT_SETTINGS)
    },

    saveSettings(settings: PracticeSettings): void {
      storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)))
    },

    loadProgress(settings: PracticeSettings): ProgressState {
      return ensureProgress(readJson<ProgressState>(storage, PROGRESS_KEY), settings)
    },

    saveProgress(progress: ProgressState): void {
      storage.setItem(PROGRESS_KEY, JSON.stringify(progress))
    },

    clearProgress(): void {
      storage.removeItem(PROGRESS_KEY)
    },
  }
}

export const browserKanaKeyStorage = createKanaKeyStorage(localStorage)

function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}
