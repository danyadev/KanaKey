import { getKanaOrder } from '../model/kana'
import type { KanaAttempt, KanaStats, ProgressState } from '../model/progress'
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
  label: string
  kpm: number
  accuracy: number
}

export type KanaMetrics = {
  kana: string
  status: string
  recentKpm: number
  bestKpm: number
  accuracyPercent: number
  appearances: number
  requiredAppearances: number
  trend: 'up' | 'down' | 'flat' | 'new'
  trendLabel: string
  chart: KanaMetricPoint[]
}

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
  const stats = progress.kanaStats[kana] ?? {
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
  const status = buildKanaPills(progress, settings).find((pill) => pill.kana === kana)?.status ?? 'locked'
  const chart = stats.history.slice(-8).map((attempt) => ({
    label: `#${attempt.attemptNumber}`,
    kpm: attemptKpm(attempt),
    accuracy: attemptAccuracy(attempt),
  }))

  return {
    kana,
    status,
    recentKpm: Math.round(stats.smoothedKpm),
    bestKpm: Math.round(Math.max(0, ...stats.history.map(attemptKpm))),
    accuracyPercent: Math.round(stats.smoothedAccuracy * 100),
    appearances: stats.appearances,
    requiredAppearances: REQUIRED_APPEARANCE_COUNT,
    trend: learningTrend(chart),
    trendLabel: learningTrendLabel(chart),
    chart,
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

function attemptKpm(attempt: KanaAttempt): number {
  if (attempt.correctCount <= 0) return 0
  return attempt.correctCount / (Math.max(attempt.allocatedMs, 1) / 60000)
}

function attemptAccuracy(attempt: KanaAttempt): number {
  if (attempt.appearanceCount <= 0) return 0
  return attempt.correctCount / attempt.appearanceCount
}

function learningTrend(points: KanaMetricPoint[]): KanaMetrics['trend'] {
  if (points.length < 3) return points.length === 0 ? 'new' : 'flat'

  const midpoint = Math.floor(points.length / 2)
  const earlier = average(points.slice(0, midpoint).map((point) => point.kpm))
  const later = average(points.slice(midpoint).map((point) => point.kpm))
  const delta = later - earlier

  if (Math.abs(delta) < 5) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

function learningTrendLabel(points: KanaMetricPoint[]): string {
  const trend = learningTrend(points)
  if (trend === 'new') return 'No attempts yet'
  if (trend === 'up') return 'Trending up'
  if (trend === 'down') return 'Trending down'
  return 'Stable'
}

function average(values: Array<number | undefined>): number {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}
