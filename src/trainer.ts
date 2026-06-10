import { getKanaOrder, kanaScriptFor, splitKanaUnits } from './kana'
import type {
  BatchEvaluation,
  BatchResult,
  KanaAttempt,
  KanaStats,
  PracticeMode,
  PracticeSettings,
  PracticeTimeState,
  PracticeWord,
  ProgressState,
  SessionResult,
  WordEntry,
  WordTiming,
} from './types'

export const STORAGE_VERSION = 2

export const DEFAULT_SETTINGS: PracticeSettings = {
  mode: 'hiragana',
  batchSize: 3,
  initialUnlockedCount: 12,
  targetKpm: 80,
  targetAccuracy: 0.95,
  requiredAppearanceCount: 20,
  smoothingAppearanceCount: 20,
  dailyPracticeMinutesGoal: 10,
  visualSeparator: '·',
}

export const JAPANESE_SPACE = '　'

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

export function normalizeSettings(input: Partial<PracticeSettings> = {}): PracticeSettings {
  const mode = isPracticeMode(input.mode) ? input.mode : DEFAULT_SETTINGS.mode
  const visualSeparator = typeof input.visualSeparator === 'string' && input.visualSeparator.length <= 4
    ? input.visualSeparator
    : DEFAULT_SETTINGS.visualSeparator

  return {
    mode,
    batchSize: clampInteger(input.batchSize ?? DEFAULT_SETTINGS.batchSize, 1, 50),
    initialUnlockedCount: clampInteger(input.initialUnlockedCount ?? DEFAULT_SETTINGS.initialUnlockedCount, 1, getKanaOrder(mode).length),
    targetKpm: clampInteger(input.targetKpm ?? DEFAULT_SETTINGS.targetKpm, 1, 400),
    targetAccuracy: clampNumber(input.targetAccuracy ?? DEFAULT_SETTINGS.targetAccuracy, 0.5, 1),
    requiredAppearanceCount: clampInteger(
      input.requiredAppearanceCount ?? readLegacyNumber(input, 'minAttemptsPerKana') ?? DEFAULT_SETTINGS.requiredAppearanceCount,
      1,
      500,
    ),
    smoothingAppearanceCount: clampInteger(
      input.smoothingAppearanceCount ?? readLegacyNumber(input, 'smoothingWindow') ?? DEFAULT_SETTINGS.smoothingAppearanceCount,
      1,
      500,
    ),
    dailyPracticeMinutesGoal: clampInteger(input.dailyPracticeMinutesGoal ?? DEFAULT_SETTINGS.dailyPracticeMinutesGoal, 1, 240),
    visualSeparator,
  }
}

export function createInitialProgress(settings: PracticeSettings = DEFAULT_SETTINGS): ProgressState {
  const normalized = normalizeSettings(settings)
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  const unlockedCountByMode = {} as ProgressState['unlockedCountByMode']
  const currentTargetKanaByMode = {} as ProgressState['currentTargetKanaByMode']
  const kanaStats: Record<string, KanaStats> = {}

  for (const mode of modes) {
    const order = getKanaOrder(mode)
    const unlockedCount = Math.min(normalized.initialUnlockedCount, order.length)
    unlockedCountByMode[mode] = unlockedCount
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

  const candidate = raw as Partial<ProgressState> & LegacyProgressState
  const progress = createInitialProgress(settings)
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  progress.mode = isPracticeMode(candidate.mode) ? candidate.mode : settings.mode

  for (const mode of modes) {
    const order = getKanaOrder(mode)
    const inputCount = candidate.unlockedCountByMode?.[mode]
    progress.unlockedCountByMode[mode] = clampInteger(
      typeof inputCount === 'number' ? inputCount : settings.initialUnlockedCount,
      1,
      order.length,
    )

    const inputTarget = candidate.currentTargetKanaByMode?.[mode]
    progress.currentTargetKanaByMode[mode] = order.includes(inputTarget ?? '') ? inputTarget! : order[0]
  }

  const mergedRawStats = collectRawKanaStats(candidate)
  for (const kana of Object.keys(progress.kanaStats)) {
    progress.kanaStats[kana] = normalizeKanaStats(kana, mergedRawStats[kana], settings)
  }

  progress.sessionHistory = Array.isArray(candidate.sessionHistory)
    ? candidate.sessionHistory.map(normalizeSessionResult).filter(Boolean).slice(-100) as SessionResult[]
    : []
  progress.practiceTime = normalizePracticeTime(candidate.practiceTime)
  progress.nextAttemptNumber = clampInteger(candidate.nextAttemptNumber ?? inferNextAttemptNumber(progress.kanaStats), 1, 1_000_000_000)

  return progress
}

export function getUnlockedKana(progress: ProgressState, mode: PracticeMode = progress.mode): string[] {
  return getKanaOrder(mode).slice(0, progress.unlockedCountByMode[mode])
}

export function matchesMode(word: WordEntry, mode: PracticeMode): boolean {
  if (mode === 'mixed') return true
  if (word.kanaScript === mode) return true
  return kanaScriptFor(word.kana) === mode
}

export function isWordUnlocked(word: WordEntry, unlockedKana: Set<string>): boolean {
  return splitKanaUnits(word.kana).every((unit) => unlockedKana.has(unit))
}

export function containsTargetKana(word: WordEntry, targetKana: string): boolean {
  return splitKanaUnits(word.kana).includes(targetKana)
}

export function generateBatch(
  words: WordEntry[],
  settings: PracticeSettings,
  progress: ProgressState,
  random: () => number = Math.random,
): BatchResult {
  const normalized = normalizeSettings(settings)
  const mode = normalized.mode
  const unlockedKana = new Set(getUnlockedKana(progress, mode))
  const targetKana = progress.currentTargetKanaByMode[mode]
  const eligibleWords = words
    .filter((word) => !word.synthetic)
    .filter((word) => matchesMode(word, mode))
    .filter((word) => isWordUnlocked(word, unlockedKana))
    .filter((word) => containsTargetKana(word, targetKana))

  if (eligibleWords.length === 0) {
    return {
      words: [],
      warning: `No eligible real words for ${targetKana} yet. Expand the word list or unlock more kana.`,
    }
  }

  let batch = takeShuffled(eligibleWords, Math.min(normalized.batchSize, eligibleWords.length), random)
  while (batch.length < normalized.batchSize) {
    batch.push(eligibleWords[Math.floor(random() * eligibleWords.length)])
  }
  if (normalized.batchSize > eligibleWords.length) batch = shuffleArray(batch, random)

  return {
    words: batch.map((word, index) => ({ ...word, repetitionId: `${word.id}-${index}` })),
    warning: normalized.batchSize > eligibleWords.length
      ? `Duplicated ${eligibleWords.length} eligible real word${eligibleWords.length === 1 ? '' : 's'} to fill this batch.`
      : null,
  }
}

export function expectedText(words: Array<Pick<WordEntry, 'kana'>>): string {
  return words.map((word) => word.kana).join(JAPANESE_SPACE)
}

export function normalizeTypedText(value: string): string {
  return value.trim().split(/[\s　]+/u).filter(Boolean).join(JAPANESE_SPACE)
}

export function evaluateBatch(expected: string, typed: string, elapsedMs: number): BatchEvaluation {
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

export function applyEvaluationToProgress(
  progress: ProgressState,
  settings: PracticeSettings,
  evaluation: BatchEvaluation,
  words: PracticeWord[],
  now = Date.now(),
): ProgressState {
  const mode = settings.mode
  const next: ProgressState = structuredClone(progress)
  const attemptNumber = next.nextAttemptNumber
  next.mode = mode
  next.nextAttemptNumber += 1

  for (const [kana, attempt] of Object.entries(evaluation.perKana)) {
    if (attempt.appearanceCount <= 0) continue
    const stats = next.kanaStats[kana] ?? createEmptyKanaStats(kana)
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
    next.kanaStats[kana] = stats
  }

  const sessionResult: SessionResult = {
    timestamp: now,
    mode,
    targetKana: progress.currentTargetKanaByMode[mode],
    words: words.map((word) => word.kana),
    elapsedMs: evaluation.elapsedMs,
    kpm: evaluation.kpm,
    accuracy: evaluation.accuracy,
    wordTimings: evaluation.wordTimings,
  }
  next.sessionHistory = [...next.sessionHistory, sessionResult].slice(-100)
  next.practiceTime = addPracticeTime(next.practiceTime, evaluation.elapsedMs, now)
  next.currentTargetKanaByMode[mode] = chooseNextTargetKana(next, settings)

  return next
}

export function chooseNextTargetKana(progress: ProgressState, settings: PracticeSettings): string {
  const mode = settings.mode
  const order = getKanaOrder(mode)
  const unlocked = order.slice(0, progress.unlockedCountByMode[mode])

  for (const kana of unlocked) {
    const stats = progress.kanaStats[kana] ?? createEmptyKanaStats(kana)
    refreshSmoothedStats(stats, settings)
    progress.kanaStats[kana] = stats
    if (!stats.passed) return kana
  }

  if (progress.unlockedCountByMode[mode] < order.length) {
    progress.unlockedCountByMode[mode] += 1
    return order[progress.unlockedCountByMode[mode] - 1]
  }

  return findWeakestKana(progress.kanaStats, order)
}

export function refreshSmoothedStats(stats: KanaStats, settings: PracticeSettings): KanaStats {
  const recent = getSmoothingAttempts(stats.history, settings.smoothingAppearanceCount)
  const totalCorrect = recent.reduce((sum, attempt) => sum + attempt.correctCount, 0)
  const totalAppearances = recent.reduce((sum, attempt) => sum + attempt.appearanceCount, 0)
  const totalAllocatedMs = recent.reduce((sum, attempt) => sum + attempt.allocatedMs, 0)

  stats.smoothedAccuracy = totalAppearances === 0 ? 0 : totalCorrect / totalAppearances
  stats.smoothedKpm = totalCorrect === 0 ? 0 : totalCorrect / (Math.max(totalAllocatedMs, 1) / 60000)
  stats.passed = isKanaPassed(stats, settings)
  return stats
}

export function getSmoothingAttempts(history: KanaAttempt[], minimumAppearances: number): KanaAttempt[] {
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

export function refreshProgressPassFlags(progress: ProgressState, settings: PracticeSettings): ProgressState {
  const next: ProgressState = structuredClone(progress)

  for (const stats of Object.values(next.kanaStats)) {
    refreshSmoothedStats(stats, settings)
  }
  next.practiceTime = normalizePracticeTime(next.practiceTime)

  return next
}

export function isKanaPassed(stats: KanaStats, settings: PracticeSettings): boolean {
  return stats.appearances >= settings.requiredAppearanceCount
    && stats.smoothedKpm >= settings.targetKpm
    && stats.smoothedAccuracy >= settings.targetAccuracy
}

export function progressSummary(progress: ProgressState, settings: PracticeSettings) {
  const mode = settings.mode
  const unlocked = getUnlockedKana(progress, mode)
  const current = progress.currentTargetKanaByMode[mode]
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

export function addPracticeTime(practiceTime: PracticeTimeState, elapsedMs: number, now = Date.now()): PracticeTimeState {
  const normalized = normalizePracticeTime(practiceTime, now)
  const safeElapsedMs = Math.max(0, elapsedMs)
  return {
    todayDate: normalized.todayDate,
    todayMs: normalized.todayMs + safeElapsedMs,
    totalMs: normalized.totalMs + safeElapsedMs,
  }
}

function takeShuffled<T>(items: T[], count: number, random: () => number): T[] {
  return shuffleArray(items, random).slice(0, count)
}

function shuffleArray<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function findWeakestKana(stats: Record<string, KanaStats>, order: string[]): string {
  return [...order].sort((a, b) => {
    const left = stats[a] ?? createEmptyKanaStats(a)
    const right = stats[b] ?? createEmptyKanaStats(b)
    if (left.smoothedAccuracy !== right.smoothedAccuracy) return left.smoothedAccuracy - right.smoothedAccuracy
    return left.smoothedKpm - right.smoothedKpm
  })[0]
}

function normalizeKanaStats(kana: string, raw: unknown, settings: PracticeSettings): KanaStats {
  if (!raw || typeof raw !== 'object') return createEmptyKanaStats(kana)
  const input = raw as Partial<KanaStats> & LegacyKanaStats
  const legacyRecent = Array.isArray(input.recentAttempts) ? input.recentAttempts : []
  const history = Array.isArray(input.history)
    ? input.history.map(normalizeKanaAttempt).filter(Boolean) as KanaAttempt[]
    : legacyRecent.map((attempt, index) => legacyAttemptToHistory(attempt, index + 1)).filter(Boolean) as KanaAttempt[]

  const appearances = typeof input.appearances === 'number'
    ? Math.max(0, input.appearances)
    : Math.max(0, input.exposures ?? history.reduce((sum, attempt) => sum + attempt.appearanceCount, 0))
  const correct = Math.max(0, input.correct ?? history.reduce((sum, attempt) => sum + attempt.correctCount, 0))
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

function normalizeKanaAttempt(raw: unknown): KanaAttempt | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<KanaAttempt>
  if (typeof input.appearanceCount !== 'number') return null
  return {
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    attemptNumber: typeof input.attemptNumber === 'number' ? input.attemptNumber : 1,
    appearanceCount: Math.max(0, input.appearanceCount),
    correctCount: clampInteger(input.correctCount ?? 0, 0, Math.max(0, input.appearanceCount)),
    allocatedMs: Math.max(0, typeof input.allocatedMs === 'number' ? input.allocatedMs : 0),
  }
}

function legacyAttemptToHistory(raw: unknown, attemptNumber: number): KanaAttempt | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as { timestamp?: number; exposures?: number; correct?: number; incorrect?: number; kpm?: number }
  const appearanceCount = Math.max(0, input.exposures ?? ((input.correct ?? 0) + (input.incorrect ?? 0)))
  const correctCount = clampInteger(input.correct ?? 0, 0, appearanceCount)
  const allocatedMs = input.kpm && input.kpm > 0 ? (correctCount / input.kpm) * 60000 : appearanceCount * 1000
  return {
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    attemptNumber,
    appearanceCount,
    correctCount,
    allocatedMs,
  }
}

function collectRawKanaStats(candidate: Partial<ProgressState> & LegacyProgressState): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(candidate.kanaStats ?? {}) }
  if (!candidate.kanaStatsByMode || typeof candidate.kanaStatsByMode !== 'object') return result

  for (const statsByKana of Object.values(candidate.kanaStatsByMode)) {
    if (!statsByKana || typeof statsByKana !== 'object') continue
    for (const [kana, rawStats] of Object.entries(statsByKana)) {
      result[kana] ??= rawStats
    }
  }

  return result
}

function normalizeSessionResult(raw: unknown): SessionResult | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<SessionResult>
  if (!isPracticeMode(input.mode) || typeof input.targetKana !== 'string' || !Array.isArray(input.words)) return null
  return {
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    mode: input.mode,
    targetKana: input.targetKana,
    words: input.words.filter((word): word is string => typeof word === 'string'),
    elapsedMs: Math.max(0, typeof input.elapsedMs === 'number' ? input.elapsedMs : 0),
    kpm: Math.max(0, typeof input.kpm === 'number' ? input.kpm : 0),
    accuracy: clampNumber(input.accuracy ?? 0, 0, 1),
    wordTimings: Array.isArray(input.wordTimings) ? input.wordTimings.map(normalizeWordTiming).filter(Boolean) as WordTiming[] : [],
  }
}

function normalizeWordTiming(raw: unknown): WordTiming | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<WordTiming>
  if (typeof input.word !== 'string' || typeof input.index !== 'number') return null
  return {
    word: input.word,
    index: input.index,
    durationMs: Math.max(0, typeof input.durationMs === 'number' ? input.durationMs : 0),
    completedAtMs: Math.max(0, typeof input.completedAtMs === 'number' ? input.completedAtMs : 0),
  }
}

function inferNextAttemptNumber(stats: Record<string, KanaStats>): number {
  const maxAttempt = Object.values(stats).flatMap((kanaStats) => kanaStats.history).reduce((max, attempt) => Math.max(max, attempt.attemptNumber), 0)
  return maxAttempt + 1
}

function readLegacyNumber(input: object, key: string): number | undefined {
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

function isPracticeMode(value: unknown): value is PracticeMode {
  return value === 'hiragana' || value === 'katakana' || value === 'mixed'
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

type LegacyKanaStats = {
  exposures?: number
  recentAttempts?: unknown[]
}

type LegacyProgressState = {
  kanaStatsByMode?: Partial<Record<PracticeMode, Record<string, unknown>>>
}
