import { describe, expect, it } from 'vitest'

import type { PracticeSettings, WordEntry } from './types'
import {
  applyEvaluationToProgress,
  chooseNextTargetKana,
  createEmptyKanaStats,
  createInitialProgress,
  DEFAULT_SETTINGS,
  evaluateBatch,
  expectedText,
  generateBatch,
  isWordUnlocked,
  normalizeSettings,
  normalizeTypedText,
  refreshProgressPassFlags,
  refreshSmoothedStats,
} from './trainer'

const settings: PracticeSettings = {
  ...DEFAULT_SETTINGS,
  batchSize: 3,
  targetKpm: 60,
  targetAccuracy: 0.9,
  minAttemptsPerKana: 3,
  smoothingWindow: 5,
}

const words: WordEntry[] = [
  { id: 'ai', kanji: null, kana: 'あい', kanaScript: 'hiragana' },
  { id: 'ao', kanji: null, kana: 'あお', kanaScript: 'hiragana' },
  { id: 'ue', kanji: '上', kana: 'うえ', kanaScript: 'hiragana' },
  { id: 'asa', kanji: '朝', kana: 'あさ', kanaScript: 'hiragana' },
  { id: 'anime', kanji: null, kana: 'アニメ', kanaScript: 'katakana' },
]

function fixedRandom() {
  return 0
}

describe('trainer logic', () => {
  it('normalizes persisted settings into safe bounds', () => {
    const normalized = normalizeSettings({
      batchSize: -5,
      targetAccuracy: 2,
      smoothingWindow: 0,
      mode: 'invalid',
      doubleWords: 'true',
      shuffleDoubledWords: 1,
    } as unknown as Partial<PracticeSettings>)

    expect(normalized.batchSize).toBe(1)
    expect(normalized.targetAccuracy).toBe(1)
    expect(normalized.smoothingWindow).toBe(1)
    expect(normalized.mode).toBe('hiragana')
    expect(normalized.doubleWords).toBe(false)
    expect(normalized.shuffleDoubledWords).toBe(false)
  })

  it('checks unlocked words by visible kana units', () => {
    expect(isWordUnlocked(words[0], new Set(['あ', 'い']))).toBe(true)
    expect(isWordUnlocked(words[3], new Set(['あ', 'い', 'う', 'え', 'お']))).toBe(false)
  })

  it('generates real target words first and uses synthetic target chunks when needed', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, settings, progress, fixedRandom)

    expect(batch.words).toHaveLength(3)
    expect(batch.words.every((word) => word.kana.includes('あ'))).toBe(true)
    expect(batch.words.filter((word) => word.synthetic)).toHaveLength(1)
    expect(batch.words.every((word) => isWordUnlocked(word, new Set(['あ', 'い', 'う', 'え', 'お'])))).toBe(true)
  })

  it('generates synthetic chunks when a newly unlocked target has no real words', () => {
    const progress = createInitialProgress({ ...settings, initialUnlockedCount: 6 })
    progress.unlockedCountByMode.hiragana = 6
    progress.currentTargetKanaByMode.hiragana = 'か'

    const batch = generateBatch(words.filter((word) => !word.kana.includes('か')), settings, progress, fixedRandom)

    expect(batch.words).toHaveLength(3)
    expect(batch.words.every((word) => word.synthetic)).toBe(true)
    expect(batch.words.every((word) => word.kana.includes('か'))).toBe(true)
    expect(batch.words.every((word) => isWordUnlocked(word, new Set(['あ', 'い', 'う', 'え', 'お', 'か'])))).toBe(true)
  })

  it('supports doubled words without shuffle', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, { ...settings, batchSize: 2, doubleWords: true }, progress, fixedRandom)

    expect(batch.words).toHaveLength(4)
    expect(batch.words[0].kana).toBe(batch.words[1].kana)
    expect(batch.words[2].kana).toBe(batch.words[3].kana)
  })

  it('normalizes normal spaces and full-width spaces equivalently', () => {
    expect(normalizeTypedText(' あい   あお　うえ ')).toBe('あい　あお　うえ')
  })

  it('evaluates kana per minute and accuracy from final text', () => {
    const evaluation = evaluateBatch('あい　あお', 'あい あえ', 60_000)

    expect(evaluation.totalExpectedKana).toBe(4)
    expect(evaluation.correctKanaCount).toBe(3)
    expect(evaluation.kpm).toBe(3)
    expect(evaluation.accuracy).toBe(0.75)
    expect(evaluation.perKana['お']).toEqual({ exposures: 1, correct: 0, incorrect: 1 })
  })

  it('requires smoothed minimum attempts before passing a kana', () => {
    const stats = createEmptyKanaStats('あ')
    stats.attempts = 2
    stats.recentAttempts = [
      { timestamp: 1, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
      { timestamp: 2, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
    ]

    refreshSmoothedStats(stats, settings)
    expect(stats.passed).toBe(false)

    stats.attempts = 3
    stats.recentAttempts.push({ timestamp: 3, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 })
    refreshSmoothedStats(stats, settings)
    expect(stats.passed).toBe(true)
  })

  it('scans old unlocked kana before unlocking the next kana', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStatsByMode.hiragana['あ'].attempts = 3
    progress.kanaStatsByMode.hiragana['あ'].recentAttempts = [
      { timestamp: 1, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
      { timestamp: 2, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
      { timestamp: 3, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
    ]
    refreshSmoothedStats(progress.kanaStatsByMode.hiragana['あ'], settings)

    expect(chooseNextTargetKana(progress, settings)).toBe('い')
  })

  it('unlocks next kana when all unlocked kana pass', () => {
    const progress = createInitialProgress(settings)
    for (const kana of ['あ', 'い', 'う', 'え', 'お']) {
      const kanaStats = progress.kanaStatsByMode.hiragana[kana]
      kanaStats.attempts = 3
      kanaStats.recentAttempts = [
        { timestamp: 1, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
        { timestamp: 2, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
        { timestamp: 3, exposures: 2, correct: 2, incorrect: 0, kpm: 100, accuracy: 1 },
      ]
      refreshSmoothedStats(kanaStats, settings)
    }

    expect(chooseNextTargetKana(progress, settings)).toBe('か')
    expect(progress.unlockedCountByMode.hiragana).toBe(6)
  })

  it('can progress past a kana that only has synthetic practice rounds', () => {
    const syntheticSettings = { ...settings, batchSize: 3, initialUnlockedCount: 6 }
    let progress = createInitialProgress(syntheticSettings)
    progress.unlockedCountByMode.hiragana = 6
    progress.currentTargetKanaByMode.hiragana = 'か'

    for (const kana of ['あ', 'い', 'う', 'え', 'お']) {
      markPassed(progress.kanaStatsByMode.hiragana[kana], syntheticSettings)
    }

    for (let round = 0; round < syntheticSettings.minAttemptsPerKana; round += 1) {
      const batch = generateBatch(words.filter((word) => !word.kana.includes('か')), syntheticSettings, progress, fixedRandom).words
      expect(batch.some((word) => word.synthetic && word.kana.includes('か'))).toBe(true)
      const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 1_000)
      progress = applyEvaluationToProgress(progress, syntheticSettings, evaluation, batch, round + 1)
    }

    expect(progress.kanaStatsByMode.hiragana['か'].passed).toBe(true)
    expect(progress.currentTargetKanaByMode.hiragana).toBe('き')
    expect(progress.unlockedCountByMode.hiragana).toBe(7)
  })

  it('updates only kana that appeared in the batch', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, settings, progress, fixedRandom).words
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 2_000)
    const next = applyEvaluationToProgress(progress, settings, evaluation, batch, 123)

    expect(next.kanaStatsByMode.hiragana['あ'].attempts).toBe(1)
    expect(next.kanaStatsByMode.hiragana['い'].attempts).toBeGreaterThanOrEqual(1)
    expect(next.kanaStatsByMode.hiragana['か'].attempts).toBe(0)
  })

  it('recomputes pass flags for new target settings without mutating counts or history', () => {
    const progress = createInitialProgress(settings)
    const stats = progress.kanaStatsByMode.hiragana['あ']
    markPassed(stats, settings)
    stats.exposures = 12
    progress.sessionHistory.push({
      timestamp: 1,
      mode: 'hiragana',
      targetKana: 'あ',
      words: ['あい'],
      elapsedMs: 1000,
      kpm: 120,
      accuracy: 1,
    })

    const next = refreshProgressPassFlags(progress, { ...settings, targetKpm: 500 })

    expect(progress.kanaStatsByMode.hiragana['あ'].passed).toBe(true)
    expect(next.kanaStatsByMode.hiragana['あ'].passed).toBe(false)
    expect(next.kanaStatsByMode.hiragana['あ'].exposures).toBe(12)
    expect(next.kanaStatsByMode.hiragana['あ'].attempts).toBe(settings.minAttemptsPerKana)
    expect(next.sessionHistory).toEqual(progress.sessionHistory)
  })
})

function markPassed(stats: ReturnType<typeof createEmptyKanaStats>, practiceSettings: PracticeSettings) {
  stats.attempts = practiceSettings.minAttemptsPerKana
  stats.recentAttempts = Array.from({ length: practiceSettings.minAttemptsPerKana }, (_, index) => ({
    timestamp: index + 1,
    exposures: 2,
    correct: 2,
    incorrect: 0,
    kpm: practiceSettings.targetKpm + 20,
    accuracy: 1,
  }))
  refreshSmoothedStats(stats, practiceSettings)
}
