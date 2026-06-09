<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

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

type KanaPill = {
  kana: string
  status: string
}

type KanaRow = {
  label: string
  items: KanaPill[]
}

const words = seedWords as WordEntry[]
const settings = ref<PracticeSettings>(loadSettings())
const progress = ref<ProgressState>(loadProgress(settings.value))
const batch = ref<BatchResult>(generateBatch(words, settings.value, progress.value))
const typedText = ref('')
const startedAt = ref<number | null>(null)
const lastEvaluation = ref<BatchEvaluation | null>(null)
const lastOutcomeTarget = ref<string | null>(null)
const typingBox = ref<HTMLTextAreaElement | null>(null)

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
const outcomeMessage = computed(() => {
  const evaluation = lastEvaluation.value
  if (!evaluation) return null

  const missing: string[] = []
  if (evaluation.kpm < settings.value.targetKpm) {
    missing.push(`${Math.ceil(settings.value.targetKpm - evaluation.kpm)} more kana/min`)
  }
  if (evaluation.accuracy < settings.value.targetAccuracy) {
    missing.push(`${Math.ceil((settings.value.targetAccuracy - evaluation.accuracy) * 100)}% more accuracy`)
  }

  if (missing.length === 0) {
    return `${lastOutcomeTarget.value ?? 'Target'} improved: speed and accuracy were above target for this batch.`
  }

  return `${lastOutcomeTarget.value ?? 'Target'} needs ${missing.join(' and ')} before it counts as stable.`
})
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
const kanaRows = computed<KanaRow[]>(() => groupKanaRows(settings.value.mode, kanaPills.value))

watch(settings, (nextSettings) => {
  const normalized = normalizeSettings(nextSettings)
  progress.value.mode = normalized.mode
  saveSettings(normalized)
  saveProgress(progress.value)
  regenerateBatch()
}, { deep: true })

onMounted(() => {
  focusTypingBox()
})

function setMode(mode: PracticeMode) {
  settings.value.mode = mode
}

function startTyping() {
  startedAt.value ??= Date.now()
}

function submitBatch() {
  if (!canSubmit.value) return
  startTyping()
  const elapsedMs = Date.now() - (startedAt.value ?? Date.now())
  const evaluation = evaluateBatch(targetText.value, typedText.value, elapsedMs)
  lastOutcomeTarget.value = progress.value.currentTargetKanaByMode[settings.value.mode]
  progress.value = applyEvaluationToProgress(progress.value, normalizeSettings(settings.value), evaluation, batch.value.words)
  lastEvaluation.value = evaluation
  saveProgress(progress.value)
  typedText.value = ''
  startedAt.value = null
  regenerateBatch()
}

function regenerateBatch() {
  batch.value = generateBatch(words, normalizeSettings(settings.value), progress.value)
  focusTypingBox()
}

function clearInput() {
  typedText.value = ''
  startedAt.value = null
  focusTypingBox()
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

function meterPercent(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function groupKanaRows(mode: PracticeMode, pills: KanaPill[]): KanaRow[] {
  const byKana = new Map(pills.map((pill) => [pill.kana, pill]))
  const rows = mode === 'mixed' ? [...HIRAGANA_ROWS, ...KATAKANA_ROWS] : mode === 'hiragana' ? HIRAGANA_ROWS : KATAKANA_ROWS

  return rows
    .map((row) => ({
      label: row.label,
      items: row.kana.map((kana) => byKana.get(kana)).filter((pill): pill is KanaPill => Boolean(pill)),
    }))
    .filter((row) => row.items.length > 0)
}

const HIRAGANA_ROWS = [
  { label: 'あ', kana: ['あ', 'い', 'う', 'え', 'お'] },
  { label: 'か', kana: ['か', 'き', 'く', 'け', 'こ'] },
  { label: 'さ', kana: ['さ', 'し', 'す', 'せ', 'そ'] },
  { label: 'た', kana: ['た', 'ち', 'つ', 'て', 'と'] },
  { label: 'な', kana: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { label: 'は', kana: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { label: 'ま', kana: ['ま', 'み', 'む', 'め', 'も'] },
  { label: 'や', kana: ['や', 'ゆ', 'よ'] },
  { label: 'ら', kana: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { label: 'わ', kana: ['わ', 'を', 'ん'] },
  { label: 'が', kana: ['が', 'ぎ', 'ぐ', 'げ', 'ご'] },
  { label: 'ざ', kana: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'] },
  { label: 'だ', kana: ['だ', 'ぢ', 'づ', 'で', 'ど'] },
  { label: 'ば', kana: ['ば', 'び', 'ぶ', 'べ', 'ぼ'] },
  { label: 'ぱ', kana: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'] },
  { label: '小', kana: ['ゃ', 'ゅ', 'ょ', 'っ'] },
]

const KATAKANA_ROWS = [
  { label: 'ア', kana: ['ア', 'イ', 'ウ', 'エ', 'オ'] },
  { label: 'カ', kana: ['カ', 'キ', 'ク', 'ケ', 'コ'] },
  { label: 'サ', kana: ['サ', 'シ', 'ス', 'セ', 'ソ'] },
  { label: 'タ', kana: ['タ', 'チ', 'ツ', 'テ', 'ト'] },
  { label: 'ナ', kana: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'] },
  { label: 'ハ', kana: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'] },
  { label: 'マ', kana: ['マ', 'ミ', 'ム', 'メ', 'モ'] },
  { label: 'ヤ', kana: ['ヤ', 'ユ', 'ヨ'] },
  { label: 'ラ', kana: ['ラ', 'リ', 'ル', 'レ', 'ロ'] },
  { label: 'ワ', kana: ['ワ', 'ヲ', 'ン'] },
  { label: 'ガ', kana: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'] },
  { label: 'ザ', kana: ['ザ', 'ジ', 'ズ', 'ゼ', 'ゾ'] },
  { label: 'ダ', kana: ['ダ', 'ヂ', 'ヅ', 'デ', 'ド'] },
  { label: 'バ', kana: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'] },
  { label: 'パ', kana: ['パ', 'ピ', 'プ', 'ペ', 'ポ'] },
  { label: '小', kana: ['ャ', 'ュ', 'ョ', 'ッ', 'ー'] },
]
</script>

<template>
  <main class="shell">
    <section class="hero panel">
      <div>
        <p class="eyebrow">KanaKey MVP</p>
        <h1>Focused kana typing.</h1>
        <p class="lede">
          Train one kana at a time through short Japanese words. The next kana unlocks only after the current set stays stable.
        </p>
      </div>
      <div class="target-card kana-display">
        <span>Current target</span>
        <strong>{{ summary.current }}</strong>
        <small>{{ settings.targetKpm }} kana/min · {{ accuracyPercent }}% accuracy</small>
      </div>
    </section>

    <section class="trainer-layout">
      <article class="practice panel">
        <div class="practice-topline">
          <div>
            <p class="eyebrow">Practice line</p>
            <p class="practice-note">Use your Japanese IME. Type the kana line exactly, then press Ctrl/⌘+Enter.</p>
          </div>
          <button type="button" class="ghost" @click="regenerateBatch">New batch</button>
        </div>

        <div class="target-line kana-display" aria-label="Current practice words">
          <span v-for="word in targetWords" :key="word.id" class="target-word" :class="{ synthetic: word.synthetic }">
            {{ word.kana }}
          </span>
          <span v-if="targetWords.length === 0" class="target-empty">No unlocked words yet</span>
        </div>

        <ol v-if="isFirstRun" class="first-run">
          <li>Enable a Japanese IME.</li>
          <li>Type kana directly into the box.</li>
          <li>Submit with Ctrl/⌘+Enter.</li>
        </ol>

        <p v-if="batch.warning" class="warning">{{ batch.warning }}</p>

        <textarea
          ref="typingBox"
          v-model="typedText"
          class="typing-box kana-display"
          spellcheck="false"
          autocomplete="off"
          placeholder="Type here: あい　あお　うえ"
          @input="startTyping"
          @keydown.esc.prevent="clearInput"
          @keydown.meta.enter.prevent="submitBatch"
          @keydown.ctrl.enter.prevent="submitBatch"
        />

        <div class="actions">
          <button type="button" class="primary" :disabled="!canSubmit" @click="submitBatch">Submit batch</button>
          <button type="button" class="ghost" :disabled="typedText.length === 0" @click="clearInput">Clear</button>
          <p class="hint">Escape clears input. Spaces and Japanese spaces compare the same.</p>
        </div>

        <div class="pass-card">
          <div class="pass-card-head">
            <span class="eyebrow">Current kana meter</span>
            <strong class="kana-display">{{ summary.current }}</strong>
          </div>
          <div class="meter-row">
            <span>KPM</span>
            <div class="meter"><i :style="{ width: `${passMeter.kpmPercent}%` }" /></div>
            <b>{{ passMeter.kpm }}/{{ settings.targetKpm }}</b>
          </div>
          <div class="meter-row">
            <span>Accuracy</span>
            <div class="meter"><i :style="{ width: `${passMeter.accuracyPercent}%` }" /></div>
            <b>{{ passMeter.accuracy }}%/{{ accuracyPercent }}%</b>
          </div>
          <div class="meter-row">
            <span>Attempts</span>
            <div class="meter"><i :style="{ width: `${passMeter.attemptsPercent}%` }" /></div>
            <b>{{ passMeter.attempts }}/{{ settings.minAttemptsPerKana }}</b>
          </div>
        </div>

        <div v-if="lastEvaluation" class="result-strip">
          <span>Speed <strong>{{ Math.round(lastEvaluation.kpm) }}</strong> kana/min</span>
          <span>Accuracy <strong>{{ Math.round(lastEvaluation.accuracy * 100) }}</strong>%</span>
          <span>Correct <strong>{{ lastEvaluation.correctKanaCount }}/{{ lastEvaluation.totalExpectedKana }}</strong></span>
        </div>

        <p v-if="outcomeMessage" class="outcome">{{ outcomeMessage }}</p>
      </article>

      <aside class="panel settings-panel">
        <p class="eyebrow">Session controls</p>
        <div class="mode-switch" aria-label="Practice mode">
          <button type="button" :class="{ active: settings.mode === 'hiragana' }" @click="setMode('hiragana')">Hiragana</button>
          <button type="button" :class="{ active: settings.mode === 'katakana' }" @click="setMode('katakana')">Katakana</button>
          <button type="button" :class="{ active: settings.mode === 'mixed' }" @click="setMode('mixed')">Mixed</button>
        </div>

        <div class="quick-settings">
          <label>
            Batch size
            <input v-model.number="settings.batchSize" type="number" min="1" max="50" />
          </label>
          <label class="check">
            <input v-model="settings.doubleWords" type="checkbox" />
            Double every word
          </label>
          <label class="check">
            <input v-model="settings.shuffleDoubledWords" type="checkbox" :disabled="!settings.doubleWords" />
            Shuffle doubled words
          </label>
        </div>

        <details class="advanced-settings">
          <summary>Advanced targets</summary>
          <div class="advanced-grid">
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
          </div>
        </details>

        <button type="button" class="danger" @click="resetProgress">Reset progress</button>
      </aside>
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

    <section class="panel progress-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Progress</p>
          <h2>Kana map</h2>
        </div>
        <p class="legend">passed · weak · current · locked</p>
      </div>
      <div class="kana-rows">
        <div v-for="row in kanaRows" :key="row.label" class="kana-row">
          <span class="row-label kana-display">{{ row.label }}</span>
          <div class="row-kana">
            <span v-for="pill in row.items" :key="pill.kana" class="kana-pill kana-display" :class="pill.status">
              {{ pill.kana }}
            </span>
          </div>
        </div>
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
          <strong class="kana-display">{{ session.targetKana }}</strong>
          <span>{{ Math.round(session.kpm) }} kpm</span>
          <span>{{ Math.round(session.accuracy * 100) }}%</span>
          <small class="kana-display">{{ session.words.join('　') }}</small>
        </article>
      </div>
    </section>
  </main>
</template>
