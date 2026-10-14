import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Score } from './score'
import { exampleScore, exportMusicXML, noteFrequency, noteName, positions, validateScore, withPitch } from './score'
import { createPractice, practiceReducer } from './practice'
import type { PitchSample, PracticeOptions } from './practice'
import PracticeControls from './PracticeControls'
import PracticeHistory from './PracticeHistory'
import type { PlaybackView } from './playback'
import BackupPanel from './BackupPanel'
import TranscriptionPanel from './TranscriptionPanel'
import VideoPanel from './VideoPanel'
import FullScore from './FullScore'
import LearningPanel from './LearningPanel'
import { parseResources, resourcesKey } from './resources'
import type { LearningResource } from './resources'
import { recoverInterruptedRestore, recoveryKey, scoresKey } from './backup'
import { editNote, emptyEditHistory, measureTotals, rememberEdit, travelEdit } from './editor'

export type PracticeTarget = { note: string; frequency: number | null; string: number | null; fret: number | null; tolerance?: number }
const storageKey = scoresKey
function loadLibrary(): { scores: Score[]; message: string; blocked?: boolean } {
  try {
    recoverInterruptedRestore(localStorage)
    const saved = localStorage.getItem(storageKey)
    if (!saved) return { scores: [exampleScore()], message: '可先用示例片段练习，也可导入自己的曲谱' }
    const data = JSON.parse(saved)
    if (!Array.isArray(data) || data.length < 1 || data.length > 20) throw new Error('格式无效')
    const scores = data.map(validateScore)
    if (new Set(scores.map(s => s.id)).size !== scores.length) throw new Error('曲谱编号重复')
    return { scores, message: '已恢复本机曲谱' }
  } catch { return { scores: [exampleScore()], blocked: true, message: '本地曲谱或恢复保护副本无法读取，已加载只读示例；原存储尚未修改。请保留浏览器数据，或用有效完整备份恢复。' } }
}

function loadResources(): { resources: LearningResource[]; error: string } {
  try { return { resources: parseResources(localStorage.getItem(resourcesKey)), error: '' } }
  catch { return { resources: [], error: '本机学习资料无法读取，原存储未覆盖；请保留浏览器数据，或到曲谱练习恢复有效的新版完整备份。' } }
}

export default function ScorePanel({ onTarget, sample, enabled, playback, onPlay, onStopPlayback, onPrepareTranscription, studyMode, onStudyPractice, visible }: { onTarget: (target: PracticeTarget) => void; sample: PitchSample | null; enabled: boolean; playback: PlaybackView; onPlay: (score: Score, start: number, end: number, bpm: number, metronome: boolean) => void; onStopPlayback: () => void; onPrepareTranscription: () => void; studyMode: boolean; onStudyPractice: () => void; visible: boolean }) {
  const [initial] = useState(loadLibrary)
  const [resourceInitial] = useState(loadResources)
  const [learningResources, setLearningResources] = useState(resourceInitial.resources)
  const [resourceError, setResourceError] = useState(resourceInitial.error)
  const changeResources = useCallback((mutate: (current: LearningResource[]) => LearningResource[]): string | null => {
    try {
      if (localStorage.getItem(recoveryKey)) throw new Error('恢复保护副本尚未处理，请先重新打开页面或完成备份恢复')
      const next = parseResources(JSON.stringify({ version: 1, resources: mutate(parseResources(localStorage.getItem(resourcesKey))) }))
      localStorage.setItem(resourcesKey, JSON.stringify({ version: 1, resources: next }))
      setLearningResources(next)
      return null
    } catch (error) { return error instanceof Error ? error.message : '资料保存失败，原存储未覆盖' }
  }, [])
  const [library, setLibrary] = useState(initial.scores)
  const [active, setActive] = useState(0)
  const [practice, dispatch] = useReducer(practiceReducer, undefined, () => createPractice())
  const [options, setOptions] = useState<PracticeOptions>(() => ({ start: 0, end: initial.scores[0].notes.length - 1, loop: false, bpm: initial.scores[0].tempo ?? 80, tolerance: 12 }))
  const cursor = playback.phase === 'playing' && playback.index !== null ? playback.index : practice.cursor
  const [previewBpm, setPreviewBpm] = useState(initial.scores[0].tempo ?? 80)
  const [metronome, setMetronome] = useState(false)
  const setCursor = useCallback((index: number) => dispatch({ type: 'seek', cursor: index }), [])
  const preparePrint = useCallback(() => { dispatch({ type: 'pause' }); onStopPlayback() }, [onStopPlayback])
  const [message, setMessage] = useState(initial.message)
  const [busy, setBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [transcriptionBusy, setTranscriptionBusy] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(initial.blocked ?? false)
  const [editHistory, setEditHistory] = useState(emptyEditHistory)
  const [historyRevision, setHistoryRevision] = useState(0)
  const editingLocked = storageBlocked || busy || backupBusy || transcriptionBusy || playback.phase !== 'idle'
  const fileInput = useRef<HTMLInputElement>(null)
  const score = library[active]
  const note = score.notes[cursor]
  const pageStart = Math.floor(cursor / 16) * 16
  const resetForScore = (next: Score) => {
    dispatch({ type: 'reset', cursor: 0 })
    setOptions(previous => ({ ...previous, start: 0, end: next.notes.length - 1, bpm: next.tempo ?? 80 }))
    setPreviewBpm(next.tempo ?? 80)
  }
  useEffect(() => {
    if (!enabled) { dispatch({ type: 'pause' }); return }
    if (sample) dispatch({ type: 'sample', sample, notes: score.notes, options })
  }, [sample, enabled, score.notes, options])
  useEffect(() => {
    const handleVisibility = () => { if (document.hidden) dispatch({ type: 'pause' }) }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
  useEffect(() => {
    onTarget({ note: note.midi === null ? '休止' : noteName(note.midi), frequency: note.midi === null ? null : noteFrequency(note.midi), string: note.string, fret: note.fret, tolerance: options.tolerance })
  }, [note, onTarget, options.tolerance])
  const persist = (next: Score[]) => {
    setLibrary(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setMessage('已保存到本机') }
    catch { setMessage('本机保存失败，修改仍在当前窗口中，请立即导出备份') }
  }
  const apply = (next: Score, nextCursor: number) => {
    dispatch({ type: 'reset', cursor: nextCursor })
    if (next.notes.length !== score.notes.length) setOptions(previous => ({ ...previous, start: 0, end: next.notes.length - 1 }))
    persist(library.map((item, index) => index === active ? next : item))
  }
  const update = (next: Score, nextCursor = cursor) => {
    if (JSON.stringify(next) === JSON.stringify(score)) return
    setEditHistory(rememberEdit(editHistory, { score, cursor }))
    apply(next, nextCursor)
  }
  const changeNote = (action: 'insert' | 'rest' | 'delete' | 'duration', ticks?: number) => {
    try { const next = editNote(score, cursor, action, ticks); update(next.score, next.cursor) }
    catch (error) { setMessage(error instanceof Error ? error.message : '编辑失败') }
  }
  const travel = (direction: 'undo' | 'redo') => {
    const result = travelEdit(editHistory, { score, cursor }, direction)
    if (result) { setEditHistory(result.history); apply(result.next.score, result.next.cursor) }
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    dispatch({ type: 'pause' })
    setBusy(true)
    try {
      if (library.length >= 20) throw new Error('本地最多保存 20 份曲谱')
      const { parseScoreFile } = await import('./scoreImport')
      const imported = await parseScoreFile(file)
      persist([...library, imported])
      setActive(library.length)
      setEditHistory(emptyEditHistory())
      resetForScore(imported)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败，请检查文件') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  const download = () => {
    dispatch({ type: 'pause' })
    let url: string | undefined
    try {
      url = URL.createObjectURL(new Blob([exportMusicXML(score)], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${score.title.replace(/[\\/:*?"<>|]/g, '_') || '练习曲'}.musicxml`
      anchor.click()
      setMessage('已发起导出；导出的是旋律练习谱，不包含原谱装饰、歌词及版式')
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') }
    finally { if (url) { const created = url; window.setTimeout(() => URL.revokeObjectURL(created), 1000) } }
  }
  const positionOptions = note.midi === null ? [] : positions(note.midi)
  const durations = [{ ticks: 240, label: '十六分 · 1/4 拍' }, { ticks: 480, label: '八分 · 1/2 拍' }, { ticks: 720, label: '附点八分 · 3/4 拍' }, { ticks: 960, label: '四分 · 1 拍' }, { ticks: 1440, label: '附点四分 · 1.5 拍' }, { ticks: 1920, label: '二分 · 2 拍' }, { ticks: 2880, label: '附点二分 · 3 拍' }, { ticks: 3840, label: '全音符 · 4 拍' }]
  const totals = measureTotals(score)
  const bar = totals[note.measure]
  const unbalanced = totals.filter(item => item.used !== item.expected).length
  return <><div data-score-editor hidden={studyMode}><section className="score-panel" aria-label="曲谱编辑与练习">
    <div className="score-toolbar"><label>我的曲谱<select aria-label="我的曲谱" value={active} disabled={editingLocked} onChange={event => { const index = Number(event.target.value); setActive(index); setEditHistory(emptyEditHistory()); resetForScore(library[index]) }}>{library.map((item, index) => <option value={index} key={item.id}>{item.title || '未命名曲谱'}</option>)}</select></label><button disabled={editingLocked} onClick={() => { dispatch({ type: 'pause' }); fileInput.current?.click() }}>{busy ? '正在导入…' : '导入 MusicXML / MXL'}</button><button onClick={download}>导出练习谱</button><input ref={fileInput} hidden type="file" accept=".musicxml,.xml,.mxl" aria-label="导入曲谱文件" onChange={event => void importFile(event.target.files?.[0])}/></div>
    <p className="score-notice" role="status">{message}</p>
    <label className="score-title">曲名<input aria-label="曲名" maxLength={120} value={score.title} disabled={editingLocked} onChange={event => update({ ...score, title: event.target.value })}/></label>
    <section className="preview-controls" aria-label="旋律示范"><h2>先听再练</h2><div className="score-toolbar"><label>示范速度<select aria-label="示范速度" disabled={editingLocked} value={previewBpm} onChange={event => setPreviewBpm(Number(event.target.value))}>{[...new Set([40,60,80,100,120,160,previewBpm])].sort((a, b) => a - b).map(bpm => <option value={bpm} key={bpm}>{bpm} BPM</option>)}</select></label><label className="preview-click"><input type="checkbox" aria-label="示范节拍声" disabled={editingLocked} checked={metronome} onChange={event => setMetronome(event.target.checked)}/>加节拍声</label><button disabled={editingLocked} onClick={() => { dispatch({ type: 'pause' }); onPlay(score, options.start, options.end, previewBpm, metronome) }}>播放所选片段</button><button disabled={editingLocked || note.midi === null} onClick={() => { dispatch({ type: 'pause' }); onPlay(score, cursor, cursor, previewBpm, false) }}>听当前音</button><button disabled={playback.phase === 'idle'} onClick={onStopPlayback}>停止示范</button></div><p className="preview-status" role="status">{playback.message}</p><p className="score-help">示范范围：第 {options.start + 1}–{options.end + 1} 音，可在下方自动跟练区设置。合成参考音按曲谱时值播放，节拍声每四分音符一次。播放会关闭麦克风，结束后需重新开始监听。</p></section>
    <p className="score-help">数字为品位，0 为空弦；指法可修改。可手动选音，或在下方启动自动跟练。编辑曲谱会重置本次统计。</p>
    <div className="score-scroll"><div className="score-tab" role="group" aria-label="六线谱">
      <div className="string-labels"><span>音符</span>{[1,2,3,4,5,6].map(string => <span key={string}>{string} 弦</span>)}<span>拍数</span></div>
      {score.notes.slice(pageStart, pageStart + 16).map((item, index) => <button disabled={editingLocked} aria-label={`第 ${pageStart + index + 1} 个${item.midi === null ? '休止符' : `音符 ${noteName(item.midi)}`}`} aria-pressed={cursor === pageStart + index} className={`score-column ${cursor === pageStart + index ? 'selected' : ''}`} key={pageStart + index} onClick={() => setCursor(pageStart + index)}><span>{pageStart + index + 1}</span>{[1,2,3,4,5,6].map(string => <span className="score-string" key={string}><b>{item.string === string ? item.fret : item.midi === null && string === 3 ? '休' : '\u00a0'}</b></span>)}<span>{Number((item.ticks / 960).toFixed(3))}</span></button>)}
    </div></div>
    <div className="score-toolbar"><button disabled={editingLocked || cursor === 0} onClick={() => setCursor(cursor - 1)}>上一音</button><span>{cursor + 1} / {score.notes.length} · 第 {note.measure + 1} 小节 · {score.meters[note.measure].beats}/{score.meters[note.measure].unit}</span><button disabled={editingLocked || cursor === score.notes.length - 1} onClick={() => setCursor(cursor + 1)}>下一音</button></div>
    <FullScore score={score} cursor={cursor} disabled={editingLocked} onSelect={setCursor} onPreparePrint={preparePrint}/>
    <PracticeControls state={practice} options={options} blocked={editingLocked} available={enabled && !editingLocked} total={score.notes.length} rest={note.midi === null} onOptions={next => { setOptions(next); dispatch({ type: 'reset', cursor: next.start }) }} onStart={() => { if (enabled && !editingLocked) dispatch({ type: 'start', options }) }} onPause={() => dispatch({ type: 'pause' })} onReset={() => dispatch({ type: 'reset', cursor: options.start })}/>
    <PracticeHistory key={historyRevision} state={practice} options={options} score={score} blocked={editingLocked}/>
    <div className="score-editor"><label>修改音高<select aria-label="修改音高" disabled={editingLocked} value={note.midi ?? 'rest'} onChange={event => { const updated = withPitch(note, event.target.value === 'rest' ? null : Number(event.target.value)); update({ ...score, notes: score.notes.map((item, index) => index === cursor ? updated : item) }) }}><option value="rest">休止符</option>{Array.from({ length: 49 }, (_, index) => index + 40).map(midi => <option key={midi} value={midi}>{noteName(midi)}</option>)}</select></label><label>选择指法<select aria-label="选择指法" disabled={editingLocked || note.midi === null} value={note.string === null ? '' : `${note.string}:${note.fret}`} onChange={event => { const [string, fret] = event.target.value.split(':').map(Number); update({ ...score, notes: score.notes.map((item, index) => index === cursor ? { ...item, string, fret } : item) }) }}>{note.midi === null ? <option value="">休止符无指法</option> : positionOptions.map(p => <option key={p.string} value={`${p.string}:${p.fret}`}>{p.string} 弦 · {p.fret} 品</option>)}</select></label></div>
    <section className="note-editing" aria-label="音符结构编辑"><h2>调整音符与时值</h2><div className="score-editor"><label>修改时值<select aria-label="修改时值" disabled={editingLocked} value={note.ticks} onChange={event => changeNote('duration', Number(event.target.value))}>{!durations.some(item => item.ticks === note.ticks) && <option value={note.ticks}>原谱时值 · {Number((note.ticks / 960).toFixed(3))} 拍</option>}{durations.map(item => <option key={item.ticks} value={item.ticks}>{item.label}</option>)}</select></label><button disabled={editingLocked || score.notes.length >= 2000} onClick={() => changeNote('insert')}>后插入音符</button><button disabled={editingLocked || score.notes.length >= 2000} onClick={() => changeNote('rest')}>后插入休止符</button><button disabled={editingLocked || score.notes.length === 1} onClick={() => changeNote('delete')}>删除当前音</button></div><div className="score-toolbar"><button disabled={editingLocked || !editHistory.past.length} onClick={() => travel('undo')}>撤销</button><button disabled={editingLocked || !editHistory.future.length} onClick={() => travel('redo')}>重做</button><span>当前窗口保留最近 50 步</span></div><p className="measure-status" role="status">第 {note.measure + 1} 小节：{Number((bar.used / 960).toFixed(3))} / {bar.expected / 960} 拍。{unbalanced ? `有 ${unbalanced} 个小节拍数与拍号不一致，请检查时值；弱起小节可有意不足拍。` : '所有小节拍数匹配。'}</p><p className="score-help">此处一拍按四分音符计。新增音符为一拍，默认沿用当前音高；不会自动跨小节重排。删空小节会移除该小节。增删后练习范围重置为全曲；编辑会清空本次统计，请先保存记录。切换曲谱、刷新或恢复备份会清空撤销历史。</p></section>
    <TranscriptionPanel disabled={editingLocked} full={library.length >= 20} onBusy={setTranscriptionBusy} onBegin={() => { dispatch({ type: 'pause' }); onPrepareTranscription() }} onImport={(imported, bpm) => { if (library.length >= 20 || editingLocked) return; persist([...library, validateScore(imported)]); setActive(library.length); setEditHistory(emptyEditHistory()); resetForScore(imported); setPreviewBpm(bpm); setOptions(previous => ({ ...previous, bpm })) }}/>
    <VideoPanel disabled={editingLocked} full={library.length >= 20} active={visible} listening={enabled} onBusy={setTranscriptionBusy} onBegin={() => { dispatch({ type: 'pause' }); onPrepareTranscription() }} onImport={(imported, bpm) => {
      if (library.length >= 20 || editingLocked) return false
      try {
        const next = [...library, validateScore(imported)]
        localStorage.setItem(storageKey, JSON.stringify(next))
        setLibrary(next); setActive(library.length); setEditHistory(emptyEditHistory()); resetForScore(imported); setPreviewBpm(bpm); setOptions(previous => ({ ...previous, bpm })); setMessage('视频草稿已保存到本机')
        return true
      } catch { setMessage('本机保存失败，视频草稿仍保留，请先下载备份或释放空间'); return false }
    }}/>
    <BackupPanel scores={library} exportBlocked={storageBlocked} disabled={busy || backupBusy || transcriptionBusy || playback.phase !== 'idle'} onPause={() => dispatch({ type: 'pause' })} onBusy={setBackupBusy} onFailure={() => { try { if (localStorage.getItem(recoveryKey)) setStorageBlocked(true) } catch { setStorageBlocked(true) } }} onRestore={next => { const restored = loadResources(); setLearningResources(restored.resources); setResourceError(restored.error); setStorageBlocked(false); setLibrary(next); setActive(0); resetForScore(next[0]); setEditHistory(emptyEditHistory()); setHistoryRevision(value => value + 1); setMessage('曲谱和已保存记录已从完整备份恢复') }}/>
    <p className="score-help">可导入 MusicXML/XML（2 MB 以内）或 MXL（10 MB 以内，内部曲谱不超过 2 MB）。支持单乐器、单声部旋律及休止符，保留音高、时值、小节和拍号；暂不支持和弦、连音延音线、反复记号及特殊调弦。请保留原谱文件。</p>
  </section></div><div data-learning-container hidden={!studyMode}><LearningPanel key={historyRevision} scores={library} active={active} resources={learningResources} error={resourceError} disabled={editingLocked} onChange={changeResources} onScore={index => { if (!library[index] || editingLocked) return; setActive(index); setEditHistory(emptyEditHistory()); resetForScore(library[index]) }} onPractice={(id, start, end, bpm) => { const index = library.findIndex(item => item.id === id); if (index < 0 || editingLocked) return; setActive(index); setEditHistory(emptyEditHistory()); dispatch({ type: 'reset', cursor: start }); setOptions(previous => ({ ...previous, start, end, loop: false, bpm })); setPreviewBpm(bpm); onStudyPractice() }}/></div></>
}
