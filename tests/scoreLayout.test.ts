import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exampleScore } from '../src/score.ts'
import { durationLabel, layoutScore } from '../src/scoreLayout.ts'

test('complete layout contains every source note once with correct bars and totals', () => {
  const score = exampleScore()
  const fragments = layoutScore(score)
  assert.equal(fragments.length, 4)
  assert.deepEqual(fragments.flatMap(fragment => fragment.notes.map(item => item.index)), score.notes.map((_, index) => index))
  assert.ok(fragments.every(fragment => fragment.used === 3840 && fragment.expected === 3840))
  assert.deepEqual(fragments[3].notes.map(item => item.note.ticks), [960, 960, 1920])
})
test('dense measures wrap without changing note order or source measure indices', () => {
  const score = exampleScore()
  const dense = { ...score, meters: [{ beats: 4, unit: 4 }], notes: Array.from({ length: 17 }, () => ({ ...score.notes[0], measure: 0, ticks: 240 })) }
  const fragments = layoutScore(dense)
  assert.deepEqual(fragments.map(fragment => fragment.notes.length), [8, 8, 1])
  assert.deepEqual(fragments.map(fragment => fragment.part), [0, 1, 2])
  assert.ok(fragments.every(fragment => fragment.measure === 0 && fragment.parts === 3 && fragment.used === 4080))
  assert.equal(dense.notes.length, 17)
})
test('empty bars, changing meters and incomplete bars retain explicit totals', () => {
  const score = exampleScore()
  const shaped = { ...score, meters: [{ beats: 3, unit: 4 }, { beats: 6, unit: 8 }], notes: [{ ...score.notes[0], ticks: 480, measure: 1 }] }
  const fragments = layoutScore(shaped)
  assert.equal(fragments[0].notes.length, 0)
  assert.equal(fragments[0].used, 0)
  assert.equal(fragments[1].used, 480)
  assert.equal(fragments[1].expected, 2880)
})
test('fractional and very long duration labels remain exact, invalid inputs fail', () => {
  assert.deepEqual([0, 240, 480, 720, 960, 1440, 320, 1, 245760000].map(durationLabel), ['0拍','1/4拍','1/2拍','3/4拍','1拍','3/2拍','1/3拍','1/960拍','256000拍'])
  for (const ticks of [-1, NaN, 0.5, Infinity]) assert.throws(() => durationLabel(ticks))
  for (const limit of [0, 17, 0.5, NaN]) assert.throws(() => layoutScore(exampleScore(), limit))
  assert.throws(() => layoutScore({ ...exampleScore(), notes: [] }))
})
