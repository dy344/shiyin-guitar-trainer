import { unzipSync } from 'fflate'

const containerPath = 'META-INF/container.xml'
type ArchiveEntry = { size: number; originalSize: number }
export type MXLArchive = { bytes: Uint8Array; entries: Map<string, ArchiveEntry>; container: string }
const decode = (bytes: Uint8Array) => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new Error('曲谱不是有效的 UTF-8 文本，请重新导出 MusicXML') }
}
export function inspectMXL(bytes: Uint8Array): MXLArchive {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > 10_000_000 || bytes[0] !== 80 || bytes[1] !== 75) throw new Error('MXL 文件为空、损坏或超过 10 MB')
  const entries = new Map<string, ArchiveEntry>()
  let total = 0
  const files = unzipSync(bytes, { filter: file => {
    if (entries.has(file.name)) throw new Error('MXL 包含重复的文件名，请重新导出')
    if (entries.size >= 1000 || !Number.isSafeInteger(file.originalSize) || file.originalSize < 0) throw new Error('MXL 文件列表过大或损坏')
    total += file.originalSize
    if (total > 64_000_000) throw new Error('MXL 解压总大小超过 64 MB，请移除附带媒体后重新导出')
    entries.set(file.name, { size: file.size, originalSize: file.originalSize })
    if (file.name !== containerPath) return false
    if (file.originalSize > 64_000) throw new Error('MXL 的目录描述文件过大')
    return true
  } })
  const container = files[containerPath]
  if (!container || !container.length || container.length !== entries.get(containerPath)?.originalSize) throw new Error('MXL 缺少有效的 META-INF/container.xml')
  return { bytes, entries, container: decode(container) }
}
export function extractMXLScore(archive: MXLArchive, path: string): string {
  if (!path || path === containerPath || /[\\:]/.test(path) || Array.from(path).some(character => character.charCodeAt(0) < 32) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('MXL 曲谱路径无效，请重新导出')
  const entry = archive.entries.get(path)
  if (!entry) throw new Error('MXL 声明的曲谱文件不存在')
  if (!entry.originalSize || entry.originalSize > 2_000_000) throw new Error('MXL 中的曲谱为空或超过 2 MB')
  const extracted = unzipSync(archive.bytes, { filter: file => file.name === path })[path]
  if (!extracted || extracted.length !== entry.originalSize) throw new Error('MXL 曲谱解压失败或文件已损坏')
  return decode(extracted)
}
