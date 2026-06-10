import { describe, expect, it } from 'vitest'

import seedWords from './words.json'
import {
  DEFAULT_SETTINGS,
  createInitialProgress,
  formatBatchWarning,
  generateBatch,
  getEligibleTargetWords,
} from './trainer'
import type { PracticeSettings, WordEntry } from './types'

const settings: PracticeSettings = {
  ...DEFAULT_SETTINGS,
  batchSize: 3,
  targetKpm: 60,
  targetAccuracy: 0.9,
  smoothingAppearanceCount: 4,
}

const hiraganaWords: WordEntry[] = [
  word('hiragana', 'あい'),
  word('hiragana', 'あし'),
  word('hiragana', 'あき'),
  word('hiragana', 'いし'),
]

const katakanaWords: WordEntry[] = [
  word('katakana', 'スキー'),
  word('katakana', 'バス'),
  word('katakana', 'スキ'),
]

function fixedRandom() {
  return 0
}

function sequenceRandom(values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

describe('batch generation', () => {
  it('draws unique eligible words for a single mode when enough words exist', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(hiraganaWords, settings, progress, fixedRandom)
    const uniqueKana = new Set(batch.words.map((wordEntry) => wordEntry.kana))

    expect(batch.words).toHaveLength(3)
    expect(uniqueKana.size).toBe(3)
    expect(batch.warnings).toEqual([])
    expect(batch.words.every((wordEntry) => wordEntry.kana.includes('あ'))).toBe(true)
  })

  it('duplicates only the missing count when a single-mode pool is short', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(
      [hiraganaWords[0]],
      { ...settings, batchSize: 4 },
      progress,
      fixedRandom,
    )

    expect(batch.words).toHaveLength(4)
    expect(new Set(batch.words.map((wordEntry) => wordEntry.kana))).toEqual(new Set(['あい']))
    expect(batch.warnings).toEqual([
      {
        type: 'duplicatedToFill',
        script: 'hiragana',
        targetKana: 'あ',
        available: 1,
        needed: 4,
        duplicated: 3,
      },
    ])
  })

  it('does not warn about duplicates when mixed mode has enough words per script', () => {
    const mixedSettings = { ...settings, mode: 'mixed' as const, batchSize: 4 }
    const progress = createInitialProgress(mixedSettings)
    const random = sequenceRandom([0.1, 0.9, 0.1, 0.9, 0, 0, 0, 0, 0, 0])
    const batch = generateBatch([...hiraganaWords, ...katakanaWords], mixedSettings, progress, random)
    const hiraganaBatch = batch.words.filter((wordEntry) => wordEntry.script === 'hiragana')
    const katakanaBatch = batch.words.filter((wordEntry) => wordEntry.script === 'katakana')

    expect(batch.words).toHaveLength(4)
    expect(hiraganaBatch).toHaveLength(2)
    expect(katakanaBatch).toHaveLength(2)
    expect(new Set(hiraganaBatch.map((wordEntry) => wordEntry.kana)).size).toBe(2)
    expect(new Set(katakanaBatch.map((wordEntry) => wordEntry.kana)).size).toBe(2)
    expect(batch.warnings).toEqual([])
  })

  it('reports a katakana-only shortage in mixed mode', () => {
    const mixedSettings = { ...settings, mode: 'mixed' as const, batchSize: 4 }
    const progress = createInitialProgress(mixedSettings)
    const random = sequenceRandom([0.1, 0.9, 0.1, 0.9, 0, 0, 0, 0])
    const batch = generateBatch(
      [...hiraganaWords, katakanaWords[0]],
      mixedSettings,
      progress,
      random,
    )

    expect(batch.words.filter((wordEntry) => wordEntry.script === 'hiragana')).toHaveLength(2)
    expect(batch.words.filter((wordEntry) => wordEntry.script === 'katakana')).toHaveLength(2)
    expect(batch.warnings).toEqual([
      {
        type: 'duplicatedToFill',
        script: 'katakana',
        targetKana: 'ス',
        available: 1,
        needed: 2,
        duplicated: 1,
      },
    ])
  })

  it('gives repeated words unique repetition ids', () => {
    const progress = createInitialProgress(settings)
    const batch = generateBatch(
      [hiraganaWords[0]],
      { ...settings, batchSize: 3 },
      progress,
      fixedRandom,
    )

    expect(new Set(batch.words.map((wordEntry) => wordEntry.repetitionId)).size).toBe(3)
  })

  it('has initial katakana eligible real words', () => {
    const katakanaSettings = { ...settings, mode: 'katakana' as const }
    const progress = createInitialProgress(katakanaSettings)
    const eligibleWords = getEligibleTargetWords(
      seedWords as WordEntry[],
      progress,
      'katakana',
      progress.currentTargetKanaByMode.katakana,
    )

    expect(progress.currentTargetKanaByMode.katakana).toBe('ス')
    expect(eligibleWords.length).toBeGreaterThan(0)
    expect(eligibleWords.every((wordEntry) => wordEntry.script === 'katakana')).toBe(true)
    expect(eligibleWords.every((wordEntry) => wordEntry.kana.includes('ス'))).toBe(true)
  })

  it('formats structured warnings outside the low-level batch result', () => {
    const message = formatBatchWarning({
      type: 'duplicatedToFill',
      script: 'katakana',
      targetKana: 'ス',
      available: 1,
      needed: 2,
      duplicated: 1,
    })

    expect(message).toContain('katakana')
    expect(message).toContain('ス')
    expect(message).toContain('repeated 1 word')
  })
})

function word(script: 'hiragana' | 'katakana', kana: string): WordEntry {
  return {
    script,
    kana,
    meaning: kana,
    jlpt: 'N5',
  }
}
