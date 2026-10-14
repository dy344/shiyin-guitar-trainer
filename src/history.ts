export type PracticeRecord = {
  id: string; scoreId: string; title: string; savedAt: string
  start: number; end: number; bpm: number; tolerance: number
  hits: number; rests: number; corrections: number; laps: number; completed: boolean
}
export const historyKey = 'shiyin.practice-history.v1'
export function parseHistory(raw: string | null): PracticeRecord[] {
  if (raw === null) return []
  const parsed = JSON.parse(raw)
  if (parsed?.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > 100) throw new Error('练习历史格式无效，原数据未覆盖')
  const ids = new Set<string>()
  for (const record of parsed.records) {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id) || typeof record.scoreId !== 'string' || typeof record.title !== 'string' || record.title.length > 120 || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt)) || typeof record.completed !== 'boolean') throw new Error('练习历史包含无效记录，原数据未覆盖')
    ids.add(record.id)
    for (const key of ['start', 'end', 'bpm', 'tolerance', 'hits', 'rests', 'corrections', 'laps']) if (!Number.isSafeInteger(record[key]) || record[key] < 0) throw new Error('练习历史数值无效，原数据未覆盖')
    if (record.start > record.end || record.end >= 2000 || record.bpm < 30 || record.bpm > 200 || record.tolerance < 1 || record.tolerance > 50) throw new Error('练习历史范围无效，原数据未覆盖')
  }
  return parsed.records
}
export function upsertHistory(records: PracticeRecord[], record: PracticeRecord): PracticeRecord[] {
  const result = [record, ...records.filter(item => item.id !== record.id)].slice(0, 100)
  return parseHistory(JSON.stringify({ version: 1, records: result }))
}
