import { computed, defineComponent } from 'vue'

import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { groupKanaRows } from '../KanaMap/kanaRows'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import { usePracticeSession } from './usePracticeSession'
import seedWords from '../../words.json'
import type { WordEntry } from '../../types'
import './App.css'

export const App = defineComponent(() => {
  const session = usePracticeSession(seedWords as WordEntry[])
  const kanaRows = computed(() => groupKanaRows(session.kanaPills.value))

  return () => (
    <main class={['shell', `kana-font-${session.kanaFont.value}`]}>
      <Hero
        speedProgressPercent={session.passMeter.value.kpmPercent}
        accuracyProgressPercent={session.passMeter.value.accuracyPercent}
        dailyProgressLabel={session.dailyProgress.value.label}
        dailyProgressPercent={session.dailyProgress.value.percent}
      />

      <section class="trainer-layout">
        <PracticePanel
          surfaceWords={session.surfaceWords.value}
          showWordSeparator={session.settings.value.showWordSeparator}
          warningMessages={session.warningMessages.value}
          typingBox={session.typingBox}
          currentKana={session.summary.value.current}
          compositionText={session.inputState.value.compositionText}
          isComposing={session.inputState.value.isComposing}
          targetKpm={session.settings.value.targetKpm}
          targetAccuracyPercent={session.accuracyPercent.value}
          passMeter={session.passMeter.value}
          lastEvaluation={session.lastEvaluation.value}
          outcomeMessage={session.outcomeMessage.value}
          onSubmit={session.submitBatch}
          onClear={session.clearInput}
          onCommitInput={session.handleCommittedInput}
          onCompositionStart={session.handleCompositionStart}
          onCompositionUpdate={session.handleCompositionUpdate}
          onCompositionEnd={session.handleCompositionEnd}
        />

        <SettingsPanel
          settings={session.settings.value}
          accuracyPercent={session.accuracyPercent.value}
          kanaFont={session.kanaFont.value}
          onUpdate:settings={session.updateSettings}
          onUpdate:kanaFont={session.updateKanaFont}
          onResetProgress={session.resetProgress}
        />
      </section>

      <StatsGrid
        unlockedCount={session.summary.value.unlocked.length}
        weakCount={session.summary.value.weak.length}
        targetAppearances={session.currentAppearances.value}
        todayMinutes={String(Math.floor(session.progress.value.practiceTime.todayMs / 60000))}
        totalMinutes={String(Math.floor(session.progress.value.practiceTime.totalMs / 60000))}
      />
      <KanaMap rows={kanaRows.value} />
      <HistoryPanel sessions={session.recentSessions.value} />
    </main>
  )
})
