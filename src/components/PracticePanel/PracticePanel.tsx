import { defineComponent } from 'vue'
import type { Ref } from 'vue'

import type { BatchEvaluation } from '../../types'
import './PracticePanel.css'

export type PracticeTargetWord = {
  id: string
  kana: string
  synthetic?: boolean
}

export type PassMeter = {
  kpm: number
  accuracy: number
  attempts: number
  kpmPercent: number
  accuracyPercent: number
  attemptsPercent: number
}

type PracticePanelProps = {
  targetWords: PracticeTargetWord[]
  warning: string | null
  typedText: string
  canSubmit: boolean
  typingBox: Ref<HTMLTextAreaElement | null>
  currentKana: string
  targetKpm: number
  targetAccuracyPercent: number
  minAttemptsPerKana: number
  passMeter: PassMeter
  lastEvaluation: BatchEvaluation | null
  outcomeMessage: string | null
}

type PracticePanelEmits = {
  newBatch: () => void
  submit: () => void
  clear: () => void
  'update:typedText': (value: string) => void
}

export const PracticePanel = defineComponent<PracticePanelProps, PracticePanelEmits>((props, ctx) => {
  return () => {
    const hasSyntheticWords = props.targetWords.some((word) => word.synthetic)

    return (
      <article class="practice panel">
      <div class="practice-topline">
        <div>
          <p class="eyebrow">Practice line</p>
          <p class="practice-note">Use your Japanese IME. Type the kana line exactly, then press Ctrl/⌘+Enter.</p>
        </div>
        <button type="button" class="ghost" onClick={() => ctx.emit('newBatch')}>New batch</button>
      </div>

      <div class="target-line kana-display" aria-label="Current practice words">
        {props.targetWords.map((word) => (
          <span key={word.id} class={['target-word', { synthetic: word.synthetic }]}>{word.kana}</span>
        ))}
        {props.targetWords.length === 0 && <span class="target-empty">No unlocked words yet</span>}
      </div>

      {hasSyntheticWords && <p class="synthetic-note">Blue chunks are generated for kana coverage.</p>}

      {props.warning && <p class="warning">{props.warning}</p>}

      <textarea
        ref={props.typingBox}
        value={props.typedText}
        class="typing-box kana-display"
        spellcheck={false}
        autocomplete="off"
        placeholder="Type here: あい　あお　うえ"
        onInput={(event) => ctx.emit('update:typedText', (event.target as HTMLTextAreaElement).value)}
        onKeydown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            ctx.emit('clear')
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            ctx.emit('submit')
          }
        }}
      />

      <div class="actions">
        <button type="button" class="primary" disabled={!props.canSubmit} onClick={() => ctx.emit('submit')}>Submit batch</button>
        <button type="button" class="ghost" disabled={props.typedText.length === 0} onClick={() => ctx.emit('clear')}>Clear</button>
        <p class="hint">Escape clears input. Spaces and Japanese spaces compare the same.</p>
      </div>

      <div class="pass-card">
        <div class="pass-card-head">
          <span class="eyebrow">Current kana meter</span>
          <strong class="kana-display">{props.currentKana}</strong>
        </div>
        <MeterRow label="KPM" width={props.passMeter.kpmPercent} value={`${props.passMeter.kpm}/${props.targetKpm}`} />
        <MeterRow label="Accuracy" width={props.passMeter.accuracyPercent} value={`${props.passMeter.accuracy}%/${props.targetAccuracyPercent}%`} />
        <MeterRow label="Attempts" width={props.passMeter.attemptsPercent} value={`${props.passMeter.attempts}/${props.minAttemptsPerKana}`} />
      </div>

      {props.lastEvaluation && (
        <div class="result-strip">
          <span>Speed <strong>{Math.round(props.lastEvaluation.kpm)}</strong> kana/min</span>
          <span>Accuracy <strong>{Math.round(props.lastEvaluation.accuracy * 100)}</strong>%</span>
          <span>Correct <strong>{props.lastEvaluation.correctKanaCount}/{props.lastEvaluation.totalExpectedKana}</strong></span>
        </div>
      )}

      {props.outcomeMessage && <p class="outcome">{props.outcomeMessage}</p>}
      </article>
    )
  }
}, {
  props: [
    'targetWords',
    'warning',
    'typedText',
    'canSubmit',
    'typingBox',
    'currentKana',
    'targetKpm',
    'targetAccuracyPercent',
    'minAttemptsPerKana',
    'passMeter',
    'lastEvaluation',
    'outcomeMessage',
  ],
  emits: ['newBatch', 'submit', 'clear', 'update:typedText'],
})

type MeterRowProps = {
  label: string
  width: number
  value: string
}

const MeterRow = defineComponent<MeterRowProps>((props, _ctx) => {
  return () => (
    <div class="meter-row">
      <span>{props.label}</span>
      <div class="meter"><i style={{ width: `${props.width}%` }} /></div>
      <b>{props.value}</b>
    </div>
  )
}, {
  props: ['label', 'width', 'value'],
})
