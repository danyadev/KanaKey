import { describe, expect, it } from 'vitest'

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
