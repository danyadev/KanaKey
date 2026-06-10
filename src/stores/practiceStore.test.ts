import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { REQUIRED_APPEARANCE_COUNT } from '../model/settings'
import { createKanaKeyStorage } from '../storage/kanaKeyStorage'
import { usePracticeStore } from './practiceStore'
import type { KanaStats } from '../model/progress'
import type { WordEntry } from '../model/words'

const words: WordEntry[] = [
  word('hiragana', 'あい'),
  word('hiragana', 'あし'),
  word('hiragana', 'あき'),
  word('katakana', 'スキー'),
]

describe('practice store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useRealTimers()
  })

  it('initializes settings, progress, and a generated batch from storage', () => {
    const storage = createMapStorage()
    const persisted = createKanaKeyStorage(storage)
    persisted.saveSettings({
      mode: 'hiragana',
      batchSize: 2,
      targetKpm: 80,
      targetAccuracy: 0.9,
      smoothingAppearanceCount: 4,
      dailyPracticeMinutesGoal: 8,
      showWordSeparator: false,
    })

    const store = usePracticeStore()
    store.initialize({ keyValueStorage: storage, words })

    expect(store.settings.batchSize).toBe(2)
    expect(store.settings.showWordSeparator).toBe(false)
    expect(store.batch.words).toHaveLength(2)
    expect(store.surfaceWords.length).toBe(2)
  })

  it('normalizes and persists settings updates', () => {
    const storage = createMapStorage()
    const persisted = createKanaKeyStorage(storage)
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: storage, words })

    store.updateSettings({ batchSize: 999, targetAccuracy: 2 })

    expect(store.settings.batchSize).toBe(50)
    expect(store.settings.targetAccuracy).toBe(1)
    expect(persisted.loadSettings().batchSize).toBe(50)
    expect(persisted.loadSettings().targetAccuracy).toBe(1)
  })

  it('updates progress mode through an explicit transition', () => {
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words })
    const previousProgress = store.progress

    store.updateSettings({ mode: 'katakana' })

    expect(store.progress).not.toBe(previousProgress)
    expect(previousProgress.mode).toBe('hiragana')
    expect(store.progress.mode).toBe('katakana')
  })

  it('refreshes pass flags only for pass-related setting changes', () => {
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words })
    markPassed(store.progress.kanaStats['あ'], store.settings.targetKpm)

    const progressBeforeBatchChange = store.progress
    store.updateSettings({ batchSize: 2 })

    expect(store.progress).toBe(progressBeforeBatchChange)
    expect(store.progress.kanaStats['あ'].passed).toBe(true)

    store.updateSettings({ targetKpm: 2_000 })

    expect(store.progress).not.toBe(progressBeforeBatchChange)
    expect(store.progress.kanaStats['あ'].passed).toBe(false)
  })

  it('regenerates the batch and resets the input surface', () => {
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words })
    store.commitInput('あ')

    expect(store.inputState.cursorIndex).toBe(1)

    store.regenerateBatch()

    expect(store.inputState.cursorIndex).toBe(0)
    expect(store.surfaceWords.length).toBeGreaterThan(0)
  })

  it('commitInput advances input state', () => {
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words })

    store.commitInput('あ')

    expect(store.inputState.cursorIndex).toBe(1)
    expect(store.surfaceWords[0].units[0].status).toBe('completed')
  })

  it('completing a batch applies evaluation and generates the next batch', () => {
    vi.setSystemTime(new Date('2026-06-10T10:00:00Z'))
    const store = usePracticeStore()
    store.initialize({
      keyValueStorage: createMapStorage(),
      words: [word('hiragana', 'あ')],
    })
    store.updateSettings({ batchSize: 1 })

    store.commitInput('あ')

    expect(store.lastEvaluation?.correctKanaCount).toBe(1)
    expect(store.progress.kanaStats['あ'].appearances).toBe(1)
    expect(store.inputState.cursorIndex).toBe(0)
    expect(store.batch.words).toHaveLength(1)
  })

  it('resetProgress resets progress and keeps settings', () => {
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words })
    store.updateSettings({ batchSize: 2, mode: 'katakana' })
    store.progress.kanaStats['ス'].appearances = 4

    store.resetProgress()

    expect(store.settings.batchSize).toBe(2)
    expect(store.settings.mode).toBe('katakana')
    expect(store.progress.kanaStats['ス'].appearances).toBe(0)
  })

  it('formats structured batch warnings in a getter', () => {
    const store = usePracticeStore()
    store.initialize({
      keyValueStorage: createMapStorage(),
      words: [word('katakana', 'スキー')],
    })
    store.updateSettings({ mode: 'katakana', batchSize: 3 })

    expect(store.warningMessages).toHaveLength(1)
    expect(store.warningMessages[0]).toContain('katakana')
    expect(store.warningMessages[0]).toContain('repeated 2 words')
  })
})

function createMapStorage() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
}

function word(script: 'hiragana' | 'katakana', kana: string): WordEntry {
  return {
    script,
    kana,
    meaning: kana,
    jlpt: 'N5',
  }
}

function markPassed(stats: KanaStats, targetKpm: number) {
  stats.attempts = 1
  stats.appearances = REQUIRED_APPEARANCE_COUNT
  stats.correct = REQUIRED_APPEARANCE_COUNT
  stats.incorrect = 0
  stats.smoothedAccuracy = 1
  stats.smoothedKpm = targetKpm
  stats.passed = true
  stats.history = [{
    timestamp: 1,
    attemptNumber: 1,
    appearanceCount: REQUIRED_APPEARANCE_COUNT,
    correctCount: REQUIRED_APPEARANCE_COUNT,
    allocatedMs: 20_000,
  }]
}
