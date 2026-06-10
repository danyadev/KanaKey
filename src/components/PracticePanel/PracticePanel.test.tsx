import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import type { BatchEvaluation } from '../../model/evaluation'
import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getSurfaceWordViews,
} from '../../model/inputSurface'
import { formatBatchWarning } from '../../session/practiceMessages'
import { PracticePanel } from './PracticePanel'

const words = [
  { kana: 'あい' },
  { kana: 'あお' },
]

describe('PracticePanel component behavior', () => {
  it('renders the hidden IME input with browser text assistance disabled', () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('input.hidden-ime-input')

    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('autocapitalize')).toBe('off')
    expect(input.attributes('autocorrect')).toBe('off')
    expect(input.attributes('spellcheck')).toBe('false')
  })

  it('shows a local romaji-to-kana composition bubble', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('keydown', { key: 'a' })

    expect(wrapper.find('.composition-bubble').text()).toBe('あ')
  })

  it('marks the hidden input while native IME composition is active', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('compositionstart')

    expect(input.classes()).toContain('composing')
  })

  it('does not render practice action buttons', () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('New batch')
    expect(wrapper.text()).not.toContain('Submit')
    expect(wrapper.text()).not.toContain('Clear attempt')
  })

  it('renders centered-dot separators only when enabled', () => {
    const withSeparator = mountPracticePanel(createInputSurfaceState(words, 0), true)
    const withoutSeparator = mountPracticePanel(createInputSurfaceState(words, 0), false)

    expect(withSeparator.find('.visual-separator').text()).toBe('·')
    expect(withoutSeparator.find('.visual-separator').exists()).toBe(false)
  })

  it('Enter commits the current local composition', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('keydown', { key: 'a' })
    await input.trigger('keydown', { key: 'Enter' })

    expect(commitInputProp(wrapper)).toHaveBeenCalledWith('あ')
    expect(wrapper.find('.composition-bubble').exists()).toBe(false)
  })

  it('native composition end commits the current local composition', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('input.hidden-ime-input')

    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'a' })
    await input.trigger('compositionend')

    expect(commitInputProp(wrapper)).toHaveBeenCalledWith('あ')
  })

  it('leaves unfinished romaji visible in the preview', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あかい' }], 0))

    await typeRomaji(wrapper, 'ak')

    expect(wrapper.find('.composition-bubble').text()).toBe('あk')
    expect(commitInputProp(wrapper)).not.toHaveBeenCalled()
  })

  it('Backspace removes the last romaji unit from the preview', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あかい' }], 0))
    const input = wrapper.find('input.hidden-ime-input')

    await typeRomaji(wrapper, 'aka')
    await input.trigger('keydown', { key: 'Backspace' })

    expect(wrapper.find('.composition-bubble').text()).toBe('あ')
  })

  it('auto-commits when converted romaji matches the current word remainder', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あか' }], 0))

    await typeRomaji(wrapper, 'aka')

    expect(commitInputProp(wrapper)).toHaveBeenCalledWith('あか')
    expect(wrapper.find('.composition-bubble').exists()).toBe(false)
  })

  it('commits word-final n as the target kana ん', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'けん' }], 0))

    await typeRomaji(wrapper, 'ken')

    expect(commitInputProp(wrapper)).toHaveBeenCalledWith('けん')
  })

  it('typing correct kana advances the visible cursor', async () => {
    const wrapper = mountPracticeHarness()

    await typeRomaji(wrapper, 'a')
    await wrapper.find('input.hidden-ime-input').trigger('keydown', { key: 'Enter' })

    expect(wrapper.find('.surface-kana.completed').text()).toBe('あ')
    expect(wrapper.find('.surface-kana.current').text()).toBe('い')
  })

  it('typing wrong kana marks the current kana and does not advance', async () => {
    const wrapper = mountPracticeHarness()

    await typeRomaji(wrapper, 'o')
    await wrapper.find('input.hidden-ime-input').trigger('keydown', { key: 'Enter' })

    const current = wrapper.find('.surface-kana.current')
    expect(current.text()).toBe('あ')
    expect(current.classes()).toContain('wrong')
  })

  it('completing the batch auto-submits and shows result info', async () => {
    const wrapper = mountPracticeHarness([{ kana: 'あ' }])

    await typeRomaji(wrapper, 'a')

    expect(wrapper.text()).toContain('Speed')
    expect(wrapper.text()).toContain('Accuracy')
    expect(wrapper.text()).toContain('Correct')
  })

  it('renders warning messages formatted from structured warnings', () => {
    const warning = formatBatchWarning({
      type: 'noEligibleWords',
      script: 'katakana',
      targetKana: 'ス',
      unlockedKana: ['ス', 'キ', 'ー', 'バ', 'パ'],
      totalTargetWords: 10,
    })
    const wrapper = mountPracticePanel(createInputSurfaceState([], 0), true, [warning])

    expect(wrapper.find('.warning').text()).toContain('katakana')
    expect(wrapper.find('.warning').text()).toContain('ス')
  })
})

function mountPracticePanel(
  state: ReturnType<typeof createInputSurfaceState>,
  showWordSeparator = true,
  warningMessages: string[] = [],
) {
  return mount(PracticePanel, {
    props: practicePanelProps(state, showWordSeparator, warningMessages),
  })
}

function commitInputProp(wrapper: ReturnType<typeof mountPracticePanel>): ReturnType<typeof vi.fn> {
  return wrapper.props('commitInput') as ReturnType<typeof vi.fn>
}

function mountPracticeHarness(initialWords: Array<{ kana: string }> = words) {
  return mount(defineComponent(() => {
    const state = ref(createInputSurfaceState(initialWords, 0))
    const lastEvaluation = ref<BatchEvaluation | null>(null)

    function commit(value: string) {
      state.value = commitKanaInput(state.value, value, 100)
      if (state.value.completed) {
        lastEvaluation.value = buildInputEvaluation(state.value, 100)
      }
    }

    return () => (
      <PracticePanel
        {...practicePanelProps(state.value)}
        lastEvaluation={lastEvaluation.value}
        commitInput={commit}
      />
    )
  }))
}

async function typeRomaji(wrapper: ReturnType<typeof mount>, romaji: string) {
  const input = wrapper.find('input.hidden-ime-input')
  for (const key of romaji) {
    await input.trigger('keydown', { key })
  }
}

function practicePanelProps(
  state: ReturnType<typeof createInputSurfaceState>,
  showWordSeparator = true,
  warningMessages: string[] = [],
) {
  return {
    surfaceWords: getSurfaceWordViews(state),
    showWordSeparator,
    warningMessages,
    typingBox: ref(null),
    currentKana: 'あ',
    targetKpm: 80,
    targetAccuracyPercent: 95,
    passMeter: { kpm: 0, accuracy: 0, kpmPercent: 0, accuracyPercent: 0 },
    lastEvaluation: null,
    outcomeMessage: null,
    commitInput: vi.fn(),
  }
}
