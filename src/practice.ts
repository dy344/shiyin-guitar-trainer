export type PitchSample = { frequency: number | null; quiet: boolean; at: number }
export type PracticeNote = { midi: number | null; ticks: number }
export type PracticeOptions = { start: number; end: number; loop: boolean; bpm: number; tolerance: number }
export type PracticeState = {
  runId: string
  phase: 'idle' | 'running' | 'paused' | 'complete'
  cursor: number
  hits: number
  rests: number
  corrections: number
  laps: number
  waitingForSilence: boolean
  goodSince: number | null
  badSince: number | null
  quietSince: number | null
  lastAt: number | null
  corrected: boolean
}
export function createPractice(cursor = 0): PracticeState {
  return { runId: crypto.randomUUID(), phase: 'idle', cursor, hits: 0, rests: 0, corrections: 0, laps: 0, waitingForSilence: true, goodSince: null, badSince: null, quietSince: null, lastAt: null, corrected: false }
}
export function pausePractice(state: PracticeState): PracticeState {
  return { ...state, phase: state.phase === 'running' ? 'paused' : state.phase, waitingForSilence: true, goodSince: null, badSince: null, quietSince: null, lastAt: null }
}
export function advancePractice(state: PracticeState, rest: boolean, options: PracticeOptions): PracticeState {
  const atEnd = state.cursor === options.end
  return {
    ...state,
    cursor: atEnd ? options.loop ? options.start : state.cursor : state.cursor + 1,
    phase: atEnd && !options.loop ? 'complete' : 'running',
    hits: state.hits + (rest ? 0 : 1),
    rests: state.rests + (rest ? 1 : 0),
    laps: state.laps + (atEnd ? 1 : 0),
    waitingForSilence: true, goodSince: null, badSince: null, quietSince: null, corrected: false,
  }
}
export function stepPractice(state: PracticeState, sample: PitchSample, notes: PracticeNote[], options: PracticeOptions): PracticeState {
  if (state.phase !== 'running') return state
  if (!Number.isInteger(options.start) || !Number.isInteger(options.end) || options.start < 0 || options.end >= notes.length || options.start > options.end || state.cursor < options.start || state.cursor > options.end || !Number.isFinite(options.bpm) || options.bpm < 30 || options.bpm > 200 || !Number.isFinite(options.tolerance) || options.tolerance < 1 || options.tolerance > 50) return pausePractice(state)
  if (!Number.isFinite(sample.at) || (state.lastAt !== null && sample.at <= state.lastAt)) return state
  let next = { ...state, lastAt: sample.at }
  if (state.lastAt !== null && sample.at - state.lastAt > 350) next = { ...next, goodSince: null, badSince: null, quietSince: null, waitingForSilence: true }
  const note = notes[state.cursor]
  if (!Number.isInteger(note.ticks) || note.ticks <= 0 || (note.midi !== null && (!Number.isInteger(note.midi) || note.midi < 40 || note.midi > 88))) return pausePractice(next)
  const quiet = sample.quiet && sample.frequency === null
  if (note.midi === null) {
    const quietSince = quiet ? next.quietSince ?? sample.at : null
    if (quietSince !== null && sample.at - quietSince >= note.ticks / 960 * 60000 / options.bpm) return advancePractice(next, true, options)
    return { ...next, quietSince }
  }
  if (next.waitingForSilence) {
    const quietSince = quiet ? next.quietSince ?? sample.at : null
    return { ...next, quietSince, waitingForSilence: quietSince === null || sample.at - quietSince < 150 }
  }
  if (sample.frequency === null || !Number.isFinite(sample.frequency) || sample.frequency <= 0) return { ...next, goodSince: null, badSince: null }
  const target = 440 * 2 ** ((note.midi - 69) / 12)
  const correct = Math.abs(1200 * Math.log2(sample.frequency / target)) <= options.tolerance
  const goodSince = correct ? next.goodSince ?? sample.at : null
  const badSince = correct ? null : next.badSince ?? sample.at
  if (goodSince !== null && sample.at - goodSince >= 300) return advancePractice(next, false, options)
  const newlyCorrected = !next.corrected && badSince !== null && sample.at - badSince >= 300
  return { ...next, goodSince, badSince, corrected: next.corrected || newlyCorrected, corrections: next.corrections + (newlyCorrected ? 1 : 0) }
}

export type PracticeAction =
  | { type: 'sample'; sample: PitchSample; notes: PracticeNote[]; options: PracticeOptions }
  | { type: 'pause' }
  | { type: 'seek'; cursor: number }
  | { type: 'reset'; cursor: number }
  | { type: 'start'; options: PracticeOptions }

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case 'sample': return stepPractice(state, action.sample, action.notes, action.options)
    case 'pause': return state.phase === 'running' ? pausePractice(state) : state
    case 'seek': return { ...pausePractice(state), cursor: action.cursor, corrected: false }
    case 'reset': return createPractice(action.cursor)
    case 'start': return state.phase === 'paused' && state.cursor >= action.options.start && state.cursor <= action.options.end
      ? { ...pausePractice(state), phase: 'running' }
      : { ...createPractice(action.options.start), phase: 'running' }
  }
}
