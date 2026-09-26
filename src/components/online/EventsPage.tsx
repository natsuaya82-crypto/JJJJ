import PageHeader from '../ui/PageHeader'
import { C, alpha, FONT, F } from '../../styles/tokens'

// ============================================================================
// **オンラインのイベント一覧。**
//
// ★ランクマッチは消しました（オーナー・2026-09-26「ランクマッチは消してください」）。
//   このページはこの先のオンラインのイベントのために残してあり、いまは空の一行だけ。
//
// ★**載せるのはオンラインのイベントだけ。** カード強化の大成功アップ（`data/events.ts`）
//   のような「押して入る場所ではない・期間中ずっと効いている効果」を混ぜないこと
//   （オーナーの指摘「イベント一覧になんでオンラインと関係ないもんのせんの？」）。
//
// ★**説明を書かないこと**（オーナー・2026-08-14「説明消して」「まじで直書きの説明
//   クソダサいから」）。
// ============================================================================

export default function EventsPage() {
  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100dvh' }}>
      <PageHeader eyebrow="EVENTS" title="イベント" />

      <div style={{ padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          padding: '28px 18px', textAlign: 'center', color: C.textGhost, fontSize: F.sub,
          border: `1px solid ${alpha(C.border3, 0.7)}`,
        }}>いま開催しているイベントはありません</div>
      </div>

    </div>
  )
}
