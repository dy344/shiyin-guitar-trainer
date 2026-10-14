import { parseMusicXML } from './score.ts'
import { extractMXLScore, inspectMXL } from './mxl.ts'

export function mxlRootPath(source: string): string {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) throw new Error('不支持包含自定义实体的 MXL 目录')
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'container') throw new Error('MXL 的 container.xml 格式无效')
  const rootfiles = Array.from(doc.documentElement.children).filter(child => child.localName === 'rootfiles')
  const root = rootfiles.length === 1 ? Array.from(rootfiles[0].children).find(child => child.localName === 'rootfile') : undefined
  const path = root?.getAttribute('full-path')
  const type = root?.getAttribute('media-type')
  if (!path || (type && type !== 'application/vnd.recordare.musicxml+xml')) throw new Error('MXL 的首个 rootfile 不是有效的 MusicXML 曲谱')
  return path
}
export async function parseScoreFile(file: File) {
  const filename = file.name.replace(/\.[^.]+$/, '')
  if (/\.mxl$/i.test(file.name)) {
    if (!file.size || file.size > 10_000_000) throw new Error('MXL 文件须为非空、10 MB 以内')
    try {
      const archive = inspectMXL(new Uint8Array(await file.arrayBuffer()))
      return parseMusicXML(extractMXLScore(archive, mxlRootPath(archive.container)), filename)
    } catch (error) { throw new Error(`MXL 导入失败：${error instanceof Error ? error.message : '压缩文件无法读取'}`) }
  }
  if (!/\.(musicxml|xml)$/i.test(file.name)) throw new Error('请选择 .musicxml、.xml 或 .mxl 曲谱文件；暂不支持 PDF、MIDI')
  if (!file.size || file.size > 2_000_000) throw new Error('MusicXML 文件须为非空、2 MB 以内')
  return parseMusicXML(await file.text(), filename)
}
