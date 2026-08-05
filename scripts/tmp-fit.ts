import { buildRatingsForRank } from '../src/engine/playerGenerator'
import type { Specialty, GrowthCurve } from '../src/types'
const SPECS: Specialty[] = ['ace','mountain_up','mountain_down','sprinter','long','allrounder','kick','grinder']
const CURVES: GrowthCurve[] = ['early','normal','normal','late_bloomer']
const rng=(a:number,b:number)=>Math.floor(a+Math.random()*(b-a+1))
const ovrOf=(r:any)=>Math.round((r.speed+r.stamina+r.mountainUp+r.mountainDown+r.pacing+r.mental+r.recovery)/7)
const AGES=[18,22,25,28,30]
const TARGET=[82,85,90,92,92.5]
const m=(age:number,from:number,rate:number)=>{let s=0;for(let i=0;i<400;i++){
  const {ratings}=buildRatingsForRank({id:`t${Math.random()}`,rank:'SSS',specialty:SPECS[rng(0,7)],growthCurve:CURVES[rng(0,3)],age,potentialCap:99,bakeFrom:from,bakeRate:rate});s+=ovrOf(ratings)}return s/400}
console.log('目標  SSS(上限99):  18歳82 / 22歳85 / 25歳90 / 28歳92 / 30歳92.5\n')
console.log('開始 伸び率 |' + AGES.map(a=>`${a}歳`.padStart(7)).join('') + '   ズレ合計')
let best:any=null
for(const from of [15,16,17,18,19,20]) for(const rate of [0.4,0.5,0.6,0.7,0.8,1.0]){
  const v=AGES.map(a=>m(a,from,rate))
  const err=v.reduce((s,x,i)=>s+Math.abs(x-TARGET[i]),0)
  if(!best||err<best.err) best={from,rate,v,err}
  console.log(`${String(from).padStart(3)} ${rate.toFixed(1).padStart(5)}  |` + v.map(x=>x.toFixed(1).padStart(7)).join('') + `   ${err.toFixed(1).padStart(6)}`)
}
console.log(`\n■ 一番近い: 開始${best.from}歳 / 伸び率${best.rate}  → ` + best.v.map((x:number)=>x.toFixed(1)).join(' / '))
