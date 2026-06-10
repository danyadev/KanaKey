import { computed, defineComponent, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'

import { buildKanaMetrics } from '../../session/practiceViewModels'
import { usePracticeStore } from '../../stores/practiceStore'
import { groupKanaRows } from './kanaRows'
import './KanaMap.css'

export const KanaMap = defineComponent(() => {
  const store = usePracticeStore()
  const { kanaPills, progress, settings } = storeToRefs(store)
  const selectedKana = shallowRef<string | null>(null)
  const rows = computed(() => groupKanaRows(kanaPills.value))
  const selectedMetrics = computed(() => {
    if (!selectedKana.value) return null
    return buildKanaMetrics(progress.value, settings.value, selectedKana.value)
  })
  const chartMax = computed(() => Math.max(1, ...(selectedMetrics.value?.chart.map((point) => point.kpm) ?? [1])))

  return () => (
    <section class="panel progress-panel">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Progress</p>
          <h2>Kana map</h2>
        </div>
      </div>
      <div class="kana-rows">
        {rows.value.flatMap((row, index) => {
          const divider = index > 0 && rows.value[index - 1].script !== row.script
            ? <div key="script-divider" class="kana-script-divider" aria-hidden="true" />
            : null
          const rowNode = (
            <div key={row.id} class={['kana-row', row.script]}>
              <span class="row-label kana-display">{row.label}</span>
              <div class="row-kana">
                {row.items.map((pill) => (
                  <button
                    key={pill.kana}
                    type="button"
                    class={['kana-pill', 'kana-display', pill.status, { selected: pill.kana === selectedKana.value }]}
                    aria-pressed={pill.kana === selectedKana.value}
                    onClick={() => { selectedKana.value = pill.kana }}
                  >
                    {pill.kana}
                  </button>
                ))}
              </div>
            </div>
          )

          return divider ? [divider, rowNode] : [rowNode]
        })}
      </div>
      {selectedMetrics.value && (
        <aside class={['kana-metrics', selectedMetrics.value.status]}>
          <div class="kana-metrics-head">
            <strong class="kana-display">{selectedMetrics.value.kana}</strong>
            <span>{statusLabel(selectedMetrics.value.status)}</span>
          </div>
          <div class="kana-metric-grid">
            <Metric label="Recent speed" value={`${selectedMetrics.value.recentKpm} kpm`} />
            <Metric label="Best speed" value={`${selectedMetrics.value.bestKpm} kpm`} />
            <Metric label="Accuracy" value={`${selectedMetrics.value.accuracyPercent}%`} />
            <Metric
              label="Appearances"
              value={`${selectedMetrics.value.appearances}/${selectedMetrics.value.requiredAppearances}`}
            />
          </div>
          <p class={['kana-trend', selectedMetrics.value.trend]}>
            {selectedMetrics.value.trendLabel}
          </p>
          {selectedMetrics.value.chart.length > 0 ? (
            <div class="kana-chart" aria-label={`Recent speed for ${selectedMetrics.value.kana}`}>
              {selectedMetrics.value.chart.map((point) => (
                <span
                  key={point.label}
                  class="kana-chart-bar"
                  title={`${point.label}: ${Math.round(point.kpm)} kpm, ${Math.round(point.accuracy * 100)}%`}
                  style={{ height: `${Math.max(8, Math.round((point.kpm / chartMax.value) * 100))}%` }}
                />
              ))}
            </div>
          ) : (
            <p class="empty small">No attempts for this kana yet.</p>
          )}
        </aside>
      )}
    </section>
  )
})

type MetricProps = {
  label: string
  value: string
}

const Metric = defineComponent<MetricProps>((props) => {
  return () => (
    <span class="kana-metric">
      <small>{props.label}</small>
      <b>{props.value}</b>
    </span>
  )
}, {
  props: ['label', 'value'],
})

function statusLabel(status: string): string {
  if (status === 'locked') return 'Locked'
  if (status === 'current') return 'Current target'
  if (status === 'passed') return 'Passed'
  if (status === 'weak') return 'Needs work'
  return 'Unlocked'
}
