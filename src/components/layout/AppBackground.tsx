import appBg from '../../assets/bg.png'

// ============================================================================
// **アプリの背景。写真を貼るのはここ1枚だけ。**
//
// ★以前は `Layout` の中で貼っていた。ところが **`Layout` はゲームが始まってからしか
//   マウントされない**（`App.tsx` が `content` を出し分ける）ので、
//   タイトル・規約・オンボーディング・ドラフト・復旧・データ更新の6画面には
//   写真が出ていなかった（実測：オンボーディングは素の黒）。
//   写真は1枚で全画面を回す前提なので、`content` を丸ごと包むこの位置に移した。
//
// ★上に重ねる画面は**背景を塗らないこと**。塗ると写真が隠れる。
//   暗さが要るなら、ここの幕（下の `VEIL`）を濃くする。
//   塗っていいのは「上に重ねて下を隠すもの」だけ——スクロールで潜る見出しの帯と、
//   画面全体を覆う別画面（ドラフト会場・オンラインの説明）。
// ============================================================================

/** 写真の上に重ねる幕。文字が乗っても読めるようにする濃さ（Layout にあったものと同じ） */
const VEIL = 'linear-gradient(180deg, rgba(6,13,24,0.34) 0%, rgba(6,13,24,0.62) 60%, rgba(6,13,24,0.74) 100%)'

export default function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 480, margin: '0 auto', position: 'relative',
      backgroundImage: `${VEIL}, url(${appBg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
      {children}
    </div>
  )
}
