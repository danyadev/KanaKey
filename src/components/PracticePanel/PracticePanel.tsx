import { defineComponent } from 'vue'
import type { Ref } from 'vue'

import { getCurrentWordRemainder, shouldHandlePracticeShortcut } from '../../inputSurface'
import type { SurfaceWordView } from '../../inputSurface'
import type { BatchEvaluation } from '../../types'
import './PracticePanel.css'

export type PassMeter = {
  kpm: number
  accuracy: number
  kpmPercent: number
  accuracyPercent: number
}

type PracticePanelProps = {
  surfaceWords: SurfaceWordView[]
  showWordSeparator: boolean
  warning: string | null
  typingBox: Ref<HTMLTextAreaElement | null>
  currentKana: string
  compositionText: string
  isComposing: boolean
  targetKpm: number
  targetAccuracyPercent: number
  passMeter: PassMeter
  lastEvaluation: BatchEvaluation | null
  outcomeMessage: string | null
}

type PracticePanelEmits = {
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

  function handleCompositionUpdate(event: CompositionEvent) {
    const input = event.target as HTMLTextAreaElement
    const compositionText = event.data || input.value
    const remainder = getCurrentWordRemainder(props.surfaceWords)

    if (compositionText && compositionText === remainder) {
      ctx.emit('compositionEnd', compositionText)
      input.value = ''
      return
    }

    ctx.emit('compositionUpdate', compositionText)
  }

  function renderImeInput() {
    return (
      <textarea
        ref={props.typingBox}
        value=""
        class={['hidden-ime-input', { composing: props.isComposing }]}
        spellcheck={false}
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        onInput={consumeInput}
        onCompositionstart={() => ctx.emit('compositionStart')}
        onCompositionupdate={handleCompositionUpdate}
        onCompositionend={(event) => {
          const input = event.target as HTMLTextAreaElement
          const committed = event.data || input.value
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
    )
  }

  return () => (
    <article class="practice panel">
      <div class="practice-topline">
        <p class="eyebrow">Practice line</p>
      </div>

      <div class="pass-card">
        <div class="pass-card-head">
          <span class="eyebrow">Current kana meter</span>
          <strong class="kana-display">{props.currentKana}</strong>
        </div>
        <MeterRow label="KPM" width={props.passMeter.kpmPercent} value={`${props.passMeter.kpm} / ${props.targetKpm}`} />
        <MeterRow label="Accuracy" width={props.passMeter.accuracyPercent} value={`${props.passMeter.accuracy}% / ${props.targetAccuracyPercent}%`} />
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
                {unit.status === 'current' && renderImeInput()}
              </span>
            ))}
            {props.showWordSeparator && wordIndex < props.surfaceWords.length - 1 && (
              <span class="visual-separator" aria-hidden="true">·</span>
            )}
          </span>
        ))}
        {props.surfaceWords.length === 0 && <span class="target-empty">No eligible real words yet</span>}
      </div>

      {props.warning && <p class="warning">{props.warning}</p>}
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
    'showWordSeparator',
    'warning',
    'typingBox',
    'currentKana',
    'compositionText',
    'isComposing',
    'targetKpm',
    'targetAccuracyPercent',
    'passMeter',
    'lastEvaluation',
    'outcomeMessage',
  ],
  emits: ['submit', 'clear', 'commitInput', 'compositionStart', 'compositionUpdate', 'compositionEnd'],
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
