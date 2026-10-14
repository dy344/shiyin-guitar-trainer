import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeResourceURL, parseResources, resourceSearch, saveResource } from '../src/resources.ts'
import type { LearningResource } from '../src/resources.ts'

const item: LearningResource = { id: 'tutorial', title: '慢速教学', url: 'https://example.com/watch?id=1', kind: 'tutorial', status: 'todo', scoreId: null, notes: '先练第一小节', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
test('URLs are canonical HTTPS links without credentials, controls or executable schemes', () => {
  assert.equal(normalizeResourceURL(' HTTPS://EXAMPLE.COM '), 'https://example.com/')
  assert.equal(normalizeResourceURL('https://example.com/中文'), 'https://example.com/%E4%B8%AD%E6%96%87')
  for (const raw of ['', null, 1, 'http://example.com', 'javascript:alert(1)', 'file:///C:/test', 'https://user:pass@example.com', 'https://example.com/\npage', 'https://', `https://example.com/${'a'.repeat(2048)}`]) assert.throws(() => normalizeResourceURL(raw))
})
test('search links encode Chinese, spaces and reserved characters instead of injecting parameters', () => {
  const query = '  周杰伦 &晴天?  '
  const links = resourceSearch(query, 'fingerstyle')
  assert.equal(links.length, 3)
  const baidu = new URL(links[0].url)
  assert.equal(baidu.searchParams.get('wd'), '周杰伦 &晴天? 吉他 指弹 曲谱 MusicXML MXL')
  assert.equal([...baidu.searchParams].length, 1)
  assert.match(new URL(links[1].url).searchParams.get('text')!, /fingerstyle$/)
  assert.match(new URL(links[2].url).searchParams.get('keyword')!, /教程 慢速$/)
  for (const link of links) assert.equal(normalizeResourceURL(link.url), link.url)
  for (const query of ['', '  ', 'x'.repeat(121)]) assert.throws(() => resourceSearch(query, 'melody'))
  assert.throws(() => resourceSearch('曲名', 'invalid' as 'melody'))
})
test('resource storage validates every field and rejects corrupt or duplicated data', () => {
  assert.deepEqual(parseResources(null), [])
  const valid = parseResources(JSON.stringify({ version: 1, resources: [{ ...item, title: ' 慢速教学 ', unknown: true }] }))
  assert.deepEqual(valid, [item])
  for (const raw of ['', '{', ' '.repeat(500001), JSON.stringify({ version: 2, resources: [] }), JSON.stringify({ version: 1, resources: [item, item] })]) assert.throws(() => parseResources(raw))
  for (const changed of [{ id: '' }, { title: ' ' }, { kind: 'bad' }, { status: 'bad' }, { notes: 'x'.repeat(1001) }, { scoreId: '' }, { createdAt: 'bad' }, { url: 'javascript:alert(1)' }]) assert.throws(() => parseResources(JSON.stringify({ version: 1, resources: [{ ...item, ...changed }] })))
})
test('save, edit and delete preserve resource IDs, reject duplicates and enforce the 100 limit', () => {
  const first = saveResource([], item)
  const edited = saveResource(first, { ...item, notes: '已完成第一小节', status: 'learning' })
  assert.equal(edited.length, 1)
  assert.equal(edited[0].status, 'learning')
  assert.equal(edited[0].id, item.id)
  assert.throws(() => saveResource(edited, { ...item, id: 'duplicate' }), /已收藏/)
  const full = Array.from({ length: 100 }, (_, index) => ({ ...item, id: `item-${index}`, url: `https://example.com/${index}` }))
  assert.equal(saveResource(full, { ...full[0], notes: 'edited' }).length, 100)
  assert.throws(() => saveResource(full, item))
  assert.equal(saveResource(full.slice(1), item).length, 100)
})
