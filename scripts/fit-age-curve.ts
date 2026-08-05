import { buildRatingsForRank } from '../src/engine/playerGenerator'
import type { Specialty, GrowthCurve } from '../src/types'
const SPECS: Specialty[] = ['ace','mountain_up','mountain_down','sprinter','long','allrounder','kick','grinder']
const CURVES: GrowthCurve[] = ['early','normal','normal','late_bloomer']
const rng=(a:number,b:number)=>Math.floor(a+Math.random()*(b-a+1))
const ovrOf=(r:any)=>Math.round((r.speed+r.stamina+r.mountainUp+r.mountainDown+r.pacing+r.mental+r.recovery)/7)
const AGES=[18,22,25,28,30]
const TARGET=[82,85,90,92,92.5]
const m=(age:number,from:number,rate:number,boost:number)=>{let s=0;for(let i=0;i<500;i++){
  const {ratings}=buildRatingsForRank({id:`t${Math.random()}`,rank:'SSS',specialty:SPECS[rng(0,7)],growthCurve:CURVES[rng(0,3)],age,potentialCap:99,bakeFrom:from,bakeRate:rate,baseBoost:boost});s+=ovrOf(ratings)}return s/500}
console.log('目標  SSS(上限99):  18歳82 / 22歳85 / 25歳90 / 28歳92 / 30歳92.5\n')
console.log('素体+ 開始 伸び率 |' + AGES.map(a=>`${a}歳`.padStart(7)).join('') + '   ズレ合計')
let best:any=null
for(const boost of [0,2,3,4,5,6]) for(const from of [18,19,20,21,22]) for(const rate of [0.5,0.7,0.85,1.0]){
  const v=AGES.map(a=>m(a,from,rate,boost))
  const err=v.reduce((s,x,i)=>s+Math.abs(x-TARGET[i]),0)
  if(!best||err<best.err) best={boost,from,rate,v,err}
  if(err<8) console.log(`${String(boost).padStart(4)} ${String(from).padStart(4)} ${rate.toFixed(2).padStart(6)}  |` + v.map(x=>x.toFixed(1).padStart(7)).join('') + `   ${err.toFixed(1).padStart(6)}`)
}
console.log(`\n■ 一番近い: 素体+${best.boost} / 開始${best.from}歳 / 伸び率${best.rate}`)
console.log('   ' + AGES.map((a:number,i:number)=>`${a}歳 ${best.v[i].toFixed(1)}(目標${TARGET[i]})`).join(' / '))
