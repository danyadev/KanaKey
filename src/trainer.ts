import { getKanaOrder, kanaScriptFor, splitKanaUnits } from './kana'
import type {
  BatchEvaluation,
  BatchResult,
  KanaStats,
  PracticeMode,
  PracticeSettings,
  PracticeWord,
  ProgressState,
  SessionResult,
  WordEntry,
} from './types'

export const STORAGE_VERSION = 1

export const DEFAULT_SETTINGS: PracticeSettings = {
  mode: 'hiragana',
  batchSize: 10,
  initialUnlockedCount: 5,
  targetKpm: 80,
  targetAccuracy: 0.95,
  minAttemptsPerKana: 3,
  smoothingWindow: 5,
  doubleWords: false,
  shuffleDoubledWords: false,
}

export const JAPANESE_SPACE = '　'

export function createEmptyKanaStats(kana: string): KanaStats {
  return {
    kana,
    attempts: 0,
    exposures: 0,
    correct: 0,
    incorrect: 0,
    recentAttempts: [],
    smoothedKpm: 0,
    smoothedAccuracy: 0,
    passed: false,
    lastSeenAt: null,
  }
}

export function normalizeSettings(input: Partial<PracticeSettings> = {}): PracticeSettings {
  const mode = isPracticeMode(input.mode) ? input.mode : DEFAULT_SETTINGS.mode
  const settings = { ...DEFAULT_SETTINGS, ...input, mode }
  const doubleWords = typeof input.doubleWords === 'boolean' ? input.doubleWords : DEFAULT_SETTINGS.doubleWords
  const shuffleDoubledWords = typeof input.shuffleDoubledWords === 'boolean'
    ? input.shuffleDoubledWords
    : DEFAULT_SETTINGS.shuffleDoubledWords

  return {
    ...settings,
    mode,
    batchSize: clampInteger(settings.batchSize, 1, 50),
    initialUnlockedCount: clampInteger(settings.initialUnlockedCount, 1, getKanaOrder(mode).length),
    targetKpm: clampInteger(settings.targetKpm, 1, 400),
    targetAccuracy: clampNumber(settings.targetAccuracy, 0.5, 1),
    minAttemptsPerKana: clampInteger(settings.minAttemptsPerKana, 1, 20),
    smoothingWindow: clampInteger(settings.smoothingWindow, 1, 20),
    doubleWords,
    shuffleDoubledWords,
  }
}

export function createInitialProgress(settings: PracticeSettings = DEFAULT_SETTINGS): ProgressState {
  const normalized = normalizeSettings(settings)
  const modes: PracticeMode[] = ['hiragana', 'katakana', 'mixed']
  const unlockedCountByMode = {} as ProgressState['unlockedCountByMode']
  const currentTargetKanaByMode = {} as ProgressState['currentTargetKanaByMode']
  const kanaStatsByMode = {} as ProgressState['kanaStatsByMode']

  for (const mode of modes) {
    const order = getKanaOrder(mode)
    const unlockedCount = Math.min(normalized.initialUnlockedCount, order.length)
    unlockedCountByMode[mode] = unlockedCount
    currentTargetKanaByMode[mode] = order[0]
    kanaStatsByMode[mode] = Object.fromEntries(order.map((kana) => [kana, createEmptyKanaStats(kana)]))
  }

  return {
    mode: normalized.mode,
    unlockedCountByMode,
    currentTargetKanaByMode,
    kanaStatsByMode,
    sessionHistory: [],
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
      typeof inputCount === 'number' ? inputCount : settings.initialUnlockedCount,
      1,
      order.length,
    )

    const inputTarget = candidate.currentTargetKanaByMode?.[mode]
    progress.currentTargetKanaByMode[mode] = order.includes(inputTarget ?? '') ? inputTarget! : order[0]

    const inputStats = candidate.kanaStatsByMode?.[mode] ?? {}
    progress.kanaStatsByMode[mode] = Object.fromEntries(
      order.map((kana) => [kana, normalizeKanaStats(kana, inputStats[kana], settings)]),
    )
  }

  progress.sessionHistory = Array.isArray(candidate.sessionHistory)
    ? candidate.sessionHistory.slice(-100)
    : []

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
  const mode = settings.mode
  const unlockedKana = new Set(getUnlockedKana(progress, mode))
  const targetKana = progress.currentTargetKanaByMode[mode]
  const modeWords = words.filter((word) => matchesMode(word, mode))
  const unlockedWords = modeWords.filter((word) => isWordUnlocked(word, unlockedKana))
  const targetWords = unlockedWords.filter((word) => containsTargetKana(word, targetKana))
  const selectedIds = new Set<string>()

  let batch = takeShuffled(targetWords, settings.batchSize, random)
  for (const word of batch) selectedIds.add(word.id)

  if (batch.length < settings.batchSize) {
    const syntheticWords = generateSyntheticChunks(
      getUnlockedKana(progress, mode),
      targetKana,
      mode,
      settings.batchSize - batch.length,
      random,
      selectedIds,
    )
    batch = batch.concat(syntheticWords)
    for (const word of syntheticWords) selectedIds.add(word.id)
  }

  const repeatableWords = batch.length > 0 ? batch : unlockedWords
  while (batch.length < settings.batchSize && repeatableWords.length > 0) {
    batch.push(repeatableWords[Math.floor(random() * repeatableWords.length)])
  }

  const warning = batch.length < settings.batchSize
      ? `Only generated ${batch.length} words for this batch.`
      : null

  if (settings.doubleWords) {
    batch = duplicateWords(batch, settings.shuffleDoubledWords, random)
  }

  return {
    words: batch.map((word, index) => ({ ...word, repetitionId: `${word.id}-${index}` })),
    warning,
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
  const perKana: BatchEvaluation['perKana'] = {}
  let totalExpectedKana = 0
  let correctKanaCount = 0

  expectedUnits.forEach((unit, index) => {
    if (unit === JAPANESE_SPACE) return
    totalExpectedKana += 1
    const isCorrect = actualUnits[index] === unit
    if (isCorrect) correctKanaCount += 1
    perKana[unit] ??= { exposures: 0, correct: 0, incorrect: 0 }
    perKana[unit].exposures += 1
    if (isCorrect) perKana[unit].correct += 1
    else perKana[unit].incorrect += 1
  })

  const elapsedMinutes = Math.max(elapsedMs, 1000) / 60000
  return {
    expected: normalizedExpected,
    actual: normalizedActual,
    elapsedMs,
    totalExpectedKana,
    correctKanaCount,
    kpm: totalExpectedKana === 0 ? 0 : correctKanaCount / elapsedMinutes,
    accuracy: totalExpectedKana === 0 ? 0 : correctKanaCount / totalExpectedKana,
    perKana,
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
  next.mode = mode

  for (const [kana, attempt] of Object.entries(evaluation.perKana)) {
    const stats = next.kanaStatsByMode[mode][kana] ?? createEmptyKanaStats(kana)
    const accuracy = attempt.exposures === 0 ? 0 : attempt.correct / attempt.exposures
    stats.attempts += 1
    stats.exposures += attempt.exposures
    stats.correct += attempt.correct
    stats.incorrect += attempt.incorrect
    stats.lastSeenAt = now
    stats.recentAttempts.push({
      timestamp: now,
      exposures: attempt.exposures,
      correct: attempt.correct,
      incorrect: attempt.incorrect,
      kpm: evaluation.kpm,
      accuracy,
    })
    stats.recentAttempts = stats.recentAttempts.slice(-settings.smoothingWindow)
    refreshSmoothedStats(stats, settings)
    next.kanaStatsByMode[mode][kana] = stats
  }

  const sessionResult: SessionResult = {
    timestamp: now,
    mode,
    targetKana: progress.currentTargetKanaByMode[mode],
    words: words.map((word) => word.kana),
    elapsedMs: evaluation.elapsedMs,
    kpm: evaluation.kpm,
    accuracy: evaluation.accuracy,
  }
  next.sessionHistory = [...next.sessionHistory, sessionResult].slice(-100)
  next.currentTargetKanaByMode[mode] = chooseNextTargetKana(next, settings)

  return next
}

export function chooseNextTargetKana(progress: ProgressState, settings: PracticeSettings): string {
  const mode = settings.mode
  const order = getKanaOrder(mode)
  const unlocked = order.slice(0, progress.unlockedCountByMode[mode])

  for (const kana of unlocked) {
    const stats = progress.kanaStatsByMode[mode][kana] ?? createEmptyKanaStats(kana)
    refreshSmoothedStats(stats, settings)
    if (!stats.passed) return kana
  }

  if (progress.unlockedCountByMode[mode] < order.length) {
    progress.unlockedCountByMode[mode] += 1
    return order[progress.unlockedCountByMode[mode] - 1]
  }

  return findWeakestKana(progress.kanaStatsByMode[mode], order)
}

export function refreshSmoothedStats(stats: KanaStats, settings: PracticeSettings): KanaStats {
  const recent = stats.recentAttempts.slice(-settings.smoothingWindow)
  const totalCorrect = recent.reduce((sum, attempt) => sum + attempt.correct, 0)
  const totalExpected = recent.reduce((sum, attempt) => sum + attempt.correct + attempt.incorrect, 0)
  const totalKpm = recent.reduce((sum, attempt) => sum + attempt.kpm, 0)

  stats.smoothedAccuracy = totalExpected === 0 ? 0 : totalCorrect / totalExpected
  stats.smoothedKpm = recent.length === 0 ? 0 : totalKpm / recent.length
  stats.passed = isKanaPassed(stats, settings)
  return stats
}

export function isKanaPassed(stats: KanaStats, settings: PracticeSettings): boolean {
  return stats.attempts >= settings.minAttemptsPerKana
    && stats.smoothedKpm >= settings.targetKpm
    && stats.smoothedAccuracy >= settings.targetAccuracy
}

export function progressSummary(progress: ProgressState, settings: PracticeSettings) {
  const mode = settings.mode
  const unlocked = getUnlockedKana(progress, mode)
  const current = progress.currentTargetKanaByMode[mode]
  const stats = progress.kanaStatsByMode[mode]
  const weak = unlocked.filter((kana) => {
    const kanaStats = stats[kana]
    return kanaStats.attempts > 0 && !kanaStats.passed
  })
  const passed = unlocked.filter((kana) => stats[kana]?.passed)

  return { mode, unlocked, current, weak, passed }
}

function duplicateWords(words: WordEntry[], shuffle: boolean, random: () => number): WordEntry[] {
  const doubled = words.flatMap((word) => [word, word])
  return shuffle ? shuffleArray(doubled, random) : doubled
}

function generateSyntheticChunks(
  unlockedKana: string[],
  targetKana: string,
  mode: PracticeMode,
  count: number,
  random: () => number,
  excludedIds = new Set<string>(),
): WordEntry[] {
  if (count <= 0 || !unlockedKana.includes(targetKana)) return []

  const candidates = new Set<string>()
  candidates.add(targetKana)

  for (const kana of unlockedKana) {
    candidates.add(`${targetKana}${kana}`)
    candidates.add(`${kana}${targetKana}`)
  }

  for (let index = 0; candidates.size < count * 3 && index < unlockedKana.length * 8; index += 1) {
    const left = unlockedKana[index % unlockedKana.length]
    const right = unlockedKana[(index + 1) % unlockedKana.length]
    const tail = unlockedKana[(index + 2) % unlockedKana.length]
    candidates.add(`${left}${targetKana}${right}`)
    candidates.add(`${targetKana}${right}${tail}`)
    candidates.add(`${left}${right}${targetKana}`)
  }

  const allowedCandidates = [...candidates].filter((kana) => !excludedIds.has(`synthetic-${mode}-${kana}`))

  return takeShuffled(allowedCandidates, count, random)
    .map((kana) => createSyntheticWord(kana, mode))
    .slice(0, count)
}

function createSyntheticWord(kana: string, mode: PracticeMode): WordEntry {
  return {
    id: `synthetic-${mode}-${kana}`,
    kanji: null,
    kana,
    kanaScript: mode,
    synthetic: true,
    tags: ['synthetic'],
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
  const input = raw as Partial<KanaStats>
  const stats: KanaStats = {
    ...createEmptyKanaStats(kana),
    attempts: typeof input.attempts === 'number' ? input.attempts : 0,
    exposures: typeof input.exposures === 'number' ? input.exposures : 0,
    correct: typeof input.correct === 'number' ? input.correct : 0,
    incorrect: typeof input.incorrect === 'number' ? input.incorrect : 0,
    recentAttempts: Array.isArray(input.recentAttempts) ? input.recentAttempts.slice(-settings.smoothingWindow) : [],
    lastSeenAt: typeof input.lastSeenAt === 'number' ? input.lastSeenAt : null,
  }
  return refreshSmoothedStats(stats, settings)
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
