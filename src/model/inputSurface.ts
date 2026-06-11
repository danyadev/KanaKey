import { splitKanaUnits } from './kana'
import { buildEvaluation, JAPANESE_SPACE } from './evaluation'
import type { BatchEvaluation, KanaAttemptEvaluation, PerKanaEvaluation, WordTiming } from './evaluation'
import type { PracticeWord } from './words'

export type TargetKanaUnit = {
  kana: string
  wordIndex: number
  unitIndex: number
  globalIndex: number
  word: string
  isWordEnd: boolean
}

export type InputSurfaceState = {
  units: TargetKanaUnit[]
  cursorIndex: number
  acceptedUnits: string[]
  mistakesByIndex: number[]
  firstMistakeByIndex: Array<string | null>
  allocatedMsByIndex: number[]
  wordTimings: WordTiming[]
  wrongCurrent: boolean
  startedAt: number | null
  lastUnitStartedAt: number | null
  currentWordStartedAt: number | null
  completed: boolean
}

export type SurfaceUnitView = TargetKanaUnit & {
  status: 'completed' | 'current' | 'future'
  wrong: boolean
}

export type SurfaceWordView = {
  word: string
  index: number
  units: SurfaceUnitView[]
}

type TargetWordInput = Array<Pick<PracticeWord, 'kana'>>

export function createInputSurfaceState(
  words: TargetWordInput,
  now: number | null = null,
): InputSurfaceState {
  const units = flattenTargetWords(words)
  return {
    units,
    cursorIndex: 0,
    acceptedUnits: [],
    mistakesByIndex: Array.from({ length: units.length }, () => 0),
    firstMistakeByIndex: Array.from({ length: units.length }, () => null),
    allocatedMsByIndex: Array.from({ length: units.length }, () => 0),
    wordTimings: [],
    wrongCurrent: false,
    startedAt: now,
    lastUnitStartedAt: now,
    currentWordStartedAt: now,
    completed: units.length === 0,
  }
}

export function commitKanaInput(state: InputSurfaceState, value: string, now = Date.now()): InputSurfaceState {
  const committedUnits = splitKanaUnits(value)
  if (committedUnits.length === 0 || state.completed) {
    return state
  }

  let next = ensureStarted(state, now)

  for (const committedUnit of committedUnits) {
    if (next.completed) break

    const current = next.units[next.cursorIndex]
    if (!current) {
      next = { ...next, completed: true }
      break
    }

    if (committedUnit !== current.kana) {
      const mistakesByIndex = [...next.mistakesByIndex]
      const firstMistakeByIndex = [...next.firstMistakeByIndex]
      const allocatedMsByIndex = [...next.allocatedMsByIndex]
      mistakesByIndex[next.cursorIndex] += 1
      firstMistakeByIndex[next.cursorIndex] ??= committedUnit
      allocatedMsByIndex[next.cursorIndex] += Math.max(0, now - (next.lastUnitStartedAt ?? now))
      next = {
        ...next,
        mistakesByIndex,
        firstMistakeByIndex,
        allocatedMsByIndex,
        lastUnitStartedAt: now,
        wrongCurrent: true,
      }
      continue
    }

    const allocatedMsByIndex = [...next.allocatedMsByIndex]
    allocatedMsByIndex[next.cursorIndex] += Math.max(0, now - (next.lastUnitStartedAt ?? now))
    const acceptedUnits = [...next.acceptedUnits, committedUnit]
    const nextCursorIndex = next.cursorIndex + 1
    const wordTimings = current.isWordEnd
      ? [...next.wordTimings, buildWordTiming(current, next, now)]
      : next.wordTimings

    next = {
      ...next,
      cursorIndex: nextCursorIndex,
      acceptedUnits,
      allocatedMsByIndex,
      wordTimings,
      wrongCurrent: false,
      lastUnitStartedAt: now,
      currentWordStartedAt: current.isWordEnd ? now : next.currentWordStartedAt,
      completed: nextCursorIndex >= next.units.length,
    }
  }

  return next
}

export function markCurrentKanaAttemptMistake(
  state: InputSurfaceState,
  mistakeKana: string,
): InputSurfaceState {
  if (state.completed || state.cursorIndex >= state.units.length || mistakeKana.length === 0) {
    return state
  }

  const firstMistakeByIndex = [...state.firstMistakeByIndex]
  firstMistakeByIndex[state.cursorIndex] ??= mistakeKana
  return { ...state, firstMistakeByIndex, wrongCurrent: true }
}

export function buildInputEvaluation(state: InputSurfaceState, completedAt = Date.now()): BatchEvaluation {
  const elapsedMs = state.startedAt === null ? 0 : Math.max(0, completedAt - state.startedAt)
  const perKana: Record<string, PerKanaEvaluation> = {}
  const kanaAttempts: KanaAttemptEvaluation[] = []
  let correctKanaCount = 0

  state.units.forEach((unit, index) => {
    const wasCompleted = index < state.cursorIndex
    const finalCorrect = wasCompleted && state.acceptedUnits[index] === unit.kana
    const firstTryCorrect = finalCorrect
      && state.mistakesByIndex[index] === 0
      && state.firstMistakeByIndex[index] === null
    const correct = firstTryCorrect
    if (correct) correctKanaCount += 1
    perKana[unit.kana] ??= { appearanceCount: 0, correctCount: 0, allocatedMs: 0 }
    perKana[unit.kana].appearanceCount += 1
    perKana[unit.kana].allocatedMs += state.allocatedMsByIndex[index]
    if (correct) perKana[unit.kana].correctCount += 1
    kanaAttempts.push({
      kana: unit.kana,
      firstTryCorrect,
      finalCorrect,
      reactionMs: state.allocatedMsByIndex[index],
      mistakeKana: state.firstMistakeByIndex[index],
    })
  })

  return buildEvaluation({
    expected: expectedTextFromUnits(state.units),
    actual: acceptedTextFromState(state),
    elapsedMs,
    totalExpectedKana: state.units.length,
    correctKanaCount,
    perKana,
    kanaAttempts,
    wordTimings: state.wordTimings,
  })
}

export function getSurfaceWordViews(state: InputSurfaceState): SurfaceWordView[] {
  const words = new Map<number, SurfaceWordView>()

  for (const unit of state.units) {
    const word = words.get(unit.wordIndex) ?? { word: unit.word, index: unit.wordIndex, units: [] }
    const status = unit.globalIndex < state.cursorIndex
      ? 'completed'
      : unit.globalIndex === state.cursorIndex
        ? 'current'
        : 'future'
    word.units.push({
      ...unit,
      status,
      wrong: status === 'current' && state.wrongCurrent,
    })
    words.set(unit.wordIndex, word)
  }

  return [...words.values()]
}

export function getCurrentWordRemainder(words: SurfaceWordView[]): string {
  const word = words.find((word) => (
    word.units.some((unit) => unit.status === 'current')
  ))
  if (!word) return ''

  return word.units
    .filter((unit) => unit.status !== 'completed')
    .map((unit) => unit.kana)
    .join('')
}

function flattenTargetWords(words: Array<Pick<PracticeWord, 'kana'>>): TargetKanaUnit[] {
  const units: TargetKanaUnit[] = []
  words.forEach((word, wordIndex) => {
    const wordUnits = splitKanaUnits(word.kana)
    wordUnits.forEach((kana, unitIndex) => {
      units.push({
        kana,
        wordIndex,
        unitIndex,
        globalIndex: units.length,
        word: word.kana,
        isWordEnd: unitIndex === wordUnits.length - 1,
      })
    })
  })
  return units
}

function ensureStarted(state: InputSurfaceState, now: number): InputSurfaceState {
  if (state.startedAt !== null) return state
  return {
    ...state,
    startedAt: now,
    lastUnitStartedAt: now,
    currentWordStartedAt: now,
  }
}

function buildWordTiming(unit: TargetKanaUnit, state: InputSurfaceState, now: number): WordTiming {
  const startedAt = state.startedAt ?? now
  const wordStartedAt = state.currentWordStartedAt ?? startedAt
  return {
    word: unit.word,
    index: unit.wordIndex,
    durationMs: Math.max(0, now - wordStartedAt),
    completedAtMs: Math.max(0, now - startedAt),
  }
}

function expectedTextFromUnits(units: TargetKanaUnit[]): string {
  const words = new Map<number, string>()
  for (const unit of units) words.set(unit.wordIndex, unit.word)
  return [...words.values()].join(JAPANESE_SPACE)
}

function acceptedTextFromState(state: InputSurfaceState): string {
  const words = new Map<number, string[]>()
  for (const unit of state.units.slice(0, state.cursorIndex)) {
    const accepted = words.get(unit.wordIndex) ?? []
    accepted.push(unit.kana)
    words.set(unit.wordIndex, accepted)
  }
  return [...words.values()].map((units) => units.join('')).join(JAPANESE_SPACE)
}
