export const resourcesKey = 'shiyin.learning-resources.v1'
export type ResourceKind = 'score' | 'tutorial' | 'video'
export type ResourceStatus = 'todo' | 'learning' | 'done'
export type LearningResource = { id: string; title: string; url: string; kind: ResourceKind; status: ResourceStatus; scoreId: string | null; notes: string; createdAt: string; updatedAt: string }
export function normalizeResourceURL(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value.trim()) || Array.from(value).some(character => character.charCodeAt(0) < 32)) throw new Error('请粘贴完整的 https:// 网址，长度不超过 2048 字符')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('网址格式无效') }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('网址须使用 HTTPS，且不能包含账号和密码')
  if (url.href.length > 2048) throw new Error('网址过长，请使用原始页面链接')
  return url.href
}
export function parseResources(raw: string | null): LearningResource[] {
  if (raw === null) return []
  if (raw.length > 500_000) throw new Error('学习资料数据过大，原数据未覆盖')
  const value = JSON.parse(raw)
  if (value?.version !== 1 || !Array.isArray(value.resources) || value.resources.length > 100) throw new Error('学习资料格式无效，原数据未覆盖')
  const ids = new Set<string>(), urls = new Set<string>()
  return value.resources.map((item: LearningResource) => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 || !['score','tutorial','video'].includes(item.kind) || !['todo','learning','done'].includes(item.status) || !(item.scoreId === null || typeof item.scoreId === 'string' && item.scoreId.length > 0 && item.scoreId.length <= 100) || typeof item.notes !== 'string' || item.notes.length > 1000 || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('学习资料包含无效内容，原数据未覆盖')
    const url = normalizeResourceURL(item.url)
    if (urls.has(url)) throw new Error('学习资料包含重复网址，原数据未覆盖')
    ids.add(item.id); urls.add(url)
    return { id: item.id, title: item.title.trim(), url, kind: item.kind, status: item.status, scoreId: item.scoreId, notes: item.notes, createdAt: item.createdAt, updatedAt: item.updatedAt }
  })
}
export function saveResource(resources: LearningResource[], resource: LearningResource): LearningResource[] {
  const valid = parseResources(JSON.stringify({ version: 1, resources: [resource] }))[0]
  if (resources.some(item => item.url === valid.url && item.id !== valid.id)) throw new Error('这个网址已收藏，请编辑列表中的原资料')
  return parseResources(JSON.stringify({ version: 1, resources: [valid, ...resources.filter(item => item.id !== valid.id)] }))
}
export type SearchLink = { name: string; url: string; description: string }
export function resourceSearch(query: string, arrangement: 'melody' | 'fingerstyle' | 'chords'): SearchLink[] {
  const title = query.trim().replace(/\s+/g, ' ')
  if (!title || title.length > 120 || !['melody','fingerstyle','chords'].includes(arrangement)) throw new Error('请输入 1–120 字的歌名，并选择有效的曲谱类型')
  const label = { melody: '单音旋律', fingerstyle: '指弹', chords: '弹唱' }[arrangement]
  const text = `${title} 吉他 ${label}`
  const url = (base: string, key: string, value: string) => { const target = new URL(base); target.searchParams.set(key, value); return target.href }
  return [
    { name: '百度找曲谱', url: url('https://www.baidu.com/s', 'wd', `${text} 曲谱 MusicXML MXL`), description: '查找曲谱来源；选择适合自己的版本。' },
    { name: 'MuseScore 曲谱', url: url('https://musescore.com/sheetmusic', 'text', `${title} guitar ${arrangement === 'fingerstyle' ? 'fingerstyle' : arrangement === 'chords' ? 'chords' : 'melody'}`), description: '查看曲谱；下载条件和格式以网站为准。' },
    { name: 'B站演奏与教程', url: url('https://search.bilibili.com/all', 'keyword', `${text} 教程 慢速`), description: '查找示范、指法讲解和慢速教程。' }
  ]
}
