import { storeToRefs } from 'pinia'
import { defineComponent } from 'vue'

import { usePracticeStore } from '../../stores/practiceStore'
import words from '../../words.json'
import type { WordEntry } from '../../model/words'
import { Hero } from '../Hero/Hero'
import { HistoryPanel } from '../HistoryPanel/HistoryPanel'
import { KanaMap } from '../KanaMap/KanaMap'
import { PracticePanel } from '../PracticePanel/PracticePanel'
import { SettingsPanel } from '../SettingsPanel/SettingsPanel'
import { StatsGrid } from '../StatsGrid/StatsGrid'
import './App.css'

export const App = defineComponent(() => {
  const store = usePracticeStore()

  store.initialize({ words: words as WordEntry[] })

  const {
    dailyProgress,
    kanaFont,
    passMeter,
  } = storeToRefs(store)

  return () => (
    <main class={['shell', `kana-font-${kanaFont.value}`]}>
      <Hero
        speedProgressPercent={passMeter.value.kpmPercent}
        accuracyProgressPercent={passMeter.value.accuracyPercent}
        dailyProgressLabel={dailyProgress.value.label}
        dailyProgressPercent={dailyProgress.value.percent}
      />

      <section class="trainer-layout">
        <PracticePanel />
        <SettingsPanel />
      </section>

      <StatsGrid />
      <KanaMap />
      <HistoryPanel />
    </main>
  )
})
