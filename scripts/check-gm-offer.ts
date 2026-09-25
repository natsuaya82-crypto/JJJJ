/**
 * 監督オファーの**声が掛かる範囲**と、組み立てが1本であることを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-gm-offer.ts --outfile=/tmp/cgo.cjs && node /tmp/cgo.cjs
 *
 * オファーは2つの入口から来る。
 *   ・年に1回ランダムに1件（makeGmOffer）
 *   ・自分から退任したときに3件（resignOffers）
 * どちらも範囲は `offerTierRange`、候補は `offerPools`、引き方は `drawOffers`、
 * 中身は `buildOffer` の1本を通る（オーナー・2026-09-25）。
 *
 *   真ん中 … 自分のリーグのクラブを格の高い順に並べた k 番目（k＝最終順位）
 *   幅     … 上へ round(5×(1−f)) 段・下へ round(5×f) 段（f＝首位0〜最下位1）
 *   候補   … 自チーム以外の231クラブ（国内か海外かで分けない）
 *   退任   … 2件は範囲から、1件は日本のクラブ（範囲を問わない・どこで指揮していても）
 *
 * ■見ること
 *   [1] 範囲の式（優勝・中位・最下位）
 *   [2] 世界232クラブで、優勝・中位・最下位の3通りとも、年に1回のオファーと退任の打診が
 *       範囲どおりの格のクラブから来る（栄転は範囲の中の格上・再起は範囲の中の格下）
 *   [3] 退任の3件のうち1件は必ず日本のクラブ（海外クラブを指揮していても・範囲が空でも）
 *   [4] 名門再建（もとの格から落ちたクラブ）は範囲を問わず出る
 *   [5] 組み立ては1本（返す形が同じ・リーグの人数は移籍先のリーグから）
 *
 * ■壊して確かめたこと
 *   ・幅の式の 1−f と f を入れ替える                     → [1][2] が落ちる
 *   ・候補を日本のリーグのクラブに絞る（jpelClubs）       → [2] の「海外からも来る」が落ちる
 *   ・範囲の判定を外す（栄転＝格上なら何でも）            → [2] が落ちる
 *   ・退任の日本の1件を外す                               → [3] が落ちる
 */
let rngSeed = 20260925
const rng = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { buildOffer, makeGmOffer, offerPools, offerTierRange, resignOffers, worldOfferTiers, type OfferTiers } from '../src/utils/gmOffer'
import { initialWorldClubs } from '../src/store/initialWorld'
import { tierBudget } from '../src/utils/clubTier'
import { WORLD_LEAGUES } from '../src/data/leagues'
import { clubById, clubsInLeague, isJpelLeague } from '../src/utils/world'
import type { GmOffer, LeagueSeason, SeasonStanding, WorldClub } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

console.log('[1] 範囲の式')
{
  // 20クラブのリーグ。格は 5..24 を1つずつ（並びは崩して渡す）
  const tiers = Array.from({ length: 20 }, (_, i) => 5 + ((i * 7) % 20))
  const win = offerTierRange(tiers, 1)!
  const mid = offerTierRange(tiers, 10)!
  const last = offerTierRange(tiers, 20)!
  check('優勝：真ん中はリーグで一番高い格', win.center === 5, `${win.center}`)
  check('優勝：格上へ5段・格下へ0段', win.top === 0 && win.bottom === 5, `${win.top}〜${win.bottom}`)
  check('10位/20：真ん中は10番目の格', mid.center === 14, `${mid.center}`)
  check('10位/20：上へ3段・下へ2段（f=9/19）', mid.top === 11 && mid.bottom === 16, `${mid.top}〜${mid.bottom}`)
  check('最下位：真ん中はリーグで一番低い格', last.center === 24, `${last.center}`)
  check('最下位：格上へ0段・格下へ5段', last.top === 24 && last.bottom === 29, `${last.top}〜${last.bottom}`)
  check('順位が範囲外なら null', offerTierRange(tiers, 0) === null && offerTierRange(tiers, 21) === null)
}

// ── 世界（232クラブ・12リーグ）。順位は各リーグの並び順、自チームだけ順位を差し替える ──
const clubs = initialWorldClubs()
const tiers = worldOfferTiers(clubs)
const nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }> = {}
for (const c of clubs) nextBudgets[c.id] = { budget: tierBudget(c), carryover: 0, grant: tierBudget(c), raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }

function seasonWith(me: WorldClub, rank: number) {
  const leagues: Record<string, LeagueSeason> = {}
  for (const lg of WORLD_LEAGUES) {
    const members = clubsInLeague(clubs, lg.id)
    const order = lg.id === me.leagueId
      ? (() => { const rest = members.filter(c => c.id !== me.id); rest.splice(rank - 1, 0, me); return rest })()
      : members
    leagues[lg.id] = { races: [], standings: order.map((c, i): SeasonStanding => ({ teamId: c.id, totalPoints: 1000 - i, raceResults: [] })) }
  }
  return { year: 2030, leagues }
}

function rangeOf(me: WorldClub, rank: number) {
  const members = clubsInLeague(clubs, me.leagueId)
  return { ...offerTierRange(members.map(c => tiers.tierNow(c.id)), rank)!, n: members.length }
}

/** その打診が範囲の決まりどおりか。理由（NG のとき）を返す */
function offending(o: { teamId: string; kind?: string }, me: WorldClub, r: { top: number; bottom: number }, t: OfferTiers): string | null {
  const tier = t.tierNow(o.teamId)
  const mine = t.tierNow(me.id)
  if (o.teamId === me.id) return '自チーム'
  if (o.kind === 'rebuild') return t.tierNow(o.teamId) - t.tierSeed(o.teamId) >= 4 ? null : `再建なのに落ちていない ${o.teamId}`
  if (tier < r.top || tier > r.bottom) return `範囲外 ${o.teamId} 格${tier}（${r.top}〜${r.bottom}）`
  if (o.kind === 'promotion' && !(tier < mine)) return `栄転なのに格上でない ${o.teamId} 格${tier}/自${mine}`
  if (o.kind === 'comeback' && !(tier > mine)) return `再起なのに格下でない ${o.teamId} 格${tier}/自${mine}`
  return null
}

console.log('')
console.log('[2] 優勝・中位・最下位で、範囲どおりの格のクラブから来る（年に1回・退任の2件）')
// 国内2部の中ほどの格のクラブを自チームにする（格上にも格下にも範囲が取れる）
const jp2 = clubsInLeague(clubs, 'jpel-2').sort((a, b) => tiers.tierNow(a.id) - tiers.tierNow(b.id))
const me = jp2[Math.floor(jp2.length / 2)]
const foreignSeen = { annual: false, resign: false }
for (const [label, rank] of [['優勝', 1], ['中位', 8], ['最下位', 16]] as const) {
  const season = seasonWith(me, rank)
  const r = rangeOf(me, rank)
  const mine = tiers.tierNow(me.id)
  console.log(`  ── ${label}（${rank}位/${r.n}）自チーム格${mine}・範囲 格${r.top}〜${r.bottom}`)
  const annual: GmOffer[] = []
  for (let i = 0; i < 400; i++) {
    const o = makeGmOffer({ season, playerTeamId: me.id, gmRep: 100, nextYear: 2031, clubs, nextBudgets, objBonus: 0, rng })
    if (o) annual.push(o)
  }
  const resign = Array.from({ length: 100 }, () => resignOffers({ season, playerTeamId: me.id, nextYear: 2031, clubs, nextBudgets, rng }))
  const resignRange = resign.flatMap(list => list.slice(0, -1))
  const bad = [...annual, ...resignRange].map(o => offending(o, me, r, tiers)).filter(Boolean)
  check(`${label}：年に1回のオファーが来る（空振りの緑ではない）`, annual.length > 0, `${annual.length}件`)
  check(`${label}：退任の範囲ぶんが来る（空振りの緑ではない）`, resignRange.length > 0, `${resignRange.length}件`)
  check(`${label}：全部が範囲の決まりどおり`, bad.length === 0, bad.slice(0, 3).join(' / '))
  const kinds = new Set([...annual, ...resignRange].map(o => o.kind))
  if (rank === 1) check('優勝：再起（格下）は来ない', !kinds.has('comeback'))
  if (rank === 16) check('最下位：栄転（格上）は来ない', !kinds.has('promotion'))
  if (rank === 8) check('中位：栄転も再起も来る', kinds.has('promotion') && kinds.has('comeback'), [...kinds].join(','))
  // 範囲の中の候補は全部引かれうる（範囲を狭める後付けが無い）
  const pools = offerPools({ clubs, playerTeamId: me.id, season, tiers })!.pools
  const want = clubs.filter(c => c.id !== me.id && tiers.tierNow(c.id) >= r.top && tiers.tierNow(c.id) <= r.bottom
    && tiers.tierNow(c.id) !== mine && tiers.tierNow(c.id) - tiers.tierSeed(c.id) < 4).map(c => c.id).sort()
  const got = [...pools.promotion, ...pools.comeback].sort()
  check(`${label}：候補＝範囲の中の自チーム以外の全クラブ（${want.length}）`, want.join() === got.join(), `${got.length}件`)
  if (annual.some(o => !isJpelLeague(clubById(clubs, o.teamId)?.leagueId))) foreignSeen.annual = true
  if (resignRange.some(o => !isJpelLeague(clubById(clubs, o.teamId)?.leagueId))) foreignSeen.resign = true
  check(`${label}：退任の打診はどれも3件以内で重ならない`, resign.every(l => l.length <= 3 && new Set(l.map(o => o.teamId)).size === l.length))
}
check('年に1回のオファーは海外クラブからも来る（日本のリーグに絞っていない）', foreignSeen.annual)
check('退任の打診も海外クラブからも来る', foreignSeen.resign)

console.log('')
console.log('[3] 退任の3件のうち1件は必ず日本のクラブ')
{
  // (a) 範囲が空（3部の最下位＝格20の下）でも日本の1件は来る
  const jp3 = clubsInLeague(clubs, 'jpel-3')
  const bottomMe = jp3.reduce((a, b) => (tiers.tierNow(b.id) > tiers.tierNow(a.id) ? b : a))
  const s1 = seasonWith(bottomMe, jp3.length)
  const r1 = rangeOf(bottomMe, jp3.length)
  const l1 = resignOffers({ season: s1, playerTeamId: bottomMe.id, nextYear: 2031, clubs, nextBudgets, rng })
  console.log(`  3部の最下位（格${tiers.tierNow(bottomMe.id)}・範囲 格${r1.top}〜${r1.bottom}）: ${l1.map(o => o.teamId).join(', ')}`)
  check('範囲に候補が居なくても1件は届く（詰まない）', l1.length >= 1)
  check('それは日本のクラブ', l1.some(o => isJpelLeague(clubById(clubs, o.teamId)?.leagueId)))
  // (b) 海外クラブを指揮していても日本の1件が来る
  const foreignMe = clubsInLeague(clubs, 'asia_league')[5]
  let everyHasJapan = true
  let foreignRange = 0
  for (const rank of [1, 10, 20]) {
    for (let i = 0; i < 40; i++) {
      const l = resignOffers({ season: seasonWith(foreignMe, rank), playerTeamId: foreignMe.id, nextYear: 2031, clubs, nextBudgets, rng })
      const last = l[l.length - 1]
      if (!last || !isJpelLeague(clubById(clubs, last.teamId)?.leagueId)) everyHasJapan = false
      foreignRange += l.length - 1
      const rr = rangeOf(foreignMe, rank)
      const bad = l.slice(0, -1).map(o => offending(o, foreignMe, rr, tiers)).filter(Boolean)
      if (bad.length > 0) { check(`海外クラブ（${rank}位）の範囲ぶんが決まりどおり`, false, bad[0]!); break }
    }
  }
  check('海外クラブを指揮していても、毎回1件は日本のクラブ', everyHasJapan)
  check('海外クラブを指揮していても範囲ぶんが来る（空振りの緑ではない）', foreignRange > 0, `${foreignRange}件`)
  // (c) 日本の1件は範囲を問わない（範囲の外の日本のクラブも出る）
  const s3 = seasonWith(me, 1)
  const r3 = rangeOf(me, 1)
  let outside = 0
  for (let i = 0; i < 200; i++) {
    const l = resignOffers({ season: s3, playerTeamId: me.id, nextYear: 2031, clubs, nextBudgets, rng })
    const t = tiers.tierNow(l[l.length - 1].teamId)
    if (t < r3.top || t > r3.bottom) outside++
  }
  check('日本の1件は範囲の外からも来る（格の範囲を問わない）', outside > 0, `${outside}/200`)
}

console.log('')
console.log('[4] 名門再建：もとの格から落ちたクラブは範囲を問わず出る')
{
  const fallen = clubsInLeague(clubs, 'jpel-3')[0]
  // もとは格3の名門だったが、いまは3部まで落ちた、という世界
  const t: OfferTiers = { tierNow: tiers.tierNow, tierSeed: id => (id === fallen.id ? 3 : tiers.tierSeed(id)) }
  const season = seasonWith(me, 1)   // 優勝＝範囲は格上だけ。落ちた名門（格下）は範囲の外
  const pools = offerPools({ clubs, playerTeamId: me.id, season, tiers: t })!.pools
  check('落ちぶれた名門が候補に出る（空振りの緑ではない）', pools.rebuild.includes(fallen.id), pools.rebuild.join(','))
  check('出るのはその1クラブだけ', pools.rebuild.length === 1)
  check('範囲の外でも出る（優勝の範囲は格上だけ）', tiers.tierNow(fallen.id) > rangeOf(me, 1).bottom)
  let hit = 0
  for (let i = 0; i < 400; i++) {
    const o = makeGmOffer({ season, playerTeamId: me.id, gmRep: 100, nextYear: 2031, clubs, nextBudgets, objBonus: 0, rng, tiers: t })
    if (o?.teamId === fallen.id && o.kind === 'rebuild') hit++
  }
  check('年に1回のオファーでも再建の話として来る', hit > 0, `${hit}件`)
}

console.log('')
console.log('[5] 組み立ては1本')
{
  const season = seasonWith(me, 8)
  const resign = resignOffers({ season, playerTeamId: me.id, nextYear: 2030, clubs, nextBudgets, rng })
  const foreign = clubsInLeague(clubs, 'europe_west')[0] ?? clubs.find(c => !isJpelLeague(c.leagueId))!
  const one = buildOffer({ teamId: foreign.id, kind: 'promotion', season, clubs, nextBudgets, nextYear: 2030, objBonus: 0, finalRank: 10 })
  check('返す形が同じ', Object.keys(one).sort().join() === Object.keys(resign[0]).sort().join())
  check('どれも予算が入っている', resign.every(o => o.budget > 0))
  check('就任する年が入っている', resign.every(o => o.year === 2030))
  check('リーグの人数は移籍先のリーグから（海外クラブ）', one.divisionSize === clubsInLeague(clubs, foreign.leagueId).length, `${one.divisionSize}`)
  check('前季順位は移籍先のリーグの中の順位', one.prevRank === 1, `${one.prevRank}`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 監督オファーは231クラブから、範囲どおりの格で来る。退任の3件のうち1件は日本のクラブ')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
