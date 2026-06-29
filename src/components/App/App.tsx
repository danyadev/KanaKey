import { storeToRefs } from 'pinia'
import { defineComponent, shallowRef } from 'vue'

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

type AppTab = 'practice' | 'kana' | 'stats' | 'settings'

const tabs: Array<{ id: AppTab, label: string }> = [
  { id: 'practice', label: 'Practice' },
  { id: 'kana', label: 'Kana' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
]

export const App = defineComponent(() => {
  const store = usePracticeStore()
  const activeTab = shallowRef<AppTab>('practice')

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

      <nav class="app-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={{ active: activeTab.value === tab.id }}
            aria-selected={activeTab.value === tab.id}
            onClick={() => { activeTab.value = tab.id }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section class="app-stage">
        <section class="tab-panel practice-tab" hidden={activeTab.value !== 'practice'}>
          <div class="practice-workspace">
            <PracticePanel />
            <aside class="practice-side">
              <StatsGrid />
            </aside>
          </div>
        </section>

        <section class="tab-panel scroll-panel" hidden={activeTab.value !== 'kana'}>
          <KanaMap />
        </section>

        <section class="tab-panel scroll-panel" hidden={activeTab.value !== 'stats'}>
          <StatsGrid />
          <HistoryPanel />
        </section>

        <section class="tab-panel scroll-panel settings-tab" hidden={activeTab.value !== 'settings'}>
          <SettingsPanel />
        </section>
      </section>
    </main>
  )
})
