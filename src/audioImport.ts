import { transcriptionRate } from './transcription'

export type ImportedAudio = { samples: Float32Array; rate: number; duration: number; name: string; channels: number; channel: number }
export async function decodeAudioFile(file: File): Promise<ImportedAudio> {
  if (!/\.(wav|mp3|m4a|ogg|flac)$/i.test(file.name) || !file.size || file.size > 10_000_000) throw new Error('请选择非空、10 MB 以内的 WAV、MP3、M4A、OGG 或 FLAC 音频，不支持视频文件')
  const context = new OfflineAudioContext(1, 1, transcriptionRate)
  let buffer: AudioBuffer
  try { buffer = await context.decodeAudioData(await file.arrayBuffer()) }
  catch { throw new Error('无法解码此音频，可能格式不受浏览器支持或文件已损坏；请转为 WAV 后重试') }
  if (buffer.duration < 0.25 || buffer.duration > 120 || buffer.numberOfChannels > 2) throw new Error('录音须为 0.25–120 秒、单声道或双声道；请先裁剪较长文件')
  let channel = 0, strongest = -1
  for (let index = 0; index < buffer.numberOfChannels; index++) {
    let energy = 0
    const samples = buffer.getChannelData(index)
    for (let i = 0; i < samples.length; i++) energy += samples[i] ** 2
    if (energy > strongest) { strongest = energy; channel = index }
  }
  return { samples: buffer.getChannelData(channel).slice(), rate: buffer.sampleRate, duration: buffer.duration, name: file.name.replace(/\.[^.]+$/, '').slice(0, 100), channels: buffer.numberOfChannels, channel: channel + 1 }
}
