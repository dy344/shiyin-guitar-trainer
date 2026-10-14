import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exampleScore } from '../src/score.ts'
import { editNote, measureTotals, emptyEditHistory, rememberEdit, travelEdit } from '../src/editor.ts'

test('inserting notes and rests retains measure and never mutates original', () => {
  const score = exampleScore()
  const added = editNote(score, 0, 'insert')
  assert.equal(score.notes.length, 15)
  assert.equal(added.score.notes.length, 16)
  assert.equal(added.cursor, 1)
  assert.equal(added.score.notes[1].midi, 64)
  assert.equal(measureTotals(added.score)[0].used, 4800)
  const rest = editNote(added.score, 1, 'rest')
  assert.deepEqual(rest.score.notes[2], { midi: null, ticks: 960, measure: 0, string: null, fret: null })
})
test('duration editing validates boundaries and preserves other notes', () => {
  const score = exampleScore()
  assert.equal(editNote(score, 14, 'duration', 480).score.notes[14].ticks, 480)
  assert.equal(score.notes[14].ticks, 1920)
  for (const value of [0, -1, 0.5, NaN, Infinity, 122881]) assert.throws(() => editNote(score, 0, 'duration', value))
  for (const cursor of [-1, 15, 0.5, NaN]) assert.throws(() => editNote(score, cursor, 'delete'))
  assert.throws(() => editNote({ ...score, notes: [] }, 0, 'insert'))
})
test('deleting last note clamps selection and deleting empty measure renumbers notes', () => {
  const score = exampleScore()
  assert.equal(editNote(score, 14, 'delete').cursor, 13)
  let shortened = score
  for (let i = 0; i < 4; i++) shortened = editNote(shortened, 0, 'delete').score
  assert.equal(shortened.meters.length, 3)
  assert.equal(shortened.notes[0].measure, 0)
  assert.equal(shortened.notes.at(-1)?.measure, 2)
  const single = { ...score, meters: [score.meters[0]], notes: [score.notes[0]] }
  assert.throws(() => editNote(single, 0, 'delete'))
})
test('insert limit is enforced', () => {
  const score = exampleScore()
  const full = { ...score, notes: Array.from({ length: 2000 }, () => ({ ...score.notes[0] })) }
  assert.throws(() => editNote(full, 0, 'insert'))
  assert.throws(() => editNote(full, 0, 'rest'))
})
test('undo redo roundtrip, branching and 50 snapshot cap', () => {
  const original = { score: exampleScore(), cursor: 0 }
  const edited = editNote(original.score, 0, 'rest')
  const history = rememberEdit(emptyEditHistory(), original)
  const undo = travelEdit(history, edited, 'undo')!
  assert.deepEqual(undo.next, original)
  const redo = travelEdit(undo.history, original, 'redo')!
  assert.deepEqual(redo.next, edited)
  assert.equal(rememberEdit(undo.history, original).future.length, 0)
  assert.equal(travelEdit(emptyEditHistory(), original, 'undo'), null)
  let many = history
  for (let i = 0; i < 80; i++) many = rememberEdit(many, original)
  assert.equal(many.past.length, 50)
})
