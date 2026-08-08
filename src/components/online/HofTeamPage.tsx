import { useEffect, useState } from 'react'
import BackButton from '../ui/BackButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import HofList from './HofList'
import { useGameStore } from '../../store/gameStore'
import { usePreviewStore } from '../../store/previewStore'
import { HOF_MAX } from '../../utils/hofRoster'
import type { HofPlayer } from '../../types'
import { C, SAIRA, FONT } from '../../styles/tokens'

// 未登録セーブ用の空配列。ここで [] を書くと毎回別物になり、下の useEffect が回り続ける
const EMPTY: HofPlayer[] = []

// 殿堂入りチーム。登録した瞬間の選手を凍らせて貯める（utils/hofRoster.ts）。
// 一覧の見た目・並び替えは HofList（フレンドの殿堂入りと共通）。
//   長押し  選手詳細（usePlayerLongPress）/ タップ  殿堂入りを解除
//
// 解除は取り消せない（登録した時点の能力ごと消える。同じ姿には二度と戻せない）ので、
// タップからそのまま消さず ConfirmDialog をはさむ
export default function HofTeamPage() {
  const hof = useGameStore(s => s.hofRoster) ?? EMPTY
  const remove = useGameStore(s => s.removeHofPlayer)
  const setPreview = usePreviewStore(s => s.setPlayers)
  const [askId, setAskId] = useState<string | null>(null)
  const asking = hof.find(h => h.player.id === askId)

  // 詳細は「登録した時点の姿」を見せる。いまの本人を開くと能力が違って混乱するので、
  // フレンドのロスターと同じ仕組み（previewStore）に凍らせたコピーを載せる
  useEffect(() => {
    setPreview(hof.map(h => h.player))
    return () => setPreview([])
  }, [hof, setPreview])

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>HALL OF FAME</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>殿堂入りチーム</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: hof.length >= HOF_MAX ? C.gold : C.textSub }}>
          {hof.length}<span style={{ fontSize: 11, color: C.textDim }}>/{HOF_MAX}</span>
        </div>
      </div>

      <HofList
        hof={hof}
        hint="タップで解除（長押しで詳細）"
        emptyLabel="まだ誰もいません"
        emptySub="選手のページから登録できます"
        onTap={h => setAskId(h.player.id)}
      />

      {asking && (
        <ConfirmDialog
          title={`${asking.player.name} を殿堂入りから外しますか？`}
          message={`${asking.year}年 ${asking.teamName} で固定した姿は消えます。取り消せません。`}
          confirmLabel="外す"
          accent={C.red}
          onConfirm={() => { remove(asking.player.id); setAskId(null) }}
          onCancel={() => setAskId(null)}
        />
      )}
    </div>
  )
}
