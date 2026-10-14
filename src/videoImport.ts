import type { Input, InputAudioTrack } from 'mediabunny'
import { validateVideoFile, validateVideoInfo, videoRange } from './videoLimits'
import { transcriptionRate } from './transcription'

export type VideoInfo = { duration: number; channels: number; codec: string }
async function readVideo<T>(file: File, signal: AbortSignal, action: (input: Input, track: InputAudioTrack, info: VideoInfo) => Promise<T>): Promise<T> {
  validateVideoFile(file)
  signal.throwIfAborted()
  const { Input, BlobSource, MP4, QTFF, WEBM } = await import('mediabunny')
  signal.throwIfAborted()
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM] })
  const abort = () => input.dispose()
  signal.addEventListener('abort', abort, { once: true })
  try {
    const [video, track] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()])
    if (!video) throw new Error('文件中没有视频画面轨，请通过本地音频入口导入')
    if (!track) throw new Error('视频没有音轨，无法生成曲谱')
    const [duration, channels, codec, decodable] = await Promise.all([input.computeDuration(), track.getNumberOfChannels(), track.getCodec(), track.canDecode()])
    validateVideoInfo(duration, channels)
    if (!decodable) throw new Error(`当前浏览器无法解码 ${codec || '此格式'} 音轨，请转换为 AAC/Opus 音轨或导出 WAV 后重试`)
    signal.throwIfAborted()
    return await action(input, track, { duration, channels, codec: codec || '未知' })
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && /视频|音轨|声道/.test(error.message)) throw error
    throw new Error('无法读取视频，文件可能损坏或格式不受支持；请转换为 MP4/WebM 后重试')
  } finally { signal.removeEventListener('abort', abort); input.dispose() }
}
export function inspectVideo(file: File, signal: AbortSignal): Promise<VideoInfo> {
  return readVideo(file, signal, async (_input, _track, info) => info)
}
export function extractVideoClip(file: File, from: number, to: number, signal: AbortSignal, progress: (percent: number) => void): Promise<{ samples: Float32Array; channel: number }> {
  return readVideo(file, signal, async (_input, track, info) => {
    videoRange(String(from), String(to), info.duration)
    const { AudioBufferSink } = await import('mediabunny')
    signal.throwIfAborted()
    const sink = new AudioBufferSink(track)
    const context = new OfflineAudioContext(info.channels, Math.round((to - from) * transcriptionRate), transcriptionRate)
    let count = 0
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      signal.throwIfAborted()
      if (++count > 10_000 || buffer.sampleRate > 192_000 || buffer.numberOfChannels !== info.channels) throw new Error('视频音轨参数异常，请转换音轨后重试')
      const begin = Math.max(from, timestamp), end = Math.min(to, timestamp + buffer.duration)
      if (end <= begin) continue
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.start(begin - from, begin - timestamp, end - begin)
      progress(Math.min(95, Math.round((end - from) / (to - from) * 95)))
    }
    if (!count) throw new Error('所选视频片段没有音轨数据，请换一段')
    signal.throwIfAborted()
    const rendered = await context.startRendering()
    signal.throwIfAborted()
    let channel = 0, greatest = -1
    for (let index = 0; index < rendered.numberOfChannels; index++) {
      let energy = 0
      for (const value of rendered.getChannelData(index)) energy += value * value
      if (energy > greatest) { channel = index; greatest = energy }
    }
    progress(100)
    return { samples: rendered.getChannelData(channel).slice(), channel: channel + 1 }
  })
}
