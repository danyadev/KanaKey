# KanaKey Development Guide

## Product

KanaKey is a compact Japanese kana typing trainer inspired by keybr.

It teaches kana through real kana words. The app unlocks kana gradually, generates real word batches
around the current target kana, measures typing stability, and returns to weak kana when needed.

## Progression

Kana unlock order is custom, not alphabetical/gojūon order.

The progression line should be designed around word availability:
each unlock step should allow enough real-word practice for the default batch size.

Hiragana and katakana characters are separate units, so あ and ア have separate stats.
Mixed mode practices both scripts and updates the same shared per-kana stats depending on which characters appear in the batch.

## Batch Generation

A generated practice word must satisfy both rules:
1. it contains the current target kana
2. it uses only unlocked kana

Default batch size should be coverable with unique real words.

If the user sets a batch size larger than the available unique eligible words, duplicate eligible words and shuffle the batch.

## Practice Flow

choose current target kana
→ generate eligible real-word batch
→ user types with Japanese IME
→ evaluate speed and accuracy
→ update target kana stats
→ choose next weak/unpassed kana
→ unlock next kana when current unlocked set is stable

## Passing Metrics

A kana passes when its smoothed recent stats meet all configured goals:
- smoothed kpm >= speed goal
- smoothed accuracy >= accuracy goal
- appearances >= required appearance count

Smoothing window is the latest 20 appearances of this kana by default.
Though the window is not bound to this number, as it should consume attempts until it reaches this limit,
which can possibly result in smaller or larger window, depending on available attempts and appearance counts in them.

Store historical per-kana metrics so the app can show speed and accuracy graphs over attempts:
- appearance count: how many times this kana appeared in an attempt
- correct count: how many of those appearances were typed correctly
- allocated time: precise time spent on this kana in an attempt
- attempt number: so metrics can be synchronized between kanas

## Practice Time

Track:
- time spent today
- time spent overall
- daily practice time goal

Goals should be editable.

## UI Direction

The UI should feel like a compact daily training tool.

Style direction: minimal, card-based, warm but subtle, keyboard-focused.

## Architecture

Component style:
```tsx
export const ComponentName = defineComponent<Props>((props) => {
  return () => (
    <div>{props.msg}</div>
  )
}, { props: ['msg'] })
```

Pinia is allowed if it makes settings, progress, sessions, or time tracking cleaner.

Trainer logic should stay pure and testable even if state moves to Pinia.

## Persistence

Persist in localStorage:
- settings
- progress
- session history
- practice time
- first-run hint dismissal

Stored data should be normalized on load.

## Input Behavior

User types kana with Japanese IME.

Expected behavior:
- Enter submits
- Escape clears input
- empty input cannot submit
- focus on input on page load
– input-related clicks keep focus on input

## Testing

Tests should protect the learning loop and runtime-critical UI behavior.
Prefer precise behavior tests over broad snapshots.
