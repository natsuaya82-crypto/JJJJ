import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import NoticeDialog from '../ui/NoticeDialog'
import ActionSheet from '../ui/ActionSheet'
import BottomSheet from '../ui/BottomSheet'
import { useAdHeight, HEADER_H, NAV_H, MAIN_GAP } from '../layout/Layout'
import ReportSheet, { type ReportTarget } from './ReportSheet'
import { blockUser, unblockUser } from '../../lib/moderationApi'
import { TeamLogoSVG } from '../icons/Icons'
import { CLUB_LOGOS, CLUB_LOGO_DEFAULT, clubLogoSrc } from '../../data/clubLogos'
import { formatCode, offlineDetail, listFriends, listSent, sendRequest, SEND_RESULT_TEXT } from '../../lib/friendsApi'
import {
  CLUB_MAX, JOIN_TYPE_LABEL, searchClubs, myClub, myClubRequests, createClub, joinClub,
  cancelClubRequest, listClubRequests, approveClubRequest, rejectClubRequest,
  leaveClub, kickClubMember, updateClub, setClubRole, CLUB_ADMIN_MAX,
  CLUB_PHRASES, CLUB_REACTIONS, clubReactions, reactClubPost, CLUB_REQ_CAP, CLUB_REQ_STATS, clubFeed, postClubMessage, postClubRequest,
  donateClubCards, clubGiftCount, claimClubGifts,
  type ClubBrief, type ClubForm, type ClubMember, type ClubPost, type ClubReqRarity,
  type ClubReqStat, type JoinType, type MyClub,
} from '../../lib/clubsApi'
import { useGameStore } from '../../store/gameStore'
import { RARITY_COLORS, RARITY_LABELS, CARD_NAMES } from '../../utils/cardCombo'
import TrainingCardSVG from '../training/TrainingCardSVG'
import type { TrainingCard } from '../../types'
import { stashGifts, peekGifts, clearGifts } from '../../lib/giftInbox'
import { loadClubGifts, clearClubGifts } from '../../lib/useClubGifts'
import { CLUB_CHAT_ENABLED } from '../../data/featureFlags'
import { useFriendsQuery, invalidateFriendsCache, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { useLongPress } from '../../lib/useLongPress'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const JOIN_COLOR: Record<JoinType, string> = {
  open: C.green, approval: C.cyan, closed: C.textGhost,
}

// 入会条件のつまみ。いちばん左（64）を「なし」として扱い、右は65〜90。
const OVR_MIN = 64
const OVR_MAX = 90
const ovrLabel = (v: number) => (v <= OVR_MIN ? 'なし' : `${v} 以上`)

/**
 * 選んだものが一目で分かるボタン。
 * 選択中＝金色で塗って黒字＋チェック、それ以外＝暗いまま。
 * 種類ごとに色を変えると「全部光って見える」ので、選択の色は金一色にそろえてある。
 */
function ChoiceButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer', fontFamily: SAIRA,
      fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap',
      color: on ? '#1a1200' : C.textGhost,
      background: on ? C.gold : alpha('#000', 0.3),
      border: `1px solid ${on ? C.gold : C.border3}`,
      boxShadow: on ? `0 0 0 2px ${alpha(C.gold, 0.28)}` : 'none',
      opacity: on ? 1 : 0.75,
    }}>{on ? `✓ ${label}` : label}</button>
  )
}

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
      whiteSpace: 'nowrap', flexShrink: 0,
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
              <ChoiceButton key={t} label={JOIN_TYPE_LABEL[t]}
                on={f.joinType === t} onClick={() => set('joinType', t)} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.textDim }}>入会条件（チーム平均OVR）</span>
            <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: f.minOvr > 0 ? C.gold : C.textGhost }}>
              {ovrLabel(f.minOvr === 0 ? OVR_MIN : f.minOvr)}
            </span>
          </div>
          <input
            type="range"
            min={OVR_MIN}
            max={OVR_MAX}
            step={1}
            value={f.minOvr === 0 ? OVR_MIN : Math.min(Math.max(f.minOvr, OVR_MIN), OVR_MAX)}
            onChange={e => {
              const v = Number(e.target.value)
              set('minOvr', v <= OVR_MIN ? 0 : v)
            }}
            style={{ width: '100%', accentColor: C.gold, height: 26, display: 'block' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>
            <span>なし</span>
            <span>{OVR_MAX}</span>
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
function ClubSearch({ onChanged, initialCode = '' }: { onChanged: () => void; initialCode?: string }) {
  // フレンドの走友会の行から来たときは、そのコードで検索した状態で開く
  const [q, setQ] = useState(initialCode)
  const [term, setTerm] = useState(initialCode) // 実際に検索に使っている言葉
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
// 同じ走友会でもフレンドとは限らないので、行ごとに「今どの関係か」で出し分ける。
// unknown はフレンド一覧がまだ取れていないとき（通信できない時に「＋フレンド」が
// 全員に出てしまうのを防ぐため、分かるまでは何も出さない）
type FriendState = 'unknown' | 'me' | 'friend' | 'sent' | 'none'

function MemberRow({ m, canKick, isMe, friendState, onKick, onMenu, onOpen, onAddFriend }: {
  m: ClubMember; canKick: boolean; isMe: boolean; friendState: FriendState
  onKick: () => void; onMenu: () => void; onOpen: () => void; onAddFriend: () => void
}) {
  const longPress = useLongPress()
  // ブロックした相手は、名前も監督名も伏せる。人数がずれるので一覧からは消さない。
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12,
      background: C.surface2, border: `1px solid ${C.border2}`,
      opacity: m.blocked ? 0.5 : 1,
    }}>
      {/* 長押しでロスター。ボタンの上で長押しして離すと押した扱いにもなるので、
          長押しはロゴ〜名前のところだけに付ける。
          自分の行はフレンド詳細に飛ばしても意味が無いので何もしない */}
      <div
        {...(m.blocked || isMe ? {} : longPress(onOpen))}
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: m.blocked || isMe ? 'default' : 'pointer' }}
      >
        <TeamLogoSVG primary={m.primary} secondary={m.secondary} shortName={m.shortName} logoId={m.logoId} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: m.blocked ? C.textDim : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.blocked ? 'ブロック中の利用者' : m.teamName}
            </span>
            {m.role === 'owner' && <Pill color={C.gold}>会長</Pill>}
            {m.role === 'admin' && <Pill color={C.cyan}>副会長</Pill>}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            {m.blocked ? 'この相手は表示していません' : `GM ${m.gmName} ・ ${m.lastLogin}`}
          </div>
        </div>
      </div>
      {!m.blocked && m.code !== '' && friendState === 'none' && (
        <button onClick={onAddFriend} className="btn-press" style={{ ...actionButton(C.gold), padding: '8px 10px' }}>＋フレンド</button>
      )}
      {!m.blocked && friendState === 'sent' && (
        <span style={{ ...actionButton(C.textDim, true), padding: '8px 10px' }}>申請中</span>
      )}
      {canKick && (
        <button onClick={onKick} className="btn-press" style={actionButton(C.red)}>外す</button>
      )}
      {!isMe && (
        <button onClick={onMenu} className="btn-press" aria-label="メニュー" style={{
          ...actionButton(C.textDim), padding: '8px 10px', letterSpacing: '1px',
        }}>···</button>
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

/**
 * 空いている枠に、選んだカードを上から当てはめてみる。
 * 当てはまったカードだけを返す。サーバーと同じ順番で当てるので、
 * ここで「入る」と出たものは、そのままサーバーでも入る。
 *
 * 種類の指定がある枠から先に埋めるのが肝心。おまかせ枠を先に潰すと、
 * 指定枠に合うカードの行き場が無くなって、渡せる枚数が減ってしまう。
 */
function fitCards(open: ClubReqStat[], cards: TrainingCard[]): TrainingCard[] {
  const want = [...open]
  const out: TrainingCard[] = []
  for (const c of cards) {
    if (want.length === 0) break
    let k = want.findIndex(w => w !== '' && w === c.statKey)
    if (k < 0) k = want.findIndex(w => w === '')
    if (k < 0) continue
    want.splice(k, 1)
    out.push(c)
  }
  return out
}

/** 欲しい枠の並びを「スピード×2・おまかせ」のような字にする */
function wantText(stats: ClubReqStat[]): string {
  const order: ClubReqStat[] = []
  const count = new Map<ClubReqStat, number>()
  for (const s of stats) {
    if (!count.has(s)) order.push(s)
    count.set(s, (count.get(s) ?? 0) + 1)
  }
  return order
    .map(s => {
      const n = count.get(s) ?? 0
      return `${s ? CARD_NAMES[s] : 'おまかせ'}${n > 1 ? `×${n}` : ''}`
    })
    .join('・')
}

/**
 * 渡すカードを選ぶ。空いている枠のぶんだけ、まとめて選べる。
 * 枠に当てはまらないカードは押しても入らないので、はじめから薄くして押せなくする。
 */
function DonatePicker({ rarity, open, cards, busy, onGive, onCancel }: {
  rarity: ClubReqRarity; open: ClubReqStat[]; cards: TrainingCard[]; busy: boolean
  onGive: (cs: TrainingCard[]) => void; onCancel: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const byId = new Map(cards.map(c => [c.id, c]))
  const pickedCards = picked.map(id => byId.get(id)).filter((c): c is TrainingCard => !!c)
  const full = pickedCards.length >= open.length

  const canPick = (c: TrainingCard) =>
    fitCards(open, [...pickedCards, c]).length === pickedCards.length + 1

  const toggle = (c: TrainingCard) => {
    setPicked(prev => (prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]))
  }

  return (
    <ConfirmDialog
      title={`${RARITY_LABELS[rarity]}カードをわたす`}
      confirmLabel={busy ? '送信中…' : pickedCards.length > 0 ? `${pickedCards.length}枚わたす` : 'わたす'}
      cancelLabel="やめる"
      accent={C.green}
      onConfirm={() => { if (!busy && pickedCards.length > 0) onGive(pickedCards) }}
      onCancel={onCancel}
    >
      <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
        ほしがっているのは {wantText(open)}
      </div>
      {cards.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          渡せる{RARITY_LABELS[rarity]}カードを持っていません。
        </div>
      ) : (
        <div style={{
          marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          maxHeight: 240, overflowY: 'auto',
        }}>
          {cards.map(c => {
            const on = picked.includes(c.id)
            const ok = on || (!full && canPick(c))
            return (
              <button key={c.id} type="button" disabled={busy || !ok} onClick={() => toggle(c)} style={{
                background: on ? alpha(C.green, 0.16) : 'none',
                border: `1px solid ${on ? C.green : 'transparent'}`,
                borderRadius: 9, padding: '3px 0', cursor: busy || !ok ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                opacity: ok ? 1 : 0.3,
              }}>
                <TrainingCardSVG statKey={c.statKey} rarity={c.rarity} width={54} />
                <span style={{ fontSize: 8, color: on ? C.green : C.textGhost }}>{CARD_NAMES[c.statKey]}</span>
              </button>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 9, color: C.textGhost, marginTop: 8, lineHeight: 1.6 }}>
        あと{open.length}枚まで入ります。薄いカードは、いま空いている枠に合いません。
      </div>
    </ConfirmDialog>
  )
}

/**
 * お願いするカードの中身を選ぶ。1枚ずつ別の種類を頼める。
 *
 * 上の列が「何枚目を決めているか」。種類を選ぶと次の枚に進むので、
 * ぽんぽん押していけば5枚ぶん決まる。直したいときは上の列を押して戻る。
 */
function AskPicker({ rarity, busy, onPick, onCancel }: {
  rarity: ClubReqRarity; busy: boolean
  onPick: (stats: ClubReqStat[]) => void; onCancel: () => void
}) {
  const cap = CLUB_REQ_CAP[rarity]
  const [stats, setStats] = useState<ClubReqStat[]>(() => Array<ClubReqStat>(cap).fill(''))
  const [slot, setSlot] = useState(0)
  const slotW = cap > 3 ? 40 : 52

  const choose = (v: ClubReqStat) => {
    setStats(prev => prev.map((x, i) => (i === slot ? v : x)))
    setSlot(i => (i + 1 < cap ? i + 1 : i))
  }
  const all = (v: ClubReqStat) => { setStats(Array<ClubReqStat>(cap).fill(v)); setSlot(0) }

  return (
    <ConfirmDialog
      title={`${RARITY_LABELS[rarity]}カードを${cap}枚おねがいする`}
      confirmLabel={busy ? '送信中…' : 'おねがいする'}
      cancelLabel="やめる"
      accent={C.gold}
      onConfirm={() => { if (!busy) onPick(stats) }}
      onCancel={onCancel}
    >
      <div style={{ marginTop: 10, fontSize: 11, color: C.textDim }}>1枚ずつ選べます</div>
      <div style={{ marginTop: 6, display: 'flex', gap: 5 }}>
        {stats.map((v, i) => (
          <button key={i} type="button" onClick={() => setSlot(i)} style={{
            flex: 1, background: i === slot ? alpha(C.gold, 0.16) : alpha('#000', 0.25),
            border: `1px solid ${i === slot ? C.gold : C.border3}`,
            borderRadius: 9, padding: '5px 0', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
            {v ? (
              <TrainingCardSVG statKey={v} rarity={rarity} width={slotW} />
            ) : (
              <div style={{
                width: slotW, height: Math.round(slotW * 1.4), borderRadius: 6,
                border: `1px dashed ${C.border3}`, background: alpha('#000', 0.25),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.textGhost,
              }}>?</div>
            )}
            <span style={{ fontSize: 8, color: i === slot ? C.gold : C.textGhost }}>
              {v ? CARD_NAMES[v] : 'おまかせ'}
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: C.textDim }}>
        {slot + 1}枚目はどの練習のカードが欲しい？
      </div>
      <div style={{ display: 'flex', marginTop: 6 }}>
        <ChoiceButton label="おまかせ（なんでも）" on={stats[slot] === ''} onClick={() => choose('')} />
      </div>
      <div style={{
        marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
      }}>
        {CLUB_REQ_STATS.map(s => (
          <button key={s} type="button" onClick={() => choose(s)} style={{
            background: stats[slot] === s ? alpha(C.gold, 0.16) : 'none',
            border: `1px solid ${stats[slot] === s ? C.gold : 'transparent'}`,
            borderRadius: 9, padding: '4px 0', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            opacity: stats[slot] === s ? 1 : 0.6,
          }}>
            <TrainingCardSVG statKey={s} rarity={rarity} width={52} />
            <span style={{ fontSize: 8, color: stats[slot] === s ? C.gold : C.textGhost }}>{CARD_NAMES[s]}</span>
          </button>
        ))}
      </div>
      {cap > 1 && (
        <div style={{ display: 'flex', marginTop: 8 }}>
          <ChoiceButton label={`${cap}枚ともこれにする`} on={false} onClick={() => all(stats[slot])} />
        </div>
      )}
      <div style={{ fontSize: 9, color: C.textGhost, marginTop: 8, lineHeight: 1.6 }}>
        種類を選ぶと、その練習のカードだけ集まります。おまかせなら何でも受け取れます。
      </div>
    </ConfirmDialog>
  )
}

// 下に貼りつく入力バーの高さ。投稿の一覧はこのぶん下を空けておく
const BOARD_INPUT_H = 66

function ClubBoard({ tab }: { tab: 'board' | 'cards' }) {
  // 入力バーを画面の下に置くために、スクロール領域（Layout の main）の高さを取る。
  // 出しかたは LoginBonusPage と同じ。ここで自前の数字を書くとタブバーの高さを変えたときにズレる
  const adH = useAdHeight()
  const mainHeight = `calc(100dvh - ${HEADER_H + NAV_H + MAIN_GAP + adH}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))`

  const feed = useFriendsQuery(clubFeed, [], 'clubFeed')
  const reacts = useFriendsQuery(clubReactions, [], 'clubReacts')
  const gifts = useFriendsQuery(clubGiftCount, [], 'clubGifts')
  const myCards = useGameStore(s => s.trainingCards)
  const removeTrainingCard = useGameStore(s => s.removeTrainingCard)
  const addTrainingCards = useGameStore(s => s.addTrainingCards)
  const [busy, setBusy] = useState('')
  const [picking, setPicking] = useState<ClubPost | null>(null)
  const [asking, setAsking] = useState<ClubReqRarity | null>(null)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)
  const [menuPost, setMenuPost] = useState<ClubPost | null>(null)
  const [reporting, setReporting] = useState<ReportTarget | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<ClubPost | null>(null)

  // 前回の「受け取る」が途中で終わっていた場合の入れ直し。
  // 箱に残っているもののうち、まだ手元に無いカードだけを足す（二重に増えない）。
  useEffect(() => {
    const left = peekGifts()
    if (left.length === 0) return
    const have = new Set((useGameStore.getState().trainingCards ?? []).map(c => c.id))
    const missing = left.filter(c => !have.has(c.id))
    if (missing.length > 0) addTrainingCards(missing)
    clearGifts()
  }, [addTrainingCards])

  // 走友会の書き込みを止めているあいだは、書き込みの行は出さない（カードのお願いだけ残す）
  const allPosts = (feed.data ?? []).filter(p => CLUB_CHAT_ENABLED || p.kind !== 'msg')

  // 今日もうお願いしたか（サーバーと同じ判定を手元でも出して、ボタンを先に止める）。
  // ここは埋まったお願いも数に入れる。埋まった瞬間に消えると、1日1回の縛りが抜けてしまう。
  const askedToday = allPosts.some(p =>
    p.mine && p.kind === 'req' && new Date(p.createdAt).toDateString() === new Date().toDateString())

  // 埋まったお願いは掲示板から下ろす。
  // 「集まりました」だけが並んで流れが埋まり、いま出ているお願いが見えなくなるため。
  // サーバー側でも club_feed が消すが、SQLを流すまでのあいだも手元で伏せておく。
  const posts = allPosts.filter(p => !(p.kind === 'req' && p.filled >= p.cap))

  // カードのお願いだけを抜いたもの（カードタブで使う）
  const reqPosts = posts.filter(p => p.kind === 'req')
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [reactFor, setReactFor] = useState<ClubPost | null>(null)

  const refresh = () => {
    invalidateFriendsCache('clubFeed', 'clubGifts', 'clubReacts')
    feed.reload(); gifts.reload(); reacts.reload()
    loadClubGifts(true)   // 通知のベルの数字も合わせておく
  }

  const onReact = async (post: ClubPost, emoji: number) => {
    setReactFor(null)
    try {
      await reactClubPost(post.id, emoji)
      invalidateFriendsCache('clubReacts'); reacts.reload()
    } catch (e) { failed(e) }
  }

  // 渡せる手持ち。どの枠に入るかは選ぶ画面の側で見るので、ここはレアリティだけ。
  const cardsOf = (rarity: ClubReqRarity) =>
    (myCards ?? []).filter(c => c.rarity === rarity && c.kind !== 'rest')

  // 通信に失敗したとき用。原因が分かるようサーバーの文言もそのまま添える
  const failed = (e: unknown) =>
    setNotice({ title: '通信できませんでした', message: offlineDetail(e) || undefined })

  const onPhrase = async (i: number) => {
    setBusy('msg')
    try {
      const r = await postClubMessage(i)
      if (r === 'too_fast') setNotice({ title: '少し待ってください', message: '書き込みは1分に1回までです' })
      else refresh()
    } catch (e) { failed(e) } finally { setBusy('') }
  }

  const onAsk = async (rarity: ClubReqRarity, stats: ClubReqStat[]) => {
    setBusy('req')
    try {
      const r = await postClubRequest(rarity, stats)
      setAsking(null)
      if (r === 'today_done') setNotice({ title: '今日はもうお願いしています', message: 'カードのお願いは1日1回までです' })
      else refresh()
    } catch (e) { setAsking(null); failed(e) } finally { setBusy('') }
  }

  const onDonate = async (post: ClubPost, cards: TrainingCard[]) => {
    setBusy(post.id)
    try {
      const r = await donateClubCards(post.id, cards)
      setPicking(null)
      if (r.status === 'ok' && r.ids.length > 0) {
        // 渡せたぶんだけ手元から減らす。入らなかったカードはそのまま残る。
        for (const id of r.ids) removeTrainingCard(id)
        setNotice({
          title: `カードを${r.ids.length}枚 わたしました`,
          message: r.ids.length < cards.length ? '枠に入らなかったカードは手元に残っています' : undefined,
        })
      } else {
        setNotice({
          title: 'わたせませんでした',
          message:
            r.status === 'full' ? 'もう必要な枚数が集まっています' :
            r.status === 'mine' ? '自分のお願いには渡せません' :
            r.status === 'bad_card' ? 'このカードは渡せません' : 'お願いが見つかりませんでした',
        })
      }
      refresh()
    } catch (e) { setPicking(null); failed(e) } finally { setBusy('') }
  }

  // 掲示板からブロックする。書き込みは次の読み込みから消える。
  const onBlock = async (post: ClubPost) => {
    setConfirmBlock(null)
    const ok = await blockUser(post.userId)
    if (!ok) { setNotice({ title: '通信できませんでした' }); return }
    invalidateFriendsCache('clubFeed', 'myClub', 'friends', 'received', 'sent')
    feed.reload()
    setNotice({ title: 'ブロックしました', message: 'この相手の書き込みは表示されません' })
  }

  const onClaim = async () => {
    setBusy('claim')
    try {
      const cards = await claimClubGifts()
      clearClubGifts()   // 通知に出ていたぶんはここで全部受け取っている
      // サーバー側からはこの時点で消えている。手元に入れる前に必ず箱へ置いて、
      // ここで落ちてもカードが消えないようにする（次に開いたときに入れ直される）。
      if (cards.length > 0) {
        stashGifts(cards)
        addTrainingCards(cards)
        // セーブの書き込みが終わるだけの間を置いてから箱を空にする
        setTimeout(clearGifts, 2000)
      }
      setNotice({
        title: cards.length > 0 ? `カードを${cards.length}枚 受け取りました` : '受け取るカードはありません',
        message: cards.length > 0 ? 'カード一覧に入っています' : undefined,
      })
      refresh()
    } catch (e) { failed(e) } finally { setBusy('') }
  }

  // 投稿1件の見た目。掲示板とカードタブの両方で使うので関数にしておく
  const renderPost = (p: ClubPost) => {
    const done = p.kind === 'req' && p.filled >= p.cap
    // 1人1枚の縛りは外したので、渡したあとでも空きがあればまた渡せる
    const canGive = p.kind === 'req' && !p.mine && !done
    const col = p.kind === 'req' && p.rarity ? RARITY_COLORS[p.rarity] : C.border2
    const rc = reacts.data?.[p.id]
    const counts = Object.entries(rc?.counts ?? {}) as [string, number][]
    return (
      <div key={p.id} style={{
        padding: '9px 12px', borderRadius: 12, background: C.surface2,
        border: `1px solid ${p.kind === 'req' ? alpha(col, 0.45) : C.border2}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TeamLogoSVG primary={p.primary} secondary={p.secondary} shortName={p.shortName} logoId={p.logoId} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.teamName}<span style={{ marginLeft: 5 }}>GM {p.gmName}</span> ・ {ago(p.createdAt)}
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
                {p.openStats.length > 0 && (
                  <div style={{ fontSize: 10, color: C.textGhost, marginTop: 1 }}>
                    のこり {wantText(p.openStats)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 下の段にボタン類をまとめる。
            上の段（本文）に「集まりました」やメニューを並べると本文の幅が削られ、
            投稿ごとに違う位置で折り返して行がガタつく。左に反応、右に操作で固定する。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 44 }}>
          {counts.map(([e, n]) => {
            const idx = Number(e)
            const isMine = rc?.mine === idx
            return (
              <button key={e} onClick={() => { void onReact(p, idx) }} className="btn-press" style={{
                padding: '2px 8px', borderRadius: 11, cursor: 'pointer', fontSize: 12,
                border: `1px solid ${isMine ? C.gold : C.border3}`,
                background: isMine ? alpha(C.gold, 0.14) : alpha('#000', 0.25),
                color: C.textSub, fontFamily: 'inherit',
              }}>
                {CLUB_REACTIONS[idx] ?? '?'}
                <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, marginLeft: 4, color: isMine ? C.gold : C.textDim }}>{n}</span>
              </button>
            )
          })}
          <button onClick={() => setReactFor(p)} className="btn-press" aria-label="反応する" style={{
            padding: '2px 9px', borderRadius: 11, cursor: 'pointer', fontSize: 12,
            border: `1px dashed ${C.border3}`, background: 'transparent', color: C.textGhost, fontFamily: 'inherit',
          }}>＋</button>

          <div style={{ flex: 1 }} />

          {p.kind === 'req' && (
            done ? <Pill color={C.green}>集まりました</Pill> :
            p.mine ? <Pill color={C.textDim}>お願い中</Pill> :
            canGive ? (
              <button onClick={() => setPicking(p)} disabled={busy === p.id} className="btn-press"
                style={actionButton(C.green, busy === p.id)}>わたす</button>
            ) : null
          )}
          {/* 自分の投稿にメニューは出ないが、幅は空けておく。
              空けないと「集まりました」だけが投稿ごとに左右へずれる */}
          <div style={{ width: 42, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            {!p.mine && (
              <button onClick={() => setMenuPost(p)} className="btn-press" aria-label="メニュー"
                style={{ ...actionButton(C.textDim), padding: '6px 10px', letterSpacing: '1px' }}>···</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 掲示板（チャット）とカードのやりとりを1つの画面に積んでいたので、
  // ひとこと書くまでに「もらったカード」「カードをお願いする」を通り過ぎる必要があった。
  // タブで分け、掲示板は投稿だけ・入力は下に固定、という普通のチャットの形にする。
  // paddingTop は横タブとの隙間。0 だとタブのボタン（btn-press は下に影が出る）に
  // 「まだ何も書かれていません」の枠が食い込む
  const board = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: mainHeight, paddingTop: 10 }}>
      {/* 一覧を flex:1 で伸ばし、入力バーを常に画面のいちばん下に置く。
          伸ばさないと投稿が少ないときに入力バーが画面の途中に浮く */}
      <div style={{ flex: 1, padding: `0 12px ${CLUB_CHAT_ENABLED ? BOARD_INPUT_H : 8}px` }}>
        {feed.loading ? <LoadingBox /> :
         feed.error ? <ErrorBox onRetry={feed.reload} /> :
         posts.length === 0 ? <EmptyBox label="まだ何も書かれていません" /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 新しいものが上。サーバーが created_at desc で返すので並べ替えない */}
            {posts.map(p => renderPost(p))}
          </div>
         )}
      </div>

      {/* 入力は画面下に固定。定型文はシートで開く（12個を常時出すと画面の半分が埋まるため） */}
      {CLUB_CHAT_ENABLED && (
        <div style={{
          position: 'sticky', bottom: 0, padding: '8px 12px 10px',
          background: `linear-gradient(to top, ${C.bg} 70%, ${alpha(C.bg, 0)})`,
        }}>
          <button onClick={() => setPhraseOpen(true)} disabled={busy === 'msg'} className="btn-press" style={{
            width: '100%', padding: '12px 14px', borderRadius: 22, cursor: 'pointer',
            border: `1px solid ${C.border3}`, background: C.surface2,
            display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
          }}>
            <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: C.textGhost }}>ひとこと書く…</span>
            <span style={{
              fontSize: 12, fontWeight: 900, color: C.bg, background: C.gold,
              borderRadius: 14, padding: '4px 12px',
            }}>送る</span>
          </button>
        </div>
      )}
    </div>
  )

  const cardTab = (
    <div style={{ padding: '10px 12px 0' }}>
      <SectionLabel>もらったカード</SectionLabel>
      {(gifts.data ?? 0) > 0 ? (
        <button onClick={onClaim} disabled={busy === 'claim'} className="btn-press" style={{
          ...actionButton(C.gold, busy === 'claim'), width: '100%', padding: '13px 0',
        }}>{gifts.data}枚 受け取る</button>
      ) : (
        <EmptyBox label="いま届いているカードはありません" />
      )}

      <SectionLabel>カードをお願いする（1日1回）</SectionLabel>
      <div style={{ display: 'flex', gap: 6 }}>
        {REQ_RARITIES.map(r => (
          <button key={r} onClick={() => setAsking(r)} disabled={busy === 'req' || askedToday}
            className="btn-press" style={{
              ...actionButton(RARITY_COLORS[r], busy === 'req' || askedToday),
              flex: 1, padding: '9px 0', lineHeight: 1.35,
            }}>
            {RARITY_LABELS[r]}を
            <br />
            {CLUB_REQ_CAP[r]}枚おねがい
          </button>
        ))}
      </div>
      {askedToday && (
        <div style={{ fontSize: 9, color: C.textGhost, marginTop: 5 }}>
          今日はもうお願いしています。日付が変わるとまた出せます。
        </div>
      )}

      <SectionLabel>みんなのお願い</SectionLabel>
      {reqPosts.length === 0
        ? <EmptyBox label="いまお願いは出ていません" />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{reqPosts.map(p => renderPost(p))}</div>}
    </div>
  )

  return (
    <>
      {tab === 'board' ? board : cardTab}

      {/* 反応を選ぶシート */}
      <BottomSheet open={!!reactFor} onClose={() => setReactFor(null)} title="反応する">
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {CLUB_REACTIONS.map((e, i) => (
            <button key={e} onClick={() => { if (reactFor) void onReact(reactFor, i) }} className="btn-press" style={{
              flex: 1, padding: '12px 0', borderRadius: 12, cursor: 'pointer', fontSize: 22,
              border: `1px solid ${C.border3}`, background: alpha('#000', 0.25), fontFamily: 'inherit',
            }}>{e}</button>
          ))}
        </div>
      </BottomSheet>

      {/* 定型文を選ぶシート */}
      <BottomSheet open={phraseOpen} onClose={() => setPhraseOpen(false)} title="ひとこと書く">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {CLUB_PHRASES.map((ph, i) => (
            <button key={ph} onClick={() => { setPhraseOpen(false); void onPhrase(i) }}
              disabled={busy === 'msg'} className="btn-press" style={{
                padding: '11px 2px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                border: `1px solid ${C.border3}`, background: alpha('#000', 0.25), color: C.textSub,
              }}>{ph}</button>
          ))}
        </div>
      </BottomSheet>

      {picking && picking.rarity && (
        <DonatePicker
          rarity={picking.rarity}
          open={picking.openStats}
          cards={cardsOf(picking.rarity)}
          busy={busy === picking.id}
          onGive={cs => { void onDonate(picking, cs) }}
          onCancel={() => setPicking(null)}
        />
      )}

      {asking && (
        <AskPicker
          rarity={asking}
          busy={busy === 'req'}
          onPick={stats => { void onAsk(asking, stats) }}
          onCancel={() => setAsking(null)}
        />
      )}

      <ActionSheet
        open={!!menuPost}
        onClose={() => setMenuPost(null)}
        items={[
          { label: '通報する', color: C.red, onClick: () => { if (menuPost) setReporting({ userId: menuPost.userId, name: menuPost.teamName }); setMenuPost(null) } },
          { label: 'この相手をブロックする', color: C.red, onClick: () => { setConfirmBlock(menuPost); setMenuPost(null) } },
        ]}
      />
      {reporting && (
        <ReportSheet
          target={reporting}
          onClose={() => setReporting(null)}
          onDone={(message, blocked) => {
            setReporting(null)
            if (blocked) { invalidateFriendsCache('clubFeed', 'myClub', 'friends', 'received', 'sent'); feed.reload() }
            setNotice({ title: message })
          }}
        />
      )}
      {confirmBlock && (
        <ConfirmDialog
          title={`${confirmBlock.teamName} をブロックしますか？`}
          message="この相手の書き込みは表示されなくなります。フレンドだった場合は解除されます。"
          confirmLabel="ブロック" accent={C.red}
          onCancel={() => setConfirmBlock(null)}
          onConfirm={() => { void onBlock(confirmBlock) }}
        />
      )}
      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </>
  )
}

function ClubHome({ mine, onChanged }: { mine: MyClub; onChanged: () => void }) {
  const { club, members, isOwner, myRole, canEdit, adminCount, meId } = mine
  const navigate = useNavigate()
  // 加入申請は会長と副会長が見る
  const reqs = useFriendsQuery(() => (canEdit ? listClubRequests() : Promise.resolve([])), [canEdit], 'clubReqIn')
  // 走友会のメンバーがフレンドかどうかを出し分けるため。置き場所はフレンド画面と同じ入れ物
  const friendsQ = useFriendsQuery(listFriends, [], 'friends')
  const sentQ = useFriendsQuery(listSent, [], 'sent')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmKick, setConfirmKick] = useState<ClubMember | null>(null)
  const [notice, setNotice] = useState<{ title: string; message?: string } | null>(null)
  const [tab, setTab] = useState<'members' | 'board' | 'cards'>(CLUB_CHAT_ENABLED ? 'board' : 'cards')
  const [menuMember, setMenuMember] = useState<ClubMember | null>(null)
  const [menuClub, setMenuClub] = useState(false)
  const [reporting, setReporting] = useState<ReportTarget | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<ClubMember | null>(null)

  const refresh = () => {
    invalidateFriendsCache('myClub', 'clubReco', 'clubReqIn', 'clubReqSent')
    reqs.reload(); onChanged()
  }

  // 行ごとのフレンド関係
  const friendIds = new Set((friendsQ.data ?? []).map(f => f.id))
  const sentIds = new Set((sentQ.data ?? []).map(r => r.id))
  const knowsFriends = friendsQ.data !== undefined && sentQ.data !== undefined
  const friendStateOf = (m: ClubMember): FriendState =>
    m.id === meId ? 'me'
      : !knowsFriends ? 'unknown'
        : friendIds.has(m.id) ? 'friend' : sentIds.has(m.id) ? 'sent' : 'none'

  // メンバーにフレンド申請。走友会の一覧には元からフレンドコードが入っているので、
  // フレンド画面と同じ sendRequest(コード) をそのまま呼ぶ
  const onAddFriend = async (m: ClubMember) => {
    try {
      const r = await sendRequest(m.code)
      invalidateFriendsCache('friends', 'sent', 'received')
      friendsQ.reload(); sentQ.reload()
      setNotice(SEND_RESULT_TEXT[r])
    } catch (e) {
      setNotice({ title: '通信できませんでした', message: offlineDetail(e) })
    }
  }

  const onLeave = async () => {
    setConfirmLeave(false); setBusy('leave')
    try {
      const r = await leaveClub()
      if (r === 'disbanded') setNotice({ title: '解散しました', message: '最後の1人だったので走友会は無くなりました' })
      refresh()
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  // 副会長にする／やめる（会長だけ）
  const onSetRole = async (m: ClubMember, role: 'admin' | 'member') => {
    setBusy(m.id)
    try {
      const r = await setClubRole(m.id, role)
      if (r === 'ok') { refresh(); setNotice({
        title: role === 'admin' ? `${m.teamName} を副会長にしました` : `${m.teamName} の副会長をやめました`,
      }) }
      else setNotice({
        title: 'できませんでした',
        message:
          r === 'too_many' ? `副会長は${CLUB_ADMIN_MAX}人までです` :
          r === 'not_owner' ? '会長だけができます' :
          r === 'not_member' ? 'この人はもう走友会にいません' : '選べない役割です',
      })
    } catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onKick = async (m: ClubMember) => {
    setConfirmKick(null); setBusy(m.id)
    try { await kickClubMember(m.id); refresh() }
    catch { setNotice({ title: '通信できませんでした' }) } finally { setBusy('') }
  }

  const onBlock = async (m: ClubMember) => {
    setConfirmBlock(null); setBusy(m.id)
    try {
      const ok = await blockUser(m.id)
      if (!ok) { setNotice({ title: '通信できませんでした' }); return }
      invalidateFriendsCache('friends', 'received', 'sent', 'clubFeed')
      refresh()
      setNotice({ title: 'ブロックしました', message: 'この相手の名前と書き込みは表示されません' })
    } finally { setBusy('') }
  }

  const onUnblock = async (m: ClubMember) => {
    setBusy(m.id)
    try {
      const ok = await unblockUser(m.id)
      if (!ok) { setNotice({ title: '通信できませんでした' }); return }
      invalidateFriendsCache('friends', 'received', 'sent', 'clubFeed')
      refresh()
    } finally { setBusy('') }
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
        {/* 走友会カード。人数・平均OVR・入会条件・走友会コード・設定は、
            どのタブにいても同じ位置に出す。タブごとに畳んでいたときは、
            見たい数字がどのタブに出るのかを覚えていないと探せなかった */}
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
            {canEdit && (
              <button onClick={() => setEditing(true)} className="btn-press" style={actionButton(C.cyan)}>設定</button>
            )}
            <button onClick={() => setMenuClub(true)} className="btn-press" aria-label="走友会のメニュー" style={{
              ...actionButton(C.textDim), padding: '8px 10px', letterSpacing: '1px',
            }}>···</button>
          </div>
        </div>

        {/* 横タブ */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {/* 掲示板を止めているあいだはカードだけ出す（空のタブを見せない） */}
          {(CLUB_CHAT_ENABLED
            ? [['members', 'メンバー'], ['cards', 'カード'], ['board', '掲示板']] as const
            : [['members', 'メンバー'], ['cards', 'カード']] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="btn-press" style={{
              flex: 1, padding: '9px 0', borderRadius: 10, fontFamily: SAIRA, fontSize: 12, cursor: 'pointer',
              background: tab === k ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
              color: tab === k ? C.gold : C.textDim,
              fontWeight: tab === k ? 800 : 400,
              border: tab === k ? `2px solid ${C.goldDark}` : `1px solid ${C.border}`,
            }}>{label}</button>
          ))}
        </div>

        {(tab === 'board' || tab === 'cards') && <ClubBoard tab={tab} />}

        {/* 加入申請（会長と副会長） */}
        {tab === 'members' && canEdit && (reqs.data ?? []).length > 0 && (
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
            <div style={{ fontSize: 10, color: C.textDim, margin: '0 4px 6px' }}>長押しでその人のロスターを見られます</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map(m => (
                <MemberRow
                  key={m.id}
                  m={m}
                  canKick={canEdit && m.role !== 'owner' && !(myRole === 'admin' && m.role === 'admin')}
                  isMe={m.id === meId}
                  friendState={friendStateOf(m)}
                  onKick={() => setConfirmKick(m)}
                  onMenu={() => setMenuMember(m)}
                  onOpen={() => navigate(`/friends/team/${m.id}`)}
                  onAddFriend={() => { void onAddFriend(m) }}
                />
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
          message={isOwner
            ? '会長は副会長のいちばん古い人へ引き継がれます。副会長がいなければ次に古いメンバーへ。あなた1人なら解散します。'
            : undefined}
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

      <ActionSheet
        open={!!menuMember}
        onClose={() => setMenuMember(null)}
        items={
          menuMember?.blocked
            ? [
                { label: 'ブロックを外す', onClick: () => { const m = menuMember; setMenuMember(null); if (m) void onUnblock(m) } },
              ]
            : [
                // 役割の付け外しは会長だけ。会長自身の行にはメニューが出ないので owner は入らない。
                ...(isOwner && menuMember && menuMember.role === 'member'
                  ? [{
                      label: adminCount >= CLUB_ADMIN_MAX
                        ? `副会長にする（あと0人・${CLUB_ADMIN_MAX}人まで）`
                        : `副会長にする（あと${CLUB_ADMIN_MAX - adminCount}人）`,
                      color: C.cyan,
                      onClick: () => { const m = menuMember; setMenuMember(null); if (m) void onSetRole(m, 'admin') },
                    }]
                  : []),
                ...(isOwner && menuMember && menuMember.role === 'admin'
                  ? [{
                      label: '副会長をやめてもらう',
                      color: C.textDim,
                      onClick: () => { const m = menuMember; setMenuMember(null); if (m) void onSetRole(m, 'member') },
                    }]
                  : []),
                { label: '通報する', color: C.red, onClick: () => { if (menuMember) setReporting({ userId: menuMember.id, name: menuMember.teamName }); setMenuMember(null) } },
                { label: 'この相手をブロックする', color: C.red, onClick: () => { setConfirmBlock(menuMember); setMenuMember(null) } },
              ]
        }
      />

      <ActionSheet
        open={menuClub}
        onClose={() => setMenuClub(false)}
        items={[
          {
            label: 'この走友会を通報する',
            color: C.red,
            onClick: () => { setMenuClub(false); setReporting({ clubId: club.id, name: club.name }) },
          },
        ]}
      />
      {reporting && (
        <ReportSheet
          target={reporting}
          onClose={() => setReporting(null)}
          onDone={(message, blocked) => {
            setReporting(null)
            if (blocked) { invalidateFriendsCache('friends', 'received', 'sent', 'clubFeed'); refresh() }
            setNotice({ title: message })
          }}
        />
      )}
      {confirmBlock && (
        <ConfirmDialog
          title={`${confirmBlock.teamName} をブロックしますか？`}
          message="この相手の名前と書き込みは表示されなくなります。フレンドだった場合は解除されます。"
          confirmLabel="ブロック" accent={C.red}
          onConfirm={() => { void onBlock(confirmBlock) }}
          onCancel={() => setConfirmBlock(null)}
        />
      )}
      {notice && <NoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </>
  )
}

// ── 入口 ─────────────────────────────────────────────
export default function FriendClubPage() {
  const mine = useFriendsQuery(myClub, [], 'myClub')
  // フレンドの走友会の行から飛んできたとき用。?code=数字10桁
  const [params] = useSearchParams()
  const fromFriend = (params.get('code') ?? '').replace(/\D/g, '')

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100%', background: C.bg, paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>走友会</div>
      </div>

      {/* 走友会の説明は、まだ入っていない人にだけ出す。
          入ったあとも出し続けると、掲示板に着くまでの行数が増えるだけになる */}
      {!mine.data && (
        <div style={{ padding: '2px 16px 10px' }}>
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
            同じ走友会に入ると、仲間のチームが同じ名簿に並びます。1人1つまで。
          </div>
        </div>
      )}

      {mine.loading ? <div style={{ padding: '0 12px' }}><LoadingBox /></div> :
       mine.error ? <div style={{ padding: '0 12px' }}><ErrorBox onRetry={mine.reload} /></div> :
       mine.data ? <ClubHome mine={mine.data} onChanged={mine.reload} /> :
       <ClubSearch onChanged={mine.reload} initialCode={fromFriend} />}
    </div>
  )
}
