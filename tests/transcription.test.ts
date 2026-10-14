import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzePCM, buildTranscription, transcribePCM, transcriptionRate } from '../src/transcription.ts'
import { measureTotals } from '../src/editor.ts'
import { exportMusicXML, validateScore } from '../src/score.ts'

function audio(parts: { midi: number | null; seconds: number; harmonic?: boolean }[]) {
  const samples = new Float32Array(Math.round(parts.reduce((sum, part) => sum + part.seconds, 0) * transcriptionRate))
  let offset = 0
  for (const part of parts) {
    const count = Math.round(part.seconds * transcriptionRate)
    const frequency = part.midi === null ? 0 : 440 * 2 ** ((part.midi - 69) / 12)
    for (let i = 0; i < count; i++) {
      const phase = 2 * Math.PI * frequency * i / transcriptionRate
      const fade = Math.min(1, i / 80, (count - i) / 80)
      samples[offset + i] = part.midi === null ? 0 : fade * (part.harmonic ? Math.exp(-i / count) * (0.25 * Math.sin(phase) + 0.12 * Math.sin(phase * 2) + 0.06 * Math.sin(phase * 3)) : 0.25 * Math.sin(phase))
    }
    offset += count
  }
  return samples
}
test('single-tone melody detects pitches, preserves a rest and fills final bar', () => {
  const samples = audio([{ midi: null, seconds: 0.25 }, { midi: 64, seconds: 0.5 }, { midi: null, seconds: 0.25 }, { midi: 67, seconds: 0.5 }, { midi: null, seconds: 0.25 }])
  const progress: number[] = []
  const draft = transcribePCM(samples, transcriptionRate, { bpm: 120, grid: 240, title: '测试' }, value => progress.push(value))
  assert.deepEqual(draft.score.notes.filter(note => note.midi !== null).map(note => note.midi), [64, 67])
  assert.ok(draft.score.notes.some(note => note.midi === null && note.ticks === 480))
  assert.ok(draft.detectedPercent >= 80)
  assert.equal(progress.at(-1), 100)
  assert.ok(measureTotals(draft.score).every(bar => bar.used === bar.expected))
  assert.ok(draft.trimmedSeconds >= 0.4)
})
test('guitar-like decaying harmonic tones and low/high playable notes remain correct', () => {
  for (const midi of [40, 45, 55, 64, 76, 88]) {
    const result = analyzePCM(audio([{ midi, seconds: 0.7, harmonic: true }]), transcriptionRate)
    const pitches = result.segments.filter(segment => segment.midi !== null).map(segment => segment.midi)
    assert.deepEqual(pitches, [midi], `MIDI ${midi}: ${pitches}`)
  }
})
test('same pitch repeated with a quiet gap remains two notes', () => {
  const result = analyzePCM(audio([{ midi: 64, seconds: 0.5 }, { midi: null, seconds: 0.2 }, { midi: 64, seconds: 0.5 }]), transcriptionRate)
  assert.deepEqual(result.segments.filter(segment => segment.midi !== null).map(segment => segment.midi), [64, 64])
})
test('silent, non-finite, too short, too long and wrong-rate audio is rejected', () => {
  for (const samples of [new Float32Array(), new Float32Array(300), new Float32Array(transcriptionRate), new Float32Array(transcriptionRate).fill(NaN), new Float32Array(transcriptionRate * 20 + 1)]) assert.throws(() => analyzePCM(samples, transcriptionRate))
  assert.throws(() => analyzePCM(audio([{ midi: 64, seconds: 0.5 }]), 48000))
  assert.throws(() => analyzePCM(audio([{ midi: 35, seconds: 0.5 }]), transcriptionRate))
})
test('bar-crossing sustained note splits explicitly and reports limitation', () => {
  const draft = buildTranscription([{ midi: 64, start: 0, end: 3 }], { bpm: 120, grid: 240, title: '长音' }, 100)
  assert.deepEqual(draft.score.notes.map(note => note.ticks), [3840, 1920, 1920])
  assert.ok(draft.warnings.some(warning => warning.includes('跨小节')))
  assert.ok(measureTotals(draft.score).every(bar => bar.used === bar.expected))
})
test('invalid options, empty/all-rest and discontinuous segments fail', () => {
  const segments = [{ midi: 64, start: 0, end: 1 }]
  for (const bpm of [0, 39, 161, NaN, Infinity]) assert.throws(() => buildTranscription(segments, { bpm, grid: 240, title: '' }))
  assert.throws(() => buildTranscription([], { bpm: 80, grid: 240, title: '' }))
  assert.throws(() => buildTranscription([{ midi: null, start: 0, end: 1 }], { bpm: 80, grid: 240, title: '' }))
  for (const segment of [{ midi: 39, start: 0, end: 1 }, { midi: 64, start: 0, end: 21 }, { midi: 64, start: 0.5, end: 1 }, { midi: 64, start: 0, end: -1 }]) assert.throws(() => buildTranscription([segment], { bpm: 80, grid: 240, title: '' }))
})
test('quantization uses cumulative boundaries rather than accumulating timing drift', () => {
  const segments = Array.from({ length: 10 }, (_, index) => ({ midi: index % 2 ? 67 : 64, start: index * 0.3, end: (index + 1) * 0.3 }))
  const draft = buildTranscription(segments, { bpm: 100, grid: 240, title: '量化' }, 90)
  assert.equal(draft.score.notes.filter(note => note.midi !== null).reduce((sum, note) => sum + note.ticks, 0), 4800)
  assert.equal(draft.score.tempo, 100)
  assert.ok(exportMusicXML(draft.score).includes('tempo="100"'))
  assert.equal(validateScore(JSON.parse(JSON.stringify(draft.score))).tempo, 100)
  assert.throws(() => validateScore({ ...draft.score, tempo: 0 }))
})
test('short transients are not promoted to notes and low detection coverage is flagged', () => {
  const result = analyzePCM(audio([{ midi: 64, seconds: 0.5 }, { midi: 70, seconds: 0.02 }, { midi: 64, seconds: 0.5 }]), transcriptionRate)
  assert.ok(result.segments.every(segment => segment.midi === null || segment.midi === 64))
  const draft = buildTranscription([{ midi: 64, start: 0, end: 1 }], { bpm: 80, grid: 480, title: '' }, 10)
  assert.ok(draft.warnings.some(warning => warning.includes('覆盖偏低')))
})
