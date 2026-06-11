import { getKanaOrder } from '../model/kana'
import { createEmptyKanaStats } from '../model/progress'
import type { KanaStats, KanaTargetAttempt, ProgressState } from '../model/progress'
import { REQUIRED_APPEARANCE_COUNT } from '../model/settings'
import type { PracticeSettings } from '../model/settings'
import type { KanaPill } from '../components/KanaMap/kanaRows'

export type PassMeter = {
  kpm: number
  accuracy: number
  kpmPercent: number
  accuracyPercent: number
}

export type DailyProgress = {
  label: string
  percent: number
}

export type KanaMetricPoint = {
  attempt: number
  kpm: number
  accuracy: number
  reactionMs: number
}

export type KanaMetrics = {
  kana: string
  pillStatus: string
  state: KanaMetricState
  stateSentence: string
  confidence: 'none' | 'low' | 'usable'
  recentAttempts: number
  recentKpm: number | null
  bestKpm: number | null
  accuracyPercent: number
  averageReactionMs: number | null
  appearances: number
  requiredAppearances: number
  trend: 'up' | 'down' | 'flat' | 'unknown'
  trendDelta: number | null
  trendLabel: string
  chart: KanaMetricPoint[]
  commonMistakes: Array<{ kana: string, count: number }>
}

export type KanaMetricState =
  | 'locked'
  | 'introduced'
  | 'learning'
  | 'unlocked'
  | 'weak'
  | 'mastered'
  | 'rusty'

export function currentStats(
  progress: ProgressState,
  settings: PracticeSettings,
): Pick<KanaStats, 'smoothedKpm' | 'smoothedAccuracy'> | undefined {
  if (settings.mode !== 'mixed') {
    const target = progress.currentTargetKanaByMode[settings.mode]
    return progress.kanaStats[target]
  }

  const hiraganaStats = progress.kanaStats[progress.currentTargetKanaByMode.hiragana]
  const katakanaStats = progress.kanaStats[progress.currentTargetKanaByMode.katakana]

  return {
    smoothedKpm: average([hiraganaStats?.smoothedKpm, katakanaStats?.smoothedKpm]),
    smoothedAccuracy: average([
      hiraganaStats?.smoothedAccuracy,
      katakanaStats?.smoothedAccuracy,
    ]),
  }
}

export function currentAppearances(
  progress: ProgressState,
  settings: PracticeSettings,
): number {
  if (settings.mode !== 'mixed') {
    const target = progress.currentTargetKanaByMode[settings.mode]
    return progress.kanaStats[target]?.appearances ?? 0
  }

  const hiraganaTarget = progress.currentTargetKanaByMode.hiragana
  const katakanaTarget = progress.currentTargetKanaByMode.katakana

  return (progress.kanaStats[hiraganaTarget]?.appearances ?? 0)
    + (progress.kanaStats[katakanaTarget]?.appearances ?? 0)
}

export function currentTargetLabel(
  progress: ProgressState,
  settings: PracticeSettings,
): string {
  if (settings.mode !== 'mixed') return progress.currentTargetKanaByMode[settings.mode]

  return `${progress.currentTargetKanaByMode.hiragana} / ${progress.currentTargetKanaByMode.katakana}`
}

export function buildPassMeter(
  stats: Pick<KanaStats, 'smoothedKpm' | 'smoothedAccuracy'> | undefined,
  settings: PracticeSettings,
): PassMeter {
  const kpm = Math.round(stats?.smoothedKpm ?? 0)
  const accuracy = Math.round((stats?.smoothedAccuracy ?? 0) * 100)
  const targetAccuracyPercent = Math.round(settings.targetAccuracy * 100)

  return {
    kpm,
    accuracy,
    kpmPercent: meterPercent(kpm, settings.targetKpm),
    accuracyPercent: meterPercent(accuracy, targetAccuracyPercent),
  }
}

export function buildDailyProgress(
  progress: ProgressState,
  settings: PracticeSettings,
): DailyProgress {
  const goalMs = settings.dailyPracticeMinutesGoal * 60_000
  const todayMs = progress.practiceTime.todayMs

  return {
    label: `${formatMinutes(todayMs)} / ${settings.dailyPracticeMinutesGoal} min`,
    percent: meterPercent(todayMs, goalMs),
  }
}

export function buildKanaPills(
  progress: ProgressState,
  settings: PracticeSettings,
): KanaPill[] {
  return [
    ...buildScriptKanaPills(progress, settings, 'hiragana'),
    ...buildScriptKanaPills(progress, settings, 'katakana'),
  ]
}

export function buildKanaMetrics(
  progress: ProgressState,
  settings: PracticeSettings,
  kana: string,
): KanaMetrics {
  const stats = progress.kanaStats[kana] ?? createEmptyKanaStats(kana)
  const pillStatus = buildKanaPills(progress, settings).find((pill) => pill.kana === kana)?.status ?? 'locked'
  const attempts = stats.attemptRecords
  const recent = attempts.slice(-30)
  const recentAttempts = recent.length
  const confidence = metricConfidence(recentAttempts)
  const recentKpm = confidence === 'none' ? null : kanaKpm(recent)
  const bestKpm = bestRollingKpm(attempts)
  const accuracy = recentAttempts === 0
    ? 0
    : recent.filter((attempt) => attempt.firstTryCorrect).length / recentAttempts
  const averageReactionMs = averageReaction(recent)
  const chart = buildMetricChart(attempts)
  const trendDelta = chart.length < 4 ? null : trendFromChart(chart)
  const trend = trendDelta === null
    ? 'unknown'
    : Math.abs(trendDelta) < 0.5
      ? 'flat'
      : trendDelta > 0
        ? 'up'
        : 'down'
  const state = deriveKanaMetricState({
    accuracy,
    bestKpm,
    confidence,
    pillStatus,
    recentAttempts,
    recentKpm,
    targetKpm: settings.targetKpm,
    targetAccuracy: settings.targetAccuracy,
  })

  return {
    kana,
    pillStatus,
    state,
    stateSentence: stateSentence(state, confidence),
    confidence,
    recentAttempts,
    recentKpm,
    bestKpm,
    accuracyPercent: Math.round(accuracy * 100),
    averageReactionMs,
    appearances: stats.appearances,
    requiredAppearances: REQUIRED_APPEARANCE_COUNT,
    trend,
    trendDelta,
    trendLabel: learningTrendLabel(trend, trendDelta),
    chart,
    commonMistakes: commonMistakes(recent),
  }
}

function buildScriptKanaPills(
  progress: ProgressState,
  settings: PracticeSettings,
  script: 'hiragana' | 'katakana',
): KanaPill[] {
  const order = getKanaOrder(script)
  const unlockedKana = new Set(order.slice(0, progress.unlockedCountByMode[script]))
  const current = progress.currentTargetKanaByMode[script]
  const showCurrent = settings.mode === script || settings.mode === 'mixed'

  return order.map((kana) => {
    const locked = !unlockedKana.has(kana)
    const kanaStats = progress.kanaStats[kana]
    let status = 'new'

    if (locked) status = 'locked'
    else if (showCurrent && kana === current) status = 'current'
    else if (kanaStats?.passed) status = 'passed'
    else if (kanaStats?.appearances > 0) status = 'weak'

    return { kana, status, script }
  })
}

function meterPercent(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function formatMinutes(ms: number): string {
  return String(Math.floor(ms / 60000))
}

function metricConfidence(attempts: number): KanaMetrics['confidence'] {
  if (attempts < 10) return 'none'
  if (attempts < 30) return 'low'
  return 'usable'
}

function kanaKpm(attempts: KanaTargetAttempt[]): number | null {
  const accepted = attempts.filter((attempt) => attempt.finalCorrect && attempt.reactionMs > 0)
  if (accepted.length === 0) return null

  return 60000 / average(accepted.map((attempt) => attempt.reactionMs))
}

function bestRollingKpm(attempts: KanaTargetAttempt[]): number | null {
  const windowSize = 10
  if (attempts.length < windowSize) return null

  let best: number | null = null
  for (let index = 0; index <= attempts.length - windowSize; index += 1) {
    const value = kanaKpm(attempts.slice(index, index + windowSize))
    if (value === null) continue
    best = best === null ? value : Math.max(best, value)
  }
  return best
}

function buildMetricChart(attempts: KanaTargetAttempt[]): KanaMetricPoint[] {
  const windowSize = 10
  if (attempts.length < windowSize) return []

  const points: KanaMetricPoint[] = []
  for (let end = windowSize; end <= attempts.length; end += 1) {
    const window = attempts.slice(end - windowSize, end)
    const kpm = kanaKpm(window)
    if (kpm === null) continue
    points.push({
      attempt: end,
      kpm,
      accuracy: window.filter((attempt) => attempt.firstTryCorrect).length / window.length,
      reactionMs: average(window.map((attempt) => attempt.reactionMs)),
    })
  }
  return points.slice(-40)
}

function trendFromChart(points: KanaMetricPoint[]): number {
  const midpoint = Math.floor(points.length / 2)
  const previous = points.slice(0, midpoint)
  const recent = points.slice(midpoint)
  return average(recent.map((point) => point.kpm)) - average(previous.map((point) => point.kpm))
}

function learningTrendLabel(trend: KanaMetrics['trend'], delta: number | null): string {
  if (trend === 'unknown' || delta === null) return 'Not enough data'
  if (trend === 'up') return `+${delta.toFixed(1)} kpm`
  if (trend === 'down') return `${delta.toFixed(1)} kpm`
  return 'Stable'
}

function averageReaction(attempts: KanaTargetAttempt[]): number | null {
  const accepted = attempts.filter((attempt) => attempt.finalCorrect && attempt.reactionMs > 0)
  return accepted.length === 0 ? null : average(accepted.map((attempt) => attempt.reactionMs))
}

function commonMistakes(attempts: KanaTargetAttempt[]): Array<{ kana: string, count: number }> {
  const counts = new Map<string, number>()
  for (const attempt of attempts) {
    if (!attempt.mistakeKana) continue
    counts.set(attempt.mistakeKana, (counts.get(attempt.mistakeKana) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([kana, count]) => ({ kana, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
}

function deriveKanaMetricState(input: {
  accuracy: number
  bestKpm: number | null
  confidence: KanaMetrics['confidence']
  pillStatus: string
  recentAttempts: number
  recentKpm: number | null
  targetKpm: number
  targetAccuracy: number
}): KanaMetricState {
  if (input.pillStatus === 'locked') return 'locked'
  if (input.recentAttempts === 0) return 'introduced'
  if (input.confidence === 'none') return 'introduced'
  if (input.confidence === 'low') return 'learning'
  if (input.bestKpm !== null && input.bestKpm >= input.targetKpm && (input.recentKpm ?? 0) < input.bestKpm * 0.75) {
    return 'rusty'
  }
  if (input.accuracy < input.targetAccuracy || (input.recentKpm ?? 0) < input.targetKpm * 0.85) {
    return 'weak'
  }
  if (input.accuracy >= input.targetAccuracy && (input.recentKpm ?? 0) >= input.targetKpm) {
    return 'mastered'
  }
  return 'unlocked'
}

function stateSentence(state: KanaMetricState, confidence: KanaMetrics['confidence']): string {
  if (state === 'locked') return 'This kana is locked.'
  if (confidence === 'none') return 'Not enough data yet.'
  if (confidence === 'low') return 'Low confidence: keep practicing this kana.'
  if (state === 'mastered') return 'This kana is mastered recently.'
  if (state === 'weak') return 'This kana needs more practice.'
  if (state === 'rusty') return 'This kana used to be stronger and looks rusty.'
  if (state === 'learning') return 'This kana is still being learned.'
  return 'This kana is unlocked.'
}

function average(values: Array<number | undefined>): number {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}
