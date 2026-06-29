import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import type { BatchResult } from '../../model/batch'
import { createInputSurfaceState } from '../../model/inputSurface'
import type { PracticeWord } from '../../model/words'
import { usePracticeStore } from '../../stores/practiceStore'
import { PracticePanel } from './PracticePanel'

const words = [
  { kana: 'あい' },
  { kana: 'あお' },
]

describe('PracticePanel component behavior', () => {
  it('auto-commits matching local romaji-to-kana input', async () => {
    const { store, wrapper } = mountPracticePanel(words)

    await typeRomaji(wrapper, 'a')

    expect(store.inputState.cursorIndex).toBe(1)
    expect(wrapper.find('.composition-bubble').exists()).toBe(false)
  })

  it('marks the hidden input while native IME composition is active', async () => {
    const { wrapper } = mountPracticePanel(words)
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('compositionstart')

    expect(input.classes()).toContain('composing')
  })

  it('renders centered-dot separators only when enabled', () => {
    const withSeparator = mountPracticePanel(words, { showWordSeparator: true }).wrapper
    const withoutSeparator = mountPracticePanel(words, { showWordSeparator: false }).wrapper

    expect(withSeparator.find('.visual-separator').text()).toBe('·')
    expect(withoutSeparator.find('.visual-separator').exists()).toBe(false)
  })

  it('Enter commits the current local composition', async () => {
    const { store, wrapper } = mountPracticePanel(words)

    await typeRomaji(wrapper, 'a')
    await wrapper.find('input.hidden-ime-input').trigger('keydown', { key: 'Enter' })

    expect(store.inputState.cursorIndex).toBe(1)
    expect(wrapper.find('.composition-bubble').exists()).toBe(false)
  })

  it('native composition end commits the current local composition', async () => {
    const { store, wrapper } = mountPracticePanel(words)
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('compositionstart')
    await typeRomaji(wrapper, 'a')
    await input.trigger('compositionend')

    expect(store.inputState.cursorIndex).toBe(1)
  })

  it('leaves unfinished romaji visible in the preview', async () => {
    const { store, wrapper } = mountPracticePanel([{ kana: 'あかい' }])

    await typeRomaji(wrapper, 'ak')

    expect(wrapper.find('.composition-bubble').text()).toBe('k')
    expect(store.inputState.cursorIndex).toBe(1)
  })

  it('Backspace removes the last romaji unit from the preview', async () => {
    const { wrapper } = mountPracticePanel([{ kana: 'あかい' }])
    const input = wrapper.find('input.hidden-ime-input')

    await typeRomaji(wrapper, 'k')
    await input.trigger('keydown', { key: 'Backspace' })

    expect(wrapper.find('.composition-bubble').exists()).toBe(false)

    await typeRomaji(wrapper, 'ny')
    await input.trigger('keydown', { key: 'Backspace' })

    expect(wrapper.find('.composition-bubble').text()).toBe('n')
  })

  it('auto-commits when converted romaji matches the current word remainder', async () => {
    const { store, wrapper } = mountPracticePanel([{ kana: 'あか' }])

    await typeRomaji(wrapper, 'aka')

    expect(store.lastEvaluation?.correctKanaCount).toBe(2)
    expect(store.lastEvaluation?.totalExpectedKana).toBe(2)
    expect(wrapper.find('.composition-bubble').exists()).toBe(false)
  })

  it('commits word-final n as the target kana ん', async () => {
    const { store, wrapper } = mountPracticePanel([{ kana: 'けん' }])

    await typeRomaji(wrapper, 'ken')

    expect(store.lastEvaluation?.correctKanaCount).toBe(2)
    expect(store.lastEvaluation?.totalExpectedKana).toBe(2)
  })

  it('typing correct kana advances the visible cursor', async () => {
    const { wrapper } = mountPracticePanel(words)

    await typeRomaji(wrapper, 'a')
    await wrapper.find('input.hidden-ime-input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.find('.surface-kana.completed').text()).toBe('あ')
    expect(wrapper.find('.surface-kana.current').text()).toBe('い')
  })

  it('typing wrong kana marks the current kana and does not advance', async () => {
    const { wrapper } = mountPracticePanel(words)

    await typeRomaji(wrapper, 'o')
    await wrapper.find('input.hidden-ime-input').trigger('keydown', { key: 'Enter' })

    const current = wrapper.find('.surface-kana.current')
    expect(current.text()).toBe('あ')
    expect(current.classes()).toContain('wrong')
  })

  it('backspace correction still counts as a first-try miss', async () => {
    const { store, wrapper } = mountPracticePanel([{ kana: 'あ' }])
    const input = wrapper.find('input.hidden-ime-input')

    await typeRomaji(wrapper, 'o')
    await input.trigger('keydown', { key: 'Backspace' })
    await typeRomaji(wrapper, 'a')

    expect(store.lastEvaluation?.kanaAttempts[0]).toMatchObject({
      kana: 'あ',
      firstTryCorrect: false,
      finalCorrect: true,
      mistakeKana: 'お',
    })
    expect(store.lastEvaluation?.correctKanaCount).toBe(0)
  })

  it('completing the batch auto-submits and shows result info', async () => {
    const { wrapper } = mountPracticePanel([{ kana: 'あ' }])

    await typeRomaji(wrapper, 'a')

    expect(wrapper.text()).toContain('Speed')
    expect(wrapper.text()).toContain('Accuracy')
    expect(wrapper.text()).toContain('Correct')
  })

  it('renders warning messages formatted from structured warnings', () => {
    const { wrapper } = mountPracticePanel([], {
      batch: {
        words: [],
        warnings: [{
          type: 'noEligibleWords',
          script: 'katakana',
          targetKana: 'ス',
          unlockedKana: ['ス', 'キ', 'ー', 'バ', 'パ'],
          totalTargetWords: 10,
        }],
      },
    })

    expect(wrapper.find('.warning').text()).toContain('katakana')
    expect(wrapper.find('.warning').text()).toContain('ス')
  })
})

type MountOptions = {
  batch?: BatchResult
  showWordSeparator?: boolean
}

function mountPracticePanel(initialWords: Array<{ kana: string }>, options: MountOptions = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePracticeStore()
  const batch = options.batch ?? { words: practiceWords(initialWords), warnings: [] }
  store.initialize({ keyValueStorage: createMapStorage(), words: practiceWords(initialWords) })
  store.batch = batch
  store.inputState = createInputSurfaceState(batch.words, 0)
  store.lastEvaluation = null
  store.outcomeMessage = null
  store.updateSettings({ batchSize: Math.max(1, batch.words.length), showWordSeparator: options.showWordSeparator ?? true })
  store.batch = batch
  store.inputState = createInputSurfaceState(batch.words, 0)

  return {
    store,
    wrapper: mount(PracticePanel, { global: { plugins: [pinia] } }),
  }
}

async function typeRomaji(wrapper: ReturnType<typeof mount>, romaji: string) {
  const input = wrapper.find('input.hidden-ime-input')
  for (const key of romaji) {
    await input.trigger('keydown', { key })
  }
}

function practiceWords(input: Array<{ kana: string }>): PracticeWord[] {
  return input.map((word, index) => ({
    ...word,
    script: 'hiragana',
    jlpt: 'N5',
    meaning: word.kana,
    repetitionId: `${word.kana}-${index}`,
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
