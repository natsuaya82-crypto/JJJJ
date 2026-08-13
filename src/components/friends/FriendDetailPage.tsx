import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import NoticeDialog from '../ui/NoticeDialog'
import ActionSheet from '../ui/ActionSheet'
import ReportSheet, { type ReportTarget } from './ReportSheet'
import { blockUser } from '../../lib/moderationApi'
import PlayerRow from '../player/PlayerRow'
import HofList from '../online/HofList'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { TeamLogoSVG } from '../icons/Icons'
import { getFriend, getFriendShare, removeFriend, listFriends, listSent, sendRequest, SEND_RESULT_TEXT, type SharedRoster } from '../../lib/friendsApi'
import { clubsOfUsers, type UserClub } from '../../lib/clubsApi'
import { clubLogoSrc } from '../../data/clubLogos'
import { titleRows } from '../../utils/teamHistory'
import { DIVISION_LABEL } from '../../utils/league'
import type { Specialty } from '../../types'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox, invalidateFriendsCache } from './friendsUi'
import { usePreviewStore } from '../../store/previewStore'
import { ovr } from '../../utils/playerUtils'
import { HOF_MAX } from '../../utils/hofRoster'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { panelStyle } from '../ui/Panel'


/** ロスターの並び替え。種目は「同じ種目でまとめて、中はOVR順」 */
type SortKey = 'ovr' | 'age' | 'spec'
const SPEC_ORDER: readonly Specialty[] = SPECIALTIES

// id が無いときに渡す空。ここで毎回 {} を作ると useFriendsQuery が引き直し続ける
const EMPTY_SHARE: SharedRoster = { players: [], hof: [] }

// 横に並べる2ページ。左＝いまのロスター、右＝殿堂入りチーム。
// 見出しを押しても、横にスワイプしても切り替わる
const PAGES = ['現在のロスター', '殿堂入り'] as const

export default function FriendDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const longPress = usePlayerLongPress()
  const setPreview = usePreviewStore(s => s.setPlayers)

  const head = useFriendsQuery(() => getFriend(id), [id], `friend:${id}`)
  const list = useFriendsQuery(() => (id ? getFriendShare(id) : Promise.resolve(EMPTY_SHARE)), [id], `roster:${id}`)
  // 所属している走友会。取れなくても画面は普通に出す（出ないだけ）
  const clubQ = useFriendsQuery(
    () => (id ? clubsOfUsers([id]) : Promise.resolve(new Map<string, UserClub>())),
    [id],
    `clubOf:${id}`,
  )
  // この画面は走友会のメンバー一覧からも開く。相手がフレンドとは限らないので、
  // 「解除」を出すか「申請」を出すかはフレンド一覧を見て決める。
  // 一覧が取れなかったときは元どおり「解除」を出す（フレンドから来た人が何もできなくなるのを防ぐ）
  const friendsQ = useFriendsQuery(listFriends, [], 'friends')
  const sentQ = useFriendsQuery(listSent, [], 'sent')
  const isFriend = friendsQ.data ? friendsQ.data.some(f => f.id === id) : friendsQ.error ? true : undefined
  const isSent = (sentQ.data ?? []).some(r => r.id === id)
  const friend = head.data
  const roster = list.data?.players ?? []
  const hof = list.data?.hof ?? []
  const club = id ? clubQ.data?.get(id) : undefined

  const [sortKey, setSortKey] = useState<SortKey>('ovr')

  // 横スワイプで見ているページ。0＝ロスター / 1＝殿堂入り
  const [page, setPage] = useState(0)
  const pagerRef = useRef<HTMLDivElement>(null)
  const goPage = (i: number) => {
    const el = pagerRef.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  const onPagerScroll = () => {
    const el = pagerRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    setPage(p => (p === i ? p : i))
  }

  // 自前のポップアップ（端末標準の alert / confirm は使わない）
  const [askRemove, setAskRemove] = useState(false)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState<ReportTarget | null>(null)
  const [askBlock, setAskBlock] = useState(false)

  // 相手の選手を「長押し詳細」で開けるよう、この画面の間だけプレビュー登録する。
  //
  // 見ているページのぶんだけ載せる。両方まとめて載せられないのは、殿堂入りが
  // 「登録した瞬間を凍らせたコピー」で、同じ選手がいまのロスターにも居ることがあるため。
  // IDが同じなので、まとめると片方の姿しか開けなくなる（殿堂入りを開いたのに今の能力が出る）。
  //
  // list.data を依存にする（roster / hof は毎レンダー新しい配列になるため、入れると無限ループする）
  useEffect(() => {
    const share = list.data ?? EMPTY_SHARE
    setPreview(page === 0 ? share.players : share.hof.map(h => h.player))
    return () => setPreview([])
  }, [id, list.data, page]) // eslint-disable-line react-hooks/exhaustive-deps

  if (head.loading) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px', minHeight: '100%', background: C.bg }}>
        <BackButton />
        <div style={{ marginTop: 40 }}><LoadingBox /></div>
      </div>
    )
  }
  if (head.error) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px', minHeight: '100%', background: C.bg }}>
        <BackButton />
        <div style={{ marginTop: 40 }}><ErrorBox onRetry={head.reload} /></div>
      </div>
    )
  }
  if (!friend) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px' }}>
        <BackButton />
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 14, padding: '60px 0' }}>フレンドが見つかりません</div>
      </div>
    )
  }

  const avgOvr = roster.length ? Math.round(roster.reduce((s, p) => s + ovr(p), 0) / roster.length) : 0
  // 通算優勝は**部ごと**に出す（3部で3回と1部で3回を同じ「3回」にしない）。
  // 内訳を送っていない古い版の相手だけ、今までどおり合計を出す
  const rows = friend ? titleRows(friend.titles) : []
  const champsText = rows.length > 0
    ? rows.map(r => `${DIVISION_LABEL[r.division]}${r.count}`).join(' / ')
    : `${friend?.champs ?? 0}回`

  const sorted = [...roster].sort((a, b) => {
    if (sortKey === 'age') return a.age - b.age || ovr(b) - ovr(a)
    if (sortKey === 'spec') {
      return SPEC_ORDER.indexOf(a.specialty) - SPEC_ORDER.indexOf(b.specialty) || ovr(b) - ovr(a)
    }
    return ovr(b) - ovr(a)
  })

  const onRemove = async () => {
    setAskRemove(false)
    try {
      await removeFriend(friend.id)
      invalidateFriendsCache('friends', `friend:${friend.id}`, `roster:${friend.id}`)
      navigate('/friends/list', { replace: true })
    } catch { setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' }) }
  }

  // まだフレンドでない相手（走友会で見つけた人など）に申請を送る
  const onAdd = async () => {
    try {
      const r = await sendRequest(friend.code)
      invalidateFriendsCache('friends', 'sent', 'received')
      friendsQ.reload(); sentQ.reload()
      setNotice(SEND_RESULT_TEXT[r])
    } catch { setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' }) }
  }

  // ブロックするとフレンドも自動で解除されるので、そのまま一覧へ戻す
  const onBlock = async () => {
    setAskBlock(false)
    const ok = await blockUser(friend.id)
    if (!ok) { setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' }); return }
    invalidateFriendsCache('friends', 'received', 'sent', 'clubFeed', 'myClub', `friend:${friend.id}`, `roster:${friend.id}`)
    navigate('/friends/list', { replace: true })
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 32, minHeight: '100%', background: C.bg }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 6px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '3px', fontWeight: 900 }}>FRIEND</div>
        <div style={{ flex: 1 }} />
        {isFriend === true && (
          <button onClick={() => setAskRemove(true)} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>解除</button>
        )}
        {isFriend === false && isSent && (
          <span style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, color: C.textDim, fontSize: 11, fontWeight: 800, fontFamily: SAIRA }}>申請中</span>
        )}
        {isFriend === false && !isSent && (
          <button onClick={() => { void onAdd() }} className="btn-press" style={{ padding: '5px 10px', borderRadius: 8, border: `2px solid ${alpha(C.gold, 0.6)}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, color: C.gold, fontSize: 11, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>＋フレンド</button>
        )}
        <button onClick={() => setMenu(true)} aria-label="メニュー" style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 13, fontWeight: 900, fontFamily: SAIRA, letterSpacing: '1px', cursor: 'pointer' }}>···</button>
      </div>

      {/* チーム情報 */}
      <div style={{ ...panelStyle(C.gold), margin: '4px 12px 0', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamLogoSVG primary={friend.primary} secondary={friend.secondary} shortName={friend.shortName} logoId={friend.logoId} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>{friend.teamName}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, marginTop: 3 }}>GM {friend.gmName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[['平均OVR', `${avgOvr}`], ['最終ログイン', friend.lastLogin], ['通算優勝', champsText]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, padding: '9px 8px', borderRadius: 10, background: alpha(C.bg, 0.4), border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.text, fontFamily: SAIRA }}>{v}</div>
            </div>
          ))}
        </div>
        {club && (
          // 押すと走友会の画面が、この走友会を探した状態で開く
          <button
            onClick={() => navigate(`/friends/club?code=${club.code}`)}
            className="btn-press"
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', borderRadius: 10, background: alpha(C.bg, 0.4), border: `1px solid ${C.border}`, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <img src={clubLogoSrc(club.logoId)} alt="" width={22} height={22} draggable={false} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} />
            <div style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>走友会</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
            <div style={{ flex: 1 }} />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.goldDark, flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {/* ロスターと殿堂入りを横に並べる。スワイプでも見出しのタップでも切り替わる */}
      <div style={{ padding: '16px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, padding: '0 16px' }}>
          {PAGES.map((label, i) => (
            <button
              key={label}
              onClick={() => goPage(i)}
              style={{
                padding: '2px 0 4px', background: 'none', cursor: 'pointer', fontFamily: SAIRA,
                fontSize: 10, letterSpacing: '2px', fontWeight: 900,
                color: page === i ? C.gold : C.textGhost,
                border: 'none', borderBottom: `2px solid ${page === i ? C.gold : 'transparent'}`,
              }}
            >{label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10, color: C.textGhost }}>長押しで詳細</div>
        </div>

        {list.loading ? (
          <div style={{ padding: '0 16px' }}><LoadingBox /></div>
        ) : list.error ? (
          <div style={{ padding: '0 16px' }}><ErrorBox onRetry={list.reload} /></div>
        ) : (
          <div
            ref={pagerRef}
            onScroll={onPagerScroll}
            style={{
              display: 'flex', alignItems: 'flex-start', overflowX: 'auto', overflowY: 'hidden',
              scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            }}
          >
            {/* 左：いまのロスター（全員）。既存の PlayerRow をそのまま流用 */}
            <div style={{ minWidth: '100%', flexShrink: 0, scrollSnapAlign: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 8px' }}>
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  aria-label="並び替え"
                  style={{ padding: '5px 8px', borderRadius: 10, border: `1px solid ${C.border2}`, backgroundColor: C.border, color: C.textSub, fontSize: 11, fontFamily: SAIRA, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
                  <option value="ovr">OVR順</option>
                  <option value="age">年齢順</option>
                  <option value="spec">種目順</option>
                </select>
              </div>
              {roster.length === 0 ? (
                <div style={{ padding: '0 16px' }}><EmptyBox label="相手がまだロスターを共有していません" /></div>
              ) : (
                sorted.map(p => (
                  <PlayerRow key={p.id} player={p} handlers={{ ...longPress(p.id), onClick: () => {} }} />
                ))
              )}
            </div>

            {/* 右：殿堂入りチーム。自分の殿堂入りページと同じ一覧（HofList） */}
            <div style={{ minWidth: '100%', flexShrink: 0, scrollSnapAlign: 'start' }}>
              <HofList
                hof={hof}
                hint={`殿堂入り ${hof.length}/${HOF_MAX}`}
                emptyLabel="まだ誰もいません"
                emptySub="相手が殿堂入りに登録すると、ここに並びます"
              />
            </div>
          </div>
        )}
      </div>

      {askRemove && (
        <ConfirmDialog
          title="フレンドを解除しますか？"
          message={`${friend.teamName}（GM ${friend.gmName}）とのフレンドを解除します。相手の一覧からもあなたが消えます。`}
          confirmLabel="解除する"
          accent={C.red}
          onConfirm={onRemove}
          onCancel={() => setAskRemove(false)}
        />
      )}

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: '通報する', color: C.red, onClick: () => { setReporting({ userId: friend.id, name: friend.teamName }); setMenu(false) } },
          { label: 'この相手をブロックする', color: C.red, onClick: () => { setAskBlock(true); setMenu(false) } },
        ]}
      />
      {reporting && (
        <ReportSheet
          target={reporting}
          onClose={() => setReporting(null)}
          onDone={(message, blocked) => {
            setReporting(null)
            if (blocked) {
              invalidateFriendsCache('friends', 'received', 'sent', 'clubFeed', 'myClub', `friend:${friend.id}`, `roster:${friend.id}`)
              navigate('/friends/list', { replace: true })
              return
            }
            setNotice({ title: message })
          }}
        />
      )}
      {askBlock && (
        <ConfirmDialog
          title={`${friend.teamName} をブロックしますか？`}
          message="この相手の名前と書き込みは表示されなくなります。フレンドも解除されます。"
          confirmLabel="ブロック" accent={C.red}
          onConfirm={() => { void onBlock() }}
          onCancel={() => setAskBlock(false)}
        />
      )}

      {notice && (
        <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />
      )}
    </div>
  )
}
