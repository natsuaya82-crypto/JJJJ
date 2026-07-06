import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG } from '../../data/appMeta'
import { C } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type NewsItem = { date: string; title: string; body: string }

const NEWS_FALLBACK: NewsItem[] = CHANGELOG.map(c => ({ date: c.date, title: c.title, body: c.body }))
const NEWS_URL = 'https://tokinets.com/jpel-news.json'

export default function AnnouncementsPage() {
  const navigate = useNavigate()
  const [news, setNews] = useState<NewsItem[]>(NEWS_FALLBACK)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  useEffect(() => {
    fetch(NEWS_URL)
      .then(r => r.json())
      .then((data: NewsItem[]) => { if (Array.isArray(data) && data.length > 0) setNews(data) })
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
                  {open && (
                    <div style={{ fontSize: '11px', color: C.textSub, lineHeight: 1.6, fontFamily: SAIRA, padding: '0 0 12px' }}>{item.body}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
