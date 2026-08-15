import { useEffect } from 'react'
import { audio } from '../../utils/audio'
import titleArt from '../../assets/title.png'

// ============================================================================
// タイトル画面。**1枚の絵をそのまま全画面に出すだけ。**
//
// ★ロゴ・「EKIDEN TEAM MANAGEMENT」・「TAP TO START」は**絵の中に入っています**。
//   ここで文字を重ねないこと（二重に出ます）。文言を変えるときは絵を差し替える。
//
// ★背景は `layout/AppBackground` が全画面に敷いていますが、この画面は
//   その上に**不透明な絵を1枚**乗せて覆います（幕も効かせない）。
//
// ★以前はここで山と道をSVGで描き、ロゴも文字で組んでいました（145行）。
//   絵に置き換えたので消しています。戻さないこと。
// ============================================================================
export default function TitleScreen({ onStart }: { onStart: () => void }) {
  // unlock済み（ゲームから戻った場合）なら開いた瞬間にBGMを再開
  useEffect(() => {
    audio.playBgm('home')
  }, [])

  const start = () => { audio.unlock(); audio.playBgm('home'); audio.playSe('title'); onStart() }

  return (
    <div
      onClick={start}
      style={{
        height: '100svh', maxWidth: '480px', margin: '0 auto',
        position: 'relative', overflow: 'hidden', cursor: 'pointer', userSelect: 'none',
        // ★`cover` で全面に。絵の縦横比（853×1844）は iPhone とほぼ同じなので、
        //   端が少し切れるだけでロゴも TAP TO START も収まる
        backgroundColor: '#050a14',
        animation: 'title-fadein 0.6s ease',
      }}>
      <style>{`@keyframes title-fadein { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {/* ★背景（CSS）ではなく `<img>` で出すこと。
          背景だと**絵が読めなくても真っ黒な画面が出るだけ**で、起動の点検
          （`check-boot`）が「出ている」と「出ていない」を区別できません。
          `<img>` なら読み込めたか（naturalWidth）を見られます。 */}
      <img
        src={titleArt}
        alt="JPEL MANAGER — EKIDEN TEAM MANAGEMENT — TAP TO START"
        data-title-art
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* 読み上げ用。絵の中の文字は読み上げられないので、同じ文言を持たせる */}
      <span style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
      }}>TAP TO START</span>
    </div>
  )
}
