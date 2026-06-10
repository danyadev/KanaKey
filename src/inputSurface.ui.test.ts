import { describe, expect, it } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'

import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getCurrentWordRemainder,
  getSurfaceWordViews,
  shouldHandlePracticeShortcut,
  startComposition,
  updateComposition,
} from './inputSurface'
import { PracticePanel } from './components/PracticePanel/PracticePanel'
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel'
import { Hero } from './components/Hero/Hero'
import { KanaMap } from './components/KanaMap/KanaMap'
import type { KanaRow } from './components/KanaMap/kanaRows'
import { DEFAULT_SETTINGS } from './trainer'

const words = [
  { kana: 'あい' },
  { kana: 'あお' },
]

describe('keybr-style input surface behavior', () => {
  it('marks completed, current, and future kana for the rendered target surface', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    const views = getSurfaceWordViews(state)

    expect(views[0].units[0].status).toBe('completed')
    expect(views[0].units[1]).toMatchObject({ kana: 'い', status: 'current', wrong: false })
    expect(views[1].units[0]).toMatchObject({ kana: 'あ', status: 'future' })
  })

  it('keeps required kana under the caret and previews composition text without advancing', () => {
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
    expect(shouldHandlePracticeShortcut({ key: 'Enter', metaKey: true, ctrlKey: false, isComposing: false }, true)).toBe(false)
    expect(shouldHandlePracticeShortcut({ key: 'Escape', metaKey: false, ctrlKey: false, isComposing: true }, false)).toBe(false)
    expect(shouldHandlePracticeShortcut({ key: 'Enter', metaKey: false, ctrlKey: true, isComposing: false }, false)).toBe(true)
  })

  it('records wrong committed kana, keeps the caret in place, and marks the required kana red until corrected', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'お', 100)

    expect(state.cursorIndex).toBe(0)
    expect(state.mistakesByIndex[0]).toBe(1)
    expect(state.allocatedMsByIndex[0]).toBe(100)
    expect(getSurfaceWordViews(state)[0].units[0]).toMatchObject({ kana: 'あ', status: 'current', wrong: true })

    state = commitKanaInput(state, 'あ', 250)

    expect(state.cursorIndex).toBe(1)
    expect(state.allocatedMsByIndex[0]).toBe(250)
    expect(getSurfaceWordViews(state)[0].units[0]).toMatchObject({ kana: 'あ', status: 'completed', wrong: false })
    expect(getSurfaceWordViews(state)[0].units[1]).toMatchObject({ kana: 'い', status: 'current' })
  })

  it('accumulates allocated time for multiple wrong commits before the correct commit advances', () => {
    let state = createInputSurfaceState([{ kana: 'あ' }], 0)
    state = commitKanaInput(state, 'お', 100)
    state = commitKanaInput(state, 'い', 250)
    state = commitKanaInput(state, 'あ', 400)

    expect(state.completed).toBe(true)
    expect(state.mistakesByIndex[0]).toBe(2)
    expect(state.allocatedMsByIndex[0]).toBe(400)
    expect(buildInputEvaluation(state, 400).perKana['あ']).toEqual({ appearanceCount: 1, correctCount: 0, allocatedMs: 400 })
  })

  it('counts an appearance with a prior wrong commit as incorrect even after correction', () => {
    let state = createInputSurfaceState([{ kana: 'あ' }], 0)
    state = commitKanaInput(state, 'お', 100)
    state = commitKanaInput(state, 'あ', 300)

    const evaluation = buildInputEvaluation(state, 300)

    expect(evaluation.totalExpectedKana).toBe(1)
    expect(evaluation.correctKanaCount).toBe(0)
    expect(evaluation.accuracy).toBe(0)
    expect(evaluation.perKana['あ']).toEqual({ appearanceCount: 1, correctCount: 0, allocatedMs: 300 })
  })

  it('finalizes each word and moves to the next word without typing the visual separator', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    state = commitKanaInput(state, 'い', 300)

    expect(state.cursorIndex).toBe(2)
    expect(state.wordTimings).toEqual([{ word: 'あい', index: 0, durationMs: 300, completedAtMs: 300 }])
    expect(getSurfaceWordViews(state)[1].units[0]).toMatchObject({ kana: 'あ', status: 'current' })
  })

  it('detects when composition text completes the rest of the current word', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)

    expect(getCurrentWordRemainder(getSurfaceWordViews(state))).toBe('い')
  })

  it('marks batch completion so the app can auto-submit immediately', () => {
    let state = createInputSurfaceState([{ kana: 'あい' }], 0)
    let submitCount = 0
    state = commitAndAutoSubmit(state, 'あ', 100, () => { submitCount += 1 })
    state = commitAndAutoSubmit(state, 'い', 300, () => { submitCount += 1 })

    expect(state.completed).toBe(true)
    expect(submitCount).toBe(1)
    expect(buildInputEvaluation(state, 300).correctKanaCount).toBe(2)
  })
})

describe('practice surface rendering', () => {
  it('renders hidden IME input with autocomplete, autocorrect, and spellcheck disabled', async () => {
    const html = await renderPracticePanel(createInputSurfaceState(words, 0))

    expect(html).toContain('class="hidden-ime-input"')
    expect(html).toContain('autocomplete="off"')
    expect(html).toContain('autocapitalize="off"')
    expect(html).toContain('autocorrect="off"')
    expect(html).toContain('spellcheck="false"')
  })

  it('renders a composition bubble while composing', async () => {
    let state = createInputSurfaceState(words, 0)
    state = updateComposition(startComposition(state), 'a')

    const html = await renderPracticePanel(state)

    expect(html).toContain('class="composition-bubble"')
    expect(html).toContain('hidden-ime-input composing')
    expect(html).toContain('>a</span>')
  })

  it('does not render practice action buttons', async () => {
    const html = await renderPracticePanel(createInputSurfaceState(words, 0))

    expect(html).not.toContain('New batch')
    expect(html).not.toContain('Submit completed batch')
    expect(html).not.toContain('Clear attempt')
    expect(html).not.toContain('<button')
  })

  it('renders centered dot separators only when enabled', async () => {
    const state = createInputSurfaceState(words, 0)
    const withSeparator = await renderPracticePanel(state, true)
    const withoutSeparator = await renderPracticePanel(state, false)

    expect(withSeparator).toContain('class="visual-separator"')
    expect(withSeparator).toContain('·')
    expect(withoutSeparator).not.toContain('class="visual-separator"')
  })
})

describe('settings rendering', () => {
  it('renders the goals panel closed by default', async () => {
    const html = await renderSettingsPanel()

    expect(html).toContain('<details class="advanced-settings">')
    expect(html).not.toContain('<details class="advanced-settings" open')
  })

  it('renders reset progress in the goals header row', async () => {
    const html = await renderSettingsPanel()

    expect(html).toMatch(/<summary><span>Goals<\/span><button[^>]*class="danger"[^>]*>Reset progress<\/button><\/summary>/)
  })
})

describe('supporting UI rendering', () => {
  it('labels the top goal widget', async () => {
    const app = createSSRApp(Hero, {
      speedProgressPercent: 20,
      accuracyProgressPercent: 30,
      dailyProgressLabel: '1 / 10 min',
      dailyProgressPercent: 10,
    })
    const html = await renderToString(app)

    expect(html).toContain('Goal progress')
    expect(html).toContain('aria-label="Current goals progress"')
  })

  it('uses a divider instead of the old kana-map legend', async () => {
    const rows: KanaRow[] = [
      { id: 'hiragana-a', label: 'あ', script: 'hiragana', items: [{ kana: 'あ', status: 'current', script: 'hiragana' }] },
      { id: 'katakana-a', label: 'ア', script: 'katakana', items: [{ kana: 'ア', status: 'locked', script: 'katakana' }] },
    ]
    const app = createSSRApp(KanaMap, { rows })
    const html = await renderToString(app)

    expect(html).toContain('kana-script-divider')
    expect(html).not.toContain('hiragana + katakana')
  })
})

function commitAndAutoSubmit(state: ReturnType<typeof createInputSurfaceState>, value: string, now: number, submit: () => void) {
  const next = commitKanaInput(state, value, now)
  if (next.completed) submit()
  return next
}

async function renderPracticePanel(state: ReturnType<typeof createInputSurfaceState>, showWordSeparator = true): Promise<string> {
  const app = createSSRApp(PracticePanel, {
    surfaceWords: getSurfaceWordViews(state),
    showWordSeparator,
    warning: null,
    typingBox: ref(null),
    currentKana: 'あ',
    compositionText: state.compositionText,
    isComposing: state.isComposing,
    targetKpm: 80,
    targetAccuracyPercent: 95,
    passMeter: { kpm: 0, accuracy: 0, kpmPercent: 0, accuracyPercent: 0 },
    lastEvaluation: null,
    outcomeMessage: null,
  })
  return renderToString(app)
}

async function renderSettingsPanel(): Promise<string> {
  const app = createSSRApp(SettingsPanel, {
    settings: DEFAULT_SETTINGS,
    accuracyPercent: 95,
    kanaFont: 'gothic',
  })
  return renderToString(app)
}
