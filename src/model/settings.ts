import { getKanaOrder } from './kana'
import type { PracticeMode } from './modes'

export type PracticeSettings = {
  mode: PracticeMode
  batchSize: number
  targetKpm: number
  targetAccuracy: number
  smoothingAppearanceCount: number
  dailyPracticeMinutesGoal: number
  showWordSeparator: boolean
}

export const STORAGE_VERSION = 2
export const INITIAL_UNLOCKED_COUNT = 5
export const REQUIRED_APPEARANCE_COUNT = 20

export const DEFAULT_SETTINGS: PracticeSettings = {
  mode: 'hiragana',
  batchSize: 10,
  targetKpm: 60,
  targetAccuracy: 0.95,
  smoothingAppearanceCount: 20,
  dailyPracticeMinutesGoal: 10,
  showWordSeparator: true,
}

export function normalizeSettings(input: Partial<PracticeSettings> = {}): PracticeSettings {
  const mode = isPracticeMode(input.mode) ? input.mode : DEFAULT_SETTINGS.mode

  return {
    mode,
    batchSize: clampInteger(input.batchSize ?? DEFAULT_SETTINGS.batchSize, 1, 50),
    targetKpm: clampInteger(input.targetKpm ?? DEFAULT_SETTINGS.targetKpm, 1, 400),
    targetAccuracy: clampNumber(input.targetAccuracy ?? DEFAULT_SETTINGS.targetAccuracy, 0.5, 1),
    smoothingAppearanceCount: clampInteger(
      input.smoothingAppearanceCount ?? DEFAULT_SETTINGS.smoothingAppearanceCount,
      1,
      500,
    ),
    dailyPracticeMinutesGoal: clampInteger(
      input.dailyPracticeMinutesGoal ?? DEFAULT_SETTINGS.dailyPracticeMinutesGoal,
      1,
      240,
    ),
    showWordSeparator: typeof input.showWordSeparator === 'boolean'
      ? input.showWordSeparator
      : DEFAULT_SETTINGS.showWordSeparator,
  }
}

export function isPracticeMode(value: unknown): value is PracticeMode {
  return value === 'hiragana' || value === 'katakana' || value === 'mixed'
}

export function settingsAffectPassState(
  previous: PracticeSettings,
  next: PracticeSettings,
): boolean {
  return previous.targetKpm !== next.targetKpm
    || previous.targetAccuracy !== next.targetAccuracy
    || previous.smoothingAppearanceCount !== next.smoothingAppearanceCount
}

export function maxInitialUnlockCount(mode: PracticeMode): number {
  return Math.min(INITIAL_UNLOCKED_COUNT, getKanaOrder(mode).length)
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
