import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPractice, pausePractice, stepPractice } from '../src/practice.ts'
import type { PracticeOptions, PracticeState } from '../src/practice.ts'

const options: PracticeOptions = { start: 0, end: 1, loop: false, bpm: 60, tolerance: 12 }
const notes = [{ midi: 69, ticks: 960 }, { midi: 69, ticks: 960 }]
function run(state: PracticeState, start: number, end: number, frequency: number | null, opts = options, score = notes, quiet = frequency === null) {
  for (let at = start; at <= end; at += 100) state = stepPractice(state, { frequency, quiet, at }, score, opts)
  return state
}
const running = () => ({ ...createPractice(), phase: 'running' as const })
test('stable match advances, held note cannot match next repeated note', () => {
  let state = run(running(), 0, 200, null)
  state = run(state, 300, 600, 440)
  assert.equal(state.hits, 1)
  assert.equal(state.cursor, 1)
  state = run(state, 700, 2000, 440)
  assert.equal(state.hits, 1)
  state = run(state, 2100, 2300, null)
  state = run(state, 2400, 2700, 440)
  assert.equal(state.hits, 2)
  assert.equal(state.phase, 'complete')
})
test('short bursts do not count; sustained wrong note counted once', () => {
  let state = run(running(), 0, 200, null)
  state = run(state, 300, 400, 440)
  state = run(state, 500, 500, null)
  assert.equal(state.hits, 0)
  state = run(state, 600, 2000, 466.16)
  assert.equal(state.corrections, 1)
  assert.equal(state.hits, 0)
  state = run(state, 2100, 2400, 440)
  assert.equal(state.hits, 1)
})
test('loop endpoint wraps only inside selected range', () => {
  const opts = { ...options, start: 1, end: 1, loop: true }
  let state = run({ ...running(), cursor: 1 }, 0, 200, null, opts)
  state = run(state, 300, 600, 440, opts)
  assert.equal(state.cursor, 1)
  assert.equal(state.laps, 1)
  assert.equal(state.phase, 'running')
})
test('rests require measured quiet for duration, noise is not silence', () => {
  const score = [{ midi: null, ticks: 960 }]
  const opts = { ...options, end: 0 }
  let state = run(running(), 0, 1200, null, opts, score, false)
  assert.equal(state.rests, 0)
  state = run(state, 1300, 2200, null, opts, score)
  assert.equal(state.rests, 0)
  state = run(state, 2300, 2300, null, opts, score)
  assert.equal(state.rests, 1)
  assert.equal(state.hits, 0)
})
test('stale or repeated timestamps do not count; background gaps reset gate', () => {
  let state = run(running(), 0, 200, null)
  state = run(state, 300, 400, 440)
  const stale = run(state, 400, 400, 440)
  assert.deepEqual(stale, state)
  state = run(state, 1200, 1600, 440)
  assert.equal(state.hits, 0)
  assert.equal(state.waitingForSilence, true)
})
test('paused session ignores samples and requires new quiet on resume', () => {
  let state = run(running(), 0, 200, null)
  state = run(state, 300, 500, 440)
  state = pausePractice(state)
  assert.equal(run(state, 600, 1000, 440).hits, 0)
  assert.equal(run({ ...state, phase: 'running' }, 1100, 2000, 440).hits, 0)
})
test('invalid bounds stop safely; tolerance controls match', () => {
  assert.equal(run(running(), 0, 0, null, { ...options, end: 99 }).phase, 'paused')
  assert.equal(run(running(), 0, 0, null, { ...options, bpm: 0 }).phase, 'paused')
  const freq = 440 * 2 ** (20 / 1200)
  let state = run(running(), 0, 200, null)
  state = run(state, 300, 600, freq)
  assert.equal(state.hits, 0)
  state = run(running(), 0, 200, null, { ...options, tolerance: 25 })
  state = run(state, 300, 600, freq, { ...options, tolerance: 25 })
  assert.equal(state.hits, 1)
})
