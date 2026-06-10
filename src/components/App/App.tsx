import { computed, defineComponent, nextTick, onMounted, ref, watch } from 'vue'

import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { groupKanaRows } from '../KanaMap/kanaRows'
import type { KanaPill } from '../KanaMap/kanaRows'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import { resetPracticeDraft } from './practiceDraft'
import { loadKanaFontChoice, saveKanaFontChoice } from './uiPrefs'
import type { KanaFontChoice } from './uiPrefs'
import { getKanaOrder } from '../../kana'
import seedWords from '../../words.json'
import { clearProgress, loadProgress, loadSettings, saveProgress, saveSettings } from '../../storage'
import type { BatchEvaluation, BatchResult, PracticeMode, PracticeSettings, ProgressState, WordEntry } from '../../types'
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

  const targetText = computed(() => expectedText(batch.value.words))
  const canSubmit = computed(() => typedText.value.trim().length > 0 && targetText.value.length > 0)
  const summary = computed(() => progressSummary(progress.value, settings.value))
  const currentStats = computed(() => {
    const mode = settings.value.mode
    const target = progress.value.currentTargetKanaByMode[mode]
    return progress.value.kanaStatsByMode[mode][target]
  })
  const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
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
  const kanaPills = computed<KanaPill[]>(() => [
    ...buildKanaPills('hiragana'),
    ...buildKanaPills('katakana'),
  ])
  const kanaRows = computed(() => groupKanaRows(kanaPills.value))

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

  function submitBatch() {
    if (!canSubmit.value) return
    startedAt.value ??= Date.now()
    const elapsedMs = Date.now() - startedAt.value
    const mode = settings.value.mode
    const previousTarget = progress.value.currentTargetKanaByMode[mode]
    const evaluation = evaluateBatch(targetText.value, typedText.value, elapsedMs)
    const normalizedSettings = normalizeSettings(settings.value)
    progress.value = applyEvaluationToProgress(progress.value, normalizedSettings, evaluation, batch.value.words)
    const nextTarget = progress.value.currentTargetKanaByMode[mode]
    const targetStats = progress.value.kanaStatsByMode[mode][previousTarget]
    outcomeMessage.value = buildOutcomeMessage({
      evaluation,
      previousTarget,
      nextTarget,
      targetAttempts: targetStats?.attempts ?? 0,
      settings: normalizedSettings,
    })
    lastEvaluation.value = evaluation
    saveProgress(progress.value)
    resetDraft()
    regenerateBatch()
  }

  function regenerateBatch(options: RegenerateBatchOptions = {}) {
    const { focus = true } = options
    batch.value = generateBatch(words, normalizeSettings(settings.value), progress.value)
    if (focus) focusTypingBox()
  }

  function clearInput() {
    resetDraft()
    focusTypingBox()
  }

  function startNewBatch() {
    resetDraft()
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
    outcomeMessage.value = null
    resetDraft()
    regenerateBatch()
  }

  function resetDraft() {
    const draft = resetPracticeDraft()
    typedText.value = draft.typedText
    startedAt.value = draft.startedAt
  }

  function focusTypingBox() {
    nextTick(() => typingBox.value?.focus())
  }

  function buildKanaPills(script: 'hiragana' | 'katakana'): KanaPill[] {
    const order = getKanaOrder(script)
    const progressMode = settingsModeForKanaMap(script)
    const unlockedKana = new Set(getKanaOrder(progressMode).slice(0, progress.value.unlockedCountByMode[progressMode]))
    const current = progress.value.currentTargetKanaByMode[progressMode]
    const stats = progress.value.kanaStatsByMode[progressMode]
    const showCurrent = settings.value.mode === progressMode

    return order.map((kana) => {
      const locked = !unlockedKana.has(kana)
      const kanaStats = stats[kana]
      let status = 'new'
      if (locked) status = 'locked'
      else if (showCurrent && kana === current) status = 'current'
      else if (kanaStats?.passed) status = 'passed'
      else if (kanaStats?.attempts > 0) status = 'weak'

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
      />

      <section class="trainer-layout">
        <PracticePanel
          targetWords={targetWords.value}
          warning={batch.value.warning}
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
          onNewBatch={startNewBatch}
          onSubmit={submitBatch}
          onClear={clearInput}
          onUpdate:typedText={updateTypedText}
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

type BuildOutcomeMessageInput = {
  evaluation: BatchEvaluation
  previousTarget: string
  nextTarget: string
  targetAttempts: number
  settings: PracticeSettings
}

function buildOutcomeMessage(input: BuildOutcomeMessageInput): string {
  const { evaluation, previousTarget, nextTarget, targetAttempts, settings } = input
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

  if (missing.length > 0) {
    return `Almost. ${missing.join(' ')}`
  }

  const attemptsMissing = Math.max(0, settings.minAttemptsPerKana - targetAttempts)
  if (attemptsMissing > 0) {
    return `Good round. ${previousTarget} needs ${attemptsMissing} more stable attempts.`
  }

  return `Good round. Keep going on ${previousTarget}.`
}
