import { useEffect, useState } from 'react'
import { MelodyPlayer } from './playback'
import type { PlaybackView } from './playback'

export function usePlayback() {
  const [view, setView] = useState<PlaybackView>({ phase: 'idle', index: null, message: '使用合成参考音示范旋律，不模拟真实吉他音色' })
  const [player] = useState(() => new MelodyPlayer(setView))
  useEffect(() => {
    const hidden = () => { if (document.hidden) player.stop('页面已切换，示范播放已停止') }
    document.addEventListener('visibilitychange', hidden)
    return () => { document.removeEventListener('visibilitychange', hidden); player.stop('', false) }
  }, [player])
  return { player, view }
}
