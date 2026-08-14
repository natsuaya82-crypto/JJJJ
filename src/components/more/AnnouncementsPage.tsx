import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CHANGELOG } from '../../data/appMeta'
import { C, SAIRA, alpha, F } from '../../styles/tokens'
import { panelStyle } from '../ui/Panel'


type NewsItem = { date: string; title: string; body: string }

// 本文の表示。【見出し】の行は金色の小見出し、・で始まる行は箇条書きとして出す。
// それ以外はそのままの段落（古いお知らせは長文のままなのでこれで従来通り表示される）。
function NewsBody({ body }: { body: string }) {
  const lines = body.split('\n').filter(l => l.trim() !== '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (t.startsWith('【')) {
          return (
            <div
              key={i}
              style={{ fontSize: F.body, fontWeight: 700, color: C.gold, fontFamily: SAIRA, letterSpacing: '0.5px', marginTop: i === 0 ? 0 : 16, marginBottom: 4 }}
            >
              {t.replace(/[【】]/g, '')}
            </div>
          )
        }
        if (t.startsWith('・')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 5, fontSize: F.body, color: C.textSub, lineHeight: 1.7, fontFamily: SAIRA }}>
              <span style={{ flexShrink: 0, color: C.textDim }}>・</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.slice(1)}</span>
            </div>
          )
        }
        return (
          <div key={i} style={{ fontSize: F.body, color: C.textSub, lineHeight: 1.7, fontFamily: SAIRA, marginTop: i === 0 ? 0 : 4 }}>
            {t}
          </div>
        )
      })}
    </div>
  )
}

// お知らせの中身はアプリ本体（appMeta.ts の CHANGELOG）が本命。
// 通信できなくても、サーバーが落ちていても、必ず全部読める状態にしておく。
const NEWS_BUILTIN: NewsItem[] = CHANGELOG.map(c => ({ date: c.date, title: c.title, body: c.body }))
const NEWS_URL = 'https://tokinets.com/jpel-news.json'

// 同じお知らせかどうかは「日付＋タイトル」で見る
const newsKey = (n: NewsItem) => `${n.date}|${n.title}`

/**
 * アプリ内のお知らせに、サーバー側の新しいお知らせだけを足す。
 *
 * 以前はサーバーの取得が成功すると一覧をまるごと入れ替えていたので、
 * サーバーの中身が古いとアプリが持っているお知らせが消えてしまっていた。
 * アプリ内を基本にして、アプリが知らないものだけ足す形にすればその事故が起きない。
 * （アプリ更新なしでお知らせを出したいとき用の入口は残しておく）
 */
function mergeNews(builtin: NewsItem[], remote: unknown): NewsItem[] {
  if (!Array.isArray(remote)) return builtin
  const have = new Set(builtin.map(newsKey))
  const extra = (remote as NewsItem[]).filter(
    n => n && typeof n.date === 'string' && typeof n.title === 'string' && typeof n.body === 'string'
      && !have.has(newsKey(n)),
  )
  if (extra.length === 0) return builtin
  // 日付は 2026.07.29 の形なので文字の並びで新しい順にできる
  return [...builtin, ...extra].sort((a, b) => b.date.localeCompare(a.date))
}

/** 一覧と本文の両方が同じ並びを見るための1本。サーバー側の追加ぶんも同じように入る */
function useNews(): NewsItem[] {
  const [news, setNews] = useState<NewsItem[]>(NEWS_BUILTIN)
  useEffect(() => {
    fetch(NEWS_URL)
      .then(r => r.json())
      .then((data: unknown) => setNews(mergeNews(NEWS_BUILTIN, data)))
      .catch(() => {})
  }, [])
  return news
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSub, fontSize: F.head, padding: 0, fontFamily: SAIRA, lineHeight: 1 }}
      >
        &larr;
      </button>
      <div style={{ fontSize: F.caption, color: C.gold, letterSpacing: '3px', fontFamily: SAIRA }}>{title}</div>
    </div>
  )
}

const cardStyle: React.CSSProperties = { ...panelStyle(C.gold), padding: '14px' }

/**
 * お知らせの一覧。**タイトルだけを並べて、本文は別ページで開く。**
 *
 * 以前はその場で下へ開く蛇腹だった。v2.0.2 の本文は7000字を超えていて、
 * 開くと一覧が下へ吹き飛び、他のお知らせへ移るのに延々とスクロールが要る状態だった。
 */
export default function AnnouncementsPage() {
  const navigate = useNavigate()
  const news = useNews()

  return (
    <div style={{ padding: '20px 16px 24px', fontFamily: SAIRA }}>
      <PageHeader title="お知らせ" onBack={() => navigate(-1)} />

      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)',pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {news.map((item, i) => (
              <div key={newsKey(item)} style={{ borderBottom: i < news.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <button
                  onClick={() => navigate(`/announcements/${encodeURIComponent(newsKey(item))}`)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.tiny, color: C.textDim, letterSpacing: '1px', marginBottom: '4px', fontFamily: SAIRA }}>{item.date}</div>
                    <div style={{ fontSize: F.bodyLg, fontWeight: '700', color: C.text, fontFamily: SAIRA, lineHeight: 1.5 }}>{item.title}</div>
                  </div>
                  <span style={{ color: C.textDim, fontSize: F.sub, flexShrink: 0 }}>›</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * お知らせ1件の本文。**「日付|タイトル」を鍵にする**（一覧と同じ `newsKey`）。
 * 並びの番号を鍵にすると、サーバー側のお知らせが増えた瞬間に別の記事が開く。
 */
export function AnnouncementDetailPage() {
  const navigate = useNavigate()
  const news = useNews()
  const { key = '' } = useParams<{ key: string }>()
  const item = news.find(n => newsKey(n) === decodeURIComponent(key))

  return (
    <div style={{ padding: '20px 16px 32px', fontFamily: SAIRA }}>
      <PageHeader title="お知らせ" onBack={() => navigate('/announcements')} />

      {!item ? (
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.body, padding: '48px 0' }}>
          このお知らせは見つかりませんでした
        </div>
      ) : (
        <div style={cardStyle}>
          <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)',pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: F.tiny, color: C.textDim, letterSpacing: '1px', marginBottom: 6, fontFamily: SAIRA }}>{item.date}</div>
            <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text, fontFamily: SAIRA, lineHeight: 1.5, marginBottom: 12 }}>
              {item.title}
            </div>
            <div style={{ height: 1, background: alpha(C.gold, 0.2), marginBottom: 12 }} />
            <NewsBody body={item.body} />
          </div>
        </div>
      )}
    </div>
  )
}
