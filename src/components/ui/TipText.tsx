import { C } from '../../styles/tokens'

// 【】で囲んだところを強調して出すだけの表示。
// ロード画面とヘルプで同じ書き方の文言を使うので、色分けはここ1本に置く。
export default function TipText({ text, color = C.gold }: { text: string; color?: string }) {
  return (
    <>
      {text.split(/(【[^】]*】)/).map((part, i) =>
        part.startsWith('【') && part.endsWith('】')
          ? <span key={i} style={{ color, fontWeight: 700 }}>{part.slice(1, -1)}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}
