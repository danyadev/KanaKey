import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

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
    stats.history = [
      { timestamp: 1, attemptNumber: 1, appearanceCount: 2, correctCount: 1, allocatedMs: 60_000 },
      { timestamp: 2, attemptNumber: 2, appearanceCount: 2, correctCount: 2, allocatedMs: 30_000 },
    ]
    stats.attempts = 2
    stats.appearances = 4
    stats.correct = 3
    stats.incorrect = 1
    refreshSmoothedStats(stats, store.settings)

    const wrapper = mount(KanaMap, { global: { plugins: [pinia] } })
    await wrapper.findAll('button.kana-pill').find((button) => button.text() === 'あ')!.trigger('click')

    expect(wrapper.find('.kana-metrics-head').text()).toContain('あ')
    expect(wrapper.text()).toContain('Recent speed')
    expect(wrapper.text()).toContain('Best speed')
    expect(wrapper.text()).toContain('Accuracy')
    expect(wrapper.findAll('.kana-chart-bar')).toHaveLength(2)
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
