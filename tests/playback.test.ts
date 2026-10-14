import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MelodyPlayer, planMelody } from '../src/playback.ts'
import type { PlaybackView } from '../src/playback.ts'

const notes = [{ midi: 64, ticks: 960 }, { midi: null, ticks: 480 }, { midi: 65, ticks: 1920 }]
test('tempo scales notes and rests without losing selected indices', () => {
  assert.deepEqual(planMelody(notes, 1, 2, 60), [{ index: 1, midi: null, at: 0, duration: 0.5 }, { index: 2, midi: 65, at: 0.5, duration: 2 }])
  assert.equal(planMelody(notes, 0, 2, 120)[2].at, 0.75)
})
test('invalid score and range do not produce a schedule', () => {
  for (const bpm of [0, NaN, Infinity, 201]) assert.throws(() => planMelody(notes, 0, 2, bpm))
  assert.throws(() => planMelody([], 0, 0, 80))
  assert.throws(() => planMelody(notes, 2, 1, 80))
  assert.throws(() => planMelody([{ midi: 64, ticks: -1 }], 0, 0, 80))
})
function fakeContext() {
  const calls: { frequency: number; at: number }[] = []
  const context = {
    currentTime: 0, state: 'running', destination: {}, closed: false,
    resume: async () => {}, close: async () => { context.closed = true; context.state = 'closed' },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => {
      const oscillator = { frequency: { value: 0 }, type: '', onended: null, connect() {}, disconnect() {}, stop() {}, start(at: number) { calls.push({ frequency: oscillator.frequency.value, at }) } }
      return oscillator
    },
  }
  return { context, calls, factory: () => context as unknown as AudioContext }
}
test('audio scheduler plays pitch plus beat, then ends and closes context', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const { context, calls, factory } = fakeContext()
  const views: PlaybackView[] = []
  const player = new MelodyPlayer(view => views.push(view), factory)
  await player.play(notes, 0, 0, 120, true)
  assert.equal(calls.length, 2)
  assert.ok(Math.abs(calls[0].frequency - 329.6276) < 0.01)
  assert.equal(calls[1].frequency, 1200)
  assert.equal(views.at(-1)?.phase, 'playing')
  context.currentTime = 1
  t.mock.timers.tick(25)
  assert.equal(views.at(-1)?.phase, 'idle')
  assert.equal(context.closed, true)
})
test('stopping while resume is pending cannot resurrect playback', async () => {
  const { context, calls, factory } = fakeContext()
  let resolve!: () => void
  context.resume = () => new Promise<void>(done => { resolve = done })
  const views: PlaybackView[] = []
  const player = new MelodyPlayer(view => views.push(view), factory)
  const pending = player.play(notes, 0, 2, 80, false)
  player.stop()
  resolve()
  await pending
  assert.equal(calls.length, 0)
  assert.equal(context.closed, true)
  assert.equal(views.at(-1)?.phase, 'idle')
})
test('rests are silent without metronome; resume failure is surfaced', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const fake = fakeContext()
  const views: PlaybackView[] = []
  const player = new MelodyPlayer(view => views.push(view), fake.factory)
  await player.play(notes, 1, 1, 80, false)
  assert.equal(fake.calls.length, 0)
  player.stop()
  fake.context.resume = async () => { throw new Error('denied') }
  await player.play(notes, 0, 0, 80, false)
  assert.match(views.at(-1)!.message, /denied/)
})
