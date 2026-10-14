import { memo, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Score } from './score'
import { noteName } from './score'
import { durationLabel, layoutScore } from './scoreLayout'
import type { MeasureFragment } from './scoreLayout'

const Fragment = memo(function Fragment({ fragment, selected, disabled, onSelect }: { fragment: MeasureFragment; selected: number | null; disabled: boolean; onSelect: (index: number) => void }) {
  return <article className="full-score-measure" aria-label={`第 ${fragment.measure + 1} 小节${fragment.part ? '续' : ''}`}>
    <div className="full-measure-heading"><strong>{fragment.measure + 1}{fragment.parts > 1 ? ` · ${fragment.part + 1}/${fragment.parts}` : ''}</strong><span>{fragment.meter.beats}/{fragment.meter.unit}</span><small className={fragment.used !== fragment.expected ? 'bar-mismatch' : ''}>{durationLabel(fragment.used)} / {durationLabel(fragment.expected)}{fragment.used === 0 ? '（空）' : ''}</small></div>
    {fragment.notes.length ? <div className="full-tab" style={{ gridTemplateColumns: `36px repeat(${fragment.notes.length}, minmax(32px, 1fr))` }}><div className="full-string-labels"><span>音高</span>{['1 E','2 B','3 G','4 D','5 A','6 E'].map(label => <span key={label}>{label}</span>)}<span>时值</span></div>{fragment.notes.map(({ note, index }) => <button className="full-score-note" key={index} aria-label={`全谱第 ${index + 1} 音：${note.midi === null ? '休止' : noteName(note.midi)}，${durationLabel(note.ticks)}`} aria-pressed={selected === index} disabled={disabled} onClick={() => onSelect(index)}><span className="full-note-name">{note.midi === null ? '休' : noteName(note.midi)}</span>{[1,2,3,4,5,6].map(string => <span className="full-string-cell" key={string}>{note.string === string ? <b>{note.fret}</b> : note.midi === null && string === 3 ? <b>休</b> : null}</span>)}<span className="full-note-duration">{durationLabel(note.ticks)}</span></button>)}</div> : <p className="score-help">此小节没有音符，请检查原谱或编辑内容。</p>}
  </article>
})

export default memo(function FullScore({ score, cursor, disabled, onSelect, onPreparePrint }: { score: Score; cursor: number; disabled: boolean; onSelect: (index: number) => void; onPreparePrint: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const fragments = useMemo(() => layoutScore(score), [score])
  const mismatches = fragments.filter(fragment => fragment.part === 0 && fragment.used !== fragment.expected).length
  useEffect(() => {
    const prepare = () => { onPreparePrint(); flushSync(() => setExpanded(true)) }
    window.addEventListener('beforeprint', prepare)
    return () => window.removeEventListener('beforeprint', prepare)
  }, [onPreparePrint])
  const print = () => {
    onPreparePrint()
    setExpanded(true)
    setMessage('在打印窗口选择“另存为 PDF”即可保存；打印的是当前整份练习谱。')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      try { window.print() }
      catch { setMessage('无法打开打印窗口，请使用浏览器菜单中的打印功能') }
    }))
  }
  return <section className="full-score" aria-label="完整曲谱预览">
    <div className="full-score-controls"><h2>完整曲谱</h2><div className="score-toolbar"><button onClick={() => setExpanded(!expanded)}>{expanded ? '收起完整曲谱' : '展开完整曲谱'}</button><button disabled={disabled} onClick={print}>打印 / 保存 PDF</button></div><p className="score-help">按小节展示全部音符；点击音符可同步上方编辑器。数字为品位，下方标明时值，一拍按四分音符计。</p>{message && <p role="status" className="score-notice">{message}</p>}</div>
    {expanded && <div className="full-score-sheet"><div className="full-score-heading"><h3>{score.title || '未命名练习曲'}</h3><p>拾音 · 六线练习谱 · 标准调弦 E–A–D–G–B–E</p><p>{score.meters.length} 小节 · {score.notes.length} 个音符及休止符{score.tempo ? ` · ♩ = ${score.tempo} BPM` : ''}</p>{mismatches > 0 && <p className="full-score-warning">{mismatches} 个小节拍数与拍号不一致，已按当前时值展示；弱起小节可能有意不足拍。</p>}</div><div className="full-score-grid">{fragments.map(fragment => <Fragment key={`${fragment.measure}:${fragment.part}`} fragment={fragment} selected={fragment.notes.some(item => item.index === cursor) ? cursor : null} disabled={disabled} onSelect={onSelect}/>)}</div><p className="full-score-footnote">数字表示弦上品位，0 为空弦，“休”为休止符。本谱整理了当前旋律、指法和时值；请保留原谱。</p></div>}
  </section>
})
