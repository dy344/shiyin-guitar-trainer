export const videoMaxBytes = 100_000_000
export const videoMaxSeconds = 600
export function validateVideoFile(file: { name: string; size: number }) {
  if (!/\.(mp4|mov|webm)$/i.test(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > videoMaxBytes) throw new Error('请选择非空、100 MB 以内的 MP4、MOV 或 WebM 视频')
}
export function validateVideoInfo(duration: number, channels: number) {
  if (!Number.isFinite(duration) || duration < 0.25 || duration > videoMaxSeconds) throw new Error('视频时长须为 0.25–600 秒，请先裁剪较长视频')
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) throw new Error('仅支持单声道或双声道音轨，请先转换音轨')
}
export function videoRange(start: string, end: string, duration: number) {
  const from = Number(start), to = Number(end)
  if (!start.trim() || !end.trim() || !Number.isFinite(duration) || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > duration || to - from < 0.25 || to - from > 20) throw new Error('请选择视频内 0.25–20 秒的片段，结束时间须大于开始时间')
  return { from, to }
}
