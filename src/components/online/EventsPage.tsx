import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import MenuButton from '../ui/MenuButton'
import { fetchEvent, type RatedEventInfo } from '../../lib/ratedApi'
import { C, alpha, FONT, F } from '../../styles/tokens'

// ============================================================================
// **オンラインのイベント一覧。**
//
// ★以前はオンラインの「イベント」行が `/online/rated` へ直接飛んでいて、押した瞬間に
//   見出しが「イベント」から「レート戦」に変わり、間に何も無かった。ランクマッチ以外の
//   イベントもやるので一覧を挟む（オーナー・2026-08-14「別もやるから分けて」）。
//
// ★**載せるのはオンラインのイベントだけ。** カード強化の大成功アップ（`data/events.ts`）
//   のような「押して入る場所ではない・期間中ずっと効いている効果」を混ぜないこと
//   （オーナーの指摘「イベント一覧になんでオンラインと関係ないもんのせんの？」）。
//
// ★大会の情報は `lib/ratedApi` の `fetchEvent` 1本。**始まる前でも返る**ので、
//   始まる前でも行が出せる（以前はここが null で、空の画面が出ていた）。
//
// ★**説明を書かないこと**（オーナー・2026-08-14「説明消して」「まじで直書きの説明
//   クソダサいから」）。大会の名前も日程も出さない——行が2行に折り返して読みにくかった。
//   遊びかたは中の `?`（`components/rated/ratedRules`）から見る。
// ============================================================================

export default function EventsPage() {
  const navigate = useNavigate()
  const [ev, setEv] = useState<RatedEventInfo | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { void fetchEvent().then(e => { setEv(e); setLoaded(true) }) }, [])

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100dvh' }}>
      <PageHeader eyebrow="EVENTS" title="イベント" />

      <div style={{ padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ev && (
          <MenuButton
            label="ランクマッチ"
            en="RANKED MATCH"
            color={C.green}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 8.5l5.2-.8L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
              </svg>
            }
            onClick={() => navigate('/online/rated')}
          />
        )}

        {loaded && !ev && (
          <div style={{
            padding: '28px 18px', textAlign: 'center', color: C.textGhost, fontSize: F.sub,
            border: `1px solid ${alpha(C.border3, 0.7)}`,
          }}>いま開催しているイベントはありません</div>
        )}
      </div>

    </div>
  )
}
