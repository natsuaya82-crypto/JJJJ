import { useState } from 'react'
import type { Player, Team } from '../../types'
import PlayerRow from '../player/PlayerRow'
import PageHeader from '../ui/PageHeader'
import GmInviteChat from './GmInviteChat'
import { useAdHeight } from '../layout/Layout'
import { C, alpha, bottomStack } from '../../styles/tokens'

// ============================================================================
// **退任について来てもらう1人を選ぶ画面。**
//
// ★行は `PlayerRow` 1本、並べ方はロスターと同じ（箱に入れず縦に8pxずつ）。
//   **ここで選手の行を書き直さないこと。** 以前はオファーのモーダルの中に
//   「名前 ＋ 年齢 OVR」だけの折りたたみが入っていて、ロスターと見た目が違ううえ、
//   閉じているときの札と一覧の1行目がどちらも「声をかけない」で二重に出ていた。
//
// ★オファーのモーダル（zIndex 1001）の上に出すので 1003。
//   下から出るシートではなく画面ごと差し替えるので BottomSheet は通さない。
// ============================================================================

export default function GmInvitePicker({ roster, dest, invite, onPick, onClose }: {
  /** 声をかけられる相手（いま指揮しているクラブの在籍選手） */
  roster: Player[]
  /** 行き先のクラブ。返事の判定に要る */
  dest: Team
  /** いま選んでいる相手。空文字＝誰にも声をかけない */
  invite: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const adH = useAdHeight()
  // タップした相手とその場でチャットする。**返事はその1往復で決まる**
  const [talking, setTalking] = useState<Player | null>(null)
  return (
    <div style={{
      position: 'fixed', top: 0, bottom: bottomStack(adH), left: 0, right: 0,
      margin: '0 auto', width: '100%', maxWidth: 480, zIndex: 1003,
      background: C.bg, overflowY: 'auto', paddingTop: 'env(safe-area-inset-top)',
    }}>
      <PageHeader title="声をかける選手" eyebrow="INVITE" onBack={onClose} />

      <div style={{ padding: '0 18px 12px', fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
        1人だけ。<b style={{ color: C.textSub }}>行くかどうかは選手が決めます。</b>
      </div>

      <div style={{ padding: '0 18px 12px' }}>
        <button onClick={() => { onPick(''); onClose() }} style={{
          width: '100%', padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${alpha(invite === '' ? C.gold : C.border3, 0.75)}`,
          background: invite === '' ? alpha(C.gold, 0.12) : 'transparent',
          color: invite === '' ? C.gold : C.textDim,
          fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
        }}>誰にも声をかけない</button>
      </div>

      {/* ★並べ方はロスターと同じ（`margin: 0 18px`・箱に入れず gap 8） */}
      <div style={{ margin: '0 18px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {roster.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.textGhost, fontSize: 14 }}>登録選手なし</div>
        ) : roster.map(p => (
          <PlayerRow
            key={p.id}
            player={p}
            selected={p.id === invite}
            handlers={{ onClick: () => setTalking(p) }}
          />
        ))}
      </div>

      {talking && (
        <GmInviteChat
          player={talking}
          dest={dest}
          onAgreed={() => { onPick(talking.id); onClose() }}
          onClose={() => setTalking(null)}
        />
      )}
    </div>
  )
}
