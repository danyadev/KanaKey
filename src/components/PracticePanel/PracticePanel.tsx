import { defineComponent } from 'vue'
import type { Ref } from 'vue'

import { shouldHandlePracticeShortcut } from '../../inputSurface'
import type { SurfaceWordView } from '../../inputSurface'
import type { BatchEvaluation } from '../../types'
import './PracticePanel.css'

export type PassMeter = {
  kpm: number
  accuracy: number
  appearances: number
  kpmPercent: number
  accuracyPercent: number
  appearancesPercent: number
}

type PracticePanelProps = {
  surfaceWords: SurfaceWordView[]
  visualSeparator: string
  warning: string | null
  canSubmit: boolean
  typingBox: Ref<HTMLTextAreaElement | null>
  currentKana: string
  compositionText: string
  isComposing: boolean
  targetKpm: number
  targetAccuracyPercent: number
  requiredAppearanceCount: number
  passMeter: PassMeter
  lastEvaluation: BatchEvaluation | null
  outcomeMessage: string | null
}

type PracticePanelEmits = {
  newBatch: () => void
  submit: () => void
  clear: () => void
  commitInput: (value: string) => void
  compositionStart: () => void
  compositionUpdate: (value: string) => void
  compositionEnd: (value: string) => void
}

export const PracticePanel = defineComponent<PracticePanelProps, PracticePanelEmits>((props, ctx) => {
  function focusInput() {
    props.typingBox.value?.focus()
  }

  function consumeInput(event: Event) {
    const input = event.target as HTMLTextAreaElement
    if (!props.isComposing && input.value.length > 0) {
      ctx.emit('commitInput', input.value)
      input.value = ''
    }
  }

  return () => (
    <article class="practice panel">
      <div class="practice-topline">
        <div>
          <p class="eyebrow">Practice line</p>
          <p class="practice-note">Use your Japanese IME. Type the underlined kana; separators are visual only.</p>
        </div>
        <button type="button" class="ghost" onClick={() => ctx.emit('newBatch')}>New batch</button>
      </div>

      <div class="typing-surface kana-display" aria-label="Current practice words" onClick={focusInput}>
        {props.surfaceWords.map((word, wordIndex) => (
          <span key={`${word.word}-${word.index}`} class="surface-word">
            {word.units.map((unit) => (
              <span key={unit.globalIndex} class={['surface-kana', unit.status, { wrong: unit.wrong }]}>
                {unit.status === 'current' && props.isComposing && props.compositionText && (
                  <span class="composition-bubble">{props.compositionText}</span>
                )}
                {unit.kana}
              </span>
            ))}
            {wordIndex < props.surfaceWords.length - 1 && (
              <span class="visual-separator" aria-hidden="true">{props.visualSeparator}</span>
            )}
          </span>
        ))}
        {props.surfaceWords.length === 0 && <span class="target-empty">No eligible real words yet</span>}
      </div>

      {props.warning && <p class="warning">{props.warning}</p>}

      <textarea
        ref={props.typingBox}
        value=""
        class="hidden-ime-input"
        spellcheck={false}
        autocomplete="off"
        autocapitalize="off"
        aria-label="Japanese IME input capture"
        onInput={consumeInput}
        onCompositionstart={() => ctx.emit('compositionStart')}
        onCompositionupdate={(event) => ctx.emit('compositionUpdate', (event as CompositionEvent).data)}
        onCompositionend={(event) => {
          const input = event.target as HTMLTextAreaElement
          const committed = (event as CompositionEvent).data || input.value
          ctx.emit('compositionEnd', committed)
          input.value = ''
        }}
        onKeydown={(event) => {
          if (!shouldHandlePracticeShortcut(event, props.isComposing)) return
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
        <button type="button" class="primary" disabled={!props.canSubmit} onClick={() => ctx.emit('submit')}>Submit completed batch</button>
        <button type="button" class="ghost" disabled={props.surfaceWords.length === 0} onClick={() => ctx.emit('clear')}>Clear attempt</button>
        <p class="hint">Wrong kana are recorded, discarded from progress, and must be corrected before the caret advances.</p>
      </div>

      <div class="pass-card">
        <div class="pass-card-head">
          <span class="eyebrow">Current kana meter</span>
          <strong class="kana-display">{props.currentKana}</strong>
        </div>
        <MeterRow label="KPM" width={props.passMeter.kpmPercent} value={`${props.passMeter.kpm}/${props.targetKpm}`} />
        <MeterRow label="Accuracy" width={props.passMeter.accuracyPercent} value={`${props.passMeter.accuracy}%/${props.targetAccuracyPercent}%`} />
        <MeterRow label="Appearances" width={props.passMeter.appearancesPercent} value={`${props.passMeter.appearances}/${props.requiredAppearanceCount}`} />
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
}, {
  props: [
    'surfaceWords',
    'visualSeparator',
    'warning',
    'canSubmit',
    'typingBox',
    'currentKana',
    'compositionText',
    'isComposing',
    'targetKpm',
    'targetAccuracyPercent',
    'requiredAppearanceCount',
    'passMeter',
    'lastEvaluation',
    'outcomeMessage',
  ],
  emits: ['newBatch', 'submit', 'clear', 'commitInput', 'compositionStart', 'compositionUpdate', 'compositionEnd'],
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
