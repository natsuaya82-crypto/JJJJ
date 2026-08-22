import PageHeader from '../ui/PageHeader'
import { HOF_ENTRY_MIN } from '../../utils/hofRoster'
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
// ★**数字を文章に書かないこと。** 15人・10〜20人・8〜15区間・10:00・23:59・段位の名前は
//   全部それぞれの唯一の決まりから持ってくる。手で書くと、線を変えたときに
//   説明だけが古いまま残る（このリポジトリで何度も起きた形）。
// ============================================================================

const RULES: { title: string; lines: string[] }[] = [
  {
    title: '参加する',
    lines: [
      `殿堂入りが${HOF_ENTRY_MIN}人そろえば参加できます。`,
      '走るのは殿堂入りの選手。登録した時点の姿で固定されます。',
      '途中参加もできます。',
    ],
  },
  {
    title: '1日の流れ',
    lines: [
      `${RESULT_HHMM} 前日の結果とレート、その日のコースが出る。`,
      `${SUBMIT_DEADLINE_HHMM} 提出の締め切り。区間の数ぶんちょうど選ぶ。`,
      '出さないとおまかせで走り、不戦敗になります。',
    ],
  },
  {
    title: 'コース',
    lines: [
      `毎日変わります。区間は${SEG_MIN}〜${SEG_MAX}、距離も起伏もばらばら。`,
      '全員に同じコースが出ます。',
    ],
  },
  {
    title: '組み分けとレート',
    lines: [
      `レートの近い人どうし、${GROUP_MIN}〜${GROUP_MAX}人の組で走ります。`,
      '組の全員と勝負した扱い。格上に勝つほど大きく上がります。',
      'レートは0より下がりません。大会をまたいで続きます。',
    ],
  },
  {
    title: '段位',
    lines: [
      `下から ${[...RANK_BANDS].reverse().map(b => b.name).join('・')}。`,
      '上がるだけでなく落ちます。',
      '名前の横に出るので、フレンドにも見えます。',
    ],
  },
]

/** `?` のボタン。押すと遊びかたのページへ */
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

/**
 * ランクマッチの遊びかた。**普通のページ**（`/rated/help`）。
 *
 * ★以前は画面下から出るシートでした（オーナー・2026-08-15
 *   「そのui嫌いだから一生禁止しろ。俺が許可した時だけ」「全部それが基本だから
 *   下から出てきたりとかは俺が許可した時だけな？」）。
 *   見せ方は他の画面と同じ「ページ ＋ `PageHeader` ＋ 戻る矢印」に揃えます。
 */
export function RatedHelpPage() {
  return (
    <div style={{ fontFamily: FONT, paddingBottom: 90, minHeight: '100%' }}>
      <PageHeader eyebrow="RANKED MATCH" title="遊びかた" />
      <div style={{ fontFamily: FONT, padding: '2px 16px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
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
    </div>
  )
}
