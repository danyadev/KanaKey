import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { evaluateBatch, expectedText } from './evaluation'
import { getKanaOrder } from './kana'
import {
  addPracticeTime,
  applyEvaluationToProgress,
  chooseNextTargetKana,
  createEmptyKanaStats,
  createInitialProgress,
  getSmoothingAttempts,
  normalizePracticeTime,
  refreshProgressPassFlags,
  refreshSmoothedStats,
} from './progress'
import type { KanaStats } from './progress'
import {
  DEFAULT_SETTINGS,
  INITIAL_UNLOCKED_COUNT,
  REQUIRED_APPEARANCE_COUNT,
  normalizeSettings,
} from './settings'
import type { PracticeSettings } from './settings'
import type { PracticeWord } from './words'
import { createKanaKeyStorage } from '../storage/kanaKeyStorage'

const settings: PracticeSettings = {
  ...DEFAULT_SETTINGS,
  batchSize: 3,
  targetKpm: 60,
  targetAccuracy: 0.9,
  smoothingAppearanceCount: 4,
}

describe('progress model', () => {
  it('normalizes settings without legacy option support', () => {
    const normalized = normalizeSettings({
      batchSize: -5,
      targetAccuracy: 2,
      requiredAppearanceCount: 7,
      minAttemptsPerKana: 7,
      mode: 'invalid',
      showWordSeparator: false,
    } as unknown as Partial<PracticeSettings>)

    expect(normalized.batchSize).toBe(1)
    expect(normalized.targetAccuracy).toBe(1)
    expect(normalized).not.toHaveProperty('requiredAppearanceCount')
    expect(normalized.mode).toBe('hiragana')
    expect(normalized.showWordSeparator).toBe(false)
  })

  it('ignores legacy storage keys', () => {
    installLocalStorage()
    localStorage.setItem('kanakey:settings', JSON.stringify({ batchSize: 42 }))

    const storage = createKanaKeyStorage(localStorage)

    expect(storage.loadSettings().batchSize).toBe(DEFAULT_SETTINGS.batchSize)
  })

  it('uses a fixed initial unlock count of 5', () => {
    const progress = createInitialProgress(settings)

    expect(progress.unlockedCountByMode.hiragana).toBe(INITIAL_UNLOCKED_COUNT)
    expect(progress.unlockedCountByMode.katakana).toBe(INITIAL_UNLOCKED_COUNT)
    expect(progress.unlockedCountByMode.mixed).toBe(INITIAL_UNLOCKED_COUNT)
  })

  it('updates proxy-wrapped progress without DataCloneError', () => {
    const progress = reactive(createInitialProgress(settings))
    const batch = [practiceWord('あい')]
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 30_000)

    expect(() => {
      applyEvaluationToProgress(progress, settings, evaluation, batch, 100)
    }).not.toThrow()
  })

  it('updates shared per-kana stats across modes and keeps scripts separate', () => {
    let progress = createInitialProgress(settings)
    const hiraganaEvaluation = evaluateBatch('あい', 'あい', 2_000)
    progress = applyEvaluationToProgress(
      progress,
      settings,
      hiraganaEvaluation,
      [practiceWord('あい')],
      100,
    )

    const mixedEvaluation = evaluateBatch('あ　ス', 'あ ス', 2_000)
    progress = applyEvaluationToProgress(
      progress,
      { ...settings, mode: 'mixed' },
      mixedEvaluation,
      [practiceWord('あ'), practiceWord('ス', 'katakana')],
      200,
    )

    expect(progress.kanaStats['あ'].appearances).toBe(2)
    expect(progress.kanaStats['い'].appearances).toBe(1)
    expect(progress.kanaStats['ス'].appearances).toBe(1)
    expect(progress.kanaStats['あ']).not.toBe(progress.kanaStats['ア'])
  })

  it('smooths with latest attempt records until they cover the appearance target', () => {
    const stats = createEmptyKanaStats('あ')
    stats.history = [
      attempt(1, 10, 0, 60_000),
      attempt(2, 2, 2, 60_000),
      attempt(3, 2, 2, 60_000),
    ]

    refreshSmoothedStats(stats, { ...settings, smoothingAppearanceCount: 4 })

    expect(getSmoothingAttempts(stats.history, 4).map((record) => record.attemptNumber)).toEqual([2, 3])
    expect(stats.smoothedAccuracy).toBe(1)
    expect(stats.smoothedKpm).toBe(2)
  })

  it('passes only after speed, accuracy, and required appearances are met', () => {
    const stats = createEmptyKanaStats('あ')
    stats.appearances = REQUIRED_APPEARANCE_COUNT - 1
    stats.correct = REQUIRED_APPEARANCE_COUNT - 1
    stats.history = [attempt(1, REQUIRED_APPEARANCE_COUNT - 1, REQUIRED_APPEARANCE_COUNT - 1, 1_000)]
    refreshSmoothedStats(stats, settings)
    expect(stats.passed).toBe(false)

    stats.appearances = REQUIRED_APPEARANCE_COUNT
    stats.correct = REQUIRED_APPEARANCE_COUNT
    stats.history.push(attempt(2, 1, 1, 1_000))
    refreshSmoothedStats(stats, settings)
    expect(stats.passed).toBe(true)
  })

  it('target selection does not mutate progress', () => {
    const progress = createInitialProgress(settings)
    const initialUnlocked = getKanaOrder('hiragana').slice(0, INITIAL_UNLOCKED_COUNT)
    for (const kana of initialUnlocked) {
      markPassed(progress.kanaStats[kana], settings)
    }

    expect(chooseNextTargetKana(progress, settings)).toBe(getKanaOrder('hiragana')[INITIAL_UNLOCKED_COUNT])
    expect(progress.unlockedCountByMode.hiragana).toBe(5)
    expect(progress.currentTargetKanaByMode.hiragana).toBe(getKanaOrder('hiragana')[0])
  })

  it('recomputes pass flags for changed goals in place', () => {
    const progress = createInitialProgress(settings)
    markPassed(progress.kanaStats['あ'], settings)
    progress.sessionHistory.push({
      timestamp: 1,
      mode: 'hiragana',
      targetKana: 'あ',
      words: ['あい'],
      elapsedMs: 1000,
      kpm: 120,
      accuracy: 1,
      wordTimings: [],
    })

    const next = refreshProgressPassFlags(reactive(progress), { ...settings, targetKpm: 2_000 })

    expect(progress.kanaStats['あ'].passed).toBe(false)
    expect(next.kanaStats['あ'].passed).toBe(false)
    expect(next.kanaStats['あ'].appearances).toBe(REQUIRED_APPEARANCE_COUNT)
    expect(next.kanaStats['あ'].history).toHaveLength(1)
    expect(next.sessionHistory).toEqual(progress.sessionHistory)
  })

  it('tracks practice time for today and overall', () => {
    const dayOne = new Date('2026-06-10T10:00:00').getTime()
    const dayTwo = new Date('2026-06-11T10:00:00').getTime()
    const initial = normalizePracticeTime(null, dayOne)
    const practiced = addPracticeTime(initial, 90_000, dayOne)
    const rolled = normalizePracticeTime(practiced, dayTwo)

    expect(practiced.todayMs).toBe(90_000)
    expect(practiced.totalMs).toBe(90_000)
    expect(rolled.todayMs).toBe(0)
    expect(rolled.totalMs).toBe(90_000)
  })

  it('adds evaluated batch time to persisted practice totals', () => {
    const progress = createInitialProgress(settings)
    const batch = [practiceWord('あい')]
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 30_000)
    const timestamp = new Date('2026-06-10T10:00:00').getTime()
    const next = applyEvaluationToProgress(progress, settings, evaluation, batch, timestamp)

    expect(next.practiceTime.todayMs).toBe(30_000)
    expect(next.practiceTime.totalMs).toBe(30_000)
  })
})

function practiceWord(kana: string, script: 'hiragana' | 'katakana' = 'hiragana'): PracticeWord {
  return {
    script,
    kana,
    meaning: kana,
    jlpt: 'N5',
    repetitionId: kana,
  }
}

function attempt(
  attemptNumber: number,
  appearanceCount: number,
  correctCount: number,
  allocatedMs: number,
) {
  return { timestamp: attemptNumber, attemptNumber, appearanceCount, correctCount, allocatedMs }
}

function markPassed(stats: KanaStats, practiceSettings: PracticeSettings) {
  stats.attempts = 1
  stats.appearances = REQUIRED_APPEARANCE_COUNT
  stats.correct = REQUIRED_APPEARANCE_COUNT
  stats.incorrect = 0
  stats.history = [attempt(1, REQUIRED_APPEARANCE_COUNT, REQUIRED_APPEARANCE_COUNT, 1_000)]
  refreshSmoothedStats(stats, practiceSettings)
}

function installLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  })
}
