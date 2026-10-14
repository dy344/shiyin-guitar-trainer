import { useEffect, useRef, useState } from 'react'
import type { Score } from './score'
import { noteName } from './score'
import type { TranscriptionDraft } from './transcription'
import type { VideoInfo } from './videoImport'
import { validateVideoFile, videoRange } from './videoLimits'

type Props = { disabled: boolean; full: boolean; active: boolean; listening: boolean; onBegin: () => void; onBusy: (busy: boolean) => void; onImport: (score: Score, bpm: number) => boolean }
export default function VideoPanel({ disabled, full, active, listening, onBegin, onBusy, onImport }: Props) {
  const picker = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const sourceURL = useRef<string | null>(null)
  const job = useRef<AbortController | null>(null)
  const [source, setSource] = useState<{ file: File; url: string; info: VideoInfo } | null>(null)
  const [start, setStart] = useState('0'), [end, setEnd] = useState('10'), [bpm, setBpm] = useState('80')
  const [loop, setLoop] = useState(false), [playing, setPlaying] = useState(false), [working, setWorking] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [draft, setDraft] = useState<TranscriptionDraft | null>(null)
  const [message, setMessage] = useState('选择本地清晰单音演奏视频，截取片段后生成可编辑草稿。文件只在本机处理。')
  const pause = () => { video.current?.pause(); setPlaying(false) }
  const cancel = () => { job.current?.abort(new DOMException('已取消', 'AbortError')); job.current = null; setWorking(false); setProgress(null); onBusy(false); setMessage('已取消，曲谱库没有改动') }
  useEffect(() => () => { job.current?.abort(); if (sourceURL.current) URL.revokeObjectURL(sourceURL.current) }, [])
  useEffect(() => {
    if (!active || listening || disabled) video.current?.pause()
    if (!active && job.current) { job.current.abort(new DOMException('已离开曲谱页面，处理已取消', 'AbortError')); job.current = null; setWorking(false); setProgress(null); onBusy(false); setMessage('已离开曲谱页面，处理已取消；曲谱库没有改动') }
  }, [active, listening, disabled, onBusy])
  useEffect(() => {
    const stopHidden = () => { if (document.hidden) video.current?.pause() }
    document.addEventListener('visibilitychange', stopHidden)
    return () => document.removeEventListener('visibilitychange', stopHidden)
  }, [])
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (job.current) return
    pause(); onBegin(); onBusy(true); setWorking(true); setDraft(null)
    const controller = new AbortController()
    job.current = controller
    const timer = setTimeout(() => controller.abort(new Error('视频处理超时，请缩短片段或转换文件后重试')), 90_000)
    try { await action(controller.signal) }
    catch (error) { if (job.current === controller) setMessage(error instanceof Error ? error.message : '视频处理失败，请重试') }
    finally { clearTimeout(timer); if (job.current === controller) { job.current = null; setWorking(false); setProgress(null); onBusy(false) } }
  }
  const load = async (file: File | undefined) => {
    if (!file || disabled || job.current) return
    try { validateVideoFile(file) } catch (error) { setMessage((error as Error).message); return }
    await run(async signal => {
      setMessage('正在读取视频和主音轨…')
      const { inspectVideo } = await import('./videoImport')
      const info = await inspectVideo(file, signal)
      signal.throwIfAborted()
      const url = URL.createObjectURL(file)
      if (sourceURL.current) URL.revokeObjectURL(sourceURL.current)
      sourceURL.current = url
      setSource({ file, info, url }); setStart('0'); setEnd(String(Math.min(10, Math.floor(info.duration * 100) / 100)))
      setMessage('视频已读取。先预览并选取 0.25–20 秒片段，再设置原演奏速度。')
    })
    if (picker.current) picker.current.value = ''
  }
  const range = () => { if (!source) throw new Error('请先选择视频'); return videoRange(start, end, source.info.duration) }
  const preview = async () => {
    try {
      if (!video.current || disabled || working || !active) return
      const { from } = range()
      onBegin(); video.current.currentTime = from
      await video.current.play()
    } catch (error) { setMessage(error instanceof Error ? `无法预览：${error.message}` : '无法预览视频'); pause() }
  }
  const analyze = async () => {
    if (!source || disabled || working) return
    let bounds: { from: number; to: number }
    const tempo = Number(bpm)
    try { bounds = range(); if (!bpm.trim() || !Number.isInteger(tempo) || tempo < 40 || tempo > 160) throw new Error('原演奏速度须为 40–160 的整数 BPM') }
    catch (error) { setMessage((error as Error).message); return }
    await run(async signal => {
      setProgress(0); setMessage('正在提取所选片段音轨…')
      const [{ extractVideoClip }, { transcribeClip }] = await Promise.all([import('./videoImport'), import('./transcriptionJob')])
      const extracted = await extractVideoClip(source.file, bounds.from, bounds.to, signal, percent => { if (!signal.aborted) setProgress(Math.round(percent * 0.4)) })
      signal.throwIfAborted()
      setMessage(`正在识别主音轨第 ${extracted.channel} 声道的单音…`)
      const result = await transcribeClip(extracted.samples, { bpm: tempo, grid: 240, title: `${source.file.name.replace(/\.[^.]+$/, '').slice(0, 80)} ${bounds.from}–${bounds.to}秒` }, signal, percent => { if (!signal.aborted) setProgress(40 + Math.round(percent * 0.6)) })
      signal.throwIfAborted()
      setDraft(result); setMessage('视频片段草稿已生成，尚未加入曲谱库。请先核对音符，再加入编辑。')
    })
  }
  const invalidate = () => { pause(); setDraft(null); setMessage('片段或速度已改变，请重新生成草稿') }
  return <section className="video-panel" aria-label="本地视频辅助扒谱">
    <h2>本地视频辅助扒谱 <small>实验功能</small></h2>
    <p className="score-help">适合安静、无伴奏、一次一个音的演奏。读取主音轨，双声道选择片段中能量较高的一侧；不识别画面上的谱子、和弦或伴奏分离。</p>
    <div className="score-toolbar"><button disabled={disabled || working} onClick={() => picker.current?.click()}>选择本地视频</button>{working && <button onClick={cancel}>取消视频处理</button>}{source && <button disabled={disabled || working} onClick={() => { pause(); if (sourceURL.current) URL.revokeObjectURL(sourceURL.current); sourceURL.current = null; setSource(null); setDraft(null); setMessage('视频已移除，已保存曲谱不受影响') }}>移除当前视频</button>}</div>
    <input ref={picker} hidden type="file" accept=".mp4,.mov,.webm" aria-label="导入扒谱视频" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file) }}/>
    {source && <><p className="video-source">{source.file.name} · {source.info.duration.toFixed(2)} 秒 · {source.info.channels} 声道 · {source.info.codec}</p>
      <video ref={video} src={source.url} controls={!disabled && !working} playsInline preload="metadata" aria-label="原视频预览" onPlay={() => { if (disabled || working || !active) { pause(); return } onBegin(); setPlaying(true) }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); if (loop) void preview() }} onError={() => { pause(); setMessage('画面无法预览，可能是视频编码不受支持；若音轨已读取，仍可尝试生成草稿') }} onTimeUpdate={() => { const media = video.current; if (!media || media.paused) return; const from = Number(start), to = Number(end); if (media.currentTime >= to) { if (loop && Number.isFinite(from) && from >= 0 && to > from) media.currentTime = from; else pause() } }}/>
      <div className="transcription-options"><label>开始（秒）<input aria-label="视频开始秒数" type="number" min="0" max={source.info.duration} step="0.01" disabled={disabled || working} value={start} onChange={event => { setStart(event.target.value); invalidate() }}/></label><label>结束（秒）<input aria-label="视频结束秒数" type="number" min="0.25" max={source.info.duration} step="0.01" disabled={disabled || working} value={end} onChange={event => { setEnd(event.target.value); invalidate() }}/></label><label>原演奏速度<input aria-label="视频扒谱速度" type="number" min="40" max="160" step="1" disabled={disabled || working} value={bpm} onChange={event => { setBpm(event.target.value); invalidate() }}/></label></div>
      <div className="score-toolbar"><button disabled={disabled || working} onClick={() => { setStart((video.current?.currentTime ?? 0).toFixed(2)); invalidate() }}>当前位置设为起点</button><button disabled={disabled || working} onClick={() => { setEnd((video.current?.currentTime ?? 0).toFixed(2)); invalidate() }}>当前位置设为终点</button><label className="video-loop"><input aria-label="循环视频片段" type="checkbox" disabled={disabled || working} checked={loop} onChange={event => setLoop(event.target.checked)}/>循环预览片段</label><button disabled={disabled || working} onClick={() => void preview()}>预览所选片段</button><button disabled={!playing} onClick={pause}>停止视频预览</button><button disabled={disabled || working || full} onClick={() => void analyze()}>生成视频扒谱草稿</button></div></>}
    {progress !== null && <progress aria-label="视频处理进度" max={100} value={progress}/>}
    <p className="video-message" role="status">{message}</p>
    {draft && <div className="video-draft"><p>{draft.score.notes.filter(note => note.midi !== null).length} 个音符 · {draft.score.meters.length} 小节 · {draft.bpm} BPM</p><p className="score-help">稳定音高覆盖 {draft.detectedPercent}%（不是准确率）；首尾裁去约 {draft.trimmedSeconds.toFixed(2)} 秒。按 4/4 拍、十六分音符网格生成，音高和时值需人工校对。</p><ul>{draft.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><p className="video-draft-notes">{draft.score.notes.slice(0, 24).map(note => `${note.midi === null ? '休' : noteName(note.midi)}(${note.ticks / 960}拍)`).join(' · ')}{draft.score.notes.length > 24 ? ' …' : ''}</p><button disabled={disabled || full || working} onClick={() => { pause(); onBegin(); if (onImport(draft.score, draft.bpm)) { setDraft(null); setMessage('视频草稿已加入曲谱库，可在上方试听、修改音高和时值，再导出练习谱') } else setMessage('未能保存，草稿仍保留。请检查本机存储空间及曲谱库容量后重试') }}>将视频草稿加入曲谱库</button></div>}
    {full && <p className="score-help">曲谱库已满（20 份），无法新增草稿。</p>}
    <p className="score-help">支持 MP4、MOV、WebM 容器，具体音视频编码取决于浏览器。文件上限 100 MB、10 分钟；每次识别 0.25–20 秒。预览会关闭麦克风，练习前请重新开始监听。网页视频链接请先收藏，本功能需选择本地文件。原视频与未保存草稿不会进入完整备份，刷新后须重新选择。</p>
  </section>
}
