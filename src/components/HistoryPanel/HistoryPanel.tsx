import { defineComponent } from 'vue'

import type { SessionResult } from '../../model/progress'
import './HistoryPanel.css'

type HistoryPanelProps = {
  sessions: SessionResult[]
}

export const HistoryPanel = defineComponent<HistoryPanelProps>((props, _ctx) => {
  return () => (
    <section class="panel history-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Recent</p>
          <h2>Last batches</h2>
        </div>
      </div>
      {props.sessions.length === 0 ? (
        <p class="empty">No completed batches yet.</p>
      ) : (
        <div class="history-list">
          {props.sessions.map((session) => (
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
}, {
  props: ['sessions'],
})
