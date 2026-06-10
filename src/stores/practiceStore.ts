import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { generateBatch } from '../model/batch'
import type { BatchResult } from '../model/batch'
import { buildInputEvaluation } from '../model/inputSurface'
import {
  commitKanaInput,
  createInputSurfaceState,
  endComposition as endInputComposition,
  getSurfaceWordViews,
  startComposition as startInputComposition,
  updateComposition as updateInputComposition,
} from '../model/inputSurface'
import type { InputSurfaceState } from '../model/inputSurface'
import {
  applyEvaluationToProgress,
  createInitialProgress,
  progressSummary,
  refreshProgressPassFlags,
} from '../model/progress'
import type { ProgressState } from '../model/progress'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  settingsAffectPassState,
} from '../model/settings'
import type { PracticeSettings } from '../model/settings'
import type { WordEntry } from '../model/words'
import {
  browserKanaFontStorage,
  createKanaFontStorage,
} from '../storage/kanaFontStorage'
import type { KanaFontChoice } from '../storage/kanaFontStorage'
import {
  browserKanaKeyStorage,
  createKanaKeyStorage,
} from '../storage/kanaKeyStorage'
import type { KeyValueStorage } from '../storage/kanaKeyStorage'
import { buildOutcomeMessage, formatBatchWarning } from '../session/practiceMessages'
import {
  buildDailyProgress,
  buildKanaPills,
  buildPassMeter,
  currentAppearances,
  currentStats,
  currentTargetLabel,
} from '../session/practiceViewModels'
import type { BatchEvaluation } from '../model/evaluation'

export type PracticeStoreServices = {
  storage?: ReturnType<typeof createKanaKeyStorage>
  fontStorage?: ReturnType<typeof createKanaFontStorage>
  words?: WordEntry[]
}

export type PracticeStoreInit = PracticeStoreServices & {
  keyValueStorage?: KeyValueStorage
}

const emptyBatch: BatchResult = { words: [], warnings: [] }

export const usePracticeStore = defineStore('practice', () => {
  let storage = browserKanaKeyStorage
  let fontStorage = browserKanaFontStorage

  const words = shallowRef<WordEntry[]>([])
  const settings = ref<PracticeSettings>(DEFAULT_SETTINGS)
  const progress = ref<ProgressState>(createInitialProgress(DEFAULT_SETTINGS))
  const batch = ref<BatchResult>(emptyBatch)
  const inputState = ref<InputSurfaceState>(createInputSurfaceState([]))
  const lastEvaluation = ref<BatchEvaluation | null>(null)
  const outcomeMessage = ref<string | null>(null)
  const kanaFont = ref<KanaFontChoice>('gothic')

  const accuracyPercent = computed(() => Math.round(settings.value.targetAccuracy * 100))
  const surfaceWords = computed(() => getSurfaceWordViews(inputState.value))
  const summary = computed(() => progressSummary(progress.value, settings.value))
  const currentStatsValue = computed(() => currentStats(progress.value, settings.value))
  const currentAppearancesValue = computed(() => currentAppearances(progress.value, settings.value))
  const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
  const passMeter = computed(() => buildPassMeter(currentStatsValue.value, settings.value))
  const dailyProgress = computed(() => buildDailyProgress(progress.value, settings.value))
  const kanaPills = computed(() => buildKanaPills(progress.value, settings.value))
  const canSubmit = computed(() => inputState.value.completed && inputState.value.units.length > 0)
  const warningMessages = computed(() => batch.value.warnings.map(formatBatchWarning))

  function initialize(options: PracticeStoreInit = {}) {
    if (options.keyValueStorage) {
      storage = createKanaKeyStorage(options.keyValueStorage)
      fontStorage = createKanaFontStorage(options.keyValueStorage)
    } else {
      storage = options.storage ?? browserKanaKeyStorage
      fontStorage = options.fontStorage ?? browserKanaFontStorage
    }

    words.value = options.words ?? words.value
    settings.value = storage.loadSettings()
    progress.value = storage.loadProgress(settings.value)
    kanaFont.value = fontStorage.loadKanaFontChoice()
    lastEvaluation.value = null
    outcomeMessage.value = null
    regenerateBatch()
  }

  function updateSettings(patch: Partial<PracticeSettings>) {
    const previous = settings.value
    const next = normalizeSettings({ ...previous, ...patch })

    settings.value = next
    if (settingsAffectPassState(previous, next)) {
      progress.value = refreshProgressPassFlags(progress.value, next)
    }

    progress.value.mode = next.mode
    persistSettingsAndProgress()
    regenerateBatch()
  }

  function regenerateBatch() {
    batch.value = generateBatch(words.value, settings.value, progress.value)
    inputState.value = createInputSurfaceState(batch.value.words)
  }

  function clearInput() {
    inputState.value = createInputSurfaceState(batch.value.words)
  }

  function submitBatch(completedAt = Date.now()) {
    if (!canSubmit.value) return

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
    storage.saveProgress(progress.value)
    regenerateBatch()
  }

  function commitInput(value: string) {
    const now = Date.now()
    inputState.value = commitKanaInput(inputState.value, value, now)
    if (inputState.value.completed) submitBatch(now)
  }

  function startComposition() {
    inputState.value = startInputComposition(inputState.value)
  }

  function updateComposition(value: string) {
    inputState.value = updateInputComposition(inputState.value, value)
  }

  function endComposition(value: string) {
    inputState.value = endInputComposition(inputState.value)
    commitInput(value)
  }

  function resetProgress() {
    storage.clearProgress()
    progress.value = createInitialProgress(settings.value)
    storage.saveProgress(progress.value)
    lastEvaluation.value = null
    outcomeMessage.value = null
    regenerateBatch()
  }

  function updateKanaFont(font: KanaFontChoice) {
    kanaFont.value = font
    fontStorage.saveKanaFontChoice(font)
  }

  function persistSettingsAndProgress() {
    storage.saveSettings(settings.value)
    storage.saveProgress(progress.value)
  }

  return {
    accuracyPercent,
    batch,
    canSubmit,
    currentAppearances: currentAppearancesValue,
    currentStats: currentStatsValue,
    dailyProgress,
    inputState,
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
    warningMessages,
    clearInput,
    commitInput,
    endComposition,
    initialize,
    regenerateBatch,
    resetProgress,
    startComposition,
    submitBatch,
    updateComposition,
    updateKanaFont,
    updateSettings,
  }
})
