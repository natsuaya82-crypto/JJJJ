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
    title: 'ゲームの目的',
    color: C.gold,
    lines: [
      'あなたは駅伝チームのGM（総監督）。選手を集め・育て・起用し、リーグ優勝を目指します。',
      'シーズンごとにレースが行われ、順位でリーグポイントを獲得。最終順位でその年の成績が決まります。',
      '好成績を重ねてチームを強豪へ育て、歴代記録に名を刻むのが長期的な目標です。',
    ],
  },
  {
    no: '02',
    title: 'シーズンの流れ',
    color: C.gold,
    lines: [
      'ホーム上部の準備カード（チェックリスト）に沿って開幕準備を進めます。',
      '準備の順序：ドラフト → ロスター提出 → リザーブ参加可否 → シーズン目標の確認 → カード受取。',
      'ドラフトで新人を指名し、1軍20名までのロスターと各区間の走者を決めます。',
      'すべて済ませたら開幕。レースを1戦ずつ消化し、全戦終了でシーズン終了→翌シーズンへ。',
    ],
  },
  {
    no: '03',
    title: 'レースの進め方',
    color: C.cyan,
    lines: [
      '各区間に走らせる選手を配置し「レース開始」。自動配置ボタンも使えます。',
      '区間の地形（平地/上り/下り/距離）と選手の適性・OVRでタイムが決まります。',
      'レース中のイベントでは走り方（攻める/維持/温存）を選択。攻めると速いが失速リスクも。',
      'スタミナ管理と勝負どころの見極めが鍵。「この区間をスキップ」で即結果に進めます。',
      'CPUチームもあなたと同じ計算式で走るので、戦力差が順位に正しく反映されます。',
    ],
  },
  {
    no: '04',
    title: '選手の育成',
    color: C.green,
    lines: [
      'レースやショップで手に入る練習カードで能力（EXP）を上げます。',
      '同じ系統のカードをまとめて使うとコンボが発生し、効率よく伸ばせます。',
      'レースに出た選手も経験値を獲得して成長。若い選手ほど伸びしろが大きいです。',
      '疲労が溜まると本来の力を出せません。起用と休養（控え起用）のバランスが重要。',
      '広告を見ると合成を必ず「大成功」にできます（1日の回数制限あり）。GMパスをお持ちなら広告なしで毎日1回使えます。',
    ],
  },
  {
    no: '05',
    title: 'リザーブリーグ',
    color: C.blue,
    lines: [
      '控え選手のための育成リーグ。参加するとシーズン中に別途レースが行われます。',
      '構成は本リーグと同じで、出られるのはその週の本リーグに出走しなかった選手だけです。',
      '若手に実戦経験を積ませて育成でき、控え層の底上げに役立ちます。',
      'シーズン準備のチェックリストで参加するかどうかを選べます。',
    ],
  },
  {
    no: '06',
    title: '移籍・契約',
    color: C.orange,
    lines: [
      '契約更新・FA・移籍の交渉は「チャット」で行います（ホーム4つ目のタブ）。',
      '年俸・契約年数を提示。合意しても選手が条件に納得しないと成立しません。',
      'ロスターは最大40名・最低20名。上限を超える契約や、下限を割る放出・解雇はできません。',
      '契約期間が残る選手を解雇すると解約金がかかります（満了間近なら無償）。',
    ],
  },
  {
    no: '07',
    title: '財務・予算',
    color: C.green,
    lines: [
      '予算は毎シーズン「昨年順位のグラント＋スポンサー・賞金収入−年俸（1軍+2軍）」で決まります。',
      '前年の残高は繰り越さず、順位に応じた下限（最低保証）が毎年支給されます。上位ほど手厚い。',
      'チームタブの「財務・予算」で、来季予算の見込みや高額給与の内訳を確認できます。',
      '選手を抱えすぎると年俸で予算が圧迫されます。放出やスポンサー獲得で調整を。',
    ],
  },
  {
    no: '08',
    title: 'ジュエル・ショップ',
    color: '#6dd5fa',
    lines: [
      'ジュエルはレース順位・区間賞・実績・目標達成・広告視聴などで貯まります。',
      'ショップで練習カードと交換できます。広告視聴は1日3回まで、1回+100J。',
      '広告を見る前に確認が出ます。最後まで見ると受け取り、途中で閉じると無効です。',
      'ログインボーナスも毎日忘れずに。',
    ],
  },
  {
    no: '09',
    title: '施設・スポンサー',
    color: C.textSub,
    lines: [
      '施設（合宿所・医療・スカウト・戦術分析）を強化すると育成や成績が有利になります。',
      'スポンサー契約は毎シーズンの収入源。人気が上がると好条件の契約が結びやすくなります。',
      'どちらもチームタブから管理できます。',
    ],
  },
  {
    no: '10',
    title: '目標・実績・記録',
    color: C.gold,
    lines: [
      'シーズン目標を達成するとジュエルや予算のボーナスがもらえます。',
      '実績（トロフィー）は条件を満たすと自動解除。レアなほど報酬が大きいです。',
      '記録室では歴代優勝・区間記録・個人成績・GMキャリアを振り返れます。',
    ],
  },
  {
    no: '11',
    title: '通知の見方',
    color: C.red,
    lines: [
      '右上のベルに未対応の件数が表示されます。',
      '契約満了・移籍オファー・引退・スポンサー・選手の不満などがまとまっています。',
      '各カードのボタンから対応画面へ直接移動できます。',
      '放置すると選手を失ったり不満が悪化することがあるので、こまめに確認を。',
    ],
  },
]

export default function HelpPage() {
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <BackButton />
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
