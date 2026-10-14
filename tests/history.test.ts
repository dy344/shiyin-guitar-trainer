import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHistory, upsertHistory } from '../src/history.ts'
import type { PracticeRecord } from '../src/history.ts'
const record: PracticeRecord = { id: 'session', scoreId: 'score', title: '测试', savedAt: '2026-10-02T01:00:00Z', start: 0, end: 5, bpm: 80, tolerance: 12, hits: 2, rests: 0, corrections: 1, laps: 0, completed: false }
test('empty history and save-load roundtrip', () => {
  assert.deepEqual(parseHistory(null), [])
  assert.deepEqual(parseHistory(JSON.stringify({ version: 1, records: [record] })), [record])
})
test('same session updates rather than duplicates, recent records limited to 100', () => {
  let list = upsertHistory([record], { ...record, hits: 3 })
  assert.equal(list.length, 1)
  assert.equal(list[0].hits, 3)
  for (let i = 0; i < 110; i++) list = upsertHistory(list, { ...record, id: `session-${i}` })
  assert.equal(list.length, 100)
  assert.equal(list[0].id, 'session-109')
})
test('corrupt and invalid historical data is rejected', () => {
  for (const raw of ['{', '{}', JSON.stringify({ version: 1, records: [{ ...record, hits: -1 }] }), JSON.stringify({ version: 1, records: [record, record] }), JSON.stringify({ version: 1, records: [{ ...record, savedAt: 'bad' }] })]) assert.throws(() => parseHistory(raw))
})
