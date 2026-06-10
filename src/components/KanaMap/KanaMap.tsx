import { defineComponent } from 'vue'

import type { KanaRow } from './kanaRows'
import './KanaMap.css'

type KanaMapProps = {
  rows: KanaRow[]
}

export const KanaMap = defineComponent<KanaMapProps>((props, _ctx) => {
  return () => (
    <section class="panel progress-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Progress</p>
          <h2>Kana map</h2>
        </div>
        <p class="legend">hiragana + katakana · passed · weak · current · locked</p>
      </div>
      <div class="kana-rows">
        {props.rows.map((row) => (
          <div key={row.id} class={['kana-row', row.script]}>
            <span class="row-label kana-display">{row.label}</span>
            <div class="row-kana">
              {row.items.map((pill) => (
                <span key={pill.kana} class={['kana-pill', 'kana-display', pill.status]}>
                  {pill.kana}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}, {
  props: ['rows'],
})
