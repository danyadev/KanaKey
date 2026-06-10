import { defineComponent } from 'vue'
import { storeToRefs } from 'pinia'

import { usePracticeStore } from '../../stores/practiceStore'
import './HistoryPanel.css'

export const HistoryPanel = defineComponent(() => {
  const store = usePracticeStore()
  const { recentSessions } = storeToRefs(store)

  return () => (
    <section class="panel history-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Recent</p>
          <h2>Last batches</h2>
        </div>
      </div>
      {recentSessions.value.length === 0 ? (
        <p class="empty">No completed batches yet.</p>
      ) : (
        <div class="history-list">
          {recentSessions.value.map((session) => (
            <article key={session.timestamp} class="history-item">
              <strong class="kana-display">{session.targetKana}</strong>
              <span>{Math.round(session.kpm)} kpm</span>
              <span>{Math.round(session.accuracy * 100)}%</span>
              <small class="kana-display">{session.words.join('　')}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  )
})
