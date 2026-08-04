// 「早い者勝ちで1チームが埋めきる」のをやめて、順番に1人ずつ回すための回し役。
//
// CPUの補強は移籍市場もFAの受け皿も、for(チーム){ while(枠が空いてる){ 1人取る } } の形だった。
// これだと先頭のチーム（＝予算の多いチーム・強いチーム）が市場の良いところを全部さらってから
// 次のチームに順番が回るので、補強が上位チームに固まる。
//
// 直し方は「1周につき1人だけ」。誰も取れなくなったら終わり。順番の決め方（下位から等）は
// 呼ぶ側が order で渡す。
export function roundRobin<T>(order: readonly T[], step: (item: T) => boolean, maxRounds = 200): void {
  for (let r = 0; r < maxRounds; r++) {
    let moved = false
    for (const item of order) { if (step(item)) moved = true }
    if (!moved) return
  }
}
