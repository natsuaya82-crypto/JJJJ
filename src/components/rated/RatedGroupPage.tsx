// **自分の部屋（その日の組）。**
//
// ■なぜ要るのか（オーナー・2026-08-19）
//   「当日はまずレート分けされて部屋が見れるんでしょ？へやをみるとこは？」
//
//   組はもともと**締め切りのあと**（23:59に走らせる直前）に割っていたので、
//   当日のあいだは「自分の部屋」がそもそも存在しませんでした。
//   受付が開く 10:00 に組を決めて保存するようにして、ここで見せます。
//
// ★新しい見た目は作りません。行は順位表とまったく同じ `Row`、
//   殻も同じ `RatedShell`（オーナー・2026-08-15「基本元あるやつを使えや」）。
import { useEffect, useState } from 'react'
import { RatedShell } from './ratedUi'
import { Row } from './RatedStandingsPage'
import { fetchMyGroup, type RatedGroup } from '../../lib/ratedApi'
import { C, alpha, SAIRA, F } from '../../styles/tokens'

export default function RatedGroupPage() {
  const [g, setG] = useState<RatedGroup | null | 'loading'>('loading')
  useEffect(() => { void fetchMyGroup().then(v => setG(v)) }, [])
  if (g === 'loading') return null

  return (
    <RatedShell title="あなたの部屋">
      {/* ★組に入っていないときは**理由を出す**（黙って空にしない）。
          10:00 より後にエントリーした人はその日走らない＝翌日の 10:00 で組に入る */}
      {!g ? (
        <div style={{ padding: '22px 14px', textAlign: 'center', fontSize: F.body, color: C.textDim, lineHeight: 1.8 }}>
          今日の組にはまだ入っていません。<br />
          組は毎日10:00に決まります。次の10:00から走れます。
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
            padding: '10px 12px', background: alpha(C.cyan, 0.10), border: `1px solid ${alpha(C.cyan, 0.4)}`,
          }}>
            <span style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: 900, color: C.cyan }}>
              GROUP {g.groupNo}
            </span>
            <span style={{ fontSize: F.label, color: C.textDim }}>
              / {g.groups}組 ・ {g.members.length}人
            </span>
          </div>
          <div style={{ overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {g.members.map((m, i) => <Row key={m.userId} r={m} rank={i + 1} started={false} />)}
          </div>
          <div style={{ marginTop: 8, fontSize: F.label, color: C.textDim, lineHeight: 1.7 }}>
            この顔ぶれで今日のレースを走ります。順位は 23:59 の締め切り後に決まります。
          </div>
        </>
      )}
    </RatedShell>
  )
}
