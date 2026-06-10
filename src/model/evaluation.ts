import { splitKanaUnits } from './kana'
import type { WordEntry } from './words'

export type PerKanaEvaluation = {
  appearanceCount: number
  correctCount: number
  allocatedMs: number
}

export type BatchEvaluation = {
  expected: string
  actual: string
  elapsedMs: number
  totalExpectedKana: number
  correctKanaCount: number
  kpm: number
  accuracy: number
  perKana: Record<string, PerKanaEvaluation>
  wordTimings: WordTiming[]
}

export type WordTiming = {
  word: string
  index: number
  durationMs: number
  completedAtMs: number
}

export const JAPANESE_SPACE = '　'

export function expectedText(words: Array<Pick<WordEntry, 'kana'>>): string {
  return words.map((word) => word.kana).join(JAPANESE_SPACE)
}

export function normalizeTypedText(value: string): string {
  return value.trim().split(/[\s　]+/u).filter(Boolean).join(JAPANESE_SPACE)
}

export function evaluateBatch(
  expected: string,
  typed: string,
  elapsedMs: number,
): BatchEvaluation {
  const normalizedExpected = normalizeTypedText(expected)
  const normalizedActual = normalizeTypedText(typed)
  const expectedUnits = splitKanaUnits(normalizedExpected)
  const actualUnits = splitKanaUnits(normalizedActual)
  const totalExpectedKana = expectedUnits.length
  const allocatedPerKana = totalExpectedKana === 0 ? 0 : elapsedMs / totalExpectedKana
  const perKana: BatchEvaluation['perKana'] = {}
  let correctKanaCount = 0

  expectedUnits.forEach((unit, index) => {
    const isCorrect = actualUnits[index] === unit
    if (isCorrect) correctKanaCount += 1

    perKana[unit] ??= { appearanceCount: 0, correctCount: 0, allocatedMs: 0 }
    perKana[unit].appearanceCount += 1
    perKana[unit].allocatedMs += allocatedPerKana
    if (isCorrect) perKana[unit].correctCount += 1
  })

  return buildEvaluation({
    expected: normalizedExpected,
    actual: normalizedActual,
    elapsedMs,
    totalExpectedKana,
    correctKanaCount,
    perKana,
    wordTimings: [],
  })
}

export function buildEvaluation(input: Omit<BatchEvaluation, 'kpm' | 'accuracy'>): BatchEvaluation {
  const elapsedMinutes = Math.max(input.elapsedMs, 1) / 60000

  return {
    ...input,
    kpm: input.totalExpectedKana === 0 ? 0 : input.correctKanaCount / elapsedMinutes,
    accuracy: input.totalExpectedKana === 0 ? 0 : input.correctKanaCount / input.totalExpectedKana,
  }
}
