import type { PracticeOptions, PracticeState } from './practice'

type Props = {
  state: PracticeState
  options: PracticeOptions
  available: boolean
  blocked: boolean
  total: number
  rest: boolean
  onOptions: (options: PracticeOptions) => void
  onStart: () => void
  onPause: () => void
  onReset: () => void
}

export default function PracticeControls({ state, options, available, blocked, total, rest, onOptions, onStart, onPause, onReset }: Props) {
  const locked = state.phase === 'running' || blocked
  const message = !available ? '先点击开始监听，才能启动自动跟练。' : state.phase === 'complete' ? '本段已完成。可重新开始，或开启循环再练一遍。' : state.phase === 'paused' ? '练习已暂停，继续时请先止音。' : !locked ? '准备好后开始跟练。每个音之间请短暂止音。' : rest ? '当前是休止符，请保持安静至时值结束。' : state.waitingForSilence ? '请先止音约 0.2 秒，再弹奏目标音。' : '等待目标音稳定约 0.3 秒，命中后自动前进。'
  const bound = (value: number) => Math.max(0, Math.min(total - 1, value))
  return <section className="practice-controls" aria-label="自动跟练">
    <h2>自动跟练</h2>
    <div className="score-toolbar"><button disabled={!available || locked} onClick={onStart}>{state.phase === 'paused' ? '继续跟练' : '开始跟练'}</button><button disabled={state.phase !== 'running'} onClick={onPause}>暂停跟练</button><button disabled={blocked} onClick={onReset}>重置本次练习</button></div>
    <div className="practice-options">
      <label>起始音符<input aria-label="起始音符" type="number" min={1} max={options.end + 1} value={options.start + 1} disabled={locked} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) onOptions({ ...options, start: Math.min(options.end, bound(Math.round(value) - 1)) }) }}/></label>
      <label>结束音符<input aria-label="结束音符" type="number" min={options.start + 1} max={total} value={options.end + 1} disabled={locked} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) onOptions({ ...options, end: Math.max(options.start, bound(Math.round(value) - 1)) }) }}/></label>
      <label>音准容差<select aria-label="音准容差" value={options.tolerance} disabled={locked} onChange={event => onOptions({ ...options, tolerance: Number(event.target.value) })}><option value={12}>±12 音分</option><option value={25}>±25 音分</option><option value={40}>±40 音分</option></select></label>
      <label>休止计时速度<select aria-label="休止计时速度" value={options.bpm} disabled={locked} onChange={event => onOptions({ ...options, bpm: Number(event.target.value) })}>{[...new Set([40,60,80,100,120,160,options.bpm])].sort((a, b) => a - b).map(bpm => <option value={bpm} key={bpm}>{bpm} BPM</option>)}</select></label>
      <label className="practice-loop"><input type="checkbox" checked={options.loop} disabled={locked} onChange={event => onOptions({ ...options, loop: event.target.checked })}/>循环本段</label>
    </div>
    <p className="practice-status" role="status">{message}</p>
    <dl className="practice-stats"><div><dt>命中音符</dt><dd>{state.hits}</dd></div><div><dt>出现稳定偏差</dt><dd>{state.corrections}</dd></div><div><dt>完成休止</dt><dd>{state.rests}</dd></div><div><dt>完成轮数</dt><dd>{state.laps}</dd></div></dl>
    <p className="score-help">这是等音模式，不评判音符节奏；BPM 仅用于休止计时。连续同音必须先止音再弹，持续延音不会重复计数。偏差持续约 0.3 秒才记录，每个目标最多记一次。本次统计在刷新或切换曲谱后重置。</p>
  </section>
}
