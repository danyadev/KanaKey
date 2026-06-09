import { defineComponent } from 'vue'

import type { PracticeMode } from '../../types'
import './StatsGrid.css'

type StatsGridProps = {
  mode: PracticeMode
  unlockedCount: number
  weakCount: number
  targetAttempts: number
}

export const StatsGrid = defineComponent<StatsGridProps>((props, _ctx) => {
  return () => (
    <section class="stats-grid">
      <StatCard label="Mode" value={props.mode} />
      <StatCard label="Unlocked" value={String(props.unlockedCount)} />
      <StatCard label="Weak kana" value={String(props.weakCount)} />
      <StatCard label="Target attempts" value={String(props.targetAttempts)} />
    </section>
  )
}, {
  props: ['mode', 'unlockedCount', 'weakCount', 'targetAttempts'],
})

type StatCardProps = {
  label: string
  value: string
}

const StatCard = defineComponent<StatCardProps>((props, _ctx) => {
  return () => (
    <article class="stat panel">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  )
}, {
  props: ['label', 'value'],
})
