import { transcribePCM } from './transcription'
import type { TranscriptionOptions } from './transcription'

self.onmessage = (event: MessageEvent<{ samples: Float32Array; rate: number; options: TranscriptionOptions }>) => {
  try {
    const { samples, rate, options } = event.data
    const draft = transcribePCM(samples, rate, options, percent => self.postMessage({ type: 'progress', percent }))
    self.postMessage({ type: 'result', draft })
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '音频分析失败' }) }
}
