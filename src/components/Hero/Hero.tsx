import { defineComponent } from 'vue'

import './Hero.css'

type HeroProps = {
  speedProgressPercent: number
  accuracyProgressPercent: number
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
      <div class="goal-card" aria-label="Current goals progress">
        <GoalLine label="Speed" percent={props.speedProgressPercent} />
        <GoalLine label="Accuracy" percent={props.accuracyProgressPercent} />
        <GoalLine label="Today" percent={props.dailyProgressPercent} value={props.dailyProgressLabel} />
      </div>
    </section>
  )
}, {
  props: ['speedProgressPercent', 'accuracyProgressPercent', 'dailyProgressLabel', 'dailyProgressPercent'],
})

type GoalLineProps = {
  label: string
  percent: number
  value?: string
}

const GoalLine = defineComponent<GoalLineProps>((props) => {
  return () => (
    <div class="goal-line">
      <span>{props.label}</span>
      <div class="goal-meter"><i style={{ width: `${props.percent}%` }} /></div>
      <b>{props.value ?? `${props.percent}%`}</b>
    </div>
  )
}, {
  props: ['label', 'percent', 'value'],
})
