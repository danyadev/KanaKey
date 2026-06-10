export type KanaPill = {
  kana: string
  status: string
  script: KanaScript
}

export type KanaRow = {
  id: string
  label: string
  script: KanaScript
  items: KanaPill[]
}

type KanaScript = 'hiragana' | 'katakana'

type KanaRowDefinition = {
  label: string
  kana: string[]
}

const HIRAGANA_ROWS = [
  { label: 'あ', kana: ['あ', 'い', 'う', 'え', 'お'] },
  { label: 'か', kana: ['か', 'き', 'く', 'け', 'こ'] },
  { label: 'さ', kana: ['さ', 'し', 'す', 'せ', 'そ'] },
  { label: 'た', kana: ['た', 'ち', 'つ', 'て', 'と'] },
  { label: 'な', kana: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { label: 'は', kana: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { label: 'ま', kana: ['ま', 'み', 'む', 'め', 'も'] },
  { label: 'や', kana: ['や', 'ゆ', 'よ'] },
  { label: 'ら', kana: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { label: 'わ', kana: ['わ', 'を', 'ん'] },
  { label: 'が', kana: ['が', 'ぎ', 'ぐ', 'げ', 'ご'] },
  { label: 'ざ', kana: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'] },
  { label: 'だ', kana: ['だ', 'ぢ', 'づ', 'で', 'ど'] },
  { label: 'ば', kana: ['ば', 'び', 'ぶ', 'べ', 'ぼ'] },
  { label: 'ぱ', kana: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'] },
  { label: '小', kana: ['ゃ', 'ゅ', 'ょ', 'っ'] },
]

const KATAKANA_ROWS = [
  { label: 'ア', kana: ['ア', 'イ', 'ウ', 'エ', 'オ'] },
  { label: 'カ', kana: ['カ', 'キ', 'ク', 'ケ', 'コ'] },
  { label: 'サ', kana: ['サ', 'シ', 'ス', 'セ', 'ソ'] },
  { label: 'タ', kana: ['タ', 'チ', 'ツ', 'テ', 'ト'] },
  { label: 'ナ', kana: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'] },
  { label: 'ハ', kana: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'] },
  { label: 'マ', kana: ['マ', 'ミ', 'ム', 'メ', 'モ'] },
  { label: 'ヤ', kana: ['ヤ', 'ユ', 'ヨ'] },
  { label: 'ラ', kana: ['ラ', 'リ', 'ル', 'レ', 'ロ'] },
  { label: 'ワ', kana: ['ワ', 'ヲ', 'ン'] },
  { label: 'ガ', kana: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'] },
  { label: 'ザ', kana: ['ザ', 'ジ', 'ズ', 'ゼ', 'ゾ'] },
  { label: 'ダ', kana: ['ダ', 'ヂ', 'ヅ', 'デ', 'ド'] },
  { label: 'バ', kana: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'] },
  { label: 'パ', kana: ['パ', 'ピ', 'プ', 'ペ', 'ポ'] },
  { label: '小', kana: ['ャ', 'ュ', 'ョ', 'ッ', 'ー'] },
]

export function groupKanaRows(pills: KanaPill[]): KanaRow[] {
  const byKana = new Map(pills.map((pill) => [pill.kana, pill]))

  return [
    ...rowsForScript('hiragana', HIRAGANA_ROWS, byKana),
    ...rowsForScript('katakana', KATAKANA_ROWS, byKana),
  ]
}

function rowsForScript(script: KanaScript, rows: KanaRowDefinition[], byKana: Map<string, KanaPill>): KanaRow[] {
  return rows
    .map((row) => ({
      id: `${script}-${row.label}`,
      label: row.label,
      script,
      items: row.kana.map((kana) => byKana.get(kana)).filter((pill): pill is KanaPill => Boolean(pill)),
    }))
    .filter((row) => row.items.length > 0)
}
