import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG } from '../../data/appMeta'
import { C, SAIRA } from '../../styles/tokens'


type NewsItem = { date: string; title: string; body: string }

// 本文の表示。【見出し】の行は金色の小見出し、・で始まる行は箇条書きとして出す。
// それ以外はそのままの段落（古いお知らせは長文のままなのでこれで従来通り表示される）。
function NewsBody({ body }: { body: string }) {
  const lines = body.split('\n').filter(l => l.trim() !== '')
  return (
    <div style={{ padding: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (t.startsWith('【')) {
          return (
            <div
              key={i}
              style={{ fontSize: '11px', fontWeight: 700, color: C.gold, fontFamily: SAIRA, letterSpacing: '0.5px', marginTop: i === 0 ? 0 : 8, marginBottom: 2 }}
            >
              {t.replace(/[【】]/g, '')}
            </div>
          )
        }
        if (t.startsWith('・')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 5, fontSize: '11px', color: C.textSub, lineHeight: 1.6, fontFamily: SAIRA }}>
              <span style={{ flexShrink: 0, color: C.textDim }}>・</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.slice(1)}</span>
            </div>
          )
        }
        return (
          <div key={i} style={{ fontSize: '11px', color: C.textSub, lineHeight: 1.6, fontFamily: SAIRA, marginTop: i === 0 ? 0 : 4 }}>
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

export default function AnnouncementsPage() {
  const navigate = useNavigate()
  const [news, setNews] = useState<NewsItem[]>(NEWS_BUILTIN)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  useEffect(() => {
    fetch(NEWS_URL)
      .then(r => r.json())
      .then((data: unknown) => setNews(mergeNews(NEWS_BUILTIN, data)))
      .catch(() => {})
  }, [])

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    border: `2px solid ${C.goldDark}`,
    borderRadius: 14,
    boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
    padding: '14px',
  }

  return (
    <div style={{ padding: '20px 16px 24px', fontFamily: SAIRA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSub, fontSize: 20, padding: 0, fontFamily: SAIRA, lineHeight: 1 }}
        >
          &larr;
        </button>
        <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '3px', fontFamily: SAIRA }}>お知らせ</div>
      </div>

      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {news.map((item, i) => {
              const open = openIdx === i
              return (
                <div key={i} style={{ borderBottom: i < news.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <button
                    onClick={() => setOpenIdx(open ? null : i)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '1px', marginBottom: '4px', fontFamily: SAIRA }}>{item.date}</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{item.title}</div>
                    </div>
                    <span style={{ color: C.textDim, fontSize: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
                  </button>
                  {open && <NewsBody body={item.body} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
