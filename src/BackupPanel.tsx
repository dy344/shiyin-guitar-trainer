import { useRef, useState } from 'react'
import type { Score } from './score'
import { createBackup, parseBackup, restoreBackup } from './backup'
import type { LibraryBackup } from './backup'
import { historyKey, parseHistory } from './history'
import { parseResources, resourcesKey } from './resources'

export default function BackupPanel({ scores, disabled, exportBlocked, onPause, onBusy, onRestore, onFailure }: { scores: Score[]; disabled: boolean; exportBlocked: boolean; onPause: () => void; onBusy: (busy: boolean) => void; onRestore: (scores: Score[]) => void; onFailure: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<LibraryBackup | null>(null)
  const [message, setMessage] = useState('完整备份包含所有曲谱、已保存练习记录和学习资料收藏，不包含录音或未保存的本次统计。')
  const [reading, setReading] = useState(false)
  const download = () => {
    onPause()
    try {
      const backup = createBackup(scores, parseHistory(localStorage.getItem(historyKey)), parseResources(localStorage.getItem(resourcesKey)))
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `拾音完整备份-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`已发起下载：${backup.scores.length} 份曲谱、${backup.records.length} 条练习记录、${backup.version === 2 ? backup.resources.length : 0} 条学习资料。请确认文件已保存。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '备份导出失败') }
  }
  const read = async (file: File | undefined) => {
    if (!file) return
    onPause()
    onBusy(true)
    setReading(true)
    try {
      if (!/\.json$/i.test(file.name) || file.size > 10_000_000) throw new Error('请选择不超过 10 MB 的 JSON 完整备份')
      setPending(parseBackup(await file.text()))
      setMessage('已校验备份，尚未修改本机数据。建议先下载当前完整备份。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法读取备份')
      onBusy(false)
    } finally { setReading(false); if (input.current) input.current.value = '' }
  }
  const confirm = () => {
    if (!pending) return
    try {
      restoreBackup(localStorage, pending)
      onRestore(pending.scores)
      setMessage(`恢复完成：${pending.scores.length} 份曲谱、${pending.records.length} 条记录。${pending.version === 2 ? `已恢复 ${pending.resources.length} 条学习资料。` : '旧版备份不含学习资料，已保留本机收藏。'}`)
      setPending(null)
      onBusy(false)
    } catch (error) { onFailure(); setMessage(error instanceof Error ? error.message : '恢复失败，未完成写入') }
  }
  return <section className="backup-panel" aria-label="备份与恢复">
    <h2>备份与恢复</h2>
    <div className="score-toolbar"><button disabled={exportBlocked || reading || (disabled && !pending)} onClick={download}>下载完整备份</button><button disabled={disabled || reading || pending !== null} onClick={() => { onPause(); input.current?.click() }}>选择备份恢复</button></div>
    <input ref={input} aria-label="选择完整备份文件" hidden type="file" accept=".json" onChange={event => void read(event.target.files?.[0])}/>
    <p className="backup-message" role="status">{message}</p>
    {pending && <div className="restore-confirm" role="group" aria-label="确认恢复备份"><p>备份时间：{new Date(pending.exportedAt).toLocaleString('zh-CN')}。将用备份中的 {pending.scores.length} 份曲谱和 {pending.records.length} 条记录，替换本机全部 {scores.length} 份曲谱及全部已保存记录；未保存统计和撤销历史会清空。{pending.version === 2 ? `学习资料也将全部替换为备份中的 ${pending.resources.length} 条。` : '旧版备份不含学习资料，保留本机现有收藏。'}此操作不合并曲谱与记录。</p><div className="score-toolbar"><button onClick={confirm}>确认替换并恢复</button><button onClick={() => { setPending(null); onBusy(false); setMessage('已取消，本机数据未修改') }}>取消恢复</button></div></div>}
  </section>
}
