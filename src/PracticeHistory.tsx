import { useState } from 'react'
import type { Score } from './score'
import type { PracticeOptions, PracticeState } from './practice'
import { historyKey, parseHistory, upsertHistory } from './history'
import type { PracticeRecord } from './history'

function initialHistory() {
  try { return { records: parseHistory(localStorage.getItem(historyKey)), error: '' } }
  catch { return { records: [] as PracticeRecord[], error: '历史数据无法读取，原数据未覆盖。请勿清除浏览器数据。' } }
}
export default function PracticeHistory({ state, options, score, blocked = false }: { state: PracticeState; options: PracticeOptions; score: Score; blocked?: boolean }) {
  const [initial] = useState(initialHistory)
  const [records, setRecords] = useState(initial.records)
  const [message, setMessage] = useState(initial.error)
  const [expanded, setExpanded] = useState(false)
  const hasResults = state.hits + state.rests + state.corrections > 0
  const save = () => {
    try {
      const record: PracticeRecord = { id: state.runId, scoreId: score.id, title: score.title, savedAt: new Date().toISOString(), start: options.start, end: options.end, bpm: options.bpm, tolerance: options.tolerance, hits: state.hits, rests: state.rests, corrections: state.corrections, laps: state.laps, completed: state.phase === 'complete' }
      const next = upsertHistory(parseHistory(localStorage.getItem(historyKey)), record)
      localStorage.setItem(historyKey, JSON.stringify({ version: 1, records: next }))
      setRecords(next)
      setMessage('本次记录已保存；再次保存同一次练习会更新记录，不会重复新增')
    } catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : '浏览器存储不可用'}。当前统计仍在页面中。`) }
  }
  const download = () => {
    try {
      const raw = localStorage.getItem(historyKey)
      if (!raw) { setMessage('尚无已保存的记录'); return }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = '拾音-练习记录.json'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('已发起导出，请检查浏览器下载列表')
    } catch { setMessage('导出失败，浏览器存储或下载不可用') }
  }
  return <section className="practice-history" aria-label="练习记录">
    <h2>练习记录</h2>
    <div className="score-toolbar"><button onClick={save} disabled={blocked || !hasResults || state.phase === 'running'}>保存本次记录</button><button onClick={() => setExpanded(!expanded)}>{expanded ? '收起历史' : `查看历史（${records.length}）`}</button><button onClick={download}>导出记录</button></div>
    <p className="history-message" role="status">{message}</p>
    <p className="score-help">暂停或完成跟练后手动保存，保留最近 100 条。记录保存在当前浏览器和地址中；刷新前请保存，定期导出备份。记录不包含录音。</p>
    {expanded && (records.length === 0 ? <p>还没有已保存的练习。</p> : <ol className="history-list">{records.map(record => <li key={record.id}><strong>{record.title || '未命名曲谱'}</strong><time dateTime={record.savedAt}>{new Date(record.savedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</time><p>第 {record.start + 1}–{record.end + 1} 音 · 命中 {record.hits} · 稳定偏差 {record.corrections} · 休止 {record.rests} · 完成 {record.laps} 轮</p><small>±{record.tolerance} 音分 · 休止 {record.bpm} BPM · {record.completed ? '整段完成' : '阶段记录'}</small></li>)}</ol>)}
  </section>
}
