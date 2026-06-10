import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import type { BatchEvaluation } from '../../model/evaluation'
import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getSurfaceWordViews,
  startComposition,
  updateComposition,
} from '../../model/inputSurface'
import { formatBatchWarning } from '../../session/practiceMessages'
import { PracticePanel } from './PracticePanel'

const words = [
  { kana: 'あい' },
  { kana: 'あお' },
]

describe('PracticePanel component behavior', () => {
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

  it('input events call committed text callback', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    await writeKana(wrapper, 'あ')

    expect(callbackProp(wrapper, 'commitInput')).toHaveBeenCalledWith('あ')
  })

  it('Escape calls clear callback', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))

    await wrapper.find('textarea.hidden-ime-input').trigger('keydown', { key: 'Escape' })

    expect(callbackProp(wrapper, 'clear')).toHaveBeenCalledTimes(1)
  })

  it('Cmd or Ctrl Enter calls submit callback', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await input.trigger('keydown', { key: 'Enter', metaKey: true })
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(callbackProp(wrapper, 'submit')).toHaveBeenCalledTimes(2)
  })

  it('composition update calls converted kana preview callback', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState(words, 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'a')

    expect(callbackProp(wrapper, 'updateComposition').mock.calls).toEqual([['あ']])
  })

  it('composition preview leaves unfinished romaji visible', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あかい' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'ak')

    expect(callbackProp(wrapper, 'updateComposition').mock.calls).toEqual([['あ'], ['あk']])
  })

  it('composition update completes when converted romaji matches the current remainder', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あか' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aka')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['あか']])
  })

  it('composition matching the current word remainder calls composition end callback', async () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    const wrapper = mountPracticePanel(state)
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'i')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['い']])
  })

  it('kanji composition end falls back to latest matching kana composition text', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あさ' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'asa', '朝')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['あさ']])
  })

  it('kanji composition end accepts あか reading when IME commits 赤', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あか' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aka', '赤')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['あか']])
  })

  it('kanji composition can recover あか from incremental romaji key events', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あか' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aka', '赤')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['あか']])
  })

  it('kanji composition end stays wrong when kana composition text does not match', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'あさ' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'ashi')
    await input.trigger('compositionend', { data: '足' })

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['足']])
  })

  it('compositionupdate auto-complete does not double-commit on compositionend', async () => {
    const wrapper = mountCompositionHarness([{ kana: 'ああ' }, { kana: 'あか' }])
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')
    await input.trigger('compositionend', { data: 'ああ' })

    expect(currentKanaText(wrapper)).toBe('あ')
    expect(wrapper.findAll('.surface-kana.completed')).toHaveLength(2)
  })

  it('post-composition input event does not leak consumed kana into next word', async () => {
    const wrapper = mountCompositionHarness([{ kana: 'ああ' }, { kana: 'あか' }])
    let input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')

    input = wrapper.find('textarea.hidden-ime-input')
    setTextareaValue(input, 'あ')
    await input.trigger('input')

    expect(currentKanaText(wrapper)).toBe('あ')
    expect(wrapper.findAll('.surface-kana.completed')).toHaveLength(2)
  })

  it('post-composition input with extra text is committed explicitly', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'ああ' }, { kana: 'あか' }], 0))
    let input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')

    input = wrapper.find('textarea.hidden-ime-input')
    setTextareaValue(input, 'あああ')
    await input.trigger('input')

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['ああ']])
    expect(callbackProp(wrapper, 'commitInput').mock.calls).toEqual([['あああ']])
  })

  it('consumed composition does not mark a different next kana wrong', async () => {
    const wrapper = mountCompositionHarness([{ kana: 'ああ' }, { kana: 'いか' }])
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')
    await input.trigger('compositionend', { data: 'ああ' })

    expect(currentKanaText(wrapper)).toBe('い')
    expect(wrapper.find('.surface-kana.current').classes()).not.toContain('wrong')
  })

  it('consumed composition does not auto-complete a duplicate next word', async () => {
    const wrapper = mountCompositionHarness([{ kana: 'ああ' }, { kana: 'ああ' }])
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')
    await input.trigger('compositionend', { data: 'ああ' })

    expect(currentKanaText(wrapper)).toBe('あ')
    expect(wrapper.findAll('.surface-kana.completed')).toHaveLength(2)
  })

  it('compositionend with same already-consumed value calls no duplicate commit', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'ああ' }, { kana: 'あか' }], 0))
    const input = wrapper.find('textarea.hidden-ime-input')

    await composeRomaji(input, 'aa')
    await input.trigger('compositionend', { data: 'ああ' })

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['ああ']])
  })

  it('extra compositionend text beyond the current word is committed explicitly', async () => {
    const wrapper = mountPracticePanel(createInputSurfaceState([{ kana: 'ああ' }, { kana: 'あか' }], 0))

    await wrapper.find('textarea.hidden-ime-input').trigger('compositionend', { data: 'あああ' })

    expect(callbackProp(wrapper, 'endComposition').mock.calls).toEqual([['あああ']])
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

type CallbackPropName =
  | 'submit'
  | 'clear'
  | 'commitInput'
  | 'startComposition'
  | 'updateComposition'
  | 'endComposition'

function callbackProp(
  wrapper: ReturnType<typeof mountPracticePanel>,
  name: CallbackPropName,
): ReturnType<typeof vi.fn> {
  return wrapper.props(name) as ReturnType<typeof vi.fn>
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

function mountCompositionHarness(initialWords: Array<{ kana: string }>) {
  return mount(defineComponent(() => {
    const state = ref(createInputSurfaceState(initialWords, 0))

    function commit(value: string) {
      state.value = commitKanaInput(state.value, value, 100)
    }

    return () => (
      <PracticePanel
        {...practicePanelProps(state.value)}
        isComposing={state.value.isComposing}
        compositionText={state.value.compositionText}
        startComposition={() => { state.value = startComposition(state.value) }}
        updateComposition={(value) => { state.value = updateComposition(state.value, value) }}
        endComposition={commit}
      />
    )
  }))
}

async function writeKana(wrapper: ReturnType<typeof mount>, kana: string) {
  const input = wrapper.find('textarea.hidden-ime-input')
  await input.setValue(kana)
}

async function composeRomaji(
  input: TriggerableInput,
  romaji: string,
  committedText?: string,
) {
  for (let index = 0; index < romaji.length; index += 1) {
    await input.trigger('keydown', { key: romaji[index] })
    if (index === 0) await input.trigger('compositionstart')
    await input.trigger('compositionupdate', { data: romaji.slice(0, index + 1) })
  }

  if (committedText !== undefined) {
    await input.trigger('compositionend', { data: committedText })
  }
}

type TriggerableInput = {
  trigger: (eventName: string, options?: Record<string, unknown>) => Promise<void>
}

function setTextareaValue(input: { element: Element }, value: string) {
  ;(input.element as HTMLTextAreaElement).value = value
}

function currentKanaText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.surface-kana.current').text()
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
    submit: vi.fn(),
    clear: vi.fn(),
    commitInput: vi.fn(),
    startComposition: vi.fn(),
    updateComposition: vi.fn(),
    endComposition: vi.fn(),
  }
}
