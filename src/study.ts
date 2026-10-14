import { validateScore } from './score.ts'
import type { Score } from './score.ts'

export type StudySection = { measure: number; start: number; end: number; bpm: number; reasons: string[]; difficulty: number }
export function studySections(score: Score): StudySection[] {
  validateScore(score)
  const grouped = score.meters.map(() => [] as { index: number; midi: number | null; fret: number | null; string: number | null; ticks: number }[])
  score.notes.forEach((note, index) => grouped[note.measure].push({ ...note, index }))
  const sections: StudySection[] = []
  grouped.forEach((notes, measure) => {
    const pitched = notes.filter(note => note.midi !== null)
    if (!pitched.length) return
    const frets = pitched.filter(note => note.fret! > 0).map(note => note.fret!)
    const highest = frets.length ? Math.max(...frets) : 0
    const span = frets.length ? highest - Math.min(...frets) : 0
    let changes = 0
    pitched.forEach((note, index) => { if (index && note.string !== pitched[index - 1].string) changes++ })
    const short = pitched.filter(note => note.ticks < 960).length
    const reasons: string[] = []
    if (span >= 3) reasons.push(`按弦位置跨 ${span} 品`)
    if (changes >= 2) reasons.push(`${changes} 次换弦`)
    if (highest >= 7) reasons.push(`最高到 ${highest} 品`)
    if (short) reasons.push(`${short} 个短于四分音符的音`)
    if (!reasons.length) reasons.push('先熟悉本小节旋律和指法')
    sections.push({ measure, start: notes[0].index, end: notes.at(-1)!.index, bpm: Math.max(30, Math.min(80, Math.round((score.tempo ?? 80) * 0.65))), reasons, difficulty: span + changes * 2 + Math.max(0, highest - 5) + short })
  })
  return sections.sort((a, b) => b.difficulty - a.difficulty || a.measure - b.measure).slice(0, 3)
}
