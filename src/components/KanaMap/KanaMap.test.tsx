import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import type { KanaTargetAttempt } from '../../model/progress'
import { refreshSmoothedStats } from '../../model/progress'
import { usePracticeStore } from '../../stores/practiceStore'
import { KanaMap } from './KanaMap'

describe('KanaMap', () => {
  it('shows useful per-kana metrics when a kana is selected', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = usePracticeStore()
    store.initialize({ keyValueStorage: createMapStorage(), words: [{ script: 'hiragana', kana: 'あい', meaning: 'あい', jlpt: 'N5' }] })
    const stats = store.progress.kanaStats['あ']
    stats.attemptRecords = attempts(12, { reactionMs: 500 })
    stats.history = [{ timestamp: 1, attemptNumber: 1, appearanceCount: 12, correctCount: 11, allocatedMs: 6_000 }]
    stats.attempts = 1
    stats.appearances = 12
    stats.correct = 11
    stats.incorrect = 1
    refreshSmoothedStats(stats, store.settings)

    const wrapper = mount(KanaMap, { global: { plugins: [pinia] } })
    await wrapper.findAll('button.kana-pill').find((button) => button.text() === 'あ')!.trigger('click')

    expect(wrapper.find('.kana-metrics-popup').text()).toContain('あ')
    expect(wrapper.text()).toContain('Last:')
    expect(wrapper.text()).toContain('Best:')
    expect(wrapper.text()).toContain('Accuracy')
    expect(wrapper.findAll('.kana-chart-dot')).toHaveLength(3)
  })
})

function attempts(count: number, patch: Partial<KanaTargetAttempt>): KanaTargetAttempt[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index + 1,
    attemptNumber: index + 1,
    firstTryCorrect: patch.firstTryCorrect ?? true,
    finalCorrect: patch.finalCorrect ?? true,
    reactionMs: patch.reactionMs ?? 500,
    mistakeKana: patch.mistakeKana ?? null,
  }))
}

function createMapStorage() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
}
