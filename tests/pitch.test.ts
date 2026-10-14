import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readPitch, centsFrom } from '../src/pitch.ts'

for (const rate of [44100, 48000]) {
  for (const frequency of [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276, 523.251, 987.767]) {
    test(`${rate} Hz / ${frequency} Hz`, () => {
      const samples = Float32Array.from({ length: 4096 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * frequency * i / rate) + 0.1 * Math.sin(4 * Math.PI * frequency * i / rate))
      const result = readPitch(samples, rate)
      assert.ok(result && Math.abs(centsFrom(result, frequency)) < 5)
    })
  }
}
test('silence and invalid input', () => {
  assert.equal(readPitch(new Float32Array(4096), 48000), null)
  assert.equal(readPitch(new Float32Array(0), 48000), null)
  assert.equal(readPitch(new Float32Array(4096).fill(NaN), 48000), null)
  assert.equal(readPitch(new Float32Array(4096), NaN), null)
})
