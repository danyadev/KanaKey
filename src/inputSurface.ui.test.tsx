import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getCurrentWordRemainder,
  getSurfaceWordViews,
  shouldHandlePracticeShortcut,
  startComposition,
  updateComposition,
} from './model/inputSurface'
import { DEFAULT_SETTINGS } from './model/settings'
import { formatBatchWarning } from './session/practiceMessages'
import { App } from './components/App/App'
import { PracticePanel } from './components/PracticePanel/PracticePanel'
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel'
import type { BatchEvaluation } from './model/evaluation'
import type { PracticeSettings } from './model/settings'

const words = [
  { kana: 'あい' },
  { kana: 'あお' },
]

describe('input surface model behavior', () => {
  it('marks completed, current, and future kana for the target surface', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    const views = getSurfaceWordViews(state)

    expect(views[0].units[0].status).toBe('completed')
    expect(views[0].units[1]).toMatchObject({ kana: 'い', status: 'current', wrong: false })
    expect(views[1].units[0]).toMatchObject({ kana: 'あ', status: 'future' })
  })

  it('keeps required kana under the caret while composing', () => {
    let state = createInputSurfaceState(words, 0)
    state = startComposition(state)
    state = updateComposition(state, 'yi')

    const current = getSurfaceWordViews(state)[0].units[0]
    expect(state.cursorIndex).toBe(0)
    expect(state.isComposing).toBe(true)
    expect(state.compositionText).toBe('yi')
    expect(current).toMatchObject({ kana: 'あ', status: 'current' })
  })

  it('does not handle app shortcuts while IME composition is active', () => {
    expect(shouldHandlePracticeShortcut(
      { key: 'Enter', metaKey: true, ctrlKey: false, isComposing: false },
      true,
    )).toBe(false)
    expect(shouldHandlePracticeShortcut(
      { key: 'Escape', metaKey: false, ctrlKey: false, isComposing: true },
      false,
    )).toBe(false)
    expect(shouldHandlePracticeShortcut(
      { key: 'Enter', metaKey: false, ctrlKey: true, isComposing: false },
      false,
    )).toBe(true)
  })

  it('records wrong kana, keeps the caret in place, and marks the current kana wrong', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'お', 100)

    expect(state.cursorIndex).toBe(0)
    expect(state.mistakesByIndex[0]).toBe(1)
    expect(state.allocatedMsByIndex[0]).toBe(100)
    expect(getSurfaceWordViews(state)[0].units[0]).toMatchObject({
      kana: 'あ',
      status: 'current',
      wrong: true,
    })

    state = commitKanaInput(state, 'あ', 250)

    expect(state.cursorIndex).toBe(1)
    expect(state.allocatedMsByIndex[0]).toBe(250)
    expect(getSurfaceWordViews(state)[0].units[1]).toMatchObject({ kana: 'い', status: 'current' })
  })

  it('accumulates allocated time for multiple wrong commits', () => {
    let state = createInputSurfaceState([{ kana: 'あ' }], 0)
    state = commitKanaInput(state, 'お', 100)
    state = commitKanaInput(state, 'い', 250)
    state = commitKanaInput(state, 'あ', 400)

    expect(state.completed).toBe(true)
    expect(state.mistakesByIndex[0]).toBe(2)
    expect(state.allocatedMsByIndex[0]).toBe(400)
    expect(buildInputEvaluation(state, 400).perKana['あ']).toEqual({
      appearanceCount: 1,
      correctCount: 0,
      allocatedMs: 400,
    })
  })

  it('finalizes each word and moves on without requiring the visual separator', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    state = commitKanaInput(state, 'い', 300)

    expect(state.cursorIndex).toBe(2)
    expect(state.wordTimings).toEqual([
      { word: 'あい', index: 0, durationMs: 300, completedAtMs: 300 },
    ])
    expect(getSurfaceWordViews(state)[1].units[0]).toMatchObject({ kana: 'あ', status: 'current' })
  })

  it('exposes the remaining current word for automatic composition completion', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)

    expect(getCurrentWordRemainder(getSurfaceWordViews(state))).toBe('い')
  })
})

describe('PracticePanel component behavior', () => {
  it('renders the hidden IME input with browser text assistance disabled', () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('autocapitalize')).toBe('off')
    expect(input.attributes('autocorrect')).toBe('off')
    expect(input.attributes('spellcheck')).toBe('false')
  })

  it('shows a composition bubble while composing', () => {
    let state = createInputSurfaceState(words, 0)
    state = updateComposition(startComposition(state), 'a')
    const wrapper = mountPracticePanel(state)

    expect(wrapper.find('.composition-bubble').text()).toBe('a')
    expect(wrapper.find('textarea.hidden-ime-input').classes()).toContain('composing')
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

  it('input events emit committed text', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    await writeKana(wrapper, 'あ')

    expect(wrapper.emitted('commitInput')).toEqual([['あ']])
  })

  it('Escape emits clear', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    await wrapper.find('textarea.hidden-ime-input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('Cmd or Ctrl Enter emits submit', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(wrapper.emitted('submit')).toHaveLength(2)
  })

  it('composition update emits compositionUpdate', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    await wrapper.find('textarea.hidden-ime-input').trigger('compositionupdate', { data: 'a' })

    expect(wrapper.emitted('compositionUpdate')).toEqual([['a']])
  })

  it('composition matching the current word remainder emits compositionEnd', async () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    const wrapper = mountPracticePanel(state)

    await wrapper.find('textarea.hidden-ime-input').trigger('compositionupdate', { data: 'い' })

    expect(wrapper.emitted('compositionEnd')).toEqual([['い']])
  })

  it('typing correct kana advances the visible cursor', async () => {
    const wrapper = mountPracticeHarness()

    await writeKana(wrapper, 'あ')

    expect(wrapper.find('.surface-kana.completed').text()).toBe('あ')
    expect(wrapper.find('.surface-kana.current').text()).toBe('い')
  })

  it('typing wrong kana marks the current kana and does not advance', async () => {
    const wrapper = mountPracticeHarness()

    await writeKana(wrapper, 'お')

    const current = wrapper.find('.surface-kana.current')
    expect(current.text()).toBe('あ')
    expect(current.classes()).toContain('wrong')
  })

  it('completing the batch auto-submits and shows result info', async () => {
    const wrapper = mountPracticeHarness([{ kana: 'あ' }])

    await writeKana(wrapper, 'あ')

    expect(wrapper.text()).toContain('Speed')
    expect(wrapper.text()).toContain('Accuracy')
    expect(wrapper.text()).toContain('Correct')
  })

  it('renders warning messages formatted from structured warnings', () => {
    const warning = formatBatchWarning({
      type: 'noEligibleWords',
      script: 'katakana',
      targetKana: 'ス',
    })
    const wrapper = mountPracticePanel(createInputSurfaceState([], 0), true, [warning])

    expect(wrapper.find('.warning').text()).toContain('katakana')
    expect(wrapper.find('.warning').text()).toContain('ス')
  })
})

describe('SettingsPanel component behavior', () => {
  it('changes batch size through the settings action', async () => {
    const wrapper = mountSettingsPanel()
    const input = wrapper.find('input[type="number"]')

    await input.setValue('12')

    expect(wrapper.emitted('update:settings')).toEqual([[{ batchSize: 12 }]])
  })

  it('switches mode through the settings action', async () => {
    const wrapper = mountSettingsPanel()

    await wrapper.findAll('button').find((button) => button.text() === 'Hiragana')!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Katakana')!.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === 'Mixed')!.trigger('click')

    expect(wrapper.emitted('update:settings')).toEqual([
      [{ mode: 'hiragana' }],
      [{ mode: 'katakana' }],
      [{ mode: 'mixed' }],
    ])
  })

  it('toggling word separator emits boolean showWordSeparator', async () => {
    const wrapper = mountSettingsPanel()
    const checkbox = wrapper.find('input[type="checkbox"]')

    await checkbox.setValue(false)

    expect(wrapper.emitted('update:settings')).toEqual([[{ showWordSeparator: false }]])
  })

  it('changing font emits update:kanaFont', async () => {
    const wrapper = mountSettingsPanel()

    await wrapper.find('select').setValue('mincho')

    expect(wrapper.emitted('update:kanaFont')).toEqual([['mincho']])
  })

  it('calls the reset progress flow from the goals header', async () => {
    const wrapper = mountSettingsPanel()
    const resetButton = wrapper.find('summary .danger')

    await resetButton.trigger('click')

    expect(wrapper.emitted('resetProgress')).toHaveLength(1)
    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps the goals panel closed by default', () => {
    const wrapper = mountSettingsPanel()

    expect(wrapper.find('details.advanced-settings').attributes('open')).toBeUndefined()
  })

  it('keeps reset progress aligned in the goals header', () => {
    const wrapper = mountSettingsPanel()
    const summary = wrapper.find('details.advanced-settings > summary')

    expect(summary.find('span').text()).toBe('Goals')
    expect(summary.find('button.danger').text()).toBe('Reset progress')
  })
})

describe('App session behavior', () => {
  it('switching mode regenerates the visible practice batch', async () => {
    installLocalStorage()
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(App, {
      global: { plugins: [pinia] },
    })

    await wrapper.findAll('button').find((button) => button.text() === 'Katakana')!.trigger('click')

    expect(wrapper.find('.typing-surface').text()).toContain('ス')
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
        onCommitInput={commit}
      />
    )
  }))
}

async function writeKana(wrapper: ReturnType<typeof mount>, kana: string) {
  const input = wrapper.find('textarea.hidden-ime-input')
  await input.setValue(kana)
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
    compositionText: state.compositionText,
    isComposing: state.isComposing,
    targetKpm: 80,
    targetAccuracyPercent: 95,
    passMeter: { kpm: 0, accuracy: 0, kpmPercent: 0, accuracyPercent: 0 },
    lastEvaluation: null,
    outcomeMessage: null,
    onSubmit: vi.fn(),
    onClear: vi.fn(),
    onCommitInput: vi.fn(),
    onCompositionStart: vi.fn(),
    onCompositionUpdate: vi.fn(),
    onCompositionEnd: vi.fn(),
  }
}

function mountSettingsPanel(settings: PracticeSettings = DEFAULT_SETTINGS) {
  return mount(SettingsPanel, {
    props: {
      settings,
      accuracyPercent: 95,
      kanaFont: 'gothic',
    },
  })
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
