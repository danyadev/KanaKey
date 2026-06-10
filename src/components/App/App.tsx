import { storeToRefs } from 'pinia'
import { computed, defineComponent } from 'vue'

import { useTypingFocus } from '../../composables/useTypingFocus'
import { usePracticeStore } from '../../stores/practiceStore'
import seedWords from '../../words.json'
import type { WordEntry } from '../../model/words'
import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { groupKanaRows } from '../KanaMap/kanaRows'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import './App.css'

export const App = defineComponent(() => {
  const store = usePracticeStore()
  const { focusTypingBox, typingBox } = useTypingFocus()

  store.initialize({ words: seedWords as WordEntry[] })

  const {
    accuracyPercent,
    currentAppearances,
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
  } = storeToRefs(store)

  const kanaRows = computed(() => groupKanaRows(kanaPills.value))

  function commitInput(value: string) {
    store.commitInput(value)
    focusTypingBox()
  }

  function clearInput() {
    store.clearInput()
    focusTypingBox()
  }

  function submitBatch() {
    store.submitBatch()
    focusTypingBox()
  }

  function resetProgress() {
    if (!confirm('Reset all KanaKey progress? Settings will be kept.')) return
    store.resetProgress()
    focusTypingBox()
  }

  function endComposition(value: string) {
    store.endComposition(value)
    focusTypingBox()
  }

  return () => (
    <main class={['shell', `kana-font-${kanaFont.value}`]}>
      <Hero
        speedProgressPercent={passMeter.value.kpmPercent}
        accuracyProgressPercent={passMeter.value.accuracyPercent}
        dailyProgressLabel={dailyProgress.value.label}
        dailyProgressPercent={dailyProgress.value.percent}
      />

      <section class="trainer-layout">
        <PracticePanel
          surfaceWords={surfaceWords.value}
          showWordSeparator={settings.value.showWordSeparator}
          warningMessages={warningMessages.value}
          typingBox={typingBox}
          currentKana={summary.value.current}
          compositionText={inputState.value.compositionText}
          isComposing={inputState.value.isComposing}
          targetKpm={settings.value.targetKpm}
          targetAccuracyPercent={accuracyPercent.value}
          passMeter={passMeter.value}
          lastEvaluation={lastEvaluation.value}
          outcomeMessage={outcomeMessage.value}
          onSubmit={submitBatch}
          onClear={clearInput}
          onCommitInput={commitInput}
          onCompositionStart={store.startComposition}
          onCompositionUpdate={store.updateComposition}
          onCompositionEnd={endComposition}
        />

        <SettingsPanel
          settings={settings.value}
          accuracyPercent={accuracyPercent.value}
          kanaFont={kanaFont.value}
          onUpdate:settings={store.updateSettings}
          onUpdate:kanaFont={store.updateKanaFont}
          onResetProgress={resetProgress}
        />
      </section>

      <StatsGrid
        unlockedCount={summary.value.unlocked.length}
        weakCount={summary.value.weak.length}
        targetAppearances={currentAppearances.value}
        todayMinutes={String(Math.floor(progress.value.practiceTime.todayMs / 60000))}
        totalMinutes={String(Math.floor(progress.value.practiceTime.totalMs / 60000))}
      />
      <KanaMap rows={kanaRows.value} />
      <HistoryPanel sessions={recentSessions.value} />
    </main>
  )
})
