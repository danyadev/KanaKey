import { storeToRefs } from 'pinia'
import { defineComponent, onBeforeUnmount, onMounted, shallowRef } from 'vue'

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
  let removeViewportListeners: (() => void) | null = null

  store.initialize({ words: words as WordEntry[] })

  onMounted(() => {
    removeViewportListeners = bindVisualViewportHeight()
  })

  onBeforeUnmount(() => {
    removeViewportListeners?.()
  })

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

function bindVisualViewportHeight() {
  const root = document.documentElement
  const visualViewport = window.visualViewport

  const updateViewport = () => {
    const height = visualViewport?.height ?? window.innerHeight
    root.style.setProperty('--app-height', `${height}px`)
    if ((window.scrollX !== 0 || window.scrollY !== 0) && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0)
    }
  }

  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', updateViewport)
  window.addEventListener('scroll', updateViewport, { passive: true })
  visualViewport?.addEventListener('resize', updateViewport)
  visualViewport?.addEventListener('scroll', updateViewport)

  return () => {
    window.removeEventListener('resize', updateViewport)
    window.removeEventListener('orientationchange', updateViewport)
    window.removeEventListener('scroll', updateViewport)
    visualViewport?.removeEventListener('resize', updateViewport)
    visualViewport?.removeEventListener('scroll', updateViewport)
    root.style.removeProperty('--app-height')
  }
}
