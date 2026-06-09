<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { getKanaOrder } from './kana'
import seedWords from './words.json'
import { clearProgress, loadProgress, loadSettings, saveProgress, saveSettings } from './storage'
import type { BatchEvaluation, BatchResult, PracticeMode, PracticeSettings, ProgressState, WordEntry } from './types'
import {
  applyEvaluationToProgress,
  createInitialProgress,
  evaluateBatch,
  expectedText,
  generateBatch,
  normalizeSettings,
  progressSummary,
} from './trainer'

const words = seedWords as WordEntry[]
const settings = ref<PracticeSettings>(loadSettings())
const progress = ref<ProgressState>(loadProgress(settings.value))
const batch = ref<BatchResult>(generateBatch(words, settings.value, progress.value))
const typedText = ref('')
const startedAt = ref<number | null>(null)
const lastEvaluation = ref<BatchEvaluation | null>(null)

const accuracyPercent = computed({
  get: () => Math.round(settings.value.targetAccuracy * 100),
  set: (value: number) => {
    settings.value.targetAccuracy = Number(value) / 100
  },
})

const targetText = computed(() => expectedText(batch.value.words))
const summary = computed(() => progressSummary(progress.value, settings.value))
const currentStats = computed(() => {
  const mode = settings.value.mode
  const target = progress.value.currentTargetKanaByMode[mode]
  return progress.value.kanaStatsByMode[mode][target]
})
const recentSessions = computed(() => progress.value.sessionHistory.slice(-5).reverse())
const kanaPills = computed(() => {
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

watch(settings, (nextSettings) => {
  const normalized = normalizeSettings(nextSettings)
  progress.value.mode = normalized.mode
  saveSettings(normalized)
  saveProgress(progress.value)
  regenerateBatch()
}, { deep: true })

function setMode(mode: PracticeMode) {
  settings.value.mode = mode
}

function startTyping() {
  startedAt.value ??= Date.now()
}

function submitBatch() {
  startTyping()
  const elapsedMs = Date.now() - (startedAt.value ?? Date.now())
  const evaluation = evaluateBatch(targetText.value, typedText.value, elapsedMs)
  progress.value = applyEvaluationToProgress(progress.value, normalizeSettings(settings.value), evaluation, batch.value.words)
  lastEvaluation.value = evaluation
  saveProgress(progress.value)
  typedText.value = ''
  startedAt.value = null
  regenerateBatch()
}

function regenerateBatch() {
  batch.value = generateBatch(words, normalizeSettings(settings.value), progress.value)
}

function resetProgress() {
  if (!confirm('Reset all KanaKey progress? Settings will be kept.')) return
  clearProgress()
  progress.value = createInitialProgress(settings.value)
  saveProgress(progress.value)
  lastEvaluation.value = null
  typedText.value = ''
  startedAt.value = null
  regenerateBatch()
}
</script>

<template>
  <main class="shell">
    <section class="hero panel">
      <div>
        <p class="eyebrow">KanaKey MVP</p>
        <h1>Train kana through real words.</h1>
        <p class="lede">
          Type the batch with your Japanese IME. Kana unlock only after smoothed speed and accuracy stay above target.
        </p>
      </div>
      <div class="target-card">
        <span>Current target</span>
        <strong>{{ summary.current }}</strong>
        <small>{{ settings.targetKpm }} kana/min · {{ accuracyPercent }}% accuracy</small>
      </div>
    </section>

    <section class="stats-grid">
      <article class="stat panel">
        <span>Mode</span>
        <strong>{{ summary.mode }}</strong>
      </article>
      <article class="stat panel">
        <span>Unlocked</span>
        <strong>{{ summary.unlocked.length }}</strong>
      </article>
      <article class="stat panel">
        <span>Weak kana</span>
        <strong>{{ summary.weak.length }}</strong>
      </article>
      <article class="stat panel">
        <span>Target attempts</span>
        <strong>{{ currentStats?.attempts ?? 0 }}</strong>
      </article>
    </section>

    <section class="workspace">
      <article class="practice panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Practice batch</p>
            <h2>{{ targetText || 'No unlocked words yet' }}</h2>
          </div>
          <button type="button" class="ghost" @click="regenerateBatch">New batch</button>
        </div>

        <p v-if="batch.warning" class="warning">{{ batch.warning }}</p>

        <textarea
          v-model="typedText"
          class="typing-box"
          spellcheck="false"
          autocomplete="off"
          placeholder="Type the kana here, separated by spaces or Japanese spaces"
          @input="startTyping"
          @keydown.meta.enter.prevent="submitBatch"
          @keydown.ctrl.enter.prevent="submitBatch"
        />

        <div class="actions">
          <button type="button" class="primary" :disabled="!targetText" @click="submitBatch">Submit batch</button>
          <p class="hint">Shortcut: Ctrl/⌘ + Enter. Normal spaces and Japanese spaces compare the same.</p>
        </div>

        <div v-if="lastEvaluation" class="result-strip">
          <span>Speed <strong>{{ Math.round(lastEvaluation.kpm) }}</strong> kana/min</span>
          <span>Accuracy <strong>{{ Math.round(lastEvaluation.accuracy * 100) }}</strong>%</span>
          <span>Correct <strong>{{ lastEvaluation.correctKanaCount }}/{{ lastEvaluation.totalExpectedKana }}</strong></span>
        </div>
      </article>

      <aside class="panel settings-panel">
        <p class="eyebrow">Settings</p>
        <div class="mode-switch" aria-label="Practice mode">
          <button type="button" :class="{ active: settings.mode === 'hiragana' }" @click="setMode('hiragana')">Hiragana</button>
          <button type="button" :class="{ active: settings.mode === 'katakana' }" @click="setMode('katakana')">Katakana</button>
          <button type="button" :class="{ active: settings.mode === 'mixed' }" @click="setMode('mixed')">Mixed</button>
        </div>

        <label>
          Batch size
          <input v-model.number="settings.batchSize" type="number" min="1" max="50" />
        </label>
        <label>
          Target kana/min
          <input v-model.number="settings.targetKpm" type="number" min="1" max="400" />
        </label>
        <label>
          Target accuracy %
          <input v-model.number="accuracyPercent" type="number" min="50" max="100" />
        </label>
        <label>
          Initial unlocked kana
          <input v-model.number="settings.initialUnlockedCount" type="number" min="1" max="160" />
        </label>
        <label>
          Minimum attempts per kana
          <input v-model.number="settings.minAttemptsPerKana" type="number" min="1" max="20" />
        </label>
        <label>
          Smoothing window
          <input v-model.number="settings.smoothingWindow" type="number" min="1" max="20" />
        </label>
        <label class="check">
          <input v-model="settings.doubleWords" type="checkbox" />
          Double every word
        </label>
        <label class="check">
          <input v-model="settings.shuffleDoubledWords" type="checkbox" :disabled="!settings.doubleWords" />
          Shuffle doubled words
        </label>
        <button type="button" class="danger" @click="resetProgress">Reset progress</button>
      </aside>
    </section>

    <section class="panel progress-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Progress</p>
          <h2>Kana map</h2>
        </div>
        <p class="legend">passed · weak · current · locked</p>
      </div>
      <div class="kana-map">
        <span v-for="pill in kanaPills" :key="pill.kana" class="kana-pill" :class="pill.status">
          {{ pill.kana }}
        </span>
      </div>
    </section>

    <section class="panel history-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Recent</p>
          <h2>Last batches</h2>
        </div>
      </div>
      <p v-if="recentSessions.length === 0" class="empty">No completed batches yet.</p>
      <div v-else class="history-list">
        <article v-for="session in recentSessions" :key="session.timestamp" class="history-item">
          <strong>{{ session.targetKana }}</strong>
          <span>{{ Math.round(session.kpm) }} kpm</span>
          <span>{{ Math.round(session.accuracy * 100) }}%</span>
          <small>{{ session.words.join('　') }}</small>
        </article>
      </div>
    </section>
  </main>
</template>
