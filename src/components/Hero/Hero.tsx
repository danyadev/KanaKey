import { defineComponent } from 'vue'

import './Hero.css'

type HeroProps = {
  currentKana: string
  targetKpm: number
  accuracyPercent: number
  dailyProgressLabel: string
  dailyProgressPercent: number
}

export const Hero = defineComponent<HeroProps>((props, _ctx) => {
  return () => (
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
        <strong>{props.currentKana}</strong>
        <small>{props.targetKpm} kana/min · {props.accuracyPercent}% accuracy</small>
        <div class="daily-goal" aria-label="Daily practice progress">
          <i style={{ width: `${props.dailyProgressPercent}%` }} />
        </div>
        <em>{props.dailyProgressLabel}</em>
      </div>
    </section>
  )
}, {
  props: ['currentKana', 'targetKpm', 'accuracyPercent', 'dailyProgressLabel', 'dailyProgressPercent'],
})
