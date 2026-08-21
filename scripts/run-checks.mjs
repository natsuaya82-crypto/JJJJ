// 一本化の見張り番を、まとめて走らせる唯一の入口。
//
// ■なぜこのファイルがあるのか
//   以前は package.json の "check" に
//     npx esbuild --bundle ... scripts/check-A.ts --outfile=... && node ... && npx esbuild ... check-B.ts && ...
//   という2,500文字のシェル文字列が入っていた。**1本足すのに200文字の呪文を書き足す**作りなので、
//   誰も足さなくなり、実際に **51本のうち34本が繋がっていない**状態になっていた。
//   （うち20本はそのまま通り、8本は旧仕様のまま、6本は削除済みAPIを読んでいてビルドすら通らない）
//
//   見張り番が見張られていない、という一番まずい形だったので、**一覧をここ1本にする。**
//   足すときは下の CHECKS に名前を1行足すだけ。
//
// ■速さ
//   esbuild を1本ごとに npx で起動すると、それだけで1本あたり1秒近く食う（17本で20秒）。
//   esbuild はこのリポジトリの node_modules には居らず npx が取ってくるので、
//   モジュールとしては読めない。**CLI をまとめて1回だけ呼ぶ**（51回 → 2回）。
//
// ■出し方
//   通ったものは1行。落ちたものだけ中身を全部出す。
//   全部の中身を見たいときは `npm run check -- --verbose`。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'node_modules/.cache/checks')

// ── 点検の一覧 ──────────────────────────────────────────────
// 文字列だけなら「そのまま組んでそのまま走らせる」。特別な事情があるものだけ object にする。
//   shim    … localStorage を持たない Node で保存層を通すための差し込み（scripts/ls-shim.cjs）
//   nativeFakes … @capacitor/* を偽物に差し替えて「実機扱い」でファイル保存の経路を通す
const CHECKS = [
  // 一本化そのものの見張り
  'single-source',
  // 層をまたいだ import（下から上）を機械的に落とす。
  // 型だけの import は実行時に消えるので違反にしない（check-layers 側で除外済み）
  'layers',
  // チャット・交渉
  'chat-dup', 'chat-lines', 'chat-log', 'contract-talk', 'demand-gates', 'sale-answer',
  'consent-single', 'move-reason', 'release-gate', 'offer-result', 'gm-offer',
  // 移籍・市場
  'fa-market', 'transfer-eligibility', 'market-sorting', 'transfer-lock',
  // transfer-bid は片付いた（12件 → 8件 → 0件）。最後の8件は**仕様が変わったのに
  // テストが旧仕様のまま**だったもので、2026-08-11 にオーナーが現仕様（1回目は
  // countered で上乗せの機会）を選んだので書き直した（docs/BACKLOG.md A-3）。
  // うち1件は別の理由で、通知の金額に「億」を期待していた（P0-1 で「万」に統一済み）。
  'transfer-bid',
  // trade-value は片付いた（20件 → 0件）。内訳は 移設で見えなくなっていたもの7件・
  // CLAUDE.md に現行仕様として書いてあるのにテストが古かったもの13件。
  'trade-value',
  // CPU間トレードは実際の世界では1件も成立しないので golden の外にある（BACKLOG A-7）。
  // 成立側は世界を手で組んでここで見る
  'cpu-trade',
  // 記録会の歴代1位。タイムは連続値なので golden の世界では**同着が起きない**＝
  // タイ記録の枝が1行も通らない。ここでは順位表を手で作って必ず同着を起こす
  'tt-records',
  // 駅伝中の選択肢。**画面から押して初めて通る**ので golden からは1行も届かない。
  // 「温存（＝何も起きない肢）が全場面で最良」だった時期があるので、
  // どの場面でどれが最良かを数字で留める
  'race-choice',
  // 中継に並ぶのは「そのレースを走っているクラブだけ」か（走っていない32クラブが
  // 「?」のままタイム差0で上位を占めていた・2026-08-14 実機）
  'race-teams',
  // 大きさの歯止め。**上限を決めるのではなく「今日より増えたら落ちる」**。
  // 「1ファイル300行まで」のような線は決めた瞬間に93ファイルが違反になり、
  // 全部が赤いルールは誰も直さずそのうち外される
  'size',
  // クラブ・格・お金
  'club-tiers', 'club-standing', 'foreign-money', 'club-money', 'clubs', 'offseason', 'market-rate', 'owner-decisions',
  // 選手が**入ってくる口**。海外は毎年1クラブ最大3人入るのに、国内はドラフト
  // （1部20クラブだけ）しか無く、2部・3部が毎年痩せて FA も尽きていた
  // （オーナー・2026-08-16「fa全部とっても１３人にしかならない」）。
  // 世界を3年回すので20秒ほどかかる
  { name: 'domestic-youth', shim: true },
  // 2026-08-12 の監査（55本を1件ずつ逆方向に壊す）で「壊しても緑」だったところ。
  // どちらも**その枝を通す世界が1つも無かった**のが原因で、判定は前から正しかった。
  //   save-pruning     … 消してはいけない選手の守り（出どころ11件を1件ずつ別の世界で）
  //   trade-execution  … 指名権を同一性で数えること・トレードの下駄（1.2倍で+0.15）
  'save-pruning', 'trade-execution',
  // CPU・海外の年次成長。**余ったEXPを毎年捨てていて**、格10以下は1も伸びず、
  // どの格でもOVR80を超えられなかった（オーナー・2026-08-16「成長してないから
  // そんな弱いんじゃないの？普通に92とか見なくなった」）。引退年齢30〜36もここ
  'growth-carry',
  // 出せない入札を黙って捨てない（オーナー・2026-08-16「オファー出したけど、何レース
  // 経っても返事が来ないし、チャットに〇〇にオファー中の文字がない」）。
  // 早期リターンが6つとも何も返さず、札が1枚もできていなかった
  'bid-gate',
  // レース・順位・記録
  'race-points', 'race-record', 'background-race', 'round-robin', 'division-rank',
  'division-sync', 'away-records', 'domestic-records', 'segment-recommend',
  // 出場率が移籍の判断に届いているか。**関門は書いてあるのに材料が渡っていない**という
  // 形（2026-08-20）を見張る
  'play-rate',
  // 選手の格（どの格のクラブで走れるか）。移籍で落ちていい幅はここ1本で、
  // 以前の蓋3枚（unproven / tooFarDown / 打診の格差フィルタ）を置き換えている
  'player-tier',
  // 世界大会・コース
  'national-pool', 'wa-races', 'course-names', 'world-courses',
  // continental は**分布の検査**。以前は種を固定しておらず、走らせるたびに別の世界を
  // 作っていたので、40回に2回ほど「上位の通過率 ≦ 下位の通過率」の世界が生成されて落ちた。
  // `flaky: 3`（落ちたら引き直す印）を付けていたが、**落ちた世界を二度と再現できない**。
  // 2026-08-13 に種を3つ固定した（8つ試して8つとも通ることを確かめたうえで選んだ）ので、
  // いまは毎回まったく同じ結果になる。**ゆらぎの印はこの repo から無くなった。**
  { name: 'continental' },
  // セーブ・起動
  { name: 'save-guard', shim: true },
  { name: 'save-write', shim: true },
  { name: 'save-snapshot', shim: true },
  { name: 'boot-gate', shim: true },
  { name: 'save-backups', shim: true, nativeFakes: true },
  // ★実機から取り出した本物のセーブを読む点検。リポジトリには入っていないので、
  //   ファイルが無い環境では走らせずに「見送り」にする（落とさない・`?` も付けない）。
  //   **セーブ形式（persist の version）を上げるときは必ず手で走らせること。**
  {
    name: 'load-v39', shim: true,
    needsFile: () => process.env.V39_SAVE ?? '/tmp/v39-save.json',
    why: '実機のセーブが要る。V39_SAVE=<path> npm run check で走らせる',
  },
  { name: 'migrate-old-save', shim: true },
  // 旧セーブ（v29相当）を migrate+merge に通したあとの**形**が変わっていないか。
  // セーブ互換の唯一の自動確認で、外すと移行事故に気づけない
  { name: 'migrate-snapshot', shim: true },
  // runRace / endSeason をシード固定で走らせ、実行後の状態が1バイトも変わらないか。
  // **いま進んでいる巨大アクション分解の唯一の安全網。** 絶対に外さないこと
  { name: 'action-golden', shim: true },
  'boot-repair', 'archive-season',
  // クラブの優勝と監督の優勝を混ぜない（自チーム記録にGMの通算が出ていた）
  'records-titles',
  // ドラフトを終えるまで開幕できない（勝手に入っていた「スキップ」を塞いだ）
  'season-start',
  // ドラフト会場のAI（engine/draft）。画面の中にあってどの点検からも見えていなかった
  'draft-ai',
  // オンライン対戦の通算得点。同じ数え方が3か所にあった（うち1つは受け取った順に依存）
  'online-series',
  // オンライン対戦の進行判断（出そろったか・誰を埋めるか・誰が不戦敗か）。画面の中にあった
  'room-machine',
  // レート戦（Elo・段位・グループ分け・その日のコース）
  'rated',
  // 始まる前のランクマッチの画面が空っぽにならないか。fetchToday は「10:00前」でも
  // 「大会が始まっていない」でも null なので、それだけを見ていると
  // レートの数字しか出ない（オーナー・2026-08-16「9/1からのレート戦の画面なにもないけど？」）
  'rated-preopen',
  // 起動時のお知らせポップ。枠は ui/IntroModal 1本（公式Xの案内と同じ形）、
  // 文面は data/newsPopups、見たかどうかは端末。お知らせのたびに専用の
  // モーダルを作らせないための見張り（オーナー・2026-08-16「xみたいにね」）
  'news-popup',
  // 2026-08-12 のオーナー判断4件（非売×レンタル・繰越30%・退任と再オファーの線・世界選手権の取りこぼし）
  'owner-fixes-0812',
  // 買い取りの打診はベルにも通知ページにも出さない（受信箱は今までどおり）
  'offer-notif',
  // 自チームへの買い取り打診は国内52＋海外180で1本（上限も1つ・提示額の式も1本）
  'offer-unified',
  // その他
  'card-exchange', 'notif-count', 'talk-sync',
  // ホームの「チャット」に出す数字。チャットに並ぶ用件と同じものを数えているか・
  // **開くまで消えないか**（オーナー・2026-08-16「チャット見ないとその数字消えない
  // みたいな。フレンド横にあった3みたいな感じ」）
  'chat-badge',
  // ★実際にブラウザで開いて最初の画面が出るところまで見る。**既定で走る。**
  //   1本で20秒（ほぼブラウザの起動時間）かかるので既定から外していたが、入れることにした。
  //   速さの話ではなく、**この repo には check を機械的に走らせている場所が1つも無い**から。
  //   `.github/workflows/ios-deploy.yml` は npm ci と iOS ビルドだけで check を呼んでいない
  //   ＝点検はいま「人が覚えている」だけで動いている。そこへ「これは push 前だけ」という
  //   2段目の覚えごとを足すのは、**51本中34本が黙って抜け落ちたのと同じ形**になる。
  //   20秒はブラウザの起動＝点検を増やしても伸びない固定費でもある。
  //   ブラウザが無い環境では needs で「見送り」に落ちるので、入れても壊れない。
  {
    name: 'boot',
    needs: () => bootChrome() ? null : 'playwright かブラウザが見つからない',
    why: 'playwright かブラウザが無い環境では走らせられない',
    env: () => ({ BOOT_CHROME: bootChrome() }),
  },
  // 年をまたぐ表で「その年の事実」がその年のまま出るか（在籍履歴の部・表彰パッチの部）
  'player-history',
  // 代表の「自動選出」が engine の autoSelectEkiden 1本を通っているか（自前で並べ直していないか）
  'wa-autoselect',
  // 年度表彰の線（新人王3戦・MVP6戦）と、部ごとに選んでいること
  'awards',
  // 自分から退任できるまでの在任年数（就任から3シーズン）と、判定が1本かどうか
  'gm-resign',
  // 監督の移籍は**次のシーズンから**（★13）。世界を1つ作って実際に移してみる
  { name: 'gm-move', shim: true },
  { name: 'gm-invite', shim: true },
  // クラブの部はクラブのもの（監督が去っても元の部へ引き戻されない）
  'club-division-pin',
  // セーブの書き出し（本体＋走行記録の別ファイル）
  { name: 'export-save', shim: true },
  { name: 'word-filter' },
  // 世界選手権・アジア予選に「その年のうちに入れるか」（古い大会の残骸と、画面の入口）
  'wa-entry',
  // Supabase の SQL が1本か・データを消さないか・アプリの rpc と噛み合っているか
  'supabase-sql',
  // 足した Swift が本当にビルドに入っているか（IDが重複すると片方が黙って消える）
  'xcode-project',
  // ネイティブの下タブ。WebView の外に居るので、隠す口が無いと要らない画面に出しっぱなしになる
  'glass-tabbar',
  // 画面いっぱい／下端に貼るものを <main> の外へ出しているか（U-9・実機でだけ壊れる）
  'screen-portal',
  // 区間の重みの合計が 1.00 か（ずれると上位の能力差がタイムに出ない）・表の引き方が1本か
  'segment-weights',
  // 優勝トロフィー（99超え）。自チームだけ・上限だけ・110まで・実際にタイムが速くなるか
  { name: 'trophy', shim: true },
  // 自分でつくる選手。下限60（尖らせて捨てた能力がタダで戻るのを止める）・
  // 振り分けポイントは出どころで違う（新規作成の記念500／記念の配布560）
  { name: 'my-player', shim: true },
  // イベントの期間が日本時間の朝10時区切りか・99から先が重くなるか（レジェンド何枚か）
  'event-window',
  // 画面の一本化（色・下タブまわりの数字・共通クラスの手書き）。
  // 他の点検はどれも src/components の見た目を見ていないので、ここだけが画面の見張り
  'ui-tokens',
  // 競り勝ったクラブは海外でも移籍金を払うか（払わずに選手を持っていけていた）
  'outbid-fee',
  // 出した入札にどの終わり方でも返事が来るか（額不足・相手が他所へ移った、が黙って消えていた）
  'bid-reply',
  // 画面下から出るシート（BottomSheet）を勝手に増やしていないか。
  // オーナーが嫌いなUIなので、増やすのは許可が出たときだけ
  'bottom-sheet',
  // タブ（1部2部3部・走友会のメンバー/カード/掲示板）をURLに覚えさせているか。
  // useState に戻すと、詳細を見て戻ったとき必ず先頭のタブへ戻る
  'sticky-tab',
  // フックが早期リターンの後ろに無いか。React error #310 は**開くたび必ず落ちる**のに、
  // eslint は既存エラーに埋もれて新しい1件が見えない（フレンド詳細がそれで開けなかった）
  'hook-order',
  // レースの結果画面から離れて戻ったとき、行き止まりに落ちないか。
  // 最終戦だと戻る先のレースが無いので、文字だけ・ボタン無し・下タブも隠れた画面で詰む
  'race-resume',
  // 人の走友会は「見るだけ」。入口が自分の走友会のページへ向いていないか
  'club-view',
  // 施設のレベルの読み方が1本か（維持費は格から・画面と成長は直読みで0、と割れていた）
  'facilities',
  // 士気が本当に効いているか。実際に6年ぶん回して、上限に張り付いていないかを数える
  'morale',
  // ホームとチャットの「用件の数」。入力を as never で渡して落ちた実績がある
  'notif-input',
  // 移籍市場の検索結果。何も選ばずに検索すると5,775人ぶん描いて実機が落ちていた
  'market-list',
  // レート戦の**サーバー側**。1か月を実際に回す。
  // `rated` は部品ごと（Elo・段位・グループ分け・コース）を見ているが、実際に動く
  // 「締める → 走らせる → レートを書く」の一続きは Edge Function からしか呼ばれない＝
  // 画面のゴールデンにも store のゴールデンにも1行も届かない
  'rated-server',
  // Edge Function に置いてある engine.js が src と一致しているか。
  // 作り直しを忘れると**アプリだけ新しくサーバーは古い計算のまま**になる
  'edge-bundle',
  // 移籍履歴に出る契約年数＝実際に結んだ契約か。1年を実際に回して1件ずつ突き合わせる。
  // `years: 2` の手書きが2か所あり、契約は1〜5年なのに**画面は全部「2年」**だった（78.8%が嘘）
  'contract-years',
  // 他人の名前が出る画面に段位の紋章が付いているか（画面を数える）。
  // 付け忘れても何も壊れない＝出ないだけ、なので人の目では見つからない
  'rank-badge',
  // md がいまのコードを指しているか。**コードだけが先に進む**ので、放っておくと
  // 「もう無いファイルを直しに行く」が起きる（オーナー・2026-08-18
  // 「古いmd系とか全部新しくしないと直すのが古い場所とかになっちゃうよ」）
  'docs',
]

/**
 * ブラウザの実行ファイルを探す。**パスを決め打ちしないこと**（版が上がると壊れる）。
 * playwright 本体が入っていない環境もあるので、その場合も null を返して見送りにする。
 */
function bootChrome() {
  try { createRequire(join(ROOT, 'noop.cjs'))('playwright') } catch { return null }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(base)) return null
  const dirs = readdirSync(base).filter(d => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) {
    const exe = join(base, d, 'chrome-linux', 'chrome')
    if (existsSync(exe)) return exe
  }
  return null
}

// ── 意図して走らせないもの ──────────────────────────────────
// **「一覧から漏れた」と「わざと外した」を区別できるようにする。**
// 34本が黙って抜け落ちたのは、この区別が無かったのが原因。理由なしで外すことはできない。
const SKIP = {
  'club-roster':  'v40 で team.roster を廃止し rebuildRosters を削除した。見張る対象そのものが無い',
  'flat-roster':  '同上（rebuildRosters）',
  'move-player':  '同上（rebuildRosters）',
  'roster-sync':  '同上（rebuildRosters）。所属が player.teamId 1本かは check-single-source が見ている',
  'reserve-squad': 'utils/reserveSquad は削除済み（2軍は secondTeamRaces を読むだけになった）',
  'foreign-suitors': 'foreignMinOvr（クラブごとのOVR下限表）を廃止した。獲るかどうかは needsPlayer と wouldMakeLineup だけ',
}

// ── 未修理（pending）──
// 「まだ通っていないので、落ちても全体は止めない」印。直したら pending ごと消すこと。
// **増やすのは禁止**（増やせるなら見張りの意味が無い）。
//
// ★必ず「いま何件落ちるか」を書く。 { name: 'x', pending: 12, why: '…' }
//   以前は名前の末尾に "?" を付けるだけで、**何件落ちても緑**だった。
//   その結果、コメントには「trade-value 19件」と書いてあるのに実際は20件あり、
//   **増えた1件に誰も気づけなかった**（`?` の下が新しい壊れの隠し場所になっていた）。
//   いまは NG の行数を数えて、
//     書いた数より多い → 本物の NG として止める（新しく壊れた）
//     書いた数より少ない → 通すが「減った」と言って書き換えを促す
//     1件も NG が出ていないのに落ちた → 点検そのものが壊れているので止める
const entries = CHECKS.map(c => {
  const o = typeof c === 'string' ? { name: c } : { ...c }
  if (o.name.endsWith('?')) {
    console.log(`✗ ${o.name} … 未修理の印は名前の "?" ではなく { name: '${o.name.slice(0, -1)}', pending: <いま落ちる件数> } で書いてください`)
    process.exit(1)
  }
  return o
})

// @capacitor/* を偽物に差し替える指定。**必要な点検にだけ当てること。**
// 全部に当てると、偽物に無い export（registerPlugin など）を使っている経路が
// ビルドできなくなる（実際に check-offseason がそれで落ちた）。
const FAKE_ARGS = [
  `--alias:@capacitor/core=${join(ROOT, 'scripts/fakes/capacitor-core.ts')}`,
  `--alias:@capacitor/filesystem=${join(ROOT, 'scripts/fakes/capacitor-filesystem.ts')}`,
]
const BUILD_ARGS = ['--bundle', '--platform=node', '--format=cjs', '--out-extension:.js=.cjs', `--outdir=${OUT}`, '--log-level=error']

const verbose = process.argv.includes('--verbose')
const t0 = Date.now()
mkdirSync(OUT, { recursive: true })

// ── 取りこぼしの見張り（これ自体が一番大事）──
// scripts/check-*.ts が増えたのに一覧へ足し忘れる、が34本ぶん起きた。
// 上の CHECKS にも SKIP にも無いものがあれば、走らせる前にここで止める。
{
  const known = new Set([...entries.map(e => e.name), ...Object.keys(SKIP)])
  const onDisk = readdirSync(join(ROOT, 'scripts'))
    .filter(f => f.startsWith('check-') && f.endsWith('.ts'))
    .map(f => f.slice('check-'.length, -'.ts'.length))
  const missing = onDisk.filter(n => !known.has(n))
  const ghosts = [...known].filter(n => !onDisk.includes(n))
  if (missing.length > 0 || ghosts.length > 0) {
    if (missing.length > 0) console.log(`✗ 一覧に載っていない点検があります: ${missing.join(', ')}\n  scripts/run-checks.mjs の CHECKS に足すか、外す理由を SKIP に書いてください。`)
    if (ghosts.length > 0) console.log(`✗ 一覧にあるのに実体が無い点検があります: ${ghosts.join(', ')}`)
    process.exit(1)
  }
}

// ── 組む（差し替えの有無で2群に分けて、それぞれ1回だけ呼ぶ）──
// まとめて組むと、1本でも壊れていれば群ごと失敗する。そのときだけ1本ずつ組み直して、
// **どれが壊れているのかを名指しできる**ようにする（まとめ失敗で全部が巻き添えにならない）
const srcOf = e => join(ROOT, `scripts/check-${e.name}.ts`)
const esbuild = (args) => spawnSync('npx', ['esbuild', ...args], { encoding: 'utf8', cwd: ROOT })
const buildErrors = new Map()

for (const group of [entries.filter(e => !e.nativeFakes), entries.filter(e => e.nativeFakes)]) {
  if (group.length === 0) continue
  const extra = group[0].nativeFakes ? FAKE_ARGS : []
  if (esbuild([...group.map(srcOf), ...BUILD_ARGS, ...extra]).status === 0) continue
  for (const e of group) {
    const r = esbuild([srcOf(e), ...BUILD_ARGS, ...extra])
    if (r.status !== 0) buildErrors.set(e.name, (r.stderr || r.stdout || '').trim())
  }
}

const built = entries.map(e => {
  const outfile = join(OUT, `check-${e.name}.cjs`)
  const buildError = buildErrors.get(e.name) ?? (existsSync(outfile) ? undefined : '出力が作られませんでした')
  return { ...e, outfile, buildError }
})

// ── 走らせる ──
const failed = []
const pendingFailed = []
const skipped = []
const wobbles = []
const shrinks = []
for (const e of built) {
  // ★見送りより先に「組めたか」を見る。
  //   見送りの判定を先にすると、**組めない点検が見送りに隠れて誰も気づけない**。
  //   実際 check-boot が CJS で組めていなかったのに見送り表示のまま素通りし、
  //   まとめビルドが失敗して1本ずつ組み直す道に落ちて 12秒→71秒になっていた
  //   （遅くなったことでしか気づけなかった）。壊れている点検は環境に関係なく NG。
  if (e.buildError) {
    console.log(`NG   ${e.name}`)
    console.log(`    ビルドできませんでした（消したAPIを読んでいる可能性があります）\n${e.buildError}`.replace(/^/gm, ''))
    failed.push(e.name)
    continue
  }
  // ── 見送り（環境が足りなくて走らせられないもの）──
  // **落としてはいけないし、`?` でもない。** `?` は「壊れているが直していない」印で、
  // 「この環境では材料が無い」とは別の話。混ぜると `?` の意味が薄まる。
  // 材料が揃えば必ず走る＝黙って外れるのとも違うので、毎回この一覧に名前を出す。
  if (e.needsFile) {
    const path = e.needsFile()
    if (!existsSync(path)) {
      console.log(`--   ${e.name}  (見送り: ${path} が無い)`)
      skipped.push(`${e.name}（${e.why}）`)
      continue
    }
  }
  // 重い点検は明示したときだけ走らせる（既定は見送り）。
  // 外すのではなく毎回一覧に名前を出すので、黙って抜けることはない。
  // ★いま heavy を付けている点検は1本も無い（boot は既定に入れた）。
  //   残してあるのは `dist` を組んで見る版を足すときのため（npm run build に35秒かかるので、
  //   それは既定に入れられない）。**使う点検が無いまま増やさないこと。**
  if (e.heavy && !process.env.CHECK_HEAVY) {
    console.log(`--   ${e.name}  (見送り: 重い点検。CHECK_HEAVY=1 で走ります)`)
    skipped.push(`${e.name}（${e.why}）`)
    continue
  }
  // 環境が足りないとき（例: playwright やブラウザが入っていない）も見送り
  if (e.needs) {
    const reason = e.needs()
    if (reason) {
      console.log(`--   ${e.name}  (見送り: ${reason})`)
      skipped.push(`${e.name}（${reason}）`)
      continue
    }
  }
  const st = Date.now()
  let ok, out, tries = 0
  {
    // ── 分布の検査（flaky）──
    // **判定は緩めない。落ちたときに引き直すだけ。**
    // 世界を生成してから統計を見る点検は、生成の引きしだいで本当に逆転する回がある
    // （continental は実測で40回に2回）。ここで「落ちたら無視」にすると本物の劣化を
    // 見逃すので、**毎回落ちるなら本物の NG**、1回でも通れば「ゆらぎ」として扱う。
    // 5%が3回続けて出る確率は0.0125%なので、本当に壊れたものはちゃんと落ちる。
    const maxTries = e.flaky ?? 1
    const args = e.shim ? ['-r', join(ROOT, 'scripts/ls-shim.cjs'), e.outfile] : [e.outfile]
    do {
      tries++
      const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...(e.env ? e.env() : {}) } })
      ok = r.status === 0
      out = (r.stdout ?? '') + (r.stderr ?? '')
    } while (!ok && tries < maxTries)
  }
  const ms = Date.now() - st
  const wobbled = ok && tries > 1          // 引き直して通った＝分布のゆらぎ

  // ── 未修理（pending）の件数を数える ──
  // 点検はどれも落ちた項目を "  NG  <名前>" の形で1行ずつ出す。その行数が件数。
  const ngLines = e.pending != null && !ok ? (out.match(/^\s*NG\b/gm) ?? []).length : 0
  const grew = e.pending != null && !ok && ngLines > e.pending
  const broke = e.pending != null && !ok && ngLines === 0   // 落ちたのに NG が1件も無い＝点検自体が壊れた
  const shrank = e.pending != null && (ok || (ngLines > 0 && ngLines < e.pending))

  const isFailure = !ok && (e.pending == null || grew || broke)
  const mark = wobbled ? '~   ' : ok ? 'ok  ' : isFailure ? 'NG  ' : 'todo'
  const note = wobbled ? `  ← ${tries}回目で通りました（分布のゆらぎ）`
    : (!ok && e.pending != null && !broke) ? `  (${ngLines}件 / 未修理として登録済み ${e.pending}件)` : ''
  console.log(`${mark} ${e.name}${verbose ? '' : `  (${ms}ms)`}${note}`)
  if (verbose && out) console.log(out.replace(/^/gm, '    '))
  if (wobbled) wobbles.push(`${e.name}（${e.why}）`)

  // 減ったときは通すが、放っておくと登録件数が実態から離れて見張りが緩むので毎回言う
  if (shrank) shrinks.push(`${e.name}: ${e.pending}件 → ${ok ? 0 : ngLines}件。run-checks.mjs の pending を${ok ? '外して' : `${ngLines}へ書き換えて`}ください`)

  if (!ok) {
    if (!verbose) console.log(out.replace(/^/gm, '    '))
    // 分布の検査が**毎回**落ちたときは、ゆらぎでは説明できない＝本物として扱う
    if (e.flaky) console.log(`    ※ ${e.flaky}回とも落ちました。分布のゆらぎでは説明できません（${e.why}）`)
    if (grew) console.log(`    ※ 未修理として登録してあるのは ${e.pending}件ですが ${ngLines}件落ちています。**増えたぶんは新しい壊れです。**`)
    if (broke) console.log('    ※ NG の行が1件も無いのに落ちました。点検そのものが壊れています（未修理の印では見逃せません）')
    ;(isFailure ? failed : pendingFailed).push(e.name)
  }
}

console.log('')
console.log(`点検 ${built.length - skipped.length}本 / ${((Date.now() - t0) / 1000).toFixed(1)}秒（意図して外した ${Object.keys(SKIP).length}本）`)
for (const s of skipped) console.log(`見送り: ${s}`)
for (const w of wobbles) console.log(`ゆらぎ: ${w}`)
for (const s of shrinks) console.log(`減りました: ${s}`)
if (failed.length > 0) {
  console.log(`✗ 落ちました: ${failed.join(', ')}`)
  process.exit(1)
}
if (pendingFailed.length > 0) {
  console.log(`✓ 見張りは通りました（todo ${pendingFailed.length}本は未修理: ${pendingFailed.join(', ')}）`)
} else {
  console.log('✓ すべて通りました')
}
