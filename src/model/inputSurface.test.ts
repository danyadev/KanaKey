import { describe, expect, it } from 'vitest'

import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  getCurrentWordRemainder,
  getSurfaceWordViews,
  markCurrentKanaAttemptMistake,
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

  it('returns the remaining kana in the current word', () => {
    let state = createInputSurfaceState(words, 0)
    state = commitKanaInput(state, 'あ', 100)
    const views = getSurfaceWordViews(state)

    expect(getCurrentWordRemainder(views)).toBe('い')
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

  it('records first-try failure even when the final committed kana is correct', () => {
    let state = createInputSurfaceState([{ kana: 'あ' }], 0)
    state = markCurrentKanaAttemptMistake(state, 'お')
    state = commitKanaInput(state, 'あ', 300)

    const evaluation = buildInputEvaluation(state, 300)

    expect(evaluation.kanaAttempts).toEqual([{
      kana: 'あ',
      firstTryCorrect: false,
      finalCorrect: true,
      reactionMs: 300,
      mistakeKana: 'お',
    }])
    expect(evaluation.perKana['あ'].correctCount).toBe(0)
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
})
