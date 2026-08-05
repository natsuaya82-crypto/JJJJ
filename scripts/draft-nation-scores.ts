// 国の素点（data/nationTalent.ts）の見直し用の一覧。確認用に出すだけ。
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { NATION_TALENT } from '../src/data/nationTalent'
import { NAT_LABEL } from '../src/data/nationalities'

const clubCount = new Map<string, number>()
for (const lg of FOREIGN_LEAGUES) for (const c of lg.clubs) clubCount.set(c.country, (clubCount.get(c.country) ?? 0) + 1)

const rows = Object.entries(NATION_TALENT).map(([code, sc]) => ({
  code, label: NAT_LABEL[code as keyof typeof NAT_LABEL] ?? code, sc, clubs: clubCount.get(code) ?? 0,
})).sort((a, b) => b.sc - a.sc || b.clubs - a.clubs)

console.log('# 国の素点 見直し用一覧（現行値）')
console.log('#  素点 = data/nationTalent.ts の値。選手の人数配分と、クラブの格の並べ順に使う')
console.log('#  ★ 日本(JPN)はこの表に入っていません（国内選手は別経路で生成しているため）')
console.log('')
console.log('| 国 | コード | 現行素点 | 海外クラブ数 |')
console.log('|---|---|---:|---:|')
for (const r of rows) console.log(`| ${r.label} | ${r.code} | ${r.sc} | ${r.clubs} |`)
console.log('')
console.log(`合計 ${rows.length} カ国 / 素点合計 ${rows.reduce((s, r) => s + r.sc, 0)}`)
const noClub = rows.filter(r => r.clubs === 0)
console.log(`\nクラブが1つも無い国（選手だけ供給）: ${noClub.length}カ国 — ${noClub.map(r => r.label).join('、')}`)
