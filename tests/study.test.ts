import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studySections } from '../src/study.ts'
import { exampleScore, withPitch } from '../src/score.ts'
import type { ScoreNote } from '../src/score.ts'

const rest = (measure: number): ScoreNote => ({ midi: null, ticks: 960, measure, string: null, fret: null })
test('practice suggestions prioritize high fret, switching and short notes with valid note ranges', () => {
  const score = exampleScore()
  score.notes = [withPitch(rest(0), 64), withPitch(rest(0), 65), { ...withPitch(rest(1), 52), ticks: 480, string: 6, fret: 12 }, { ...withPitch(rest(1), 64), ticks: 480, string: 2, fret: 5 }, { ...withPitch(rest(1), 64), ticks: 480, string: 1, fret: 0 }]
  score.meters = [{ beats: 4, unit: 4 }, { beats: 4, unit: 4 }]
  const sections = studySections(score)
  assert.equal(sections[0].measure, 1)
  assert.equal(sections[0].start, 2)
  assert.equal(sections[0].end, 4)
  assert.equal(sections[0].bpm, 52)
  assert.ok(sections[0].reasons.some(reason => reason.includes('12')))
  assert.ok(sections[0].reasons.some(reason => reason.includes('换弦')))
})
test('ranges include rests, all-rest measures are skipped, and at most 3 bars are suggested', () => {
  const score = exampleScore()
  score.meters = Array.from({ length: 5 }, () => ({ beats: 4, unit: 4 }))
  score.notes = score.meters.flatMap((_, measure) => [rest(measure), measure === 0 ? rest(measure) : withPitch(rest(measure), 64), rest(measure)])
  const sections = studySections(score)
  assert.equal(sections.length, 3)
  assert.deepEqual(sections.map(section => section.measure), [1, 2, 3])
  assert.equal(sections[0].start, 3)
  assert.equal(sections[0].end, 5)
  assert.ok(sections[0].reasons[0].includes('熟悉'))
  score.notes = score.notes.map(note => rest(note.measure))
  assert.deepEqual(studySections(score), [])
})
test('suggested BPM is bounded and invalid scores fail without a partial suggestion', () => {
  const score = exampleScore()
  score.tempo = 30
  assert.equal(studySections(score)[0].bpm, 30)
  score.tempo = 200
  assert.equal(studySections(score)[0].bpm, 80)
  assert.throws(() => studySections({ ...score, notes: [] }))
  assert.throws(() => studySections({ ...score, notes: [{ ...score.notes[0], measure: 100 }] }))
})
