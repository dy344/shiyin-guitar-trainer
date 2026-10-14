export type ScoreNote = { midi: number | null; ticks: number; measure: number; string: number | null; fret: number | null }
export type Score = { version: 1; id: string; title: string; notes: ScoreNote[]; meters: { beats: number; unit: number }[]; tempo?: number }
export const tuning = [64, 59, 55, 50, 45, 40]
export const noteName = (midi: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`
export const noteFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
export function positions(midi: number) {
  return tuning.map((open, index) => ({ string: index + 1, fret: midi - open })).filter(p => p.fret >= 0 && p.fret <= 24).sort((a, b) => a.fret - b.fret)
}
export function withPitch(note: ScoreNote, midi: number | null): ScoreNote {
  if (midi === null) return { ...note, midi, string: null, fret: null }
  const position = positions(midi)[0]
  if (!Number.isInteger(midi) || !position) throw new Error('音高超出标准调弦吉他的 0–24 品范围')
  return { ...note, midi, ...position }
}
const children = (element: Element, name: string) => Array.from(element.children).filter(child => child.localName === name)
const child = (element: Element, name: string) => children(element, name)[0]
const text = (element: Element, name: string) => child(element, name)?.textContent?.trim() ?? ''
function number(value: string, label: string, fallback?: number) {
  if (!value && fallback !== undefined) return fallback
  const result = Number(value)
  if (!value || !Number.isFinite(result)) throw new Error(`${label}缺失或不合法`)
  return result
}

export function parseMusicXML(source: string, filename = '导入曲谱'): Score {
  if (!source.trim() || source.length > 2_000_000) throw new Error('文件为空或超过 2 MB')
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) throw new Error('不支持包含自定义实体的 XML')
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'score-partwise') throw new Error('请选择有效的未压缩 MusicXML（score-partwise）文件')
  const parts = children(doc.documentElement, 'part')
  if (parts.length !== 1) throw new Error('目前只支持单乐器谱，请先在制谱软件中导出一个旋律声部')
  const unsupported = ['chord', 'backup', 'forward', 'grace', 'cue', 'tie', 'tied', 'repeat', 'ending', 'unpitched', 'octave-shift', 'staff-tuning', 'capo', 'bend', 'harmonic', 'scordatura', 'measure-repeat', 'multiple-rest', 'double', 'instrument-change']
  for (const name of unsupported) if (parts[0].getElementsByTagName(name).length) throw new Error(`曲谱包含暂不支持的 ${name}（和弦、多声部、反复或特殊奏法）；请先简化后导出`)
  const voices = new Set(Array.from(parts[0].getElementsByTagName('voice')).map(e => e.textContent?.trim()))
  if (voices.size > 1 || Array.from(parts[0].getElementsByTagName('staff')).some(e => e.textContent?.trim() !== '1')) throw new Error('目前只支持单声部、单谱表旋律')
  let divisions = 0, transpose = 0, meter = { beats: 4, unit: 4 }
  const score: Score = { version: 1, id: crypto.randomUUID(), title: doc.querySelector('work-title, movement-title')?.textContent?.trim().slice(0, 120) || filename.slice(0, 120), notes: [], meters: [] }
  const tempos = new Set(Array.from(parts[0].getElementsByTagName('sound')).filter(sound => sound.hasAttribute('tempo')).map(sound => Number(sound.getAttribute('tempo'))))
  if (tempos.size > 1) throw new Error('暂不支持曲中变速，请导出固定速度的旋律片段')
  if (tempos.size === 1) {
    const tempo = Array.from(tempos)[0]
    if (!Number.isInteger(tempo) || tempo < 30 || tempo > 200) throw new Error('曲谱速度须为 30–200 的整数 BPM')
    score.tempo = tempo
  }
  const measures = children(parts[0], 'measure')
  if (!measures.length || measures.length > 500) throw new Error('小节数量须为 1–500')
  for (const [measure, bar] of measures.entries()) {
    for (const element of Array.from(bar.children)) {
      if (element.localName === 'attributes') {
        if (child(element, 'divisions')) divisions = number(text(element, 'divisions'), '时值单位')
        if (divisions <= 0) throw new Error('缺少有效的 divisions 时值单位')
        if (number(text(element, 'staves'), '谱表数量', 1) !== 1) throw new Error('目前只支持单谱表')
        const time = child(element, 'time')
        if (time) {
          if (children(time, 'beats').length !== 1 || children(time, 'beat-type').length !== 1) throw new Error('暂不支持复合拍号')
          meter = { beats: number(text(time, 'beats'), '拍号'), unit: number(text(time, 'beat-type'), '拍号单位') }
          if (!Number.isInteger(meter.beats) || meter.beats < 1 || meter.beats > 32 || ![1, 2, 4, 8, 16, 32].includes(meter.unit)) throw new Error('不支持此拍号')
        }
        const transposition = child(element, 'transpose')
        if (transposition) {
          transpose = number(text(transposition, 'chromatic'), '移调半音') + 12 * number(text(transposition, 'octave-change'), '八度移调', 0)
          if (!Number.isInteger(transpose)) throw new Error('暂不支持微分音移调')
        }
      }
      if (element.localName !== 'note') continue
      if (divisions <= 0) throw new Error('缺少 divisions 时值单位')
      const exactTicks = number(text(element, 'duration'), '音符时值') * 960 / divisions
      if (exactTicks <= 0 || exactTicks > 122880 || Math.abs(exactTicks - Math.round(exactTicks)) > 0.00001) throw new Error('音符时值不支持或精度超过 1/960 四分音符')
      const base: ScoreNote = { midi: null, ticks: Math.round(exactTicks), measure, string: null, fret: null }
      if (child(element, 'rest')) score.notes.push(base)
      else {
        const pitch = child(element, 'pitch')
        if (!pitch) throw new Error('音符缺少音高')
        const steps: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
        const step = steps[text(pitch, 'step')]
        const octave = number(text(pitch, 'octave'), '八度')
        const alter = number(text(pitch, 'alter'), '升降音', 0)
        if (step === undefined || !Number.isInteger(octave) || !Number.isInteger(alter)) throw new Error('音高无效或含微分音')
        let note = withPitch(base, 12 * (octave + 1) + step + alter + transpose)
        const technical = element.querySelector('notations technical')
        if (technical && (child(technical, 'string') || child(technical, 'fret'))) {
          const string = number(text(technical, 'string'), '弦号'), fret = number(text(technical, 'fret'), '品位')
          if (!Number.isInteger(string) || !Number.isInteger(fret) || string < 1 || string > 6 || fret < 0 || fret > 24 || tuning[string - 1] + fret !== note.midi) throw new Error('原谱弦号、品位与实际音高不一致，请检查调弦和移调设置')
          note = { ...note, string, fret }
        }
        score.notes.push(note)
      }
      if (score.notes.length > 2000) throw new Error('最多支持 2000 个音符及休止符')
    }
    if (!score.notes.some(note => note.measure === measure)) throw new Error('存在空小节，请用休止符填充后导出')
    score.meters.push({ ...meter })
  }
  if (!score.notes.some(note => note.midi !== null)) throw new Error('曲谱没有可练习的音符')
  return score
}

export function validateScore(value: unknown): Score {
  const score = value as Score
  if (!score || score.version !== 1 || typeof score.id !== 'string' || typeof score.title !== 'string' || score.title.length > 120 || !Array.isArray(score.notes) || !score.notes.length || score.notes.length > 2000 || !Array.isArray(score.meters) || !score.meters.length || score.meters.length > 500) throw new Error('本地曲谱数据格式错误')
  if (score.tempo !== undefined && (!Number.isInteger(score.tempo) || score.tempo < 30 || score.tempo > 200)) throw new Error('曲谱速度数据错误')
  for (const meter of score.meters) if (!meter || !Number.isInteger(meter.beats) || meter.beats < 1 || meter.beats > 32 || ![1, 2, 4, 8, 16, 32].includes(meter.unit)) throw new Error('本地拍号数据错误')
  let previous = 0
  for (const note of score.notes) {
    if (!note || !Number.isInteger(note.ticks) || note.ticks <= 0 || note.ticks > 122880 || !Number.isInteger(note.measure) || note.measure < previous || note.measure >= score.meters.length) throw new Error('本地音符数据错误')
    previous = note.measure
    if (note.midi === null) { if (note.string !== null || note.fret !== null) throw new Error('休止符数据错误') }
    else if (!Number.isInteger(note.midi) || !Number.isInteger(note.string) || !Number.isInteger(note.fret) || note.string! < 1 || note.string! > 6 || note.fret! < 0 || note.fret! > 24 || tuning[note.string! - 1] + note.fret! !== note.midi) throw new Error('本地指法数据错误')
  }
  return score
}

const escapeXML = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
export function exportMusicXML(score: Score): string {
  validateScore(score)
  const bars = score.meters.map((meter, measure) => {
    const notes = score.notes.filter(note => note.measure === measure).map(note => {
      if (note.midi === null) return `<note><rest/><duration>${note.ticks}</duration></note>`
      const names = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
      const sharp = [1, 3, 6, 8, 10].includes(note.midi % 12)
      return `<note><pitch><step>${names[note.midi % 12]}</step>${sharp ? '<alter>1</alter>' : ''}<octave>${Math.floor(note.midi / 12) - 1}</octave></pitch><duration>${note.ticks}</duration><notations><technical><string>${note.string}</string><fret>${note.fret}</fret></technical></notations></note>`
    }).join('')
    return `<measure number="${measure + 1}"><attributes><divisions>960</divisions><time><beats>${meter.beats}</beats><beat-type>${meter.unit}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${measure === 0 && score.tempo !== undefined ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>` : ''}${notes}</measure>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escapeXML(score.title)}</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`
}

export function exampleScore(): Score {
  return { version: 1, id: 'ode-example', title: '欢乐颂 · 旋律片段', meters: Array.from({ length: 4 }, () => ({ beats: 4, unit: 4 })), notes: [64,64,65,67,67,65,64,62,60,60,62,64,64,62,62].map((midi, index) => withPitch({ midi, ticks: index === 14 ? 1920 : 960, measure: Math.floor(index / 4), string: null, fret: null }, midi)) }
}
