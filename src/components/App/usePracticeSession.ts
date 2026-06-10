import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { getKanaOrder } from '../../kana'
import {
  buildInputEvaluation,
  commitKanaInput,
  createInputSurfaceState,
  endComposition,
  getSurfaceWordViews,
  startComposition,
  updateComposition,
} from '../../inputSurface'
import { clearProgress, loadProgress, loadSettings, saveProgress, saveSettings } from '../../storage'
import {
  applyEvaluationToProgress,
  createInitialProgress,
  formatBatchWarning,
  generateBatch,
  normalizeSettings,
  progressSummary,
  refreshProgressPassFlags,
  settingsAffectPassState,
} from '../../trainer'
import type {
  BatchEvaluation,
  BatchResult,
  PracticeSettings,
  ProgressState,
  WordEntry,
} from '../../types'
import { loadKanaFontChoice, saveKanaFontChoice } from './uiPrefs'
import type { KanaFontChoice } from './uiPrefs'
import type { KanaPill } from '../KanaMap/kanaRows'

type RegenerateBatchOptions = {
  focus?: boolean
}

export function usePracticeSession(words: WordEntry[]) {
  const settings = ref<PracticeSettings>(loadSettings())
  const progress = ref<ProgressState>(loadProgress(settings.value))
  const batch = ref<BatchResult>(generateInitialBatch(words, settings.value, progress.value))
  const inputState = ref(createInputSurfaceState(batch.value.words))
  const lastEvaluation = ref<BatchEvaluation | null>(null)
  const outcomeMessage = ref<string | null>(null)
  const typingBox = ref<HTMLTextAreaElement | null>(null)
  const kanaFont = ref<KanaFontChoice>(loadKanaFontChoice())

  const accuracyPercent = computed({
    get: () => Math.round(settings.value.targetAccuracy * 100),
    set: (value: number) => {
      updateSettings({ targetAccuracy: Number(value) / 100 })
    },
  })

  const surfaceWords = computed(() => getSurfaceWordViews(inputState.value))
  const summary = computed(() => progressSummary(progress.value, settings.value))
  const currentStats = computed(() => getCurrentStats(progress.value, settings.value))
  const currentAppearances = computed(() => getCurrentAppearances(progress.value, settings.value))
  const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
  const passMeter = computed(() => buildPassMeter(currentStats.value, settings.value, accuracyPercent.value))
  const kanaPills = computed<KanaPill[]>(() => [
    ...buildKanaPills(progress.value, settings.value, 'hiragana'),
    ...buildKanaPills(progress.value, settings.value, 'katakana'),
  ])
  const dailyProgress = computed(() => {
    const goalMs = settings.value.dailyPracticeMinutesGoal * 60_000
    const todayMs = progress.value.practiceTime.todayMs
    return {
      label: `${formatMinutes(todayMs)} / ${settings.value.dailyPracticeMinutesGoal} min`,
      percent: meterPercent(todayMs, goalMs),
    }
  })
  const warningMessages = computed(() => batch.value.warnings.map(formatBatchWarning))

  onMounted(() => {
    focusTypingBox()
    document.addEventListener('visibilitychange', focusTypingBoxWhenVisible)
    window.addEventListener('focus', focusTypingBox)
    window.addEventListener('pageshow', focusTypingBox)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', focusTypingBoxWhenVisible)
    window.removeEventListener('focus', focusTypingBox)
    window.removeEventListener('pageshow', focusTypingBox)
  })

  function updateSettings(patch: Partial<PracticeSettings>) {
    const previous = settings.value
    const next = normalizeSettings({ ...previous, ...patch })

    settings.value = next
    if (settingsAffectPassState(previous, next)) {
      progress.value = refreshProgressPassFlags(progress.value, next)
    }

    progress.value.mode = next.mode
    saveSettings(next)
    saveProgress(progress.value)
    regenerateBatch({ focus: false })
  }

  function updateKanaFont(nextFont: KanaFontChoice) {
    kanaFont.value = nextFont
    saveKanaFontChoice(nextFont)
  }

  function handleCommittedInput(value: string) {
    const now = Date.now()
    const nextInputState = commitKanaInput(inputState.value, value, now)
    inputState.value = nextInputState

    if (nextInputState.completed) {
      submitBatch(now)
      return
    }

    focusTypingBox()
  }

  function handleCompositionStart() {
    inputState.value = startComposition(inputState.value)
  }

  function handleCompositionUpdate(value: string) {
    inputState.value = updateComposition(inputState.value, value)
  }

  function handleCompositionEnd(value: string) {
    inputState.value = endComposition(inputState.value)
    handleCommittedInput(value)
  }

  function clearInput() {
    inputState.value = createInputSurfaceState(batch.value.words)
    focusTypingBox()
  }

  function resetProgress() {
    if (!confirm('Reset all KanaKey progress? Settings will be kept.')) return

    clearProgress()
    progress.value = createInitialProgress(settings.value)
    saveProgress(progress.value)
    lastEvaluation.value = null
    outcomeMessage.value = null
    regenerateBatch()
  }

  function submitBatch(completedAt = Date.now()) {
    if (!inputState.value.completed || inputState.value.units.length === 0) return

    const previousTarget = currentTargetLabel(progress.value, settings.value)
    const evaluation = buildInputEvaluation(inputState.value, completedAt)
    progress.value = applyEvaluationToProgress(
      progress.value,
      settings.value,
      evaluation,
      batch.value.words,
      completedAt,
    )

    lastEvaluation.value = evaluation
    outcomeMessage.value = buildOutcomeMessage(
      evaluation,
      previousTarget,
      currentTargetLabel(progress.value, settings.value),
      settings.value,
    )
    saveProgress(progress.value)
    regenerateBatch()
  }

  function regenerateBatch(options: RegenerateBatchOptions = {}) {
    const { focus = true } = options
    batch.value = generateBatch(words, settings.value, progress.value)
    inputState.value = createInputSurfaceState(batch.value.words)
    if (focus) focusTypingBox()
  }

  function focusTypingBox() {
    nextTick(() => typingBox.value?.focus())
  }

  function focusTypingBoxWhenVisible() {
    if (!document.hidden) focusTypingBox()
  }

  return {
    accuracyPercent,
    currentAppearances,
    dailyProgress,
    kanaFont,
    kanaPills,
    lastEvaluation,
    outcomeMessage,
    passMeter,
    progress,
    recentSessions,
    settings,
    summary,
    surfaceWords,
    typingBox,
    warningMessages,
    inputState,
    clearInput,
    handleCommittedInput,
    handleCompositionEnd,
    handleCompositionStart,
    handleCompositionUpdate,
    resetProgress,
    submitBatch,
    updateKanaFont,
    updateSettings,
  }
}

function generateInitialBatch(
  words: WordEntry[],
  settings: PracticeSettings,
  progress: ProgressState,
): BatchResult {
  return generateBatch(words, normalizeSettings(settings), progress)
}

function getCurrentStats(progress: ProgressState, settings: PracticeSettings) {
  if (settings.mode !== 'mixed') {
    const target = progress.currentTargetKanaByMode[settings.mode]
    return progress.kanaStats[target]
  }

  const hiraganaTarget = progress.currentTargetKanaByMode.hiragana
  const katakanaTarget = progress.currentTargetKanaByMode.katakana
  const hiraganaStats = progress.kanaStats[hiraganaTarget]
  const katakanaStats = progress.kanaStats[katakanaTarget]

  return {
    smoothedKpm: average([hiraganaStats?.smoothedKpm, katakanaStats?.smoothedKpm]),
    smoothedAccuracy: average([hiraganaStats?.smoothedAccuracy, katakanaStats?.smoothedAccuracy]),
  }
}

function getCurrentAppearances(progress: ProgressState, settings: PracticeSettings): number {
  if (settings.mode !== 'mixed') {
    const target = progress.currentTargetKanaByMode[settings.mode]
    return progress.kanaStats[target]?.appearances ?? 0
  }

  const hiraganaTarget = progress.currentTargetKanaByMode.hiragana
  const katakanaTarget = progress.currentTargetKanaByMode.katakana

  return (progress.kanaStats[hiraganaTarget]?.appearances ?? 0)
    + (progress.kanaStats[katakanaTarget]?.appearances ?? 0)
}

function currentTargetLabel(progress: ProgressState, settings: PracticeSettings): string {
  if (settings.mode !== 'mixed') return progress.currentTargetKanaByMode[settings.mode]

  return `${progress.currentTargetKanaByMode.hiragana} / ${progress.currentTargetKanaByMode.katakana}`
}

function buildPassMeter(
  stats: { smoothedKpm?: number; smoothedAccuracy?: number } | undefined,
  settings: PracticeSettings,
  accuracyPercent: number,
) {
  const kpm = Math.round(stats?.smoothedKpm ?? 0)
  const accuracy = Math.round((stats?.smoothedAccuracy ?? 0) * 100)

  return {
    kpm,
    accuracy,
    kpmPercent: meterPercent(kpm, settings.targetKpm),
    accuracyPercent: meterPercent(accuracy, accuracyPercent),
  }
}

function buildKanaPills(
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

function buildOutcomeMessage(
  evaluation: BatchEvaluation,
  previousTarget: string,
  nextTarget: string,
  settings: PracticeSettings,
): string {
  if (previousTarget !== nextTarget) {
    return `${previousTarget} passed. Next target: ${nextTarget}.`
  }

  const missing = getMissingGoalMessages(evaluation, settings)
  if (missing.length > 0) return `Keep going. ${missing.join(' ')}`

  return `Good round. Keep going on ${previousTarget}.`
}

function getMissingGoalMessages(
  evaluation: BatchEvaluation,
  settings: PracticeSettings,
): string[] {
  const messages: string[] = []

  if (evaluation.kpm < settings.targetKpm) {
    messages.push(`Speed needs +${Math.ceil(settings.targetKpm - evaluation.kpm)} kana/min.`)
  }
  if (evaluation.accuracy < settings.targetAccuracy) {
    messages.push(`Accuracy needs +${Math.ceil((settings.targetAccuracy - evaluation.accuracy) * 100)}%.`)
  }

  return messages
}

function meterPercent(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function formatMinutes(ms: number): string {
  return String(Math.floor(ms / 60000))
}

function average(values: Array<number | undefined>): number {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}
