// 保存済みのチャットログと、いま作り直した「用件の発言」を突き合わせる処理。
//
// もともとは ChatPage の中で、保存済みログに無い発言だけを文字列で見比べて足していた。
// ところが「来シーズンの契約について…残り5ヶ月が気になっています」のように文面に
// 数字が入る発言は、レースを進めるたびに文字列が変わる。その結果、同じ催促が
// 「残り5ヶ月」「残り4ヶ月」「残り3ヶ月」と1行ずつ積み上がり、チャットを開くたびに
// ログが伸び続けていた。
//
// 直し方は、発言に kind（用件の目印）を付けて、
//   ・同じ kind がもうログにある → 増やさずに文面だけ差し替える
//   ・kind が無い発言 → これまで通り文字列で見比べて、無ければ足す
// にすること。返り値は、何も変わらなければ渡された配列をそのまま返す
// （毎回新しい配列を返すと保存が走って無駄な書き込みになるため）。
import type { ChatMessage } from '../types'

export function mergeChatMessages(saved: ChatMessage[], fresh: ChatMessage[]): ChatMessage[] {
  if (saved.length === 0) return fresh
  const known = new Set(saved.map(m => m.kind).filter(Boolean))

  // 同じ用件が既にあるものは、文面だけ最新に差し替える
  const replaced = saved.map(m => {
    const up = m.kind ? fresh.find(f => f.kind === m.kind) : undefined
    return up && up.text !== m.text ? { ...m, text: up.text } : m
  })

  const added = fresh.filter(m =>
    !(m.kind && known.has(m.kind))
    && !saved.some(s => s.from === m.from && s.text === m.text))

  const changed = replaced.some((m, i) => m !== saved[i])
  if (added.length === 0) return changed ? replaced : saved
  return [...replaced, ...added]
}
