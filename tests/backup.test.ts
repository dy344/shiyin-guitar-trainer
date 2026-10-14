import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, parseBackup, recoveryKey, recoverInterruptedRestore, restoreBackup, scoresKey } from '../src/backup.ts'
import { exampleScore } from '../src/score.ts'
import { historyKey } from '../src/history.ts'
import type { PracticeRecord } from '../src/history.ts'
import { resourcesKey } from '../src/resources.ts'
import type { LearningResource } from '../src/resources.ts'

const record: PracticeRecord = { id: 'session', scoreId: 'ode-example', title: '练习', savedAt: '2026-10-02T01:00:00Z', start: 0, end: 1, bpm: 80, tolerance: 12, hits: 2, rests: 0, corrections: 0, laps: 1, completed: true }
function memoryStorage() {
  const map = new Map<string, string>()
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) }, removeItem: (key: string) => { map.delete(key) } }
}
test('full backup preserves scores and practice records exactly', () => {
  const backup = createBackup([exampleScore()], [record])
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup)
  const storage = memoryStorage()
  restoreBackup(storage, backup)
  assert.deepEqual(JSON.parse(storage.getItem(scoresKey)!), backup.scores)
  assert.deepEqual(JSON.parse(storage.getItem(historyKey)!).records, [record])
  assert.equal(storage.getItem(recoveryKey), null)
})
test('invalid, oversized, duplicate and unsupported backups fail before storage mutation', () => {
  const backup = createBackup([exampleScore()], [])
  const invalid = ['', '{', ' '.repeat(10_000_001), JSON.stringify({ ...backup, version: 3 }), JSON.stringify({ ...backup, resources: undefined }), JSON.stringify({ ...backup, scores: [] }), JSON.stringify({ ...backup, scores: [exampleScore(), exampleScore()] }), JSON.stringify({ ...backup, records: [{ ...record, hits: -1 }] }), JSON.stringify({ ...backup, records: [record, record] })]
  for (const raw of invalid) assert.throws(() => parseBackup(raw))
  const storage = memoryStorage()
  storage.setItem(scoresKey, 'old')
  assert.throws(() => restoreBackup(storage, { ...backup, scores: [] }))
  assert.equal(storage.getItem(scoresKey), 'old')
  assert.equal(storage.map.size, 1)
})

const resource: LearningResource = { id: 'video', title: '慢速教程', url: 'https://www.bilibili.com/video/example', kind: 'video', scoreId: 'ode-example', notes: '第 2 小节', status: 'learning', createdAt: '2026-10-03T01:00:00Z', updatedAt: '2026-10-03T02:00:00Z' }
test('version 2 backup includes resources and validates them before writing', () => {
  const backup = createBackup([exampleScore()], [record], [resource])
  assert.equal(backup.version, 2)
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup)
  const storage = memoryStorage()
  restoreBackup(storage, backup)
  assert.deepEqual(JSON.parse(storage.getItem(resourcesKey)!).resources, [resource])
  const original = [...storage.map]
  assert.throws(() => restoreBackup(storage, { ...backup, version: 2, resources: [{ ...resource, url: 'javascript:alert(1)' }] }))
  assert.deepEqual([...storage.map], original)
})
test('version 1 backup and legacy recovery journal preserve current resources', () => {
  const storage = memoryStorage()
  storage.setItem(resourcesKey, 'current resources')
  const backup = parseBackup(JSON.stringify({ ...createBackup([exampleScore()], []), version: 1, resources: undefined }))
  restoreBackup(storage, backup)
  assert.equal(storage.getItem(resourcesKey), 'current resources')
  storage.setItem(recoveryKey, JSON.stringify({ version: 1, scores: null, history: null }))
  recoverInterruptedRestore(storage)
  assert.equal(storage.getItem(resourcesKey), 'current resources')
})
test('third-store failure rolls all three stores back and interrupted restore recovers resources', () => {
  const storage = memoryStorage()
  for (const key of [scoresKey, historyKey, resourcesKey]) storage.setItem(key, `original ${key}`)
  const original = [...storage.map]
  let fail = true
  const unreliable = { ...storage, setItem: (key: string, value: string) => {
    if (key === resourcesKey && fail) { fail = false; throw new Error('quota') }
    storage.setItem(key, value)
  } }
  assert.throws(() => restoreBackup(unreliable, createBackup([exampleScore()], [], [resource])), /已回滚/)
  assert.deepEqual([...storage.map], original)
  storage.setItem(resourcesKey, 'partial')
  storage.setItem(recoveryKey, JSON.stringify({ version: 1, scores: null, history: null, resources: 'before restore' }))
  recoverInterruptedRestore(storage)
  assert.equal(storage.getItem(resourcesKey), 'before restore')
  storage.setItem(recoveryKey, JSON.stringify({ version: 1, scores: null, history: null, resources: [] }))
  assert.throws(() => recoverInterruptedRestore(storage), /无效/)
  assert.equal(storage.getItem(resourcesKey), 'before restore')
})
test('partial restore write failure rolls both stores back', () => {
  const storage = memoryStorage()
  storage.setItem(scoresKey, 'original scores')
  storage.setItem(historyKey, 'original history')
  let fail = true
  const unreliable = { ...storage, setItem: (key: string, value: string) => {
    if (key === historyKey && fail) { fail = false; throw new Error('quota') }
    storage.setItem(key, value)
  } }
  assert.throws(() => restoreBackup(unreliable, createBackup([exampleScore()], [])), /已回滚/)
  assert.equal(storage.getItem(scoresKey), 'original scores')
  assert.equal(storage.getItem(historyKey), 'original history')
  assert.equal(storage.getItem(recoveryKey), null)
})
test('journal failure does not touch originals, rollback handles initially absent keys', () => {
  const storage = memoryStorage()
  assert.throws(() => restoreBackup({ ...storage, setItem: () => { throw new Error('unavailable') } }, createBackup([exampleScore()], [])))
  assert.equal(storage.map.size, 0)
  const failHistory = { ...storage, setItem: (key: string, value: string) => { if (key === historyKey) throw new Error('quota'); storage.setItem(key, value) } }
  assert.throws(() => restoreBackup(failHistory, createBackup([exampleScore()], [])), /已回滚/)
  assert.equal(storage.map.size, 0)
})
test('interrupted restore recovers on next load and rollback failure retains journal', () => {
  const storage = memoryStorage()
  storage.setItem(scoresKey, 'partial')
  storage.setItem(recoveryKey, JSON.stringify({ version: 1, scores: 'original', history: null }))
  assert.equal(recoverInterruptedRestore(storage), true)
  assert.equal(storage.getItem(scoresKey), 'original')
  assert.equal(recoverInterruptedRestore(storage), false)
  const broken = { ...storage, setItem: (key: string, value: string) => { if (key !== recoveryKey) throw new Error('quota'); storage.setItem(key, value) } }
  assert.throws(() => restoreBackup(broken, createBackup([exampleScore()], [])), /回滚也失败/)
  assert.notEqual(storage.getItem(recoveryKey), null)
})
