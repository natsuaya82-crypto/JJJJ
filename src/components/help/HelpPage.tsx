import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Section = {
  no: string
  title: string
  color: string
  lines: string[]
}

const SECTIONS: Section[] = [
  {
    no: '01',
    title: 'シーズンの流れ',
    color: C.gold,
    lines: [
      'ホーム上部の準備カードから、シーズン開幕までの手順を進めます。',
      '2年目以降は「ドラフト → スカッド提出 → カード受取 → リザーブリーグ」の順。',
      'まずドラフトで新人を指名し、そのうえで1軍16〜20名のスカッドを提出します。',
      '準備を終えたら「開幕」でレース日程へ進みます（スキップも可能）。',
    ],
  },
  {
    no: '02',
    title: 'レースの進め方',
    color: C.cyan,
    lines: [
      '各区間に走らせる選手を配置してスタートします。',
      'レース中に発生するイベントでは、状況に応じて走り方（攻める/維持/温存）を選択。',
      'スタミナが減ると失速するため、勝負どころの見極めが重要です。',
      '「この区間をスキップ」で演出を飛ばして即結果に進めます。',
    ],
  },
  {
    no: '03',
    title: '選手の育成',
    color: C.green,
    lines: [
      'レースやショップで手に入る特訓カードで能力を上げます。',
      '同じ種類のカードはまとめて使うと効率よく伸ばせます。',
      'レースに出た選手は経験値を獲得し、ステータスが成長します。',
      '疲労が溜まると本来の力を出せません。起用と休養のバランスを。',
    ],
  },
  {
    no: '04',
    title: '移籍・契約',
    color: C.orange,
    lines: [
      '契約や移籍の交渉はすべて「チャット」で行います。',
      '通知に契約満了間近の選手が出たら、タップすると直接その選手のチャットへ。',
      'チャットでは年俸・年数・契約形態（1軍/2way/2軍）・ロスターを選んで提示します。',
      '契約満了3ヶ月未満の選手がいると、レース後に契約対応へ誘導されます。',
    ],
  },
  {
    no: '05',
    title: '通知の見方',
    color: C.red,
    lines: [
      '右上のベルに未対応の件数が表示されます。',
      '契約満了・移籍オファー・スポンサー・選手の不満などがまとまっています。',
      '各カードのボタンから、対応する画面へ直接移動できます。',
      '放置すると選手を失ったり不満が悪化することがあります。',
    ],
  },
]

export default function HelpPage() {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <BackButton onClick={() => navigate('/more')} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>HOW TO PLAY</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>操作方法・遊び方</div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7, marginBottom: 16 }}>
          駅伝チームのGMとして、選手を育て、契約を結び、シーズン優勝を目指します。基本の流れは以下の通りです。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SECTIONS.map(sec => (
            <div key={sec.no} style={{
              borderRadius: 14, position: 'relative', overflow: 'hidden',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `1px solid ${alpha(sec.color, 0.35)}`,
              boxShadow: `0 3px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}>
              <div style={{
                padding: '12px 16px 10px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: `1px solid ${alpha(sec.color, 0.15)}`,
                background: `linear-gradient(90deg, ${alpha(sec.color, 0.1)}, transparent)`,
              }}>
                <div style={{
                  fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: sec.color,
                  minWidth: 30, textShadow: `0 0 10px ${alpha(sec.color, 0.4)}`,
                }}>{sec.no}</div>
                <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.text }}>{sec.title}</div>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sec.lines.map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: sec.color, marginTop: 7, flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>{line}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
