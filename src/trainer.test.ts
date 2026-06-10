import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import seedWords from './words.json'
import type { KanaStats, PracticeSettings, WordEntry } from './types'
import {
  addPracticeTime,
  applyEvaluationToProgress,
  chooseNextTargetKana,
  createEmptyKanaStats,
  createInitialProgress,
  DEFAULT_SETTINGS,
  evaluateBatch,
  expectedText,
  generateBatch,
  getSmoothingAttempts,
  INITIAL_UNLOCKED_COUNT,
  REQUIRED_APPEARANCE_COUNT,
  isWordUnlocked,
  normalizePracticeTime,
  normalizeSettings,
  refreshProgressPassFlags,
  refreshSmoothedStats,
} from './trainer'
import { loadProgress, loadSettings } from './storage'

const settings: PracticeSettings = {
  ...DEFAULT_SETTINGS,
  batchSize: 3,
  targetKpm: 60,
  targetAccuracy: 0.9,
  smoothingAppearanceCount: 4,
}

const words: WordEntry[] = [
  { id: 'ai', kanji: null, kana: 'あい', kanaScript: 'hiragana' },
  { id: 'ao', kanji: null, kana: 'あお', kanaScript: 'hiragana' },
  { id: 'au', kanji: null, kana: 'あう', kanaScript: 'hiragana' },
  { id: 'asa', kanji: '朝', kana: 'あさ', kanaScript: 'hiragana' },
  { id: 'suki', kanji: null, kana: 'スキー', kanaScript: 'katakana' },
]

function fixedRandom() {
  return 0
}

function sequenceRandom(values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

describe('trainer logic', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  it('normalizes v2 settings into safe bounds without legacy field support', () => {
    const normalized = normalizeSettings({
      batchSize: -5,
      targetAccuracy: 2,
      smoothingWindow: 0,
      minAttemptsPerKana: 7,
      mode: 'invalid',
      showWordSeparator: false,
    } as unknown as Partial<PracticeSettings>)

    expect(normalized.batchSize).toBe(1)
    expect(normalized.targetAccuracy).toBe(1)
    expect(normalized.smoothingAppearanceCount).toBe(DEFAULT_SETTINGS.smoothingAppearanceCount)
    expect(normalized.mode).toBe('hiragana')
    expect(normalized.showWordSeparator).toBe(false)
  })

  it('uses a fixed initial unlock count of 5', () => {
    const progress = createInitialProgress(settings)

    expect(progress.unlockedCountByMode.hiragana).toBe(INITIAL_UNLOCKED_COUNT)
    expect(progress.unlockedCountByMode.katakana).toBe(INITIAL_UNLOCKED_COUNT)
    expect(progress.unlockedCountByMode.mixed).toBe(INITIAL_UNLOCKED_COUNT)
  })

  it('checks unlocked words by visible kana units', () => {
    expect(isWordUnlocked(words[0], new Set(['あ', 'い']))).toBe(true)
    expect(isWordUnlocked(words[3], new Set(['あ', 'い', 'う', 'え', 'お']))).toBe(false)
  })

  it('generates normal batches from eligible real words only', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words, settings, progress, fixedRandom)
    const unlocked = new Set(progress.currentTargetKanaByMode.hiragana === 'あ' ? ['あ', 'い', 'し', 'き', 'か'] : [])

    expect(batch.words).toHaveLength(3)
    expect(batch.words.every((word) => !word.synthetic)).toBe(true)
    expect(batch.words.every((word) => word.kana.includes('あ'))).toBe(true)
    expect(batch.words.every((word) => isWordUnlocked(word, unlocked))).toBe(true)
  })

  it('duplicates and shuffles eligible real words when requested batch size exceeds unique words', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch([words[0]], { ...settings, batchSize: 4 }, progress, fixedRandom)

    expect(batch.words).toHaveLength(4)
    expect(new Set(batch.words.map((word) => word.id))).toEqual(new Set(['ai']))
    expect(batch.words.every((word) => !word.synthetic && word.kana.includes('あ'))).toBe(true)
    expect(batch.warning).toContain('Duplicated 1 eligible real word')
  })

  it('returns an empty warning instead of fake chunks when no real word is eligible', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(words.filter((word) => !word.kana.includes('あ')), settings, progress, fixedRandom)

    expect(batch.words).toEqual([])
    expect(batch.warning).toContain('No eligible real words')
  })

  it('has initial katakana eligible real words', () => {
    const katakanaSettings = { ...settings, mode: 'katakana' as const }
    const progress = createInitialProgress(katakanaSettings)
    const batch = generateBatch(seedWords as WordEntry[], katakanaSettings, progress, fixedRandom)

    expect(progress.currentTargetKanaByMode.katakana).toBe('ス')
    expect(batch.words.length).toBeGreaterThan(0)
    expect(batch.words.every((word) => word.kana.includes('ス'))).toBe(true)
    expect(batch.words.every((word) => isWordUnlocked(word, new Set(['ス', 'キ', 'ー', 'バ', 'パ'])))).toBe(true)
  })

  it('chooses mixed mode words from hiragana or katakana pools randomly', () => {
    const mixedSettings = { ...settings, mode: 'mixed' as const, batchSize: 4 }
    const progress = createInitialProgress(mixedSettings)
    const batch = generateBatch(seedWords as WordEntry[], mixedSettings, progress, sequenceRandom([0, 0, 0.9, 0, 0, 0, 0.9, 0]))
    const scripts = new Set(batch.words.map((word) => word.kanaScript))

    expect(scripts).toEqual(new Set(['hiragana', 'katakana']))
    expect(batch.words.filter((word) => word.kanaScript === 'hiragana').every((word) => word.kana.includes('あ'))).toBe(true)
    expect(batch.words.filter((word) => word.kanaScript === 'katakana').every((word) => word.kana.includes('ス'))).toBe(true)
  })

  it('evaluates kana per minute, appearance counts, and allocated time', () => {
    const evaluation = evaluateBatch('あい　あお', 'あい あえ', 60_000)

    expect(evaluation.totalExpectedKana).toBe(4)
    expect(evaluation.correctKanaCount).toBe(3)
    expect(evaluation.kpm).toBe(3)
    expect(evaluation.accuracy).toBe(0.75)
    expect(evaluation.perKana['お']).toEqual({ appearanceCount: 1, correctCount: 0, allocatedMs: 15000 })
  })

  it('updates proxy-wrapped progress without DataCloneError', () => {
    const progress = reactive(createInitialProgress(settings))
    const batch = [practiceWord('ai', 'あい')]
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 30_000)

    expect(() => applyEvaluationToProgress(progress, settings, evaluation, batch, 100)).not.toThrow()
    const next = applyEvaluationToProgress(progress, settings, evaluation, batch, 100)
    expect(next).not.toBe(progress)
    expect(next.kanaStats['あ'].appearances).toBe(1)
  })

  it('updates shared per-kana stats across modes and keeps hiragana and katakana separate', () => {
    let progress = createInitialProgress(settings)
    const hiraganaEvaluation = evaluateBatch('あい', 'あい', 2_000)
    progress = applyEvaluationToProgress(progress, settings, hiraganaEvaluation, [practiceWord('ai', 'あい')], 100)

    const mixedEvaluation = evaluateBatch('あ　ス', 'あ ス', 2_000)
    progress = applyEvaluationToProgress(progress, { ...settings, mode: 'mixed' }, mixedEvaluation, [practiceWord('a', 'あ'), practiceWord('su', 'ス')], 200)

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

  it('scans unpassed unlocked kana before unlocking the next kana', () => {
    const progress = createInitialProgress(settings)
    markPassed(progress.kanaStats['あ'], settings)

    expect(chooseNextTargetKana(progress, settings)).toBe('い')
  })

  it('unlocks next kana when every unlocked kana passes', () => {
    const progress = createInitialProgress(settings)
    for (const kana of ['あ', 'い', 'し', 'き', 'か']) markPassed(progress.kanaStats[kana], settings)

    expect(chooseNextTargetKana(progress, settings)).toBe('こ')
    expect(progress.unlockedCountByMode.hiragana).toBe(6)
  })

  it('recomputes pass flags for changed goals without mutating counts or history', () => {
    const progress = createInitialProgress(settings)
    const stats = progress.kanaStats['あ']
    markPassed(stats, settings)
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

    expect(progress.kanaStats['あ'].passed).toBe(true)
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
    const batch = [practiceWord('ai', 'あい')]
    const evaluation = evaluateBatch(expectedText(batch), expectedText(batch), 30_000)
    const next = applyEvaluationToProgress(progress, settings, evaluation, batch, new Date('2026-06-10T10:00:00').getTime())

    expect(next.practiceTime.todayMs).toBe(30_000)
    expect(next.practiceTime.totalMs).toBe(30_000)
  })
})

function practiceWord(id: string, kana: string) {
  return { id, repetitionId: id, kanji: null, kana, kanaScript: 'hiragana' as const }
}

function attempt(attemptNumber: number, appearanceCount: number, correctCount: number, allocatedMs: number) {
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
