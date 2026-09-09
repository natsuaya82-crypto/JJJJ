/**
 * 【落ちても、完全なセーブが必ず1本以上残る】
 *
 * ■なぜ要るのか（オーナー・2026-09-08）
 *   「そもそも落ちるのがおかしい」「風邪をひかないようにしろ」
 *
 *   以前の書き込みは
 *     1) tmp へ書く → 2) 検証 → 3) **本体を消す** → 4) tmp を本体へ rename
 *   で、3と4のあいだだけ**正しいセーブが1つも存在しない瞬間**がありました。
 *   そこで落ちると、次の起動は本体が見つからず、世代バックアップや
 *   「アップデート前の退避」まで落ちていきます。実機で
 *   **2038年まで進めたセーブが2034年に戻る**が起きました。
 *
 *   受け皿（世代・退避）を増やすのは薬で、これは風邪をひかないための点検です。
 *
 * ■どう見るか
 *   **書き込みの途中で本当に落とします**（偽ファイルシステムの `__crashAfter`）。
 *   1手目で落ちる場合・2手目で落ちる場合…と順に全部試して、そのたびに
 *   「読み戻したら、落ちる前のセーブか新しいセーブのどちらかが完全に読める」ことを見ます。
 *   **どこで落としても駄目な回が1つでもあれば落ちます。**
 */
const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

import { __files as files, __crashAfter, __noCrash } from './fakes/capacitor-filesystem'

const KEY = 'jpel-manager-save'
const mkSave = (year: number, n = 300) => JSON.stringify({
  state: {
    isInitialized: true, playerTeamId: 'tokyo', year,
    teams: [{ id: 'tokyo' }],
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, specialty: 'ace' })),
  },
  version: 40,
})
const yearOf = (raw: string): number | null => {
  try { return (JSON.parse(raw).state as { year?: number }).year ?? null } catch { return null }
}

async function main() {
  const st = await import('../src/store/saveStorage')
  st.setSaveFormatVersion(40)

  console.log('[1] 書き込みの途中で落としても、完全なセーブが残る')
  {
    // 何手で書き終わるかを先に測る（手数はここに書かない。作りを変えたら自動で追随する）
    files.clear(); __noCrash()
    files.set('jpel-manager-save.a.json', { data: mkSave(2030), mtime: 1 })
    files.set('jpel-manager-save.cur.json', { data: '{"use":"a"}', mtime: 1 })
    await st.saveStorage.getItem(KEY)
    st.saveStorage.setItem(KEY, mkSave(2031))
    await st.flushSaveNow()
    const ops = [...files.keys()].length   // 参考値（表示用）
    console.log(`      いまのファイル ${ops} 本`)

    let worst = ''
    let tested = 0
    for (let crashAt = 0; crashAt < 12; crashAt++) {
      // 2030年のセーブがある状態から、2031年を書く途中で落とす
      files.clear()
      files.set('jpel-manager-save.a.json', { data: mkSave(2030), mtime: 1 })
      files.set('jpel-manager-save.cur.json', { data: '{"use":"a"}', mtime: 1 })
      __noCrash()
      await st.saveStorage.getItem(KEY)          // 起動（ここでは落とさない）
      __crashAfter(crashAt)                      // ここから crashAt 手目で落ちる
      try {
        st.saveStorage.setItem(KEY, mkSave(2031))
        await st.flushSaveNow()
      } catch { /* 落ちた。実機ならアプリが終了した状態 */ }
      __noCrash()

      // 落ちたあとに起動し直す
      const raw = await st.saveStorage.getItem(KEY)
      tested++
      const y = typeof raw === 'string' ? yearOf(raw) : null
      // **落ちる前（2030）か、書き切れた新しい方（2031）のどちらかが読めること。**
      // 読めない・年が消えている・それ以外の年が出る、は全部NG
      if (y !== 2030 && y !== 2031) { worst = `${crashAt}手目で落としたら ${y ?? '読めない'}`; break }
    }
    check(`書き込みの何手目で落としても、完全なセーブが読める（${tested}通り）`, worst === '', worst)
  }

  console.log('\n[2] 「正しいセーブが1本も無い」時間を作っていない')
  {
    // 書き込みの最中の**どの瞬間でも**、a か b のどちらかが完全なJSONであること
    let bad = ''
    for (let crashAt = 0; crashAt < 12; crashAt++) {
      files.clear()
      files.set('jpel-manager-save.a.json', { data: mkSave(2030), mtime: 1 })
      files.set('jpel-manager-save.cur.json', { data: '{"use":"a"}', mtime: 1 })
      __noCrash()
      await st.saveStorage.getItem(KEY)
      __crashAfter(crashAt)
      try { st.saveStorage.setItem(KEY, mkSave(2031)); await st.flushSaveNow() } catch { /* 落ちた */ }
      __noCrash()
      const ok = ['a', 'b'].some(sl => {
        const f = files.get(`jpel-manager-save.${sl}.json`)
        return !!f && yearOf(f.data) !== null
      })
      if (!ok) { bad = `${crashAt}手目`; break }
    }
    check('落ちた直後に、必ず完全なスロットが残っている', bad === '', bad)
  }

  console.log('\n[3] 書き込みの手順に「消してから書く」が無い')
  {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/store/saveStorage.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // ★いまのセーブを消す・名前を付け替える手順が書き込みの経路に残っていないこと。
    //   ここが戻ると[1][2]も落ちるが、**戻したこと自体**を字で止める
    check('本体を消す手順が無い', !/removeIfExists\(\s*(FILE|livePathNow)\s*\)/.test(src))
    check('tmp → 本体の rename が無い', !/rename\(\{\s*from:\s*TMP/.test(src))
    check('札を書くのは1か所だけ（writePointer）',
      (src.match(/path:\s*CUR\s*,/g) ?? []).length === 1)
  }

  console.log('')
  if (problems.length > 0) {
    console.log(`✗ 落ちたときにセーブを失う形が残っています（${problems.length}件）`)
    process.exit(1)
  }
  console.log('✓ 書き込みの途中で落としても、完全なセーブが必ず残る')
}

void main()
