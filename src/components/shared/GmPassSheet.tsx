import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../../store/gameStore'
import { audio } from '../../utils/audio'
import { purchaseAdFree, restoreAdFree, lastIapError, adFreeProduct, AD_FREE_FALLBACK_PRICE } from '../../utils/iap'
import NoticeDialog from '../ui/NoticeDialog'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import GlassButton from '../ui/GlassButton'


// ============================================================================
// GMパス（買い切りIAP）の購入カード。
// もともと設定（MorePage）の中だけにあった物を切り出した。設定ページでは
// そのまま <GmPassCard /> を置き、他の画面（シーズン更新・カード合成・
// ログインボーナス）からは <GmPassSheet /> で全画面に重ねて出す。
// 購入処理は1箇所だけ：買う場所が増えても、お金が動くコードはここしか無い。
// ============================================================================

// GMパスの表示フラグ（有料アプリ契約が切れたときは false にして全部隠す）
export const IAP_ENABLED = true

// ── 特典アイコン ──
const IcBannerOff = <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="14" width="19" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.7"/><path d="M4 21.5L20 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>
const IcFullOff = <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.7"/><path d="M4 20.5L20.5 3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>
const IcStarBadge = <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3.2l2.5 5.7 6.2.5-4.7 4 1.4 6-5.4-3.2-5.4 3.2 1.4-6-4.7-4 6.2-.5z" fill="currentColor"/></svg>
const IcTwoX = <span style={{ fontSize: F.bodyLg, fontWeight: 900, fontFamily: SAIRA, letterSpacing: '-0.5px' }}>×2</span>

// 購入・復元が失敗したとき、App Store（StoreKit）が返した原文をそのまま添える。
// 「購入に失敗しました」だけでは何が起きたのか分からず、原因を追いかけられないため。
function detail(e?: unknown): string {
  const raw = (e instanceof Error ? e.message : e ? String(e) : '') || lastIapError()
  return raw ? `（App Storeからの返答：${raw}）` : ''
}

export function GmPassCard() {
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const setAdsRemoved = useGameStore(s => s.setAdsRemoved)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ title: string; body?: string } | null>(null)
  // App Storeから商品情報が取れるか。取れないと分かっている間は購入ボタンを押させない。
  // 判断がつかないうちは true（押せる）扱いにして、様子見で止めてしまわないようにする。
  const [buyable, setBuyable] = useState(true)
  // 値段はApp Storeが返す物を出す（取れるまでは控えの値）。
  // アプリ側に書いておくと、値上げしたときや日本以外のストアで嘘の値段になる
  const [price, setPrice] = useState(AD_FREE_FALLBACK_PRICE)

  useEffect(() => {
    let alive = true
    void adFreeProduct().then(p => {
      if (!alive) return
      setBuyable(p.buyable)
      setPrice(p.price)
    })
    return () => { alive = false }
  }, [])

  const handlePurchase = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await purchaseAdFree()
      if (res === 'purchased') {
        setAdsRemoved(true)
        audio.playSe('reward')
        setMsg({ title: 'ありがとうございます！', body: 'GMパスが有効になりました。' })
      } else if (res === 'cancelled') {
        setMsg({ title: '購入をキャンセルしました' })
      } else if (res === 'pending') {
        setMsg({ title: '承認待ちです', body: 'ご家族の承認が下りたあと、アプリを開き直すと有効になります。反映されないときは「購入を復元」を押してください。' })
      } else if (res === 'unavailable') {
        setBuyable(false)   // 押しても同じ結果なので、以降はボタンを止める
        setMsg({ title: '商品情報を取得できませんでした', body: 'App Storeに接続できないか、商品が一時的に取得できない状態です。通信環境をご確認のうえ、しばらくしてから再度お試しください。' + detail() })
      } else if (res === 'timeout') {
        setMsg({ title: '応答がありませんでした', body: 'App Storeからの返事が返ってきませんでした。もし購入が完了していた場合は「購入を復元」を押すと有効になります。二重に課金されることはありません。' })
      } else {
        setMsg({ title: '購入に失敗しました', body: '時間をおいて再度お試しください。' + detail() })
      }
    } catch (e) {
      setMsg({ title: '購入に失敗しました', body: '時間をおいて再度お試しください。' + detail(e) })
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await restoreAdFree()
      if (res === 'restored') {
        setAdsRemoved(true)
        setMsg({ title: '購入を復元しました' })
      } else if (res === 'none') {
        setMsg({ title: '復元できる購入が見つかりませんでした', body: '購入時と同じApple IDでサインインしているかご確認ください。' })
      } else {
        // 通信できなかっただけの場合に「購入がありません」と出すと、
        // 購入済みの方に嘘の案内をしてしまうので必ず分ける。
        setMsg({ title: '確認できませんでした', body: 'App Storeに接続できませんでした。通信環境をご確認のうえ、もう一度お試しください。' + detail() })
      }
    } catch (e) {
      setMsg({ title: '確認できませんでした', body: '時間をおいて再度お試しください。' + detail(e) })
    } finally {
      setBusy(false)
    }
  }

  const G = C.gold

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
      border: `1.5px solid ${alpha(G, 0.42)}`,
      boxShadow: `0 3px 0 rgba(0,0,0,0.45), 0 10px 26px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)`,
      padding: '16px 15px 15px',
      marginBottom: '18px',
    }}>
      {/* 上端の金のハイライト（設定カードと同じ質感で、少し格を上げる） */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent 0%, ${alpha(G, 0.55)} 50%, transparent 100%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(G, 0.10)} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ヘッダー：ページ見出しと同じ「縦バー＋EYEBROW＋タイトル」の型 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <div style={{ width: 4, height: 34,background: `linear-gradient(180deg, ${G}, ${alpha(G, 0.25)})`, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: F.tiny, color: alpha(G, 0.85), letterSpacing: '4px', marginBottom: 3 }}>GM PASS</div>
              <div style={{ fontSize: F.head, fontWeight: 900, color: C.text, lineHeight: 1 }}>GMパス</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 30, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.5px',
              background: `linear-gradient(180deg, ${C.goldHi} 0%, ${G} 52%, ${C.goldDark} 100%)`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 2px 8px ${alpha(G, 0.28)})`,
            }}>{price}</div>
            <div style={{ fontSize: F.tiny, color: C.textDim, letterSpacing: '1px', marginTop: 3 }}>買い切り・月額なし</div>
          </div>
        </div>

        {/* 特典一覧：設定カードのアイコンタイルと同じ形で揃える */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 13 }}>
          {[
            { icon: IcBannerOff, label: 'バナー広告を削除', sub: '画面下のスペースがすっきり' },
            { icon: IcFullOff, label: 'シーズン更新の全画面広告なし', sub: '「次のシーズンへ」がそのまま進む' },
            { icon: IcStarBadge, label: '大成功を1日1回タダで確約', sub: '合成画面のボタンから。毎朝10時に復活' },
            { icon: IcTwoX, label: 'ログインボーナス毎日2倍', sub: '100→200・7日目 1100→2200ジュエル' },
          ].map(({ icon, label, sub }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38,flexShrink: 0,
                background: `linear-gradient(180deg, ${alpha(G, 0.22)} 0%, ${alpha(G, 0.06)} 100%)`,
                border: `1px solid ${alpha(G, 0.3)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: G, boxShadow: `0 2px 8px ${alpha(G, 0.12)}`,
              }}>
                {icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: F.sub, fontWeight: 800, color: C.text, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${alpha(G, 0.16)}, transparent)`, marginBottom: 12 }} />

        {adsRemoved ? (
          <div style={{
            padding: '14px',textAlign: 'center',
            background: `linear-gradient(180deg, ${alpha(G, 0.16)}, ${alpha(G, 0.05)})`,
            border: `1.5px solid ${alpha(G, 0.45)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5l5 5L20 6.5" stroke={G} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: F.sub, fontWeight: 900, color: G, letterSpacing: '1px' }}>購入済み — ありがとうございます</span>
          </div>
        ) : (
          <>
            <GlassButton full size="lg" disabled={busy || !buyable} style={{ fontFamily: SAIRA }} onClick={handlePurchase}>
              <span>{busy ? '処理中…' : !buyable ? 'いま購入できません' : '購入する　' + price}</span>
            </GlassButton>
            {!buyable && (
              <div style={{ fontSize: F.caption, color: C.textDim, textAlign: 'center', marginTop: 7, lineHeight: 1.6 }}>
                App Storeから商品情報を取得できませんでした。通信環境をご確認のうえ、しばらくしてからアプリを開き直してください。
              </div>
            )}
          </>
        )}

        {/* 「購入を復元」は購入済みでも必ず出しておく。
            機種変更やApple IDの入れ直しで権利が消えたときに、戻す手段が画面に無いと詰む */}
        <button
          onClick={handleRestore}
          disabled={busy}
          style={{
            width: '100%', padding: '10px', marginTop: 9,cursor: busy ? 'default' : 'pointer',
            background: 'transparent', border: `1px solid ${alpha(G, 0.14)}`, color: C.textDim,
            fontSize: F.label, fontWeight: 700, fontFamily: SAIRA, opacity: busy ? 0.6 : 1,
          }}
        >
          購入を復元
        </button>

        <div style={{ fontSize: F.tiny, color: C.textGhost, lineHeight: 1.6, marginTop: 10, textAlign: 'center' }}>
          ※動画広告（ジュエル追加・2回目以降の大成功）は任意で見られます
        </div>

      </div>

      {msg && <NoticeDialog title={msg.title} message={msg.body} onClose={() => setMsg(null)} />}
    </div>
  )
}

// 全画面に重ねて出す版。背景タップか「閉じる」で閉じる。
export function GmPassSheet({ onClose }: { onClose: () => void }) {
  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(3px)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '28px 16px calc(28px + env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
    >
      <div style={{ maxWidth: 420, margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <GmPassCard />
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '13px',cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.border2}`, color: C.textSub,
            fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 700,
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  ), document.body)
}
