import { computed, defineComponent, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'

import { buildKanaMetrics } from '../../session/practiceViewModels'
import type { KanaMetricPoint } from '../../session/practiceViewModels'
import { usePracticeStore } from '../../stores/practiceStore'
import { groupKanaRows } from './kanaRows'
import './KanaMap.css'

export const KanaMap = defineComponent(() => {
  const store = usePracticeStore()
  const { kanaPills, progress, settings } = storeToRefs(store)
  const selectedKana = shallowRef<string | null>(null)
  const panel = shallowRef<HTMLElement | null>(null)
  const popupPosition = shallowRef({ left: 12, top: 12 })
  const rows = computed(() => groupKanaRows(kanaPills.value))
  const selectedMetrics = computed(() => {
    if (!selectedKana.value) return null
    return buildKanaMetrics(progress.value, settings.value, selectedKana.value)
  })
  const targetKpm = computed(() => settings.value.targetKpm)

  function selectKana(kana: string, event: MouseEvent) {
    selectedKana.value = kana
    const panelRect = panel.value?.getBoundingClientRect()
    const targetRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    if (!panelRect) return

    popupPosition.value = {
      left: Math.max(8, targetRect.left - panelRect.left),
      top: Math.max(8, targetRect.bottom - panelRect.top + 8),
    }
  }

  return () => (
    <section ref={panel} class="panel progress-panel">
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
                    onClick={(event) => selectKana(pill.kana, event)}
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
        <aside
          class={['kana-metrics-popup', selectedMetrics.value.state, selectedMetrics.value.confidence]}
          style={{ left: `${popupPosition.value.left}px`, top: `${popupPosition.value.top}px` }}
        >
          <div class="kana-metrics-head">
            <strong class="kana-display">{selectedMetrics.value.kana}</strong>
            <span>{statusLabel(selectedMetrics.value.state)}</span>
          </div>
          <button
            type="button"
            class="kana-popup-close"
            aria-label="Close kana metrics"
            onClick={() => { selectedKana.value = null }}
          >
            ×
          </button>
          <div class="kana-speed-line">
            <span>
              Last: <b>{formatKpm(selectedMetrics.value.recentKpm)}</b>
              <small> ({selectedMetrics.value.accuracyPercent}%)</small>
            </span>
            <span>Best: <b>{formatKpm(selectedMetrics.value.bestKpm)}</b></span>
            <span>Trend: <b>{selectedMetrics.value.trendLabel}</b></span>
          </div>
          <p class="kana-state-sentence">{selectedMetrics.value.stateSentence}</p>
          <div class="kana-metric-grid">
            <Metric label="Attempts" value={String(selectedMetrics.value.recentAttempts)} />
            <Metric label="Accuracy" value={`${selectedMetrics.value.accuracyPercent}%`} />
            <Metric label="Avg reaction" value={formatReaction(selectedMetrics.value.averageReactionMs)} />
            <Metric
              label="Total seen"
              value={`${selectedMetrics.value.appearances}/${selectedMetrics.value.requiredAppearances}`}
            />
          </div>
          {selectedMetrics.value.chart.length > 0 ? (
            <KanaSpeedChart
              points={selectedMetrics.value.chart}
              targetKpm={targetKpm.value}
              label={`Recent speed for ${selectedMetrics.value.kana}`}
            />
          ) : (
            <p class="empty small">Not enough data to chart yet.</p>
          )}
          <p class="kana-mistakes">
            Mistakes: {formatMistakes(selectedMetrics.value.commonMistakes)}
          </p>
        </aside>
      )}
    </section>
  )
})

type KanaSpeedChartProps = {
  points: KanaMetricPoint[]
  targetKpm: number
  label: string
}

const KanaSpeedChart = defineComponent<KanaSpeedChartProps>((props) => {
  return () => {
    const width = 330
    const height = 120
    const padding = { top: 10, right: 12, bottom: 22, left: 34 }
    const minAttempt = Math.min(...props.points.map((point) => point.attempt))
    const maxAttempt = Math.max(...props.points.map((point) => point.attempt))
    const maxKpm = Math.max(props.targetKpm, ...props.points.map((point) => point.kpm), 1)
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const xFor = (attempt: number) => padding.left + (
      maxAttempt === minAttempt ? plotWidth : ((attempt - minAttempt) / (maxAttempt - minAttempt)) * plotWidth
    )
    const yFor = (kpm: number) => padding.top + plotHeight - ((kpm / maxKpm) * plotHeight)
    const line = props.points.map((point) => `${xFor(point.attempt)},${yFor(point.kpm)}`).join(' ')
    const targetY = yFor(props.targetKpm)

    return (
      <svg class="kana-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={props.label}>
        <line class="kana-chart-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight} />
        <line class="kana-chart-axis" x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight} />
        <line class="kana-chart-target" x1={padding.left} y1={targetY} x2={padding.left + plotWidth} y2={targetY} />
        <polyline class="kana-chart-line" points={line} />
        {props.points.map((point) => (
          <circle
            key={point.attempt}
            class="kana-chart-dot"
            cx={xFor(point.attempt)}
            cy={yFor(point.kpm)}
            r="3"
          >
            <title>
              {`Attempt ${point.attempt}: ${point.kpm.toFixed(1)} kpm, ${Math.round(point.accuracy * 100)}%`}
            </title>
          </circle>
        ))}
        <text class="kana-chart-label" x={padding.left} y={height - 5}>{minAttempt}</text>
        <text class="kana-chart-label" x={padding.left + plotWidth} y={height - 5} text-anchor="end">{maxAttempt}</text>
        <text class="kana-chart-label" x="2" y={targetY + 4}>{Math.round(props.targetKpm)}</text>
      </svg>
    )
  }
}, {
  props: ['points', 'targetKpm', 'label'],
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
  if (status === 'introduced') return 'Introduced'
  if (status === 'learning') return 'Learning'
  if (status === 'weak') return 'Weak'
  if (status === 'mastered') return 'Mastered'
  if (status === 'rusty') return 'Rusty'
  return 'Unlocked'
}

function formatKpm(value: number | null): string {
  return value === null ? 'not enough data' : `${value.toFixed(1)} kpm`
}

function formatReaction(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value)}ms`
}

function formatMistakes(mistakes: Array<{ kana: string, count: number }>): string {
  if (mistakes.length === 0) return 'none'
  return mistakes.map((mistake) => `${mistake.kana} ×${mistake.count}`).join(', ')
}
