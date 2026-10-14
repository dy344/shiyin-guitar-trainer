import { useEffect, useRef, useState } from 'react'
import type { Score } from './score'
import { noteName } from './score'
import { decodeAudioFile } from './audioImport'
import type { ImportedAudio } from './audioImport'
import type { TranscriptionDraft } from './transcription'

export default function TranscriptionPanel({ disabled, full, onBegin, onBusy, onImport }: { disabled: boolean; full: boolean; onBegin: () => void; onBusy: (busy: boolean) => void; onImport: (score: Score, bpm: number) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const worker = useRef<Worker | null>(null)
  const generation = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [audio, setAudio] = useState<ImportedAudio | null>(null)
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('10')
  const [bpm, setBpm] = useState('80')
  const [grid, setGrid] = useState<240 | 480>(240)
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [draft, setDraft] = useState<TranscriptionDraft | null>(null)
  const [message, setMessage] = useState('先用自己录制的清晰单音试验；音频只在本机处理，不会上传。')
  const dispose = () => { worker.current?.terminate(); worker.current = null; if (timeout.current) clearTimeout(timeout.current); timeout.current = null }
  useEffect(() => () => { generation.current++; dispose() }, [])
  const finish = () => { dispose(); setWorking(false); setProgress(null); onBusy(false) }
  const cancel = () => { generation.current++; finish(); setMessage('已取消，曲谱库没有改动') }
  const invalidate = () => { setDraft(null); setMessage('参数已改变，请重新生成草稿') }
  const load = async (file: File | undefined) => {
    if (!file) return
    const token = ++generation.current
    onBegin(); onBusy(true); setWorking(true); setDraft(null); setMessage('正在本机读取音频…')
    try {
      const imported = await decodeAudioFile(file)
      if (token !== generation.current) return
      setAudio(imported); setStart('0'); setEnd(String(Math.min(10, Math.floor(imported.duration * 100) / 100)))
      setMessage('音频已读取。选择最多 20 秒片段，并设置原录音速度；不会自动推断拍号和 BPM。')
    } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : '音频读取失败') }
    finally { if (token === generation.current) finish(); if (input.current) input.current.value = '' }
  }
  const analyze = () => {
    if (!audio || working) return
    const from = Number(start), to = Number(end), tempo = Number(bpm)
    if (!start.trim() || !end.trim() || !bpm.trim() || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > audio.duration || to - from < 0.25 || to - from > 20 || !Number.isInteger(tempo) || tempo < 40 || tempo > 160) { setMessage('请检查参数：片段须在录音内，长度 0.25–20 秒，速度为 40–160 的整数 BPM'); return }
    const token = ++generation.current
    onBegin(); onBusy(true); setWorking(true); setDraft(null); setProgress(0); setMessage('正在识别单音，生成后请人工检查…')
    try {
      const selected = audio.samples.slice(Math.round(from * audio.rate), Math.round(to * audio.rate))
      const current = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' })
      worker.current = current
      timeout.current = setTimeout(() => { if (token === generation.current) { generation.current++; finish(); setMessage('识别超过 60 秒，已停止；请缩短片段后重试') } }, 60_000)
      current.onmessage = (event: MessageEvent<{ type: string; percent?: number; draft?: TranscriptionDraft; message?: string }>) => {
        if (token !== generation.current) return
        if (event.data.type === 'progress') setProgress(event.data.percent ?? 0)
        else if (event.data.type === 'result' && event.data.draft) { setDraft(event.data.draft); finish(); setMessage('草稿已生成，尚未加入曲谱库。请检查下方提示。') }
        else { finish(); setMessage(event.data.message || '无法生成草稿') }
      }
      current.onerror = event => { event.preventDefault(); if (token === generation.current) { finish(); setMessage('后台识别无法运行，请刷新页面或缩短片段后重试') } }
      current.postMessage({ samples: selected, rate: audio.rate, options: { bpm: tempo, grid, title: audio.name } }, [selected.buffer])
    } catch (error) { finish(); setMessage(error instanceof Error ? error.message : '无法启动识别') }
  }
  return <section className="transcription-panel" aria-label="本地音频扒谱">
    <h2>本地音频扒谱 <small>实验功能</small></h2>
    <p className="score-help">仅适合安静、无伴奏、一次一个音的录音。暂不支持视频、和弦、伴奏分离；不是整首歌曲自动扒谱。</p>
    <div className="score-toolbar"><button disabled={disabled || working} onClick={() => input.current?.click()}>选择本地音频</button>{working && <button onClick={cancel}>取消识别</button>}</div>
    <input ref={input} hidden type="file" accept=".wav,.mp3,.m4a,.ogg,.flac" aria-label="导入扒谱音频" onChange={event => void load(event.target.files?.[0])}/>
    {audio && <><p className="audio-source">{audio.name} · {audio.duration.toFixed(2)} 秒{audio.channels === 2 ? ` · 双声道，分析能量较高的第 ${audio.channel} 声道` : ' · 单声道'}</p><div className="transcription-options"><label>开始（秒）<input aria-label="扒谱开始秒数" type="number" min="0" max={audio.duration} step="0.01" disabled={disabled || working} value={start} onChange={event => { setStart(event.target.value); invalidate() }}/></label><label>结束（秒）<input aria-label="扒谱结束秒数" type="number" min="0.25" max={audio.duration} step="0.01" disabled={disabled || working} value={end} onChange={event => { setEnd(event.target.value); invalidate() }}/></label><label>原录音速度（BPM）<input aria-label="扒谱速度" type="number" min="40" max="160" step="1" disabled={disabled || working} value={bpm} onChange={event => { setBpm(event.target.value); invalidate() }}/></label><label>最小时值<select aria-label="扒谱量化" disabled={disabled || working} value={grid} onChange={event => { setGrid(Number(event.target.value) as 240 | 480); invalidate() }}><option value="240">十六分音符（1/4 拍）</option><option value="480">八分音符（1/2 拍）</option></select></label></div><div className="score-toolbar"><button disabled={disabled || working} onClick={analyze}>生成扒谱草稿</button></div></>}
    {progress !== null && <progress aria-label="扒谱进度" max={100} value={progress}/>}
    <p className="transcription-message" role="status">{message}</p>
    {draft && <div className="transcription-result"><p>草稿：{draft.score.notes.filter(note => note.midi !== null).length} 个音符 · {draft.score.meters.length} 小节 · {draft.bpm} BPM</p><p className="score-help">有声音帧的稳定音高覆盖：{draft.detectedPercent}%（不是准确率）。已裁去首尾约 {draft.trimmedSeconds.toFixed(2)} 秒静音或未识别声音。</p><ol>{draft.warnings.map(warning => <li key={warning}>{warning}</li>)}</ol><p className="draft-notes">{draft.score.notes.slice(0, 16).map(note => `${note.midi === null ? '休' : noteName(note.midi)}(${note.ticks / 960}拍)`).join(' · ')}{draft.score.notes.length > 16 ? ' …' : ''}</p><button disabled={disabled || full || working} onClick={() => { onBegin(); onImport(draft.score, draft.bpm); setDraft(null); setMessage('草稿已加入曲谱库；可在上方试听、编辑，再导出 MusicXML。原音频不会保存到备份中。') }}>将草稿加入曲谱库</button>{full && <p>曲谱库已满（20 份），无法新增。</p>}</div>}
    <p className="score-help">文件上限 10 MB、时长 120 秒；单次分析最多 20 秒。优先使用 WAV，其他格式取决于浏览器支持。刷新会清除未加入曲谱库的草稿及原音频。</p>
  </section>
}
