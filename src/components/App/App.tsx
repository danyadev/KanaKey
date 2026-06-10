import { computed, defineComponent, nextTick, onMounted, ref, watch } from 'vue'

import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { groupKanaRows } from '../KanaMap/kanaRows'
import type { KanaPill } from '../KanaMap/kanaRows'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import { loadKanaFontChoice, saveKanaFontChoice } from './uiPrefs'
import type { KanaFontChoice } from './uiPrefs'
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
import seedWords from '../../words.json'
import { clearProgress, loadProgress, loadSettings, saveProgress, saveSettings } from '../../storage'
import type { BatchEvaluation, BatchResult, PracticeMode, PracticeSettings, ProgressState, WordEntry } from '../../types'
import {
  applyEvaluationToProgress,
  createInitialProgress,
  generateBatch,
  normalizeSettings,
  progressSummary,
  refreshProgressPassFlags,
} from '../../trainer'
import './App.css'

type RegenerateBatchOptions = {
  focus?: boolean
}

export const App = defineComponent((_props, _ctx) => {
  const words = seedWords as WordEntry[]
  const settings = ref<PracticeSettings>(loadSettings())
  const progress = ref<ProgressState>(loadProgress(settings.value))
  const batch = ref<BatchResult>(generateBatch(words, settings.value, progress.value))
  const inputState = ref(createInputSurfaceState(batch.value.words))
  const lastEvaluation = ref<BatchEvaluation | null>(null)
  const outcomeMessage = ref<string | null>(null)
  const typingBox = ref<HTMLTextAreaElement | null>(null)
  const kanaFont = ref<KanaFontChoice>(loadKanaFontChoice())
  let lastHandledSettings = normalizeSettings(settings.value)
  let lastHandledSettingsKey = serializeSettings(lastHandledSettings)

  const accuracyPercent = computed({
    get: () => Math.round(settings.value.targetAccuracy * 100),
    set: (value: number) => {
      settings.value.targetAccuracy = Number(value) / 100
    },
  })

  const canSubmit = computed(() => inputState.value.completed && inputState.value.units.length > 0)
  const surfaceWords = computed(() => getSurfaceWordViews(inputState.value))
  const summary = computed(() => progressSummary(progress.value, settings.value))
  const currentStats = computed(() => {
    const target = progress.value.currentTargetKanaByMode[settings.value.mode]
    return progress.value.kanaStats[target]
  })
  const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
  const passMeter = computed(() => {
    const stats = currentStats.value
    const appearances = stats?.appearances ?? 0
    const kpm = Math.round(stats?.smoothedKpm ?? 0)
    const accuracy = Math.round((stats?.smoothedAccuracy ?? 0) * 100)

    return {
      kpm,
      accuracy,
      appearances,
      kpmPercent: meterPercent(kpm, settings.value.targetKpm),
      accuracyPercent: meterPercent(accuracy, accuracyPercent.value),
      appearancesPercent: meterPercent(appearances, settings.value.requiredAppearanceCount),
    }
  })
  const kanaPills = computed<KanaPill[]>(() => [
    ...buildKanaPills('hiragana'),
    ...buildKanaPills('katakana'),
  ])
  const kanaRows = computed(() => groupKanaRows(kanaPills.value))
  const dailyProgress = computed(() => {
    const goalMs = settings.value.dailyPracticeMinutesGoal * 60_000
    const todayMs = progress.value.practiceTime.todayMs
    return {
      label: `${formatMinutes(todayMs)} / ${settings.value.dailyPracticeMinutesGoal} min today`,
      percent: meterPercent(todayMs, goalMs),
    }
  })

  watch(settings, (nextSettings) => {
    const normalized = normalizeSettings(nextSettings)
    const normalizedKey = serializeSettings(normalized)

    if (serializeSettings(nextSettings) !== normalizedKey) {
      settings.value = normalized
    }

    if (normalizedKey === lastHandledSettingsKey) return

    if (targetSettingsChanged(lastHandledSettings, normalized)) {
      progress.value = refreshProgressPassFlags(progress.value, normalized)
    }

    progress.value.mode = normalized.mode
    lastHandledSettings = normalized
    lastHandledSettingsKey = normalizedKey
    saveSettings(normalized)
    saveProgress(progress.value)
    regenerateBatch({ focus: false })
  }, { deep: true })

  watch(kanaFont, (nextFont) => {
    saveKanaFontChoice(nextFont)
  })

  onMounted(() => {
    focusTypingBox()
  })

  function submitBatch(completedAt = Date.now()) {
    if (!canSubmit.value) return
    const mode = settings.value.mode
    const previousTarget = progress.value.currentTargetKanaByMode[mode]
    const evaluation = buildInputEvaluation(inputState.value, completedAt)
    const normalizedSettings = normalizeSettings(settings.value)
    progress.value = applyEvaluationToProgress(progress.value, normalizedSettings, evaluation, batch.value.words, completedAt)
    const nextTarget = progress.value.currentTargetKanaByMode[mode]
    const targetStats = progress.value.kanaStats[previousTarget]
    outcomeMessage.value = buildOutcomeMessage({
      evaluation,
      previousTarget,
      nextTarget,
      targetAppearances: targetStats?.appearances ?? 0,
      settings: normalizedSettings,
    })
    lastEvaluation.value = evaluation
    saveProgress(progress.value)
    regenerateBatch()
  }

  function regenerateBatch(options: RegenerateBatchOptions = {}) {
    const { focus = true } = options
    batch.value = generateBatch(words, normalizeSettings(settings.value), progress.value)
    inputState.value = createInputSurfaceState(batch.value.words)
    if (focus) focusTypingBox()
  }

  function clearInput() {
    inputState.value = createInputSurfaceState(batch.value.words)
    focusTypingBox()
  }

  function startNewBatch() {
    lastEvaluation.value = null
    outcomeMessage.value = null
    regenerateBatch({ focus: true })
  }

  function updateSettings(patch: Partial<PracticeSettings>) {
    settings.value = {
      ...settings.value,
      ...patch,
    }
  }

  function updateKanaFont(nextFont: KanaFontChoice) {
    kanaFont.value = nextFont
  }

  function handleCommittedInput(value: string) {
    const now = Date.now()
    const nextState = commitKanaInput(inputState.value, value, now)
    inputState.value = nextState
    if (nextState.completed) submitBatch(now)
  }

  function handleCompositionEnd(value: string) {
    inputState.value = endComposition(inputState.value)
    handleCommittedInput(value)
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

  function focusTypingBox() {
    nextTick(() => typingBox.value?.focus())
  }

  function buildKanaPills(script: 'hiragana' | 'katakana'): KanaPill[] {
    const order = getKanaOrder(script)
    const progressMode = settingsModeForKanaMap(script)
    const unlockedKana = new Set(getKanaOrder(progressMode).slice(0, progress.value.unlockedCountByMode[progressMode]))
    const current = progress.value.currentTargetKanaByMode[progressMode]
    const showCurrent = settings.value.mode === progressMode

    return order.map((kana) => {
      const locked = !unlockedKana.has(kana)
      const kanaStats = progress.value.kanaStats[kana]
      let status = 'new'
      if (locked) status = 'locked'
      else if (showCurrent && kana === current) status = 'current'
      else if (kanaStats?.passed) status = 'passed'
      else if (kanaStats?.appearances > 0) status = 'weak'

      return { kana, status, script }
    })
  }

  function settingsModeForKanaMap(script: 'hiragana' | 'katakana'): PracticeMode {
    return settings.value.mode === 'mixed' ? 'mixed' : script
  }

  return () => (
    <main class={['shell', `kana-font-${kanaFont.value}`]}>
      <Hero
        currentKana={summary.value.current}
        targetKpm={settings.value.targetKpm}
        accuracyPercent={accuracyPercent.value}
        dailyProgressLabel={dailyProgress.value.label}
        dailyProgressPercent={dailyProgress.value.percent}
      />

      <section class="trainer-layout">
        <PracticePanel
          surfaceWords={surfaceWords.value}
          visualSeparator={settings.value.visualSeparator}
          warning={batch.value.warning}
          canSubmit={canSubmit.value}
          typingBox={typingBox}
          currentKana={summary.value.current}
          compositionText={inputState.value.compositionText}
          isComposing={inputState.value.isComposing}
          targetKpm={settings.value.targetKpm}
          targetAccuracyPercent={accuracyPercent.value}
          requiredAppearanceCount={settings.value.requiredAppearanceCount}
          passMeter={passMeter.value}
          lastEvaluation={lastEvaluation.value}
          outcomeMessage={outcomeMessage.value}
          onNewBatch={startNewBatch}
          onSubmit={() => submitBatch()}
          onClear={clearInput}
          onCommitInput={handleCommittedInput}
          onCompositionStart={() => { inputState.value = startComposition(inputState.value) }}
          onCompositionUpdate={(value) => { inputState.value = updateComposition(inputState.value, value) }}
          onCompositionEnd={handleCompositionEnd}
        />

        <SettingsPanel
          settings={settings.value}
          accuracyPercent={accuracyPercent.value}
          kanaFont={kanaFont.value}
          onUpdate:settings={updateSettings}
          onUpdate:kanaFont={updateKanaFont}
          onResetProgress={resetProgress}
        />
      </section>

      <StatsGrid
        unlockedCount={summary.value.unlocked.length}
        weakCount={summary.value.weak.length}
        targetAppearances={currentStats.value?.appearances ?? 0}
        todayMinutes={formatMinutes(progress.value.practiceTime.todayMs)}
        totalMinutes={formatMinutes(progress.value.practiceTime.totalMs)}
      />
      <KanaMap rows={kanaRows.value} />
      <HistoryPanel sessions={recentSessions.value} />
    </main>
  )
})

function meterPercent(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function serializeSettings(settings: PracticeSettings): string {
  return JSON.stringify(settings)
}

function targetSettingsChanged(previous: PracticeSettings, next: PracticeSettings): boolean {
  return previous.targetKpm !== next.targetKpm
    || previous.targetAccuracy !== next.targetAccuracy
    || previous.requiredAppearanceCount !== next.requiredAppearanceCount
    || previous.smoothingAppearanceCount !== next.smoothingAppearanceCount
}

function formatMinutes(ms: number): string {
  return String(Math.floor(ms / 60000))
}

type BuildOutcomeMessageInput = {
  evaluation: BatchEvaluation
  previousTarget: string
  nextTarget: string
  targetAppearances: number
  settings: PracticeSettings
}

function buildOutcomeMessage(input: BuildOutcomeMessageInput): string {
  const { evaluation, previousTarget, nextTarget, targetAppearances, settings } = input
  if (previousTarget !== nextTarget) {
    return `${previousTarget} passed. Next target: ${nextTarget}.`
  }

  const missing: string[] = []
  if (evaluation.kpm < settings.targetKpm) {
    missing.push(`Speed needs +${Math.ceil(settings.targetKpm - evaluation.kpm)} kana/min.`)
  }
  if (evaluation.accuracy < settings.targetAccuracy) {
    missing.push(`Accuracy needs +${Math.ceil((settings.targetAccuracy - evaluation.accuracy) * 100)}%.`)
  }

  const appearancesMissing = Math.max(0, settings.requiredAppearanceCount - targetAppearances)
  if (appearancesMissing > 0) {
    missing.push(`${previousTarget} needs ${appearancesMissing} more appearances.`)
  }

  if (missing.length > 0) return `Keep going. ${missing.join(' ')}`

  return `Good round. Keep going on ${previousTarget}.`
}
