import { useCallback, useEffect, useRef, useState } from 'react'
import { centsFrom, readPitch } from './pitch'
import ScorePanel from './ScorePanel'
import type { PracticeTarget } from './ScorePanel'
import type { PitchSample } from './practice'
import { usePlayback } from './usePlayback'
import './App.css'
import './score.css'
import './learning.css'

const strings = [
  { note: 'E2', frequency: 82.4069, string: 6 },
  { note: 'A2', frequency: 110, string: 5 },
  { note: 'D3', frequency: 146.8324, string: 4 },
  { note: 'G3', frequency: 195.9977, string: 3 },
  { note: 'B3', frequency: 246.9417, string: 2 },
  { note: 'E4', frequency: 329.6276, string: 1 },
]

export default function App() {
  const { player, view: playback } = usePlayback()
  const [mode, setMode] = useState<'tuner' | 'score' | 'study'>('tuner')
  const studyPractice = useCallback(() => setMode('score'), [])
  const [scoreTarget, setScoreTarget] = useState<PracticeTarget>({ note: 'E4', frequency: 329.6276, string: 1, fret: 0 })
  const [selected, setSelected] = useState(0)
  const [frequency, setFrequency] = useState<number | null>(null)
  const [sample, setSample] = useState<PitchSample | null>(null)
  const [status, setStatus] = useState('点击开始监听，然后弹奏目标音')
  const [running, setRunning] = useState(false)
  const [pending, setPending] = useState(false)
  const resources = useRef<{ stream: MediaStream; context: AudioContext; timer: number } | null>(null)
  const generation = useRef(0)
  const release = () => {
    generation.current++
    const current = resources.current
    resources.current = null
    if (current) {
      clearInterval(current.timer)
      current.stream.getTracks().forEach(track => track.stop())
      void current.context.close().catch(() => {})
    }
  }
  useEffect(() => release, [])
  const stop = () => { release(); setRunning(false); setPending(false); setFrequency(null); setSample(null); setStatus('监听已停止') }
  const start = async () => {
    if (pending || running) return
    player.stop('开始监听，示范播放已停止')
    const token = ++generation.current
    setPending(true)
    let stream: MediaStream | undefined
    let context: AudioContext | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      context = new AudioContext()
      await context.resume()
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return }
      const analyser = context.createAnalyser()
      analyser.fftSize = 4096
      context.createMediaStreamSource(stream).connect(analyser)
      const buffer = new Float32Array(4096)
      const sampleRate = context.sampleRate
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buffer)
        const detected = readPitch(buffer, sampleRate)
        let mean = 0
        for (const value of buffer) mean += value
        mean /= buffer.length
        let energy = 0
        for (const value of buffer) energy += (value - mean) ** 2
        setFrequency(detected)
        setSample({ frequency: detected, quiet: Math.sqrt(energy / buffer.length) < 0.006, at: performance.now() })
      }, 100)
      resources.current = { stream, context, timer }
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { stop(); setStatus('麦克风已断开，请重新连接') }, { once: true }))
      setRunning(true)
      setStatus('正在监听 · 请逐根拨弦，避免同时发声')
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop())
      await context?.close().catch(() => {})
      if (token === generation.current) setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '麦克风权限被拒绝，请检查 Windows 麦克风隐私设置' : '无法启动麦克风，请检查输入设备是否连接或被占用')
    } finally { if (token === generation.current) setPending(false) }
  }
  const target = mode === 'tuner' ? { ...strings[selected], fret: 0 } : scoreTarget
  const cents = frequency && target.frequency ? centsFrom(frequency, target.frequency) : null
  const tolerance = mode === 'score' ? scoreTarget.tolerance ?? 12 : 12
  const accurate = cents !== null && Math.abs(cents) <= tolerance
  const midi = frequency ? Math.round(69 + 12 * Math.log2(frequency / 440)) : null
  const actual = midi === null ? '—' : `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12]}${Math.floor(midi / 12) - 1}`
  return <main className={`app-shell${mode === 'study' ? ' study-mode' : ''}`}>
    <aside className="sidebar"><div className="brand">拾音</div><nav className="mode-switch"><button aria-pressed={mode === 'tuner'} onClick={() => { player.stop(); setMode('tuner') }}>空弦调音</button><button aria-pressed={mode === 'score'} onClick={() => setMode('score')}>曲谱练习</button><button aria-pressed={mode === 'study'} onClick={() => { player.stop(); stop(); setMode('study') }}>找谱学习</button></nav><h2>空弦音准训练</h2><p>标准调弦 · A4 = 440 Hz</p><div className="songs">{strings.map((item, index) => <button key={item.string} className={`song ${mode === 'tuner' && index === selected ? 'selected' : ''}`} onClick={() => { player.stop(); setSelected(index); setMode('tuner') }}><span>{item.string} 弦 · {item.note}<small>{item.frequency.toFixed(2)} Hz</small></span></button>)}</div></aside>
    <section className="workspace"><header><div><h1>{mode === 'tuner' ? '标准调弦' : mode === 'study' ? '找谱学习' : '曲谱练习'}</h1><p>{mode === 'study' ? '站外搜索 · 本机收藏 · 分段练习' : '安静环境 · 一次只弹一个音'} · v0.8</p></div></header>
      <section className="pitch-card" hidden={mode === 'study'}><div className="note-block"><span>目标音</span><strong className="target-note">{target.note}</strong></div><div className="divider"/><div className="note-block"><span>实际音</span><strong className="actual-note">{actual}</strong><small>{frequency ? `${frequency.toFixed(1)} Hz` : '等待弹奏'}</small></div><div className={`result ${accurate ? 'in-tune' : ''}`}><b>{cents === null ? '待检测' : accurate ? '准确' : cents < 0 ? '偏低' : '偏高'}</b><small>{cents === null ? '—' : `${Math.round(cents)} 音分`}</small></div><div className="meter"><div className="meter-label"><span>偏低 -50</span><span>目标音 0</span><span>偏高 +50</span></div><div className="ticks">{cents !== null && <span style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }}/>}</div><p role="status">{status}</p></div></section>
      <footer hidden={mode === 'study'}><button className="import" disabled={pending} onClick={running ? stop : start}>{pending ? '正在连接…' : running ? '停止监听' : '开始监听'}</button></footer>
      <div data-score-container hidden={mode === 'tuner'}><ScorePanel visible={mode === 'score'} studyMode={mode === 'study'} onStudyPractice={studyPractice} onTarget={setScoreTarget} sample={sample} enabled={mode === 'score' && running} playback={playback} onStopPlayback={() => player.stop()} onPrepareTranscription={() => { player.stop(); stop() }} onPlay={(score, startIndex, endIndex, bpm, metronome) => { stop(); setStatus('麦克风已关闭，听完示范后请重新开始监听'); void player.play(score.notes, startIndex, endIndex, bpm, metronome) }}/></div>
    </section><aside className="insights"><article><h2>当前指法</h2><strong className="string">{target.string === null ? '休止' : `${target.string} 弦`}</strong><p>{target.note} · {target.fret === null ? '暂停发声，按休止时值等待' : target.fret === 0 ? '空弦' : `${target.fret} 品`}</p></article><article><h2>麦克风状态</h2><p>{running ? '正在监听' : '未监听'}</p></article><article><h2>练习提示</h2><p>读数相对目标音计算，±{tolerance} 音分以内显示准确。</p><p>在曲谱区开始跟练后，稳定命中自动换音。每个音之间先止音；切换页面、停止监听或手动选音会暂停练习。</p></article></aside>
  </main>
}
