/**
 * 「クラブは1種類だけ」を確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-clubs.ts
 *
 * 直したのは、国内チーム(Team)と海外クラブ(ForeignClub)が別物として扱われていて、
 * 「まず国内から探して、無ければ海外リーグを全部なめる」という同じ処理が
 * 画面と store に30ヶ所以上コピーされていたこと。
 * 1ヶ所でも書き忘れると、そこだけ所属が「—」や「不明」になっていた。
 * 今は clubById(id) 一本。国内も海外も同じ駅伝リーグで、違うのは国だけ。
 *
 * セーブの中身（Team / ForeignClub）はこれまでどおりなので、既存データには一切さわらない。
 */
import { clubView, clubRoutePath, findClub, makeClubIndex, JPEL_LEAGUE_NAME } from '../src/utils/clubs'
import { makeIsDomestic } from '../src/utils/domesticPlayers'
import { divisionLeagueId } from '../src/utils/world'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import type { ForeignClub, Player, Team, WorldClub } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const T = (id: string, name: string, extra: Partial<Team> = {}) =>
  ({
    id, name, shortName: name, logoId: `logo_${id}`, leagueId: divisionLeagueId(1),
    colors: { primary: '#111111', secondary: '#222222' },
    ...extra,
  }) as unknown as Team

const FC = (id: string, name: string, leagueId: string, country: string) =>
  ({
    id, name, shortName: name, leagueId, country,
    colors: { primary: '#333333', secondary: '#444444' },
  }) as unknown as ForeignClub

// 海外のリーグ名はリーグの静的データ（data/leagues の leagueById）から引くので、実在のリーグIDを使う
const ASIA = 'asia_league'
const ASIA_NAME = 'アジア駅伝リーグ'
const KEN = 'africa_east'

// 国内は部が違っても国内（1部と2部を1つずつ）
const teams = [T('t1', '東京'), T('t2', '大阪', { leagueId: divisionLeagueId(2) })]
const foreign = [FC('kor_1', 'ソウル', ASIA, 'KOR'), FC('kor_2', '釜山', ASIA, 'KOR'), FC('ken_1', 'ナイロビ', KEN, 'KEN')]
// 1つの並び（GameState.clubs と同じ形：国内 → 海外）
const clubs: WorldClub[] = [...teams, ...foreign]

console.log('\n[1] 国内でも海外でも同じように引ける')
{
  const idx = makeClubIndex(clubs)
  check('国内チームが引ける', idx.byId('t1')?.name === '東京')
  check('海外クラブが同じ引き方で引ける', idx.byId('kor_1')?.name === 'ソウル')
  check('知らないIDは undefined', idx.byId('zzz') === undefined)
  check('空文字（FA）は undefined', idx.byId('') === undefined)
  check('null / undefined でも落ちない', idx.byId(null) === undefined && idx.byId(undefined) === undefined)
  check('ドラフト候補（__pool__）はクラブではない', idx.byId('__pool__') === undefined)
  check('全部の件数が国内2＋海外3', idx.all.length === 5, `${idx.all.length}件`)
  check('国内が先に並ぶ', idx.all[0]?.id === 't1' && idx.all[1]?.id === 't2')
}

console.log('\n[2] 国内か海外かは「クラブの国」を見るだけ')
{
  const idx = makeClubIndex(clubs)
  check('国内チームの国は日本', idx.byId('t1')?.country === 'JPN')
  check('国内チームは isDomestic', idx.isDomestic('t1'))
  check('海外クラブは isDomestic でない', !idx.isDomestic('kor_1'))
  check('海外クラブの国はそのクラブの国', idx.byId('ken_1')?.country === 'KEN')
  check('知らないIDは国内扱いしない', !idx.isDomestic('zzz'))
  check('空文字も国内扱いしない（FAの判定は別の場所でやる）', !idx.isDomestic(''))
  check('isDomestic は country === JPN と同じ意味',
    makeClubIndex(clubs).all.every(c => c.isDomestic === (c.country === 'JPN')))
}

console.log('\n[3] リーグ名／リーグID')
{
  const idx = makeClubIndex(clubs)
  check('国内のリーグIDはその部のリーグ', idx.byId('t1')?.leagueId === divisionLeagueId(1) && idx.byId('t2')?.leagueId === divisionLeagueId(2))
  check('国内のリーグ名は JPEL（部が違っても同じ）', idx.byId('t1')?.leagueName === 'JPEL' && idx.byId('t2')?.leagueName === JPEL_LEAGUE_NAME)
  check('海外はそのリーグのIDが入る', idx.byId('kor_1')?.leagueId === ASIA)
  check('海外はそのリーグの名前が入る', idx.byId('kor_1')?.leagueName === ASIA_NAME)
  check('リーグ名が無い場合は「海外リーグ」', clubView(FC('x_1', 'X', 'x', 'USA')).leagueName === '海外リーグ')
}

console.log('\n[4] 国内にしかない項目は任意項目として持つ')
{
  const idx = makeClubIndex(clubs)
  check('国内はロゴを持つ', idx.byId('t1')?.logoId === 'logo_t1')
  check('海外はロゴを持たない', idx.byId('kor_1')?.logoId === undefined)
  check('国内は元のチーム（予算・施設など）が取り出せる', idx.byId('t1')?.team?.id === 't1')
  check('海外は元のチームを持たない', idx.byId('kor_1')?.team === undefined)
}

console.log('\n[5] クラブ詳細ページの行き先')
{
  const idx = makeClubIndex(clubs)
  check('国内は /teams/detail/<id>', clubRoutePath(idx.byId('t1')) === '/teams/detail/t1')
  check('海外は /teams/foreign/<リーグ>/<id>', clubRoutePath(idx.byId('kor_1')) === `/teams/foreign/${ASIA}/kor_1`)
  check('クラブが無ければ行き先も無い（画面側で何もしない）', clubRoutePath(idx.byId('zzz')) === null)
  check('null でも落ちない', clubRoutePath(null) === null && clubRoutePath(undefined) === null)
}

console.log('\n[6] 1回きりの検索（findClub）が索引と同じ結果になる')
{
  const idx = makeClubIndex(clubs)
  for (const id of ['t1', 't2', 'kor_1', 'kor_2', 'ken_1', 'zzz', '', '__pool__']) {
    const a = idx.byId(id)
    const b = findClub(clubs, id)
    check(`「${id || '(空)'}」の結果が一致`, a?.id === b?.id && a?.isDomestic === b?.isDomestic,
      `索引=${a?.id ?? 'なし'} / 1回きり=${b?.id ?? 'なし'}`)
  }
}

console.log('\n[7] 壊れたセーブでも落ちない')
{
  check('国内クラブが無くても落ちない', makeClubIndex(foreign).byId('kor_1')?.id === 'kor_1')
  check('海外クラブが無くても落ちない', makeClubIndex(teams).byId('t1')?.id === 't1')
  check('並びが無ければ0件', makeClubIndex(undefined).all.length === 0)
  check('並びに欠けた要素（null）があっても落ちない',
    makeClubIndex([...teams, null as unknown as WorldClub]).all.length === 2)
  check('IDが欠けたクラブは飛ばす',
    makeClubIndex([T('', '名無し'), T('t9', '札幌')]).all.length === 1)
  check('1回きりの検索も壊れたセーブで落ちない', findClub(undefined, 't1') === undefined)
}

console.log('\n[8] 同じIDが二度出たら国内を優先（並びは国内が先なので、先に入れたほうを残す）')
{
  const dup = [FC('t1', 'にせ東京', ASIA, 'KOR')]
  const idx = makeClubIndex([...teams, ...dup])
  check('国内チームが残る', idx.byId('t1')?.name === '東京')
  check('国内扱いのまま', idx.isDomestic('t1'))
  check('件数は増えない（国内2件のまま）', idx.all.length === 2, `${idx.all.length}件`)
}

console.log('\n[9] 記録室の国内判定（今までの動きが変わっていないこと）')
{
  const isDom = makeIsDomestic(clubs, 'jpel-1')
  const P = (extra: Partial<Player>) => ({ id: 'p', name: 'p', teamId: '', status: 'active', ...extra }) as unknown as Player

  check('国内チームの現役は国内', isDom(P({ teamId: 't1' })))
  check('海外クラブの現役は国内でない', !isDom(P({ teamId: 'kor_1' })))
  check('無所属（FA）は国内扱い', isDom(P({ teamId: '' })))
  check('ドラフト候補（__pool__）は外れる', !isDom(P({ teamId: '__pool__' })))
  check('知らないクラブIDの現役は外れる', !isDom(P({ teamId: 'zzz' })))

  check('国内で引退した選手は国内', isDom(P({ status: 'retired', teamId: '', retiredTeamId: 't1' })))
  check('海外で引退した選手は外れる', !isDom(P({ status: 'retired', teamId: '', retiredTeamId: 'kor_1' })))
  check('引退時の所属が無い旧セーブは今まで通り残す', isDom(P({ status: 'retired', teamId: '' })))
  check('今は無いクラブで引退した選手は外れる', !isDom(P({ status: 'retired', teamId: '', retiredTeamId: 'zzz' })))
}

console.log('\n[10] 元のデータには手を加えない（セーブが壊れない）')
{
  const t = T('t5', '福岡')
  const before = JSON.stringify(t)
  const club = clubView(t)
  check('チームの中身が変わらない', JSON.stringify(t) === before)
  check('元のチームをそのまま参照している（複製していない）', club.team === t)

  const fc = FC('kor_9', '大邱', 'kor', 'KOR')
  const beforeFc = JSON.stringify(fc)
  clubView(fc)
  check('海外クラブの中身も変わらない', JSON.stringify(fc) === beforeFc)
}

console.log('\n[11] 実データの232クラブ（国内52＋海外180）が1つの索引で引ける')
{
  const world: WorldClub[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS, ...INITIAL_FOREIGN_CLUBS] as WorldClub[]
  const idx = makeClubIndex(world)
  check('全部で232件', idx.all.length === 232, `${idx.all.length}件`)
  check('国内は52件', idx.all.filter(c => c.isDomestic).length === 52, `${idx.all.filter(c => c.isDomestic).length}件`)
  check('国内が先に並ぶ', idx.all.slice(0, 52).every(c => c.isDomestic))
  check('国内は全部 日本・JPEL', idx.all.filter(c => c.isDomestic).every(c => c.country === 'JPN' && c.leagueName === JPEL_LEAGUE_NAME))
  let nameNg = 0, missing = 0, domNg = 0
  for (const l of FOREIGN_LEAGUES) for (const c of l.clubs) {
    const got = idx.byId(c.id)
    if (!got) { missing++; continue }
    if (got.leagueId !== l.id || got.leagueName !== l.name) nameNg++
    if (idx.isDomestic(c.id) || got.isDomestic) domNg++
    if (findClub(world, c.id)?.leagueName !== got.leagueName) nameNg++
  }
  check('海外クラブが全部引ける', missing === 0, `${missing}件欠け`)
  check('海外クラブのリーグID・リーグ名がそのリーグのもの', nameNg === 0, `${nameNg}件ズレ`)
  check('海外クラブは国内扱いされない', domNg === 0, `${domNg}件`)
}

if (failed > 0) {
  console.error(`\n${failed}件 NG\n`)
  process.exit(1)
}
console.log('\n全部OK\n')
