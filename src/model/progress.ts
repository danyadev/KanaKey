import { getKanaOrder } from './kana'
import {
  INITIAL_UNLOCKED_COUNT,
  REQUIRED_APPEARANCE_COUNT,
  isPracticeMode,
  maxInitialUnlockCount,
  normalizeSettings,
} from './settings'
import type { BatchEvaluation, WordTiming } from './evaluation'
import type { PracticeMode } from './modes'
import type { PracticeSettings } from './settings'
import type { PracticeWord } from './words'

export type KanaAttempt = {
  timestamp: number
  attemptNumber: number
  appearanceCount: number
  correctCount: number
  allocatedMs: number
}

export type KanaStats = {
  kana: string
  attempts: number
  appearances: number
  correct: number
  incorrect: number
  history: KanaAttempt[]
  smoothedKpm: number
  smoothedAccuracy: number
  passed: boolean
  lastSeenAt: number | null
}

export type SessionResult = {
  timestamp: number
  mode: PracticeMode
  targetKana: string
  words: string[]
  elapsedMs: number
  kpm: number
  accuracy: number
  wordTimings: WordTiming[]
}

export type PracticeTimeState = {
  todayDate: string
  todayMs: number
  totalMs: number
}

export type ProgressState = {
  mode: PracticeMode
  unlockedCountByMode: Record<PracticeMode, number>
  currentTargetKanaByMode: Record<PracticeMode, string>
  kanaStats: Record<string, KanaStats>
  sessionHistory: SessionResult[]
  practiceTime: PracticeTimeState
  nextAttemptNumber: number
}

type TargetAdvance = {
  targetKana: string
  unlockedCount: number
}

export function createEmptyKanaStats(kana: string): KanaStats {
  return {
    kana,
    attempts: 0,
    appearances: 0,
    correct: 0,
    incorrect: 0,
    history: [],
    smoothedKpm: 0,
    smoothedAccuracy: 0,
    passed: false,
    lastSeenAt: null,
  }
}

export function createInitialProgress(settings: PracticeSettings): ProgressState {
  const normalized = normalizeSettings(settings)
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  const unlockedCountByMode = {} as ProgressState['unlockedCountByMode']
  const currentTargetKanaByMode = {} as ProgressState['currentTargetKanaByMode']
  const kanaStats: Record<string, KanaStats> = {}

  for (const mode of modes) {
    const order = getKanaOrder(mode)
    unlockedCountByMode[mode] = maxInitialUnlockCount(mode)
    currentTargetKanaByMode[mode] = order[0]
    for (const kana of order) kanaStats[kana] ??= createEmptyKanaStats(kana)
  }

  return {
    mode: normalized.mode,
    unlockedCountByMode,
    currentTargetKanaByMode,
    kanaStats,
    sessionHistory: [],
    practiceTime: normalizePracticeTime(null),
    nextAttemptNumber: 1,
  }
}

export function ensureProgress(raw: unknown, settings: PracticeSettings): ProgressState {
  const fallback = createInitialProgress(settings)
  if (!raw || typeof raw !== 'object') return fallback

  const candidate = raw as Partial<ProgressState>
  const progress = createInitialProgress(settings)
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  progress.mode = isPracticeMode(candidate.mode) ? candidate.mode : settings.mode

  for (const mode of modes) {
    const order = getKanaOrder(mode)
    const inputCount = candidate.unlockedCountByMode?.[mode]
    progress.unlockedCountByMode[mode] = clampInteger(
      typeof inputCount === 'number' ? inputCount : INITIAL_UNLOCKED_COUNT,
      1,
      order.length,
    )

    const inputTarget = candidate.currentTargetKanaByMode?.[mode]
    progress.currentTargetKanaByMode[mode] = order.includes(inputTarget ?? '')
      ? inputTarget!
      : order[0]
  }

  for (const kana of Object.keys(progress.kanaStats)) {
    progress.kanaStats[kana] = normalizeKanaStats(kana, candidate.kanaStats?.[kana], settings)
  }

  progress.sessionHistory = Array.isArray(candidate.sessionHistory)
    ? candidate.sessionHistory.map(normalizeSessionResult).filter(Boolean).slice(-100) as SessionResult[]
    : []
  progress.practiceTime = normalizePracticeTime(candidate.practiceTime)
  progress.nextAttemptNumber = clampInteger(
    candidate.nextAttemptNumber ?? inferNextAttemptNumber(progress.kanaStats),
    1,
    1_000_000_000,
  )

  return progress
}

export function getUnlockedKana(
  progress: ProgressState,
  mode: PracticeMode = progress.mode,
): string[] {
  return getKanaOrder(mode).slice(0, progress.unlockedCountByMode[mode])
}

export function applyEvaluationToProgress(
  progress: ProgressState,
  settings: PracticeSettings,
  evaluation: BatchEvaluation,
  words: PracticeWord[],
  now = Date.now(),
): ProgressState {
  const next = cloneProgressState(progress)
  const mode = settings.mode
  const attemptNumber = next.nextAttemptNumber
  next.mode = mode
  next.nextAttemptNumber += 1

  for (const [kana, attempt] of Object.entries(evaluation.perKana)) {
    applyKanaAttempt(next, settings, kana, attempt, attemptNumber, now)
  }

  next.sessionHistory = [
    ...next.sessionHistory,
    createSessionResult(progress, settings, evaluation, words, now),
  ].slice(-100)
  next.practiceTime = addPracticeTime(next.practiceTime, evaluation.elapsedMs, now)

  return advanceTargetsAfterAttempt(next, settings)
}

export function chooseNextTargetKana(
  progress: ProgressState,
  settings: PracticeSettings,
): string {
  return getNextTargetAdvance(progress, settings).targetKana
}

export function advanceTargetsAfterAttempt(
  progress: ProgressState,
  settings: PracticeSettings,
): ProgressState {
  const next = cloneProgressState(progress)

  if (settings.mode === 'mixed') {
    applyTargetAdvance(next, 'hiragana', getNextTargetAdvance(next, { ...settings, mode: 'hiragana' }))
    applyTargetAdvance(next, 'katakana', getNextTargetAdvance(next, { ...settings, mode: 'katakana' }))
    return next
  }

  applyTargetAdvance(next, settings.mode, getNextTargetAdvance(next, settings))
  return next
}

export function refreshSmoothedStats(
  stats: KanaStats,
  settings: PracticeSettings,
): KanaStats {
  const recent = getSmoothingAttempts(stats.history, settings.smoothingAppearanceCount)
  const totalCorrect = recent.reduce((sum, attempt) => sum + attempt.correctCount, 0)
  const totalAppearances = recent.reduce((sum, attempt) => sum + attempt.appearanceCount, 0)
  const totalAllocatedMs = recent.reduce((sum, attempt) => sum + attempt.allocatedMs, 0)

  stats.smoothedAccuracy = totalAppearances === 0 ? 0 : totalCorrect / totalAppearances
  stats.smoothedKpm = totalCorrect === 0
    ? 0
    : totalCorrect / (Math.max(totalAllocatedMs, 1) / 60000)
  stats.passed = isKanaPassed(stats, settings)
  return stats
}

export function getSmoothingAttempts(
  history: KanaAttempt[],
  minimumAppearances: number,
): KanaAttempt[] {
  const recent: KanaAttempt[] = []
  let appearances = 0

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const attempt = history[index]
    recent.unshift(attempt)
    appearances += attempt.appearanceCount
    if (appearances >= minimumAppearances) break
  }

  return recent
}

export function refreshProgressPassFlags(
  progress: ProgressState,
  settings: PracticeSettings,
): ProgressState {
  const next = cloneProgressState(progress)

  for (const stats of Object.values(next.kanaStats)) {
    refreshSmoothedStats(stats, settings)
  }
  next.practiceTime = normalizePracticeTime(next.practiceTime)

  return next
}

export function isKanaPassed(stats: KanaStats, settings: PracticeSettings): boolean {
  return stats.appearances >= REQUIRED_APPEARANCE_COUNT
    && stats.smoothedKpm >= settings.targetKpm
    && stats.smoothedAccuracy >= settings.targetAccuracy
}

export function progressSummary(progress: ProgressState, settings: PracticeSettings) {
  const mode = settings.mode
  const unlocked = getUnlockedKana(progress, mode)
  const current = mode === 'mixed'
    ? `${progress.currentTargetKanaByMode.hiragana} / ${progress.currentTargetKanaByMode.katakana}`
    : progress.currentTargetKanaByMode[mode]
  const weak = unlocked.filter((kana) => {
    const kanaStats = progress.kanaStats[kana]
    return kanaStats.appearances > 0 && !kanaStats.passed
  })
  const passed = unlocked.filter((kana) => progress.kanaStats[kana]?.passed)

  return { mode, unlocked, current, weak, passed }
}

export function normalizePracticeTime(raw: unknown, now = Date.now()): PracticeTimeState {
  const todayDate = localDateKey(now)
  if (!raw || typeof raw !== 'object') {
    return { todayDate, todayMs: 0, totalMs: 0 }
  }

  const input = raw as Partial<PracticeTimeState>
  const storedTodayDate = typeof input.todayDate === 'string' ? input.todayDate : todayDate
  const todayMs = Math.max(0, typeof input.todayMs === 'number' ? input.todayMs : 0)
  const totalMs = Math.max(todayMs, typeof input.totalMs === 'number' ? input.totalMs : todayMs)

  return {
    todayDate,
    todayMs: storedTodayDate === todayDate ? todayMs : 0,
    totalMs,
  }
}

export function addPracticeTime(
  practiceTime: PracticeTimeState,
  elapsedMs: number,
  now = Date.now(),
): PracticeTimeState {
  const normalized = normalizePracticeTime(practiceTime, now)
  const safeElapsedMs = Math.max(0, elapsedMs)

  return {
    todayDate: normalized.todayDate,
    todayMs: normalized.todayMs + safeElapsedMs,
    totalMs: normalized.totalMs + safeElapsedMs,
  }
}

function applyKanaAttempt(
  progress: ProgressState,
  settings: PracticeSettings,
  kana: string,
  attempt: BatchEvaluation['perKana'][string],
  attemptNumber: number,
  now: number,
): void {
  if (attempt.appearanceCount <= 0) return

  const stats = progress.kanaStats[kana] ?? createEmptyKanaStats(kana)
  const correctCount = clampInteger(attempt.correctCount, 0, attempt.appearanceCount)
  stats.attempts += 1
  stats.appearances += attempt.appearanceCount
  stats.correct += correctCount
  stats.incorrect += attempt.appearanceCount - correctCount
  stats.lastSeenAt = now
  stats.history.push({
    timestamp: now,
    attemptNumber,
    appearanceCount: attempt.appearanceCount,
    correctCount,
    allocatedMs: Math.max(0, attempt.allocatedMs),
  })
  refreshSmoothedStats(stats, settings)
  progress.kanaStats[kana] = stats
}

function createSessionResult(
  progress: ProgressState,
  settings: PracticeSettings,
  evaluation: BatchEvaluation,
  words: PracticeWord[],
  now: number,
): SessionResult {
  return {
    timestamp: now,
    mode: settings.mode,
    targetKana: getSessionTargetLabel(progress, settings),
    words: words.map((word) => word.kana),
    elapsedMs: evaluation.elapsedMs,
    kpm: evaluation.kpm,
    accuracy: evaluation.accuracy,
    wordTimings: evaluation.wordTimings,
  }
}

function getSessionTargetLabel(progress: ProgressState, settings: PracticeSettings): string {
  if (settings.mode !== 'mixed') return progress.currentTargetKanaByMode[settings.mode]

  return `${progress.currentTargetKanaByMode.hiragana} / ${progress.currentTargetKanaByMode.katakana}`
}

function getNextTargetAdvance(
  progress: ProgressState,
  settings: PracticeSettings,
): TargetAdvance {
  const mode = settings.mode
  const order = getKanaOrder(mode)
  const unlockedCount = progress.unlockedCountByMode[mode]
  const unlocked = order.slice(0, unlockedCount)

  for (const kana of unlocked) {
    const stats = cloneKanaStats(progress.kanaStats[kana] ?? createEmptyKanaStats(kana))
    refreshSmoothedStats(stats, settings)
    if (!stats.passed) return { targetKana: kana, unlockedCount }
  }

  if (unlockedCount < order.length) {
    const nextUnlockedCount = unlockedCount + 1
    return {
      targetKana: order[nextUnlockedCount - 1],
      unlockedCount: nextUnlockedCount,
    }
  }

  return {
    targetKana: findWeakestKana(progress.kanaStats, order),
    unlockedCount,
  }
}

function applyTargetAdvance(
  progress: ProgressState,
  mode: PracticeMode,
  advance: TargetAdvance,
): void {
  progress.currentTargetKanaByMode[mode] = advance.targetKana
  progress.unlockedCountByMode[mode] = advance.unlockedCount
}

function findWeakestKana(stats: Record<string, KanaStats>, order: string[]): string {
  return [...order].sort((a, b) => {
    const left = stats[a] ?? createEmptyKanaStats(a)
    const right = stats[b] ?? createEmptyKanaStats(b)
    if (left.smoothedAccuracy !== right.smoothedAccuracy) {
      return left.smoothedAccuracy - right.smoothedAccuracy
    }
    return left.smoothedKpm - right.smoothedKpm
  })[0]
}

function normalizeKanaStats(
  kana: string,
  raw: unknown,
  settings: PracticeSettings,
): KanaStats {
  if (!raw || typeof raw !== 'object') return createEmptyKanaStats(kana)

  const input = raw as Partial<KanaStats>
  const history = Array.isArray(input.history)
    ? input.history.map(normalizeKanaAttempt).filter(Boolean) as KanaAttempt[]
    : []
  const appearances = typeof input.appearances === 'number'
    ? Math.max(0, input.appearances)
    : history.reduce((sum, attempt) => sum + attempt.appearanceCount, 0)
  const correct = Math.max(
    0,
    input.correct ?? history.reduce((sum, attempt) => sum + attempt.correctCount, 0),
  )
  const incorrect = Math.max(0, input.incorrect ?? Math.max(0, appearances - correct))

  const stats: KanaStats = {
    ...createEmptyKanaStats(kana),
    attempts: typeof input.attempts === 'number' ? Math.max(0, input.attempts) : history.length,
    appearances,
    correct,
    incorrect,
    history,
    lastSeenAt: typeof input.lastSeenAt === 'number' ? input.lastSeenAt : null,
  }

  if (stats.history.length === 0 && appearances > 0) {
    stats.history.push({
      timestamp: stats.lastSeenAt ?? Date.now(),
      attemptNumber: 1,
      appearanceCount: appearances,
      correctCount: correct,
      allocatedMs: 60_000,
    })
    stats.attempts = Math.max(stats.attempts, 1)
  }

  return refreshSmoothedStats(stats, settings)
}

function cloneProgressState(progress: ProgressState): ProgressState {
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  const unlockedCountByMode = {} as ProgressState['unlockedCountByMode']
  const currentTargetKanaByMode = {} as ProgressState['currentTargetKanaByMode']

  for (const mode of modes) {
    unlockedCountByMode[mode] = progress.unlockedCountByMode[mode]
    currentTargetKanaByMode[mode] = progress.currentTargetKanaByMode[mode]
  }

  return {
    mode: progress.mode,
    unlockedCountByMode,
    currentTargetKanaByMode,
    kanaStats: Object.fromEntries(
      Object.entries(progress.kanaStats).map(([kana, stats]) => [kana, cloneKanaStats(stats)]),
    ),
    sessionHistory: progress.sessionHistory.map(cloneSessionResult),
    practiceTime: { ...progress.practiceTime },
    nextAttemptNumber: progress.nextAttemptNumber,
  }
}

function cloneKanaStats(stats: KanaStats): KanaStats {
  return {
    kana: stats.kana,
    attempts: stats.attempts,
    appearances: stats.appearances,
    correct: stats.correct,
    incorrect: stats.incorrect,
    history: stats.history.map((attempt) => ({ ...attempt })),
    smoothedKpm: stats.smoothedKpm,
    smoothedAccuracy: stats.smoothedAccuracy,
    passed: stats.passed,
    lastSeenAt: stats.lastSeenAt,
  }
}

function cloneSessionResult(session: SessionResult): SessionResult {
  return {
    timestamp: session.timestamp,
    mode: session.mode,
    targetKana: session.targetKana,
    words: [...session.words],
    elapsedMs: session.elapsedMs,
    kpm: session.kpm,
    accuracy: session.accuracy,
    wordTimings: session.wordTimings.map((timing) => ({ ...timing })),
  }
}

function normalizeKanaAttempt(raw: unknown): KanaAttempt | null {
  if (!raw || typeof raw !== 'object') return null

  const input = raw as Partial<KanaAttempt>
  if (typeof input.appearanceCount !== 'number') return null

  const appearanceCount = Math.max(0, input.appearanceCount)
  return {
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    attemptNumber: typeof input.attemptNumber === 'number' ? input.attemptNumber : 1,
    appearanceCount,
    correctCount: clampInteger(input.correctCount ?? 0, 0, appearanceCount),
    allocatedMs: Math.max(0, typeof input.allocatedMs === 'number' ? input.allocatedMs : 0),
  }
}

function normalizeSessionResult(raw: unknown): SessionResult | null {
  if (!raw || typeof raw !== 'object') return null

  const input = raw as Partial<SessionResult>
  if (!isPracticeMode(input.mode)) return null
  if (typeof input.targetKana !== 'string') return null
  if (!Array.isArray(input.words)) return null

  return {
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    mode: input.mode,
    targetKana: input.targetKana,
    words: input.words.filter((word): word is string => typeof word === 'string'),
    elapsedMs: Math.max(0, typeof input.elapsedMs === 'number' ? input.elapsedMs : 0),
    kpm: Math.max(0, typeof input.kpm === 'number' ? input.kpm : 0),
    accuracy: clampNumber(input.accuracy ?? 0, 0, 1),
    wordTimings: Array.isArray(input.wordTimings)
      ? input.wordTimings.map(normalizeWordTiming).filter(Boolean) as WordTiming[]
      : [],
  }
}

function normalizeWordTiming(raw: unknown): WordTiming | null {
  if (!raw || typeof raw !== 'object') return null

  const input = raw as Partial<WordTiming>
  if (typeof input.word !== 'string') return null
  if (typeof input.index !== 'number') return null

  return {
    word: input.word,
    index: input.index,
    durationMs: Math.max(0, typeof input.durationMs === 'number' ? input.durationMs : 0),
    completedAtMs: Math.max(0, typeof input.completedAtMs === 'number' ? input.completedAtMs : 0),
  }
}

function inferNextAttemptNumber(stats: Record<string, KanaStats>): number {
  const maxAttempt = Object.values(stats)
    .flatMap((kanaStats) => kanaStats.history)
    .reduce((max, attempt) => Math.max(max, attempt.attemptNumber), 0)
  return maxAttempt + 1
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
