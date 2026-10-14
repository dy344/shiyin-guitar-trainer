import type { TranscriptionDraft, TranscriptionOptions } from './transcription'
import { transcriptionRate } from './transcription'

export function transcribeClip(samples: Float32Array, options: TranscriptionOptions, signal: AbortSignal, progress: (percent: number) => void): Promise<TranscriptionDraft> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' })
    const clean = () => { worker.terminate(); signal.removeEventListener('abort', abort); clearTimeout(timer) }
    const abort = () => { clean(); reject(signal.reason) }
    const timer = setTimeout(() => { clean(); reject(new Error('识别超过 60 秒，请缩短片段后重试')) }, 60_000)
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ type: string; percent?: number; draft?: TranscriptionDraft; message?: string }>) => {
      if (event.data.type === 'progress') progress(event.data.percent ?? 0)
      else if (event.data.type === 'result' && event.data.draft) { clean(); resolve(event.data.draft) }
      else { clean(); reject(new Error(event.data.message || '无法生成草稿')) }
    }
    worker.onerror = event => { event.preventDefault(); clean(); reject(new Error('后台识别失败，请重新选择片段')) }
    try { worker.postMessage({ samples, rate: transcriptionRate, options }, [samples.buffer]) }
    catch (error) { clean(); reject(error) }
  })
}
