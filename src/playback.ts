export type MelodyNote = { midi: number | null; ticks: number }
export type MelodyEvent = { index: number; midi: number | null; at: number; duration: number }
export type PlaybackView = { phase: 'idle' | 'loading' | 'playing'; index: number | null; message: string }
export function planMelody(notes: MelodyNote[], start: number, end: number, bpm: number): MelodyEvent[] {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 200 || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= notes.length || start > end) throw new Error('示范范围或速度无效')
  let at = 0
  return notes.slice(start, end + 1).map((note, offset) => {
    if (!Number.isInteger(note.ticks) || note.ticks <= 0 || note.ticks > 122880 || (note.midi !== null && (!Number.isInteger(note.midi) || note.midi < 40 || note.midi > 88))) throw new Error('示范音符无效')
    const duration = note.ticks / 960 * 60 / bpm
    const event = { index: start + offset, midi: note.midi, at, duration }
    at += duration
    if (at > 1200) throw new Error('单次示范最多 20 分钟，请缩小范围')
    return event
  })
}

export class MelodyPlayer {
  private generation = 0
  private context: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private nodes = new Set<OscillatorNode>()
  private publish: (view: PlaybackView) => void
  private factory: () => AudioContext

  constructor(publish: (view: PlaybackView) => void, factory: () => AudioContext = () => new AudioContext()) {
    this.publish = publish
    this.factory = factory
  }

  stop(message = '示范已停止，重新点击开始监听即可练习', notify = true) {
    this.generation++
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    for (const node of this.nodes) {
      try { node.stop(); node.disconnect() } catch { }
    }
    this.nodes.clear()
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') void context.close().catch(() => {})
    if (notify) this.publish({ phase: 'idle', index: null, message })
  }

  async play(notes: MelodyNote[], start: number, end: number, bpm: number, metronome: boolean) {
    this.stop('', false)
    const token = this.generation
    try {
      const events = planMelody(notes, start, end, bpm)
      const context = this.factory()
      this.context = context
      this.publish({ phase: 'loading', index: null, message: '正在准备示范音频…' })
      await context.resume()
      if (token !== this.generation) return
      if (context.state !== 'running') throw new Error('音频设备未启动')
      const epoch = context.currentTime + 0.08
      const duration = events[events.length - 1].at + events[events.length - 1].duration
      let next = 0, click = 0, display = -1
      const tone = (frequency: number, at: number, length: number, pulse = false) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = pulse ? 'sine' : 'triangle'
        oscillator.frequency.value = frequency
        const volume = pulse ? 0.055 : 0.14
        const attack = Math.min(0.008, length / 4)
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(volume, at + attack)
        gain.gain.setValueAtTime(volume, at + length - attack)
        gain.gain.linearRampToValueAtTime(0, at + length)
        oscillator.connect(gain)
        gain.connect(context.destination)
        this.nodes.add(oscillator)
        oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
        oscillator.start(at)
        oscillator.stop(at + length)
      }
      const tick = () => {
        if (token !== this.generation) return
        try {
          const elapsed = context.currentTime - epoch
          if (elapsed >= duration) { this.stop('示范结束。点击开始监听后，可以开始跟练'); return }
          while (next < events.length && events[next].at <= elapsed + 0.12) {
            const event = events[next++]
            const from = Math.max(context.currentTime, epoch + event.at)
            const length = epoch + event.at + event.duration * 0.9 - from
            if (event.midi !== null && length > 0.002) tone(440 * 2 ** ((event.midi - 69) / 12), from, length)
          }
          if (metronome) {
            const beat = 60 / bpm
            click = Math.max(click, Math.ceil(Math.max(0, elapsed - 0.015) / beat))
            while (click * beat < duration && click * beat <= elapsed + 0.12) {
              tone(1200, Math.max(context.currentTime, epoch + click * beat), 0.035, true)
              click++
            }
          }
          const current = Math.max(0, events.findIndex(event => elapsed < event.at + event.duration))
          if (display !== current) {
            display = current
            this.publish({ phase: 'playing', index: events[current].index, message: `正在示范第 ${events[current].index + 1} 个音符 · ${bpm} BPM · 麦克风已停止` })
          }
        } catch (error) { this.stop(`播放失败：${error instanceof Error ? error.message : '请检查音频设备'}`) }
      }
      this.timer = setInterval(tick, 25)
      tick()
    } catch (error) {
      if (token === this.generation) this.stop(`无法播放：${error instanceof Error ? error.message : '请检查音频设备'}`)
    }
  }
}
