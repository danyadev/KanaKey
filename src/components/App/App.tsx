import { computed, defineComponent, nextTick, onMounted, ref, watch } from 'vue'

import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { groupKanaRows } from '../KanaMap/kanaRows'
import type { KanaPill } from '../KanaMap/kanaRows'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import { getKanaOrder } from '../../kana'
import seedWords from '../../words.json'
import { clearProgress, loadProgress, loadSettings, saveProgress, saveSettings } from '../../storage'
import type { BatchEvaluation, BatchResult, PracticeSettings, ProgressState, WordEntry } from '../../types'
import {
  applyEvaluationToProgress,
  createInitialProgress,
  evaluateBatch,
  expectedText,
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
  const typedText = ref('')
  const startedAt = ref<number | null>(null)
  const lastEvaluation = ref<BatchEvaluation | null>(null)
  const lastOutcomeTarget = ref<string | null>(null)
  const typingBox = ref<HTMLTextAreaElement | null>(null)
  let lastHandledSettings = normalizeSettings(settings.value)
  let lastHandledSettingsKey = serializeSettings(lastHandledSettings)

  const accuracyPercent = computed({
    get: () => Math.round(settings.value.targetAccuracy * 100),
    set: (value: number) => {
      settings.value.targetAccuracy = Number(value) / 100
    },
  })

  const targetText = computed(() => expectedText(batch.value.words))
  const canSubmit = computed(() => typedText.value.trim().length > 0 && targetText.value.length > 0)
  const summary = computed(() => progressSummary(progress.value, settings.value))
  const currentStats = computed(() => {
    const mode = settings.value.mode
    const target = progress.value.currentTargetKanaByMode[mode]
    return progress.value.kanaStatsByMode[mode][target]
  })
  const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
  const isFirstRun = computed(() => progress.value.sessionHistory.length === 0 && !lastEvaluation.value)
  const targetWords = computed(() => batch.value.words.map((word) => ({
    id: word.repetitionId,
    kana: word.kana,
    synthetic: word.synthetic,
  })))
  const passMeter = computed(() => {
    const stats = currentStats.value
    const attempts = stats?.attempts ?? 0
    const kpm = Math.round(stats?.smoothedKpm ?? 0)
    const accuracy = Math.round((stats?.smoothedAccuracy ?? 0) * 100)

    return {
      kpm,
      accuracy,
      attempts,
      kpmPercent: meterPercent(kpm, settings.value.targetKpm),
      accuracyPercent: meterPercent(accuracy, accuracyPercent.value),
      attemptsPercent: meterPercent(attempts, settings.value.minAttemptsPerKana),
    }
  })
  const outcomeMessage = computed(() => buildOutcomeMessage(lastEvaluation.value, lastOutcomeTarget.value, settings.value))
  const kanaPills = computed<KanaPill[]>(() => {
    const mode = settings.value.mode
    const order = getKanaOrder(mode)
    const unlockedCount = progress.value.unlockedCountByMode[mode]
    const current = progress.value.currentTargetKanaByMode[mode]
    const stats = progress.value.kanaStatsByMode[mode]

    return order.map((kana, index) => {
      const locked = index >= unlockedCount
      const kanaStats = stats[kana]
      let status = 'new'
      if (locked) status = 'locked'
      else if (kana === current) status = 'current'
      else if (kanaStats?.passed) status = 'passed'
      else if (kanaStats?.attempts > 0) status = 'weak'

      return { kana, status }
    })
  })
  const kanaRows = computed(() => groupKanaRows(settings.value.mode, kanaPills.value))

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

  onMounted(() => {
    focusTypingBox()
  })

  function submitBatch() {
    if (!canSubmit.value) return
    startedAt.value ??= Date.now()
    const elapsedMs = Date.now() - startedAt.value
    const evaluation = evaluateBatch(targetText.value, typedText.value, elapsedMs)
    lastOutcomeTarget.value = progress.value.currentTargetKanaByMode[settings.value.mode]
    progress.value = applyEvaluationToProgress(progress.value, normalizeSettings(settings.value), evaluation, batch.value.words)
    lastEvaluation.value = evaluation
    saveProgress(progress.value)
    typedText.value = ''
    startedAt.value = null
    regenerateBatch()
  }

  function regenerateBatch(options: RegenerateBatchOptions = {}) {
    const { focus = true } = options
    batch.value = generateBatch(words, normalizeSettings(settings.value), progress.value)
    if (focus) focusTypingBox()
  }

  function clearInput() {
    typedText.value = ''
    startedAt.value = null
    focusTypingBox()
  }

  function updateSettings(patch: Partial<PracticeSettings>) {
    settings.value = {
      ...settings.value,
      ...patch,
    }
  }

  function updateTypedText(value: string) {
    typedText.value = value
    startedAt.value ??= Date.now()
  }

  function resetProgress() {
    if (!confirm('Reset all KanaKey progress? Settings will be kept.')) return
    clearProgress()
    progress.value = createInitialProgress(settings.value)
    saveProgress(progress.value)
    lastEvaluation.value = null
    lastOutcomeTarget.value = null
    typedText.value = ''
    startedAt.value = null
    regenerateBatch()
  }

  function focusTypingBox() {
    nextTick(() => typingBox.value?.focus())
  }

  return () => (
    <main class="shell">
      <Hero
        currentKana={summary.value.current}
        targetKpm={settings.value.targetKpm}
        accuracyPercent={accuracyPercent.value}
      />

      <section class="trainer-layout">
        <PracticePanel
          targetWords={targetWords.value}
          warning={batch.value.warning}
          isFirstRun={isFirstRun.value}
          typedText={typedText.value}
          canSubmit={canSubmit.value}
          typingBox={typingBox}
          currentKana={summary.value.current}
          targetKpm={settings.value.targetKpm}
          targetAccuracyPercent={accuracyPercent.value}
          minAttemptsPerKana={settings.value.minAttemptsPerKana}
          passMeter={passMeter.value}
          lastEvaluation={lastEvaluation.value}
          outcomeMessage={outcomeMessage.value}
          regenerateBatch={regenerateBatch}
          submitBatch={submitBatch}
          clearInput={clearInput}
          updateTypedText={updateTypedText}
        />

        <SettingsPanel
          settings={settings.value}
          accuracyPercent={accuracyPercent.value}
          updateSettings={updateSettings}
          setAccuracyPercent={(value) => { accuracyPercent.value = value }}
          resetProgress={resetProgress}
        />
      </section>

      <StatsGrid
        mode={summary.value.mode}
        unlockedCount={summary.value.unlocked.length}
        weakCount={summary.value.weak.length}
        targetAttempts={currentStats.value?.attempts ?? 0}
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
    || previous.minAttemptsPerKana !== next.minAttemptsPerKana
    || previous.smoothingWindow !== next.smoothingWindow
}

function buildOutcomeMessage(
  evaluation: BatchEvaluation | null,
  targetKana: string | null,
  settings: PracticeSettings,
): string | null {
  if (!evaluation) return null

  const missing: string[] = []
  if (evaluation.kpm < settings.targetKpm) {
    missing.push(`${Math.ceil(settings.targetKpm - evaluation.kpm)} more kana/min`)
  }
  if (evaluation.accuracy < settings.targetAccuracy) {
    missing.push(`${Math.ceil((settings.targetAccuracy - evaluation.accuracy) * 100)}% more accuracy`)
  }

  if (missing.length === 0) {
    return `${targetKana ?? 'Target'} improved: speed and accuracy were above target for this batch.`
  }

  return `${targetKana ?? 'Target'} needs ${missing.join(' and ')} before it counts as stable.`
}
