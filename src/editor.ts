import { validateScore, withPitch } from './score.ts'
import type { Score } from './score.ts'

export type EditSnapshot = { score: Score; cursor: number }
export type EditHistory = { past: EditSnapshot[]; future: EditSnapshot[] }
export const emptyEditHistory = (): EditHistory => ({ past: [], future: [] })
export function rememberEdit(history: EditHistory, current: EditSnapshot): EditHistory {
  return { past: [...history.past, current].slice(-50), future: [] }
}
export function travelEdit(history: EditHistory, current: EditSnapshot, direction: 'undo' | 'redo') {
  const source = direction === 'undo' ? history.past : history.future
  if (!source.length) return null
  const next = source[source.length - 1]
  const updated = direction === 'undo'
    ? { past: source.slice(0, -1), future: [...history.future, current].slice(-50) }
    : { past: [...history.past, current].slice(-50), future: source.slice(0, -1) }
  return { next, history: updated }
}
export function editNote(score: Score, cursor: number, action: 'insert' | 'rest' | 'delete' | 'duration', ticks = 960): EditSnapshot {
  validateScore(score)
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= score.notes.length) throw new Error('请选择有效音符')
  const selected = score.notes[cursor]
  let notes = score.notes.slice()
  let meters = score.meters
  let nextCursor = cursor
  if (action === 'delete') {
    if (notes.length === 1) throw new Error('至少保留一个音符或休止符')
    notes.splice(cursor, 1)
    if (!notes.some(note => note.measure === selected.measure)) {
      meters = meters.filter((_, index) => index !== selected.measure)
      notes = notes.map(note => note.measure > selected.measure ? { ...note, measure: note.measure - 1 } : note)
    }
    nextCursor = Math.min(cursor, notes.length - 1)
  } else if (action === 'duration') {
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > 122880) throw new Error('时值须为 1–122880 ticks')
    notes[cursor] = { ...selected, ticks }
  } else if (action === 'insert' || action === 'rest') {
    if (notes.length >= 2000) throw new Error('最多支持 2000 个音符及休止符')
    const added = withPitch({ ...selected, ticks: 960 }, action === 'rest' ? null : selected.midi ?? 64)
    notes.splice(cursor + 1, 0, added)
    nextCursor = cursor + 1
  } else throw new Error('不支持此编辑操作')
  return { score: validateScore({ ...score, notes, meters }), cursor: nextCursor }
}
export function measureTotals(score: Score) {
  const totals = score.meters.map(meter => ({ used: 0, expected: meter.beats * 3840 / meter.unit }))
  for (const note of score.notes) totals[note.measure].used += note.ticks
  return totals
}
