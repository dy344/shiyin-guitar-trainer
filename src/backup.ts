import { validateScore } from './score.ts'
import type { Score } from './score.ts'
import { historyKey, parseHistory } from './history.ts'
import type { PracticeRecord } from './history.ts'
import { parseResources, resourcesKey } from './resources.ts'
import type { LearningResource } from './resources.ts'

export const scoresKey = 'shiyin.scores.v1'
export const recoveryKey = 'shiyin.before-restore.v1'
type BackupContent = { app: 'shiyin'; exportedAt: string; scores: Score[]; records: PracticeRecord[] }
export type LibraryBackup = BackupContent & ({ version: 1 } | { version: 2; resources: LearningResource[] })
type BackupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function parseBackup(raw: string): LibraryBackup {
  if (!raw.trim() || raw.length > 10_000_000) throw new Error('备份为空或超过 10 MB')
  const value = JSON.parse(raw)
  if (value?.app !== 'shiyin' || ![1, 2].includes(value.version) || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) || !Array.isArray(value.scores) || value.scores.length < 1 || value.scores.length > 20) throw new Error('不是有效的拾音完整备份（版本 1 或 2）')
  const scores: Score[] = value.scores.map(validateScore)
  if (scores.some(score => !score.id) || new Set(scores.map(score => score.id)).size !== scores.length) throw new Error('备份中的曲谱编号为空或重复')
  const records = parseHistory(JSON.stringify({ version: 1, records: value.records }))
  const content: BackupContent = { app: 'shiyin', exportedAt: value.exportedAt, scores, records }
  return value.version === 1 ? { ...content, version: 1 } : { ...content, version: 2, resources: parseResources(JSON.stringify({ version: 1, resources: value.resources })) }
}
export function createBackup(scores: Score[], records: PracticeRecord[], resources: LearningResource[] = []): LibraryBackup {
  return parseBackup(JSON.stringify({ app: 'shiyin', version: 2, exportedAt: new Date().toISOString(), scores, records, resources }))
}
export function recoverInterruptedRestore(storage: BackupStorage): boolean {
  const raw = storage.getItem(recoveryKey)
  if (raw === null) return false
  const snapshot = JSON.parse(raw)
  if (snapshot?.version !== 1 || !(snapshot.scores === null || typeof snapshot.scores === 'string') || !(snapshot.history === null || typeof snapshot.history === 'string') || ('resources' in snapshot && !(snapshot.resources === null || typeof snapshot.resources === 'string'))) throw new Error('恢复保护数据无效，请勿覆盖本机数据')
  if (snapshot.scores === null) storage.removeItem(scoresKey)
  else storage.setItem(scoresKey, snapshot.scores)
  if (snapshot.history === null) storage.removeItem(historyKey)
  else storage.setItem(historyKey, snapshot.history)
  if ('resources' in snapshot) {
    if (snapshot.resources === null) storage.removeItem(resourcesKey)
    else storage.setItem(resourcesKey, snapshot.resources)
  }
  storage.removeItem(recoveryKey)
  return true
}
export function restoreBackup(storage: BackupStorage, backup: LibraryBackup) {
  const valid = parseBackup(JSON.stringify(backup))
  recoverInterruptedRestore(storage)
  const snapshot = { version: 1, scores: storage.getItem(scoresKey), history: storage.getItem(historyKey), ...(valid.version === 2 ? { resources: storage.getItem(resourcesKey) } : {}) }
  storage.setItem(recoveryKey, JSON.stringify(snapshot))
  try {
    storage.setItem(scoresKey, JSON.stringify(valid.scores))
    storage.setItem(historyKey, JSON.stringify({ version: 1, records: valid.records }))
    if (valid.version === 2) storage.setItem(resourcesKey, JSON.stringify({ version: 1, resources: valid.resources }))
    storage.removeItem(recoveryKey)
  } catch {
    try { recoverInterruptedRestore(storage) }
    catch { throw new Error('恢复未完成，自动回滚也失败；保护副本仍保留，请勿继续编辑并重试恢复或重新打开页面') }
    throw new Error('恢复失败（可能是存储空间不足），已回滚到恢复前的数据')
  }
}
