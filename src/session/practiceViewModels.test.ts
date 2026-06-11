import { describe, expect, it } from 'vitest'

import { createInitialProgress } from '../model/progress'
import type { KanaTargetAttempt } from '../model/progress'
import { DEFAULT_SETTINGS } from '../model/settings'
import { buildKanaMetrics } from './practiceViewModels'

const settings = {
  ...DEFAULT_SETTINGS,
  targetKpm: 60,
  targetAccuracy: 0.9,
}

describe('kana metric view models', () => {
  it('uses recent first-try correctness for accuracy', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStats['か'].attemptRecords = [
      ...attempts(8, { firstTryCorrect: true, reactionMs: 500 }),
      ...attempts(2, { firstTryCorrect: false, finalCorrect: true, reactionMs: 700, mistakeKana: 'が' }),
    ]

    const metrics = buildKanaMetrics(progress, settings, 'か')

    expect(metrics.recentAttempts).toBe(10)
    expect(metrics.accuracyPercent).toBe(80)
    expect(metrics.commonMistakes).toEqual([{ kana: 'が', count: 2 }])
  })

  it('shows no precise speed or trend under ten recent attempts', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStats['か'].attemptRecords = attempts(9, { reactionMs: 400 })

    const metrics = buildKanaMetrics(progress, settings, 'か')

    expect(metrics.confidence).toBe('none')
    expect(metrics.recentKpm).toBeNull()
    expect(metrics.bestKpm).toBeNull()
    expect(metrics.trendLabel).toBe('Not enough data')
    expect(metrics.stateSentence).toBe('Not enough data yet.')
  })

  it('does not treat a single lucky attempt as top speed', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStats['か'].attemptRecords = [
      attempt({ reactionMs: 100 }),
      ...attempts(10, { reactionMs: 1000 }),
    ]

    const metrics = buildKanaMetrics(progress, settings, 'か')

    expect(metrics.bestKpm).not.toBeNull()
    expect(metrics.bestKpm!).toBeGreaterThan(50)
    expect(metrics.bestKpm!).toBeLessThan(100)
  })

  it('derives weak and mastered states from usable recent performance', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStats['か'].attemptRecords = attempts(30, { firstTryCorrect: false, reactionMs: 1200, mistakeKana: 'が' })
    progress.kanaStats['い'].attemptRecords = attempts(30, { firstTryCorrect: true, reactionMs: 500 })

    expect(buildKanaMetrics(progress, settings, 'か').state).toBe('weak')
    expect(buildKanaMetrics(progress, settings, 'い').state).toBe('mastered')
  })

  it('derives locked state from kana availability', () => {
    const progress = createInitialProgress(settings)

    expect(buildKanaMetrics(progress, settings, 'そ').state).toBe('locked')
  })

  it('derives trend from recent rolling windows only when enough data exists', () => {
    const progress = createInitialProgress(settings)
    progress.kanaStats['か'].attemptRecords = [
      ...attempts(20, { reactionMs: 1000 }),
      ...attempts(20, { reactionMs: 500 }, 21),
    ]

    const metrics = buildKanaMetrics(progress, settings, 'か')

    expect(metrics.trend).toBe('up')
    expect(metrics.trendDelta).not.toBeNull()
    expect(metrics.trendDelta!).toBeGreaterThan(0)
    expect(metrics.chart[0]).toMatchObject({ attempt: 1 + 9 })
    expect(metrics.chart.at(-1)).toMatchObject({ attempt: 40 })
  })
})

function attempts(count: number, patch: Partial<KanaTargetAttempt>, start = 1): KanaTargetAttempt[] {
  return Array.from({ length: count }, (_, index) => attempt({ ...patch, attemptNumber: start + index }))
}

function attempt(patch: Partial<KanaTargetAttempt> = {}): KanaTargetAttempt {
  return {
    timestamp: patch.attemptNumber ?? 1,
    attemptNumber: patch.attemptNumber ?? 1,
    firstTryCorrect: patch.firstTryCorrect ?? true,
    finalCorrect: patch.finalCorrect ?? true,
    reactionMs: patch.reactionMs ?? 500,
    mistakeKana: patch.mistakeKana ?? null,
  }
}
