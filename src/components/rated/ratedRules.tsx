import BottomSheet from '../ui/BottomSheet'
import { HOF_MAX } from '../../utils/hofRoster'
import { GROUP_MAX, GROUP_MIN, RANK_BANDS } from '../../engine/rating'
import { SEG_MIN, SEG_MAX } from '../../engine/ratedCourse'
import { RESULT_HHMM, SUBMIT_DEADLINE_HHMM } from '../../lib/ratedApi'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'

// ============================================================================
// **ランクマッチの遊びかた。`?` を押したときに出る。**
//
// ★**画面に説明を直書きしないこと**（オーナー・2026-08-14「まじで直書きの説明
//   クソダサいから」）。イベントの一覧にもトップにも文章を置かず、要る人だけ
//   ここを開く。文面を足したくなったら**この配列に足す**。
//
// ★**数字を文章に書かないこと。** 30人・10〜20人・8〜15区間・10:00・23:59・段位の名前は
//   全部それぞれの唯一の決まりから持ってくる。手で書くと、線を変えたときに
//   説明だけが古いまま残る（このリポジトリで何度も起きた形）。
// ============================================================================

const RULES: { title: string; lines: string[] }[] = [
  {
    title: '参加する',
    lines: [
      `殿堂入りチームが${HOF_MAX}人そろっていれば参加できます。`,
      '走るのは殿堂入りの選手です。登録した時点の姿で固定されているので、あとから育てても強くなりません。',
      '途中から参加してもかまいません。そのときのレートで入ります。',
    ],
  },
  {
    title: '1日の流れ',
    lines: [
      `${RESULT_HHMM} に前日の結果とレートが出て、その日のコースが発表されます。`,
      `${SUBMIT_DEADLINE_HHMM} が提出の締め切りです。区間の数ぶんちょうど選んで出します。`,
      '出さなかった日はおまかせで走ります（不戦敗になり、レートは動きます）。',
    ],
  },
  {
    title: 'コース',
    lines: [
      `毎日その場で作られます。区間は${SEG_MIN}〜${SEG_MAX}、距離も起伏もばらばらです。`,
      '全員に同じコースが出ます。',
    ],
  },
  {
    title: '組み分けとレート',
    lines: [
      `レートの近い人どうし、${GROUP_MIN}〜${GROUP_MAX}人の組に分かれて走ります。`,
      '組の中の全員と勝負した扱いで、勝てば上がり負ければ下がります。格上に勝つほど大きく上がります。',
      'レートは0より下がりません。',
      '大会が終わってもレートは残ります。次の大会はその続きからです。',
    ],
  },
  {
    title: '段位',
    lines: [
      `レートで決まります。下から ${[...RANK_BANDS].reverse().map(b => b.name).join('・')}。`,
      '上がるだけでなく落ちます。',
      '名前の横に出るので、フレンドや走友会の相手にも見えます。',
    ],
  },
]

/** `?` のボタン。押すと下から出る */
export function RatedHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="ランクマッチの遊びかた"
      style={{
        width: 28, height: 28, flexShrink: 0, cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',              // 丸いことに意味がある物なので 50% は許される
        border: `1px solid ${alpha(C.textDim, 0.6)}`, background: 'transparent',
        color: C.textDim, fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900,
      }}
    >?</button>
  )
}

export function RatedHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="ランクマッチの遊びかた">
      <div style={{ fontFamily: FONT, padding: '2px 4px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {RULES.map(r => (
          <div key={r.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <div style={{ width: 2, height: 12, background: C.cyan, flexShrink: 0 }} />
              <span style={{ fontSize: F.sub, fontWeight: 900, color: C.text }}>{r.title}</span>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {r.lines.map(l => (
                <li key={l} style={{ fontSize: F.bodyLg, color: C.textSub, lineHeight: 1.65 }}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}
