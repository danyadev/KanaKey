import { computed, defineComponent, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'

import { useTypingFocus } from '../../composables/useTypingFocus'
import { getCurrentWordRemainder } from '../../model/inputSurface'
import type { SurfaceUnitView } from '../../model/inputSurface'
import { getLastRomaji, HIRAGANA_RE, isLatin, KATAKANA_RE, romajiToKana } from '../../model/kana'
import { usePracticeStore } from '../../stores/practiceStore'
import './PracticePanel.css'

export const PracticePanel = defineComponent(() => {
  const store = usePracticeStore()
  const { focusTypingBox, typingBox } = useTypingFocus()
  const {
    accuracyPercent,
    lastEvaluation,
    outcomeMessage,
    passMeter,
    settings,
    summary,
    surfaceWords,
    warningMessages,
  } = storeToRefs(store)
  const composingText = shallowRef('')
  const composingKana = computed(() => romajiToKana(composingText.value))
  const isComposing = shallowRef(false)
  const ignoredNativeText = shallowRef<string | null>(null)

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Backspace') {
      const lastRomaji = getLastRomaji(composingText.value)
      composingText.value = composingText.value.slice(0, lastRomaji ? -lastRomaji.length : -1)
      event.preventDefault()
      return
    }

    if (event.key === 'Enter' && !event.isComposing) {
      submitComposedText(composingKana.value)
      event.preventDefault()
      return
    }

    if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
      return
    }

    if (!isLatin(event.key.toLowerCase()) && !HIRAGANA_RE.test(event.key) && !KATAKANA_RE.test(event.key)) {
      return
    }

    event.preventDefault()
    composingText.value += event.key

    // IME doesn't automatically replace 'n' at the end while composing,
    // but we still want to automatically submit words like さん
    const rawKanaText = composingKana.value
    const kanaText = rawKanaText.at(-1)!.toLowerCase() === 'n'
      ? rawKanaText.slice(0, -1) + 'ん'
      : rawKanaText
    const remainder = getCurrentWordRemainder(surfaceWords.value)

    commitVisibleKana(kanaText, rawKanaText, remainder)
  }

  const onCompositionStart = () => {
    isComposing.value = true
  }

  const onCompositionUpdate = (event: CompositionEvent) => {
    if (event.data.length === 1) commitNativeText(event.data)
  }

  const onCompositionEnd = (event: CompositionEvent) => {
    isComposing.value = false
    commitNativeText(event.data || composingKana.value)
  }

  const onInput = (event: Event) => {
    commitNativeText((event.target as HTMLInputElement).value)
  }

  const submitComposedText = (kanaText: string) => {
    const input = typingBox.value
    if (!input || kanaText.length === 0) return

    store.commitInput(kanaText)
    composingText.value = ''
    input.value = ''
    focusTypingBox()
  }

  const commitNativeText = (text: string) => {
    const kanaText = text.trim()
    const input = typingBox.value
    if (!kanaText) return

    if (ignoredNativeText.value === kanaText) {
      ignoredNativeText.value = null
      if (input) input.value = ''
      return
    }

    const handled = commitVisibleKana(kanaText, kanaText, getCurrentWordRemainder(surfaceWords.value))
    if (!handled) return

    if (input) input.value = ''
    ignoredNativeText.value = kanaText
    window.setTimeout(() => {
      if (ignoredNativeText.value === kanaText) ignoredNativeText.value = null
    }, 250)
  }

  const commitVisibleKana = (kanaText: string, rawKanaText: string, remainder: string): boolean => {
    let handled = false

    for (let index = 0; index < kanaText.length; index++) {
      const char = kanaText[index]
      if (isLatin(char.toLowerCase())) break

      if (char === remainder[index]) {
        submitComposedText(char)
        handled = true
        continue
      }

      // skip marking artificial ん as an incorrect answer
      if (kanaText !== rawKanaText) break

      store.markInputMistake(char)
      handled = true
      break
    }

    return handled
  }

  const focusInput = () => {
    focusTypingBox()
  }

  const renderImeInput = () => (
    <input
      ref={typingBox}
      type="text"
      class={['hidden-ime-input', { composing: isComposing.value }]}
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      onKeydown={onKeydown}
      onInput={onInput}
      onCompositionstart={onCompositionStart}
      onCompositionupdate={onCompositionUpdate}
      onCompositionend={onCompositionEnd}
    />
  )

  const renderKanaUnit = (unit: SurfaceUnitView) => (
    <span key={unit.globalIndex} class={['surface-kana', unit.status, { wrong: unit.wrong }]}>
      {unit.status === 'current' && composingKana.value && (
        <span class="composition-bubble">{composingKana.value}</span>
      )}
      {unit.kana}
      {unit.status === 'current' && renderImeInput()}
    </span>
  )

  return () => (
    <article class="practice panel">
      <p class="eyebrow">Practice line</p>

      <div class="pass-card">
        <div class="pass-card-head">
          <span class="eyebrow">Current kana meter</span>
          <strong class="kana-display">{summary.value.current}</strong>
        </div>
        <MeterRow
          label="KPM"
          width={passMeter.value.kpmPercent}
          value={`${passMeter.value.kpm} / ${settings.value.targetKpm}`}
        />
        <MeterRow
          label="Accuracy"
          width={passMeter.value.accuracyPercent}
          value={`${passMeter.value.accuracy}% / ${accuracyPercent.value}%`}
        />
      </div>

      <div class="typing-surface kana-display" aria-label="Current practice words" onClick={focusInput}>
        {surfaceWords.value.length === 0 && <span class="target-empty">No eligible real words yet</span>}

        {surfaceWords.value.map((word, index) => (
          <span key={`${word.word}-${word.index}`} class="surface-word">
            {word.units.map(renderKanaUnit)}
            {settings.value.showWordSeparator && (index < surfaceWords.value.length - 1) && (
              <span class="visual-separator">·</span>
            )}
          </span>
        ))}
      </div>

      {warningMessages.value.map((message) => (
        <p key={message} class="warning">{message}</p>
      ))}

      {lastEvaluation.value && (
        <div class="result-strip">
          <span>Speed <strong>{Math.round(lastEvaluation.value.kpm)}</strong> kana/min</span>
          <span>Accuracy <strong>{Math.round(lastEvaluation.value.accuracy * 100)}</strong>%</span>
          <span>
            Correct <strong>{lastEvaluation.value.correctKanaCount}/{lastEvaluation.value.totalExpectedKana}</strong>
          </span>
        </div>
      )}
      {outcomeMessage.value && <p class="outcome">{outcomeMessage.value}</p>}
    </article>
  )
})

type MeterRowProps = {
  label: string
  width: number
  value: string
}

const MeterRow = defineComponent<MeterRowProps>((props) => {
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
