import { validateScore } from './score.ts'
import type { Score, ScoreNote } from './score.ts'

export type MeasureFragment = { measure: number; part: number; parts: number; meter: { beats: number; unit: number }; used: number; expected: number; notes: { index: number; note: ScoreNote }[] }
export function layoutScore(score: Score, perFragment = 8): MeasureFragment[] {
  validateScore(score)
  if (!Number.isInteger(perFragment) || perFragment < 1 || perFragment > 16) throw new Error('每段音符数须为 1–16')
  const grouped = score.meters.map(() => [] as { index: number; note: ScoreNote }[])
  score.notes.forEach((note, index) => grouped[note.measure].push({ index, note }))
  return grouped.flatMap((notes, measure) => {
    const used = notes.reduce((sum, item) => sum + item.note.ticks, 0)
    const meter = score.meters[measure]
    const parts = Math.max(1, Math.ceil(notes.length / perFragment))
    return Array.from({ length: parts }, (_, part) => ({ measure, part, parts, meter, used, expected: meter.beats * 3840 / meter.unit, notes: notes.slice(part * perFragment, (part + 1) * perFragment) }))
  })
}
export function durationLabel(ticks: number): string {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('时值无效')
  let a = ticks, b = 960
  while (b) { const next = a % b; a = b; b = next }
  return `${ticks / a}${960 / a === 1 ? '' : `/${960 / a}`}拍`
}
