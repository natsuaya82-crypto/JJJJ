import { useGameStore } from '../../store/gameStore'
import BackButton from '../ui/BackButton'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Qualifier = { id: string; name: string; shortName: string; leagueName: string; colors: { primary: string; secondary: string }; isPlayerTeam: boolean }

export default function EclPage() {
  const { currentSeason, teams, foreignLeagues, playerTeamId, simulateEcl } = useGameStore()
  const result = currentSeason.eclResult
  const phase = currentSeason.phase

  // ECLはカレンダー配置・調整が済むまで非公開（開催ボタン・結果を出さない）。コードは温存。
  const ECL_ENABLED = false
  if (!ECL_ENABLED) {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, padding: '12px 16px' }}>
        <BackButton />
        <div style={{ padding: '60px 20px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA, fontSize: 13 }}>
          準備中
        </div>
      </div>
    )
  }

  // 出場チーム（日本上位2＋海外各リーグ上位2）を算出（プレビュー/未開催時用）
  const qualifiers: Qualifier[] = []
  const std = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  std.slice(0, 2).forEach(s => {
    const t = teams.find(tm => tm.id === s.teamId)
    if (t) qualifiers.push({ id: t.id, name: t.name, shortName: t.shortName, leagueName: 'JPEL', colors: t.colors, isPlayerTeam: t.id === playerTeamId })
  })
  const fs = currentSeason.foreignStandings ?? {}
  for (const league of foreignLeagues ?? []) {
    ;[...(fs[league.id] ?? [])].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 2).forEach(s => {
      const club = league.clubs.find(c => c.id === s.clubId)
      if (club) qualifiers.push({ id: club.id, name: club.name, shortName: club.shortName, leagueName: league.name, colors: club.colors, isPlayerTeam: false })
    })
  }

  const canHold = phase === 'postseason'
  const champion = result?.standings.find(s => s.id === result.championId)

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <BackButton />
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.gold, textShadow: `0 0 16px ${alpha(C.gold, 0.3)}` }}>ECL</div>
        </div>
        <div style={{ fontSize: 11, color: C.textDim }}>エキデン・チャンピオンズリーグ — 日本＋海外各リーグの上位2チームが3戦で世界一を争う</div>
      </div>

      {/* 未開催：出場チームと開催ボタン */}
      {!result && (
        <div style={{ padding: '4px 12px' }}>
          {!canHold && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: C.surface2, border: `1px solid ${C.border2}`, color: C.textSub, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
              本編シーズン（全{currentSeason.races.length}戦）終了後に開催できます。
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 800, color: C.textSub, letterSpacing: '0.1em', marginBottom: 8 }}>出場予定 · {qualifiers.length}チーム</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {qualifiers.map(q => <QualRow key={q.id} q={q} />)}
          </div>
          {canHold && (
            <button onClick={() => simulateEcl()} className="btn-press"
              style={{ width: '100%', marginTop: 16, padding: 15, borderRadius: 12, border: `2px solid ${C.goldDark}`, cursor: 'pointer', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: C.gold, fontFamily: SAIRA, fontSize: 16, fontWeight: 900, boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
              ECLを開催する
            </button>
          )}
        </div>
      )}

      {/* 開催後：結果 */}
      {result && (
        <div style={{ padding: '4px 12px' }}>
          {champion && (
            <div style={{ padding: '16px 14px', borderRadius: 14, marginBottom: 14, textAlign: 'center', background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.5)}`, boxShadow: `0 4px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)` }}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', marginBottom: 8 }}>{result.year} ECL CHAMPION</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <TeamLogoSVG primary={champion.colors.primary} secondary={champion.colors.secondary} shortName={champion.shortName} teamId={champion.id} size={40} />
                <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{champion.name}</div>
              </div>
              {champion.isPlayerTeam && <div style={{ marginTop: 8, fontSize: 12, color: C.gold, fontWeight: 800 }}>自チーム優勝！ 賞金1億を獲得</div>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px', gap: 8, padding: '4px 8px', marginBottom: 4 }}>
            <div style={{ fontSize: 8, color: C.textGhost, textAlign: 'center' }}>#</div>
            <div style={{ fontSize: 8, color: C.textGhost }}>チーム</div>
            <div style={{ fontSize: 8, color: C.textGhost, textAlign: 'center' }}>勝点</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {result.standings.map((s, idx) => {
              const rankColor = idx === 0 ? C.gold : idx === 1 ? '#9B97A8' : idx === 2 ? '#CD7F32' : C.textDim
              return (
                <div key={s.id} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 52px', gap: 8, alignItems: 'center', padding: '10px 10px', borderRadius: 11,
                  background: s.isPlayerTeam ? alpha(C.gold, 0.12) : `linear-gradient(135deg, ${s.colors.primary}15, ${C.surface2})`,
                  border: `1px solid ${s.isPlayerTeam ? alpha(C.gold, 0.5) : idx < 3 ? alpha(rankColor, 0.35) : C.border}`,
                }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: rankColor, textAlign: 'center' }}>{idx + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <TeamLogoSVG primary={s.colors.primary} secondary={s.colors.secondary} shortName={s.shortName} teamId={s.id} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{s.leagueName}{s.isForeign ? '' : '（国内）'}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: idx === 0 ? C.gold : C.text, textAlign: 'center' }}>{s.points}</div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 14, fontSize: 10, color: C.textDim }}>全{result.races.length}戦：{result.races.map(r => r.name).join(' / ')}</div>
        </div>
      )}
    </div>
  )
}

function QualRow({ q }: { q: Qualifier }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
      background: q.isPlayerTeam ? alpha(C.gold, 0.12) : `linear-gradient(135deg, ${q.colors.primary}15, ${C.surface2})`,
      border: `1px solid ${q.isPlayerTeam ? alpha(C.gold, 0.5) : C.border}`,
    }}>
      <TeamLogoSVG primary={q.colors.primary} secondary={q.colors.secondary} shortName={q.shortName} teamId={q.id} size={30} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</div>
        <div style={{ fontSize: 9, color: C.textDim }}>{q.leagueName}</div>
      </div>
    </div>
  )
}
