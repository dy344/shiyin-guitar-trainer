import { readPitch } from './pitch.ts'
import { validateScore, withPitch } from './score.ts'
import type { Score, ScoreNote } from './score.ts'

export type PitchSegment = { midi: number | null; start: number; end: number }
export type TranscriptionOptions = { bpm: number; grid: 240 | 480; title: string }
export type TranscriptionDraft = { score: Score; warnings: string[]; detectedPercent: number; trimmedSeconds: number; bpm: number }
export const transcriptionRate = 16000
export const maxClipSeconds = 20

export function analyzePCM(samples: Float32Array, rate: number, progress: (percent: number) => void = () => {}): { segments: PitchSegment[]; detectedPercent: number } {
  if (!(samples instanceof Float32Array) || rate !== transcriptionRate || samples.length < rate / 4 || samples.length > rate * maxClipSeconds) throw new Error('分析片段须为 0.25–20 秒、16 kHz 音频')
  for (const value of samples) if (!Number.isFinite(value)) throw new Error('音频包含无效采样值')
  const hop = 320
  const window = new Float32Array(2048)
  const frames: (number | null)[] = []
  let sounding = 0, detected = 0
  for (let offset = 0; offset < samples.length; offset += hop) {
    const stop = Math.min(samples.length, offset + hop)
    let mean = 0, energy = 0
    for (let i = offset; i < stop; i++) mean += samples[i]
    mean /= stop - offset
    for (let i = offset; i < stop; i++) energy += (samples[i] - mean) ** 2
    let midi: number | null = null
    if (Math.sqrt(energy / (stop - offset)) >= 0.006) {
      sounding++
      const begin = offset + Math.floor((stop - offset) / 2) - 1024
      window.fill(0)
      const from = Math.max(0, begin), to = Math.min(samples.length, begin + 2048)
      window.set(samples.subarray(from, to), from - begin)
      const frequency = readPitch(window, rate)
      if (frequency !== null) {
        const exact = 69 + 12 * Math.log2(frequency / 440)
        const rounded = Math.round(exact)
        if (rounded >= 40 && rounded <= 88 && Math.abs(exact - rounded) <= 0.45) { midi = rounded; detected++ }
      }
    }
    frames.push(midi)
    if (frames.length % 16 === 0) progress(Math.round(stop / samples.length * 90))
  }
  const smoothed = frames.map((midi, index) => index > 0 && index + 1 < frames.length && frames[index - 1] === frames[index + 1] ? frames[index - 1] : midi)
  const runs: PitchSegment[] = []
  smoothed.forEach((midi, index) => {
    const end = Math.min((index + 1) * hop / rate, samples.length / rate)
    const previous = runs.at(-1)
    if (previous && previous.midi === midi) previous.end = end
    else runs.push({ midi, start: index * hop / rate, end })
  })
  const segments: PitchSegment[] = []
  for (const run of runs) {
    const midi = run.midi !== null && run.end - run.start < 0.079 ? null : run.midi
    const previous = segments.at(-1)
    if (previous && previous.midi === midi) previous.end = run.end
    else segments.push({ ...run, midi })
  }
  progress(100)
  if (!segments.some(segment => segment.midi !== null)) throw new Error('未检测到稳定的吉他单音，请换用清晰、无伴奏的录音或调整片段')
  return { segments, detectedPercent: sounding ? Math.round(detected / sounding * 100) : 0 }
}

export function buildTranscription(segments: PitchSegment[], options: TranscriptionOptions, detectedPercent = 0): TranscriptionDraft {
  if (!Number.isInteger(options.bpm) || options.bpm < 40 || options.bpm > 160 || ![240, 480].includes(options.grid) || typeof options.title !== 'string') throw new Error('速度须为 40–160 的整数 BPM，量化须为八分或十六分音符')
  if (!segments.length || segments.length > 2000) throw new Error('识别片段数量无效')
  let previousEnd = 0
  for (const segment of segments) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || Math.abs(segment.start - previousEnd) > 0.00001 || segment.end <= segment.start || segment.end > maxClipSeconds + 0.00001 || (segment.midi !== null && (!Number.isInteger(segment.midi) || segment.midi < 40 || segment.midi > 88))) throw new Error('识别结果的音高或时间范围无效')
    previousEnd = segment.end
  }
  const first = segments.findIndex(segment => segment.midi !== null)
  if (first < 0) throw new Error('片段没有可制谱的音符')
  let last = segments.length - 1
  while (last >= first && segments[last].midi === null) last--
  const origin = segments[first].start
  const notes: ScoreNote[] = []
  let currentTick = 0, split = 0, omitted = 0
  for (const segment of segments.slice(first, last + 1)) {
    const endTick = Math.round((segment.end - origin) * options.bpm / 60 * 960 / options.grid) * options.grid
    if (endTick <= currentTick) { omitted++; continue }
    while (currentTick < endTick) {
      const ticks = Math.min(endTick - currentTick, 3840 - currentTick % 3840)
      notes.push(withPitch({ midi: null, ticks, measure: Math.floor(currentTick / 3840), string: null, fret: null }, segment.midi))
      currentTick += ticks
      if (currentTick < endTick && segment.midi !== null) split++
    }
  }
  if (!notes.some(note => note.midi !== null)) throw new Error('音符短于量化精度，请选择十六分音符或更高速度')
  const remainder = currentTick % 3840
  if (remainder) notes.push({ midi: null, ticks: 3840 - remainder, measure: Math.floor(currentTick / 3840), string: null, fret: null })
  const score = validateScore({ version: 1, id: crypto.randomUUID(), tempo: options.bpm, title: `${options.title.trim() || '未命名录音'} · 扒谱草稿`.slice(0, 120), notes, meters: Array.from({ length: notes.at(-1)!.measure + 1 }, () => ({ beats: 4, unit: 4 })) })
  const warnings = ['草稿不是准确率承诺；请对照原录音检查音高、节奏和指法。', '按手动速度量化为 4/4 拍，第一处稳定音作起点；末尾补休止符。', '无法可靠分离伴奏、和弦，也不能保证分开连奏的同音重复。']
  if (split) warnings.push(`${split} 处长音跨小节，已拆为同音音符，暂不保留延音线。`)
  if (omitted) warnings.push(`${omitted} 段短于量化精度，已略去；可调小量化单位重新识别。`)
  if (detectedPercent < 70) warnings.push('稳定音高覆盖偏低，未识别部分按休止符处理；建议换用更清晰的录音。')
  return { score, warnings, detectedPercent, trimmedSeconds: origin + segments.at(-1)!.end - segments[last].end, bpm: options.bpm }
}

export function transcribePCM(samples: Float32Array, rate: number, options: TranscriptionOptions, progress?: (percent: number) => void) {
  const analyzed = analyzePCM(samples, rate, progress)
  return buildTranscription(analyzed.segments, options, analyzed.detectedPercent)
}
