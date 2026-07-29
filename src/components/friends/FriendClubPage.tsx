import { useState } from 'react'
import BackButton from '../ui/BackButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import NoticeDialog from '../ui/NoticeDialog'
import { TeamLogoSVG } from '../icons/Icons'
import { CLUB_LOGOS, CLUB_LOGO_DEFAULT, clubLogoSrc } from '../../data/clubLogos'
import { formatCode } from '../../lib/friendsApi'
import {
  CLUB_MAX, JOIN_TYPE_LABEL, searchClubs, myClub, myClubRequests, createClub, joinClub,
  cancelClubRequest, listClubRequests, approveClubRequest, rejectClubRequest,
  leaveClub, kickClubMember, updateClub,
  CLUB_PHRASES, CLUB_REQ_CAP, clubFeed, postClubMessage, postClubRequest,
  donateClubCard, clubGiftCount, claimClubGifts,
  type ClubBrief, type ClubForm, type ClubMember, type ClubPost, type ClubReqRarity,
  type JoinType, type MyClub,
} from '../../lib/clubsApi'
import { useGameStore } from '../../store/gameStore'
import { RARITY_COLORS, RARITY_LABELS, CARD_NAMES } from '../../utils/cardCombo'
import TrainingCardSVG from '../training/TrainingCardSVG'
import type { TrainingCard } from '../../types'
import { useFriendsQuery, invalidateFriendsCache, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const JOIN_COLOR: Record<JoinType, string> = {
  open: C.green, approval: C.cyan, closed: C.textGhost,
}
const OVR_CHOICES = [0, 60, 65, 70, 75, 80]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
  border: `1px solid ${C.border3}`, background: alpha('#000', 0.25),
  color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.gold, letterSpacing: '1px', margin: '16px 4px 6px' }}>
      {children}
    </div>
  )
}

/** 走友会のロゴ。チームのロゴとは別のプリセット（public/logos/club）を使う */
function ClubLogo({ logoId, size = 44 }: { logoId: string; size?: number }) {
  return (
    <img
      src={clubLogoSrc(logoId)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  )
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 6, fontSize: 9, fontWeight: 900, fontFamily: SAIRA,
      color, border: `1px solid ${alpha(color, 0.5)}`, background: alpha(color, 0.12),
    }}>{children}</span>
  )
}

function actionButton(color: string, disabled = false): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 9, flexShrink: 0, cursor: disabled ? 'default' : 'pointer',
    border: `2px solid ${alpha(color, disabled ? 0.25 : 0.6)}`,
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    color: disabled ? C.textGhost : color, fontSize: 12, fontWeight: 900, fontFamily: SAIRA,
  }
}

// ── 検索結果の1件 ─────────────────────────────────────
function ClubCard({ club, right }: { club: ClubBrief; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
      background: C.surface2, border: `1px solid ${C.border2}`,
    }}>
      <ClubLogo logoId={club.logoId} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {club.name}
          </span>
          <Pill color={JOIN_COLOR[club.joinType]}>{JOIN_TYPE_LABEL[club.joinType]}</Pill>
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {club.note || 'ひとことなし'}
        </div>
        <div style={{
          fontSize: 10, color: C.textGhost, marginTop: 3, fontFamily: SAIRA,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {club.members}/{CLUB_MAX}人 ・ 平均OVR {club.avgOvr}
          {club.minOvr > 0 && <span style={{ color: alpha(C.orange, 0.9) }}> ・ 条件OVR{club.minOvr}+</span>}
        </div>
      </div>
      {right}
    </div>
  )
}

// ── 設定フォーム（作るとき・直すとき共通） ─────────────────
function ClubEditor({ initial, title, okLabel, busy, onSubmit, onCancel }: {
  initial: ClubForm; title: string; okLabel: string; busy: boolean
  onSubmit: (f: ClubForm) => void; onCancel: () => void
}) {
  const [f, setF] = useState<ClubForm>(initial)
  const set = <K extends keyof ClubForm>(k: K, v: ClubForm[K]) => setF(p => ({ ...p, [k]: v }))

  return (
    <div style={{ padding: '0 12px' }}>
      <SectionLabel>{title}</SectionLabel>

      <div style={{ padding: 12, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>走友会名（16文字まで）</div>
          <input value={f.name} maxLength={16} placeholder="多摩川ランナーズ"
            onChange={e => set('name', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>ひとこと（40文字まで）</div>
          <input value={f.note} maxLength={40} placeholder="朝練メインのゆるい会です"
            onChange={e => set('note', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>ロゴ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {CLUB_LOGOS.map(id => (
              <button key={id} type="button" onClick={() => set('logoId', id)} style={{
                aspectRatio: '1', borderRadius: 9, cursor: 'pointer', padding: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: alpha('#000', 0.25),
                border: f.logoId === id ? `2px solid ${C.gold}` : `1px solid ${alpha(C.gold, 0.14)}`,
              }}>
                <ClubLogo logoId={id} size={38} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>参加タイプ</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['open', 'approval', 'closed'] as JoinType[]).map(t => (
              <button key={t} type="button" onClick={() => set('joinType', t)} style={{
                flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', fontFamily: SAIRA,
                fontSize: 11, fontWeight: 900,
                color: f.joinType === t ? C.bg : C.textDim,
                background: f.joinType === t ? JOIN_COLOR[t] : alpha('#000', 0.25),
                border: `1px solid ${f.joinType === t ? JOIN_COLOR[t] : C.border3}`,
              }}>{JOIN_TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.textGhost, marginTop: 4, lineHeight: 1.5 }}>
            誰でも歓迎＝条件を満たせばそのまま加入／承認制＝会長が承認したら加入／募集停止＝新しく入れない
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>入会条件（チーム平均OVR）</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {OVR_CHOICES.map(v => (
              <button key={v} type="button" onClick={() => set('minOvr', v)} style={{
                flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: SAIRA,
                fontSize: 11, fontWeight: 900,
                color: f.minOvr === v ? C.bg : C.textDim,
                background: f.minOvr === v ? C.gold : alpha('#000', 0.25),
                border: `1px solid ${f.minOvr === v ? C.gold : C.border3}`,
              }}>{v === 0 ? 'なし' : `${v}+`}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} className="btn-press" style={{ ...actionButton(C.textDim), flex: 1, padding: '12px 0' }}>
          やめる
        </button>
        <button
          onClick={() => onSubmit({ ...f, name: f.name.trim() })}
          disabled={busy || f.name.trim().length === 0}
          className="btn-press"
          style={{ ...actionButton(C.gold, busy || f.name.trim().length === 0), flex: 2, padding: '12px 0' }}
        >{busy ? '送信中…' : okLabel}</button>
      </div>
    </div>
  )
}

// ── 未所属：検索画面 ───────────────────────────────────
function ClubSearch({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')          // 実際に検索に使っている言葉
  const list = useFriendsQuery(() => searchClubs(term), [term], term === '' ? 'clubReco' : undefined)
  const sent = useFriendsQuery(myClubRequests, [], 'clubReqSent')
  const [busy, setBusy] = useState('')
  const [making, setMaking] = useState(false)
  const [confirm, setConfirm] = useState<ClubBrief | null>(null)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)

  const requested = new Set(sent.data ?? [])

  const refresh = () => {
    invalidateFriendsCache('myClub', 'clubReco', 'clubReqSent')
    list.reload(); sent.reload(); onChanged()
  }

  const onJoin = async (club: ClubBrief) => {
    setConfirm(null); setBusy(club.id)
    try {
      const r = await joinClub(club.id)
      if (r === 'joined') { refresh(); return }
      if (r === 'requested') { setNotice({ title: '申請しました', message: '会長が承認すると加入できます' }); refresh(); return }
      setNotice({
        title: '入れませんでした',
        message:
          r === 'full' ? 'この走友会は満員です' :
          r === 'closed' ? 'いまは募集を止めています' :
          r === 'low_ovr' ? `チーム平均OVRが ${club.minOvr} 以上ないと入れません` :
          r === 'already' ? 'すでに走友会に入っています' : '走友会が見つかりませんでした',
      })
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onCancelReq = async (club: ClubBrief) => {
    setBusy(club.id)
    try { await cancelClubRequest(club.id); refresh() }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onCreate = async (f: ClubForm) => {
    setBusy('new')
    try { await createClub(f); setMaking(false); refresh() }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  if (making) {
    return (
      <ClubEditor
        title="走友会を作る"
        okLabel="この内容で作る"
        initial={{ name: '', note: '', logoId: CLUB_LOGO_DEFAULT, joinType: 'open', minOvr: 0 }}
        busy={busy === 'new'}
        onSubmit={onCreate}
        onCancel={() => setMaking(false)}
      />
    )
  }

  return (
    <>
      <div style={{ padding: '0 12px' }}>
        {/* 検索窓 */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setTerm(q) }}
            placeholder="走友会名 または コード10桁"
            style={inputStyle}
          />
          <button onClick={() => setTerm(q)} className="btn-press" style={actionButton(C.gold)}>探す</button>
        </div>

        <SectionLabel>{term ? `「${term}」の検索結果` : 'おすすめの走友会'}</SectionLabel>

        {list.loading ? <LoadingBox /> :
         list.error ? <ErrorBox onRetry={list.reload} /> :
         (list.data ?? []).length === 0 ? (
           <EmptyBox label={term ? '見つかりませんでした' : 'まだ走友会がありません。最初の1つを作ってみましょう'} />
         ) : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             {(list.data ?? []).map(c => (
               <ClubCard key={c.id} club={c} right={
                 requested.has(c.id) ? (
                   <button onClick={() => onCancelReq(c)} disabled={busy === c.id} className="btn-press" style={actionButton(C.textDim)}>
                     申請中
                   </button>
                 ) : (
                   <button
                     onClick={() => setConfirm(c)}
                     disabled={busy === c.id || c.joinType === 'closed' || c.members >= CLUB_MAX}
                     className="btn-press"
                     style={actionButton(c.joinType === 'approval' ? C.cyan : C.gold, busy === c.id || c.joinType === 'closed' || c.members >= CLUB_MAX)}
                   >
                     {c.members >= CLUB_MAX ? '満員' : c.joinType === 'closed' ? '停止中' : c.joinType === 'approval' ? '申請' : '入る'}
                   </button>
                 )
               } />
             ))}
           </div>
         )}

        <SectionLabel>自分で作る</SectionLabel>
        <button onClick={() => setMaking(true)} className="btn-press" style={{
          width: '100%', padding: '14px', borderRadius: 12, cursor: 'pointer',
          border: `2px solid ${C.goldDark}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          color: C.gold, fontSize: 14, fontWeight: 900, fontFamily: SAIRA,
        }}>走友会を作る</button>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.joinType === 'approval' ? 'この走友会に申請しますか？' : 'この走友会に入りますか？'}
          confirmLabel={confirm.joinType === 'approval' ? '申請する' : '入る'}
          accent={C.gold}
          onConfirm={() => onJoin(confirm)}
          onCancel={() => setConfirm(null)}
        >
          <div style={{ marginTop: 10 }}><ClubCard club={confirm} /></div>
        </ConfirmDialog>
      )}
      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </>
  )
}

// ── 所属あり：走友会の中 ───────────────────────────────
function MemberRow({ m, canKick, onKick }: { m: ClubMember; canKick: boolean; onKick: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12,
      background: C.surface2, border: `1px solid ${C.border2}`,
    }}>
      <TeamLogoSVG primary={m.primary} secondary={m.secondary} shortName={m.shortName} logoId={m.logoId} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.teamName}
          </span>
          {m.role === 'owner' && <Pill color={C.gold}>会長</Pill>}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>GM {m.gmName} ・ {m.lastLogin}</div>
      </div>
      {canKick && (
        <button onClick={onKick} className="btn-press" style={actionButton(C.red)}>外す</button>
      )}
    </div>
  )
}

// ── 掲示板 ───────────────────────────────────────────
const REQ_RARITIES: ClubReqRarity[] = ['normal', 'rare', 'epic']

function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  return `${Math.floor(hour / 24)}日前`
}

/** 渡すカードを選ぶ。手持ちのうち、要求されたレアリティの通常カードだけ出す */
function DonatePicker({ rarity, cards, busy, onPick, onCancel }: {
  rarity: ClubReqRarity; cards: TrainingCard[]; busy: boolean
  onPick: (c: TrainingCard) => void; onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title={`${RARITY_LABELS[rarity]}カードを1枚わたす`}
      confirmLabel="やめる"
      accent={C.textDim}
      onConfirm={onCancel}
      onCancel={onCancel}
    >
      {cards.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          渡せる{RARITY_LABELS[rarity]}カードを持っていません。
        </div>
      ) : (
        <div style={{
          marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          maxHeight: 240, overflowY: 'auto',
        }}>
          {cards.map(c => (
            <button key={c.id} type="button" disabled={busy} onClick={() => onPick(c)} style={{
              background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <TrainingCardSVG statKey={c.statKey} rarity={c.rarity} width={58} />
              <span style={{ fontSize: 8, color: C.textGhost }}>{CARD_NAMES[c.statKey]}</span>
            </button>
          ))}
        </div>
      )}
    </ConfirmDialog>
  )
}

function ClubBoard() {
  const feed = useFriendsQuery(clubFeed, [], 'clubFeed')
  const gifts = useFriendsQuery(clubGiftCount, [], 'clubGifts')
  const myCards = useGameStore(s => s.trainingCards)
  const removeTrainingCard = useGameStore(s => s.removeTrainingCard)
  const addTrainingCards = useGameStore(s => s.addTrainingCards)
  const [busy, setBusy] = useState('')
  const [picking, setPicking] = useState<ClubPost | null>(null)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)

  const posts = feed.data ?? []
  // 今日もうお願いしたか（サーバーと同じ判定を手元でも出して、ボタンを先に止める）
  const askedToday = posts.some(p =>
    p.mine && p.kind === 'req' && new Date(p.createdAt).toDateString() === new Date().toDateString())

  const refresh = () => {
    invalidateFriendsCache('clubFeed', 'clubGifts')
    feed.reload(); gifts.reload()
  }

  const cardsOf = (rarity: ClubReqRarity) =>
    (myCards ?? []).filter(c => c.rarity === rarity && c.kind !== 'rest')

  const onPhrase = async (i: number) => {
    setBusy('msg')
    try {
      const r = await postClubMessage(i)
      if (r === 'too_fast') setNotice({ title: '少し待ってください', message: '書き込みは1分に1回までです' })
      else refresh()
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onAsk = async (rarity: ClubReqRarity) => {
    setBusy('req')
    try {
      const r = await postClubRequest(rarity)
      if (r === 'today_done') setNotice({ title: '今日はもうお願いしています', message: 'カードのお願いは1日1回までです' })
      else refresh()
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onDonate = async (post: ClubPost, card: TrainingCard) => {
    setBusy(post.id)
    try {
      const r = await donateClubCard(post.id, card)
      if (r === 'ok') {
        removeTrainingCard(card.id)     // 渡せたときだけ手元から減らす
        setPicking(null); refresh()
      } else {
        setPicking(null)
        setNotice({
          title: 'わたせませんでした',
          message:
            r === 'full' ? 'もう必要な枚数が集まっています' :
            r === 'already' ? 'このお願いにはもう渡しています' :
            r === 'mine' ? '自分のお願いには渡せません' :
            r === 'bad_card' ? 'このカードは渡せません' : 'お願いが見つかりませんでした',
        })
        refresh()
      }
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onClaim = async () => {
    setBusy('claim')
    try {
      const cards = await claimClubGifts()
      if (cards.length > 0) addTrainingCards(cards)
      setNotice({
        title: cards.length > 0 ? `カードを${cards.length}枚 受け取りました` : '受け取るカードはありません',
        message: cards.length > 0 ? 'カード一覧に入っています' : undefined,
      })
      refresh()
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  return (
    <>
      <div style={{ padding: '0 12px' }}>
        {(gifts.data ?? 0) > 0 && (
          <>
            <SectionLabel>もらったカード</SectionLabel>
            <button onClick={onClaim} disabled={busy === 'claim'} className="btn-press" style={{
              ...actionButton(C.gold, busy === 'claim'), width: '100%', padding: '13px 0',
            }}>{gifts.data}枚 受け取る</button>
          </>
        )}

        <SectionLabel>カードをお願いする（1日1回）</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {REQ_RARITIES.map(r => (
            <button key={r} onClick={() => onAsk(r)} disabled={busy === 'req' || askedToday}
              className="btn-press" style={{
                ...actionButton(RARITY_COLORS[r], busy === 'req' || askedToday),
                flex: 1, padding: '11px 0',
              }}>
              {RARITY_LABELS[r]} {CLUB_REQ_CAP[r]}枚
            </button>
          ))}
        </div>
        {askedToday && (
          <div style={{ fontSize: 9, color: C.textGhost, marginTop: 5 }}>
            今日はもうお願いしています。日付が変わるとまた出せます。
          </div>
        )}

        <SectionLabel>ひとこと書く</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
          {CLUB_PHRASES.map((p, i) => (
            <button key={p} onClick={() => onPhrase(i)} disabled={busy === 'msg'} className="btn-press" style={{
              padding: '9px 2px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              border: `1px solid ${C.border3}`, background: alpha('#000', 0.25), color: C.textSub,
            }}>{p}</button>
          ))}
        </div>

        <SectionLabel>掲示板</SectionLabel>
        {feed.loading ? <LoadingBox /> :
         feed.error ? <ErrorBox onRetry={feed.reload} /> :
         posts.length === 0 ? <EmptyBox label="まだ何も書かれていません" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {posts.map(p => {
              const done = p.kind === 'req' && p.filled >= p.cap
              const canGive = p.kind === 'req' && !p.mine && !p.donated && !done
              const col = p.kind === 'req' && p.rarity ? RARITY_COLORS[p.rarity] : C.border2
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12,
                  background: C.surface2,
                  border: `1px solid ${p.kind === 'req' ? alpha(col, 0.45) : C.border2}`,
                }}>
                  <TeamLogoSVG primary={p.primary} secondary={p.secondary} shortName={p.shortName} logoId={p.logoId} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.teamName} ・ {ago(p.createdAt)}
                    </div>
                    {p.kind === 'msg' ? (
                      <div style={{ fontSize: 13, color: C.text, marginTop: 1 }}>
                        {CLUB_PHRASES[p.phrase] ?? ''}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.text, marginTop: 1 }}>
                        <span style={{ color: col, fontWeight: 900 }}>{RARITY_LABELS[p.rarity || 'normal']}</span>
                        カードください
                        <span style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, marginLeft: 6 }}>
                          {p.filled}/{p.cap}
                        </span>
                      </div>
                    )}
                  </div>
                  {p.kind === 'req' && (
                    done ? <Pill color={C.green}>集まりました</Pill> :
                    p.mine ? <Pill color={C.textDim}>お願い中</Pill> :
                    p.donated ? <Pill color={C.cyan}>わたし済み</Pill> :
                    canGive ? (
                      <button onClick={() => setPicking(p)} disabled={busy === p.id} className="btn-press"
                        style={actionButton(C.green, busy === p.id)}>わたす</button>
                    ) : null
                  )}
                </div>
              )
            })}
          </div>
         )}

        <div style={{ fontSize: 9, color: C.textGhost, marginTop: 12, lineHeight: 1.6 }}>
          書き込みは3日で消えます。カードを渡してもお礼はありません。レジェンドは渡せません。
        </div>
      </div>

      {picking && picking.rarity && (
        <DonatePicker
          rarity={picking.rarity}
          cards={cardsOf(picking.rarity)}
          busy={busy === picking.id}
          onPick={c => onDonate(picking, c)}
          onCancel={() => setPicking(null)}
        />
      )}
      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </>
  )
}

function ClubHome({ mine, onChanged }: { mine: MyClub; onChanged: () => void }) {
  const { club, members, isOwner } = mine
  const reqs = useFriendsQuery(() => (isOwner ? listClubRequests() : Promise.resolve([])), [isOwner], 'clubReqIn')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmKick, setConfirmKick] = useState<ClubMember | null>(null)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)
  const [tab, setTab] = useState<'members' | 'board'>('members')

  const refresh = () => {
    invalidateFriendsCache('myClub', 'clubReco', 'clubReqIn', 'clubReqSent')
    reqs.reload(); onChanged()
  }

  const onLeave = async () => {
    setConfirmLeave(false); setBusy('leave')
    try {
      const r = await leaveClub()
      if (r === 'disbanded') setNotice({ title: '解散しました', message: '最後の1人だったので走友会は無くなりました' })
      refresh()
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onKick = async (m: ClubMember) => {
    setConfirmKick(null); setBusy(m.id)
    try { await kickClubMember(m.id); refresh() }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onApprove = async (id: string, ok: boolean) => {
    setBusy(id)
    try {
      if (ok) await approveClubRequest(id)
      else await rejectClubRequest(id)
      refresh()
    }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onSave = async (f: ClubForm) => {
    setBusy('edit')
    try { await updateClub(f); setEditing(false); refresh() }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  if (editing) {
    return (
      <ClubEditor
        title="走友会の設定"
        okLabel="保存する"
        initial={{ name: club.name, note: club.note, logoId: club.logoId, joinType: club.joinType, minOvr: club.minOvr }}
        busy={busy === 'edit'}
        onSubmit={onSave}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <>
      <div style={{ padding: '0 12px' }}>
        {/* 走友会カード */}
        <div style={{
          padding: 14, borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClubLogo logoId={club.logoId} size={54} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>{club.name}</span>
                <Pill color={JOIN_COLOR[club.joinType]}>{JOIN_TYPE_LABEL[club.joinType]}</Pill>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>{club.note || 'ひとことなし'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[
              { k: '人数', v: `${club.members}/${CLUB_MAX}` },
              { k: '平均OVR', v: String(club.avgOvr) },
              { k: '入会条件', v: club.minOvr > 0 ? `OVR${club.minOvr}+` : 'なし' },
            ].map(s => (
              <div key={s.k} style={{ flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 9, background: alpha('#000', 0.25) }}>
                <div style={{ fontSize: 9, color: C.textGhost }}>{s.k}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.gold }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: C.textGhost }}>走友会コード（友達に教えると探せます）</div>
              <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text, letterSpacing: '2px' }}>
                {formatCode(club.code)}
              </div>
            </div>
            {isOwner && (
              <button onClick={() => setEditing(true)} className="btn-press" style={actionButton(C.cyan)}>設定</button>
            )}
          </div>
        </div>

        {/* 横タブ */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {([['members', 'メンバー'], ['board', '掲示板']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="btn-press" style={{
              flex: 1, padding: '9px 0', borderRadius: 10, fontFamily: SAIRA, fontSize: 12, cursor: 'pointer',
              background: tab === k ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
              color: tab === k ? C.gold : C.textDim,
              fontWeight: tab === k ? 800 : 400,
              border: tab === k ? `2px solid ${C.goldDark}` : `1px solid ${C.border}`,
            }}>{label}</button>
          ))}
        </div>

        {tab === 'board' && <ClubBoard />}

        {/* 加入申請（会長だけ） */}
        {tab === 'members' && isOwner && (reqs.data ?? []).length > 0 && (
          <>
            <SectionLabel>加入申請 {(reqs.data ?? []).length}件</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(reqs.data ?? []).map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12,
                  background: C.surface2, border: `1px solid ${alpha(C.cyan, 0.35)}`,
                }}>
                  <TeamLogoSVG primary={a.primary} secondary={a.secondary} shortName={a.shortName} logoId={a.logoId} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.teamName}
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>GM {a.gmName} ・ 平均OVR {a.avgOvr}</div>
                  </div>
                  <button onClick={() => onApprove(a.id, false)} disabled={busy === a.id} className="btn-press" style={actionButton(C.textDim)}>断る</button>
                  <button onClick={() => onApprove(a.id, true)} disabled={busy === a.id} className="btn-press" style={actionButton(C.green)}>入れる</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'members' && (
          <>
            <SectionLabel>メンバー {members.length}人</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map(m => (
                <MemberRow key={m.id} m={m} canKick={isOwner && m.role !== 'owner'} onKick={() => setConfirmKick(m)} />
              ))}
            </div>

            <SectionLabel>走友会</SectionLabel>
            <button onClick={() => setConfirmLeave(true)} disabled={busy === 'leave'} className="btn-press" style={{
              ...actionButton(C.red, busy === 'leave'), width: '100%', padding: '12px 0',
            }}>走友会を抜ける</button>
          </>
        )}
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="走友会を抜けますか？"
          message={isOwner ? '会長は次に古いメンバーへ引き継がれます（あなた1人なら解散します）' : undefined}
          confirmLabel="抜ける" accent={C.red}
          onConfirm={onLeave} onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmKick && (
        <ConfirmDialog
          title={`${confirmKick.teamName} を外しますか？`}
          confirmLabel="外す" accent={C.red}
          onConfirm={() => onKick(confirmKick)} onCancel={() => setConfirmKick(null)}
        />
      )}
      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </>
  )
}

// ── 入口 ─────────────────────────────────────────────
export default function FriendClubPage() {
  const mine = useFriendsQuery(myClub, [], 'myClub')

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100%', background: C.bg, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>走友会</div>
      </div>

      <div style={{ padding: '2px 16px 10px' }}>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
          同じ走友会に入ると、仲間のチームが同じ名簿に並びます。1人1つまで。
        </div>
      </div>

      {mine.loading ? <div style={{ padding: '0 12px' }}><LoadingBox /></div> :
       mine.error ? <div style={{ padding: '0 12px' }}><ErrorBox onRetry={mine.reload} /></div> :
       mine.data ? <ClubHome mine={mine.data} onChanged={mine.reload} /> :
       <ClubSearch onChanged={mine.reload} />}
    </div>
  )
}
