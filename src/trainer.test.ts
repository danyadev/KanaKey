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
    const normalized = normalizeSettings({ batchSize: -5, targetAccuracy: 2, smoothingWindow: 0 })

    expect(normalized.batchSize).toBe(1)
    expect(normalized.targetAccuracy).toBe(1)
    expect(normalized.smoothingWindow).toBe(1)
  })

  it('checks unlocked words by visible kana units', () => {
    expect(isWordUnlocked(words[0], new Set(['あ', 'い']))).toBe(true)
    expect(isWordUnlocked(words[3], new Set(['あ', 'い', 'う', 'え', 'お']))).toBe(false)
  })

  it('generates target words first and falls back to unlocked words when needed', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, settings, progress, fixedRandom)

    expect(batch.words).toHaveLength(3)
    expect(batch.words.filter((word) => word.kana.includes('あ'))).toHaveLength(2)
    expect(batch.words.every((word) => isWordUnlocked(word, new Set(['あ', 'い', 'う', 'え', 'お'])))).toBe(true)
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

  it('updates only kana that appeared in the batch', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, settings, progress, fixedRandom).words
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 2_000)
    const next = applyEvaluationToProgress(progress, settings, evaluation, batch, 123)

    expect(next.kanaStatsByMode.hiragana['あ'].attempts).toBe(1)
    expect(next.kanaStatsByMode.hiragana['い'].attempts).toBeGreaterThanOrEqual(1)
    expect(next.kanaStatsByMode.hiragana['か'].attempts).toBe(0)
  })
})
