import { describe, expect, it } from 'vitest'

import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getSurfaceWordViews,
  shouldHandlePracticeShortcut,
  startComposition,
  updateComposition,
} from './inputSurface'

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
    expect(getSurfaceWordViews(state)[0].units[0]).toMatchObject({ kana: 'あ', status: 'current', wrong: true })

    state = commitKanaInput(state, 'あ', 250)

    expect(state.cursorIndex).toBe(1)
    expect(getSurfaceWordViews(state)[0].units[0]).toMatchObject({ kana: 'あ', status: 'completed', wrong: false })
    expect(getSurfaceWordViews(state)[0].units[1]).toMatchObject({ kana: 'い', status: 'current' })
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

  it('records word completion timing and marks the batch complete for auto-submit', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    state = commitKanaInput(state, 'い', 300)
    state = commitKanaInput(state, 'あ', 500)
    state = commitKanaInput(state, 'お', 900)

    expect(state.completed).toBe(true)
    expect(state.wordTimings).toEqual([
      { word: 'あい', index: 0, durationMs: 300, completedAtMs: 300 },
      { word: 'あお', index: 1, durationMs: 600, completedAtMs: 900 },
    ])

    const evaluation = buildInputEvaluation(state, 900)
    expect(evaluation.wordTimings).toHaveLength(2)
    expect(evaluation.correctKanaCount).toBe(4)
    expect(evaluation.kpm).toBeCloseTo(266.666, 2)
  })
})
