/**
 * 【優勝トロフィー】99を超えられるのは自チームだけ・上限だけ・110まで
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-trophy.ts \
 *     --outfile=node_modules/.cache/check-tr.cjs --log-level=error && node node_modules/.cache/check-tr.cjs
 *
 * ■決まり（オーナー・2026-08-20）
 *   ・自チームの選手だけ。CPU・海外は 99 のまま
 *   ・JPEL 1部優勝で1個・ECL優勝で1個（年最大2個）
 *   ・1個で**能力1つの上限が +1**（天井110）。**値は上がらない**＝カード合成で育てる
 *   ・**99 に届いている能力だけ**（そこまではジュエルの上限解放）
 *   ・売っても数値はそのまま
 *
 * ■空振り除け
 *   ソースを読むだけにしない。**実際に注いで、上限とタイムが動くことを確かめる。**
 *   `PACE_TABLE` を伸ばし忘れると「11個使ってもタイムが1秒も変わらない」になるので、
 *   そこを必ず数える。
 */
import { getStatPotentials, statCapOf, STAT_CAP, STAT_CAP_MAX } from '../src/utils/playerUtils'
import { trophyBlockReason } from '../src/utils/trophy'
import { calcBaseAbility, scoreToTime } from '../src/engine/raceEngine'
import { terrainWeights } from '../src/data/segmentWeights'
import { logicSource, storeSource } from './storeSource'
import { readFileSync } from 'node:fs'
import type { CardStatKey, Player } from '../src/types'
import { useGameStore } from '../src/store/gameStore'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const mk = (over: Partial<Record<string, number>>, teamId = 'my'): Player => ({
  id: 'p1', name: 'p1', age: 25, teamId, status: 'active', specialty: 'sprinter',
  ratings: { speed: 99, stamina: 90, mountainUp: 88, mountainDown: 88, pacing: 92, mental: 92, recovery: 90, ...over },
  potential: 99, morale: 70, fatigue: 0, form: 0,
  contract: { salary: 1000, yearsLeft: 2 },
  career: { races: 0, wins: 0, championships: 0, segmentAwards: 0 },
} as unknown as Player)
const ST = { trophies: 1, playerTeamId: 'my' }

console.log('[1] 関門（画面と store が同じ関数を見る）')
{
  check('速さ99なら注げる', trophyBlockReason(ST, mk({}), 'speed') === null)
  check('99 未満には注げない', trophyBlockReason(ST, mk({ speed: 98 }), 'speed') !== null,
    String(trophyBlockReason(ST, mk({ speed: 98 }), 'speed')))
  check('他クラブの選手には注げない', trophyBlockReason(ST, mk({}, 'other'), 'speed') !== null)
  check('トロフィーが無ければ注げない', trophyBlockReason({ ...ST, trophies: 0 }, mk({}), 'speed') !== null)
  const maxed = mk({}); (maxed as { trophyBoosts?: Record<string, number> }).trophyBoosts = { speed: 11 }
  check('110 に達したら注げない', trophyBlockReason(ST, maxed, 'speed') !== null,
    String(trophyBlockReason(ST, maxed, 'speed')))
}

console.log('\n[2] 上限だけが上がる（値は上がらない）')
{
  const p = mk({})
  const before = statCapOf(p, 'speed')
  const after = mk({}); (after as { trophyBoosts?: Record<string, number> }).trophyBoosts = { speed: 1 }
  check('天井は 99 から始まる', before === STAT_CAP, String(before))
  check('1個で天井が +1', statCapOf(after, 'speed') === STAT_CAP + 1, String(statCapOf(after, 'speed')))
  check('値は上がらない', (after.ratings as Record<string, number>).speed === 99)
  check('11個で 110', statCapOf({ trophyBoosts: { speed: 11 } }, 'speed') === STAT_CAP_MAX)
  check('12個でも 110 で止まる', statCapOf({ trophyBoosts: { speed: 12 } }, 'speed') === STAT_CAP_MAX)
  // 能力別の上限（getStatPotentials）にも効くこと。ここが 99 のままだとカードで育てられない
  check('育成の上限（getStatPotentials）にも効く',
    (getStatPotentials(after) as Record<string, number>).speed >= STAT_CAP + 1,
    String((getStatPotentials(after) as Record<string, number>).speed))
  check('注いでいない能力は 99 のまま',
    (getStatPotentials(after) as Record<string, number>).stamina <= STAT_CAP)
}

console.log('\n[3] ★タイムが実際に速くなる（PACE_TABLE を伸ばし忘れたら落ちる）')
{
  const seg = { distanceKm: 8, uphillPct: 0, downhillPct: 0, statWeights: terrainWeights(8, 0, 0) }
  const t = (speed: number) => {
    const r = { speed, stamina: 99, mountainUp: 99, mountainDown: 99, pacing: 99, mental: 99, recovery: 99 }
    return scoreToTime(calcBaseAbility(r as never, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights as never), seg.distanceKm, seg.uphillPct, seg.downhillPct)
  }
  const t99 = t(99), t105 = t(105), t110 = t(110)
  check('99 → 105 で速くなる', t105 < t99, `${t99}秒 → ${t105}秒`)
  check('105 → 110 でさらに速くなる', t110 < t105, `${t105}秒 → ${t110}秒`)
  console.log(`      8km区間：速さ99 ${t99}秒 → 105 ${t105}秒（-${t99 - t105}） → 110 ${t110}秒（-${t99 - t110}）`)
}

console.log('\n[4] 増える口は2つだけ（1部優勝・ECL優勝）')
{
  const logic = logicSource()
  // ★**口を名前で数えること。** 「+ 1」の字面で数えると、書き方（改行・三項）が変わった
  //   だけで見失う。増える道は「1部優勝」と「ECL優勝」の2つだけ
  check('増える道その1：JPEL 1部優勝', /TOP_DIVISION && myFinalRank === 1 \? 1 : 0/.test(logic))
  check('増える道その2：ECL優勝', /eclWon \? \{ trophies:/.test(logic))
  // 増える道は3つ（1部優勝・ECL優勝・運営からの配布）、減る道は1つ（使う）。
  // ★配布はギフト1本を通すこと（`grantUpdateGifts` の GIFT_VERSION を変えると全員に配られる）。
  //   画面や他のスライスから直接足さない
  check('増える道その3：運営からの配布（ギフト）', /trophies: \(state\.trophies \?\? 0\) \+ \(gift\.trophies \?\? 0\)/.test(logic))
  const touches = (logic.match(/trophies: \(state\.trophies \?\? 0\)/g) ?? []).length
  check('trophies を書き換えているのは4か所だけ（増3・減1）', touches === 4, `${touches}か所`)
  check('減らしているのは1か所', (logic.match(/trophies: \(state\.trophies \?\? 0\) - 1/g) ?? []).length === 1)
  check('1部だけ（TOP_DIVISION を見ている）', /TOP_DIVISION && myFinalRank === 1/.test(logic))
  check('関門は utils/trophy 1本（store に条件を手書きしていない）',
    !/trophyBoosts\?\.\[stat\] \?\? 0\) >= 11|cur < 99/.test(logic))
}

console.log('\n[5] 天井の数字を他所に手書きしていない')
{
  // 天井の数字を持ってよいのは `utils/playerUtils`（`STAT_CAP_MAX`）と
  // `raceEngine` の `PACE_TABLE`（表の上端そのもの）だけ。store には書かない
  const code = storeSource().replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('store に 110 を書いていない', !/\b110\b/.test(code), 'STAT_CAP_MAX を使うこと')
  check('PACE_TABLE の上端が 110', /\[110, 143\]/.test(readFileSync('src/engine/raceEngine.ts', 'utf8')),
    '伸ばさないとトロフィーを11個使ってもタイムが変わらない')
}

console.log('\n[6] ★実際に store で注いでみる（空振り除け）')
{
  const p0 = mk({})
  useGameStore.setState({ trophies: 2, playerTeamId: 'my', players: [p0] } as never)
  const before = { ...(p0.ratings as Record<string, number>) }

  useGameStore.getState().spendTrophy('p1', 'speed')
  const s1 = useGameStore.getState()
  const p1 = s1.players[0]
  check('トロフィーが1つ減る', (s1.trophies ?? 0) === 1, String(s1.trophies))
  check('天井が 100 になる', statCapOf(p1, 'speed') === 100, String(statCapOf(p1, 'speed')))
  check('★値は 99 のまま（カード合成で育てる）',
    (p1.ratings as Record<string, number>).speed === before.speed,
    `${before.speed} → ${(p1.ratings as Record<string, number>).speed}`)
  check('他の能力は動かない',
    (['stamina', 'mountainUp', 'pacing'] as CardStatKey[]).every(k =>
      (p1.ratings as Record<string, number>)[k] === before[k]))

  // 99 未満の能力には通らない（store 側でも止まること）
  useGameStore.getState().spendTrophy('p1', 'stamina')
  const s2 = useGameStore.getState()
  check('99 未満の能力には store でも通らない', (s2.trophies ?? 0) === 1 && statCapOf(s2.players[0], 'stamina') === STAT_CAP,
    `残 ${s2.trophies} / 天井 ${statCapOf(s2.players[0], 'stamina')}`)

  // 他クラブの選手には通らない
  useGameStore.setState({ trophies: 1, playerTeamId: 'my', players: [mk({}, 'other')] } as never)
  useGameStore.getState().spendTrophy('p1', 'speed')
  check('他クラブの選手には store でも通らない', (useGameStore.getState().trophies ?? 0) === 1)
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
