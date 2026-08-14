import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { ovr } from '../../utils/playerUtils'
import { isLeavingClub } from '../../utils/transferEligibility'
import PlayerRow from '../player/PlayerRow'
import PlayerFace from '../player/PlayerFace'
import ActionSheet from '../ui/ActionSheet'
import PageHeader from '../ui/PageHeader'
import { C, alpha, F } from '../../styles/tokens'
import PlayerList from '../player/PlayerList'


// 移籍方針：選手ごとに 非売 / 貸出歓迎 / 売出 を設定する。
// - 非売: 他クラブからの買い取りオファーを全ブロック
// - 貸出: レンタル打診（借りたい）が優先的・高確率で来る
// - 売出: 市場価値で移籍リストへ。CPUが買い取ると即入金＋退団通知（チャット対応なし）
// タップで方針シート、長押しで選手詳細。非売+貸出は併用可、売出は他と排他。
export default function NoSalePage() {
  const { players, playerTeamId, toggleNoSale, toggleLoanListed, allowPlayerTransfer, cancelSellListing } = useGameStore()
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null)

  const myPlayers = players
    .filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan)
    .sort((a, b) =>
      ((b.noSale || b.loanListed || b.transferListed) ? 1 : 0) - ((a.noSale || a.loanListed || a.transferListed) ? 1 : 0)
      || ovr(b) - ovr(a))
  const setCount = myPlayers.filter(p => p.noSale || p.loanListed || p.transferListed).length

  // 長押しで詳細（タップ＝方針シートと両立させる）。判定は共有フック1本
  const longPress = usePlayerLongPress()
  const rowHandlers = (pid: string) => longPress(pid, () => setSheetPlayerId(pid))

  const badge = (label: string, color: string) => (
    <span key={label} style={{ fontSize: F.micro, padding: '1px 5px',backgroundColor: alpha(color, 0.15), border: `1px solid ${alpha(color, 0.45)}`, color, fontWeight: 800, flexShrink: 0 }}>{label}</span>
  )

  const sheetPlayer = sheetPlayerId ? myPlayers.find(p => p.id === sheetPlayerId) ?? null : null

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, minHeight: '100%' }}>
      <PageHeader title="移籍方針" />
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ fontSize: F.label, color: C.textDim, lineHeight: 1.6 }}>
          タップで方針を設定（長押しで詳細）。
          非売＝買い取りオファーを止める／貸出＝レンタル打診が来やすくなる／売出＝市場価値で売りに出し、成立すると入金と退団通知だけが届きます。
          契約切れ間近のフリー移籍の勧誘（本人の意思）は止められません。
        </div>
        <div style={{ marginTop: 8, fontSize: F.label, fontWeight: 800, color: setCount > 0 ? C.gold : C.textDim }}>
          方針設定中 {setCount}名
        </div>
      </div>

      <PlayerList style={{ margin: '0 12px' }}>
        {myPlayers.map(p => (
          <PlayerRow
            key={p.id}
            player={p}
            handlers={rowHandlers(p.id)}
            extra={<>
              {p.noSale && badge('非売', C.red)}
              {p.loanListed && badge('貸出', C.blue)}
              {p.transferListed && badge('売出中', C.orange)}
            </>}
            selected={!!(p.noSale || p.loanListed || p.transferListed)}
          />
        ))}
        {myPlayers.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.textGhost, fontSize: F.bodyLg }}>対象の選手がいません</div>
        )}
      </PlayerList>

      {sheetPlayer && (
        <ActionSheet
          open={!!sheetPlayer}
          onClose={() => setSheetPlayerId(null)}
          header={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{overflow: 'hidden', flexShrink: 0 }}>
                <PlayerFace playerId={sheetPlayer.id} nationality={sheetPlayer.nationality} size={44} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text }}>{sheetPlayer.name}</div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>
                  {sheetPlayer.noSale ? '非売 ' : ''}{sheetPlayer.loanListed ? '貸出歓迎 ' : ''}{sheetPlayer.transferListed ? '売出中' : ''}
                  {!sheetPlayer.noSale && !sheetPlayer.loanListed && !sheetPlayer.transferListed ? '方針未設定' : ''}
                </div>
              </div>
            </div>
          }
          items={[
            {
              // 進路が決まった選手（引退承認・海外挑戦承認・退団予定）には非売を付け直せない。
              // 付けると canGoOverseasDream / canBePoached が止まり、認めたのにオファーが来なくなる
              label: sheetPlayer.noSale ? '非売を解除する'
                : isLeavingClub(sheetPlayer) ? '非売にできません（退団・海外挑戦が決まっています）'
                : '非売にする（買い取りオファーを止める）',
              color: C.red,
              disabled: !sheetPlayer.noSale && isLeavingClub(sheetPlayer),
              onClick: () => { toggleNoSale(sheetPlayer.id); setSheetPlayerId(null) },
            },
            {
              label: sheetPlayer.loanListed ? '貸出歓迎を解除する' : '貸出歓迎にする（レンタル打診が来やすくなる）',
              color: C.blue,
              onClick: () => { toggleLoanListed(sheetPlayer.id); setSheetPlayerId(null) },
            },
            {
              label: sheetPlayer.transferListed ? '売出を取り下げる' : '売出する（市場価値で自動売却・成立時に通知）',
              color: C.orange,
              onClick: () => {
                if (sheetPlayer.transferListed) cancelSellListing(sheetPlayer.id)
                else allowPlayerTransfer(sheetPlayer.id)
                setSheetPlayerId(null)
              },
            },
          ]}
        />
      )}
    </div>
  )
}
