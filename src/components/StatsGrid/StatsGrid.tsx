import { defineComponent } from 'vue'
import { storeToRefs } from 'pinia'

import { usePracticeStore } from '../../stores/practiceStore'
import './StatsGrid.css'

export const StatsGrid = defineComponent(() => {
  const store = usePracticeStore()
  const { currentAppearances, progress, summary } = storeToRefs(store)

  return () => (
    <section class="stats-grid">
      <StatCard label="Unlocked" value={String(summary.value.unlocked.length)} />
      <StatCard label="Weak kana" value={String(summary.value.weak.length)} />
      <StatCard label="Target appearances" value={String(currentAppearances.value)} />
      <StatCard label="Today" value={`${Math.floor(progress.value.practiceTime.todayMs / 60000)}m`} />
      <StatCard label="Overall" value={`${Math.floor(progress.value.practiceTime.totalMs / 60000)}m`} />
    </section>
  )
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
