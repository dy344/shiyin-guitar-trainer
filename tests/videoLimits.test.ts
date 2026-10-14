import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateVideoFile, validateVideoInfo, videoRange, videoMaxBytes } from '../src/videoLimits.ts'

test('video import accepts named containers and rejects empty, oversized and wrong inputs', () => {
  for (const name of ['演奏.MP4', 'phone.mov', 'clip.webm']) assert.doesNotThrow(() => validateVideoFile({ name, size: videoMaxBytes }))
  for (const file of [{ name: 'test.mp4', size: 0 }, { name: 'test.mp4', size: videoMaxBytes + 1 }, { name: 'test.mp4', size: NaN }, { name: 'test.wav', size: 100 }, { name: '', size: 100 }]) assert.throws(() => validateVideoFile(file))
})
test('video duration and audio channel limits reject invalid metadata', () => {
  for (const duration of [0.25, 10, 600]) assert.doesNotThrow(() => validateVideoInfo(duration, 2))
  for (const duration of [0, -1, 0.249, 601, NaN, Infinity]) assert.throws(() => validateVideoInfo(duration, 1))
  for (const channels of [0, 3, 1.5, NaN]) assert.throws(() => validateVideoInfo(10, channels))
})
test('video clip boundaries permit offsets and exact limits, rejecting blank and reversed ranges', () => {
  assert.deepEqual(videoRange('4.5', '4.75', 10), { from: 4.5, to: 4.75 })
  assert.deepEqual(videoRange('580', '600', 600), { from: 580, to: 600 })
  for (const [start, end] of [['', '1'], ['0', ' '], ['-1', '1'], ['2', '1'], ['0', '0.24'], ['0', '20.01'], ['NaN', '2'], ['0', 'Infinity'], ['599', '601']]) assert.throws(() => videoRange(start, end, 600))
  assert.throws(() => videoRange('0', '1', NaN))
})
