import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Score } from './score'
import { normalizeResourceURL, resourceSearch, saveResource } from './resources'
import type { LearningResource, ResourceKind, ResourceStatus, SearchLink } from './resources'
import { studySections } from './study'

const kindLabels = { score: '曲谱', tutorial: '教程', video: '演奏视频' }
export default function LearningPanel({ scores, active, resources, error, disabled, onChange, onScore, onPractice }: { scores: Score[]; active: number; resources: LearningResource[]; error: string; disabled: boolean; onChange: (mutate: (current: LearningResource[]) => LearningResource[]) => string | null; onScore: (index: number) => void; onPractice: (id: string, start: number, end: number, bpm: number) => void }) {
  const [query, setQuery] = useState('')
  const [arrangement, setArrangement] = useState<'melody' | 'fingerstyle' | 'chords'>('melody')
  const [links, setLinks] = useState<SearchLink[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [url, setURL] = useState('')
  const [kind, setKind] = useState<ResourceKind>('score')
  const [scoreId, setScoreId] = useState('')
  const [notes, setNotes] = useState('')
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [removed, setRemoved] = useState<LearningResource | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const score = scores[active]
  const sections = useMemo(() => studySections(score), [score])
  const locked = disabled || !!error
  const clearForm = () => { setEditing(null); setTitle(''); setURL(''); setKind('score'); setScoreId(''); setNotes('') }
  const search = (event: FormEvent) => {
    event.preventDefault()
    try { setLinks(resourceSearch(query, arrangement)); setMessage('搜索入口已生成，点击后在对应网站查看实际结果。找到资源后，把网址收藏到下方。') }
    catch (caught) { setLinks([]); setMessage(caught instanceof Error ? caught.message : '请输入有效歌名') }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    try {
      const now = new Date().toISOString(), previous = resources.find(item => item.id === editing)
      const item: LearningResource = { id: editing ?? crypto.randomUUID(), title: title.trim(), url: normalizeResourceURL(url), kind, scoreId: scoreId || null, notes, status: previous?.status ?? 'todo', createdAt: previous?.createdAt ?? now, updatedAt: now }
      const failure = onChange(current => saveResource(current, item))
      if (failure) { setMessage(failure); return }
      clearForm(); setMessage(editing ? '资料修改已保存' : '资料已收藏到本机')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : '无法保存资料') }
  }
  const updateStatus = (item: LearningResource, status: ResourceStatus) => {
    const failure = onChange(current => current.map(resource => resource.id === item.id ? { ...resource, status, updatedAt: new Date().toISOString() } : resource))
    setMessage(failure || '学习状态已保存，状态由你手动标记')
  }
  const visible = resources.filter(item => (statusFilter === 'all' || item.status === statusFilter) && `${item.title} ${item.notes} ${item.url}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()))
  return <section className="learning-panel" aria-label="找谱与学习">
    <h2>找到想学的歌曲</h2>
    <p className="score-help">按歌名打开站外搜索结果，收藏曲谱或视频链接；下载 MusicXML/MXL 后，到“曲谱练习”导入，再关联到资料。</p>
    <form className="learning-search" onSubmit={search} noValidate><label>目标歌名<input aria-label="目标歌名" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setLinks([]) }} placeholder="例如：欢乐颂"/></label><label>想找的版本<select aria-label="找谱版本" value={arrangement} onChange={event => { setArrangement(event.target.value as typeof arrangement); setLinks([]) }}><option value="melody">入门单音旋律</option><option value="fingerstyle">指弹</option><option value="chords">弹唱</option></select></label><button type="submit">查找曲谱与教程</button><button type="button" onClick={() => { setQuery(score.title.split('·')[0].trim().slice(0, 120)); setLinks([]) }}>使用当前曲名</button></form>
    {links.length > 0 && <div className="learning-search-links">{links.map(link => <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"><strong>{link.name} ↗</strong><span>{link.description}</span></a>)}</div>}
    <p className="learning-message" role="status">{error || message}</p>
    <section className="study-advice" aria-label="小节练习建议"><h2>从难点小节开始</h2><label>选择本地曲谱<select aria-label="学习曲谱" value={active} disabled={disabled} onChange={event => onScore(Number(event.target.value))}>{scores.map((item, index) => <option key={item.id} value={index}>{item.title || '未命名曲谱'}</option>)}</select></label><p className="score-help">按当前指法的品位跨度、换弦次数和时值估计练习重点。实际难度以你的弹奏感受为准。</p><div className="study-cards">{sections.map(section => <article key={section.measure}><h3>第 {section.measure + 1} 小节</h3><p>{section.reasons.join(' · ')}</p><p className="score-help">先听示范，再逐音跟练；稳定后调整难段时值或指法。休止计时建议 {section.bpm} BPM。</p><button disabled={disabled} onClick={() => onPractice(score.id, section.start, section.end, section.bpm)}>练第 {section.measure + 1} 小节</button></article>)}</div>{!sections.length && <p>当前曲谱只有休止符，请先补充发声音符。</p>}<p className="score-help">跳转会选中对应小节，不会自动打开麦克风。现有跟练为等音模式，尚不评判节奏。</p></section>
    <section className="resource-library" aria-label="学习资料收藏"><h2>{editing ? '编辑收藏资料' : '收藏曲谱与视频'}</h2><form ref={form} className="resource-form" onSubmit={save} noValidate><label>资料标题<input aria-label="资料标题" maxLength={120} disabled={locked} value={title} onChange={event => setTitle(event.target.value)}/></label><label>网址<input aria-label="资料网址" type="url" maxLength={2048} disabled={locked} value={url} onChange={event => setURL(event.target.value)} placeholder="https://…"/></label><label>资料类型<select aria-label="资料类型" disabled={locked} value={kind} onChange={event => setKind(event.target.value as ResourceKind)}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>关联本地曲谱<select aria-label="关联本地曲谱" disabled={locked} value={scoreId} onChange={event => setScoreId(event.target.value)}><option value="">暂不关联</option>{scoreId && !scores.some(item => item.id === scoreId) && <option value={scoreId}>原关联曲谱不在当前库中</option>}{scores.map(item => <option key={item.id} value={item.id}>{item.title || '未命名曲谱'}</option>)}</select></label><label className="resource-notes">学习笔记<textarea aria-label="学习笔记" maxLength={1000} disabled={locked} value={notes} onChange={event => setNotes(event.target.value)} placeholder="例如：视频 01:20 的第 3 小节需要放慢练习"/></label><div className="score-toolbar"><button disabled={locked} type="submit">{editing ? '保存资料修改' : '保存学习资料'}</button>{editing && <button type="button" onClick={clearForm}>取消编辑</button>}</div></form>
    <div className="resource-filters"><label>筛选资料<input aria-label="筛选学习资料" maxLength={120} value={filter} onChange={event => setFilter(event.target.value)} placeholder="标题、网址或笔记"/></label><label>学习状态<select aria-label="筛选学习状态" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option><option value="todo">想学</option><option value="learning">练习中</option><option value="done">已学会</option></select></label><span>{visible.length} / {resources.length} 条</span></div>
    {removed && <button disabled={locked} onClick={() => { const failure = onChange(current => saveResource(current, removed)); if (!failure) setRemoved(null); setMessage(failure || '删除已撤销') }}>撤销删除资料</button>}
    <ul className="resource-list">{visible.map(item => { const linked = scores.find(candidate => candidate.id === item.scoreId); return <li key={item.id}><div className="resource-item-heading"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title} ↗</a><span>{kindLabels[item.kind]}</span></div><p className="resource-host">{new URL(item.url).hostname}{linked ? ` · 关联：${linked.title}` : item.scoreId ? ' · 原关联曲谱不在当前库中' : ' · 未关联曲谱'}</p>{item.notes && <p className="resource-note-text">{item.notes}</p>}<div className="score-toolbar"><label>状态<select aria-label={`${item.title}的学习状态`} disabled={locked} value={item.status} onChange={event => updateStatus(item, event.target.value as ResourceStatus)}><option value="todo">想学</option><option value="learning">练习中</option><option value="done">已学会</option></select></label>{linked && <button disabled={disabled} onClick={() => onPractice(linked.id, 0, linked.notes.length - 1, linked.tempo ?? 80)}>去练这首</button>}<button disabled={locked} onClick={() => { setEditing(item.id); setTitle(item.title); setURL(item.url); setKind(item.kind); setScoreId(item.scoreId || ''); setNotes(item.notes); form.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}>编辑资料</button><button disabled={locked} onClick={() => { const failure = onChange(current => current.filter(resource => resource.id !== item.id)); if (!failure) { setRemoved(item); if (editing === item.id) clearForm() } setMessage(failure || '资料已移除，可撤销删除') }}>移除资料</button></div></li> })}</ul>{visible.length === 0 && <p className="score-help">{resources.length ? '没有符合筛选条件的资料。' : '尚未收藏资料，可以先查找目标歌曲。'}</p>}<p className="score-help">最多收藏 100 条。保存的是链接、笔记和手动学习状态；视频内容不下载、不自动扒谱。完整备份可一起保存这些资料。</p></section>
  </section>
}
